// Gun effects: muzzle blast and flash, machine guns, anti-aircraft fire, flak, torpedo launch. (mixed into Effects, see ../effects.js)
import { clamp } from '../../math.js';
import { K } from '../particles.js';
import { rnd, rr, stoch } from './common.js';

export class GunFx {
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
      const nr = stoch(9 * es);
      for (let i = 0; i < nr; i++) {
        const th = (i / Math.max(nr, 1)) * 6.283 + rnd() * 0.3, cs = Math.cos(th), sn = Math.sin(th);
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
    const ns = stoch((heavy ? 8 : mid ? 3.5 : 1.5) * es * lod);
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
      // the pressure of the blast: a ring that spreads over the sea under the muzzle (white water thrown up), and, for the heavy guns, a halo of condensation
      if (first && heavy && d < 3000 && wy < 60) {
        for (let k = 1; k <= 3; k++) this.later(k * 0.11, () => {
          const rad = R * (1.0 + 1.0 * k), w = R * 0.1, sg = 12;
          for (let i = 0; i < sg; i++) {
            const a0 = i / sg * 6.283, a1 = (i + 1.1) / sg * 6.283;
            this.engine.foam.add(b[0] + hx * R * 2.5 + Math.cos(a0) * rad, b[2] + hz * R * 2.5 + Math.sin(a0) * rad, b[0] + hx * R * 2.5 + Math.cos(a1) * rad, b[2] + hz * R * 2.5 + Math.sin(a1) * rad, w, 0.1, 0.45, 0.22);
          }
        });
      }
      if (first && heavy && lod > 0.5) p.add({ kind: K.SMOKE, x: b[0] + dx * R * 1.2, y: b[1] + dy * R * 1.2, z: b[2] + dz * R * 1.2, s0: R * 2, s1: R * 5, life: 0.35, r: 0.95, g: 0.97, b: 1, a0: 0.3, a1: 0, drag: 2 });
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

  /**
   * A fighter's guns (or a bomber's gunner): tracer rounds from the guns themselves (in the wings of a fighter, converging a few hundred metres ahead), flying on past the
   * target with the speed of the aircraft added, dropping and slowing; a little flash at each gun.
   */
  mgFire(e) {
    const pl = e.plane, cx = this.engine.cam.x, cy = this.engine.cam.y, cz = this.engine.cam.z;
    const d = Math.hypot(e.x - cx, e.y - cy, e.z - cz);
    if (d > 6000) return;
    const L = Math.hypot(e.dx, e.dy, e.dz) || 1, fx = e.dx / L, fy = e.dy / L, fz = e.dz / L;
    // the guns: out in the wings of a fighter (the right-hand vector of the aircraft, banked), the turret of a bomber at the given point
    const wing = pl.fighter ? (pl.spec.span || 11) * 0.3 : 0, b = pl.bank || 0, h = pl.heading;
    const rx = Math.cos(h) * Math.cos(b), ry = -Math.sin(b), rz = Math.sin(h) * Math.cos(b);
    const conv = clamp(e.range, 180, 320);
    for (let side = -1; side <= 1; side += 2) {
      if (!wing && side > 0) break;
      const gx = e.x + rx * wing * side, gy = e.y + ry * wing * side, gz = e.z + rz * wing * side;
      // the line from this gun to the point where the guns converge
      let ux = e.x + fx * conv - gx, uy = e.y + fy * conv - gy, uz = e.z + fz * conv - gz;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      if (rnd() < 0.7) this.round(gx, gy, gz, ux, uy, uz, 870, 12.7, this.tint(pl), pl, { life: rr(1.1, 1.5), spread: 0.004 });
      if (d < 1500 && rnd() < 0.5) this.p.add({ kind: K.FLASH, x: gx + ux * 0.8, y: gy + uy * 0.8, z: gz + uz * 0.8, s0: 0.5, s1: 1.1, life: 0.04, r: 1, g: 0.75, b: 0.4, a0: 2.5, a1: 0 });
    }
    this.strayRounds(e, Math.hypot(e.x - cx, e.z - cz), 12.7);
  }

  /** The colour of the tracers of a side: red for the Americans and the British, orange-yellow for the Germans and the Italians, white-green for the Japanese. */
  tint(src) {
    const n = (src && (src.nation || (src.spec && src.spec.nation) || (src.stats && src.stats.nation))) || (src && src.base && src.base.nation) || 'USA';
    return n === 'Japan' ? [0.62, 1, 0.5] : n === 'Germany' || n === 'Italy' ? [1, 0.5, 0.1] : n === 'France' ? [1, 0.38, 0.1] : [1, 0.18, 0.05];
  }

  /**
   * One tracer round: it leaves the muzzle at v0 (plus the speed of what fires it), slows with the drag and drops with the weight, and burns for `life` seconds. Rounds of 25 mm
   * and more burst at the end of the tracer (the self-destroying fuze), a small grey puff. o: { life, spread (rad), carrier (velocity added), burst }
   */
  round(x, y, z, ux, uy, uz, v0, cal, col, carrier, o = {}) {
    const sp = o.spread ?? 0.006;
    ux += (rnd() - 0.5) * 2 * sp; uy += (rnd() - 0.5) * 2 * sp; uz += (rnd() - 0.5) * 2 * sp;
    const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const k = cal >= 37 ? 0.17 : cal >= 25 ? 0.22 : cal >= 20 ? 0.28 : 0.33, g = 9.81;
    const vx = ux * v0 + (carrier ? carrier.vx || 0 : 0), vy = uy * v0 + (carrier ? carrier.vy || 0 : 0), vz = uz * v0 + (carrier ? carrier.vz || 0 : 0);
    const life = o.life ?? (cal >= 37 ? 3.4 : cal >= 25 ? 2.8 : 2.2);
    const big = cal >= 37 ? 1 : cal >= 25 ? 0.8 : cal >= 20 ? 0.65 : 0.5;
    // (the streak is about what the eye keeps of a round at 800 m/s, a few hundredths of a second of its path, as in the films of the time)
    this.p.add({ kind: K.TRACER, x, y, z, vx, vy, vz, s0: 0.32 * big, life, r: col[0], g: col[1], b: col[2], a0: 2.4, a1: 1.5, grav: g, drag: k, stretch: 18 * big + 4 });
    if (cal >= 25 && (o.burst ?? true) && rnd() < 0.35) {
      // where the round is when the tracer burns out: v(t) = v0 e^-kt, the weight acting against the drag
      const e1 = 1 - Math.exp(-k * life), bx = x + vx * e1 / k, bz = z + vz * e1 / k, by = y + (vy + g / k) * e1 / k - g / k * life;
      if (by > 40 && Math.hypot(bx - this.engine.cam.x, by - this.engine.cam.y, bz - this.engine.cam.z) < 7000) this.later(life, () => this.selfBurst(bx, by, bz, cal));
    }
  }

  /** The burst of a light AA shell at the end of its tracer: a flash and a small puff of grey smoke that hangs. */
  selfBurst(x, y, z, cal) {
    const s = cal >= 37 ? 1 : 0.7;
    this.p.add({ kind: K.FLASH, x, y, z, s0: 1.2 * s, s1: 2.6 * s, life: 0.06, r: 1, g: 0.6, b: 0.25, a0: 1.8, a1: 0 });
    this.p.add({ kind: K.SMOKE, x, y, z, vx: rr(-0.5, 0.5), vy: rr(-0.2, 0.4), vz: rr(-0.5, 0.5), s0: 1.6 * s, s1: rr(4, 6) * s, life: rr(3.5, 6), r: 0.28, g: 0.27, b: 0.26, a0: 0.75, a1: 0, wind: 1, drag: 0.6 });
  }

  /** The rounds of a burst that go on past the target and fall into the sea: plumes along the line (the rounds that skim the water at a grazing angle skip). */
  strayRounds(e, d, cal) {
    const L = Math.hypot(e.dx, e.dy, e.dz) || 1, dy = e.dy / L;
    if (dy > -0.03 || e.y < 2 || d > 3200) return;
    const dist = e.y / -dy;
    if (dist > 3500) return;
    const grazing = -dy < 0.26;
    const n = grazing ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (rnd() > 0.55) continue;
      const sg = 0.012 * dist, ox = rr(-sg, sg), oz = rr(-sg, sg);
      let x = e.x + e.dx / L * dist + ox, z = e.z + e.dz / L * dist + oz;
      this.later(dist / 780 + i * 0.02, () => {
        this.bulletSplash(x, z, cal, grazing);
        // a round at a grazing angle skips: a second, smaller plume 20-60 m on
        if (grazing && rnd() < clamp(0.9 - (-dy) * 3.4, 0, 0.7)) {
          const hop = rr(20, 60), hl = Math.hypot(e.dx, e.dz) || 1;
          this.later(hop / 700, () => this.bulletSplash(x + e.dx / hl * hop, z + e.dz / hl * hop, cal * 0.6, true));
        }
      });
    }
  }

