// The bombs: node test/ordnance.mjs
// What a bomb is (its filler, its case, its fuze, the deck it goes through) decides what it does: to an aircraft parked in the open, to a deck, to the sea beside a hull. The loads of every
// aircraft type are real ones, the bombs of a load fall together, and the choice of the load follows the target.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { resolveBombHit, resolveNearMiss } from '../js/game/sim/damage.js';
import { BOMBS, aircraftRadii, killChance, shockMPa, fillerTNT, blastTNT } from '../js/game/data/ordnance.js';
import { LOADOUTS, loadKg, bombsIn, torpedoesIn, pickLoadout } from '../js/game/data/loadouts.js';
import { PLANES } from '../js/game/model/planes.js';
import { PERF } from '../js/game/sim/airperf.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// ---- the data ----
{
  let bad = [];
  for (const [id, b] of Object.entries(BOMBS)) if (!(b.kg > 5 && b.filler > 0 && b.filler < b.kg * 0.7 && b.pen > 0 && b.caseK > 0 && b.caseK <= 0.7 && b.delay >= 0)) bad.push(id);
  ok(!bad.length, `${Object.keys(BOMBS).length} bombs with a consistent mass, filler, case, fuze and penetration${bad.length ? ': ' + bad.join(', ') : ''}`);
  ok(BOMBS.anm64.kg > 226 && BOMBS.anm64.kg < 228 && BOMBS.sc1000.filler === 600 && BOMBS.pc500.filler < BOMBS.sd500.filler && BOMBS.anmk33.filler / BOMBS.anmk33.kg < 0.2, 'the 500 lb is 227 kg, the SC 1000 holds 600 kg of explosive, an armour-piercing bomb keeps its mass in its case');
  ok(BOMBS.anmk33.pen > BOMBS.anm65.pen * 2 && BOMBS.anmk1.pen >= 150 && BOMBS.jn80ap.pen >= 150, 'the armour-piercing bombs go through 100 to 150 mm of deck, the general-purpose ones 30 to 55 mm');
  const missing = [];
  for (const [t, list] of Object.entries(LOADOUTS)) {
    if (!PLANES[t] && !PERF[t]) missing.push(t);
    for (const l of list) for (const s of l.stores) if (s.ord && !BOMBS[s.ord]) missing.push(t + ':' + s.ord);
  }
  ok(!missing.length, `every load of the ${Object.keys(LOADOUTS).length} aircraft types hangs bombs that exist${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`);
  // loads against what the aircraft can lift: not more than the published maximum (the SBD 1 800 lb, the B-17 8 000 kg ...)
  const MAX = { sbd: 1000, tbf: 1100, d3a: 400, b5n: 900, skua: 300, swordfish: 750, ju87: 800, fi167: 1100, ln401: 300, pl10: 700, re2001: 650, re2001t: 700, b17: 7000, g4m: 1500, lancaster: 7000, he111: 3000, sm79: 2600, leo451: 1700 };
  const over = [];
  for (const [t, list] of Object.entries(LOADOUTS)) for (const l of list) if (loadKg(l, PLANES[t] ? PLANES[t].nation : 'USA') > MAX[t]) over.push(`${t}/${l.id} ${loadKg(l).toFixed(0)} kg`);
  ok(!over.length, `no load heavier than the aircraft can lift${over.length ? ' (' + over.join(', ') + ')' : ''}`);
  ok(bombsIn(LOADOUTS.sbd[0]).length === 3 && bombsIn(LOADOUTS.b17[0]).length === 12 && torpedoesIn(LOADOUTS.he111[2]) === 2, 'an SBD takes 1 + 2 bombs, a B-17 12 of 500 lb, a He 111 two torpedoes');
  const t = LOADOUTS.tbf;
  ok(t[0].stores[0].torp === 1 && t.some((l) => l.stores[0].ord === 'anm64' && l.stores[0].n === 4), 'a TBF takes a torpedo or four 500 lb bombs');
}

