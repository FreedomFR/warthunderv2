// Balance check of the damage model: node tools/damagecheck.mjs [seconds] [seeds] [filter]
// Runs a set of duels and small fleet battles headless and reports, per scenario: how long it lasted, who was lost and to what
// (cause, way of sinking, time from the first hit to the loss), the shots fired, the hit rate and the fate of the hits (penetrated,
// bounced, over-penetrated, duds, HE bursts).
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { resolveTorpedoHit } from '../js/game/sim/damage.js';
import { BY_ID } from '../js/game/data/ships.js';
import { makeStats } from '../js/game/sim/shipdata.js';
import { gunBallistics } from '../js/game/sim/ballistics.js';
import { V_EXP, effectiveThickness, spacedPlates } from '../js/game/sim/penetration.js';

// node tools/damagecheck.mjs zones [shooter,target ...]: the immune zones, i.e. the ranges (km) at which an average AP shell goes through the belt
// (broadside) or the deck of the target
if (process.argv[2] === 'zones') {
  const pairs = (process.argv.slice(3).length ? process.argv.slice(3) : ['iowa,yamato', 'yamato,iowa', 'iowa,bismarck', 'bismarck,iowa', 'kgv,bismarck', 'bismarck,kgv', 'iowa,iowa', 'baltimore,takao', 'takao,baltimore', 'yamato,fletcher']).map((p) => p.split(','));
  for (const [sh, tg] of pairs) {
    const g = makeStats(BY_ID[sh]).main, a = makeStats(BY_ID[tg]).armor;
    const b = gunBallistics({ cal: g.cal, v0: g.v0, shellKg: g.shellKg, maxRange: g.maxRange, maxElevDeg: Math.min(g.maxElevDeg, 50) });
    const belt = [], deck = [];
    for (let r = 2000; r <= b.maxRange; r += 1000) {
      const lk = b.lookup(r); if (!lk) break;
      const pen = g.pen0 * Math.pow(lk.vImpact / g.v0, V_EXP);
      const cb = Math.min(1, Math.cos(lk.fall) * Math.cos(a.incl * Math.PI / 180) + Math.sin(lk.fall) * Math.sin(a.incl * Math.PI / 180));
      const eb = effectiveThickness(Math.max(a.belt, a.skin), Math.acos(cb) * 57.3);
      const ed = spacedPlates([a.weather, a.deck].filter((x) => x > 0).map((x) => effectiveThickness(x, 90 - lk.fall * 57.3)));
      belt.push(pen > eb ? 1 : 0); deck.push(pen > ed && lk.fall * 57.3 > 8 ? 1 : 0);      // below 8 degrees of fall a shell glances off a deck
    }
    const span = (arr) => { const out = []; let s0 = null; arr.forEach((v, i) => { const km = 2 + i; if (v && s0 == null) s0 = km; if (!v && s0 != null) { out.push(`${s0}-${km - 1}`); s0 = null; } }); if (s0 != null) out.push(`${s0}-${2 + arr.length - 1}`); return out.join(', ') || 'never'; };
    console.log(`${sh} -> ${tg}: belt (${a.belt} mm${a.incl ? ' at ' + a.incl + ' deg' : ''}) penetrated at ${span(belt)} km; deck (${a.weather ? a.weather + '+' : ''}${a.deck} mm) at ${span(deck)} km`);
  }
  process.exit(0);
}
// node tools/damagecheck.mjs torp: how many torpedo hits sink each ship (no help from anyone else)
if (process.argv[2] === 'torp') {
  const ids = (process.argv[3] || 'fletcher,cleveland,baltimore,iowa,yamato,bismarck,kgv,littorio,essex,shokaku').split(',');
  console.log('torpedo hits needed to sink (median of 5 seeds; hits come every 25 s along the citadel, alternating sides, then the ends)');
  for (const id of ids) {
    const row = [];
    for (const W of [230, 363, 490]) {
      const ns = [];
      for (let seed = 1; seed <= 5; seed++) {
        const w = new World(seed); w.addTeam(0); w.addTeam(1);
        const s = w.addShip(id, 1, 0, 0, 0); w.start();
        let n = 0;
        while (s.state === 'afloat' && n < 40) {
          const L = s.stats.L, xs = [0.12, -0.08, 0.2, -0.2, 0.3, -0.3];
          const lx = L * xs[n % xs.length], side = n % 2 ? 1 : -1;
          const p = s.toWorld(lx, 0, side * s.stats.B / 2, [0, 0, 0]);
          resolveTorpedoHit(w, s, { warhead: W, owner: null }, p[0], p[2]); n++;
          for (let i = 0; i < 250 && s.state === 'afloat'; i++) { w.update(0.1); w.drainEvents(); }
        }
        ns.push(s.state === 'afloat' ? 99 : n);
      }
      ns.sort((a, b) => a - b);
      row.push(`${W} kg: ${ns[2] === 99 ? '>40' : ns[2]} (${ns.join(',')})`);
    }
    console.log(id.padEnd(14), row.join('   '));
  }
  process.exit(0);
}
const secs = Number(process.argv[2] || 1500);
const seeds = Number(process.argv[3] || 3);
const only = process.argv[4] || '';
const sep = Number(process.env.SEP || 12000);

