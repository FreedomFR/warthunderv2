// The scenes of the trailers (v0.0.1 and v0.1.0) (see js/trailer.js for the director and tools/trailer for the recorder).
// Each scene: build a battle, let it run until something worth filming happens, record shots.
import { clamp, lerp, D2R, KN } from './game/math.js';
import { mv, FPS } from './trailer.js';
import { magazineExplosion } from './game/sim/explosions.js';

/** world point `fwd` ahead of / `side` to starboard of a ship (heading only, no roll or pitch) at absolute height y */
const H = (s, fwd, side, y) => [s.x + Math.sin(s.heading) * fwd + Math.cos(s.heading) * side, y, s.z - Math.cos(s.heading) * fwd + Math.sin(s.heading) * side];
const P3 = (s, dy = 0) => [s.x, s.y + dy, s.z];

/** Free the ships from the AI: they sail straight at the given speed (a film set, no battle). */
function sail(ships, knots) {
  for (const s of ships) {
    s.controller = null;
    s.speed = knots * KN;
    s.cmd.throttle = clamp(knots / (s.stats.maxSpeed / KN), 0.05, 1);
    s.cmd.desiredHeading = null;
  }
}


/** Surface ships keep sailing and manoeuvring but hold their gunfire (an air attack scene without a naval battle around it). */
function quiet(ships) {
  for (const s of ships) {
    const c = s.controller;
    if (!c) continue;
    const orig = c.update.bind(c);
    c.update = (ship, w, dt) => { orig(ship, w, dt); ship.cmd.main.fire = false; ship.cmd.sec.fire = false; ship.cmd.torpedo.fire = false; };
  }
}

const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** exponential smoothing of a camera vector (state kept by the caller) */
const damp = (cur, want, k) => (cur ? cur.map((v, i) => v + (want[i] - v) * k) : want.slice());

/**
 * Camera behind and above a flying thing. get() returns the object ({x,y,z,vx,vy,vz}) or null (the last pose is then kept).
 */
function chaseCam(get, back, up, side, ahead, fov, rate = 14) {
  let pos = null, look = null, last = null;
  return (t, T) => {
    const o = get() || last;
    if (!o) return { p: [0, 50, 0], l: [0, 50, -100], fov };
    last = { x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz };
    const v = unit(o.vx, o.vy, o.vz), r = unit(-v[2], 0, v[0]);
    const k = 1 - Math.exp(-rate / FPS);
    pos = damp(pos, [o.x - v[0] * back + r[0] * side, Math.max(3, o.y - v[1] * back + up), o.z - v[2] * back + r[2] * side], k);
    look = damp(look, [o.x + v[0] * ahead, o.y + v[1] * ahead, o.z + v[2] * ahead], k);
    return { p: pos, l: look, fov };
  };
}

/** Camera behind and above a flying thing but looking at another point (the victim). */
function followCam(get, getLook, back, up, side, fov, rate = 12) {
  let pos = null, look = null, last = null;
  return () => {
    const o = get() || last;
    if (!o) return { p: [0, 50, 0], l: [0, 50, -100], fov };
    last = { x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz };
    const v = unit(o.vx, o.vy, o.vz), r = unit(-v[2], 0, v[0]), k = 1 - Math.exp(-rate / FPS);
    pos = damp(pos, [o.x - v[0] * back + r[0] * side, Math.max(3, o.y - v[1] * back + up), o.z - v[2] * back + r[2] * side], k);
    look = damp(look, getLook(), k);
    return { p: pos, l: look, fov };
  };
}

/** the first aircraft matching pred */
const findPlane = (T, pred) => T.w.planes.find(pred) || null;

/** A fleet action: two columns of five on opposite courses, shots from the air, from the water and on the enemy as the hits land. */
async function fleetBattle(T, tag, seed, look, blue, red) {
  T.reset(seed, look, { clouds: 0.3, veil: 0.25 });
  const us = T.fleet(0, blue.map((id) => ({ id })), -1500, -1400, 90, { knots: 20, spread: 1 });
  const en = T.fleet(1, red.map((id) => ({ id })), 1500, 1400, 270, { knots: 20, spread: 1 });
  T.go();
  const lead = us.find((x) => x.stats.id === blue[0]), foe = en.find((x) => x.stats.id === red[0]);
  await T.until(() => T.count('impact') > 10 && lead.mounts.some((m) => m.group === 'main' && m.alive && m.flash > 0.3), { max: 420, dt: 1 / 10 });
  T.log(tag + ' engaged', T.now.toFixed(0), 'range', dist2(lead, foe).toFixed(0));
  const mid = () => [(lead.x + foe.x) / 2, 0, (lead.z + foe.z) / 2];
  // A: the whole action from above, the two columns firing across the water
  await T.shot(tag + '_a', 2.6, mv.orbit(() => P3(lead, 20), 150, 190, 760, 600, 260, 200, 10, 50));
  // B: low alongside the leader, the broadside
  await T.until(() => lead.mounts.some((m) => m.group === 'main' && m.alive && m.aimOk && m.fireT < 0.2), { max: 60, dt: 1 / 12 });
  await T.shot(tag + '_b', 2.6, mv.orbit(() => P3(lead, 8), 128, 168, 210, 175, 20, 30, 14, 50));
  // C: the enemy leader under fire
  await T.until(() => T.count('impact') > 24, { max: 90, dt: 1 / 12 });
  await T.shot(tag + '_c', 2.6, (t) => {
    const e = unit(foe.x - lead.x, 0, foe.z - lead.z), n = [-e[2], 0, e[0]];
    return { p: [foe.x - e[0] * 560 + n[0] * 90, 8, foe.z - e[2] * 560 + n[2] * 90], l: [foe.x, foe.y + 18, foe.z], fov: lerp(28, 22, t / 2.6) };
  });
  // D: the destroyers at speed
  const dd = us.find((x) => x.stats.id === blue[blue.length - 1]);
  await T.shot(tag + '_d', 2.4, mv.orbit(() => P3(dd, 6), 40, 100, 150, 110, 9, 12, 6, 52));
}

