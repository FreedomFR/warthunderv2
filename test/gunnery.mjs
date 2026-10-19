// Gunnery choices: node test/gunnery.mjs
// The shell chosen against the target, the magazines (rounds, kinds, changing over), and mounts that engage targets of their own.
import { World } from '../js/game/sim/world.js';
import { shellChoice, mountSolution, updateGunnery } from '../js/game/sim/weapons.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const duel = (sid, tid, range, hd, seed = 1) => {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const s = w.addShip(sid, 0, 0, 0, 0), t = w.addShip(tid, 1, 0, -range, hd * Math.PI / 180);
  w.start(); for (let i = 0; i < 20; i++) w.step(0.1);
  return { w, s, t, m: s.mounts.find((q) => q.group === 'main') };
};
const choice = (sid, tid, range, hd) => { const { s, t, m } = duel(sid, tid, range, hd); const sol = {}; mountSolution(s, m, t, sol); return shellChoice(s, m, t, sol); };

// ---- the shell follows the target: HE against destroyers and against a bow-on battleship at long range, AP against the side of an armoured ship ----
ok(choice('iowa', 'fletcher', 3000, 90).type === 'HE', 'a battleship shoots HE at a destroyer');
ok(choice('iowa', 'takao', 10000, 90).type === 'AP', 'AP at the side of a heavy cruiser');
ok(choice('iowa', 'yamato', 20000, 90).type === 'AP', 'AP at the side of a battleship');
ok(choice('iowa', 'yamato', 20000, 0).type === 'HE', 'HE at a battleship coming bow-on at 20 km: the plate and the grazing angle beat the AP');
ok(choice('tribal', 'yamato', 6000, 90).type === 'HE', 'guns with no AP shell always fire HE');

// ---- magazines: rounds per gun, AP / HE split, spent as they are fired ----
{
  const { w, s, t, m } = duel('iowa', 'takao', 9000, 90);
  ok(m.ammo0 === 100 * m.n && m.ammo.AP > m.ammo.HE, `a 16 in turret holds ${m.ammo0} rounds (100 a gun), more AP (${m.ammo.AP}) than HE (${m.ammo.HE})`);
  s.cmd.main.target = t; s.cmd.main.fire = true;
  const a0 = m.ammo.AP + m.ammo.HE;
  for (let i = 0; i < 1500 && m.ammo.AP + m.ammo.HE === a0; i++) { s.cmd.main.target = t; w.update(0.1); }
  ok(m.ammo.AP + m.ammo.HE === a0 - m.n, `a salvo of ${m.n} shells takes ${m.n} rounds from the magazine (${m.ammo.AP} AP, ${m.ammo.HE} HE left)`);
  m.ammo.AP = 0; m.ammo.HE = 0; m.reload = 0;
  for (let i = 0; i < 300 && !m.noAmmo; i++) { s.cmd.main.target = t; s.cmd.main.fire = true; w.update(0.1); }
  ok(m.noAmmo, 'out of rounds, the mount is silent for good');
}
// ---- changing over costs a long reload and is only done when it pays ----
{
  const { w, s, t, m } = duel('iowa', 'takao', 9000, 90);
  m.loaded = 'HE'; m.reload = 0; m.aimOk = true;
  const sol = {}; mountSolution(s, m, t, sol);
  const st = s.cmd; s.cmd.main.target = t; s.cmd.main.fire = true;
  // the mount holds HE but AP is far better against this target: it unloads first (a long reload), then fires the other kind
  for (let i = 0; i < 400 && m.loaded === 'HE'; i++) w.update(0.1);
  ok(m.loaded === 'AP', 'the mount changes over to the better shell');
  ok(m.reload > m.gun.reload * 0.5 || m.fireT < 5, 'and the changeover cost time');
}

// ---- mounts that cannot bear on the battery's target engage another ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const s = w.addShip('fletcher', 0, 0, 0, 0);
  const a = w.addShip('kagero', 1, 0, -6000, 0);          // ahead
  const b = w.addShip('kagero', 1, 0, 6000, 0);           // astern
  w.start(); for (let i = 0; i < 20; i++) w.step(0.1);
  s.cmd.main.target = a; s.cmd.main.fire = true;
  const aft = s.mounts.filter((q) => q.group === 'main' && q.rec.x < 0);
  const fwd = s.mounts.filter((q) => q.group === 'main' && q.rec.x > 0);
  let aftTargets = new Set(), fwdTargets = new Set();
  for (let i = 0; i < 300; i++) { s.cmd.main.target = a; s.cmd.main.fire = true; updateGunnery(s, w, 0.1); for (const q of aft) if (q.target) aftTargets.add(q.target.id); for (const q of fwd) if (q.target) fwdTargets.add(q.target.id); }
  ok(fwdTargets.has(a.id), 'the forward guns fire at the battery target ahead');
  ok(aft.length === 0 || aftTargets.has(b.id), 'the after guns, which cannot bear ahead, take the ship astern on their own');
}
console.log(fail ? `${fail} check(s) failed` : 'all gunnery checks OK');
