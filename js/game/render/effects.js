// Visual effects driven by simulation events and ship state: muzzle flashes, shell splashes,
// impacts, fires, funnel smoke, sinking, anti-aircraft fire and wakes (foam stamps).
import { clamp, D2R } from '../math.js';
import { K } from './particles.js';
import { DECK_PHASES } from '../sim/deck.js';

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

/**
 * Foam stamps of a moving ship: bow wave, foam along the hull sides, propeller wash and the diverging
 * wake arms (a fan of stripes behind the stern). s needs x, z, heading, speed, state and stats.{L,B,maxSpeed}.
 */
export function addWakeStamps(foam, s, d, forceSpeed) {
  const st = s.stats;
  const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
  const speedF = forceSpeed ?? Math.min(1, Math.abs(s.speed) / Math.max(1, st.maxSpeed));
  const L = st.L, B = st.B;
  const sf = s.state === 'sinking' ? 0.5 : speedF;
  if (!(sf > 0.04 || s.state === 'sinking')) return;
  const bowX = s.x + fx * L * 0.46, bowZ = s.z + fz * L * 0.46;
  const sternX = s.x - fx * L * 0.46, sternZ = s.z - fz * L * 0.46;
  const rx = -fz, rz = fx;
  // bow wave
  foam.add(bowX, bowZ, bowX - fx * L * 0.14, bowZ - fz * L * 0.14, B * 0.62, 0.35 * sf, 0.7 * sf, 0.55 * sf);
  // hull sides
  for (const sg of [-1, 1]) {
    const o = sg * B * 0.5;
    foam.add(bowX - fx * L * 0.1 + rx * o, bowZ - fz * L * 0.1 + rz * o, sternX + rx * o, sternZ + rz * o, 2.4, 0.38 * sf, 0.35 * sf, 0.2 * sf);
  }
  // propeller wash: a turbulent core, then a longer fading trail (kept below full cover so the foam texture shows)
  foam.add(sternX, sternZ, sternX - fx * L * 0.22, sternZ - fz * L * 0.22, B * 0.36, 0.6 * sf, 0.28 * sf, 0.12 * sf);
  foam.add(sternX - fx * L * 0.2, sternZ - fz * L * 0.2, sternX - fx * L * 1.4, sternZ - fz * L * 1.4, B * 0.3, 0.45 * sf, 0, 0);
  // diverging wake arms
  if (d < 700) for (let k = 1; k <= 4; k++) {
    const back = L * (0.5 + 0.8 * k), lat = back * 0.3;
    for (const sg of [-1, 1]) foam.add(s.x - fx * back + rx * lat * sg, s.z - fz * back + rz * lat * sg, s.x - fx * back + rx * lat * sg - fx * 8, s.z - fz * back + rz * lat * sg - fz * 8, 3 + 2 * k, 0.62 * sf / (0.5 + 0.5 * k), 0, 0);
  }
}

export class Effects {
  constructor(engine, particles, game) {
    this.engine = engine; this.p = particles; this.game = game;
    this.emitScale = 1;
    this.shake = 0;
    this._v = [0, 0, 0];
    this.rings = [];          // expanding shock waves on the water
    this.timers = [];         // delayed effects (the cap of a smoke column)
    this.acc = { planeSmoke: new Map() };
  }

  distToCam(x, z) {
    const c = this.engine.cam;
    return Math.hypot(x - c.x, z - c.z);
  }

  addShake(amount, x, z) {
    const d = this.distToCam(x, z);
    this.shake = Math.min(1.6, this.shake + amount / (1 + d / 250));
  }

