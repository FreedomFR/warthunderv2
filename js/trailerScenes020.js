// The scenes added for the v0.2.0 trailer (see js/trailerScenes.js for the older ones and js/trailer.js for the director):
// islands and forests, shells on the hillside, the shell camera, the cockpit, capsizing.
import { lerp, D2R } from './game/math.js';
import { mv, FPS } from './trailer.js';
import { Terrain } from './game/sim/terrain.js';
import { P3, sail, quiet, unit, dist2, chaseCam, findPlane } from './trailerScenes.js';
import { ManualController } from './game/sim/controllers/manual.js';

/** The islands of `seed` for a scene (the start of the fleets kept clear), with their ground and their forests on the screen. */
function setIslands(T, seed, density = 2, keep = [{ x: 0, z: 0, r: 1800 }], radius = 9000) {
  const w = T.w;
  w.terrain = Terrain.generate(seed, density, keep, null, radius);
  T.g.islandVisuals.set(w.terrain);
  T.g.vegetation.set(w.terrain);
  return w.terrain;
}

/** The shore of an island seen from its middle, along the direction (dx, dz): [x, z] of the first point of the water. */
function shore(T, isl, dx, dz) {
  let r = 0;
  while (T.w.terrain.heightAt(isl.x + dx * r, isl.z + dz * r) > 0 && r < 12000) r += 8;
  return [isl.x + dx * r, isl.z + dz * r, r];
}

/** heading in degrees (0 = north, 90 = east) of a direction */
const hdgOf = (dx, dz) => Math.atan2(dx, -dz) / D2R;

