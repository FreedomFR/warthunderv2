// Draws aircraft (in flight, crashing, parked on a flight deck) and the ordnance in flight.
import { getPlaneModel, getFloatplaneModel, buildOrdnanceMeshes } from '../model/planes.js';
import { mat4Ship, mat4Mul, mat4RotX } from '../math.js';

const S64 = new Float64Array(16), P64 = new Float64Array(16), RX = new Float64Array(16), W64 = new Float64Array(16);
const S32 = new Float32Array(16), P32 = new Float32Array(16);

export class PlaneVisuals {
  constructor(renderer) {
    this.r = renderer;
    this.models = new Map();
    this.ord = null;
    this.floats = new Map();
  }

  /** GPU meshes of an aircraft type, created on first use. */
  get(typeKey) {
    let m = this.models.get(typeKey);
    if (m) return m;
    const pm = getPlaneModel(typeKey);
    m = { pm, mesh: {} };
    for (const [k, v] of Object.entries(pm.meshes)) if (v) m.mesh[k] = this.r.createMesh(v, typeKey + ' ' + k);
    this.models.set(typeKey, m);
    return m;
  }

  floatplane(nation) {
    let m = this.floats.get(nation);
    if (!m) { const pm = getFloatplaneModel(nation); m = this.r.createMesh(pm.meshes.whole, 'floatplane ' + nation); this.floats.set(nation, m); }
    return m;
  }

  ordnance() {
    if (!this.ord) {
      const o = buildOrdnanceMeshes();
      this.ord = { bomb250: this.r.createMesh(o.bomb250, 'bomb250'), bomb500: this.r.createMesh(o.bomb500, 'bomb500'), torpedo: this.r.createMesh(o.torpedo, 'torpedo'), shellAP: this.r.createMesh(o.shellAP, 'shellAP'), shellHE: this.r.createMesh(o.shellHE, 'shellHE') };
    }
    return this.ord;
  }

  /**
   * Queue one aircraft. p: { typeKey, x,y,z (world), heading, pitch, roll, spin, gearDown, ordnance (bool), lost {wingL,wingR,tail,engine} }
   */
  addPlane(p, cam, tint, rnd = 0.5, dmg = 0, fire = 0) {
    const m = this.get(p.typeKey);
    const lost = p.lost;
    mat4Ship(S64, p.x - cam.x, p.y - cam.y, p.z - cam.z, p.heading, p.pitch, p.roll);
    for (let i = 0; i < 16; i++) S32[i] = S64[i];
    const r = this.r;
    if (!lost || (!lost.wingL && !lost.wingR && !lost.tail)) r.add(m.mesh.whole, S32, tint, dmg, fire, rnd);
    else {
      r.add(m.mesh.body, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.tail) r.add(m.mesh.tail, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.wingL) r.add(m.mesh.wingL, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.wingR) r.add(m.mesh.wingR, S32, tint, Math.max(dmg, 0.7), fire, rnd);
    }
    if (!lost || !lost.engine) {
      mat4RotX(RX, p.spin || 0);
      mat4Mul(P64, S64, RX);
      for (let i = 0; i < 16; i++) P32[i] = P64[i];
      r.add(m.mesh.prop, P32, tint, 0, 0, rnd);
    }
    if (p.gearDown && m.mesh.gear) r.add(m.mesh.gear, S32, tint, dmg, fire, rnd);
    if (p.ordnance && m.mesh.ordnance) r.add(m.mesh.ordnance, S32, tint, 0, 0, rnd);
  }

  /** A detached piece of an aircraft (wing, tail) tumbling through the air. p: { typeKey, piece, x,y,z, heading,pitch,roll } */
  addPiece(p, cam, tint, rnd = 0.5) {
    const m = this.get(p.typeKey);
    mat4Ship(S64, p.x - cam.x, p.y - cam.y, p.z - cam.z, p.heading, p.pitch, p.roll);
    for (let i = 0; i < 16; i++) S32[i] = S64[i];
    const mesh = m.mesh[p.piece];
    if (mesh) this.r.add(mesh, S32, tint, 0.8, 0.5, rnd);
  }

  /** Ordnance in flight: kind 'bomb250' | 'bomb500' | 'torpedo'. */
  addOrdnance(kind, x, y, z, heading, pitch, cam) {
    const o = this.ordnance();
    mat4Ship(S64, x - cam.x, y - cam.y, z - cam.z, heading, pitch, 0);
    for (let i = 0; i < 16; i++) S32[i] = S64[i];
    this.r.add(o[kind], S32, [255, 255, 255], 0, 0, 0.5);
  }

  /** A naval shell in flight (type 'AP' | 'HE'): length in metres, direction of flight (unit vector). */
  addShell(type, x, y, z, dx, dy, dz, length, cam) {
    const o = this.ordnance();
    mat4Ship(S64, x - cam.x, y - cam.y, z - cam.z, Math.atan2(dx, -dz), Math.asin(Math.max(-1, Math.min(1, dy))), 0);
    for (let i = 0; i < 16; i++) S32[i] = S64[i];
    for (let k = 0; k < 3; k++) { S32[k] *= length; S32[4 + k] *= length; S32[8 + k] *= length; }
    this.r.add(o[type === 'AP' ? 'shellAP' : 'shellHE'], S32, [255, 255, 255], 0, 0, 0.5);
  }

  /** Aircraft parked on a carrier's deck (ship matrix S, camera relative). */
  addParked(ship, S, tint, rnd, inHalf) {
    const model = ship.model;
    const m = this.get(ship.parkType || 'sbd');
    const n = Math.min(ship.parked, model.deckSlots.length);
    for (let i = 0; i < n; i++) {
      const sl = model.deckSlots[i];
      if (!inHalf(sl.x)) continue;
      mat4Ship(W64, 0, 0, 0, sl.yaw + (i % 2 ? 0.0 : 0), 0, 0);
      W64[12] = sl.x; W64[13] = sl.y + m.pm.groundY; W64[14] = sl.z;
      mat4Mul(P64, S, W64);
      for (let k = 0; k < 16; k++) P32[k] = P64[k];
      this.r.add(m.mesh.whole, P32, tint, 0, 0, rnd);
      if (m.mesh.gear) this.r.add(m.mesh.gear, P32, tint, 0, 0, rnd);
    }
  }
}
