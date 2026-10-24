// The ports and the supply of the ships: node test/ports.mjs — a theatre of war has two airfields, ports and batteries for every nation; a ship that is out of shells or battered is
// taken into a port, rearmed and repaired there at the pace of the yard, and put out to sea again; a port whose yard is destroyed serves slowly; a ship is not scuttled on the way.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { THEATRE } from '../js/game/data/theatre.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { theatreNations } from '../js/game/sim/theatre.js';
import { portsOf, findBerth, beginDocking, needsRepair, ammoMissing, serviceDone } from '../js/game/sim/ports.js';
import { damageModule, damageMount } from '../js/game/sim/modules.js';
import { damageBase } from '../js/game/sim/baseops.js';

const T0 = Date.now();
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m, `[${((Date.now() - T0) / 1000).toFixed(0)}s]`); if (!c) process.exitCode = 1; };

// ---- the map: every nation has its bases, whatever the seed ----
for (const seed of [1, 2, 3, 4, 5]) {
  const nations = theatreNations();
  const T = Terrain.generateTheatre(seed, THEATRE, { nations });
  let bad = [];
  for (const n of nations) {
    const mine = T.bases.filter((b) => b.nation === n.nation);
    const big = mine.filter((b) => b.kind === 'airfield' && b.size === 'large'), med = mine.filter((b) => b.kind === 'airfield' && b.size === 'medium');
    const ports = mine.filter((b) => b.kind === 'port'), bat = mine.filter((b) => b.kind === 'battery');
    if (big.length !== 1 || med.length !== 1) bad.push(`${n.nation}: airfields ${big.length} large ${med.length} medium`);
    if (!ports.length) bad.push(`${n.nation}: no port`);
    if (!bat.length) bad.push(`${n.nation}: no battery`);
    if (big[0] && med[0] && !(big[0].runway.len > med[0].runway.len * 1.4)) bad.push(`${n.nation}: the large runway is not longer`);
    for (const p of ports) {
      const head = T.heightAt(p.pier.x1, p.pier.z1), app = T.heightAt(p.approach.x, p.approach.z);
      if (!(head < -25 && app < -33)) bad.push(`${n.nation} port: the head of the pier is in ${head.toFixed(0)} m, the approach in ${app.toFixed(0)} m`);
      const deep = p.quay.sides.some((q) => q.depth.filter((d) => d.s > 250 && d.s < 460).every((d) => d.depth > 14));
      if (!deep) bad.push(`${n.nation} port: no berth for a battleship`);
    }
  }
  ok(bad.length === 0, `seed ${seed}: ${T.islands.length} islands, every nation has a large and a medium airfield, a port with deep water at the pier and a battery` + (bad.length ? ' — ' + bad.join('; ') : ''));
}