  /**
   * A burst of a light AA mount: a tracer round from each barrel, laid on where the aircraft will be when it gets there (the lead and the drop allowed for, with the scatter of
   * the guns), that goes on past it when it misses, dropping and slowing, until the tracer burns out (and the shell bursts, from 25 mm); the flash at the muzzles.
   */
  aaFire(e) {
    const pl = e.plane, cam = this.engine.cam;
    const d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z);
    if (d > 7000 && Math.hypot(pl.x - cam.x, pl.y - cam.y, pl.z - cam.z) > 5000) return;
    const cal = e.cal || 20, v0 = cal >= 37 ? 870 : cal >= 25 ? 900 : 840, k = cal >= 37 ? 0.17 : cal >= 25 ? 0.22 : 0.28, g = 9.81;
    // the time of flight to where the aircraft will be (s(T) = v0 (1 - e^-kT) / k), a few rounds of refinement
    let T = Math.hypot(pl.x - e.x, pl.y - e.y, pl.z - e.z) / v0, ax = 0, ay = 0, az = 0;
    for (let i = 0; i < 3; i++) {
      ax = pl.x + pl.vx * T - e.x; ay = pl.y + (pl.vy || 0) * T - e.y; az = pl.z + pl.vz * T - e.z;
      const D = Math.hypot(ax, ay, az), q = k * D / v0;
      T = q < 0.95 ? -Math.log(1 - q) / k : D / v0 * 3;
    }
    // aimed above the point by the drop of the round over that time
    ay += g / k * (T - (1 - Math.exp(-k * T)) / k);
    const al = Math.hypot(ax, ay, az) || 1;
    const col = this.tint(e.ship || e.base), n = Math.min(e.n || 1, cal >= 37 ? 2 : 2);
    // the scatter of the guns: wider for a light mount and for an aircraft that is jinking
    const spread = (cal >= 37 ? 0.005 : 0.008) * (1 + (pl.harass || 0) * 0.3);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 0.6;
      this.round(e.x + o * Math.cos(pl.heading || 0), e.y, e.z + o * Math.sin(pl.heading || 0), ax / al, ay / al, az / al, v0, cal, col, null, { spread });
    }
    if (d < 7000) {
      this.p.add({ kind: K.FLASH, x: e.x, y: e.y + 0.6, z: e.z, s0: cal >= 30 ? 2.4 : 1.6, s1: cal >= 30 ? 4.5 : 2.8, life: 0.06, r: 1, g: 0.75, b: 0.42, a0: 3.2, a1: 0 });
      if (d < 2500 && rnd() < 0.35) this.p.add({ kind: K.SMOKE, x: e.x, y: e.y + 0.5, z: e.z, vy: 1.5, s0: 0.8, s1: 3.4, life: 1.6, r: 0.7, g: 0.68, b: 0.64, a0: 0.3, a1: 0, wind: 1, drag: 1 });
    }
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

  torpedoLaunch(e) {
    if (this.distToCam(e.x, e.z) > 6000) return;
    for (let i = 0; i < 6; i++) this.p.add({ kind: K.SPRAY, x: e.x, y: 0.5, z: e.z, vx: rr(-3, 3), vy: rr(4, 9), vz: rr(-3, 3), s0: 1.2, s1: 4, life: rr(0.8, 1.6), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
  }
}
