// Hit effects: shell impacts on steel, sparks, explosions, killed modules and mounts, breaking up ships. (mixed into Effects, see ../effects.js)
import { clamp } from '../../math.js';
import { K } from '../particles.js';
import { rnd, rr } from './common.js';

export class HitFx {
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
      for (let i = 0; i < 9; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-40, 40), vy: rr(10, 60), vz: rr(-40, 40), s0: 0.25 * cs, life: rr(0.3, 0.7), r: 1, g: 0.75, b: 0.35, a0: 1.6, a1: 0, grav: 20, stretch: 3 * cs });
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
    for (let i = 0; i < 12; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-60, 60), vy: rr(10, 80), vz: rr(-60, 60), s0: 0.35 * cs, life: rr(0.4, 1.1), r: 1, g: 0.7, b: 0.3, a0: 1.6, a1: 0, grav: 20, stretch: 4 * cs });
    this.addShake(0.16 * cs * big, e.x, e.z);
  }

  /** A shower of sparks / fragments from a point, spread round a direction (unit vector). */
  sparks(x, y, z, dir, n, cone, speed, cs, col = [1, 0.72, 0.3], o = {}) {
    const p = this.p;
    // (in daylight hot fragments are dull orange specks: twenty bright streaks with the bloom over them were a firework)
    n = Math.max(2, Math.round(n * 0.55 * this.emitScale));
    for (let i = 0; i < n; i++) {
      // a random direction inside the cone round `dir`
      let vx = dir[0] + rr(-cone, cone), vy = dir[1] + rr(-cone, cone) * (o.flat ? 0.5 : 1), vz = dir[2] + rr(-cone, cone);
      const l = Math.hypot(vx, vy, vz) || 1, sp = speed * rr(0.35, 1.0);
      p.add({ kind: K.TRACER, x, y, z, vx: vx / l * sp, vy: vy / l * sp + (o.lift || 0), vz: vz / l * sp, s0: (o.size || 0.3) * cs, life: rr(0.3, o.life || 0.9), r: col[0], g: col[1], b: col[2], a0: 1.6, a1: 0, grav: o.grav ?? 12, stretch: (o.stretch || 3.5) * cs });
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
          p.add({ kind: K.TRACER, x: e.x + rd[0] * dl, y: e.y + rd[1] * dl, z: e.z + rd[2] * dl, vx: rd[0] * rr(25, 80) + rr(-8, 8), vy: rr(5, 26), vz: rd[2] * rr(25, 80) + rr(-8, 8), s0: 0.4 * cs, life: rr(0.35, 0.9), r: 1, g: 0.8, b: 0.4, a0: 2, a1: 0, grav: 18, stretch: 4 * cs });
        }
        p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rd[0] * 260, vy: rd[1] * 260, vz: rd[2] * 260, s0: 0.5 * cs, life: 1.3, r: 1, g: 0.55, b: 0.22, a0: 2.4, a1: 0, grav: 6, stretch: 22 * cs });
        dust(e.x, e.y, e.z, 3 * cs, 0.3, 0.5, 1.6);
        this.addShake(0.02 * cs, e.x, e.z);
        return;
      }
      // the plate holds: orange flash, a hail of sparks, a lump of the shell's nose flung away, a puff of dust
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 5 * cs, s1: 11 * cs, life: 0.1, r: 1, g: 0.7, b: 0.3, a0: 8, a1: 0 });
      this.sparks(e.x, e.y, e.z, [rd[0] * 0.6 + back[0] * 0.4, rd[1] * 0.6 + 0.5, rd[2] * 0.6 + back[2] * 0.4], 24, 0.9, 85, cs, [1, 0.72, 0.28], { life: 1 });
      p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rd[0] * 120, vy: rd[1] * 120 + 20, vz: rd[2] * 120, s0: 0.45 * cs, life: 0.9, r: 1, g: 0.5, b: 0.2, a0: 2, a1: 0, grav: 20, stretch: 8 * cs });
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
        p.add({ kind: K.TRACER, x: ex[0], y: ex[1], z: ex[2], vx: dir[0] * 280, vy: dir[1] * 280, vz: dir[2] * 280, s0: 0.5 * cs, life: 0.9, r: 1, g: 0.45, b: 0.18, a0: 2.4, a1: 0, grav: 12, stretch: 20 * cs });
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
        if (d < 3500) this.vents(e.x, e.y, e.z, back, cs);
        this.addShake(0.2 * cs, e.x, e.z);
      });
      return;
    }
    // high explosive: instant, bright and wide (on contact, or just behind a thin skin)
    const inside = e.inside, big = k === 'penetrate' ? 1.0 : 0.85;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 1, z: e.z, s0: 16 * cs * big, s1: 36 * cs * big, life: 0.14, r: 1, g: 0.82, b: 0.52, a0: 6.5, a1: 0 });
    if (cs >= 0.8) this.flashLight(e.x, e.y + 2, e.z, 8 * cs * big, 25, 0.15);
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

  /** Smoke and flame that jet from the openings of a hull burst inside, for two or three seconds, weaker and weaker. */
  vents(x, y, z, back, cs, dur = 2.6) {
    const step = 0.13, p = this.p;
    let t = 0;
    const tick = () => {
      t += step;
      if (t > dur) return;
      const k = 1 - t / dur;
      const jd = [back[0] + rr(-0.5, 0.5), 0.5 + rr(0, 0.8), back[2] + rr(-0.5, 0.5)], l = Math.hypot(jd[0], jd[1], jd[2]) || 1;
      const sp = rr(8, 20) * Math.sqrt(cs);
      const px = x + rr(-2, 2) * cs, py = y + rr(0, 2) * cs, pz = z + rr(-2, 2) * cs;
      if (rnd() < 0.2 + 0.7 * k) p.add({ kind: K.SMOKE, x: px, y: py, z: pz, vx: jd[0] / l * sp, vy: jd[1] / l * sp, vz: jd[2] / l * sp, s0: 1.2 * cs, s1: rr(4, 9) * cs, life: rr(3, 6), r: 0.05 + 0.2 * (1 - k), g: 0.05 + 0.2 * (1 - k), b: 0.05 + 0.2 * (1 - k), a0: 0.6, a1: 0, drag: 0.5, wind: 1, grav: -0.2 });
      if (rnd() < 0.55 * k) p.add({ kind: K.FLAME, x: px, y: py, z: pz, vx: jd[0] / l * sp * 0.6, vy: jd[1] / l * sp * 0.6, vz: jd[2] / l * sp * 0.6, s0: 1.4 * cs, s1: 0.7 * cs, life: rr(0.25, 0.5), rot: 0, rotV: 0, r: 1, g: 0.5, b: 0.12, a0: 15, a1: 0, drag: 1.5 });
      this.later(step, tick);
    };
    tick();
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
    this.flashLight(e.x, e.y + 20 * s, e.z, 60 * s, 60, 1.2, [1, 0.6, 0.3]);      // a magazine going up lights the sea and the ships round it
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
      p.add({ kind: K.TRACER, x: e.x, y: e.y + 8, z: e.z, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp * 1.4, vz: Math.sin(a) * Math.cos(el) * sp, s0: 0.7, life: rr(1.5, 4), r: 1, g: 0.62, b: 0.25, a0: 2, a1: 1, grav: 14, drag: 0.04, stretch: 4 });
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
    if (d < 1300) this.engine.foam.add(e.x, e.z, e.x, e.z, 70 * s, 0.5, 0.9, 0.7);       // the sea scoured under the blast (not a white slab filling the view)
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
    for (let i = 0; i < nt; i++) p.add({ kind: K.TRACER, x: w[0], y: w[1], z: w[2], vx: rr(-45, 45), vy: rr(8, 55), vz: rr(-45, 45), s0: 0.25, life: rr(0.4, 1), r: 1, g: 0.7, b: 0.3, a0: 1.5, a1: 0, grav: 18, stretch: 3 });
    this.addShake(0.05 * big, w[0], w[2]);
  }

  mountKilled(e) {
    const s = e.ship, m = e.mount;
    const w = s.toWorld(m.rec.x, m.rec.y + 1.5, m.rec.z, this._v);
    this.impact({ kind: 'penetrate', x: w[0], y: w[1], z: w[2], cal: Math.max(m.rec.cal, 200) });
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
    for (let i = 0; i < 10; i++) this.p.add({ kind: K.TRACER, x: e.x, y: 5, z: e.z, vx: rr(-30, 30), vy: rr(5, 35), vz: rr(-30, 30), s0: 0.3, life: rr(0.4, 0.9), r: 1, g: 0.7, b: 0.3, a0: 1.5, a1: 0, grav: 20, stretch: 3 });
    this.p.add({ kind: K.SMOKE, x: e.x, y: 6, z: e.z, vy: 4, s0: 6, s1: 28, life: 6, r: 0.3, g: 0.28, b: 0.26, a0: 0.6, a1: 0, wind: 1, drag: 0.4 });
    this.addShake(0.2, e.x, e.z);
  }
}
