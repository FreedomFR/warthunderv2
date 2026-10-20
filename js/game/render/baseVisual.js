// What is drawn for the military bases of the islands (sim/bases.js): the flat work of the airfield, the buildings (intact or ruined, scorched when damaged), the
// radars that turn, the guns on their emplacements (they follow the train / elevation / recoil of the simulation), the aircraft parked on the apron and the small
// detail that is only drawn up close. Everything goes through the ship renderer like the islands and the ships do.
//
//   const bv = new BaseVisuals(shipRenderer, engine);
//   bv.planes = planeVisuals;                       // optional: draws the aircraft parked at the slots (BaseState.parked)
//   bv.set(terrain);                                // after the terrain is built (null to release)
//   bv.add(cam, states, { teams, time, shadow });   // every frame after r.begin(), next to islandVisuals.add(cam)
// `states` = the live BaseState of every base (world.bases); omitted, the visuals keep a state of their own for each base (all intact). Matched by `state.id === layout.id`.
// opts: teams = world.teams (the team colour of the pennants is team.rgb), time = seconds (the radars sweep with it), shadow = { active, focus: {x, z}, R } the
// region where the sun shadow map reaches (things outside it do not cast).
import { buildBaseModel } from '../model/baseMesh.js';
import { getMountModel } from '../model/mounts.js';
import { BaseState } from '../sim/bases.js';
import { mat4Ship, mountMatrices } from '../math.js';
import { spinAbout } from './shipVisual.js';
import { NATION_ID } from '../model/livery.js';
import { GROUND_PITCH } from '../model/planes.js';

const S64 = new Float64Array(16), W64 = new Float64Array(16), H64 = new Float64Array(16), G64 = new Float64Array(16), SQ = new Float64Array(16);
const S32 = new Float32Array(16), H32 = new Float32Array(16), G32 = new Float32Array(16);
const WHITE = [255, 255, 255];
const FAR_COASTAL = 16000, FAR_AA = 2800, FAR_PLANES = 5000, NEAR_PART = 300;

export class BaseVisuals {
  constructor(renderer, engine) {
    this.r = renderer;
    this.engine = engine;
    this.planes = null;            // PlaneVisuals, to draw the parked aircraft
    this.items = [];               // { layout, model, state, gpu }
    this.owned = [];               // every mesh created, to release
    this.byBuilt = new Map();      // built mesh -> its GPU handles
    this.mounts = new Map();       // mount model -> { house, guns }
  }

  _mesh(built, label) {
    if (!built) return null;
    const m = this.r.createMesh(built, label);
    this.owned.push(m);
    return m;
  }

  _free() {
    for (const m of this.owned) this.r.releaseMesh(m);
    this.owned = [];
    this.byBuilt.clear();
    this.mounts.clear();
    this.items = [];
  }

  /** The GPU meshes of a building or emplacement (groups body / body_ruin / fine / spin of a built mesh). */
  _groups(built, label) {
    let g = this.byBuilt.get(built);
    if (g) return g;
    const gr = built.groups || {};
    g = { body: this._mesh(gr.body, label), ruin: this._mesh(gr.body_ruin, label + ' ruin'), fine: this._mesh(gr.fine, label + ' fine'), spin: this._mesh(gr.spin, label + ' spin') };
    this.byBuilt.set(built, g);
    return g;
  }

  /** Replace the bases (a Terrain of sim/terrain.js with `bases`, or null). */
  set(terrain) {
    this._free();
    if (!terrain || !terrain.bases || !terrain.bases.length) return;
    for (const layout of terrain.bases) {
      const is = terrain.islands && terrain.islands.find((q) => q.id === layout.island);
      const model = buildBaseModel(layout, layout.nation, { biome: is ? is.biome : 'green' });
      const gpu = {
        ground: this._mesh(model.ground, 'base ' + layout.id + ' ground'), groundFine: this._mesh(model.groundFine, 'base ' + layout.id + ' ground fine'),
        deco: this._mesh(model.deco, 'base ' + layout.id + ' deco'), decoFine: this._mesh(model.decoFine, 'base ' + layout.id + ' deco fine'),
        parts: model.parts.map((p) => this._groups(p.mesh, 'base ' + p.kind)),
        guns: model.guns.map((q) => {
          const mm = getMountModel(q.mount);
          let mo = this.mounts.get(mm);
          if (!mo) { mo = { mm, house: this._mesh(mm.house, 'base gun house'), guns: this._mesh(mm.guns, 'base gun barrels') }; this.mounts.set(mm, mo); }
          return { body: this._groups(q.body, 'base emplacement'), mo };
        }),
      };
      this.items.push({ layout, model, gpu, state: new BaseState(layout) });
    }
  }