export const SCENES_020 = {
  // ---- isles: a column passes along a green island: from the air, from the water, from the beach --------------------------------------------
  async isles(T) {
    const qs = new URLSearchParams(location.search);
    T.reset(11, 'morning', { clouds: 0.3, veil: 0.22 });
    const terr = setIslands(T, Number(qs.get('iseed')) || 2);
    const isl = terr.islands.filter((i) => i.kind === 'large').sort((a, b) => b.top - a.top)[0];
    const v = unit(-isl.x, 0, -isl.z), t = [-v[2], 0, v[0]];          // v: from the island towards the middle of the sea, t: along the shore
    const s0 = shore(T, isl, v[0], v[2]);
    const route = [s0[0] + v[0] * 520, s0[1] + v[2] * 520];
    const ships = T.column(['iowa', 'baltimore', 'fletcher', 'fletcher'], 0, route[0] - t[0] * 1700, route[1] - t[2] * 1700, hdgOf(t[0], t[2]), 380, 21);
    sail(ships, 21);
    T.log('isles: depth', [0, 200, 400, 600, 800, 1000].map((d) => Math.round(T.w.terrain.heightAt(s0[0] + v[0] * d, s0[1] + v[2] * d))).join(' '), 'm at 0 200 400 600 800 1000 m from the shore');
    T.log('isles: island', isl.kind, isl.biome, 'top', isl.top.toFixed(0), 'shore at', s0[2].toFixed(0), 'route', route.map(Math.round).join(','));
    T.go();
    await T.wait(Number(qs.get('pre')) || 40);
    const lead = ships[0], mid = ships[1];
    // A: from the air, along the shore: the column below, the forest and the surf beyond it
    await T.shot('isles_a', 4.2, (u, T) => {
      const k = mv.ease(u / T.dur), c = P3(mid, 0), back = lerp(520, -160, k);
      return { p: [c[0] + v[0] * lerp(300, 190, k) - t[0] * back, lerp(95, 62, k), c[2] + v[2] * lerp(300, 190, k) - t[2] * back], l: [c[0] - v[0] * 330 - t[0] * lerp(0, -80, k), 30, c[2] - v[2] * 330 - t[2] * lerp(0, -80, k)], fov: 56 };
    });
    // B: low on the water, the leader in front of the green slopes
    await T.shot('isles_b', 3.6, (u, T) => {
      const k = u / T.dur, c = P3(lead, 0);
      return { p: [c[0] + v[0] * 200 + t[0] * lerp(170, -60, k), 4.5, c[2] + v[2] * 200 + t[2] * lerp(170, -60, k)], l: [c[0] - v[0] * 60 + t[0] * 22, 17, c[2] - v[2] * 60 + t[2] * 22], fov: 44 };
    });
    // C: over the canopy towards the sea: the trees, the surf, then the column comes into view beyond the shore
    await T.shot('isles_c', 3.2, (u, T) => {
      const k = mv.ease(u / T.dur), back = lerp(240, 0, k);
      const x = s0[0] - v[0] * back, z = s0[1] - v[2] * back, c = P3(mid, 0);
      return { p: [x, Math.max(T.w.terrain.heightAt(x, z), 0) + lerp(34, 12, k), z], l: [c[0], 12, c[2]], fov: lerp(52, 40, k) };
    });
  },

  // ---- isle_fire: a battleship shells the hillside: the blast from the deck, then the bursts on the slope ----------------------------------------
  async isle_fire(T) {
    T.reset(13, 'afternoon', { clouds: 0.3, veil: 0.25 });
    const terr = setIslands(T, 2);
    const isl = terr.islands.filter((i) => i.kind === 'large').sort((a, b) => b.top - a.top)[0];
    const v = unit(-isl.x, 0, -isl.z), t = [-v[2], 0, v[0]];
    const s0 = shore(T, isl, v[0], v[2]);
    const route = [s0[0] + v[0] * 1500, s0[1] + v[2] * 1500];
    const us = T.fleet(0, [{ id: 'iowa' }, { id: 'fletcher' }], route[0] - t[0] * 900, route[1] - t[2] * 900, hdgOf(t[0], t[2]), { knots: 14 });
    const jp = T.fleet(1, [{ id: 'yamato' }], 2500, -9000, 90, { knots: 10 });
    quiet(jp);
    const iowa = us[0];
    // the guns really fire (the muzzle blast, the splashes by the beach); the rule of the line of fire does not let a flat trajectory end on a slope,
    // so the bursts on the hillside are shells thrown there with the ballistics of the gun (the real ground impact and its effects)
    const sea = [s0[0] + v[0] * 120, s0[1] + v[2] * 120];
    const input = { up: false, down: false, left: false, right: false, aim: { x: sea[0], z: sea[1] }, lockedTarget: null, fireMain: true, fireSec: false, fireTorpedo: false, launchAir: false };
    iowa.controller = new ManualController(input);
    T.go();
    const mains = () => iowa.mounts.filter((m) => m.group === 'main' && m.alive);
    const slope = (k) => { const x = s0[0] - v[0] * (380 + 90 * (k % 3)) + t[0] * (k - 3) * 55, z = s0[1] - v[2] * (380 + 90 * (k % 3)) + t[2] * (k - 3) * 55; return [x, T.w.terrain.heightAt(x, z), z]; };
    const lob = (m, k, left) => {
      const from = [0, 0, 0]; iowa.toWorld(m.rec.x, m.rec.y + 3, m.rec.z, from);
      const to = slope(k), dx = to[0] - from[0], dz = to[2] - from[2], D = Math.hypot(dx, dz), v0 = m.gun.v0, g = 9.81;
      let lo = 0, hi = 0.6;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (from[1] + D * Math.tan(mid) - g * D * D / (2 * v0 * v0 * Math.cos(mid) ** 2) < to[1]) lo = mid; else hi = mid; }
      const th = (lo + hi) / 2, vh = v0 * Math.cos(th), vy0 = v0 * Math.sin(th), tof = D / vh, tau = left == null ? 0 : Math.max(0, tof - left);
      const ux = dx / D, uz = dz / D;
      T.w.spawnShell({ owner: iowa, gun: m.gun, type: 'HE', c: 0, x: from[0] + ux * vh * tau, y: from[1] + vy0 * tau - g * tau * tau / 2, z: from[2] + uz * vh * tau, vx: ux * vh, vy: vy0 - g * tau, vz: uz * vh, target: null, aimX: to[0], aimZ: to[2], group: 'main' });
    };
    await T.until(() => mains().some((m) => m.aimOk && m.fireT < 0.2), { max: 200, dt: 1 / 20 });
    await T.until(() => mains().some((m) => m.flash > 0.3), { max: 60, dt: 1 / 60 });
    mains().forEach((m, i) => lob(m, i));
    // A: from the sea side, the ship in the foreground, the barrels flaring towards the slope behind it
    await T.shot('isle_fire_a', 3.4, (u, T) => { const k = u / T.dur, d = lerp(130, 85, k); return { p: [iowa.x + v[0] * d + t[0] * 45, 15, iowa.z + v[2] * d + t[2] * 45], l: [iowa.x - v[0] * 20, 26, iowa.z - v[2] * 20], fov: 40 }; });
    // B: over the hillside, a second salvo about to arrive
    const mid = slope(3);
    mains().forEach((m, i) => lob(m, i + 1, 1.5));
    const camB = [mid[0] + v[0] * 380 + t[0] * 170, mid[1] + 75, mid[2] + v[2] * 380 + t[2] * 170];
    await T.shot('isle_fire_b', 3.6, () => ({ p: camB, l: [mid[0], mid[1] + 14, mid[2]], fov: 48 }));
    T.log('isle_fire: land impacts', T.count('landImpact'));
  },

  // ---- shellcam: an armour-piercing shell followed from the gun to the ship it hits ----------------------------------------------------------------
  async shellcam(T) {
    T.reset(52, 'afternoon', { clouds: 0.3, veil: 0.2 });
    const us = T.fleet(0, [{ id: 'iowa' }, { id: 'baltimore' }], -1500, 0, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'yamato' }, { id: 'takao' }], 1100, 150, 270, { knots: 18 });
    T.go();
    const iowa = us[0];
    const mine = () => T.w.shells.find((q) => q.owner === iowa && q.gun.cal >= 400 && q.age < 0.5 && q.type === 'AP');
    await T.until(() => !!mine(), { max: 400, dt: 1 / 30 });
    const sh = mine();
    if (!sh) return;
    await T.until(() => sh.age > 0.14 || !T.w.shells.includes(sh), { max: 5, dt: 1 / 60 });
    const foe = jp.slice().sort((a, b) => dist2(a, sh) - dist2(b, sh))[0];
    T.log('shellcam: shell', sh.type, 'range', dist2(sh, foe).toFixed(0));
    const live = () => (T.w.shells.includes(sh) ? sh : null);
    await T.shot('shellcam_a', 2.4, chaseCam(live, 14, 2.4, 2.5, 60, 48, 20));
    await T.until(() => !live() || dist2(sh, foe) < 1000, { max: 30, dt: 1 / 60 });
    const side = [Math.cos(foe.heading), Math.sin(foe.heading)];
    await T.shot('shellcam_b', 3.0, (u, T) => ({ p: [foe.x + side[0] * 160, 9, foe.z + side[1] * 160], l: [foe.x, foe.y + 14, foe.z], fov: 42 }));
  },

  // ---- cockpit: the pilot's seat of a dive bomber taking off, then in the dive ----------------------------------------------------------------------
  async cockpit(T) {
    T.reset(33, 'noon', { clouds: 0.22, veil: 0.2 });
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'fletcher', count: 2 }], -4700, 0, 90, { knots: 22 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'agano' }, { id: 'kagero', count: 2 }], 1500, 150, 270, { knots: 16 });
    quiet(us); quiet(jp);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex'), cam = T.g.camera;
    const view = (p, fov = 78) => {
      cam.plane = p; cam.planeCam.view = 'cockpit'; cam.planeCam.fix = null; cam.planeCam.look.yaw = 0; cam.planeCam.look.pitch = 0; cam.smooth.init = false;
      cam.mode = 'cockpit'; cam.fovWant = fov * D2R;
      return () => {
        const r = cam.computePlane('cockpit', 1 / FPS);
        if (!r) return { p: [p.x, p.y + 2, p.z], l: [p.x + 10, p.y + 2, p.z], fov };
        const cp = Math.cos(r.pitch);
        return { p: [r.x, r.y, r.z], l: [r.x + Math.sin(r.yaw) * cp * 100, r.y + Math.sin(r.pitch) * 100, r.z - Math.cos(r.yaw) * cp * 100], fov, roll: r.roll || 0 };
      };
    };
    // take-off: the run along the flight deck
    const ok = await T.until(() => T.w.planes.some((p) => p.owner === essex && p.phase === 'takeoff' && p.kind === 'dive'), { max: 300, dt: 1 / 12 });
    const pilot = T.w.planes.find((p) => p.owner === essex && p.phase === 'takeoff' && p.kind === 'dive') || T.w.planes.find((p) => p.owner === essex && p.phase === 'takeoff');
    T.log('cockpit: takeoff', ok, !!pilot, pilot && pilot.typeKey);
    if (!pilot) return;
    const f1 = view(pilot);
    await T.shot('cockpit_a', 4.0, () => f1());
    // the dive on the cruiser (the climb out of sight is skipped, as in the dive scene)
    const ALT = 880;
    const incoming = (p) => p.owner === essex && p.kind === 'dive' && p.phase === 'cruise' && !p.dying && p.target && dist2(p, p.target) < 1080;
    await T.until(() => {
      for (const p of T.w.planes) {
        if (p.owner !== essex || p.kind !== 'dive' || p.phase !== 'cruise') continue;
        p.cruiseAlt = ALT;
        if (!p.skipped && dist2(p, essex) > 900) { p.skipped = true; p.y = ALT; }
      }
      return T.w.planes.some(incoming);
    }, { max: 500, dt: 1 / 8 });
    const lead = findPlane(T, incoming);
    if (!lead) return;
    lead.invulnerable = true;
    await T.until(() => lead.phase === 'rollin' || lead.phase === 'dive' || !T.w.planes.includes(lead), { max: 30, dt: 1 / 12 });
    const f2 = view(lead);
    await T.shot('cockpit_b', 5.0, () => f2());
  },

  // ---- capsize: a cruiser that has taken in too much water rolls over -----------------------------------------------------------------------------
  async capsize(T) {
    T.reset(31, 'afternoon', { clouds: 0.25, veil: 0.2 });
    const us = T.fleet(0, [{ id: 'cleveland' }], 0, 0, 90, { knots: 10 });
    T.fleet(1, [{ id: 'iowa' }], 6000, 6000, 270, { knots: 10 });
    T.go();
    const ship = us[0];
    await T.wait(6);
    sail([ship], 8);
    ship.destroy(null, 'flood'); ship.sinkMode = 'roll'; ship.sinkStyle = 'roll';
    ship.addFire(ship.stats.L * 0.1, 4, 0, 1.2, false); ship.addFire(-ship.stats.L * 0.15, 4, 2, 1.0, false);
    await T.wait(9);
    const L = ship.stats.L;
    await T.shot('capsize_a', 5.0, mv.orbit(() => P3(ship, 2), 75, 140, L * 1.45, L * 1.2, 20, 24, 3, 46));
  },

  // ---- split: a battleship broken in two by an explosion ------------------------------------------------------------------------------------------
  async split(T) {
    T.reset(32, 'dusk', { clouds: 0.3, veil: 0.25 });
    const us = T.fleet(0, [{ id: 'bismarck' }], 0, 0, 90, { knots: 10 });
    T.fleet(1, [{ id: 'iowa' }], 6000, 6000, 270, { knots: 10 });
    T.go();
    const ship = us[0];
    await T.wait(6);
    sail([ship], 8);
    ship.destroy(null, 'structure'); ship.sinkMode = 'split'; T.w.breakInTwo(ship, 0);
    await T.wait(1.0);
    const L = ship.stats.L;
    await T.shot('split_a', 4.0, mv.orbit(() => P3(ship, 4), 40, 110, L * 1.3, L * 1.1, 30, 22, 8, 46));
  },
};