  // ---- events -------------------------------------------------------------------------------------------
  process(events) {
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': this.muzzle(e); break;
        case 'splash': this.splash(e); break;
        case 'impact': this.impact(e); break;
        case 'explosion': this.explosion(e); break;
        case 'torpedoLaunch': this.torpedoLaunch(e); break;
        case 'aaFire': this.aaFire(e); break;
        case 'mgFire': this.mgFire(e); break;
        case 'flak': this.flak(e); break;
        case 'planeHit': this.planeHit(e); break;
        case 'planeDown': this.planeDown(e); break;
        case 'planeBreakup': this.planeBreakup(e); break;
        case 'planeCrash': this.planeCrash(e); break;
        case 'planeDitch': this.planeDitch(e); break;
        case 'planeTouchdown': this.touchdown(e); break;
        case 'wireCatch': this.wireCatch(e); break;
        case 'torpedoEntry': this.torpedoEntry(e); break;
        case 'wakeStamp': this.engine.foam.add(e.x, e.z, e.x - e.vx * 0.1, e.z - e.vz * 0.1, 5, 0.3, 0.8, 0.5); break;
        case 'collision': this.collision(e); break;
        case 'mountKilled': this.mountKilled(e); break;
        case 'moduleKilled': this.moduleKilled(e); break;
        case 'shipBreak': this.shipBreak(e); break;
        case 'debrisSplash': this.debrisSplash(e); break;
        default: break;
      }
    }
  }

  /**
   * A salvo leaving its mount. Modelled on photographs of 16"/50 broadsides (USS Iowa): every tube throws a cluster of billowing,
   * opaque fireballs (white-hot core, orange body, dark red-brown rim) about a barrel's length ahead of the muzzle, a hot jet along
   * the bore at the first instant, a ring of smoke, a brown cloud that hangs and drifts, and a blast that scours the sea below
   * (a white sheet of foam and a skirt of spray). The tubes of a mount fire a few hundredths of a second apart.
   */
  muzzle(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 18000) return;
    const n = e.barrels ? e.barrels.length / 3 : 1;
    // radius of the fireball of one tube: 5" -> 4.1 m, 15 cm -> 6.9 m, 16" -> 18.7 m, 46 cm -> 21 m (the dual-purpose guns burn a much
    // smaller charge for their bore than the heavy guns: in the photographs their flash is a short tongue and a puff of grey smoke)
    const R = clamp(e.cal * (e.cal < 140 ? 0.032 : 0.046), 1.6, 21);
    const dir = [e.dx, e.dy, e.dz];
    for (let i = 0; i < n; i++) {
      const b = e.barrels ? [e.barrels[i * 3], e.barrels[i * 3 + 1], e.barrels[i * 3 + 2]] : [e.x, e.y, e.z];
      const delay = n > 1 ? rnd() * (e.cal >= 280 ? 0.055 : 0.03) : 0;
      if (delay > 0.004) this.later(delay, () => this.blast(b, dir, R, e.cal, d, i === 0)); else this.blast(b, dir, R, e.cal, d, i === 0);
    }
    if (e.cal >= 150) this.addShake(0.045 * clamp(e.cal / 200, 0.3, 2.3) * (1 + 0.12 * (n - 1)), e.x, e.z);
  }

  blast(b, dir, R, cal, d, first) {
    const p = this.p, es = this.emitScale;
    const heavy = cal >= 280, mid = cal >= 140;
    const lod = d > 5000 ? 0.4 : d > 2200 ? 0.7 : 1;      // a distant salvo is a few pixels wide: fewer, cheaper particles
    const c = R / 18.7;
    const [dx, dy, dz] = dir;
    // two axes perpendicular to the bore
    let ux = -dz, uy = 0, uz = dx;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const at = (a, r1, r2) => [b[0] + dx * a + ux * r1 + vx * r2, b[1] + dy * a + uy * r1 + vy * r2, b[2] + dz * a + uz * r1 + vz * r2];

    // the first instant: a white-hot flash and a jet along the bore (its hot end at the muzzle)
    p.add({ kind: K.FLASH, x: b[0] + dx * R * 0.5, y: b[1] + dy * R * 0.5, z: b[2] + dz * R * 0.5, s0: R * 1.1, s1: R * 2.4, life: 0.08, r: 1, g: 0.86, b: 0.58, a0: 10, a1: 0 });
    const jl = R * 2.6;
    p.add({ kind: K.TRACER, x: b[0] + dx * jl * 0.5, y: b[1] + dy * jl * 0.5, z: b[2] + dz * jl * 0.5, vx: -dx * 2, vy: -dy * 2, vz: -dz * 2, s0: R * 0.55, life: 0.075, r: 1, g: 0.82, b: 0.5, a0: 9, a1: 0, stretch: jl });
    // the shock ring: a thin ring of vapour thrown outward round the bore a barrel's width ahead of the muzzle, as the shell clears the tube
    if (mid) {
      const nr = Math.max(6, Math.round((heavy ? 16 : 10) * es * lod));
      for (let i = 0; i < nr; i++) {
        const th = (i / nr) * 6.283, c1 = Math.cos(th), s1 = Math.sin(th);
        const q = at(R * 1.5, c1 * R * 0.12, s1 * R * 0.12), sp = R * rr(1.6, 2.4);
        p.add({ kind: K.SMOKE, x: q[0], y: q[1], z: q[2], vx: (ux * c1 + vx * s1) * sp + dx * R * 1.5, vy: (uy * c1 + vy * s1) * sp + dy * R * 1.5, vz: (uz * c1 + vz * s1) * sp + dz * R * 1.5, s0: R * 0.22, s1: R * 0.8, life: 0.45, r: 1, g: 0.92, b: 0.82, a0: 0.55, a1: 0, drag: 2.6 });
      }
    }
    // hot glow around the fireball (light on the smoke and the sea)
    p.add({ kind: K.FIRE, x: b[0] + dx * R * 1.1, y: b[1] + dy * R * 1.1, z: b[2] + dz * R * 1.1, s0: R * 2.4, s1: R * 3.8, life: heavy ? 0.4 : 0.28, r: 1, g: 0.55, b: 0.18, a0: heavy ? 1.8 : 1.2, a1: 0 });

    // the fireball: a cluster of lobes about a barrel's length ahead of the muzzle
    const nl = Math.max(2, Math.round((heavy ? 10 : mid ? 6 : 4) * es * lod));
    for (let i = 0; i < nl; i++) {
      const a = rr(0.2, 1.7) * R, r1 = rr(-0.7, 0.7) * R, r2 = rr(-0.5, 0.6) * R;
      const q = at(a, r1, r2), lr = R * rr(0.6, 1.05);
      const sp = rr(5, 26) * Math.sqrt(c) * (heavy ? 1 : 0.7);
      p.add({
        kind: K.FIREBALL, x: q[0], y: q[1], z: q[2], vx: dx * sp + rr(-2, 2), vy: dy * sp + rr(0.5, 4), vz: dz * sp + rr(-2, 2),
        s0: lr * 0.6, s1: lr * rr(1.05, 1.3), life: (heavy ? rr(0.9, 1.6) : rr(0.4, 0.8)), r: 1, g: 1, b: 1, a0: 1, a1: 0, drag: 3.0, grav: -0.5,
      });
    }
    // a ring of smoke thrown off the muzzle (heavy guns)
    if (heavy && lod > 0.5) {
      const nr = Math.round(12 * es);
      for (let i = 0; i < nr; i++) {
        const th = (i / nr) * 6.283 + rnd() * 0.3, cs = Math.cos(th), sn = Math.sin(th);
        const q = at(R * 0.5, cs * R * 0.5, sn * R * 0.5), rad = rr(9, 15) * Math.sqrt(c), fw = rr(16, 26) * Math.sqrt(c);
        p.add({
          kind: K.SMOKE, x: q[0], y: q[1], z: q[2],
          vx: dx * fw + (ux * cs + vx * sn) * rad, vy: dy * fw + (uy * cs + vy * sn) * rad + 1, vz: dz * fw + (uz * cs + vz * sn) * rad,
          s0: R * 0.22, s1: R * rr(0.7, 1.0), life: rr(1.6, 2.6), r: 0.3, g: 0.27, b: 0.24, a0: 0.5, a1: 0, drag: 1.7, wind: 1, grav: -0.2,
        });
      }
    }
    // the cloud: brown-grey powder smoke that expands, hangs over the water and drifts with the wind
    // (lighter guns: a smaller, greyer cloud that thins out in a few seconds, or a rapid-firing battery would hide its own ship)
    const ns = Math.max(2, Math.round((heavy ? 12 : mid ? 6 : 3) * es * lod));
    const grow = heavy ? [2.2, 3.6] : mid ? [1.9, 3.0] : [1.5, 2.3], life = heavy ? [6, 12] : mid ? [3, 6] : [1.8, 3.6];
    for (let i = 0; i < ns; i++) {
      const q = at(rr(0.4, 1.8) * R, rr(-0.9, 0.9) * R, rr(-0.7, 0.8) * R), sp = rr(3, 11) * Math.sqrt(c), dark = heavy && rnd() < 0.25;
      p.add({
        kind: K.SMOKE, x: q[0], y: q[1], z: q[2], vx: dx * sp + rr(-1.5, 1.5), vy: dy * sp + rr(0.3, 3), vz: dz * sp + rr(-1.5, 1.5),
        s0: R * 0.6, s1: R * rr(grow[0], grow[1]), life: rr(life[0], life[1]), r: dark ? 0.24 : heavy ? 0.54 : 0.6, g: dark ? 0.21 : heavy ? 0.49 : 0.57, b: dark ? 0.18 : heavy ? 0.43 : 0.53, a0: dark ? 0.5 : heavy ? 0.42 : 0.34, a1: 0, drag: 1.1, wind: 1, grav: -0.3,
      });
    }
    // the blast on the sea: a sheet of foam under and ahead of the muzzle, and spray skimming away from it
    if (first || heavy) {
      const h = Math.hypot(dx, dz) || 1, hx = dx / h, hz = dz / h;
      const wy = Math.max(b[1], 1);
      if (d < 2600 && cal >= 120 && wy < 60) {
        const len = R * (heavy ? 6.5 : 4);
        this.engine.foam.add(b[0], b[2], b[0] + hx * len, b[2] + hz * len, R * (heavy ? 2.2 : 1.6), 0, heavy ? 1.0 : 0.6, heavy ? 0.9 : 0.5);
      }
      if (lod > 0.5 && cal >= 120 && wy < 60) {
        const nsp = Math.round((heavy ? 9 : 4) * es);
        for (let i = 0; i < nsp; i++) {
          const a = rr(0.3, 3.0) * R, side = rr(-1.2, 1.2) * R, sp = rr(7, 20) * Math.sqrt(c);
          p.add({
            kind: K.SPRAY, x: b[0] + hx * a + ux * side, y: 0.5, z: b[2] + hz * a + uz * side, vx: hx * sp + ux * side * 0.8, vy: rr(1.5, 7), vz: hz * sp + uz * side * 0.8,
            s0: R * 0.3, s1: R * rr(0.8, 1.3), life: rr(1.1, 2.4), r: 0.9, g: 0.94, b: 0.98, a0: 0.5, a1: 0, grav: 4, drag: 0.9, wind: 0.5,
          });
        }
      }
    }
  }

  splash(e) {
    const d = this.distToCam(e.x, e.z);
    const cs = clamp(e.cal / 400, 0.18, 1.7);
    if (d > 22000 * (0.4 + cs)) return;
    this.addShake(0.02 * cs, e.x, e.z);
    const p = this.p;
    // an armour-piercing shell slips in and its column rises narrow and tall (a fraction of a second later, when the fuze or the impact throws it up);
    // a high-explosive shell bursts at once on the surface: a wider, lower crown with a flash and a puff of smoke
    if (e.shell === 'HE') {
      p.add({ kind: K.FLASH, x: e.x, y: 1.5, z: e.z, s0: 5 * cs, s1: 12 * cs, life: 0.1, r: 1, g: 0.85, b: 0.6, a0: 5, a1: 0 });
      for (let i = 0; i < Math.round(5 * this.emitScale); i++) p.add({ kind: K.SMOKE, x: e.x + rr(-2, 2) * cs, y: rr(1, 4) * cs, z: e.z + rr(-2, 2) * cs, vy: rr(2, 6), s0: 3 * cs, s1: rr(10, 18) * cs, life: rr(2, 3.5), r: 0.3, g: 0.3, b: 0.3, a0: 0.45, a1: 0, drag: 0.5, wind: 1 });
    }
    const n = Math.round((8 + 12 * cs) * this.emitScale * (e.shell === 'AP' ? 0.8 : 1.15));
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, sp = rr(1, 6) * cs * (e.shell === 'AP' ? 0.5 : e.shell === 'HE' ? 1.3 : 1);
      p.add({ kind: K.SPRAY, x: e.x + Math.cos(a) * rr(0, 3) * cs, y: 0.4, z: e.z + Math.sin(a) * rr(0, 3) * cs, vx: Math.cos(a) * sp, vy: rr(16, 46) * Math.pow(cs, 0.7) * (e.shell === 'AP' ? 1.35 : e.shell === 'HE' ? 0.8 : 1), vz: Math.sin(a) * sp, s0: 2.6 * cs, s1: rr(8, 13) * cs, life: rr(1.5, 3.2), r: 0.92, g: 0.96, b: 1, a0: 0.95, a1: 0, grav: 17, drag: 0.15, wind: 0.4 });
    }
    for (let i = 0; i < 3; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3) * cs, y: rr(2, 9) * cs, z: e.z + rr(-3, 3) * cs, vy: rr(1, 4), s0: 7 * cs, s1: rr(22, 34) * cs, life: rr(2.5, 4), r: 0.85, g: 0.9, b: 0.95, a0: 0.5, a1: 0, drag: 0.5, wind: 1 });
    if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 6 + 13 * cs, 0.0, 1.0, 0.95);
  }

  impact(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 20000) return;
    const cs = clamp(e.cal / 250, 0.25, 2.2);
    const p = this.p;
    const k = e.kind;
    if (e.shell && k !== 'torpedo') { this.shellImpact(e, d, cs); return; }
    if (k === 'torpedo') {
      // water column: a dense white core thrown up the side of the hull, a crown spreading at the top, oil smoke at the base
      const n = Math.round(70 * this.emitScale);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, h = rnd(), r = rr(0, 3.5) * (1 - h * 0.5);
        const vy = 20 + h * 34 + rr(0, 6);
        p.add({ kind: K.SPRAY, x: e.x + Math.cos(a) * r, y: 1 + rr(0, 6), z: e.z + Math.sin(a) * r, vx: Math.cos(a) * rr(0, 2 + h * 5), vy, vz: Math.sin(a) * rr(0, 2 + h * 5), s0: 4 + h * 2, s1: rr(8, 12) + h * 6, life: rr(2.8, 4.6), r: 0.95, g: 0.97, b: 1, a0: 1, a1: 0, grav: 18, drag: 0.12, wind: 0.5 });
      }
      for (let i = 0; i < Math.round(22 * this.emitScale); i++) {
        const a = rnd() * 6.283, sp = rr(6, 16);
        p.add({ kind: K.SPRAY, x: e.x, y: 1, z: e.z, vx: Math.cos(a) * sp, vy: rr(6, 16), vz: Math.sin(a) * sp, s0: 6, s1: rr(16, 26), life: rr(2, 3.4), r: 0.93, g: 0.96, b: 1, a0: 0.8, a1: 0, grav: 8, drag: 0.5, wind: 0.4 });
      }
      p.add({ kind: K.FLASH, x: e.x, y: 5, z: e.z, s0: 26, s1: 52, life: 0.3, r: 1, g: 0.75, b: 0.4, a0: 6, a1: 0 });
      for (let i = 0; i < 6; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-5, 5), y: rr(2, 10), z: e.z + rr(-5, 5), vy: rr(3, 9), s0: 8, s1: rr(26, 44), life: rr(6, 11), r: 0.08, g: 0.075, b: 0.07, a0: 0.7, a1: 0, drag: 0.4, wind: 1 });
      this.addShake(0.5, e.x, e.z);
      if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 40, 0.8, 1, 1);
      return;
    }
    if (k === 'bounce') {
      for (let i = 0; i < 9; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-40, 40), vy: rr(10, 60), vz: rr(-40, 40), s0: 0.25 * cs, life: rr(0.3, 0.7), r: 1, g: 0.75, b: 0.35, a0: 3.5, a1: 0, grav: 20, stretch: 3 * cs });
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 3 * cs, s1: 7 * cs, life: 0.08, r: 1, g: 0.8, b: 0.5, a0: 6, a1: 0 });
      p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vy: 3, s0: 1.5 * cs, s1: 7 * cs, life: 2, r: 0.45, g: 0.43, b: 0.4, a0: 0.4, a1: 0, wind: 1, drag: 0.5 });
      this.addShake(0.03 * cs, e.x, e.z);
      return;
    }
    if (k === 'through') {
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 3, s1: 8, life: 0.1, r: 1, g: 0.8, b: 0.5, a0: 5, a1: 0 });
      p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vy: 2, s0: 2, s1: 9, life: 2.5, r: 0.3, g: 0.28, b: 0.26, a0: 0.5, a1: 0, wind: 1, drag: 0.5 });
      return;
    }
    // penetrate / explode
    const big = k === 'penetrate' ? 1.0 : 0.65;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 2, z: e.z, s0: 14 * cs * big, s1: 30 * cs * big, life: 0.22, r: 1, g: 0.72, b: 0.32, a0: 9, a1: 0 });
    const nf = Math.round(6 * big * this.emitScale + 2);
    for (let i = 0; i < nf; i++) p.add({ kind: K.FIRE, x: e.x + rr(-2, 2) * cs, y: e.y + rr(0, 3) * cs, z: e.z + rr(-2, 2) * cs, vx: rr(-6, 6), vy: rr(3, 14), vz: rr(-6, 6), s0: 4 * cs, s1: rr(10, 18) * cs, life: rr(0.5, 1.1), r: 1, g: 0.62, b: 0.2, a0: 4, a1: 0, drag: 1.2 });
    const ns = Math.round(7 * big * this.emitScale + 2);
    for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3) * cs, y: e.y + rr(0, 4) * cs, z: e.z + rr(-3, 3) * cs, vx: rr(-3, 3), vy: rr(5, 13), vz: rr(-3, 3), s0: 4 * cs, s1: rr(18, 34) * cs, life: rr(7, 14), r: 0.07, g: 0.065, b: 0.06, a0: 0.78, a1: 0, drag: 0.35, wind: 1, grav: -0.25 });
    for (let i = 0; i < 12; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-60, 60), vy: rr(10, 80), vz: rr(-60, 60), s0: 0.35 * cs, life: rr(0.4, 1.1), r: 1, g: 0.7, b: 0.3, a0: 3.5, a1: 0, grav: 20, stretch: 4 * cs });
    this.addShake(0.16 * cs * big, e.x, e.z);
  }


  /** A shower of sparks / fragments from a point, spread round a direction (unit vector). */
  sparks(x, y, z, dir, n, cone, speed, cs, col = [1, 0.72, 0.3], o = {}) {
    const p = this.p;
    n = Math.max(2, Math.round(n * this.emitScale));
    for (let i = 0; i < n; i++) {
      // a random direction inside the cone round `dir`
      let vx = dir[0] + rr(-cone, cone), vy = dir[1] + rr(-cone, cone) * (o.flat ? 0.5 : 1), vz = dir[2] + rr(-cone, cone);
      const l = Math.hypot(vx, vy, vz) || 1, sp = speed * rr(0.35, 1.0);
      p.add({ kind: K.TRACER, x, y, z, vx: vx / l * sp, vy: vy / l * sp + (o.lift || 0), vz: vz / l * sp, s0: (o.size || 0.3) * cs, life: rr(0.3, o.life || 0.9), r: col[0], g: col[1], b: col[2], a0: 3.6, a1: 0, grav: o.grav ?? 20, stretch: (o.stretch || 3.5) * cs });
    }
  }

  /**
   * A shell striking a ship. What happens depends on what the shell is and what became of it (the sim says: e.kind, e.shell 'AP' | 'HE', e.angle, e.glance,
   * e.delay, e.entry / e.exit; (e.dx, e.dy, e.dz) is the direction it was flying in):
   *  - armour-piercing, through the plate: a bright pin-prick and a spray of hot metal at the entry, then (the fuze delay later) a dull internal burst that
   *    blows jets of flame and black smoke out of the hole and the nearest openings;
   *  - armour-piercing, too fast for its fuze (thin plate): a hole in and a hole out, the shell flies on;
   *  - armour-piercing, bounced (a grazing angle, or too much plate): a spray of sparks and a streak flying away on the reflected path;
   *  - high explosive: a big bright burst on contact, a white shock flash, fragments in every direction, a lighter smoke; on a thick plate it only shatters.
   */
  shellImpact(e, d, cs) {
    const p = this.p, ap = e.shell === 'AP', k = e.kind;
    const dir = [e.dx || 0, e.dy || -0.3, e.dz || 0];
    const back = [-dir[0], -dir[1] + 0.25, -dir[2]];
    const es = this.emitScale;
    const dust = (x, y, z, sz, a, grey = 0.45, life = 2.2) => p.add({ kind: K.SMOKE, x, y, z, vy: 2.5, s0: sz * 0.5, s1: sz * 2.4, life, r: grey, g: grey * 0.97, b: grey * 0.94, a0: a, a1: 0, wind: 1, drag: 0.5 });
    if (k === 'bounce') {
      const r = [e.rwx || -dir[0], e.rwy || 0.4, e.rwz || -dir[2]];
      const rl = Math.hypot(r[0], r[1], r[2]) || 1, rd = [r[0] / rl, r[1] / rl, r[2] / rl];
      if (!ap) {
        // HE shattering on armour: grey flash, fragments scraping across the plate, a pall of grey smoke
        p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 6 * cs, s1: 14 * cs, life: 0.12, r: 1, g: 0.9, b: 0.7, a0: 8, a1: 0 });
        this.sparks(e.x, e.y, e.z, rd, 16, 0.9, 70, cs, [1, 0.82, 0.5], { life: 0.7 });
        dust(e.x, e.y + 1, e.z, 7 * cs, 0.55, 0.4); dust(e.x, e.y + 2, e.z, 5 * cs, 0.4, 0.3, 3);
        this.addShake(0.05 * cs, e.x, e.z);
        return;
      }
      if (e.glance) {
        // a grazing hit: a scratch of sparks along the plate and the shell, whole, whining away
        p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 5 * cs, s1: 12 * cs, life: 0.1, r: 1, g: 0.85, b: 0.55, a0: 8, a1: 0 });
        for (let i = 0; i < Math.round(22 * es); i++) {
          const t = i / 22, dl = 16 * cs * t;
          p.add({ kind: K.TRACER, x: e.x + rd[0] * dl, y: e.y + rd[1] * dl, z: e.z + rd[2] * dl, vx: rd[0] * rr(25, 80) + rr(-8, 8), vy: rr(5, 26), vz: rd[2] * rr(25, 80) + rr(-8, 8), s0: 0.4 * cs, life: rr(0.35, 0.9), r: 1, g: 0.8, b: 0.4, a0: 4.5, a1: 0, grav: 18, stretch: 4 * cs });
        }
        p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rd[0] * 260, vy: rd[1] * 260, vz: rd[2] * 260, s0: 0.5 * cs, life: 1.3, r: 1, g: 0.55, b: 0.22, a0: 5, a1: 0, grav: 6, stretch: 22 * cs });
        dust(e.x, e.y, e.z, 3 * cs, 0.3, 0.5, 1.6);
        this.addShake(0.02 * cs, e.x, e.z);
        return;
      }
      // the plate holds: orange flash, a hail of sparks, a lump of the shell's nose flung away, a puff of dust
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 5 * cs, s1: 11 * cs, life: 0.1, r: 1, g: 0.7, b: 0.3, a0: 8, a1: 0 });
      this.sparks(e.x, e.y, e.z, [rd[0] * 0.6 + back[0] * 0.4, rd[1] * 0.6 + 0.5, rd[2] * 0.6 + back[2] * 0.4], 24, 0.9, 85, cs, [1, 0.72, 0.28], { life: 1 });
      p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rd[0] * 120, vy: rd[1] * 120 + 20, vz: rd[2] * 120, s0: 0.45 * cs, life: 0.9, r: 1, g: 0.5, b: 0.2, a0: 4.5, a1: 0, grav: 20, stretch: 8 * cs });
      dust(e.x, e.y + 1, e.z, 6 * cs, 0.5, 0.45); this.addShake(0.06 * cs, e.x, e.z);
      return;
    }
    if (k === 'through') {
      // the shell goes in and out: a pin-prick of light each way and a streak that flies on
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 2.5 * cs, s1: 6 * cs, life: 0.08, r: 1, g: 0.85, b: 0.6, a0: 6, a1: 0 });
      this.sparks(e.x, e.y, e.z, back, 12, 0.7, 45, cs, [1, 0.78, 0.4], { life: 0.6 });
      dust(e.x, e.y, e.z, 3 * cs, 0.35, 0.3);
      const ex = e.exit || [e.x + dir[0] * 6, e.y + dir[1] * 6, e.z + dir[2] * 6];
      this.later(0.04, () => {
        p.add({ kind: K.FLASH, x: ex[0], y: ex[1], z: ex[2], s0: 4 * cs, s1: 9 * cs, life: 0.1, r: 1, g: 0.7, b: 0.35, a0: 7, a1: 0 });
        this.sparks(ex[0], ex[1], ex[2], dir, 14, 0.45, 70, cs, [1, 0.7, 0.3], { life: 0.7 });
        p.add({ kind: K.TRACER, x: ex[0], y: ex[1], z: ex[2], vx: dir[0] * 280, vy: dir[1] * 280, vz: dir[2] * 280, s0: 0.5 * cs, life: 0.9, r: 1, g: 0.45, b: 0.18, a0: 5, a1: 0, grav: 12, stretch: 20 * cs });
        dust(ex[0], ex[1] + 1, ex[2], 5 * cs, 0.4, 0.22, 2.6);
      });
      this.addShake(0.04 * cs, e.x, e.z);
      return;
    }
    // penetrate (armour-piercing: delayed burst inside; high explosive through thin skin) / explode (high explosive on contact)
    if (ap && k === 'penetrate') {
      const en = e.entry || [e.x - dir[0] * 3, e.y - dir[1] * 3, e.z - dir[2] * 3];
      // at the plate: a white pin-prick, hot metal thrown back, a ring of dust
      p.add({ kind: K.FLASH, x: en[0], y: en[1], z: en[2], s0: 3.5 * cs, s1: 8 * cs, life: 0.09, r: 1, g: 0.9, b: 0.7, a0: 8, a1: 0 });
      this.sparks(en[0], en[1], en[2], back, 18, 0.8, 60, cs, [1, 0.78, 0.4], { life: 0.7 });
      dust(en[0], en[1], en[2], 4 * cs, 0.4, 0.4);
      // then, the fuze delay later, the burst inside: a dull red glow, jets of flame and black smoke through the hole and every opening, a heavy shake
      const t = clamp((e.delay || 3) / Math.max(e.speed || 400, 100) + 0.05, 0.05, 0.25);
      this.later(t, () => {
        p.add({ kind: K.FLASH, x: e.x, y: e.y + 1, z: e.z, s0: 10 * cs, s1: 24 * cs, life: 0.28, r: 1, g: 0.5, b: 0.18, a0: 6, a1: 0 });
        const nf = Math.round((5 + 5 * cs) * es);
        for (let i = 0; i < nf; i++) {
          // jets: back out of the hole, up through the deck, sideways through the openings
          const up = i % 3 === 0, jd = up ? [rr(-0.3, 0.3), 1, rr(-0.3, 0.3)] : [back[0] + rr(-0.5, 0.5), back[1] * 0.5 + rr(0, 0.6), back[2] + rr(-0.5, 0.5)];
          const l = Math.hypot(jd[0], jd[1], jd[2]) || 1, sp = rr(10, 26) * Math.sqrt(cs);
          p.add({ kind: K.FIRE, x: e.x + rr(-1, 1) * cs, y: e.y + rr(0, 2) * cs, z: e.z + rr(-1, 1) * cs, vx: jd[0] / l * sp, vy: jd[1] / l * sp, vz: jd[2] / l * sp, s0: 3 * cs, s1: rr(9, 16) * cs, life: rr(0.45, 1.0), r: 1, g: 0.5, b: 0.15, a0: 4, a1: 0, drag: 1.4 });
        }
        const ns = Math.round((9 + 7 * cs) * es);
        for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-2, 2) * cs, y: e.y + rr(0, 3) * cs, z: e.z + rr(-2, 2) * cs, vx: back[0] * rr(0, 6) + rr(-3, 3), vy: rr(6, 15), vz: back[2] * rr(0, 6) + rr(-3, 3), s0: 3.5 * cs, s1: rr(16, 30) * cs, life: rr(8, 15), r: 0.045, g: 0.042, b: 0.04, a0: 0.85, a1: 0, drag: 0.35, wind: 1, grav: -0.3 });
        this.sparks(e.x, e.y + 1, e.z, [0, 1, 0], 14, 1.1, 45, cs, [1, 0.62, 0.22], { life: 1.1 });
        this.addShake(0.2 * cs, e.x, e.z);
      });
      return;
    }
    // high explosive: instant, bright and wide (on contact, or just behind a thin skin)
    const inside = e.inside, big = k === 'penetrate' ? 1.0 : 0.85;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 1, z: e.z, s0: 20 * cs * big, s1: 44 * cs * big, life: 0.16, r: 1, g: 0.9, b: 0.66, a0: 11, a1: 0 });
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 2, z: e.z, s0: 9 * cs, s1: 18 * cs, life: 0.3, r: 1, g: 0.6, b: 0.25, a0: 7, a1: 0 });
    const nf = Math.round((7 * big + 2) * es);
    for (let i = 0; i < nf; i++) p.add({ kind: K.FIRE, x: e.x + rr(-2, 2) * cs, y: e.y + rr(0, 3) * cs, z: e.z + rr(-2, 2) * cs, vx: rr(-9, 9), vy: rr(3, 16), vz: rr(-9, 9), s0: 5 * cs, s1: rr(12, 22) * cs, life: rr(0.4, 0.95), r: 1, g: 0.72, b: 0.3, a0: 4.4, a1: 0, drag: 1.3 });
    // fragments in every direction, hot and fast
    this.sparks(e.x, e.y, e.z, [0, 0.3, 0], 30, 2.2, 95, cs, [1, 0.85, 0.5], { life: 0.9, stretch: 4 });
    const ns = Math.round((6 * big + 2) * es);
    for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3) * cs, y: e.y + rr(0, 4) * cs, z: e.z + rr(-3, 3) * cs, vx: rr(-4, 4), vy: rr(4, 11), vz: rr(-4, 4), s0: 4 * cs, s1: rr(14, 26) * cs, life: rr(5, 10), r: 0.2, g: 0.19, b: 0.18, a0: 0.7, a1: 0, drag: 0.4, wind: 1, grav: -0.2 });
    if (inside) this.later(0.08, () => this.sparks(e.x, e.y + 1, e.z, [0, 1, 0], 10, 1.0, 40, cs, [1, 0.6, 0.2], { life: 1 }));
    this.addShake(0.2 * cs * big, e.x, e.z);
  }

  explosion(e) {
    const s = e.size, p = this.p;
    const d = this.distToCam(e.x, e.z);
    if (d > 26000) return;
    if (e.stage === 'secondary' || e.stage === 'air') {
      const k = e.stage === 'air' ? e.size * 1.6 : s;
      p.add({ kind: K.FLASH, x: e.x, y: e.y + 2, z: e.z, s0: 22 * k, s1: 60 * k, life: 0.3, r: 1, g: 0.7, b: 0.32, a0: 10, a1: 0 });
      const nf = Math.round((10 + 14 * k) * this.emitScale);
      for (let i = 0; i < nf; i++) {
        const a = rnd() * 6.283, sp = rr(0, 12) * k;
        p.add({ kind: K.FIRE, x: e.x + Math.cos(a) * rr(0, 6) * k, y: e.y + rr(0, 8) * k, z: e.z + Math.sin(a) * rr(0, 6) * k, vx: Math.cos(a) * sp, vy: rr(6, 24) * k, vz: Math.sin(a) * sp, s0: 6 * k, s1: rr(14, 30) * k, life: rr(0.8, 1.8), r: 1, g: 0.58, b: 0.18, a0: 5, a1: 0, drag: 0.7 });
      }
      const ns = Math.round((10 + 16 * k) * this.emitScale);
      for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-4, 4) * k, y: e.y + rr(0, 8) * k, z: e.z + rr(-4, 4) * k, vx: rr(-6, 6), vy: rr(8, 26) * Math.sqrt(k), vz: rr(-6, 6), s0: 8 * k, s1: rr(26, 50) * k, life: rr(7, 16), r: 0.05, g: 0.048, b: 0.045, a0: 0.85, a1: 0, drag: 0.3, wind: 1, grav: -0.2 });
      this.addShake(0.45 * k, e.x, e.z);
      return;
    }
    // ---- primary explosion (ammunition): flash, fireball, shock wave, rising smoke column ----
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 6, z: e.z, s0: 100 * s, s1: 300 * s, life: 0.8, r: 1, g: 0.66, b: 0.32, a0: 7, a1: 0 });
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 4, z: e.z, s0: 50 * s, s1: 170 * s, life: 1.5, r: 1, g: 0.5, b: 0.18, a0: 4, a1: 0 });
    const nf = Math.round(70 * this.emitScale + 30);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * 6.283, el = rr(0.1, 1.45), sp = rr(10, 60) * s;
      p.add({ kind: K.FIRE, x: e.x + Math.cos(a) * rr(0, 12) * s, y: e.y + rr(0, 10) * s, z: e.z + Math.sin(a) * rr(0, 12) * s, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp * 1.2, vz: Math.sin(a) * Math.cos(el) * sp, s0: 24 * s, s1: rr(50, 100) * s, life: rr(1.6, 3.6), r: 1, g: 0.55, b: 0.16, a0: 5, a1: 0, drag: 0.75 });
    }
    // smoke column: a stem rising fast, then a mushroom cap spreading at the top
    const ns = Math.round(52 * this.emitScale + 22);
    for (let i = 0; i < ns; i++) {
      const a = rnd() * 6.283, sp = rr(0, 14) * s;
      p.add({ kind: K.SMOKE, x: e.x + Math.cos(a) * rr(0, 14) * s, y: e.y + rr(0, 14) * s, z: e.z + Math.sin(a) * rr(0, 14) * s, vx: Math.cos(a) * sp, vy: rr(34, 100) * Math.sqrt(s), vz: Math.sin(a) * sp, s0: 11 * s, s1: rr(46, 95) * s, life: rr(14, 30), r: 0.06, g: 0.057, b: 0.052, a0: 0.9, a1: 0, drag: 0.22, wind: 1, grav: -0.1 });
    }
    // hot embers and large pieces glowing in the fireball
    for (let i = 0; i < 40; i++) {
      const a = rnd() * 6.283, sp = rr(20, 90), el = rr(0.4, 1.4);
      p.add({ kind: K.TRACER, x: e.x, y: e.y + 8, z: e.z, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp * 1.4, vz: Math.sin(a) * Math.cos(el) * sp, s0: 0.7, life: rr(1.5, 4), r: 1, g: 0.62, b: 0.25, a0: 4.5, a1: 1, grav: 14, drag: 0.04, stretch: 4 });
    }
    // shock wave: a ring of spray racing outwards over the water
    const nr = 48;
    for (let i = 0; i < nr; i++) {
      const a = i / nr * 6.283 + rr(-0.05, 0.05), sp = rr(80, 140) * Math.sqrt(s);
      p.add({ kind: K.SPRAY, x: e.x, y: 1, z: e.z, vx: Math.cos(a) * sp, vy: rr(5, 14), vz: Math.sin(a) * sp, s0: 8 * s, s1: rr(26, 44) * s, life: rr(1.6, 2.8), r: 0.93, g: 0.95, b: 0.98, a0: 0.8, a1: 0, grav: 6, drag: 0.7, wind: 0 });
    }
    this.rings.push({ x: e.x, z: e.z, t: 0, size: s });
    // the head of the mushroom: smoke spreading sideways at the top of the column
    this.later(2.1, () => {
      const top = e.y + 105 * Math.sqrt(s);
      const nc = Math.round(34 * this.emitScale + 14);
      for (let i = 0; i < nc; i++) {
        const a = rnd() * 6.283, sp = rr(8, 24) * Math.pow(s, 0.7), rad = rr(0, 16) * s;
        p.add({ kind: K.SMOKE, x: e.x + Math.cos(a) * rad, y: top + rr(-10, 14) * s, z: e.z + Math.sin(a) * rad, vx: Math.cos(a) * sp, vy: rr(-1, 7), vz: Math.sin(a) * sp, s0: 30 * s, s1: rr(70, 130) * s, life: rr(14, 26), r: 0.07, g: 0.065, b: 0.06, a0: 0.8, a1: 0, drag: 0.28, wind: 1, grav: 0.02 });
      }
    });
    this.addShake(1.6 * s, e.x, e.z);
    if (d < 1300) this.engine.foam.add(e.x, e.z, e.x, e.z, 110 * s, 0.9, 1, 1);
  }

  torpedoLaunch(e) {
    if (this.distToCam(e.x, e.z) > 6000) return;
    for (let i = 0; i < 6; i++) this.p.add({ kind: K.SPRAY, x: e.x, y: 0.5, z: e.z, vx: rr(-3, 3), vy: rr(4, 9), vz: rr(-3, 3), s0: 1.2, s1: 4, life: rr(0.8, 1.6), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
  }

  /** A fighter's guns: a stream of tracers along the line to its target, a little muzzle flash. */
  mgFire(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 6000) return;
    const sp = 760, life = Math.min(e.range / sp + 0.05, 1.1);
    for (let i = 0; i < 2; i++) {
      const j = 0.02;
      const ux = e.dx + rr(-j, j), uy = e.dy + rr(-j, j), uz = e.dz + rr(-j, j), l = Math.hypot(ux, uy, uz) || 1;
      this.p.add({ kind: K.TRACER, x: e.x + rr(-1.6, 1.6), y: e.y + rr(-0.3, 0.3), z: e.z + rr(-1.6, 1.6), vx: ux / l * sp + e.plane.vx * 0.2, vy: uy / l * sp, vz: uz / l * sp + e.plane.vz * 0.2, s0: 0.3, life, r: 1, g: 0.85, b: 0.4, a0: 4, a1: 4, stretch: 13 });
    }
    if (rnd() < 0.5) this.p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 0.8, s1: 1.6, life: 0.05, r: 1, g: 0.8, b: 0.4, a0: 3, a1: 0 });
  }

  aaFire(e) {
    const pl = e.plane;
    const d = this.distToCam(e.x, e.z);
    if (d > 7000) return;
    const dx = pl.x + pl.vx * 0.4 - e.x, dy = pl.y + pl.vy * 0.4 - e.y, dz = pl.z + pl.vz * 0.4 - e.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    const sp = e.cal >= 30 ? 800 : 880;
    const n = Math.min(e.n, 3);
    for (let i = 0; i < n; i++) {
      const j = 0.012 * L;
      const ux = dx + rr(-j, j), uy = dy + rr(-j, j), uz = dz + rr(-j, j);
      const l = Math.hypot(ux, uy, uz) || 1;
      this.p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: ux / l * sp, vy: uy / l * sp, vz: uz / l * sp, s0: e.cal >= 30 ? 0.55 : 0.4, life: Math.min(L / sp, 1.6), r: e.cal >= 30 ? 1 : 1, g: e.cal >= 30 ? 0.55 : 0.78, b: e.cal >= 30 ? 0.3 : 0.4, a0: 4.5, a1: 4.5, stretch: 16 });
    }
    this.p.add({ kind: K.FLASH, x: e.x, y: e.y + 0.6, z: e.z, s0: e.cal >= 30 ? 3.2 : 2, s1: e.cal >= 30 ? 6 : 3.4, life: 0.07, r: 1, g: 0.8, b: 0.45, a0: 4.5, a1: 0 });
    if (d < 2500 && rnd() < 0.35) this.p.add({ kind: K.SMOKE, x: e.x, y: e.y + 0.5, z: e.z, vy: 1.5, s0: 0.8, s1: 3.4, life: 1.6, r: 0.7, g: 0.68, b: 0.64, a0: 0.3, a1: 0, wind: 1, drag: 1 });
  }

  /** Heavy AA shell bursting: black puff, flash, a few fragments. */
  flak(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 12000) return;
    const p = this.p, cs = clamp(e.cal / 127, 0.6, 1.5);
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 9 * cs, s1: 20 * cs, life: 0.11, r: 1, g: 0.72, b: 0.36, a0: 8, a1: 0 });
    for (let i = 0; i < 4; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3), y: e.y + rr(-3, 3), z: e.z + rr(-3, 3), vx: rr(-2, 2), vy: rr(-1, 2), vz: rr(-2, 2), s0: 5 * cs, s1: rr(16, 26) * cs, life: rr(5, 9), r: 0.05, g: 0.05, b: 0.05, a0: 0.9, a1: 0, wind: 1, drag: 0.5 });
    for (let i = 0; i < 6; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-80, 80), vy: rr(-60, 70), vz: rr(-80, 80), s0: 0.2, life: rr(0.12, 0.35), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, stretch: 4 });
  }

  /** An aircraft is hit: sparks, a puff of debris smoke. */
  planeHit(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 9000) return;
    const p = this.p;
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 3, s1: 7, life: 0.08, r: 1, g: 0.8, b: 0.5, a0: 6, a1: 0 });
    for (let i = 0; i < 5; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-30, 30) + e.plane.vx * 0.5, vy: rr(-20, 30) + e.plane.vy * 0.5, vz: rr(-30, 30) + e.plane.vz * 0.5, s0: 0.18, life: rr(0.2, 0.5), r: 1, g: 0.75, b: 0.35, a0: 3, a1: 0, grav: 6, stretch: 2.5 });
    p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vx: e.plane.vx * 0.2, vy: 1, vz: e.plane.vz * 0.2, s0: 1.2, s1: 6, life: 2.4, r: 0.3, g: 0.28, b: 0.26, a0: 0.5, a1: 0, wind: 1, drag: 0.8 });
  }

  /** The death throes of an aircraft begin: fireball in the air for a fuel / bomb explosion, thick smoke otherwise. */
  planeDown(e) {
    const p = this.p, pl = e.plane;
    const d = this.distToCam(e.x, e.z);
    if (d > 12000) return;
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 7, s1: 16, life: 0.2, r: 1, g: 0.65, b: 0.28, a0: 7, a1: 0 });
    for (let i = 0; i < 6; i++) p.add({ kind: K.FIRE, x: e.x + rr(-2, 2), y: e.y + rr(-1, 1), z: e.z + rr(-2, 2), vx: pl.vx * 0.6 + rr(-6, 6), vy: pl.vy * 0.6 + rr(-3, 4), vz: pl.vz * 0.6 + rr(-6, 6), s0: 3, s1: 9, life: rr(0.5, 1.1), r: 1, g: 0.6, b: 0.2, a0: 4, a1: 0, drag: 0.8 });
    for (let i = 0; i < 10; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-2, 2), y: e.y, z: e.z + rr(-2, 2), vx: pl.vx * 0.7 + rr(-5, 5), vy: pl.vy * 0.7 + rr(-3, 3), vz: pl.vz * 0.7 + rr(-5, 5), s0: 3, s1: rr(9, 15), life: rr(4, 8), r: 0.05, g: 0.05, b: 0.05, a0: 0.8, a1: 0, grav: 1, drag: 0.5, wind: 0.6 });
    this.addShake(0.06, e.x, e.z);
  }

  planeBreakup(e) {
    const p = this.p;
    if (this.distToCam(e.x, e.z) > 9000) return;
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 4, s1: 10, life: 0.12, r: 1, g: 0.75, b: 0.4, a0: 6, a1: 0 });
    for (let i = 0; i < 7; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-30, 30), vy: rr(-10, 25), vz: rr(-30, 30), s0: 0.22, life: rr(0.3, 0.7), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, grav: 8, stretch: 3 });
  }

  /** The aircraft hits the water (or a ship): fireball, spray, burning fuel and a column of black smoke. */
  planeCrash(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 16000) return;
    const p = this.p;
    const big = e.ordnance ? 1.6 : 1;
    const sp = clamp(e.speed / 100, 0.6, 1.6);
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 3, z: e.z, s0: 14 * big, s1: 38 * big, life: 0.4, r: 1, g: 0.68, b: 0.3, a0: 9, a1: 0 });
    const nf = Math.round(14 * big * this.emitScale + 5);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * 6.283, sv = rr(2, 14) * sp;
      p.add({ kind: K.FIRE, x: e.x + Math.cos(a) * rr(0, 4), y: e.y + rr(0, 3), z: e.z + Math.sin(a) * rr(0, 4), vx: Math.cos(a) * sv, vy: rr(4, 20), vz: Math.sin(a) * sv, s0: 3.5, s1: rr(9, 20) * big, life: rr(0.7, 1.6), r: 1, g: 0.58, b: 0.18, a0: 4, a1: 0, drag: 0.9 });
    }
    const ns = Math.round(12 * this.emitScale + 4);
    for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3), y: e.y + rr(0, 4), z: e.z + rr(-3, 3), vx: rr(-3, 3), vy: rr(6, 16), vz: rr(-3, 3), s0: 4, s1: rr(16, 30) * big, life: rr(8, 16), r: 0.05, g: 0.048, b: 0.045, a0: 0.8, a1: 0, drag: 0.3, wind: 1, grav: -0.15 });
    for (let i = 0; i < 12; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y + 1, z: e.z, vx: rr(-25, 25), vy: rr(8, 35), vz: rr(-25, 25), s0: 0.3, life: rr(0.5, 1.2), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, grav: 18, stretch: 3 });
    this.addShake(e.ship ? 0.25 : 0.1, e.x, e.z);
    if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 14 * big, 0.5, 1, 0.9);
  }

  planeDitch(e) {
    if (this.distToCam(e.x, e.z) > 6000) return;
    for (let i = 0; i < 14; i++) this.p.add({ kind: K.SPRAY, x: e.x + rr(-4, 4), y: 0.4, z: e.z + rr(-4, 4), vx: rr(-4, 4), vy: rr(5, 14), vz: rr(-4, 4), s0: 1.6, s1: rr(5, 9), life: rr(1.2, 2.4), r: 0.94, g: 0.97, b: 1, a0: 0.9, a1: 0, grav: 12, drag: 0.2, wind: 0.4 });
  }

  torpedoEntry(e) {
    if (this.distToCam(e.x, e.z) > 5000) return;
    if (this.distToCam(e.x, e.z) < 1000) this.engine.foam.add(e.x, e.z, e.x, e.z, 7, 0.3, 1, 0.9);
  }

  /** Wreckage falling into the sea. */
  debrisSplash(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 9000) return;
    const cs = clamp(e.size / 6, 0.25, 1.4);
    const n = Math.round((4 + 9 * cs) * this.emitScale);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, sv = rr(1, 4) * cs;
      this.p.add({ kind: K.SPRAY, x: e.x + Math.cos(a) * rr(0, 2) * cs, y: 0.4, z: e.z + Math.sin(a) * rr(0, 2) * cs, vx: Math.cos(a) * sv, vy: rr(8, 24) * Math.pow(cs, 0.6), vz: Math.sin(a) * sv, s0: 1.4 * cs + 0.5, s1: rr(5, 10) * cs + 1, life: rr(1.2, 2.4), r: 0.93, g: 0.96, b: 1, a0: 0.9, a1: 0, grav: 15, drag: 0.15, wind: 0.4 });
    }
    if (d < 900) this.engine.foam.add(e.x, e.z, e.x, e.z, 4 + 7 * cs, 0.1, 1, 0.9);
  }

  /** A part of the ship destroyed: debris cloud, smoke, sparks according to what it was. */
  moduleKilled(e) {
    const s = e.ship;
    if (!s || s.state === 'sunk') return;
    const w = s.toWorld(e.x, e.y, e.z, this._v);
    const d = this.distToCam(w[0], w[2]);
    if (d > 14000) return;
    const p = this.p;
    const kind = e.kind;
    const big = kind === 'funnel' || kind === 'bridge' ? 1 : kind === 'engine' || kind === 'magazine' || kind === 'hangar' ? 1.2 : kind === 'mast' || kind === 'director' || kind === 'tubes' ? 0.7 : 0.45;
    p.add({ kind: K.FLASH, x: w[0], y: w[1], z: w[2], s0: 7 * big, s1: 18 * big, life: 0.18, r: 1, g: 0.72, b: 0.34, a0: 7, a1: 0 });
    const ns = Math.round((5 + 6 * big) * this.emitScale);
    const dark = kind === 'engine' ? 0.5 : 0.05;
    for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: w[0] + rr(-2, 2) * big, y: w[1] + rr(0, 3), z: w[2] + rr(-2, 2) * big, vx: rr(-4, 4), vy: rr(4, 12), vz: rr(-4, 4), s0: 3 * big, s1: rr(12, 24) * big, life: rr(5, 12), r: dark, g: dark, b: dark, a0: kind === 'engine' ? 0.5 : 0.8, a1: 0, drag: 0.35, wind: 1, grav: -0.2 });
    const nt = Math.round(10 * big);
    for (let i = 0; i < nt; i++) p.add({ kind: K.TRACER, x: w[0], y: w[1], z: w[2], vx: rr(-45, 45), vy: rr(8, 55), vz: rr(-45, 45), s0: 0.25, life: rr(0.4, 1), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, grav: 18, stretch: 3 });
    this.addShake(0.05 * big, w[0], w[2]);
  }

  shipBreak(e) {
    const p = this.p, s = e.size;
    const d = this.distToCam(e.x, e.z);
    if (d > 20000) return;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 4, z: e.z, s0: 30 * s, s1: 90 * s, life: 0.5, r: 1, g: 0.7, b: 0.32, a0: 9, a1: 0 });
    const nf = Math.round(24 * this.emitScale + 8);
    for (let i = 0; i < nf; i++) p.add({ kind: K.FIRE, x: e.x + rr(-8, 8), y: e.y + rr(-2, 8), z: e.z + rr(-8, 8), vx: rr(-10, 10), vy: rr(6, 24), vz: rr(-10, 10), s0: 9 * s, s1: rr(24, 40) * s, life: rr(1, 2.2), r: 1, g: 0.58, b: 0.18, a0: 4, a1: 0, drag: 0.6 });
    // steam and water thrown up along the break
    for (let i = 0; i < 22; i++) p.add({ kind: K.SPRAY, x: e.x + rr(-14, 14), y: 1, z: e.z + rr(-14, 14), vx: rr(-8, 8), vy: rr(18, 52), vz: rr(-8, 8), s0: 4, s1: rr(12, 22), life: rr(2, 4), r: 0.95, g: 0.97, b: 1, a0: 0.9, a1: 0, grav: 14, drag: 0.1, wind: 0.5 });
    this.addShake(0.8 * s, e.x, e.z);
  }

  collision(e) {
    if (this.distToCam(e.x, e.z) > 4000) return;
    for (let i = 0; i < 10; i++) this.p.add({ kind: K.TRACER, x: e.x, y: 5, z: e.z, vx: rr(-30, 30), vy: rr(5, 35), vz: rr(-30, 30), s0: 0.3, life: rr(0.4, 0.9), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, grav: 20, stretch: 3 });
    this.p.add({ kind: K.SMOKE, x: e.x, y: 6, z: e.z, vy: 4, s0: 6, s1: 28, life: 6, r: 0.3, g: 0.28, b: 0.26, a0: 0.6, a1: 0, wind: 1, drag: 0.4 });
    this.addShake(0.2, e.x, e.z);
  }

  mountKilled(e) {
    const s = e.ship, m = e.mount;
    const w = s.toWorld(m.rec.x, m.rec.y + 1.5, m.rec.z, this._v);
    this.impact({ kind: 'penetrate', x: w[0], y: w[1], z: w[2], cal: Math.max(m.rec.cal, 200) });
  }

  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ---- continuous ---------------------------------------------------------------------------------------
  update(dt, world) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    const cam = this.engine.cam;
    const P = this.engine.P;
    const wa = P.windDir * D2R, ws = Math.min(8, P.windSpeed * 0.6);
    this.p.wind[0] = Math.cos(wa) * ws; this.p.wind[1] = Math.sin(wa) * ws;
    const foam = this.engine.foam;
    const t = world.time;

    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
      const speedF = Math.min(1, Math.abs(s.speed) / Math.max(1, s.stats.maxSpeed));
      const st = s.stats;
      const fxs = s._fx || (s._fx = { smoke: 0, fire: 0, steam: 0 });

      // ---- wakes (foam stamps) ----
      if (d < 1400) addWakeStamps(foam, s, d);

      // ---- funnel smoke ----
      if (d < 26000 && s.state === 'afloat' && s.model.smoke.length) {
        const rate = (1.2 + 5.5 * speedF) * (1 + (1 - s.hpFrac) * 0.8) * this.emitScale * (d > 8000 ? 0.7 : 1);
        fxs.smoke += rate * dt;
        const dark = 0.075 + 0.1 * (1 - speedF) + (s.engine < 0.6 ? 0 : 0.03);
        while (fxs.smoke >= 1) {
          fxs.smoke -= 1;
          const sp = s.model.smoke[Math.floor(rnd() * s.model.smoke.length)];
          const w = s.toWorld(sp[0], sp[1], sp[2], this._v);
          this.p.add({ kind: K.SMOKE, x: w[0] + rr(-0.5, 0.5), y: w[1], z: w[2] + rr(-0.5, 0.5), vx: s.vx * 0.6, vy: rr(2.5, 5), vz: s.vz * 0.6, s0: 2.4, s1: rr(26, 44), life: rr(8, 13), r: dark, g: dark * 0.98, b: dark * 0.96, a0: 0.5 + 0.2 * speedF, a1: 0, drag: 0.22, wind: 1, grav: -0.15 });
        }
      }

      // ---- fires ----
      if (s.fires.length && d < 22000) {
        for (const f of s.fires) {
          f.acc = (f.acc || 0) + dt * (7 + 6 * f.power) * this.emitScale;
          let smokeN = 0;
          while (f.acc >= 1) {
            f.acc -= 1;
            const w = s.toWorld(f.x + rr(-1, 1), f.y + rr(0, 1), f.z + rr(-1, 1), this._v);
            if (rnd() < 0.5) this.p.add({ kind: K.FIRE, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5, vy: rr(3, 8), vz: s.vz * 0.5, s0: 2.2 + f.power, s1: 5 + 3 * f.power, life: rr(0.4, 0.9), r: 1, g: 0.62, b: 0.2, a0: 3, a1: 0, drag: 0.8 });
            // the smoke is hot: it rises in a column (low drag, buoyancy) and leans with the wind, instead of piling up on the ship
            if ((smokeN++ & 1) === 0) this.p.add({ kind: K.SMOKE, x: w[0], y: w[1] + 2, z: w[2], vx: s.vx * 0.5, vy: rr(7, 14), vz: s.vz * 0.5, s0: 3.2, s1: rr(34, 58) * (0.7 + f.power * 0.4), life: rr(14, 24), r: 0.05, g: 0.048, b: 0.045, a0: 0.6, a1: 0, drag: 0.07, wind: 1, grav: -0.9 });
          }
        }
      }

      // ---- sinking: steam, bubbles, heavy smoke ----
      if (s.state === 'sinking' && d < 22000) {
        fxs.steam += dt * ({ burn: 14, roll: 5, level: 6, bow: 8, stern: 8, blast: 7 }[s.sinkMode] ?? (s.exploded ? 7 : 12)) * this.emitScale;   // a capsized or settling ship smokes less than a burning one
        while (fxs.steam >= 1) {
          fxs.steam -= 1;
          const lx = rr(-st.L * 0.4, st.L * 0.4), lz = rr(-st.B * 0.3, st.B * 0.3);
          const w = s.toWorld(lx, Math.max(2, s.model.hull.deckY(lx) - s.sinkDepth * 0.4), lz, this._v);
          this.p.add({ kind: K.SMOKE, x: w[0], y: w[1], z: w[2], vy: rr(6, 12), s0: 5, s1: rr(30, 52), life: rr(11, 19), r: 0.09, g: 0.09, b: 0.09, a0: 0.62, a1: 0, wind: 1, drag: 0.1, grav: -0.6 });
          if (rnd() < 0.4) this.p.add({ kind: K.SPRAY, x: w[0], y: 0.5, z: w[2], vx: rr(-3, 3), vy: rr(5, 15), vz: rr(-3, 3), s0: 2, s1: 6, life: rr(1, 2.2), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
        }
      }
    }

    // ---- torpedo tracks: a thin white wake ----
    for (const tp of world.torpedoes) {
      if (tp.air && tp.h > 0) continue;
      const d = Math.hypot(tp.x - cam.x, tp.z - cam.z);
      if (d < 1300) foam.add(tp.x, tp.z, tp.x - tp.vx * 0.12, tp.z - tp.vz * 0.12, 1.8, 0.75, 0.25, 0.1);
    }

    this.updatePlanes(dt, world, cam);
    this.updateDebris(dt, world, cam);
    this.updateSeaFires(dt, world, cam);
    this.updateRings(dt, world, cam);
    this.updateWrecks(dt, world, cam);
  }

  /** Smoke and flames trailing damaged aircraft; prop wash behind aircraft skimming the water. */
  updatePlanes(dt, world, cam) {
    const acc = this.acc.planeSmoke;
    for (const p of world.planes) {
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d > 14000) continue;
      const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
      const tail = p.spec ? p.spec.L * 0.38 : 4;
      const hot = p.fire > 0.5 || p.dying;
      if (DECK_PHASES.has(p.phase) && !p.hidden && d < 2500) this.deckPlane(dt, p, d, fx, fz, acc);
      if (p.smoke > 0 || p.fire > 0) {
        let a = (acc.get(p.id) || 0) + dt * (hot ? 38 : 16) * this.emitScale * (d > 5000 ? 0.5 : 1);
        while (a >= 1) {
          a -= 1;
          const jx = rr(-0.8, 0.8), jy = rr(-0.5, 0.5), jz = rr(-0.8, 0.8);
          const dark = hot ? 0.035 : 0.2;
          this.p.add({ kind: K.SMOKE, x: p.x - fx * tail + jx, y: p.y + jy, z: p.z - fz * tail + jz, vx: p.vx * 0.15, vy: rr(0.5, 2), vz: p.vz * 0.15, s0: 1.4, s1: rr(8, 15), life: rr(5, 9), r: dark, g: dark, b: dark, a0: hot ? 0.9 : 0.55, a1: 0, drag: 0.5, wind: 1, grav: -0.1 });
          if (hot && rnd() < 0.7) this.p.add({ kind: K.FIRE, x: p.x - fx * (tail * 0.4) + jx, y: p.y + jy + 0.3, z: p.z - fz * (tail * 0.4) + jz, vx: p.vx * 0.5, vy: p.vy * 0.5 + 1, vz: p.vz * 0.5, s0: 1.4, s1: rr(3.5, 6), life: rr(0.25, 0.55), r: 1, g: 0.6, b: 0.2, a0: 3.5, a1: 0, drag: 1.2 });
        }
        acc.set(p.id, a);
      }
      // spray and foam under an aircraft flying low over the sea
      if (p.y < 30 && d < 1600 && !DECK_PHASES.has(p.phase) && p.phase !== 'final') {
        const k = 1 - p.y / 30;
        this.engine.foam.add(p.x, p.z, p.x - p.vx * 0.12, p.z - p.vz * 0.12, 4 + 5 * k, 0.12, 0.5 * k, 0.3 * k);
        if (p.y < 14 && rnd() < dt * 24) this.p.add({ kind: K.SPRAY, x: p.x - fx * 6, y: 0.4, z: p.z - fz * 6, vx: rr(-2, 2), vy: rr(3, 8), vz: rr(-2, 2), s0: 1.5, s1: rr(5, 9), life: rr(0.9, 1.6), r: 0.94, g: 0.97, b: 1, a0: 0.6, a1: 0, grav: 10, drag: 0.4 });
      }
    }
    if (acc.size > 400) for (const id of acc.keys()) if (!world.planes.some((q) => q.id === id)) acc.delete(id);
  }

  /** The wheels hit the deck: a puff of tyre smoke and a few sparks from the hook. */
  touchdown(e) {
    const p = e.plane, cam = this.engine.cam;
    const d = Math.hypot(p.x - cam.x, p.z - cam.z);
    if (d > 3000) return;
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading), cs = d > 900 ? 1.5 : 1;
    const rx = Math.cos(p.heading), rz = Math.sin(p.heading);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) this.p.add({ kind: K.SMOKE, x: p.x + rx * side * 1.5 + fx * 0.6, y: p.y - 1.5, z: p.z + rz * side * 1.5 + fz * 0.6, vx: p.vx * 0.2 + rr(-1, 1), vy: rr(0.4, 1.2), vz: p.vz * 0.2 + rr(-1, 1), s0: 0.5 * cs, s1: rr(2.4, 4) * cs, life: rr(1.2, 2.2), r: 0.82, g: 0.82, b: 0.8, a0: 0.5, a1: 0, drag: 0.8, wind: 1 });
    }
    this.sparks(p.x - fx * (e.back || 4), p.y - 1.6, p.z - fz * (e.back || 4), [-fx * 0.3, 0.4, -fz * 0.3], 10, 0.7, 8, cs, [1, 0.62, 0.24], { life: 0.5, grav: 22, size: 0.07, stretch: 1.6 });
  }

  /** The hook picks up a wire: it comes taut with a crack and a spray of sparks along the deck. */
  wireCatch(e) {
    const p = e.plane, cam = this.engine.cam;
    if (Math.hypot(p.x - cam.x, p.z - cam.z) > 1500) return;
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    this.sparks(p.x - fx * (p.back || 4), p.y - 1.6, p.z - fz * (p.back || 4), [-fx * 0.2, 0.35, -fz * 0.2], 12, 0.8, 9, 1, [1, 0.66, 0.26], { life: 0.5, grav: 22, size: 0.07, stretch: 1.6 });
  }

  /** An aircraft on a flight deck: the exhaust of a radial engine starting and idling, the spark of the hook dragging on the deck. */
  deckPlane(dt, p, d, fx, fz, acc) {
    const L = p.spec.L, eng = p.eng || 0;
    const cs = d > 900 ? 1.4 : 1;
    // exhaust: a puff from each side of the cowling, thick and dark at the first turns of the propeller, a thin haze when it idles
    if (eng > 0.02 && p.phase !== 'rollout') {
      const start = p.ds === 'spot' && p.ts < 4 ? 1 : 0;
      let a = (acc.get('e' + p.id) || 0) + dt * (start ? 14 : p.phase === 'takeoff' ? 12 : 4) * this.emitScale;
      while (a >= 1) {
        a -= 1;
        const side = rnd() < 0.5 ? -1 : 1, rx = Math.cos(p.heading), rz = Math.sin(p.heading);
        const nx = p.x + fx * (L * 0.42 - 1.2) + rx * side * 0.75, nz = p.z + fz * (L * 0.42 - 1.2) + rz * side * 0.75;
        const dark = start ? 0.06 : p.phase === 'takeoff' ? 0.16 : 0.34;
        this.p.add({ kind: K.SMOKE, x: nx, y: p.y + 0.15, z: nz, vx: p.vx * 0.8 - fx * rr(0.5, 2.5) + rx * side * rr(0.2, 1.2), vy: rr(0.3, 1.3), vz: p.vz * 0.8 - fz * rr(0.5, 2.5) + rz * side * rr(0.2, 1.2), s0: 0.35 * cs, s1: (start ? rr(2.2, 3.4) : rr(1.2, 2.0)) * cs, life: start ? rr(1.4, 2.4) : rr(0.9, 1.6), r: dark, g: dark, b: dark * 1.02, a0: start ? 0.55 : 0.3, a1: 0, drag: 0.7, wind: 1, grav: -0.25 });
      }
      acc.set('e' + p.id, a);
    }
    // the hook dragging along the deck, until the wire has it
    if (p.phase === 'rollout' && p.hook > 0.5 && (p.ds === 'roll' || (p.ds === 'arrest' && p.u > 3)) && d < 1200) {
      const back = p.back || 4, hy = p.y - 1.6;
      const x = p.x - fx * back, z = p.z - fz * back;
      this.sparks(x, hy, z, [-fx * 0.4, 0.35, -fz * 0.4], Math.round(dt * 40), 0.6, 7, cs, [1, 0.62, 0.24], { life: 0.45, grav: 22, size: 0.07, stretch: 1.6 });
    }
  }

  /** Burning wreckage trails smoke and fire. */
  updateDebris(dt, world, cam) {
    for (const dd of world.debris) {
      if (dd.burn <= 0.05) continue;
      const d = Math.hypot(dd.x - cam.x, dd.z - cam.z);
      if (d > 9000) continue;
      dd.trail += dt * (10 + 22 * dd.burn) * this.emitScale * (d > 3000 ? 0.5 : 1);
      while (dd.trail >= 1) {
        dd.trail -= 1;
        const sz = clamp(dd.size, 1, 14);
        this.p.add({ kind: K.SMOKE, x: dd.x + rr(-0.5, 0.5), y: dd.y + rr(-0.5, 0.5), z: dd.z + rr(-0.5, 0.5), vx: dd.vx * 0.05, vy: rr(0.5, 2), vz: dd.vz * 0.05, s0: 1.3 + sz * 0.2, s1: 6 + sz * 1.3, life: rr(3, 6), r: 0.06, g: 0.058, b: 0.055, a0: 0.75, a1: 0, drag: 0.5, wind: 1 });
        if (dd.burn > 0.45 && rnd() < 0.6) this.p.add({ kind: K.FIRE, x: dd.x, y: dd.y, z: dd.z, vx: dd.vx * 0.1, vy: 1, vz: dd.vz * 0.1, s0: 0.9 + sz * 0.2, s1: 2.5 + sz * 0.6, life: rr(0.25, 0.5), r: 1, g: 0.6, b: 0.2, a0: 3, a1: 0, drag: 1.5 });
      }
    }
  }

  /** Burning fuel on the water. */
  updateSeaFires(dt, world, cam) {
    for (const f of world.seaFires) {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      if (d > 12000) continue;
      const fade = clamp(f.t / 8, 0, 1);
      f.acc = (f.acc || 0) + dt * (4 + f.r * 0.5) * f.power * fade * this.emitScale;
      while (f.acc >= 1) {
        f.acc -= 1;
        const a = rnd() * 6.283, rad = Math.sqrt(rnd()) * f.r;
        const x = f.x + Math.cos(a) * rad, z = f.z + Math.sin(a) * rad;
        this.p.add({ kind: K.FIRE, x, y: 0.6, z, vy: rr(1.5, 5), s0: 2.2 + f.r * 0.12, s1: rr(4, 8) + f.r * 0.2, life: rr(0.5, 1.1), r: 1, g: 0.6, b: 0.2, a0: 3.2, a1: 0, drag: 1 });
        if (rnd() < 0.45) this.p.add({ kind: K.SMOKE, x, y: 2, z, vx: 0, vy: rr(6, 12), vz: 0, s0: 3 + f.r * 0.2, s1: rr(24, 40) + f.r * 0.7, life: rr(12, 20), r: 0.05, g: 0.048, b: 0.045, a0: 0.62 * f.power, a1: 0, drag: 0.08, wind: 1, grav: -0.55 });
      }
    }
  }

  /** The foam of a shock wave spreading over the sea. */
  updateRings(dt, world, cam) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const rad = (60 + 330 * Math.sqrt(r.size) * r.t) * (1 - Math.exp(-r.t * 3) * 0.3);
      if (r.t > 2.2) { this.rings.splice(i, 1); continue; }
      if (Math.hypot(r.x - cam.x, r.z - cam.z) > 3000) continue;
      const fade = 1 - r.t / 2.2;
      const n = 20;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.283;
        this.engine.foam.add(r.x + Math.cos(a) * rad, r.z + Math.sin(a) * rad, r.x + Math.cos(a + 0.2) * rad, r.z + Math.sin(a + 0.2) * rad, 14 + 10 * r.size, 0.2 * fade, 0.9 * fade, 0.7 * fade);
      }
    }
  }

  /** Smoke from the stumps of destroyed funnels and bridges, burning magazine hits... */
  updateWrecks(dt, world, cam) {
    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d > 12000) continue;
      const fxs = s._fx || (s._fx = { smoke: 0, fire: 0, steam: 0 });
      let n = 0;
      for (const m of s.modules) if (m.state === 2 && m.part != null) n++;
      if (!n) continue;
      fxs.wreck = (fxs.wreck || 0) + dt * Math.min(n, 4) * 2.2 * this.emitScale;
      while (fxs.wreck >= 1) {
        fxs.wreck -= 1;
        const cand = s.modules.filter((m) => m.state === 2 && m.part != null);
        const m = cand[Math.floor(rnd() * cand.length)];
        const w = s.toWorld(m.x, Math.max(2, m.y - m.hy * 0.6), m.z, this._v);
        this.p.add({ kind: K.SMOKE, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5, vy: rr(3, 8), vz: s.vz * 0.5, s0: 2.5, s1: rr(14, 26), life: rr(7, 13), r: 0.05, g: 0.048, b: 0.045, a0: 0.75, a1: 0, drag: 0.25, wind: 1, grav: -0.15 });
      }
    }
  }
}