const SCENARIOS = [
  ['Iowa v Yamato', 'iowa', 'yamato'],
  ['KGV v Bismarck', 'kgv', 'bismarck'],
  ['Iowa v 3 Kagero', 'iowa', 'kagero:3'],
  ['Fletcher v Cleveland', 'fletcher', 'cleveland'],
  ['Fletcher x2 v Kagero x2', 'fletcher:2', 'kagero:2'],
  ['Baltimore v Takao', 'baltimore', 'takao'],
  ['Cleveland v Agano', 'cleveland', 'agano'],
  ['Cleveland v Fletcher', 'cleveland', 'fletcher'],
  ['Yamato v Fletcher x3', 'yamato', 'fletcher:3'],
  ['Essex+2 Fletcher v Shokaku+2 Kagero', 'essex:1,fletcher:2', 'shokaku:1,kagero:2'],
  ['Iowa+Baltimore+2 Fletcher v Yamato+Takao+2 Kagero', 'iowa:1,baltimore:1,fletcher:2', 'yamato:1,takao:1,kagero:2'],
];
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });

function run(name, a, b, seed) {
  const w = new World(seed);
  w.addTeam(0); w.addTeam(1);
  for (const [i, f] of [parse(a), parse(b)].entries()) {
    const s = teamStart(i, 2, sep);
    spawnFleet(w, i, f, s.x, s.z, s.heading);
  }
  for (const s of w.ships) s.cmd.throttle = 0.7;
  w.start();
  const hits = new Map(), res = {}, firstHit = new Map(), recv = new Map();
  while (w.time < secs && w.state !== 'finished') {
    w.update(0.1);
    for (const e of w.drainEvents()) {
      if (e.type === 'shellHit') {
        const k = e.shell + ':' + e.result;
        res[k] = (res[k] || 0) + 1;
        if (!firstHit.has(e.ship)) firstHit.set(e.ship, w.time);
        const r = recv.get(e.ship) || { n: 0, pen: 0 }; r.n++; if (e.result === 'pen') r.pen++; recv.set(e.ship, r);
      }
    }
  }
  return { w, res, firstHit, recv };
}

const agg = {};
for (const [name, a, b] of SCENARIOS) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n=== ${name} (${a} v ${b}), ${seeds} seeds`);
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const { w, res, firstHit, recv } = run(name, a, b, seed);
    const lost = w.kills.map((k) => `${k.victim.stats.id}@${k.t.toFixed(0)}s(${k.cause}/${k.victim.split ? 'split' : k.victim.sinkMode}, first hit ${firstHit.has(k.victim) ? (k.t - firstHit.get(k.victim)).toFixed(0) : '-'}s before, ${recv.get(k.victim)?.n ?? 0} hits ${recv.get(k.victim)?.pen ?? 0} pen)`).join('; ');
    const fired = w.ships.reduce((s, x) => s + x.shotsFired, 0), hit = w.ships.reduce((s, x) => s + x.shotsHit, 0);
    const left = w.ships.filter((s) => s.alive).map((s) => `${s.stats.id} ${Math.round(s.hpFrac * 100)}%`).join(' ');
    console.log(` seed ${seed}: ${w.state} t=${w.time.toFixed(0)}s winner=${w.winner} | shots ${fired} hits ${hit} (${fired ? (hit / fired * 100).toFixed(1) : 0}%) | lost: ${lost || 'none'} | afloat: ${left || 'none'} | ${((performance.now() - t0) / 1000).toFixed(1)} s cpu`);
    console.log('   ' + Object.entries(res).sort().map(([k, v]) => `${k}=${v}`).join(' '));
    for (const k of w.kills) { const key = k.victim.stats.id; (agg[key] ||= []).push({ t: k.t, cause: k.cause, mode: k.victim.split ? 'split' : k.victim.sinkMode }); }
  }
}
console.log('\n=== summary of losses by ship');
for (const [id, arr] of Object.entries(agg)) {
  const causes = {}; for (const x of arr) causes[x.cause] = (causes[x.cause] || 0) + 1;
  console.log(` ${id.padEnd(16)} lost ${String(arr.length).padStart(2)}x, mean t ${(arr.reduce((s, x) => s + x.t, 0) / arr.length).toFixed(0)} s, causes ${JSON.stringify(causes)}`);
}