// ---- the choice of the load follows the target ----
{
  ok(pickLoadout('sbd', 'ship', false).stores.some((s) => s.ord === 'anm65'), 'an SBD against a ship takes the 1 000 lb bomb');
  ok(pickLoadout('sbd', 'base', false).stores.every((s) => s.ord !== 'anm65'), 'against a base it takes the lighter one');
  ok(pickLoadout('ju87', 'ship', true).stores[0].ord === 'pc500', 'a Stuka against an armoured ship hangs the armour-piercing PC 500');
  ok(pickLoadout('ju87', 'ship', false).stores[0].ord === 'sc500', 'against an unarmoured one, the SC 500');
  ok(pickLoadout('tbf', 'ship', true).stores[0].torp === 1, 'a torpedo bomber takes its torpedo against ships');
  ok(pickLoadout('b17', 'base', false).stores[0].ord === 'anm30', 'a B-17 against a field takes a stick of 100 lb bombs (blast against what is parked in the open)');
  ok(pickLoadout('b17', 'ship', false).stores[0].ord === 'anm64' && pickLoadout('b17', 'ship', true).stores[0].ord === 'anm65', 'and against a ship the 500 lb ones, the 1 000 lb ones against an armoured ship');
}

// ---- aircraft in the open: the radii of the blast, and the chance of being destroyed ----
{
  const r500 = aircraftRadii(BOMBS.anm64), r1000k = aircraftRadii(BOMBS.sc1000), r100 = aircraftRadii(BOMBS.anm30), rap = aircraftRadii(BOMBS.anmk33);
  ok(r500.dead > 20 && r500.dead < 40 && r500.hurt > 35 && r500.hurt < 60 && r500.light > 60 && r500.light < 110, `a 500 lb bomb destroys aircraft within ${r500.dead.toFixed(0)} m, damages them within ${r500.hurt.toFixed(0)} m, scorches them within ${r500.light.toFixed(0)} m`);
  ok(r1000k.dead > r500.dead * 1.3 && r100.dead < r500.dead * 0.7, `the SC 1000 reaches further (${r1000k.dead.toFixed(0)} m), a 100 lb bomb less far (${r100.dead.toFixed(0)} m)`);
  ok(rap.dead < r500.dead * 0.8, `an armour-piercing bomb, mostly case, wrecks less of what stands in the open (${rap.dead.toFixed(0)} m) than a general-purpose one of the same mass`);
  ok(killChance(5, r500) === 1 && killChance(r500.dead, r500) === 0.5 && killChance(r500.hurt + 1, r500) === 0 && killChance(20, r500) >= killChance(30, r500), 'the chance of being destroyed falls from 1 near the burst to 0.5 at the radius and 0 at the radius of damage');
}

// ---- an airfield: the bombs wreck what is parked on the apron, as far as their blast goes ----
{
  const count = (ord, d) => {
    let lost = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      const w = new World(100 + k); w.addTeam(0); w.addTeam(1);
      const R = aircraftRadii(BOMBS[ord]);
      // a plane at d metres from the burst, with the rolls of the dice of the world
      let hits = 0;
      for (let i = 0; i < 6; i++) if (w.rng() < killChance(d, R)) hits++;
      lost += hits; n += 6;
    }
    return lost / n;
  };
  ok(count('anm64', 12) > 0.95 && count('anm64', 60) === 0, 'a 500 lb bomb 12 m from an aircraft destroys it, 60 m away it does not');
  ok(count('sc1000', 35) > count('anm64', 35) + 0.2, 'at 35 m the SC 1000 destroys what the 500 lb does not');
}

