// One-on-one (or n-on-n) fights between the fighters of two carriers, to judge the air combat: node tools/dogfight.mjs <carrier A> <carrier B> [N=40] [secs=90] [--n=1] [--geom=neutral|bounce|tail]
// Fighters that have taken off are put in the chosen set-up (the others are taken out of the world); every set-up is flown twice with the types swapped between the sides.
// Prints, for A and B: fights won, shot down, no result, rounds that hit, time to the first kill, and the mean turn performance flown (rate of turn, load).
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { makeRng } from '../js/game/math.js';
const args = process.argv.slice(2), flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = ''] = a.slice(2).split('='); return [k, v]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const [CA, CB] = pos, N = +(pos[2] || 40), SECS = +(pos[3] || 90), NF = +(flags.n || 1), GEOM = flags.geom || 'neutral';
const D = { near: 0, fire: 0, def: 0, ext: 0, att: 0, t: 0, behind: 0 };
const R = { aLost: 0, bLost: 0, aWin: 0, bWin: 0, none: 0, n: 0, tKill: 0, kills: 0, aLeft: 0, bLeft: 0, turnA: 0, turnB: 0, tA: 0, tB: 0 };
for (let s = 0; s < N; s++) for (const swap of [0, 1]) {
  const w = new World(9000 + s); w.addTeam(0); w.addTeam(1);
  const ids = swap ? [CB, CA] : [CA, CB];      // team 0 flies ids[0]
  spawnFleet(w, 0, [{ id: ids[0], count: 1 }], 0, 0, 90); spawnFleet(w, 1, [{ id: ids[1], count: 1 }], 40000, 0, 270);
  w.start();
  const mine = [[], []];
  for (let i = 0; i < 6000 && (mine[0].length < NF || mine[1].length < NF); i++) {
    w.update(0.1); w.drainEvents();
    for (const p of w.planes) if (p.fighter && p.y > 120 && !p.dying && mine[p.team].length < NF && !mine[p.team].includes(p)) mine[p.team].push(p);
  }
  if (mine[0].length < NF || mine[1].length < NF) continue;
  const rnd = makeRng(s * 7 + 1);
  const sep = rnd.range(2200, 3600), alt = rnd.range(1500, 2600), lat = rnd.range(-500, 500);
  mine.forEach((grp, t) => grp.forEach((p, j) => {
    const dir = t ? -1 : 1;                      // team 0 starts at -x flying +x
    const bx = -dir * sep / 2, bz = lat * (t ? 0.5 : -0.5);
    p.x = bx - dir * j * 150; p.z = bz + j * 160; p.y = alt + (GEOM === 'bounce' && t === 0 ? 700 : 0) + j * 40;
    p.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; p.pitch = 0; p.bank = 0; p.speed = 105 + rnd.range(0, 10); p.phase = 'cap'; p.hidden = false; p.gearDown = false; p.ds = 'air';
    p.fuel = 2000; p.ammo = 520; p.cond = 1; p.age = 200; p.t0Air = 0; p.prey = null; p.preyT = 0; p.role = 'cap'; p.wave = { planes: grp };
    if (GEOM === 'tail' && t === 1) { p.heading = Math.PI / 2; p.x = -sep / 2 + 600 + j * 150; }
    p.vx = Math.sin(p.heading) * p.speed; p.vz = -Math.cos(p.heading) * p.speed; p.vy = 0;
  }));
  const keep = new Set([...mine[0], ...mine[1]]);
  // move the carriers next to the fight so that the fighters' "ship" checks hold, and the planes of the fight sit within 26 km of theirs
  w.ships[0].x = -3000; w.ships[0].z = 0; w.ships.forEach((sh) => { sh.cmd && (sh.cmd.throttle = 0); });
  w.ships.forEach((sh) => { sh.x = sh.team ? 6000 : -6000; sh.z = 0; sh.heading = sh.team ? -Math.PI / 2 : Math.PI / 2; sh.speed = 0; });
  let t0 = w.time, firstKill = -1, tl = [0, 0]; const dead = new Set(), turn = [0, 0], nt = [0, 0];
  const prevH = new Map();
  for (let i = 0; i < SECS * 10; i++) {
    w.planes = w.planes.filter((p) => keep.has(p));
    w.update(0.1);
    if (process.env.TRACE && s === 0 && !swap && i % 10 === 0) console.log((i / 10).toFixed(0).padStart(3), [...keep].map((p) => `${p.typeKey} ${p.tac || p.phase} v${p.speed.toFixed(0)} y${p.y.toFixed(0)} h${(p.heading * 57.3).toFixed(0)} ld${(p.load ?? 0).toFixed(1)} ${p.firing ? 'FIRE' : ''}`).join(' | '), 'd', Math.hypot(...[...keep].slice(0, 2).map((p) => [p.x, p.y, p.z]).reduce((a, b) => a.map((v, k) => v - b[k]))).toFixed(0));
    for (const e of w.drainEvents()) if (e.type === 'planeDown' && keep.has(e.plane) && !dead.has(e.plane)) { dead.add(e.plane); if (firstKill < 0) firstKill = w.time - t0; }
    for (const p of keep) if (!p.dying && !dead.has(p)) { const h = prevH.get(p); if (h !== undefined) { turn[p.team] += Math.abs(((p.heading - h + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / 0.1; nt[p.team]++; } prevH.set(p, p.heading); }
    { const [u, v] = [...keep]; if (u && v) { const dd = Math.hypot(u.x - v.x, u.y - v.y, u.z - v.z); D.t += 0.1; if (dd < 700) D.near += 0.1; for (const p of keep) { if (p.firing) D.fire += 0.1; if (p.tac === 'defend') D.def += 0.1; else if (p.tac === 'extend') D.ext += 0.1; else D.att += 0.1; } } }
    const alive = [0, 1].map((t) => mine[t].filter((p) => !p.dying && !dead.has(p)).length);
    if (!alive[0] || !alive[1]) break;
  }
  const alive = [0, 1].map((t) => mine[t].filter((p) => !p.dying && !dead.has(p)).length);
  // team of type A: the one whose carrier is CA
  const aTeam = ids[0] === CA ? 0 : 1, bTeam = 1 - aTeam;
  R.n++;
  if (alive[aTeam] && !alive[bTeam]) R.aWin++; else if (alive[bTeam] && !alive[aTeam]) R.bWin++; else R.none++;
  R.aLost += NF - alive[aTeam]; R.bLost += NF - alive[bTeam];
  R.aLeft += alive[aTeam]; R.bLeft += alive[bTeam];
  if (firstKill >= 0) { R.tKill += firstKill; R.kills++; }
  R.turnA += turn[aTeam]; R.tA += nt[aTeam]; R.turnB += turn[bTeam]; R.tB += nt[bTeam];
}
const f = (x) => x.toFixed(2);
console.log(`${CA} vs ${CB} (${NF} on ${NF}, ${GEOM}): ${R.n} fights: ${CA} wins ${R.aWin}, ${CB} wins ${R.bWin}, no result ${R.none} | lost ${CA} ${R.aLost} / ${CB} ${R.bLost} | left ${f(R.aLeft / R.n)} / ${f(R.bLeft / R.n)} | first kill after ${f(R.tKill / Math.max(1, R.kills))} s | mean turn rate ${f(R.turnA / Math.max(1, R.tA) * 57.3)} / ${f(R.turnB / Math.max(1, R.tB) * 57.3)} deg/s`);

console.log(`  time within 700 m ${(D.near / D.t * 100).toFixed(0)} %, firing ${(D.fire / D.t * 100).toFixed(0)} % of the fighter-time ${(D.fire / 2 / D.t * 100).toFixed(0)}; attack ${(D.att / D.t / 2 * 100).toFixed(0)} %, defend ${(D.def / D.t / 2 * 100).toFixed(0)} %, extend ${(D.ext / D.t / 2 * 100).toFixed(0)} %`);
