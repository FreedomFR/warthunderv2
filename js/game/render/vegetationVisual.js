// What is drawn for the plants of the islands. The ground is cut into squares of 80 m (cells) grouped by 8 x 8 into squares of 640 m (supers); the plants of a super are
// drawn up from the seed when the camera comes near (model/vegetation.js) and kept as lists of records. Each frame, for what is in view:
//   < 105 m   every plant is an instance of its own mesh (trunk, branches, crown and cards of leaves: model/treeMeshes.js level 0)
//   < 300 m   one mesh per cell, with the plants stamped at level 1 (trunk and a few lumps of foliage)
//   < 1000 m  one mesh per cell at level 2 (a trunk and three lumps)
//   beyond    one mesh per super at level 3 (one lump per plant, a part of them) up to 7 km; farther the colour of the ground tells the forest.
// Meshes are built when they are first needed (a few milliseconds a frame at most) and released when the camera has gone away.
import { scatter, SPECIES, SP, climateOf } from '../model/vegetation.js';
import { getTemplate, stampPlants, ROCK_TINT } from '../model/treeMeshes.js';

const CELL = 80, NC = 8, SUPER = CELL * NC, FAR = 7000;
const M = new Float32Array(16);
const TINT = [128, 128, 128];
const NEUTRAL = [128, 128, 128];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class VegetationVisuals {
  constructor(renderer, engine) {
    this.r = renderer;
    this.engine = engine;
    this.islands = [];
    this.handles = new Map();           // (species, variant, dry) -> { solid, cards } uploaded template meshes
    this.enabled = true;
    this.frame = 0;
    this.setQuality(0);
    this.stats = { near: 0, cells: 0, supers: 0, built: 0 };
  }

  /** level: the quality level of the game (0 best). */
  setQuality(level) {
    const q = [1, 0.9, 0.75, 0.55, 0.4][Math.max(0, Math.min(4, level | 0))];
    this.q = q;
    this.R0 = 105 * q; this.R1 = 300 * q; this.R3 = 1000 * q;
    this.maxNear = level >= 4 ? 0 : level >= 3 ? 1500 : 6000;
  }

  /** Replace the islands (a Terrain of sim/terrain.js, or null). */
  set(terrain) {
    for (const it of this.islands) for (const sup of it.supers.values()) this._free(sup);
    this.islands = [];
    if (!terrain) return;
    for (const is of terrain.islands) {
      const clim = climateOf(is);
      this.islands.push({
        is, supers: new Map(), dry: clim !== 'temperate' && clim !== 'tropical',
        rock: ROCK_TINT[is.biome] || ROCK_TINT.green,
        rockBytes: (ROCK_TINT[is.biome] || ROCK_TINT.green).map((v) => Math.min(255, v * 128)),
      });
    }
  }

  _free(sup) {
    if (sup.m3) this.r.releaseMesh(sup.m3);
    sup.m3 = null;
    if (sup.cells) for (const c of sup.cells) { if (!c) continue; if (c.m1) this.r.releaseMesh(c.m1); if (c.m2) this.r.releaseMesh(c.m2); c.m1 = c.m2 = null; }
  }

  _handle(sp, variant, dry) {
    const key = (sp * 4 + variant) * 2 + (dry ? 1 : 0);
    let h = this.handles.get(key);
    if (!h) {
      const t = getTemplate(sp, variant, 0, dry);
      h = { solid: this.r.createMesh(t.solid, 'plant ' + SPECIES[sp].name), cards: t.cards ? this.r.createMesh(t.cards, 'leaves ' + SPECIES[sp].name) : null };
      this.handles.set(key, h);
    }
    return h;
  }

  /** The plants of a super, drawn up and sorted into cells. */
  _fill(it, sup) {
    const rec = scatter(it.is, sup.x0, sup.z0, SUPER);
    sup.rec = rec;
    if (!rec.length) { sup.empty = true; return; }
    const lists = Array.from({ length: NC * NC }, () => []);
    for (let k = 0; k < rec.length; k += 8) {
      const ci = Math.min(NC - 1, Math.floor((rec[k] - sup.x0) / CELL)), cj = Math.min(NC - 1, Math.floor((rec[k + 2] - sup.z0) / CELL));
      const l = lists[cj * NC + ci];
      for (let q = 0; q < 8; q++) l.push(rec[k + q]);
    }
    sup.cells = lists.map((l, n) => l.length ? { rec: Float32Array.from(l), cx: sup.x0 + ((n % NC) + 0.5) * CELL, cz: sup.z0 + (Math.floor(n / NC) + 0.5) * CELL, m1: null, m2: null, used: 0, x0: sup.x0 + (n % NC) * CELL, z0: sup.z0 + Math.floor(n / NC) * CELL } : null);
  }

  /** Queue what is in view for this frame (after r.begin()). */
  add(cam) {
    if (!this.enabled || !this.islands.length) return;
    const r = this.r, eng = this.engine, T0 = now();
    this.frame++;
    r.setPaint(null);
    const near = [];
    let built = 0, scattered = 0;
    const budget = () => now() - T0 < 7;
    const stats = this.stats; stats.near = 0; stats.cells = 0; stats.supers = 0;
    for (const it of this.islands) {
      const is = it.is;
      if (Math.hypot(is.x - cam.x, is.z - cam.z) - is.R > FAR) continue;
      const i0 = Math.floor((is.x - is.R) / SUPER), i1 = Math.floor((is.x + is.R) / SUPER), j0 = Math.floor((is.z - is.R) / SUPER), j1 = Math.floor((is.z + is.R) / SUPER);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x0 = i * SUPER, z0 = j * SUPER;
        const key = i * 100003 + j;
        let sup = it.supers.get(key);
        const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + SUPER)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + SUPER));
        const dmin = Math.hypot(dx, dz, Math.max(0, cam.y - 40));
        if (dmin > FAR) continue;
        if (sup && sup.empty) continue;
        if (!eng.sphereVisible(x0 + SUPER / 2 - cam.x, 20 - cam.y, z0 + SUPER / 2 - cam.z, SUPER * 0.72 + 30)) continue;
        if (!sup) {
          // a super over open sea is skipped without drawing its plants up when the island does not reach it
          if (x0 + SUPER < is.x - is.R || x0 > is.x + is.R || z0 + SUPER < is.z - is.R || z0 > is.z + is.R) continue;
          sup = { x0, z0, rec: null, cells: null, empty: false, m3: null, used: 0 };
          it.supers.set(key, sup);
        }
        if (!sup.rec) {
          if (scattered >= 1 || !budget()) continue;
          this._fill(it, sup); scattered++;
          if (sup.empty) continue;
        }
        sup.used = this.frame;
        if (dmin > this.R3) {
          if (!sup.m3) {
            if (built >= 2 || !budget()) continue;
            sup.m3 = r.createMesh(stampPlants(sup.rec, x0, z0, 3, { dry: it.dry, rock: it.rock, keep: 0.55 }), 'plants far'); built++;
          }
          this._queue(sup.m3, x0 - cam.x, -cam.y, z0 - cam.z, false, it.rockBytes);
          stats.supers++;
          continue;
        }
        for (const c of sup.cells) {
          if (!c) continue;
          const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z, Math.max(0, cam.y - 40) * 0.5) - 58);
          if (d > this.R3 * 1.5) continue;
          if (!eng.sphereVisible(c.cx - cam.x, 15 - cam.y, c.cz - cam.z, 62 + 20)) continue;
          if (d < this.R0 && this.maxNear > 0) { near.push(c, d, it); continue; }
          c.used = this.frame;
          const lod = d < this.R1 ? 1 : 2;
          let m = lod === 1 ? c.m1 : c.m2;
          if (!m) {
            if (built < 3 && budget()) {
              m = r.createMesh(stampPlants(c.rec, c.x0, c.z0, lod, { dry: it.dry, rock: it.rock, keep: lod === 2 ? 0.8 : 1 }), 'plants ' + lod); built++;
              if (lod === 1) c.m1 = m; else c.m2 = m;
            } else m = c.m1 || c.m2;
          }
          if (m) { this._queue(m, c.x0 - cam.x, -cam.y, c.z0 - cam.z, d < 650, it.rockBytes); stats.cells++; }
        }
      }
    }
    // the plants close by, one instance each, the nearest cells first
    if (near.length) {
      const order = [];
      for (let k = 0; k < near.length; k += 3) order.push(k);
      order.sort((a, b) => near[a + 1] - near[b + 1]);
      let n = 0;
      const lim2 = (this.R0 + 95) * (this.R0 + 95);
      for (const k of order) {
        const c = near[k], it = near[k + 2], rec = c.rec;
        c.used = this.frame;
        for (let q = 0; q < rec.length; q += 8) {
          const dx = rec[q] - cam.x, dz = rec[q + 2] - cam.z;
          if (dx * dx + dz * dz > lim2) continue;
          if (n >= this.maxNear) break;
          const code = rec[q + 5], sp = code & 7, variant = (code >> 3) % 3;
          const h = this._handle(sp, variant, it.dry && sp === SP.SHRUB);
          const s = rec[q + 4] / SPECIES[sp].H0, yaw = rec[q + 3], cs = Math.cos(yaw) * s, sn = Math.sin(yaw) * s, tone = rec[q + 6];
          M[0] = cs; M[1] = 0; M[2] = -sn; M[4] = 0; M[5] = s; M[6] = 0; M[8] = sn; M[9] = 0; M[10] = cs;
          M[3] = 0; M[7] = 0; M[11] = 0; M[12] = dx; M[13] = rec[q + 1] - cam.y; M[14] = dz; M[15] = 1;
          const f = 0.86 + 0.28 * tone;
          if (sp === SP.BOULDER) { TINT[0] = it.rockBytes[0] * f; TINT[1] = it.rockBytes[1] * f; TINT[2] = it.rockBytes[2] * f; }
          else { TINT[0] = 128 * f; TINT[1] = 128 * (0.94 + 0.12 * rec[q + 7]) * f; TINT[2] = 128 * f; }
          r.setCasting(true);
          r.add(h.solid, M, TINT, 0, 0, rec[q + 7]);
          if (h.cards) { r.setCasting(false); r.add(h.cards, M, TINT, 0, 0, rec[q + 7]); }
          n++;
        }
      }
      r.setCasting(true);
      stats.near = n;
    }
    stats.built += built;
    if (this.frame % 240 === 0) this._purge();
  }

  _queue(mesh, rx, ry, rz, casts, rockBytes) {
    if (!mesh.indexCount) return;
    M[0] = 1; M[1] = 0; M[2] = 0; M[3] = 0; M[4] = 0; M[5] = 1; M[6] = 0; M[7] = 0; M[8] = 0; M[9] = 0; M[10] = 1; M[11] = 0;
    M[12] = rx; M[13] = ry; M[14] = rz; M[15] = 1;
    this.r.setCasting(casts);
    this.r.add(mesh, M, NEUTRAL, 0, 0, 0);
    this.r.setCasting(true);
  }

  /** Release the meshes that have not been drawn for a while (the camera has gone away). */
  _purge() {
    const old = this.frame - 700;
    for (const it of this.islands) for (const sup of it.supers.values()) {
      if (sup.m3 && sup.used < old) { this.r.releaseMesh(sup.m3); sup.m3 = null; }
      if (sup.cells) for (const c of sup.cells) {
        if (!c || c.used >= old) continue;
        if (c.m1) { this.r.releaseMesh(c.m1); c.m1 = null; }
        if (c.m2) { this.r.releaseMesh(c.m2); c.m2 = null; }
      }
    }
  }
}