// ---- a ship: the deck, the case and the fuze ----
{
  const mk = (id, seed = 1) => {
    const w = new World(seed); w.addTeam(0); w.addTeam(1);
    const s = w.addShip(id, 1, 0, 0, 0); const o = w.addShip('iowa', 0, 9000, 0, 0); w.start();
    o.cmd.main.fire = false; s.cmd.main.fire = false;
    for (let i = 0; i < 10; i++) w.update(0.1);
    return { w, s };
  };
  const hit = (id, ord, vy = -210, seed = 1) => {
    const { w, s } = mk(id, seed);
    const lx = s.stats.L * 0.1;
    const ev0 = w.events.length;
    resolveBombHit(w, s, { kg: BOMBS[ord].kg, ord: BOMBS[ord], vx: 0, vy, vz: 0, owner: null }, { part: 'deck', lx, ly: s.model.hull.deckY(lx), lz: 2 });
    const e = w.events.slice(ev0).find((x) => x.type === 'impact');
    return e ? e.kind : null;
  };
  ok(hit('fletcher', 'anm57') === 'penetrate', 'a 250 lb bomb goes through the deck of a destroyer and bursts inside');
  ok(hit('baltimore', 'anm65') === 'explode', 'a 1 000 lb general-purpose bomb does not go through the armoured deck of a cruiser: it bursts on it');
  ok(hit('baltimore', 'anmk33') === 'penetrate', 'a 1 000 lb armour-piercing one does');
  ok(hit('iowa', 'anmk33') === 'explode', 'and not through the deck of a battleship');
  // the effect of one hit on a ship, by the bomb
  const dmgOf = (id, ord) => { const { w, s } = mk(id, 3); const lx = s.stats.L * 0.1; const c0 = s.comps.reduce((a, c) => a + (c.struct || 0), 0); resolveBombHit(w, s, { kg: BOMBS[ord].kg, ord: BOMBS[ord], vx: 0, vy: -210, vz: 0, owner: null }, { part: 'deck', lx, ly: s.model.hull.deckY(lx), lz: 2 }); return s.comps.reduce((a, c) => a + (c.struct || 0), 0) - c0; };
  ok(dmgOf('fletcher', 'anm64') > dmgOf('fletcher', 'anm30') * 2, 'on a destroyer a 500 lb bomb does more than twice what a 100 lb one does');
}

// ---- the sea beside a hull: the shock of a bomb that misses ----
{
  ok(shockMPa(121, 11) > 18 && shockMPa(121, 11) < 30, `a 500 lb bomb 11 m from the hull: ${shockMPa(121, 11).toFixed(0)} MPa (it opens the seams at about 20)`);
  ok(shockMPa(600, 10) > 40 && shockMPa(60, 30) < 8, 'a 1 000 kg bomb 10 m off holes the plating (40 MPa), a small one 30 m off does nothing');
  const flood = (ord, side) => {
    const w = new World(5); w.addTeam(0); w.addTeam(1);
    const s = w.addShip('fletcher', 1, 0, 0, 0); const o = w.addShip('iowa', 0, 9000, 0, 0); w.start();
    o.cmd.main.fire = false; s.cmd.main.fire = false;
    for (let i = 0; i < 10; i++) w.update(0.1);
    s.toWorld(0, 0, side + s.model.hull.halfBeamWL(0), _o);
    const wx = _o[0], wz = _o[2];
    resolveNearMiss(w, s, { kg: BOMBS[ord].kg, ord: BOMBS[ord], vx: 0, vy: -150, vz: 0, owner: null }, wx, wz);
    for (let i = 0; i < 100; i++) w.update(0.1);
    return s.comps.reduce((a, c) => a + (c.water ? c.water.reduce((x, y) => x + y, 0) : 0), 0) + (s.comps.reduce((a, c) => a + (c.struct || 0), 0)) * 0.1;
  };
  const _o = [0, 0, 0];
  const near = flood('anm64', 4), far = flood('anm64', 45), heavy = flood('sc1000', 10), light = flood('anm30', 10);
  ok(near > far * 2 + 0.01, `a 500 lb bomb 4 m off the hull of a destroyer does harm (${near.toFixed(2)}), 45 m off none (${far.toFixed(2)})`);
  ok(heavy > light, `at 10 m an SC 1000 does more (${heavy.toFixed(2)}) than a 100 lb bomb (${light.toFixed(2)})`);
}

