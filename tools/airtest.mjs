// A/B test of the air strikes: node tools/airtest.mjs "<strike fleet>" "<target fleet>" [worlds=20] [secs=900] [--a=key:val] [--b=key:val] [--dist=40000]
// A carrier fleet sends its aircraft against a fleet that has no aircraft; each world is run once with the options A and once with B (read from world.airOpts by sim/aircraft.js).
// Prints, per option set: the aircraft that took off, how many dropped their ordnance, the hits (bombs, torpedoes), the aircraft lost and by what, the ships sunk.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';

const args = process.argv.slice(2), flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = ''] = a.slice(2).split('='); return [k, v]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
const STRIKE = parse(pos[0] || 'essex:1,fletcher:2'), TARGET = parse(pos[1] || 'iowa:1,baltimore:1,fletcher:2');
const N = Number(pos[2] || 20), SECS = Number(pos[3] || 900), DIST = Number(flags.dist || 40000);
const parseOpts = (s) => Object.fromEntries((s || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; }));
const OPTS = [parseOpts(flags.a), parseOpts(flags.b)];
const K = Number(flags.procs || Math.min(6, os.cpus().length));
const BINS = 6;
const blank = () => ({ tA: Array(BINS).fill(0), tH: Array(BINS).fill(0), bA: Array(BINS).fill(0), bH: Array(BINS).fill(0), n: 0, took: 0, dropped: 0, bombs: 0, torps: 0, bombHits: 0, torpHits: 0, lost: 0, lostAA: 0, lostGun: 0, lostOther: 0, sunk: 0, dmg: 0, dive: 0, torp: 0, fighter: 0, lostDive: 0, lostTorp: 0, diveDrops: 0, torpDrops: 0 });

function report(T) {
  for (const k of [0, 1]) {
    const r = T[k], n = r.n;
    const row = (A, H) => A.map((a, i) => `${i * 30}-${i * 30 + 30}: ${H[i]}/${a}${a ? ' (' + Math.round(100 * H[i] / a) + ' %)' : ''}`).join('  ');
    console.log(`  by aspect (0 = astern, 90 = beam, 180 = head on), torpedoes: ${row(r.tA, r.tH)}\n                                           bombs: ${row(r.bA, r.bH)}`);
    console.log(`${JSON.stringify(OPTS[k])}: aircraft ${(r.took / n).toFixed(1)} | dive ${(r.diveDrops / Math.max(1, r.dive)).toFixed(2)} bombs dropped per aircraft (lost ${(r.lostDive / Math.max(1, r.dive) * 100).toFixed(0)} %), torpedo ${(r.torpDrops / Math.max(1, r.torp)).toFixed(2)} dropped per aircraft (lost ${(r.lostTorp / Math.max(1, r.torp) * 100).toFixed(0)} %) | hits: bombs ${(r.bombHits / n).toFixed(2)} of ${(r.bombs / n).toFixed(1)} (${(r.bombHits / Math.max(1, r.bombs) * 100).toFixed(0)} %), torpedoes ${(r.torpHits / n).toFixed(2)} of ${(r.torps / n).toFixed(1)} (${(r.torpHits / Math.max(1, r.torps) * 100).toFixed(0)} %) | lost ${(r.lost / n).toFixed(1)} (AA ${(r.lostAA / n).toFixed(1)}, guns ${(r.lostGun / n).toFixed(1)}) | ships sunk ${(r.sunk / n).toFixed(2)}, damage to the fleet ${(r.dmg / n * 100).toFixed(1)} %`);
  }
}

if (!('worker' in flags) && K > 1) {
  const parts = await Promise.all(Array.from({ length: K }, (_, i) => new Promise((res) => {
    const c = spawn(process.execPath, [process.argv[1], ...args, `--worker=${i}/${K}`, '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', () => res(JSON.parse(out.trim().split('\n').pop())));
  })));
  const T = [blank(), blank()];
  for (const p of parts) for (const k of [0, 1]) for (const f in p[k]) { if (Array.isArray(p[k][f])) p[k][f].forEach((v, i) => { T[k][f][i] += v; }); else T[k][f] += p[k][f]; }
  report(T);
  process.exit(0);
}
const [wi, wk] = (flags.worker || '0/1').split('/').map(Number);
const T = [blank(), blank()];
for (let seed = 1 + wi; seed <= N; seed += wk) {
  for (const k of [0, 1]) {
    const w = new World(seed); w.addTeam(0); w.addTeam(1);
    w.airOpts = OPTS[k];
    spawnFleet(w, 0, STRIKE, -DIST / 2, 0, Math.PI / 2);
    spawnFleet(w, 1, TARGET, DIST / 2, 0, -Math.PI / 2);
    for (const s of w.ships) if (s.team === 1 && s.air) s.air.ready = 0;
    w.start();
    const r = T[k]; r.n++;
    const seen = new Set();
    while (w.time < SECS && w.state !== 'finished') {
      w.update(0.1);
      for (const e of w.drainEvents()) {
        if (e.type === 'planeLaunch' && e.plane.team === 0 && !seen.has(e.plane.id)) { seen.add(e.plane.id); r.took++; r[e.plane.kind === 'dive' ? 'dive' : e.plane.kind === 'torp' ? 'torp' : 'fighter']++; }
        else if (e.type === 'bombDrop' && e.plane.team === 0) { r.bombs++; r.diveDrops++; r.bA[Math.min(BINS - 1, Math.floor(e.bomb.asp / 30))]++; }
        else if (e.type === 'bombResult' && e.hit && e.plane && e.plane.team === 0) r.bH[Math.min(BINS - 1, Math.floor(e.asp / 30))]++;
        else if (e.type === 'torpedoDrop' && e.plane.team === 0) { r.torps++; r.torpDrops++; const tg = e.plane.target; if (tg) { const th = Math.atan2(tg.vx, -tg.vz), a = Math.abs(Math.atan2(Math.sin(e.bearing - (tg.speed > 1 ? th : tg.heading)), Math.cos(e.bearing - (tg.speed > 1 ? th : tg.heading)))) * 180 / Math.PI; r.tA[Math.min(BINS - 1, Math.floor(a / 30))]++; } }
        else if (e.type === 'impact' && e.kind === 'torpedo' && e.ship && e.ship.team === 1) { r.torpHits++; if (e.asp != null) r.tH[Math.min(BINS - 1, Math.floor(e.asp / 30))]++; }
        else if (e.type === 'impact' && e.cal === 250 && e.ship && e.ship.team === 1) r.bombHits++;
        else if (e.type === 'planeDown' && e.plane.team === 0 && e.cause !== 'crash') {
          r.lost++; const q = e.plane; if (e.cause === 'aa') r.lostAA++; else if (e.cause === 'gun' || e.cause === 'gunner') r.lostGun++; else r.lostOther++;
          if (q.kind === 'dive') r.lostDive++; else if (q.kind === 'torp') r.lostTorp++;
        }
      }
    }
    r.sunk += w.ships.filter((s) => s.team === 1 && !s.alive).length;
    { const all = w.ships.filter((s) => s.team === 1).reduce((a, s) => a + s.stats.dispFull, 0); r.dmg += w.ships.filter((s) => s.team === 1).reduce((a, s) => a + (s.alive ? 1 - s.condition : 1) * s.stats.dispFull, 0) / all; }
  }
}
if ('json' in flags) console.log(JSON.stringify(T)); else report(T);
