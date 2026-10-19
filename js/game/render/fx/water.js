// Water effects: shell splashes, rounds that fall in the sea, the rings of shock waves, shores and rock impacts. (mixed into Effects, see ../effects.js)
import { clamp } from '../../math.js';
import { K } from '../particles.js';
import { rnd, rr } from './common.js';

export class WaterFx {
  /**
   * A shell hits the sea. The column is built in stages, as in the photographs of salvos falling short: a dark slick and a core of dark water at the foot, the column
   * itself thrown up over most of a second (it is the first drops that reach the top), the crown that opens up there, the collapse and the low surge that spreads
   * from the foot, the droplets that fly out on ballistic paths, a mist that drifts; on the foam of the sea, a disc, a ring that spreads and a second patch where the column falls.
   * The height of the column follows the calibre (about 30 m for a 406 mm shell, 11 m for a 127 mm one); an armour-piercing shell throws up a taller, narrower column
   * (a fraction of a second after it has gone in), a high-explosive shell bursts at once on the surface: a lower, wider crown with a flash and grey smoke.
   */
  splash(e) {
    const d = this.distToCam(e.x, e.z);
    const cs = clamp(e.cal / 400, 0.18, 1.7);
    if (d > 22000 * (0.4 + cs)) return;
    this.addShake(0.02 * cs, e.x, e.z);
    const p = this.p, es = this.emitScale, lod = d > 12000 ? 0.25 : d > 6000 ? 0.45 : d > 2500 ? 0.7 : 1;
    const ap = e.shell === 'AP', he = e.shell === 'HE';
    const H = 40 * Math.pow(Math.max(e.cal, 40) / 406, 0.9) * (ap ? 0.9 : he ? 0.6 : 0.75);
    const v0 = Math.sqrt(2 * 12 * H), wid = ap ? 0.7 : he ? 1.35 : 1;
    const at = (a, r) => [e.x + Math.cos(a) * r, e.z + Math.sin(a) * r];
    const N = (n) => Math.max(1, Math.round(n * es * lod));
    if (he) {
      p.add({ kind: K.FLASH, x: e.x, y: 0.2 * H, z: e.z, s0: 0.18 * H, s1: 0.4 * H, life: 0.07, r: 1, g: 0.85, b: 0.6, a0: 5, a1: 0 });
      for (let i = 0; i < N(5); i++) p.add({ kind: K.SMOKE, x: e.x + rr(-0.1, 0.1) * H, y: rr(0.05, 0.2) * H, z: e.z + rr(-0.1, 0.1) * H, vy: rr(2, 6), s0: 0.12 * H, s1: rr(0.35, 0.6) * H, life: rr(2, 3.5), r: 0.3, g: 0.3, b: 0.3, a0: 0.45, a1: 0, drag: 0.5, wind: 1 });
    }
    // the dark slick and core of dark water at the foot (the first instant)
    for (let i = 0; i < N(8); i++) {
      const [x, z] = at(rnd() * 6.283, rr(0, 0.08) * H);
      p.add({ kind: K.SMOKE, x, y: rr(0, 0.25) * H, z, vy: rr(0.3, 0.5) * H, s0: 0.12 * H, s1: 0.3 * H, life: 1.0, r: 0.3, g: 0.31, b: 0.3, a0: 0.5, a1: 0, drag: 0.6 });
    }
    // the column: thrown up over 0.7 s, the first drops fastest (they reach the top)
    const total = N(40 + 70 * Math.sqrt(cs));
    for (let burst = 0; burst < 5; burst++) {
      const n = Math.max(1, Math.round(total / 5)), t0 = burst * 0.15 + (ap ? 0.12 : 0);
      this.later(t0, () => {
        for (let i = 0; i < n; i++) {
          const [x, z] = at(rnd() * 6.283, rnd() * 0.11 * H * wid);
          const a = rnd() * 6.283, out = rr(0, 0.12) * v0 * wid;
          p.add({ kind: K.SPRAY, x, y: 0.3, z, vx: Math.cos(a) * out, vy: rr(0.55, 1.0) * v0, vz: Math.sin(a) * out, s0: 0.06 * H, s1: 0.15 * H * rr(0.9, 1.2), life: rr(4, 6), r: 0.97, g: 1, b: 1, a0: 0.9, a1: 0, grav: 12, drag: 0.15, wind: 0.4 });
          // streaks of water along the column: its texture
          if (i % 3 === 0) p.add({ kind: K.SPRAY, x, y: 0.3, z, vx: Math.cos(a) * out * 0.5, vy: rr(0.7, 1.0) * v0, vz: Math.sin(a) * out * 0.5, s0: 0.035 * H, s1: 0.05 * H, life: rr(3, 5), r: 1, g: 1, b: 1, a0: 0.9, a1: 0, grav: 12, drag: 0.12, stretch: 0.35 * H });
        }
      });
    }
    // the crown that opens at the top, lobed
    this.later(0.45 + (ap ? 0.12 : 0), () => {
      const lobes = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < N(24); i++) {
        const lobe = Math.floor(rnd() * lobes), a = lobe / lobes * 6.283 + rr(-0.3, 0.3), out = rr(0.3, 0.6) * v0 * wid * (0.75 + 0.5 * ((lobe * 7919) % 5) / 4);
        const [x, z] = at(a, rr(0, 0.06) * H);
        p.add({ kind: K.SPRAY, x, y: rr(0.55, 0.8) * H, z, vx: Math.cos(a) * out, vy: rr(0.2, 0.5) * v0, vz: Math.sin(a) * out, s0: 0.06 * H, s1: 0.14 * H, life: rr(3, 5), r: 0.97, g: 1, b: 1, a0: 0.85, a1: 0, grav: 12, drag: 0.2, wind: 0.4 });
      }
    });
    // the droplets: ballistic, small, stretched along their paths
    for (let i = 0; i < N(25 + 40 * cs); i++) {
      const a = rnd() * 6.283, cone = rr(0.44, 1.05), sp = rr(0.7, 1.4) * v0;
      const [x, z] = at(a, rr(0, 0.05) * H);
      p.add({ kind: K.SPRAY, x, y: 0.4, z, vx: Math.cos(a) * Math.sin(cone) * sp, vy: Math.cos(cone) * sp, vz: Math.sin(a) * Math.sin(cone) * sp, s0: rr(0.1, 0.35), s1: rr(0.2, 0.5), life: rr(1.5, 3), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 9.8, drag: 0.1, stretch: sp * 0.04, wind: 0.3 });
    }
    // the mist
    for (let i = 0; i < N(3); i++) p.add({ kind: K.SMOKE, x: e.x + rr(-0.1, 0.1) * H, y: rr(0.1, 0.4) * H, z: e.z + rr(-0.1, 0.1) * H, vy: rr(1, 3), s0: 0.5 * H, s1: rr(1.0, 1.5) * H, life: 4, r: 0.85, g: 0.9, b: 0.95, a0: 0.3, a1: 0, drag: 0.5, wind: 1 });
    // the column falls back: spray coming down and a low surge spreading from the foot
    this.later(1.6 + (ap ? 0.2 : 0), () => {
      for (let i = 0; i < N(34); i++) {
        const [x, z] = at(rnd() * 6.283, rr(0, 0.16) * H * wid);
        p.add({ kind: K.SPRAY, x, y: rr(0.45, 0.85) * H, z, vx: rr(-1, 1) * 0.1 * v0, vy: -rr(0.1, 0.4) * H, vz: rr(-1, 1) * 0.1 * v0, s0: 0.1 * H, s1: 0.2 * H, life: rr(1.2, 2.2), r: 0.93, g: 0.96, b: 1, a0: 0.8, a1: 0, grav: 6, drag: 0.1, wind: 0.4 });
      }
      for (let i = 0; i < N(10); i++) {
        const a = rnd() * 6.283, sp = 0.15 * H * rr(0.8, 1.2);
        p.add({ kind: K.SMOKE, x: e.x, y: rr(0.5, 1.5), z: e.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.3, s0: 0.2 * H, s1: 0.6 * H, life: rr(3, 4), r: 0.88, g: 0.92, b: 0.95, a0: 0.35, a1: 0, drag: 1.2, wind: 1 });
      }
      if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 0.35 * H, 0.2, 0.7, 0.7);
    });
    // the sea: a disc of white water, and a ring that spreads
    if (d < 1100) {
      this.engine.foam.add(e.x, e.z, e.x, e.z, Math.max(3, 0.2 * H), 0.1, 1.0, 0.9);
      const seg = d < 500 ? 14 : 8;
      for (let k = 0; k < 8; k++) {
        const t = 0.12 + k * 0.38;
        this.later(t, () => {
          const R = (0.1 + 0.55 * Math.sqrt(t / 3)) * H * 1.3, w = Math.max(0.8, 0.07 * H), dense = 0.7 - 0.5 * (t / 3), fresh = 0.7 * (1 - t / 3.2);
          for (let i = 0; i < seg; i++) {
            const a0 = i / seg * 6.283, a1 = (i + 1.05) / seg * 6.283;
            this.engine.foam.add(e.x + Math.cos(a0) * R, e.z + Math.sin(a0) * R, e.x + Math.cos(a1) * R, e.z + Math.sin(a1) * R, w, 0.25, fresh, dense);
          }
        });
      }
    }
  }

  /** A small plume where a round of machine gun or light AA falls into the sea: a spurt, a few drops, a patch of foam. cal in mm. */
  bulletSplash(x, z, cal, grazing = false) {
    const d = this.distToCam(x, z);
    if (d > 2600) return;
    const p = this.p, k = clamp(cal / 12.7, 0.6, 3.2);
    const lod = d > 1500 ? 0.5 : 1;
    p.add({ kind: K.SPRAY, x, y: 0.2, z, vx: rr(-0.5, 0.5), vy: rr(4, 8) * (grazing ? 0.6 : 1), vz: rr(-0.5, 0.5), s0: 0.25 * k, s1: 0.9 * k, life: rr(0.5, 0.9), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 9.8, drag: 0.4 });
    for (let i = 0; i < Math.round(4 * lod * this.emitScale); i++) p.add({ kind: K.SPRAY, x, y: 0.2, z, vx: rr(-2.5, 2.5), vy: rr(5, 12), vz: rr(-2.5, 2.5), s0: 0.08, s1: 0.12, life: rr(0.5, 1.0), r: 0.95, g: 0.97, b: 1, a0: 0.7, a1: 0, grav: 9.8, drag: 0.1, stretch: 0.3 });
    if (d < 700) this.engine.foam.add(x, z, x, z, 0.6 * k, 0.1, 0.8, 0.3);
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
        this.engine.foam.add(r.x + Math.cos(a) * rad, r.z + Math.sin(a) * rad, r.x + Math.cos(a + 0.2) * rad, r.z + Math.sin(a + 0.2) * rad, 12 + 7 * r.size, 0, 0.8 * fade, 0.3 * fade);
      }
    }
  }

  /** The surf along the coasts near the camera: the foam map only keeps what is stamped on it, so the segments of the coast within reach are stamped again every few frames. */
  updateShores(T, cam, foam) {
    this._shoreF = (this._shoreF || 0) + 1;
    for (const is of T.islands) {
      if (Math.hypot(cam.x - is.x, cam.z - is.z) > is.R + 700) continue;
      const c = is.coast(), n = c.length / 4;
      for (let k = this._shoreF % 4; k < n; k += 4) {
        const o = k * 4, x0 = c[o], z0 = c[o + 1], x1 = c[o + 2], z1 = c[o + 3];
        if (Math.hypot((x0 + x1) / 2 - cam.x, (z0 + z1) / 2 - cam.z) > 640) continue;
        const v = ((k * 2654435761) >>> 0) / 4294967296;
        foam.add(x0, z0, x1, z1, 17 + 9 * v, 0.55, 0.2, 0.18);       // the wide, thin band of broken water
        foam.add(x0, z0, x1, z1, 5 + 2 * v, 0.8, 0.55, 0.6);          // the line of surf on the sand
      }
    }
  }

  /** A shell (or a torpedo) bursts on the ground of an island: a flash, a cloud of dust and smoke, earth and stones thrown up. */
  landImpact(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 14000) return;
    const p = this.p;
    const s = clamp(e.cal / 170, 0.3, 2.6) * (e.torpedo ? 1.3 : 1);
    const he = e.shell !== 'AP' || e.torpedo;
    if (he) p.add({ kind: K.FLASH, x: e.x, y: e.y + 2 * s, z: e.z, s0: 5 * s, s1: 17 * s, life: 0.28, r: 1, g: 0.72, b: 0.34, a0: 6, a1: 0 });
    const nd = Math.round((7 + 6 * s) * this.emitScale + 2);
    for (let i = 0; i < nd; i++) {
      const a = rnd() * 6.283, sv = rr(1, 9) * s;
      p.add({ kind: K.SMOKE, x: e.x + Math.cos(a) * rr(0, 3) * s, y: e.y + rr(0.5, 3), z: e.z + Math.sin(a) * rr(0, 3) * s, vx: Math.cos(a) * sv, vy: rr(3, 11) * Math.sqrt(s), vz: Math.sin(a) * sv, s0: 2.4 * s, s1: rr(11, 22) * s, life: rr(4, 9), r: 0.46, g: 0.4, b: 0.33, a0: 0.62, a1: 0, wind: 1, drag: 0.6 });
    }
    // earth and stones
    const ng = Math.round((8 + 10 * s) * this.emitScale + 3);
    for (let i = 0; i < ng; i++) {
      const a = rnd() * 6.283, sv = rr(4, 26) * Math.sqrt(s);
      p.add({ kind: K.TRACER, x: e.x, y: e.y + 1, z: e.z, vx: Math.cos(a) * sv, vy: rr(8, 40) * Math.sqrt(s), vz: Math.sin(a) * sv, s0: 0.35 * s, life: rr(0.7, 1.8), r: 0.5, g: 0.42, b: 0.34, a0: 1.2, a1: 0, grav: 22, stretch: 1.4 });
    }
    // black smoke of the burst itself for the heavy shells
    if (s > 0.8 && he) p.add({ kind: K.SMOKE, x: e.x, y: e.y + 2, z: e.z, vy: 7, s0: 5 * s, s1: 26 * s, life: 12, r: 0.1, g: 0.09, b: 0.085, a0: 0.55, a1: 0, wind: 1, drag: 0.3 });
    this.addShake(0.5 * s, e.x, e.z);
  }
}
