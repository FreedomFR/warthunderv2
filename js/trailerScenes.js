// The scenes of the v0.0.1 trailer (see js/trailer.js for the director and tools/trailer for the recorder).
// Each scene: build a battle, let it run until something worth filming happens, record shots.
import { clamp, lerp, D2R, KN } from './game/math.js';
import { mv } from './trailer.js';
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
    const k = 1 - Math.exp(-rate / 24);
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
    const v = unit(o.vx, o.vy, o.vz), r = unit(-v[2], 0, v[0]), k = 1 - Math.exp(-rate / 24);
    pos = damp(pos, [o.x - v[0] * back + r[0] * side, Math.max(3, o.y - v[1] * back + up), o.z - v[2] * back + r[2] * side], k);
    look = damp(look, getLook(), k);
    return { p: pos, l: look, fov };
  };
}

/** the first aircraft matching pred */
const findPlane = (T, pred) => T.w.planes.find(pred) || null;

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
    await T.shot('open_a', 4.5, (t, T) => {
      const u = mv.ease(t / T.dur), c = P3(iowa, 0);
      return { p: [c[0] + lerp(150, 90, u), 3.0, c[2] + lerp(560, 500, u)], l: [c[0] - lerp(0, 40, u), 22, c[2]], fov: lerp(26, 30, u) };
    });
    // B: the bow of the lead ship cutting the water
    await T.shot('open_b', 3, (t, T) => {
      const u = t / T.dur;
      return { p: H(iowa, lerp(75, 55, u), lerp(34, 44, u), 4.2), l: H(iowa, lerp(40, 60, u), 0, 8), fov: 52 };
    });
    // C: Admiralty camouflage, low across the water
    await T.shot('open_c', 3, (t, T) => {
      const u = t / T.dur;
      return { p: H(belfast, lerp(-60, 10, u), lerp(120, 95, u), 3.2), l: H(belfast, lerp(0, 25, u), 0, 12), fov: 38 };
    });
  },

  // ---- roster: one ship of each flavour, slow orbits ----------------------------------------------------------------------
  async roster(T) {
    T.reset(9, 'afternoon');
    const ids = ['yamato', 'bismarck', 'littorio', 'richelieu', 'shokaku', 'zara', 'cleveland', 'tribal'];
    const ships = T.column(ids, 0, 0, 0, 90, 900, 9);
    sail(ships, 9);
    T.go();
    await T.wait(20);
    const spec = [
      ['yamato', 2.0, [215, 150], [16, 14], 11], ['bismarck', 2.0, [20, 70], [10, 12], 9], ['littorio', 2.0, [150, 120], [8, 7], 7],
      ['shokaku', 2.0, [330, 285], [9, 9], 10],
    ];
    for (const [id, dur, az, h, look] of spec) {
      const s = ships[ids.indexOf(id)], L = s.stats.L;
      await T.shot('roster_' + id, dur, mv.orbit(() => P3(s), az[0], az[1], L * 0.95, L * 0.85, h[0], h[1], look, 46));
    }
  },

  // ---- carrier: the deck, the take-off, the strike forming up ---------------------------------------------------------
  async carrier(T) {
    T.reset(21, 'morning');
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'cleveland' }, { id: 'fletcher', count: 2 }], -2200, 0, 90, { knots: 22 });
    const jpc = T.fleet(1, [{ id: 'takao' }, { id: 'kagero', count: 2 }], 5200, 200, 270, { knots: 14 });
    quiet(us); quiet(jpc);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex'), dp = essex.model.deckPoints;
    const ok = await T.until(() => T.w.planes.some((p) => p.owner === essex && p.phase === 'queue'), { max: 120 });
    T.log('carrier launch', ok, T.now.toFixed(0));
    // the plane nearest to the bow among those on deck
    const leadPlane = () => T.w.planes.filter((p) => p.owner === essex && (p.phase === 'takeoff' || p.phase === 'queue')).sort((a, b) => b.lx - a.lx)[0] || null;
    await T.until(() => T.w.planes.some((p) => p.owner === essex && p.phase === 'takeoff'), { max: 30, dt: 1 / 12 });
    // A: from the bow, looking back along the deck, the aircraft thunder towards the camera
    let lastLead = null;
    await T.shot('carrier_a', 4.5, (t) => {
      const c = mv.at(essex, dp.x1 - 38, essex.model.fdY + 1.3, dp.hw * 0.55);
      lastLead = leadPlane() || lastLead;
      const p = lastLead;
      return { p: c, l: p ? [p.x, p.y + 1.6, p.z] : mv.at(essex, dp.x0 + 60, essex.model.fdY + 2, 0), fov: 46 };
    });
    // B: chase the first aircraft off the bow
    let first = null;
    const airborne = () => (first = (first && T.w.planes.includes(first) ? first : findPlane(T, (p) => p.owner === essex && p.phase === 'cruise')) || first);
    await T.until(() => !!airborne(), { max: 30, dt: 1 / 12 });
    await T.shot('carrier_b', 4, chaseCam(airborne, 26, 7, 9, 40, 46));
    // C: the strike climbing away, seen from the carrier's quarter
    await T.shot('carrier_c', 3.5, mv.orbit(() => P3(essex, 12), 140, 175, 330, 300, 40, 55, 28, 48));
  },

  // ---- dive: dive bombers on a cruiser -----------------------------------------------------------------------------------
  async dive(T) {
    T.reset(33, 'noon', { clouds: 0.22, veil: 0.2 });
    const us = T.fleet(0, [{ id: 'essex' }, { id: 'fletcher', count: 2 }], -4700, 0, 90, { knots: 20 });
    const jp = T.fleet(1, [{ id: 'takao' }, { id: 'agano' }, { id: 'kagero', count: 2 }], 1500, 150, 270, { knots: 16 });
    quiet(us); quiet(jp);
    T.go();
    const essex = us.find((s) => s.stats.id === 'essex');
    // the strike, high above the sea, a few kilometres from its target
    const incoming = (p) => p.owner === essex && p.kind === 'dive' && p.phase === 'cruise' && !p.dying && p.target && p.y > 900 && dist2(p, p.target) < 2600;
    await T.until(() => T.w.planes.some(incoming), { max: 500, dt: 1 / 8 });
    const lead = findPlane(T, incoming), victim = lead && lead.target;
    T.log('dive approach', !!lead, T.now.toFixed(0), lead && lead.y.toFixed(0));
    if (!lead || !victim) return;
    // A: alongside the formation, high above the clouds and the sea
    await T.shot('dive_a', 2.6, (t) => {
      const v = unit(lead.vx, 0, lead.vz), r = [-v[2], 0, v[0]];
      return { p: [lead.x + r[0] * 105 - v[0] * 55, lead.y - 14, lead.z + r[2] * 105 - v[2] * 55], l: [lead.x + v[0] * 20, lead.y, lead.z + v[2] * 20], fov: 40 };
    });
    // B: behind the aircraft as it falls onto the ship (the last seconds of the dive, up to the release)
    await T.until(() => !T.w.planes.includes(lead) || (lead.phase === 'dive' && lead.y < 950), { max: 90, dt: 1 / 12 });
    const chase = followCam(() => (T.w.planes.includes(lead) ? lead : null), () => [victim.x, victim.y + 8, victim.z], 40, 11, 8, 46, 16);
    await T.shot('dive_b', 3.4, chase);
    // C: with the bomb: down the dive line to the hull, then the camera lets go as the bomb bursts
    let lastB = null, hitAt = null;
    await T.shot('dive_c', 3.6, (t) => {
      const b = T.w.bombs.find((q) => q.plane === lead) || null;
      if (b) {
        lastB = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
        const v = unit(b.vx, b.vy, b.vz), r = unit(-v[2], 0, v[0]);
        return { p: [b.x - v[0] * 48 + r[0] * 7, Math.max(4, b.y - v[1] * 48 + 6), b.z - v[2] * 48 + r[2] * 7], l: [b.x + v[0] * 60, Math.max(2, b.y + v[1] * 60), b.z + v[2] * 60], fov: 50 };
      }
      if (!lastB) return { p: H(victim, 20, 150, victim.y + 40), l: P3(victim, 10), fov: 40 };
      if (hitAt == null) hitAt = t;
      const v = unit(lastB.vx, lastB.vy, lastB.vz), r = unit(-v[2], 0, v[0]), k = t - hitAt;
      return { p: [lastB.x - v[0] * (70 + 22 * k) + r[0] * (20 + 10 * k), Math.max(4, lastB.y + 26 + 6 * k), lastB.z - v[2] * (70 + 22 * k) + r[2] * (20 + 10 * k)], l: [lastB.x, lastB.y + 6, lastB.z], fov: 46 };
    });
    // D: the victim afterwards
    await T.shot('dive_d', 2.5, mv.orbit(() => P3(victim, 10), 220, 245, 260, 230, 22, 30, 12, 46));
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
    await T.shot('torp_a', 4.6, chaseCam(() => (T.w.planes.includes(tp) ? tp : null), 20, 3.0, 5, 70, 52));
    // B: a torpedo hits a cruiser: staged a few hundred metres from the hull (the real hit model: flooding, list, water column)
    const victim = tp.target.alive ? tp.target : jp.find((s) => s.alive);
    const hdg = victim.heading, side = [Math.cos(hdg), Math.sin(hdg)], fwd = [Math.sin(hdg), -Math.cos(hdg)];
    const off = victim.stats.B / 2 + 190;
    const src = [victim.x + side[0] * off - fwd[0] * 10, victim.z + side[1] * off - fwd[1] * 10];
    const dir = unit(victim.x - src[0], 0, victim.z - src[1]);
    T.w.spawnTorpedo({ owner: essex, x: src[0], z: src[1], vx: dir[0] * 21.5, vz: dir[2] * 21.5, speed: 21.5, range: 800, warhead: 300, team: 0 });
    T.w.torpedoes[T.w.torpedoes.length - 1].travel = 100;       // already armed
    await T.wait(1.6);
    await T.shot('torp_b', 5, (t, T) => {
      const e = T.ev.last.impact, hit = e && e.kind === 'torpedo';
      const cx = victim.x + side[0] * (off - 70) + fwd[0] * 40, cz = victim.z + side[1] * (off - 70) + fwd[1] * 40;
      return { p: [cx, 8, cz], l: [victim.x + fwd[0] * 5, hit ? 12 : 6, victim.z + fwd[1] * 5], fov: 48 };
    });
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
    await T.shot('duel_a', 3.2, (t, T) => {
      const e = dirE(), f = [Math.sin(iowa.heading), 0, -Math.cos(iowa.heading)];
      const base = H(iowa, turret.rec.x * 0.4 - 25, 0, iowa.y);
      return { p: [base[0] - e[0] * 78 + f[0] * 30, iowa.y + 17, base[2] - e[2] * 78 + f[2] * 30], l: H(iowa, turret.rec.x + 8, 0, iowa.y + 12), fov: 50 };
    });
    // B: the enemy receives it: Yamato from the water, splashes and hits
    await T.until(() => T.count('impact') > 1, { max: 60, dt: 1 / 12 });
    await T.shot('duel_b', 3, (t) => {
      const e = unit(yamato.x - iowa.x, 0, yamato.z - iowa.z), n = [-e[2], 0, e[0]];
      return { p: [yamato.x - e[0] * 780 + n[0] * 90, 9, yamato.z - e[2] * 780 + n[2] * 90], l: [yamato.x, yamato.y + 16, yamato.z], fov: lerp(30, 24, t / 3) };
    });
    // C: Yamato answers
    await T.until(() => yamato.mounts.some((m) => m.group === 'main' && m.alive && m.flash > 0.4), { max: 120, dt: 1 / 10 });
    await T.shot('duel_c', 3, mv.orbit(() => P3(yamato, 18), 150, 118, 380, 330, 22, 26, 20, 46));
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
    await T.shot('boom_a', 3.2, (t, T) => {
      if (t > 1.8) trigger();
      const u = t / T.dur;
      return mv.orbit(() => P3(takao, 14), 215, 232, 330, 300, 20, 24, 14, 44, (x) => x)(t, T);
    });
    await T.shot('boom_b', 7, (t, T) => mv.orbit(() => P3(takao, 10), 232, 258, 440, 500, 14, 34, 16, 46)(t, T));
  },

  // ---- end plate: the column against the setting sun ------------------------------------------------------------------------
  async end(T) {
    T.reset(72, 'dusk');
    const ships = T.column(['yamato', 'iowa', 'kgv', 'essex', 'baltimore', 'belfast'], 0, 0, 0, 270, 560, 16);
    sail(ships, 16);
    T.go();
    await T.wait(26);
    await T.shot('end_a', 5, (t, T) => {
      const u = mv.ease(t / T.dur), c = P3(ships[1], 16);
      return { p: [c[0] - 140 + lerp(0, 90, u), lerp(4, 11, u), c[2] - lerp(520, 640, u)], l: [c[0] - 200, 22, c[2] + 60], fov: lerp(30, 36, u) };
    });
  },
};
