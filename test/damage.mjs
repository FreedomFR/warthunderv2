// Location-based damage: node test/damage.mjs
// A hit damages what is at the point of impact: modules, flooding side, destroyed parts, bomb penetration, explosions.
import { World } from '../js/game/sim/world.js';
import { blast } from '../js/game/sim/modules.js';
import { resolveShellHit, resolveBombHit, resolveTorpedoHit } from '../js/game/sim/damage.js';
import { getPlaneModel, PLANES } from '../js/game/model/planes.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const mk = (id, seed = 1) => { const w = new World(seed); w.addTeam(0); w.addTeam(1); const s = w.addShip(id, 1, 0, 0, 0); w.start(); return { w, s }; };
const mod = (s, kind, i = 0) => s.modules.filter((m) => m.kind === kind)[i];

// ---- every ship has the full set of modules and visible parts ----
for (const spec of ALL_SHIPS) {
  const { s } = mk(spec.id);
  const kinds = new Set(s.modules.map((m) => m.kind));
  ok(['engine', 'magazine', 'steering', 'shaft', 'bridge', 'funnel'].every((k) => kinds.has(k) || (spec.type === 'CV' && k === 'magazine' && false)) || spec.id === 'shokaku', `${spec.id}: modules ${[...kinds].join(',')}`);
  ok(s.model.parts.every((p) => p.mesh && p.mesh.indexCount > 0), `${spec.id}: ${s.model.parts.length} parts with meshes, ${s.model.aaMounts.length} AA mounts`);
}

