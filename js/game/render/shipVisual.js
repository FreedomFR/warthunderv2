// Assembles everything that is drawn for a ship: the hull, the destroyable parts (intact or wrecked),
// the articulated gun mounts and light AA mounts, the battle scars and, on carriers, the aircraft parked on deck.
// Used by the game and by the model preview. A ship that is broken in two is drawn as two sections.
import { getMountModel } from '../model/mounts.js';
import { MeshBuilder, MAT, rgb } from '../model/meshbuilder.js';
import { mat4Ship, mat4Frame, mat4Mul, mountMatrices } from '../math.js';

const M32 = new Float32Array(16), H32 = new Float32Array(16), G32 = new Float32Array(16);
const F64 = new Float64Array(16), M64 = new Float64Array(16), SEC = new Float64Array(16), TR = new Float64Array(16), TMP = new Float64Array(16);
const H64 = new Float64Array(16), G64 = new Float64Array(16);

/** A battle scar: scorched disc with torn petals (radius 1, lying on the XZ plane). */
function buildScarMesh() {
  const b = new MeshBuilder();
  const ref = [0, -1, 0];
  const ring = (r, y, col, mat, n = 14) => {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const j = 0.82 + 0.18 * Math.sin(i * 12.9898) ;
      b.triFlat([0, y, 0], [Math.cos(a0) * r * j, y, Math.sin(a0) * r * j], [Math.cos(a1) * r * (0.82 + 0.18 * Math.sin((i + 1) * 12.9898)), y, Math.sin(a1) * r * (0.82 + 0.18 * Math.sin((i + 1) * 12.9898))], col, mat, ref, 1);
    }
  };
  ring(1.0, 0.0, rgb('#2a2724'), MAT.CANVAS, 16);
  ring(0.62, 0.02, rgb('#0c0b0a'), MAT.CANVAS, 12);
  // torn plating around the hole
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.3;
    const r0 = 0.55, r1 = 0.95 + 0.25 * Math.sin(i * 5.1);
    b.triFlat([Math.cos(a - 0.14) * r0, 0.04, Math.sin(a - 0.14) * r0], [Math.cos(a + 0.14) * r0, 0.04, Math.sin(a + 0.14) * r0], [Math.cos(a) * r1, 0.28 + 0.12 * Math.sin(i * 3.7), Math.sin(a) * r1], rgb('#6b4a38'), MAT.HULL, ref, 1);
  }
  return b.build();
}

/** Generic scrap: a plate, a bent beam, a chunk of hull. */
function buildScrapMeshes() {
  const steel = rgb('#4b4f53'), rust = rgb('#6b4f3c'), dark = rgb('#26282a');
  const plate = new MeshBuilder();
  plate.block({ x0: -2.2, x1: 2.2, hw: 1.5, y0: -0.12, y1: 0.12, tx0: -1.8, tx1: 1.6, thw: 1.2 }, steel, MAT.HULL);
  plate.box(0.6, 0.2, 0.2, 1.4, 0.2, 0.5, rust, MAT.HULL);
  const beam = new MeshBuilder();
  beam.beam([-3, 0, 0], [0, 0.4, 0.2], 0.28, 0.4, steel, MAT.HULL);
  beam.beam([0, 0.4, 0.2], [2.4, 1.3, -0.1], 0.28, 0.4, rust, MAT.HULL);
  beam.beam([0, 0.4, 0.2], [0.6, -0.6, 0.8], 0.14, 0.14, dark, MAT.DARK);
  const chunk = new MeshBuilder();
  chunk.prism([[-1.4, -1.0], [1.5, -0.8], [1.1, 1.2], [-0.9, 1.4], [-1.6, 0.2]], -0.5, 0.7, steel, MAT.HULL, { topScale: 0.7 });
  chunk.box(0.3, 0.9, 0.2, 1.0, 0.5, 0.9, dark, MAT.DARK);
  return [plate.build(), beam.build(), chunk.build()];
}

