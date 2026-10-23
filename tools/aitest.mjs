// A/B test of the captains: node tools/aitest.mjs "<fleet>" [seeds=16] [secs=1500] [--a=key:val,key:val] [--b=key:val]
// The same fleet on both sides (sides swapped from one seed to the next); the team A captains get the options of --a, those of B the options of --b. Prints who wins, the strength left
// of each side (condition x displacement of the ships afloat), the time the battle takes. The options are read by controllers/ai.js (opts) and fleet.js (opts).
import { spawn } from 'node:child_process';
import os from 'node:os';
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { AIController } from '../js/game/sim/controllers/ai.js';

const args = process.argv.slice(2), flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = ''] = a.slice(2).split('='); return [k, v]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const fleet = (pos[0] || 'iowa:1,baltimore:1,fletcher:2').split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
const SEEDS = Number(pos[1] || 16), SECS = Number(pos[2] || 1500), SEP = Number(flags.sep || 12000);
const parseOpts = (s) => Object.fromEntries((s || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; }));
const optsOf = [parseOpts(flags.a), parseOpts(flags.b)];

const K = Number(flags.procs || Math.min(6, os.cpus().length));
if (!('worker' in flags) && K > 1) {
  // the seeds are shared out between worker processes (one per core), and the results added up
  const parts = await Promise.all(Array.from({ length: K }, (_, i) => new Promise((res) => {
    const c = spawn(process.execPath, [process.argv[1], ...args, `--worker=${i}/${K}`, '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', () => res(JSON.parse(out.trim().split('\n').pop())));
  })));
  const T = parts.reduce((a, r) => { for (const k in r) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  report(T);
  process.exit(0);
}
const [wi, wk] = (flags.worker || '0/1').split('/').map(Number);
const R = { t0: 0, t1: 0, aTorp: 0, bTorp: 0, aTorpHit: 0, bTorpHit: 0, aHits: 0, bHits: 0, aPen: 0, bPen: 0, aShots: 0, bShots: 0, aWins: 0, bWins: 0, draws: 0, aLeft: 0, bLeft: 0, tSum: 0, aLost: 0, bLost: 0, n: 0 };
function report(T) {
  console.log(`${pos[0] || 'default'}  A ${JSON.stringify(optsOf[0])} vs B ${JSON.stringify(optsOf[1])}: A wins ${T.aWins}, B wins ${T.bWins}, draws ${T.draws} of ${T.n} (by side: team 0 ${T.t0}, team 1 ${T.t1}) | strength left A ${(T.aLeft / T.n * 100).toFixed(0)} % B ${(T.bLeft / T.n * 100).toFixed(0)} % | ships lost A ${T.aLost} B ${T.bLost} | hits taken A ${(T.aHits / T.n).toFixed(0)} (pen ${(T.aPen / T.n).toFixed(0)}) B ${(T.bHits / T.n).toFixed(0)} (pen ${(T.bPen / T.n).toFixed(0)}) | shots A ${(T.aShots / T.n).toFixed(0)} B ${(T.bShots / T.n).toFixed(0)} | torpedoes fired A ${(T.aTorp / T.n).toFixed(1)} B ${(T.bTorp / T.n).toFixed(1)}, hits on A ${(T.aTorpHit / T.n).toFixed(2)} on B ${(T.bTorpHit / T.n).toFixed(2)} | mean time ${(T.tSum / T.n).toFixed(0)} s`);
}
for (let job = wi; job < SEEDS; job += wk) {
  const seed = 1 + (job >> 1), flip = job & 1;      // every world is played twice, the A side swapped, so that the geometry of the seed does not matter
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const aTeam = flip, bTeam = 1 - flip;
  const side = { [aTeam]: optsOf[0], [bTeam]: optsOf[1] };
  for (const t of [0, 1]) {
    const s = teamStart(t, 2, SEP);
    spawnFleet(w, t, fleet, s.x, s.z, s.heading, { controller: () => new AIController(side[t]) });
    w.fleetOf(t).opts = side[t];
  }
  w.start();
  let hitsOn = [0, 0], penOn = [0, 0], torpOn = [0, 0];
  while (w.time < SECS && w.state !== 'finished') { w.update(0.1); for (const e of w.drainEvents()) if (e.type === 'shellHit') { hitsOn[e.ship.team]++; if (e.result === 'pen') penOn[e.ship.team]++; } else if (e.type === 'impact' && e.kind === 'torpedo' && e.ship) torpOn[e.ship.team]++; }
  const left = (t) => w.ships.filter((s) => s.team === t && s.alive).reduce((a, s) => a + s.condition * s.stats.dispFull, 0);
  const all = w.ships.filter((s) => s.team === 0).reduce((a, s) => a + s.stats.dispFull, 0);
  const la = left(aTeam) / all, lb = left(bTeam) / all;
  R.aHits += hitsOn[aTeam]; R.bHits += hitsOn[bTeam]; R.aPen += penOn[aTeam]; R.bPen += penOn[bTeam];
  R.aShots += w.ships.filter((s) => s.team === aTeam).reduce((a, s) => a + s.shotsFired, 0); R.bShots += w.ships.filter((s) => s.team === bTeam).reduce((a, s) => a + s.shotsFired, 0);
  R.aTorpHit += torpOn[aTeam]; R.bTorpHit += torpOn[bTeam];
  R.aTorp += w.ships.filter((s) => s.team === aTeam).reduce((a, s) => a + (s.torpFired || 0), 0); R.bTorp += w.ships.filter((s) => s.team === bTeam).reduce((a, s) => a + (s.torpFired || 0), 0);
  R.aLeft += la; R.bLeft += lb; R.tSum += w.time; R.n++;
  R.aLost += w.ships.filter((s) => s.team === aTeam && !s.alive).length; R.bLost += w.ships.filter((s) => s.team === bTeam && !s.alive).length;
  { const l0 = aTeam === 0 ? la : lb, l1 = aTeam === 0 ? lb : la; if (l0 > l1 * 1.25 + 0.05) R.t0++; else if (l1 > l0 * 1.25 + 0.05) R.t1++; }
  if (la > lb * 1.25 + 0.05) R.aWins++; else if (lb > la * 1.25 + 0.05) R.bWins++; else R.draws++;
}
if ('json' in flags) console.log(JSON.stringify(R)); else report(R);