  /** The base nearest to `cam` within `range` metres, as { x, y, z, L (its size) } for the sun shadow to focus on when no ship is near, or null. */
  focusNear(cam, range = 2500) {
    let best = null, bd = range;
    for (const it of this.items) {
      const d = Math.hypot(it.layout.x - cam.x, it.model.ref - cam.y, it.layout.z - cam.z) - it.model.radius * 0.5;
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { x: best.layout.x, y: best.model.ref, z: best.layout.z, L: Math.min(best.model.radius * 1.4, 700) } : null;
  }

  /** The state of the base with this layout among `states` (or the visuals' own). */
  _stateOf(it, states, k) {
    if (!states) return it.state;
    const s = states[k];
    if (s && s.id === it.layout.id) return s;
    return states.find((q) => q.id === it.layout.id) || it.state;
  }

  /** Queue the bases in view for this frame (after r.begin()). */
  add(cam, states, o = {}) {
    const r = this.r, eng = this.engine;
    const time = o.time ?? (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const sh = o.shadow && o.shadow.active && o.shadow.focus ? o.shadow : null;
    for (let k = 0; k < this.items.length; k++) {
      const it = this.items[k], L = it.layout, M = it.model, gpu = it.gpu, st = this._stateOf(it, states, k);
      const rx = L.x - cam.x, ry = M.ref - cam.y, rz = L.z - cam.z, dist = Math.hypot(rx, ry, rz);
      if (!eng.sphereVisible(rx, ry + 10, rz, M.radius)) continue;
      const casts = !o.shadow || (sh && Math.hypot(L.x - sh.focus.x, L.z - sh.focus.z) < sh.R + M.radius);
      const tint = (o.teams && o.teams[L.team] && o.teams[L.team].rgb) || WHITE;
      const nid = NATION_ID[M.nation] || 0, rnd = (L.id * 0.37 + 0.11) % 1;
      const nearBase = dist < M.radius + 450;
      r.setPaint([0, rnd, nid, 0]);
      // the flat work
      r.setCasting(false);
      mat4Ship(S64, rx, ry, rz, M.heading, 0, 0);
      for (let i = 0; i < 16; i++) S32[i] = S64[i];
      if (gpu.ground) r.add(gpu.ground, S32, tint, 0, 0, rnd);
      if (nearBase && gpu.groundFine) r.add(gpu.groundFine, S32, tint, 0, 0, rnd);
      r.setCasting(casts);
      if (gpu.deco) r.add(gpu.deco, S32, tint, 0, 0, rnd);
      if (nearBase && gpu.decoFine) r.add(gpu.decoFine, S32, tint, 0, 0, rnd);
      // the buildings
      for (let i = 0; i < M.parts.length; i++) {
        const p = M.parts[i], pg = gpu.parts[i];
        const px = p.x - cam.x, py = p.y - cam.y, pz = p.z - cam.z;
        if (!eng.sphereVisible(px, py + p.r * 0.4, pz, p.r + 4)) continue;
        const state = st.partState[i] | 0, pd = Math.hypot(px, py, pz);
        mat4Ship(S64, px, py, pz, p.heading, 0, 0);
        for (let q = 0; q < 16; q++) S32[q] = S64[q];
        const rn = (rnd + i * 0.173) % 1;
        if (state === 2) {
          if (pg.ruin) r.add(pg.ruin, S32, tint, 1, 0.55, rn);
          continue;
        }
        const dmg = state === 1 ? 0.65 : 0, fire = state === 1 ? 0.3 : 0;
        if (pg.body) r.add(pg.body, S32, tint, dmg, fire, rn);
        if (pg.fine && pd < NEAR_PART + p.r) r.add(pg.fine, S32, tint, dmg, fire, rn);
        if (pg.spin && p.spin) {
          spinAbout(SQ, S64, 'y', time * p.spin.rate + i * 1.7, 0, 0, 0);
          for (let q = 0; q < 16; q++) H32[q] = SQ[q];
          r.add(pg.spin, H32, tint, dmg, fire, rn);
        }
      }
      // the guns
      for (let i = 0; i < M.guns.length; i++) {
        const q = M.guns[i], qg = gpu.guns[i], gs = st.guns[i];
        const gx = q.x - cam.x, gy = q.y - cam.y, gz = q.z - cam.z, gd = Math.hypot(gx, gy, gz);
        if (gd > (q.kind === 'aa' ? FAR_AA : FAR_COASTAL)) continue;
        if (!eng.sphereVisible(gx, gy + 3, gz, q.r)) continue;
        mat4Ship(S64, gx, gy, gz, q.heading, 0, 0);
        for (let m = 0; m < 16; m++) S32[m] = S64[m];
        r.add(qg.body.body, S32, tint, 0, 0, rnd);
        if (qg.body.fine && gd < 350) r.add(qg.body.fine, S32, tint, 0, 0, rnd);
        const alive = gs ? gs.alive : true, mo = qg.mo;
        const wreck = alive ? 0 : Math.sin(L.id * 12.9 + i * 78.2) * 0.45;
        const yaw = (gs ? gs.train : 0) + wreck;
        const pitch = alive ? (gs ? gs.elev : 0.2) : -0.12 - Math.abs(wreck) * 0.4;
        mountMatrices(H64, G64, S64, 0, q.mountY, 0, yaw, pitch, mo.mm.trunnion[0], mo.mm.trunnion[1], alive && gs ? gs.recoil * mo.mm.recoil : 0);
        for (let m = 0; m < 16; m++) { H32[m] = H64[m]; G32[m] = G64[m]; }
        r.add(mo.house, H32, tint, alive ? 0 : 1, alive ? 0 : 0.4, rnd);
        if (alive || q.kind !== 'aa') r.add(mo.guns, G32, tint, alive ? 0 : 1, alive ? 0 : 0.3, rnd);
      }
      // the aircraft parked on the apron
      if (this.planes && st.parked && L.slots.length && dist < FAR_PLANES + M.radius) {
        r.setPaint(null);
        r.setCasting(casts);
        for (let i = 0; i < L.slots.length; i++) {
          const key = st.parked[i];
          if (!key) continue;
          const sl = L.slots[i], sx = sl.x - cam.x, sy = sl.y - cam.y, sz = sl.z - cam.z;
          if (!eng.sphereVisible(sx, sy + 2, sz, 14)) continue;
          const pm = this.planes.get(key);
          mat4Ship(W64, sx, sy, sz, sl.heading, GROUND_PITCH, 0);
          W64[13] = sy + pm.pm.groundY;
          this.planes.addParts(pm, W64, tint, (rnd + i * 0.31) % 1, 0, true);
        }
      }
    }
    r.setPaint(null);
    r.setCasting(true);
  }
}
