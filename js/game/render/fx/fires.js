// Long-lived effects of wrecks: debris, fires on the sea, wrecks that burn and sink. (mixed into Effects, see ../effects.js)
import { clamp } from '../../math.js';
import { K } from '../particles.js';
import { rnd, rr } from './common.js';

export class FireFx {
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
        this.p.add({ kind: K.FLAME, x, y: 0.6, z, vy: rr(2, 5), s0: (2.2 + f.r * 0.12) * rr(0.8, 1.3), s1: (2.2 + f.r * 0.12) * 0.5, life: rr(0.5, 1.0), rot: 0, rotV: 0, r: 1, g: 0.5, b: 0.12, a0: 15, a1: 0, drag: 1 });
        if (rnd() < 0.12) this.p.add({ kind: K.FLASH, x, y: 0.5, z, vx: rr(-1, 1), vy: rr(3, 7), vz: rr(-1, 1), s0: rr(0.07, 0.15), life: rr(1.2, 3), r: 1, g: 0.55, b: 0.15, a0: 9, a1: 0, drag: 0.3, wind: 0.7, grav: -0.5 });
        if (rnd() < 0.45) this.p.add({ kind: K.SMOKE, x, y: 2, z, vx: 0, vy: rr(6, 12), vz: 0, s0: 3 + f.r * 0.2, s1: rr(24, 40) + f.r * 0.7, life: rr(12, 20), r: 0.05, g: 0.048, b: 0.045, a0: 0.62 * f.power, a1: 0, drag: 0.08, wind: 1, grav: -0.55 });
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
