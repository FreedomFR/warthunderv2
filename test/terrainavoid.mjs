// The pilots and the mountains: node test/terrainavoid.mjs — an aircraft that is flying at a mountain it cannot climb over turns away from it, one that can climb does, and over the sea nothing changes.
import { Terrain } from '../js/game/sim/terrain.js';
import { avoidTerrain, ditchHeading } from '../js/game/sim/terrainavoid.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
// an island of a cone 500 m high and 1.5 km across, 2.2 km north of the origin (north is -z)
const isl = { x: 0, z: -2200, R: 1500, heightAt: (x, z) => Math.max(-30, 500 * (1 - Math.hypot(x, z + 2200) / 1500)) };
const T = new Terrain([isl]);
const world = { terrain: T, time: 10 };
const plane = (o) => ({ x: 0, y: 150, z: 0, speed: 75, heading: 0, ...o });
const pf = { roc: 7 };      // a torpedo bomber: 7 m/s of climb, a gradient of a tenth at 75 m/s

let p = plane({});
let r = avoidTerrain(world, p, 0, 0, pf);
ok(Math.abs(r.hdg) > 0.25, `a torpedo bomber at 150 m aiming at a 500 m peak turns away (${(r.hdg * 57.3).toFixed(0)} degrees off)`);
p = plane({ y: 150 }); world.time += 1;
r = avoidTerrain(world, p, Math.PI, 0, pf);
ok(r.hdg === Math.PI && r.gam === 0, 'with the island astern it flies on as it wished');
p = plane({ y: 700 }); world.time += 1;
r = avoidTerrain(world, p, 0, 0, pf);
ok(r.hdg === 0 && r.gam === 0, 'at 700 m it passes over the peak');
p = plane({ y: 420, speed: 80 }); world.time += 1;
r = avoidTerrain(world, p, 0, 0, { roc: 15 });
ok(r.hdg === 0 && r.gam > 0.03, `a fighter 100 m under the summit, a long way off, climbs over it (${r.gam.toFixed(2)} rad)`);
p = plane({ y: 150, x: 30000, z: 30000 }); world.time += 1;
r = avoidTerrain(world, p, 0.4, 0.02, pf);
ok(r.hdg === 0.4 && r.gam === 0.02, 'over the open sea nothing changes');
// the heading of a ditching aircraft: the open sea ahead, not the island
p = plane({ y: 60 }); world.time += 1;
const h = ditchHeading(world, p);
ok(Math.abs(h) > 0.25, `an aircraft coming down in the water with the island ahead turns off it (${(h * 57.3).toFixed(0)} degrees)`);