// ---- the land-based bombers fly their loads: a torpedo run by a Betty (it used to crash at take-off), a strike on an airfield by carrier dive bombers with real bombs ----
{
  const arena = (nat0, seed = 4) => {
    const w = new World(seed); w.addTeam(0); w.addTeam(1);
    const sep = 12000, starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: [nat0, 'USA'][i] }));
    w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 1, starts });
    return w;
  };
  const tame = (sh) => { sh.controller = null; sh.cmd.throttle = 0; for (const a of sh.aaMounts) a.ammo = 0; sh.cmd.main.fire = false; sh.cmd.sec.fire = false; return sh; };
  const w = arena('Japan');
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  tame(w.addShip('iowa', 1, af.layout.x + Math.cos(0.7) * 24000, af.layout.z + Math.sin(0.7) * 24000, 0));
  tame(w.addShip('fletcher', 0, af.layout.x - 20000, af.layout.z, 0));
  for (const b of w.bases) if (b.team === 1) for (const q of b.parked) if (q) q.svc = 1e9;
  w.start();
  let torp = 0, crashed = 0, airborne = 0; const loads = new Set();
  while (w.time < 900) {
    w.update(0.1); if (w.state === 'finished') { w.state = 'running'; w.finishT = 0; }
    for (const e of w.drainEvents()) { if (e.type === 'torpedoDrop') torp++; if (e.type === 'planeDown' && e.cause === 'crash' && e.plane.typeKey === 'g4m' && e.plane.phase === 'climb') crashed++; }
    for (const p of w.planes) if (p.base === af && p.typeKey === 'g4m') { if (p.loadout) loads.add(p.loadout.id); if (p.phase === 'cruise') airborne++; }
  }
  ok(crashed === 0 && airborne > 100, `the Bettys take off and climb away (${crashed} crashed at take-off, ${airborne} ticks in cruise)`);
  ok(loads.has('torp'), `against an armoured battleship they hang the torpedo (loads: ${[...loads].join(', ')})`);
  ok(torp >= 1, `and drop it: ${torp} torpedo drops`);
}
{
  const seed = 3, w = new World(seed); w.addTeam(0); w.addTeam(1);
  const sep = 12000, starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 1, starts });
  const afB = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 1), L = afB.layout;
  const cv = w.addShip('essex', 0, L.x - 30000, L.z + 2000, 0); cv.controller = null; cv.cmd.throttle = 0; cv.cmd.air.launch = true;
  const en = w.addShip('kagero', 1, L.x + 88000, L.z, 0); en.controller = null; en.cmd.throttle = 0;
  for (const b of w.bases) if (b.team === 0) for (const q of b.parked) if (q) q.svc = 1e9;
  w.start();
  const n0 = afB.groundPlanes().length; const ords = new Set(); let drops = 0, vsBase = 0;
  while (w.time < 1300) {
    w.update(0.1);
    for (const e of w.drainEvents()) if (e.type === 'bombDrop' && e.plane.owner === cv) { drops++; ords.add(e.bomb.ord.id); }
    for (const p of w.planes) if (p.owner === cv && p.kind === 'dive' && p.target && p.target.isBase) vsBase++;
  }
  ok(vsBase > 0 && drops >= 3, `with no ship in reach, the dive bombers of a carrier go for the enemy airfield (${drops} salvos)`);
  ok(ords.has('anm64'), `with 500 lb bombs (${[...ords].join(', ')})`);
  ok(afB.groundPlanes().length <= n0 - 4, `and wreck what is parked on its apron (${n0} aircraft -> ${afB.groundPlanes().length})`);
}

console.log(fail ? `${fail} FAILED` : 'ALL OK');
