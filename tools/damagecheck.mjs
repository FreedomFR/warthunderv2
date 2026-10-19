// Balance check of the damage model: node tools/damagecheck.mjs [seconds] [seeds] [filter]
// Runs a set of duels and small fleet battles headless and reports, per scenario: how long it lasted, who was lost and to what
// (cause, way of sinking, time from the first hit to the loss), the shots fired, the hit rate and the fate of the hits (penetrated,
// bounced, over-penetrated, duds, HE bursts).
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

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