// ---- a ship comes in, is served and goes out ----
function harbour(seed = 5) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  w.terrain = Terrain.generateTheatre(seed, THEATRE, { nations: theatreNations() });
  const port = portsOf(w, 1).find((p) => p.nation === 'USA' && p.layout.size === 'large') || portsOf(w, 1)[0];
  return { w, port };
}
{
  const { w, port } = harbour();
  const A = port.layout.approach;
  const ship = w.addShip('iowa', 1, A.x, A.z, A.heading, { speed: 6, throttle: 0.3 });
  w.addShip('yamato', 0, -60000, 0, 0);
  for (const m of ship.mounts.slice(0, 4)) { m.ammo.AP = 0; m.ammo.HE = 0; m.noAmmo = true; }
  for (const m of ship.mounts.slice(4, 6)) damageMount(w, ship, m, 1e6, null, false);
  for (const m of ship.modules.filter((q) => q.kind === 'engine').slice(0, 2)) damageModule(w, ship, m, 1e6, null, 'shell');
  ship.holes.push({ i: 3, x: 0, y: -2, z: 0, rate: 0.01 }); ship.addFire(10, 4, 0, 1);
  const need0 = needsRepair(ship), ammo0 = ammoMissing(ship);
  ok(need0 > 0.15 && ammo0 > 0.05 && !serviceDone(ship), `a damaged ship needs the port (repair ${need0.toFixed(2)}, shells missing ${ammo0.toFixed(2)})`);
  const slot = findBerth(port, ship);
  ok(slot && slot.kind === 'quay' && slot.s > 280, `the big ship gets a place on the outer quay (${slot && slot.kind} at ${slot && slot.s})`);
  ok(beginDocking(w, ship, port), 'she is taken in');
  w.start();
  let moored = -1, released = -1;
  for (let t = 0; t < 4500; t += 0.5) {
    w.update(0.5);
    if (ship.dock && ship.dock.phase === 'moored' && moored < 0) moored = w.time;
    if (!ship.dock && moored > 0 && released < 0) { released = w.time; break; }
    if (ship.state !== 'afloat') break;
  }
  ok(moored > 0 && moored < 900, `she is alongside after ${moored.toFixed(0)} s`);
  ok(released > moored + 300, `she lies alongside ${(released - moored).toFixed(0)} s (the yard takes its time) and is put out`);
  ok(needsRepair(ship) < 0.04 && ammoMissing(ship) < 0.03, `out again whole and full (repair ${needsRepair(ship).toFixed(2)}, shells missing ${ammoMissing(ship).toFixed(2)})`);
  ok(ship.mounts.every((m) => m.alive) && ship.modules.every((m) => m.state < 2) && ship.holes.length === 0 && ship.fires.length === 0, 'every gun, every machinery room is back, no hole, no fire');
  ok(ship.state === 'afloat' && !ship.dock && Math.hypot(ship.x - A.x, ship.z - A.z) < 2500 && ship.speed > 1, 'she sails out to the approach and the captain has her back');
}

// ---- the captain: out of shells, a ship goes to the port, lets herself be served and is not scuttled ----
{
  const { w, port } = harbour(6);
  const A = port.layout.approach;
  const x0 = A.x + Math.sin(A.heading + Math.PI) * 9000, z0 = A.z - Math.cos(A.heading + Math.PI) * 9000;
  spawnFleet(w, 1, [{ id: 'iowa', count: 1 }, { id: 'fletcher', count: 1 }], x0, z0, A.heading);
  spawnFleet(w, 0, [{ id: 'yamato', count: 1 }], -60000, 0, 0);
  const iowa = w.ships.find((s) => s.stats.id === 'iowa');
  for (const m of iowa.mounts) { m.ammo.AP = 0; m.ammo.HE = 0; m.noAmmo = true; }
  w.start();
  let docked = -1, free = -1, mission = -1;
  for (let t = 0; t < 5000; t++) {
    w.update(1); w.drainEvents();
    if (iowa.mission && mission < 0) mission = w.time;
    if (iowa.dock && docked < 0) docked = w.time;
    if (docked > 0 && !iowa.dock && !iowa.mission) { free = w.time; break; }
    if (iowa.state !== 'afloat') break;
  }
  ok(iowa.state === 'afloat', `a ship with no shells is not scuttled on her way to a port (${iowa.state}, ${iowa.cause || ''})`);
  ok(mission > 0 && mission < 60 && docked > mission, `the captain sends her to the port (mission at ${mission.toFixed(0)} s, in port at ${docked.toFixed(0)} s)`);
  ok(free > docked && iowa.ammoLeft('main').frac > 0.97, `rearmed (${(iowa.ammoLeft('main').frac * 100).toFixed(0)} % of her main shells) and free at ${free.toFixed(0)} s`);
}

// ---- the yard: destroyed, it serves slowly or not at all ----
{
  const { w, port } = harbour(7);
  const f0 = port.serviceFrac;
  port.layout.parts.forEach((p, i) => { if (['warehouse', 'dockyard', 'crane', 'depot', 'tank'].includes(p.kind)) { port.partState[i] = 2; port.partHp[i] = 0; } });
  w.start(); w.update(0.1);
  ok(f0 > 0.95 && port.serviceFrac < 0.15 && portsOf(w, port.team).indexOf(port) < 0, `a port whose warehouses, cranes and workshops are gone no longer serves (${f0.toFixed(2)} -> ${port.serviceFrac.toFixed(2)})`);
}