export class ShipVisuals {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new Map();
    this.scarMesh = renderer.createMesh(buildScarMesh(), 'scar');
    this.scrap = buildScrapMeshes().map((m, i) => renderer.createMesh(m, 'scrap' + i));
    this.planes = null;           // PlaneVisuals (parked aircraft on carriers)
  }

  /**
   * Draw a piece of flying wreckage (see sim/debris.js). `cam` = engine camera, tint = team colour.
   */
  addDebris(d, cam, tint) {
    const r = this.r;
    mat4Ship(F64, 0, 0, 0, d.heading, d.pitch, d.roll, d.kind === 'scrap' ? d.size : 1);
    const px = d.x - cam.x, py = d.y - cam.y, pz = d.z - cam.z;
    let mesh, cx = 0, cy = 0, cz = 0, dmg = 0.5;
    if (d.kind === 'scrap') mesh = this.scrap[d.scrap];
    else if (d.kind === 'part') {
      const rm = this.forModel(d.model); mesh = rm.parts[d.index].intact; cx = d.cx; cy = d.cy; cz = d.cz; dmg = 1;
    } else if (d.kind === 'mount') {
      const rm = this.forModel(d.model); mesh = rm.mountOf[d.index].house; cy = 1.5; dmg = 1;
    } else return;
    // rotate about the centre of the piece
    M64[0] = F64[0]; M64[1] = F64[1]; M64[2] = F64[2]; M64[3] = 0;
    M64[4] = F64[4]; M64[5] = F64[5]; M64[6] = F64[6]; M64[7] = 0;
    M64[8] = F64[8]; M64[9] = F64[9]; M64[10] = F64[10]; M64[11] = 0;
    M64[12] = px - (F64[0] * cx + F64[4] * cy + F64[8] * cz);
    M64[13] = py - (F64[1] * cx + F64[5] * cy + F64[9] * cz);
    M64[14] = pz - (F64[2] * cx + F64[6] * cy + F64[10] * cz);
    M64[15] = 1;
    for (let k = 0; k < 16; k++) M32[k] = M64[k];
    r.setPaint(d.kind === 'part' ? d.model.paint : null);
    r.add(mesh, M32, tint, dmg, d.burn, 0.4);
    r.setPaint(null);
  }

  forModel(model) {
    let rm = this.cache.get(model.id);
    if (rm) return rm;
    const r = this.r;
    const mkey = (m) => ({ kind: m.kind, cal: m.cal, n: m.n, bore: m.bore, col: model.pal.sup, variant: m.variant, top: model.pal.top });
    rm = {
      hull: r.createMesh(model.mesh, model.id),
      fine: model.fine ? r.createMesh(model.fine, model.id + ' fine') : null,       // lifelines, boats, rafts...: only drawn up close
      parts: model.parts.map((p) => ({
        intact: r.createMesh(p.mesh, model.id + ' ' + p.id), ruin: p.ruin ? r.createMesh(p.ruin, model.id + ' ' + p.id + ' ruin') : null,
        fine: p.fineMesh ? r.createMesh(p.fineMesh, model.id + ' ' + p.id + ' fine') : null, cx: (p.bb[0] + p.bb[3]) / 2,
      })),
      mounts: new Map(), aa: new Map(),
    };
    for (const m of model.mounts) {
      const mm = getMountModel(mkey(m));
      if (!rm.mounts.has(mm)) rm.mounts.set(mm, { mm, house: r.createMesh(mm.house, model.id + ' house'), guns: r.createMesh(mm.guns, model.id + ' guns') });
    }
    rm.mountOf = model.mounts.map((m) => rm.mounts.get(getMountModel(mkey(m))));
    for (const a of model.aaMounts) {
      const mm = getMountModel({ kind: 'aa', cal: a.cal, n: a.n, bore: a.bore, col: model.pal.sup, variant: a.variant });
      if (!rm.aa.has(mm)) rm.aa.set(mm, { mm, house: r.createMesh(mm.house, model.id + ' aa'), guns: r.createMesh(mm.guns, model.id + ' aa guns') });
    }
    rm.aaOf = model.aaMounts.map((a) => rm.aa.get(getMountModel({ kind: 'aa', cal: a.cal, n: a.n, bore: a.bore, col: model.pal.sup, variant: a.variant })));
    this.cache.set(model.id, rm);
    return rm;
  }

  /**
   * Draw one ship. `S64` is the camera-relative ship matrix; sections of a broken ship get their own matrices.
   * ship: { model, mounts[], aaMounts[], partState[], scars[], split, parked, id }
   */
  addShip(ship, S64, tint, dmg, fire, rnd) {
    this.r.setCasting(ship.casts !== false);
    this._addShip(ship, S64, tint, dmg, fire, rnd);
    this.r.setCasting(true);
  }

  _addShip(ship, S64, tint, dmg, fire, rnd) {
    if (ship.split) {
      for (const h of ship.split.halves) {
        // section matrix: ship * T(cut + offset) * R * T(-cut)
        mat4Ship(TR, 0, 0, 0, h.yaw, h.pitch, h.roll);
        TR[12] = ship.split.cut + h.dx; TR[13] = h.dy; TR[14] = h.dz;
        TMP.fill(0); TMP[0] = TMP[5] = TMP[10] = TMP[15] = 1; TMP[12] = -ship.split.cut;
        mat4Mul(SEC, TR, TMP);
        mat4Mul(M64, S64, SEC);
        this.addSection(ship, M64, tint, dmg, fire, rnd, h.sign, ship.split.cut);
      }
    } else this.addSection(ship, S64, tint, dmg, fire, rnd, 0, 0);
  }

  addSection(ship, S, tint, dmg, fire, rnd, half, cutX) {
    const r = this.r, model = ship.model;
    const rm = this.forModel(model);
    const inHalf = (x) => half === 0 || (x - cutX) * half >= 0;
    const lod = ship.lod | 0;                 // 0 everything, 1 no light AA, 2 hull / bridge / funnels / main guns only
    for (let i = 0; i < 16; i++) M32[i] = S[i];
    r.setPaint(model.paint);
    r.add(rm.hull, M32, tint, dmg, fire, rnd, cutX, half);
    const near = ship.near !== false;
    if (near && rm.fine) r.add(rm.fine, M32, tint, dmg, fire, rnd, cutX, half);
    // destroyable parts
    for (let i = 0; i < rm.parts.length; i++) {
      const p = rm.parts[i];
      if (!inHalf(p.cx)) continue;
      if (lod >= 2 && model.parts[i].kind !== 'bridge' && model.parts[i].kind !== 'funnel') continue;
      const st = ship.partState ? ship.partState[i] : 0;
      if (st === 2) { if (p.ruin) r.add(p.ruin, M32, tint, 1, 0.55, rnd); }
      else {
        r.add(p.intact, M32, tint, st === 1 ? Math.max(dmg, 0.6) : dmg, st === 1 ? Math.max(fire, 0.3) : fire, rnd);
        if (near && p.fine) r.add(p.fine, M32, tint, st === 1 ? Math.max(dmg, 0.6) : dmg, st === 1 ? Math.max(fire, 0.3) : fire, rnd);
      }
    }
    r.setPaint(null);
    // main and secondary mounts
    const mounts = ship.mounts;
    for (let i = 0; i < model.mounts.length; i++) {
      const rec = model.mounts[i];
      if (!inHalf(rec.x)) continue;
      if (lod >= 2 && rec.group !== 'main') continue;
      const m = mounts ? mounts[i] : null, mo = rm.mountOf[i];
      if (m && m.gone) continue;           // torn out of the ship by an explosion
      const alive = m ? !m.wrecked : true;
      const wreck = alive ? 0 : ((Math.sin(ship.id * 12.9 + i * 78.2) * 0.5) * 0.9);
      const yaw = rec.arcC + (m ? m.trainRel : 0) + wreck;
      const pitch = alive ? (m ? m.elev : 0) : -0.12 - Math.abs(wreck) * 0.4;
      mountMatrices(H64, G64, S, rec.x, rec.y, rec.z, yaw, pitch, mo.mm.trunnion[0], mo.mm.trunnion[1], alive && m ? m.recoil * mo.mm.recoil : 0);
      for (let k = 0; k < 16; k++) { H32[k] = H64[k]; G32[k] = G64[k]; }
      const md = alive ? dmg : 1, mf = alive ? fire : 0.5;
      r.add(mo.house, H32, tint, md, mf, rnd);
      r.add(mo.guns, G32, tint, md, mf, rnd);
    }
    // light AA mounts
    const aas = ship.aaMounts;
    for (let i = 0; i < (lod === 0 && ship.aaNear !== false ? model.aaMounts.length : 0); i++) {
      const rec = model.aaMounts[i];
      if (!inHalf(rec.x)) continue;
      const a = aas ? aas[i] : null, mo = rm.aaOf[i];
      const alive = a ? a.alive : true;
      const yaw = rec.yaw0 + (a ? a.train : 0);
      mountMatrices(H64, G64, S, rec.x, rec.y, rec.z, yaw, alive && a ? a.elev : 0, mo.mm.trunnion[0], mo.mm.trunnion[1], alive && a ? a.recoil * mo.mm.recoil : 0);
      for (let k = 0; k < 16; k++) { H32[k] = H64[k]; G32[k] = G64[k]; }
      r.add(mo.house, H32, tint, alive ? dmg : 1, alive ? fire : 0.4, rnd);
      if (alive) r.add(mo.guns, G32, tint, dmg, fire, rnd);
    }
    // scars
    if (ship.scars) {
      for (const sc of ship.scars) {
        if (!inHalf(sc.x)) continue;
        mat4Frame(F64, sc.x + sc.nx * 0.06, sc.y + sc.ny * 0.06, sc.z + sc.nz * 0.06, sc.nx, sc.ny, sc.nz, sc.r, sc.spin);
        mat4Mul(TMP, S, F64);
        for (let k = 0; k < 16; k++) M32[k] = TMP[k];
        r.add(this.scarMesh, M32, tint, 0, sc.k === 2 ? 0.55 : 0, rnd);
      }
    }
    // aircraft parked on the flight deck
    if (this.planes && model.deckSlots.length && ship.parked > 0) this.planes.addParked(ship, S, tint, rnd, inHalf);
    if (this.planes && ship._deck) this.planes.addDeckGear(ship, S, tint, rnd, inHalf);
  }
}