export const SCENES = {
  // ---- opening: an allied column steaming into the dawn ---------------------------------------------------------------------
  async open(T) {
    T.reset(5, 'dawn');
    const ships = T.column(['iowa', 'kgv', 'baltimore', 'belfast', 'essex', 'fletcher', 'tribal'], 0, 0, 0, 90, 520, 19);
    sail(ships, 19);
    T.go();
    await T.wait(24);
    const [iowa, kgv, , belfast] = ships;
    // A: low and far, the column crossing the glittering path of the sun
    await T.shot('open_a', 3.8, (t, T) => {
      const u = mv.ease(t / T.dur), c = P3(iowa, 0);
      return { p: [c[0] + lerp(150, 90, u), 3.0, c[2] + lerp(560, 500, u)], l: [c[0] - lerp(0, 40, u), 22, c[2]], fov: lerp(26, 30, u) };
    });
    // B: the bow of the lead ship cutting the water
    await T.shot('open_b', 2.2, (t, T) => {
      const u = t / T.dur;
      return { p: H(iowa, lerp(75, 55, u), lerp(34, 44, u), 4.2), l: H(iowa, lerp(40, 60, u), 0, 8), fov: 52 };
    });
    // C: Admiralty camouflage, low across the water
    await T.shot('open_c', 2.4, (t, T) => {
      const u = t / T.dur;
      return { p: H(belfast, lerp(-60, 10, u), lerp(120, 95, u), 3.2), l: H(belfast, lerp(0, 25, u), 0, 12), fov: 38 };
    });
  },

  // ---- roster: one ship of each flavour, slow orbits ----------------------------------------------------------------------
  async roster(T) {
    // a higher sun than the other scenes, and cameras three-quarter to it: the hull paint and the relief of the plating show
    T.reset(9, 'afternoon', { sunElev: 25, sunAzim: -35, exposure: 1.12, haze: 2.5, veil: 0.22, contrast: 1.12, warmth: -0.05, bloom: 0.08 });
    const ids = ['yamato', 'bismarck', 'littorio', 'richelieu', 'shokaku', 'zara', 'cleveland', 'tribal'];
    const ships = T.column(ids, 0, 0, 0, 90, 900, 9);
    sail(ships, 9);
    T.go();
    await T.wait(20);
    const spec = [
      ['yamato', 1.5, [28, 66], [13, 11], 11], ['bismarck', 1.5, [-8, 34], [9, 11], 9], ['littorio', 1.5, [82, 44], [8, 7], 7],
      ['shokaku', 1.5, [-24, 20], [32, 38], 8],
    ];
    for (const [id, dur, az, h, look] of spec) {
      const s = ships[ids.indexOf(id)], L = s.stats.L;
      await T.shot('roster_' + id, dur, mv.orbit(() => P3(s), az[0], az[1], L * 0.82, L * 0.7, h[0], h[1], look, 46));
    }
  },

  // ---- roster 2: the cruisers and destroyers that were re-measured on their plans (0.1.0) -------------------------------------------
  async roster2(T) {
    T.reset(9, 'afternoon', { sunElev: 25, sunAzim: -35, exposure: 1.12, haze: 2.5, veil: 0.22, contrast: 1.12, warmth: -0.05, bloom: 0.08 });
    const ids = ['takao', 'zara', 'baltimore', 'belfast', 'tribal', 'fantasque'];
    const ships = T.column(ids, 0, 0, 0, 90, 700, 9);
    sail(ships, 9);
    T.go();
    await T.wait(20);
    const spec = [
      ['takao', 1.2, [30, 70], [10, 9], 9], ['zara', 1.2, [-14, 26], [9, 10], 8], ['baltimore', 1.2, [74, 36], [9, 8], 8],
      ['belfast', 1.2, [-30, 8], [8, 9], 8], ['tribal', 1.2, [60, 100], [7, 8], 6], ['fantasque', 1.2, [-6, 34], [7, 8], 6],
    ];
    for (const [id, dur, az, h, look] of spec) {
      const s = ships[ids.indexOf(id)], L = s.stats.L;
      await T.shot('roster2_' + id, dur, mv.orbit(() => P3(s), az[0], az[1], L * 0.9, L * 0.8, h[0], h[1], look, 46));
    }
  },

  // ---- roster 3: the battleships, carriers and heavy cruisers (0.1.0) -------------------------------------------------------------
  async roster3(T) {
    T.reset(9, 'afternoon', { sunElev: 25, sunAzim: -35, exposure: 1.12, haze: 2.5, veil: 0.22, contrast: 1.12, warmth: -0.05, bloom: 0.08 });
    const ids = ['iowa', 'essex', 'kgv', 'graf_zeppelin', 'richelieu', 'admiral_hipper', 'kagero', 'soldati'];
    const ships = T.column(ids, 0, 0, 0, 90, 900, 9);
    sail(ships, 9);
    T.go();
    await T.wait(20);
    const spec = [
      ['iowa', 0.9, [60, 100], [10, 9], 10], ['essex', 0.9, [-20, 20], [26, 30], 8], ['kgv', 0.9, [-30, 10], [9, 10], 9],
      ['graf_zeppelin', 0.9, [70, 40], [30, 26], 8], ['richelieu', 0.9, [-8, 36], [9, 10], 9], ['admiral_hipper', 0.9, [88, 52], [8, 9], 8],
      ['kagero', 0.9, [-14, 24], [6, 7], 5], ['soldati', 0.9, [66, 104], [6, 7], 5],
    ];
    for (const [id, dur, az, h, look] of spec) {
      const s = ships[ids.indexOf(id)], L = s.stats.L;
      await T.shot('roster3_' + id, dur, mv.orbit(() => P3(s), az[0], az[1], L * 0.95, L * 0.8, h[0], h[1], look, 46));
    }
  },

  // ---- fleet battles: two columns of five trade fire (Atlantic, Mediterranean) ------------------------------------------------------
  async fleets(T) { await fleetBattle(T, 'fleets', 61, 'afternoon', ['kgv', 'norfolk', 'belfast', 'tribal', 'tribal'], ['bismarck', 'admiral_hipper', 'koenigsberg', 'type1936a_mob', 'type1936a_mob']); },
  async med(T) { await fleetBattle(T, 'med', 74, 'morning', ['richelieu', 'algerie', 'la_galissoniere', 'fantasque', 'fantasque'], ['littorio', 'zara', 'montecuccoli', 'soldati', 'soldati']); },

  // ---- carrier: the deck, the take-off, the strike forming up ---------------------------------------------------------
  async carrier(T) {
    T.reset(21, 'morning');
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'cleveland' }, { id: 'fletcher', count: 2 }], -2200, 0, 90, { knots: 22 });
    const jpc = T.fleet(1, [{ id: 'takao' }, { id: 'kagero', count: 2 }], 5200, 200, 270, { knots: 14 });
    quiet(us); quiet(jpc);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex');
    const ok = await T.until(() => T.w.planes.some((p) => p.owner === essex && p.phase === 'queue'), { max: 120 });
    T.log('carrier launch', ok, T.now.toFixed(0));
    await T.until(() => T.w.planes.some((p) => p.owner === essex && p.phase === 'takeoff'), { max: 30, dt: 1 / 12 });
    // B: chase the first aircraft off the bow
    let first = null;
    const airborne = () => (first = (first && T.w.planes.includes(first) ? first : findPlane(T, (p) => p.owner === essex && p.phase === 'cruise')) || first);
    await T.until(() => !!airborne(), { max: 30, dt: 1 / 12 });
    await T.shot('carrier_b', 3.6, chaseCam(airborne, 26, 7, 9, 40, 46));
  },

  // ---- deck: the lifts, the wings, the engines starting, the take-off run, the circuit, the touchdown and the wire, the way down ----------
  async deck(T) {
    T.reset(21, 'morning');
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'cleveland' }, { id: 'fletcher', count: 2 }], -2200, 0, 90, { knots: 22 });
    const jpc = T.fleet(1, [{ id: 'takao' }, { id: 'kagero', count: 2 }], 7000, 200, 270, { knots: 14 });
    quiet(us); quiet(jpc);
    T.go();
    const ship = us.find((s) => s.stats.id === 'essex'), dp = ship.model.deckPoints, fdY = ship.model.fdY;
    const startX = dp.x1 - 135;
    const at = (lx, ly, lz) => ship.toWorld(lx, ship.y + 0 + ly, lz, [0, 0, 0]);
    const lx = (p) => ship.toLocal(p.x, p.y, p.z, [0, 0, 0])[0];
    const mine = (f) => T.w.planes.find((p) => p.owner === ship && f(p));
    // the camera rides with the ship: (forward, height above the water, starboard)
    const rig = (from, to, fov, ft = null) => () => ({ p: at(from[0], from[1], from[2]), l: typeof to === 'function' ? to() : at(to[0], to[1], to[2]), fov });
    const onP = (p, dy = 0) => () => [p.x, p.y + dy, p.z];

    // ---- the lift brings the first aircraft up, its wings spread, the engine starts ----
    await T.until(() => mine((p) => p.ds === 'lower'), { max: 200, dt: 1 / 12 });
    const lift = mine((p) => p.ds === 'lower').lift;
    T.log('deck: first lift at', lift.x.toFixed(0), 'launch at', T.now.toFixed(0));
    await T.shot('deck_lift', 11.5, rig([lift.x - 17, fdY + 7.5, lift.z - 22], [lift.x, fdY + 1.5, lift.z], 40));
    await T.shot('deck_lift_b', 6, (t) => ({ p: at(lift.x + 20 - t * 1.2, fdY + 3.2, lift.z + 15), l: at(lift.x - 3, fdY + 2.2, lift.z), fov: 32 }));
    // ---- the taxi and the queue ----
    await T.shot('deck_taxi', 8, rig([startX - 70, fdY + 8, -26], [startX - 30, fdY + 2, 0], 42));
    // ---- the run ----
    await T.until(() => mine((p) => p.phase === 'takeoff'), { max: 90, dt: 1 / 12 });
    await T.shot('deck_run', 6.5, rig([startX + 38, fdY + 9, -(dp.hw + 24)], () => { const p = mine((q) => q.phase === 'takeoff'); return p ? [p.x, p.y + 1, p.z] : at(startX + 20, fdY + 2, 0); }, 36));
    // ---- the strike goes; it is called back at once, so that it lands again ----
    await T.until(() => ship.air.wave > 0 && T.w.planes.filter((p) => p.owner === ship && p.wave && p.phase === 'cruise').length >= 6 && !T.w.planes.some((p) => p.owner === ship && (p.phase === 'queue' || p.phase === 'takeoff')), { max: 200, dt: 1 / 12 });
    for (const p of T.w.planes) if (p.owner === ship && p.wave) { p.wave.aborted = true; p.wave.assessed = true; p.phase = 'return'; }
    T.log('deck: wave called back at', T.now.toFixed(0));
    let lander = null;
    const behind = (p) => p.tdX - lx(p);
    await T.until(() => (lander = mine((p) => p.phase === 'pattern' && p.leg === 2)), { max: 400, dt: 1 / 12 });
    T.log('deck: circuit turn at', T.now.toFixed(0), 'plane', lander.id);
    await T.shot('deck_circuit', 6, rig([dp.x0 + 20, fdY + 14, -(dp.hw + 6)], () => [lander.x, lander.y, lander.z], 28));
    await T.until(() => lander.phase === 'final' && behind(lander) < 330, { max: 200, dt: 1 / 12 });
    await T.shot('deck_final', 8.5, chaseCam(() => lander, 34, 8, 10, 60, 40, 10));
    T.log('deck: after final, phase', lander.phase, lander.ds, 'behind', behind(lander).toFixed(0));
    await T.until(() => lander.phase === 'rollout' || lander.phase === 'waveoff', { max: 30, dt: 1 / 12 });
    T.log('deck: touchdown?', lander.phase, 'at', T.now.toFixed(1));
    await T.shot('deck_trap', 9, rig([dp.x0 + 70, fdY + 6, -(dp.hw + 12)], () => [lander.x, lander.y + 1.5, lander.z], 34));
    await T.until(() => lander.phase === 'taxiIn' || !T.w.planes.includes(lander), { max: 30, dt: 1 / 12 });
    if (T.w.planes.includes(lander)) await T.shot('deck_down', 16, chaseCam(() => lander, 22, 7, 14, 6, 44, 6));
    T.log('deck: done at', T.now.toFixed(0), 'ready', ship.air.ready);
  },

  // ---- dive: dive bombers on a cruiser -----------------------------------------------------------------------------------
  async dive(T) {
    T.reset(33, 'noon', { clouds: 0.22, veil: 0.2 });
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'fletcher', count: 2 }], -4700, 0, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'agano' }, { id: 'kagero', count: 2 }], 1500, 150, 270, { knots: 16 });
    quiet(us); quiet(jp);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex');
    // The real strikes attacked from 1500-2000 m after a climb of several minutes. Seen from the sea that is a speck in the sky:
    // the film lets the dive bombers fly their approach at 880 m, and skips the climb out of the camera's sight.
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
    const lead = findPlane(T, incoming), victim = lead && lead.target;
    T.log('dive approach', !!lead, T.now.toFixed(0), lead && lead.y.toFixed(0));
    if (!lead || !victim) return;
    lead.hp = lead.maxHp = 1e9;          // the flak would otherwise decide what the camera gets to see
    await T.until(() => lead.phase === 'rollin' || lead.phase === 'dive' || !T.w.planes.includes(lead), { max: 30, dt: 1 / 12 });
    const hd = unit(lead.vx, 0, lead.vz);
    // A: behind the aircraft as it rolls over and falls onto the ship, the flak bursting around
    await T.shot('dive_a', 3.4, followCam(() => (T.w.planes.includes(lead) ? lead : null), () => [victim.x, victim.y + 8, victim.z], 34, 9, 9, 50, 16));
    // B: the bomb on the hull. Staged like the torpedo of the next scene: released two seconds above the ship, on the dive line, with the
    // speed of a bomb dropped from a 60 degree dive (the real hit model: armour, fuze delay, fire, magazines)
    const tf = 2.0, vh = 58, vv = -112, y0 = victim.y + 12 - (vv * tf - 4.905 * tf * tf);
    const aimX = victim.x + Math.sin(victim.heading) * victim.speed * tf, aimZ = victim.z - Math.cos(victim.heading) * victim.speed * tf;
    T.w.bombs.push({ id: 900000, owner: lead.owner, team: lead.team, kg: lead.spec.bombKg || 454, x: aimX - hd[0] * vh * tf, y: y0, z: aimZ - hd[2] * vh * tf, vx: hd[0] * vh, vy: vv, vz: hd[2] * vh, age: 0, mesh: 'bomb500', target: victim, plane: lead });
    lead.ordnance = false;
    // camera on the side the bomb comes from, abeam of the impact
    const starboard = [Math.cos(victim.heading), Math.sin(victim.heading)], sgn = hd[0] * starboard[0] + hd[2] * starboard[1] > 0 ? -1 : 1;
    const camB = [aimX + starboard[0] * 150 * sgn, 14, aimZ + starboard[1] * 150 * sgn];
    await T.shot('dive_b', 3.4, () => ({ p: camB, l: [aimX, 38, aimZ], fov: 55 }));
  },

  // ---- torpedo: low level torpedo attack, then the hit seen from the water ----------------------------------------------
  async torp(T) {
    T.reset(44, 'afternoon');
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'fletcher', count: 2 }], -2600, 0, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'agano' }, { id: 'kagero', count: 2 }], 1200, 100, 270, { knots: 15 });
    quiet(us); quiet(jp);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex');
    const runner = (p) => p.owner === essex && p.kind === 'torp' && p.phase === 'run' && p.target && dist2(p, p.target) < 1250;
    await T.until(() => T.w.planes.some(runner), { max: 420, dt: 1 / 8 });
    const tp = findPlane(T, runner);
    T.log('torp run', !!tp, T.now.toFixed(0));
    if (!tp) return;
    // A: right behind the torpedo bomber, wave tops rushing past, the drop
    await T.shot('torp_a', 2.8, chaseCam(() => (T.w.planes.includes(tp) ? tp : null), 20, 3.0, 5, 70, 52));
    // B: a torpedo hits a cruiser: staged sixty metres from the hull, the camera on its wake (the real hit model: flooding, list, water column)
    const victim = tp.target.alive ? tp.target : jp.find((s) => s.alive);
    const hdg = victim.heading, side = [Math.cos(hdg), Math.sin(hdg)], fwd = [Math.sin(hdg), -Math.cos(hdg)];
    const off = victim.stats.B / 2 + 62, tHit = 62 / 21.5;
    // aimed with the lead the victim's own speed calls for, a little forward of the middle of the ship
    const lead = victim.speed * tHit + victim.stats.L * 0.08;
    const src = [victim.x + side[0] * off, victim.z + side[1] * off];
    const dir = unit(victim.x + fwd[0] * lead - src[0], 0, victim.z + fwd[1] * lead - src[1]);
    T.w.spawnTorpedo({ owner: essex, x: src[0], z: src[1], vx: dir[0] * 21.5, vz: dir[2] * 21.5, speed: 21.5, range: 800, warhead: 300, team: 0 });
    T.w.torpedoes[T.w.torpedoes.length - 1].travel = 100;       // already armed
    T.log('torp staged', off.toFixed(0), tHit.toFixed(1), victim.stats.id);
    const cam = [src[0] - dir[0] * 46, 3.2, src[1] - dir[2] * 46];
    await T.wait(1.1);        // the first moments of the run are not filmed
    await T.shot('torp_b', 3.6, (t, T) => ({ p: cam, l: [victim.x + fwd[0] * (victim.stats.L * 0.06), 11, victim.z + fwd[1] * (victim.stats.L * 0.06)], fov: 38 }));
  },

  // ---- duel: broadsides ------------------------------------------------------------------------------------------------------
  async duel(T) {
    T.reset(52, 'afternoon');
    // two columns passing each other, 4.3 km apart
    const us = T.fleet(0, [{ id: 'iowa' }, { id: 'baltimore' }, { id: 'fletcher' }], -1700, -2150, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'yamato' }, { id: 'takao' }, { id: 'kagero' }], 1700, 2150, 270, { knots: 20 });
    T.go();
    const iowa = us.find((s) => s.stats.id === 'iowa'), yamato = jp.find((s) => s.stats.id === 'yamato');
    const mains = () => iowa.mounts.filter((m) => m.group === 'main' && m.alive);
    await T.until(() => mains().some((m) => m.aimOk && m.reload < 0.7), { max: 260, dt: 1 / 10 });
    T.log('duel salvo', T.now.toFixed(0), 'range', dist2(iowa, yamato).toFixed(0));
    const dirE = () => unit(yamato.x - iowa.x, 0, yamato.z - iowa.z);         // towards the enemy
    const turret = mains().find((m) => m.rec.x > 0) || mains()[0];
    // A: across the deck from the quiet side, the turrets train and fire
    await T.shot('duel_a', 2.4, (t, T) => {
      const e = dirE(), f = [Math.sin(iowa.heading), 0, -Math.cos(iowa.heading)];
      const base = H(iowa, turret.rec.x * 0.4 - 25, 0, iowa.y);
      return { p: [base[0] - e[0] * 78 + f[0] * 30, iowa.y + 17, base[2] - e[2] * 78 + f[2] * 30], l: H(iowa, turret.rec.x + 8, 0, iowa.y + 12), fov: 50 };
    });
    // B: the enemy receives it: Yamato from the water, splashes and hits
    await T.until(() => T.count('impact') > 1, { max: 60, dt: 1 / 12 });
    await T.shot('duel_b', 2.0, (t) => {
      const e = unit(yamato.x - iowa.x, 0, yamato.z - iowa.z), n = [-e[2], 0, e[0]];
      return { p: [yamato.x - e[0] * 520 + n[0] * 70, 7, yamato.z - e[2] * 520 + n[2] * 70], l: [yamato.x, yamato.y + 18, yamato.z], fov: lerp(27, 21, t / 2) };
    });
    // C: Yamato answers
    await T.until(() => yamato.mounts.some((m) => m.group === 'main' && m.alive && m.flash > 0.4), { max: 120, dt: 1 / 10 });
    await T.shot('duel_c', 2.0, mv.orbit(() => P3(yamato, 18), 150, 118, 380, 330, 22, 26, 20, 46));
  },

  // ---- boom: a cruiser loses her magazines ----------------------------------------------------------------------------------
  async boom(T) {
    T.reset(61, 'dusk');
    const us = T.fleet(0, [{ id: 'iowa' }, { id: 'baltimore' }], -2300, -100, 90, { knots: 18 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'kagero' }], 1900, 100, 270, { knots: 16 });
    T.go();
    const takao = jp.find((s) => s.stats.id === 'takao');
    await T.until(() => takao.fires.length >= 2 || takao.hpFrac < 0.55, { max: 420, dt: 1 / 8 });
    T.log('boom setup', T.now.toFixed(0), takao.hpFrac.toFixed(2), takao.fires.length);
    let blew = false;
    const trigger = () => {
      if (blew || !takao.alive) return;
      blew = true;
      const mag = takao.modules.find((m) => m.kind === 'magazine' && m.x > 0) || takao.modules.find((m) => m.kind === 'magazine');
      const where = [0, 0, 0];
      takao.toWorld(mag ? mag.x : 0, mag ? mag.y : -2, mag ? mag.z : 0, where);
      magazineExplosion(T.w, takao, us[0], where, mag);
    };
    await T.shot('boom_a', 2.6, (t, T) => {
      if (t > 1.2) trigger();
      const u = t / T.dur;
      return mv.orbit(() => P3(takao, 14), 215, 232, 330, 300, 20, 24, 14, 44, (x) => x)(t, T);
    });
    await T.shot('boom_b', 3.4, (t, T) => mv.orbit(() => P3(takao, 10), 232, 258, 440, 500, 14, 34, 16, 46)(t, T));
  },

  // ---- gunfire: a development scene for the muzzle blast (compared with photographs of broadsides) ---------------------------------
  async firetest(T, shipId) {
    T.reset(77, 'noon', { clouds: 0.2, veil: 0.2 });
    const us = T.fleet(0, [{ id: shipId || new URLSearchParams(location.search).get('ship') || 'iowa' }], 0, 0, 90, { knots: 12 });
    const jp = T.fleet(1, [{ id: 'yamato' }], 2500, -7500, 90, { knots: 12 });
    T.go();
    const ship = us[0];
    // ?mount=A|B|C films that turret only (by default the first one ready to fire); ?group=sec films the secondary battery
    const qs = new URLSearchParams(location.search), only = qs.get('mount'), grp = qs.get('group') || 'main';
    const mains = () => ship.mounts.filter((m) => m.group === grp && m.alive && (!only || m.rec.label === only));
    await T.until(() => mains().some((m) => m.aimOk && m.fireT < 0.05), { max: 400, dt: 1 / 60 });
    const m = mains().find((q) => q.fireT < 0.05) || mains()[0];
    const w = [0, 0, 0];
    ship.toWorld(m.rec.x, m.rec.y, m.rec.z, w);
    const t0 = T.now;
    T.log('firetest salvo', m.rec.label, 'elev', (m.elev * 57.3).toFixed(1), 'train', (m.trainRel * 57.3).toFixed(0), 'at', t0.toFixed(1));
    const side = [0, 0, -1];      // the enemy lies to the north (-z)
    if (grp === 'sec') {
      // a secondary mount: closer, from above and outboard on its own side
      const sd = m.rec.z < 0 ? -1 : 1;
      await T.shot('fire_air', 2.4, () => ({ p: mv.at(ship, m.rec.x + 12, m.rec.y + 18, m.rec.z + sd * 26), l: mv.at(ship, m.rec.x - 2, m.rec.y + 1.5, m.rec.z + sd * 5), fov: 50 }));
    } else await T.shot('fire_air', 2.4, () => {
      const q = [0, 0, 0]; ship.toWorld(m.rec.x, m.rec.y, m.rec.z, q);
      return { p: [q[0] + 18, q[1] + 78, q[2] + 74], l: [q[0] - 8, q[1] + 6, q[2] - 26], fov: 50 };
    });
    // the second salvo from the forecastle, looking back at the turret (as in the photograph of Iowa firing in 1952)
    await T.until(() => mains().some((q) => q.aimOk && q.fireT < 0.05), { max: 400, dt: 1 / 60 });
    const m2 = mains().find((q) => q.fireT < 0.05) || mains()[0];
    if (!m2) return;   // the mount was lost meanwhile
    if (grp === 'sec') {
      const side = m2.rec.z < 0 ? -1 : 1;
      await T.shot('fire_deck', 2.4, () => ({ p: mv.at(ship, m2.rec.x - 14, m2.rec.y + 2.5, m2.rec.z + side * 18), l: mv.at(ship, m2.rec.x + 3, m2.rec.y + 1.5, m2.rec.z + side * 4), fov: 50 }));
    } else if (ship.spec.type === 'CV' || m2.rec.x < 20) {
      // the flight deck or the superstructure hides the forecastle view: look at the mount from outboard on its own side, abaft its beam
      const side = m2.rec.z < 0 ? -1 : 1;
      await T.shot('fire_deck', 2.4, () => ({ p: mv.at(ship, m2.rec.x - 26, m2.rec.y + 4, m2.rec.z + side * 42), l: mv.at(ship, m2.rec.x + 3, m2.rec.y + 3, m2.rec.z + side * 4), fov: 48 }));
    } else {
      await T.shot('fire_deck', 2.4, () => ({ p: mv.at(ship, m2.rec.x + 46, m2.rec.y + 2.5, 3), l: mv.at(ship, m2.rec.x + 10, m2.rec.y + 3.5, -22), fov: 58 }));
    }
  },

  // ---- hittest: a development scene for the shell hits (?ship=iowa&gun=iowa&type=AP|HE&angle=0..85&part=hull|deck|super|mount) ---------------------------------------
  async hittest(T) {
    const qs = new URLSearchParams(location.search), id = qs.get('ship') || 'iowa', gunId = qs.get('gun') || id, type = qs.get('type') || 'AP';
    const angle = Number(qs.get('angle') || 0) * D2R, part = qs.get('part') || 'hull', R = Number(qs.get('range') || 700);
    T.reset(41, 'afternoon', { clouds: 0.25, veil: 0.15 });
    const tg = T.fleet(1, [{ id }], 0, 0, 0, { knots: 0 })[0];
    const sh = T.fleet(0, [{ id: gunId }], 6000, 6000, 270, { knots: 0 })[0];
    T.go();
    sail([tg, sh], 0);
    tg.speed = 0; tg.vx = tg.vz = 0;
    await T.wait(4);
    // the point to hit, in the target's local axes: the waterline belt of the starboard side, the deck, or the front of the superstructure
    const L = tg.stats.L, B = tg.stats.B;
    const pts = { hull: [L * 0.05, 1.5, B / 2 - 0.2], deck: [L * 0.2, tg.model.hull.deckY(L * 0.2) - 0.1, 0], super: [(tg.model.superBox?.x1 ?? L * 0.1) - 1, 8, 0], mount: [0, 0, 0] };
    const lp = pts[part] || pts.hull;
    if (part === 'mount') { const m = tg.mounts.find((q) => q.group === 'main' && q.rec.x > 0) || tg.mounts[0]; lp[0] = m.rec.x; lp[1] = m.rec.y + 1.2; lp[2] = m.rec.z + B * 0.0; }
    const w0 = [0, 0, 0]; tg.toWorld(lp[0], lp[1], lp[2], w0);
    // the line of flight: for the hull a horizontal approach from starboard turned `angle` away from the normal; for the deck, a dive
    const hd = tg.heading, side = [Math.cos(hd), Math.sin(hd)];            // starboard, in (x, z)
    const fwd = [Math.sin(hd), -Math.cos(hd)];
    let dir;
    if (part === 'deck') dir = [Math.sin(angle) * fwd[0], -Math.cos(angle), Math.sin(angle) * fwd[1]];
    else dir = [-Math.cos(angle) * side[0] + Math.sin(angle) * fwd[0], -0.02, -Math.cos(angle) * side[1] + Math.sin(angle) * fwd[1]];
    const dl = Math.hypot(...dir); dir = dir.map((v) => v / dl);
    const gun = sh.stats.main, g = gun, v0 = g.v0 * 0.8;
    const shell = { owner: sh, gun: g, type, c: 0, x: w0[0] - dir[0] * R, y: w0[1] - dir[1] * R, z: w0[2] - dir[2] * R, vx: dir[0] * v0, vy: dir[1] * v0 + 4.905 * (R / v0), vz: dir[2] * v0, target: tg, group: 'main' };      // vy makes up for the drop
    T.w.spawnShell(shell);
    T.log('hittest', id, type, 'angle', (angle / D2R).toFixed(0), 'part', part, 'range', R);
    const camAt = [w0[0] + side[0] * 55 - fwd[0] * 18, Math.max(w0[1] + 14, 6), w0[2] + side[1] * 55 - fwd[1] * 18];
    await T.shot('flight', 0.9, followCam(() => (T.w.shells.includes(shell) ? shell : null), () => [w0[0] - dir[0] * 40, w0[1] - dir[1] * 40, w0[2] - dir[2] * 40], 22, 3, 6, 40, 12));
    await T.shot('hit', 3.2, (t) => ({ p: camAt, l: [w0[0], w0[1] + 1.5, w0[2]], fov: 46 }));
  },

  // ---- strike: a development scene for the strike formations (a wave in formation, then the attack) ------------------------------------------------------
  async strike(T) {
    T.reset(23, 'morning', { clouds: 0.3 });
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'cleveland' }, { id: 'fletcher', count: 2 }], -9000, 0, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'agano' }, { id: 'kagero', count: 2 }], 9000, 100, 270, { knots: 14 });
    quiet(us); quiet(jp);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex');
    await T.until(() => T.w.planes.some((p) => p.owner === essex && p.wave.launched >= p.wave.n), { max: 300, dt: 1 / 8 });
    const wave = T.w.planes.find((p) => p.owner === essex).wave;
    await T.wait(28);
    const leaders = () => wave.sections.map((q) => q.members.find((m) => !m.dying && !m.gone && m.phase !== 'queue' && m.phase !== 'takeoff')).filter(Boolean);
    const centre = () => { const l = leaders(); if (!l.length) return [0, 600, 0]; return [l.reduce((a, m) => a + m.x, 0) / l.length, l.reduce((a, m) => a + m.y, 0) / l.length, l.reduce((a, m) => a + m.z, 0) / l.length]; };
    // A: a section in formation, from the side and a little above
    const sideCam = (k, d) => (t) => { const l = leaders()[k]; if (!l) return { p: [0, 50, 0], l: [0, 50, -100], fov: 50 }; const h = l.heading; return { p: [l.x + Math.cos(h) * d - Math.sin(h) * 30, l.y + d * 0.28, l.z + Math.sin(h) * d + Math.cos(h) * 30], l: [l.x - Math.sin(h) * 25, l.y - 5, l.z + Math.cos(h) * 25], fov: 48 }; };
    await T.shot('form_a', 3.0, sideCam(0, 150));
    // B: close behind the leader of the first section
    await T.shot('form_b', 3.0, (t) => { const l = leaders()[0]; if (!l) return { p: [0, 50, 0], l: [0, 50, -100], fov: 50 }; return { p: [l.x - Math.sin(l.heading) * 90 + Math.cos(l.heading) * 25, l.y + 18, l.z + Math.cos(l.heading) * 90 + Math.sin(l.heading) * 25], l: [l.x + Math.sin(l.heading) * 40, l.y, l.z - Math.cos(l.heading) * 40], fov: 55 }; });
    // C: the torpedo sections coming in, seen from the target
    const tgt = jp[0];
    await T.until(() => T.w.planes.some((p) => p.wave === wave && p.phase === 'run'), { max: 240, dt: 1 / 12 });
    await T.shot('torp_a', 4.0, (t) => ({ p: [tgt.x + 380, 22, tgt.z - 120], l: [tgt.x - 2300, 30, tgt.z + 300], fov: 55 }));
  },

  // ---- sinktest: a development scene for the ways of sinking (?ship=cleveland&mode=roll|bow|stern|level|burn|blast|split) ------------------------------
  async sinktest(T) {
    const qs = new URLSearchParams(location.search), id = qs.get('ship') || 'cleveland', mode = qs.get('mode') || 'roll', secs = Number(qs.get('secs')) || 30;
    T.reset(31, 'afternoon', { clouds: 0.25, veil: 0.2 });
    const us = T.fleet(0, [{ id }], 0, 0, 90, { knots: 10 });
    T.fleet(1, [{ id: 'iowa' }], 6000, 6000, 270, { knots: 10 });
    T.go();
    const ship = us[0];
    await T.wait(8);
    sail([ship], 8);
    if (mode === 'split') { ship.destroy(null, 'structure'); ship.sinkMode = 'split'; T.w.breakInTwo(ship, 0); }
    else { ship.destroy(null, 'shell'); ship.sinkMode = mode; ship.sinkStyle = mode; if (mode === 'burn') { ship.burnT = 25; for (let i = 0; i < 4; i++) ship.addFire((i - 1.5) * ship.stats.L * 0.18, 4, 0, 1.3); } }
    const L = ship.stats.L;
    await T.shot('sink', secs, mv.orbit(() => P3(ship, 4), 60, 150, L * 1.35, L * 1.1, 20, 26, 6, 46));
  },

  // ---- end plate: the column against the setting sun ------------------------------------------------------------------------
  async end(T) {
    T.reset(72, 'dusk');
    const ships = T.column(['yamato', 'iowa', 'kgv', 'essex', 'baltimore', 'belfast'], 0, 0, 0, 270, 560, 16);
    sail(ships, 16);
    T.go();
    await T.wait(26);
    // the lead battleship against the low sun: silhouette and rim light on the plating
    await T.shot('end_a', 4.2, (t, T) => {
      const u = mv.ease(t / T.dur), c = P3(ships[1], 0), b = 11 * D2R, r = lerp(760, 700, u);
      return { p: [c[0] - Math.sin(b) * r, lerp(3.0, 4.5, u), c[2] + Math.cos(b) * r], l: [c[0] + lerp(12, -12, u), 21, c[2]], fov: lerp(23, 26, u) };
    });
  },
};

// one gunfire scene per ship for the 0.1.0 trailer: fire_<id>/fire_air and fire_deck
for (const id of ['takao', 'baltimore', 'zara', 'fletcher']) SCENES['fire_' + id] = (T) => SCENES.firetest(T, id);
