// Aircraft effects: hits, crashes, ditching, the wake of a flying machine and the deck (touch-down, arrestor wire). (mixed into Effects, see ../effects.js)
import { clamp } from '../../math.js';
import { K } from '../particles.js';
import { DECK_PHASES } from '../../sim/deck.js';
import { rnd, rr } from './common.js';

export class AirFx {
  /**
   * An aircraft is hit: the flashes of the rounds bursting on the airframe (small, a metre or so, scattered over the wings and the fuselage), a few sparks, and now and then a
   * puff of debris. A shell of 20 mm and more makes a bigger flash than a machine-gun round.
   */
  planeHit(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 9000) return;
    const p = this.p, pl = e.plane, cal = e.cal || 12.7, k = cal >= 37 ? 1.6 : cal >= 20 ? 1.1 : 0.7;
    const half = (pl.spec && pl.spec.span || 11) * 0.4, h = pl.heading || 0, rx = Math.cos(h), rz = Math.sin(h), fx = Math.sin(h), fz = -Math.cos(h);
    const n = cal >= 20 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = rr(-1, 1) * half, f = rr(-0.25, 0.25) * half;
      const x = e.x + rx * a + fx * f + pl.vx * 0.016, y = e.y + rr(-0.4, 0.5), z = e.z + rz * a + fz * f + pl.vz * 0.016;
      p.add({ kind: K.FLASH, x, y, z, vx: pl.vx, vy: pl.vy || 0, vz: pl.vz, s0: 0.5 * k, s1: 1.3 * k, life: 0.05, r: 1, g: 0.82, b: 0.55, a0: 3, a1: 0 });
      for (let j = 0; j < 2; j++) p.add({ kind: K.TRACER, x, y, z, vx: rr(-25, 25) + pl.vx * 0.8, vy: rr(-15, 25) + (pl.vy || 0) * 0.8, vz: rr(-25, 25) + pl.vz * 0.8, s0: 0.12, life: rr(0.15, 0.4), r: 1, g: 0.72, b: 0.35, a0: 2.2, a1: 0, grav: 6, stretch: 1.6 });
    }
    if (rnd() < (cal >= 20 ? 0.6 : 0.25)) p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vx: pl.vx * 0.3, vy: 1, vz: pl.vz * 0.3, s0: 0.6 * k, s1: 3.5 * k, life: 1.8, r: 0.3, g: 0.28, b: 0.26, a0: 0.45, a1: 0, wind: 1, drag: 0.8 });
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
          if (hot && rnd() < 0.7) this.p.add({ kind: K.FLAME, x: p.x - fx * (tail * 0.4) + jx, y: p.y + jy + 0.3, z: p.z - fz * (tail * 0.4) + jz, vx: p.vx * 0.5, vy: p.vy * 0.5 + 1, vz: p.vz * 0.5, s0: 1.7, s1: rr(2, 3.2), life: rr(0.25, 0.5), rot: 0, rotV: 0, r: 1, g: 0.5, b: 0.12, a0: 15, a1: 0, drag: 1.2 });
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
}