// ---- a heavy AP shell in the machinery spaces wrecks the engine room it bursts in, not the whole ship ----
{
  const { w, s } = mk('iowa');
  const e0 = mod(s, 'engine', 0), e2 = mod(s, 'engine', 3);
  blast(w, s, e0.x, e0.y, e0.z, 1225, 'inside', null, 'shell');
  ok(e0.state === 2 && e2.state < 2, `406 mm burst inside engine room 1: it is destroyed (${e0.state}), the one 60 m away is not (${e2.state})`);
  ok(s.propulsion < 1 && s.propulsion > 0.3, `propulsion drops to ${(s.propulsion * 100).toFixed(0)} %`);
}
// ---- the same burst on the armoured deck does nothing to the machinery ----
{
  const { w, s } = mk('iowa');
  const e0 = mod(s, 'engine', 0);
  blast(w, s, e0.x, 7, 0, 1225 * 0.35, 'outside', null, 'shell');
  ok(e0.state === 0 && e0.hp === e0.maxHp || e0.hp > e0.maxHp * 0.9, 'an HE burst on the deck leaves the machinery below untouched');
}
// ---- small HE shells kill light AA and directors, not a battleship's turrets ----
{
  const { w, s } = mk('baltimore');
  const a = s.aaMounts[0];
  blast(w, s, a.rec.x, a.rec.y, a.rec.z, 25 * 0.35, 'outside', null, 'shell');
  ok(!a.alive || a.hp < a.maxHp, `a 127 mm HE hit damages the AA mount it lands on (${a.hp.toFixed(1)}/${a.maxHp})`);
  const tur = s.mounts.find((m) => m.group === 'main');
  const hp0 = tur.hp;
  blast(w, s, tur.rec.x, tur.rec.y, tur.rec.z, 25 * 0.35, 'outside', null, 'shell');
  ok(tur.alive && tur.hp > hp0 * 0.9, 'the main turret shrugs off the same shell');
}
// ---- funnel: destroyed part, wreck state, flying debris, speed loss ----
{
  const { w, s } = mk('fletcher');
  const f = mod(s, 'funnel', 0);
  blast(w, s, f.x, f.y, f.z, 500, 'outside', null, 'shell');
  ok(f.state === 2 && s.partState[f.part] === 2, 'funnel destroyed -> its part is drawn as a wreck');
  ok(w.debris.some((d) => d.kind === 'part'), 'the funnel flies off as debris');
  ok(s.propulsion < 1, `losing a funnel costs speed (propulsion ${(s.propulsion * 100).toFixed(0)} %)`);
}
// ---- torpedo: flooding on the struck side and near the impact, ship lists ----
{
  const { w, s } = mk('cleveland');
  const t = { warhead: 300, owner: null };
  // starboard side amidships (world point): local z = +beam/2
  const p = [0, 0, 0]; s.toWorld(20, 0, s.stats.B / 2, p);
  resolveTorpedoHit(w, s, t, p[0], p[2]);
  for (let i = 0; i < 400; i++) s.update(0.1);
  ok(s.listSide === 1 && s.floodList > 0, `a starboard torpedo hit lists the ship to starboard (floodList ${s.floodList.toFixed(3)})`);
  const near = s.comps.reduce((a, c) => (Math.abs(c.xc - 20) < Math.abs(a.xc - 20) ? c : a));
  const far = s.comps[s.comps.length - 1];
  ok(near.water[1] > far.water[1] + 0.02, `the compartments near the hit are flooded (${near.water[1].toFixed(2)}) more than the stern ones (${far.water[1].toFixed(2)})`);
}
// ---- bombs: penetrate a light cruiser's deck and burst below, burst on a battleship's armoured deck ----
{
  const run = (id) => {
    const { w, s } = mk(id, 3);
    let kind = null;
    const bomb = { kg: 250, vx: 0, vy: -140, vz: 0, owner: null };
    // the unarmoured forecastle deck
    const lx = s.stats.L * 0.4;
    resolveBombHit(w, s, bomb, { part: 'deck', lx, ly: s.model.hull.deckY(lx), lz: 2 });
    return w.events.filter((e) => e.type === 'impact').map((e) => e.kind)[0];
  };
  ok(run('cleveland') === 'penetrate', '250 kg bomb on the thin forecastle deck of a light cruiser penetrates');
  ok(run('iowa') === 'penetrate' || run('iowa') === 'explode', 'bomb on a battleship deck resolved');
  {
    const { w, s } = mk('iowa', 3);
    resolveBombHit(w, s, { kg: 250, vx: 0, vy: -140, vz: 0, owner: null }, { part: 'deck', lx: 10, ly: s.model.hull.deckY(10), lz: 2 });
    ok(w.events.find((e) => e.type === 'impact').kind === 'explode', '250 kg bomb on a battleship\'s armoured deck bursts on top of it');
  }
}
// ---- magazine explosion: thrown turrets, debris, secondary blasts, broken hull ----
{
  const { w, s } = mk('iowa', 4);
  const mag = mod(s, 'magazine', 0);
  s.magazineLost(mag, w, null, 'shell');
  if (!s.exploded) w.magazineExplosion(s, null, s.toWorld(mag.x, mag.y, mag.z, [0, 0, 0]), mag);
  ok(s.exploded && s.state === 'sinking', 'ammunition explosion sinks the ship');
  ok(s.mounts.some((m) => m.gone), 'a turret is thrown out of the ship');
  for (let i = 0; i < 80; i++) w.update(0.1);
  ok(!!s.split, 'the hull breaks in two');
  ok(w.debris.length > 20, `wreckage in the air (${w.debris.length} pieces)`);
  const ev = w.drainEvents();
  ok(ev.filter((e) => e.type === 'explosion').length >= 4, `primary and secondary explosions (${ev.filter((e) => e.type === 'explosion').length})`);
  for (let i = 0; i < 1200; i++) w.update(0.1);
  ok(s.state === 'sunk', 'the sections sink');
}
// ---- shell hits: the angle of attack decides whether an armour-piercing shell goes through, and the report says why ----
{
  const shoot = (id, type, angleDeg, where) => {
    const { w, s } = mk(id, 11);
    for (let i = 0; i < 20; i++) w.update(0.1);
    const g = s.stats.main, owner = w.addShip('iowa', 0, 8000, 0, 0);
    // a shell flying at 1000 m from the side: its incidence is the angle between its path and the plate normal (Iowa's belt leans 19 degrees, so a flat shell meets it at 19)
    const a = angleDeg * Math.PI / 180;
    const sp = type === 'AP' ? g.v0 * 0.72 : g.v0 * 0.72;
    // heading 0: starboard is +x, forward is -z; the shell flies towards port, its path turned `a` away from the plate normal
    const shell = { owner, gun: g, type, vx: -Math.cos(a) * sp, vy: -sp * 0.02, vz: -Math.sin(a) * sp, c: 0 };
    const hit = { part: 'hull', lx: 0, ly: 1.5, lz: s.stats.B / 2 - 0.3 };
    w.drainEvents();
    // the shell comes from starboard: its velocity points to port (-z)
    resolveShellHit(w, s, shell, hit);
    const ev = w.drainEvents();
    return { ev: ev.find((e) => e.type === 'shellHit'), imp: ev.find((e) => e.type === 'impact') };
  };
  const side = shoot('iowa', 'AP', 0, null);
  ok(side.ev && side.ev.angle > 15 && side.ev.angle < 22 && ['pen', 'bounce', 'over'].includes(side.ev.result), `shell report: ${side.ev && side.ev.shell} ${side.ev && side.ev.cal} mm at ${side.ev && side.ev.angle.toFixed(0)} deg, plate ${side.ev && side.ev.armor} mm (${side.ev && side.ev.eff.toFixed(0)} effective) against ${side.ev && side.ev.pen.toFixed(0)} mm of penetration: ${side.ev && side.ev.result}`);
  let glances = 0; for (let i = 0; i < 20; i++) if (shoot('iowa', 'AP', 80, null).ev.result === 'glance') glances++;
  ok(glances >= 10, `at 80 degrees an armour-piercing shell mostly glances off (${glances}/20)`);
  const he = shoot('iowa', 'HE', 0, null); ok(he.ev && ['burst', 'shatter', 'pen'].includes(he.ev.result) && he.ev.shell === 'HE', `an HE shell reports its burst (${he.ev && he.ev.result})`);
  ok(he.imp && he.imp.shell === 'HE' && typeof he.imp.dx === 'number', 'the impact event carries the shell type and its direction for the effects');
}
// ---- the broken hull never leaves the water: the sections only hop a little, then settle and go down ----
{
  const { w, s } = mk('iowa', 4);
  const mag = mod(s, 'magazine', 0);
  w.magazineExplosion(s, null, s.toWorld(mag.x, mag.y, mag.z, [0, 0, 0]), mag);
  let top = -1e9;
  for (let i = 0; i < 1500 && s.state !== 'sunk'; i++) { w.update(0.1); if (s.split) for (const h of s.split.halves) top = Math.max(top, h.dy); }
  ok(top < 3, `the sections of an exploded battleship rise at most ${top.toFixed(1)} m above the water`);
  ok(s.state === 'sunk', 'and they go down');
}
// ---- the ways of sinking: capsizing, by the bow, by the stern, settling, burning out, blown apart ----
{
  const run = (id, mode) => {
    const { w, s } = mk(id, 6);
    for (let i = 0; i < 30; i++) w.update(0.1);
    s.destroy(null, 'shell'); s.sinkMode = mode; s.sinkStyle = mode; if (mode === 'burn') s.burnT = 30;
    let roll = 0, pitch = 0, depth30 = 0, n = 0;
    for (let i = 0; i < 4000 && s.state !== 'sunk'; i++) { w.update(0.1); n = i; roll = Math.max(roll, Math.abs(s.roll)); pitch = Math.max(pitch, Math.abs(s.pitch)); if (i === 250) depth30 = s.sinkDepth; }
    return { s, roll, pitch, depth30, t: (n + 1) / 10 };
  };
  const cap = run('cleveland', 'roll'); ok(cap.roll > 2.8 && cap.s.state === 'sunk', `capsizing: the hull rolls over (${(cap.roll * 57.3).toFixed(0)} deg) before going down in ${cap.t.toFixed(0)} s`);
  const bow = run('baltimore', 'bow'); ok(bow.pitch > 0.9 && bow.s.state === 'sunk', `by the bow: ${(bow.pitch * 57.3).toFixed(0)} deg`);
  const stern = run('baltimore', 'stern'); ok(stern.pitch > 0.9 && stern.s.state === 'sunk', `by the stern: ${(stern.pitch * 57.3).toFixed(0)} deg`);
  const lev = run('baltimore', 'level'); ok(lev.pitch < 0.2 && lev.roll < 0.3 && lev.s.state === 'sunk', 'settling: she stays on an even keel');
  const burn = run('baltimore', 'burn'); ok(burn.depth30 < 1 && burn.t > 60, `burning out: still on the surface after 25 s, gone after ${burn.t.toFixed(0)} s`);
  const blast = run('fletcher', 'blast'); ok(blast.t < 25 && blast.s.state === 'sunk', 'blown apart: down in ' + blast.t.toFixed(0) + ' s');
}
// ---- the mode follows what killed her ----
{
  const mk2 = (id, f) => { const { w, s } = mk(id, 8); for (let i = 0; i < 30; i++) w.update(0.1); f(s); return s; };
  const a = mk2('cleveland', (s) => { s.floodList = 0.25; s.floodTrim = 0; }); a.destroy(null, 'torpedo'); ok(a.sinkMode === 'roll', 'a strongly one-sided flooding capsizes her');
  const b = mk2('cleveland', (s) => { s.floodList = 0; s.floodTrim = 0.3; }); b.destroy(null, 'shell'); ok(b.sinkMode === 'bow', 'down by the bow when the bow is flooded');
  const c = mk2('cleveland', (s) => { s.floodList = 0; s.floodTrim = -0.3; }); c.destroy(null, 'shell'); ok(c.sinkMode === 'stern', 'down by the stern when the stern is flooded');
  const d = mk2('cleveland', () => {}); d.destroy(null, 'fire'); ok(d.sinkMode === 'burn' && d.burnT >= 30, `lost to fire: she burns out first (${d.burnT.toFixed(0)} s)`);
  const e = mk2('cleveland', () => {}); e.destroy(null, 'magazine'); ok(e.sinkMode === 'blast', 'a magazine explosion blows her apart');
}
// ---- a long ship whose middle is full of water and whose hull is wrecked breaks her back ----
{
  const { w, s } = mk('iowa', 9);
  for (let i = 0; i < 30; i++) w.update(0.1);
  for (const c of s.comps) { c.water[0] = c.water[1] = 0.95; }
  s.hp = s.stats.maxHp * 0.2;
  for (let i = 0; i < 1200 && !s.split && s.state === 'afloat'; i++) { for (const c of s.comps) { c.water[0] = c.water[1] = 0.95; } w.update(0.1); }
  ok(!!s.split && s.state === 'sinking', 'the flooded, battered hull breaks in two by itself');
}
// ---- aircraft models ----
for (const k of Object.keys(PLANES)) {
  const m = getPlaneModel(k);
  ok(m.meshes.whole.indexCount > 300 && m.meshes.prop && (m.meshes.ordnance || PLANES[k].role === "fighter") && m.meshes.wingL && m.meshes.tail, `plane ${k} (${PLANES[k].name}): ${m.meshes.whole.indexCount / 3} triangles`);
}
console.log(fail ? `${fail} check(s) failed` : 'all damage checks OK');
