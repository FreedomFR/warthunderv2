// Draws aircraft (in flight, crashing, parked on a flight deck) and the ordnance in flight.
import { getPlaneModel, getFloatplaneModel, buildOrdnanceMeshes, hookPivot, GROUND_PITCH } from '../model/planes.js';
import { mat4Ship, mat4Mul, mat4RotX, mat4YawPitchAt } from '../math.js';
import { getCockpit } from '../model/cockpit.js';
import { MeshBuilder, MAT, rgb } from '../model/meshbuilder.js';
import { LIFT_DEPTH } from '../sim/deck.js';

const S64 = new Float64Array(16), P64 = new Float64Array(16), RX = new Float64Array(16), W64 = new Float64Array(16);
const S32 = new Float32Array(16), P32 = new Float32Array(16);
const F64 = new Float64Array(16), H64 = new Float64Array(16), Q64 = new Float64Array(16);
const Q32 = new Float32Array(16), R32 = new Float32Array(16);

// How the wings fold: back about a hinge on the rear spar beside the fuselage, the hinge axis leaning forward by this much (the folded
// wing ends up pointing aft and a little up); the Japanese aircraft fold steeper.
const FOLD_TILT = { Japan: 0.5, UK: 0.0 };

/** Local matrix of a wing folded by `fold` (0 spread .. 1 folded); sg = +1 starboard, -1 port. */
function foldMatrix(out, spec, sg, fold) {
  const w = spec.wing;
  const hx = w.x - w.cr * 0.4, hy = w.y || 0, hz = sg * (spec.fus.r * 1.02 + 0.06);
  const tilt = FOLD_TILT[spec.nation] ?? 0.14;
  const ax = Math.sin(tilt), ay = Math.cos(tilt);
  const th = -sg * fold * 1.45;
  const c = Math.cos(th), sn = Math.sin(th), k = 1 - c;
  // Rodrigues rotation about (ax, ay, 0)
  const r00 = c + ax * ax * k, r01 = ax * ay * k, r02 = ay * sn;
  const r10 = ax * ay * k, r11 = c + ay * ay * k, r12 = -ax * sn;
  const r20 = -ay * sn, r21 = ax * sn, r22 = c;
  out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
  out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
  out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
  out[12] = hx - (r00 * hx + r01 * hy + r02 * hz); out[13] = hy - (r10 * hx + r11 * hy + r12 * hz); out[14] = hz - (r20 * hx + r21 * hy + r22 * hz); out[15] = 1;
  return out;
}

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
    mat4Ship(S64, p.x - cam.x, p.y - cam.y, p.z - cam.z, p.heading, p.pitch + (p.aoa || 0), p.roll);
    for (let i = 0; i < 16; i++) S32[i] = S64[i];
    const r = this.r;
    if (p.fold > 0.003) {
      // folded (or folding) wings: the fuselage and the tail as they are, each wing on its own hinge
      r.add(m.mesh.body, S32, tint, dmg, fire, rnd);
      r.add(m.mesh.tail, S32, tint, dmg, fire, rnd);
      for (const [sg, key] of [[1, 'wingR'], [-1, 'wingL']]) {
        if (lost && lost[key]) continue;
        mat4Mul(P64, S64, foldMatrix(F64, m.pm.spec, sg, Math.min(1, p.fold)));
        for (let i = 0; i < 16; i++) P32[i] = P64[i];
        r.add(m.mesh[key], P32, tint, dmg, fire, rnd);
      }
    } else if (!lost || (!lost.wingL && !lost.wingR && !lost.tail)) r.add(m.mesh.whole, S32, tint, dmg, fire, rnd);
    else {
      r.add(m.mesh.body, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.tail) r.add(m.mesh.tail, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.wingL) r.add(m.mesh.wingL, S32, tint, Math.max(dmg, 0.7), fire, rnd);
      if (!lost.wingR) r.add(m.mesh.wingR, S32, tint, Math.max(dmg, 0.7), fire, rnd);
    }
    if ((!lost || !lost.engine) && !p.inCockpit) {      // the propeller is not drawn from the pilot's seat: a frozen blade would hide the view
      mat4RotX(RX, p.spin || 0);
      mat4Mul(P64, S64, RX);
      for (let i = 0; i < 16; i++) P32[i] = P64[i];
      r.add(m.mesh.prop, P32, tint, 0, 0, rnd);
    }
    if (p.inCockpit) this.addCockpit(p, m, S64, S32, tint);
    if (p.gearDown && m.mesh.gear) r.add(m.mesh.gear, S32, tint, dmg, fire, rnd);
    if (p.hook > 0.01 && m.mesh.hook) {
      // the arrester hook, hinged under the rear fuselage: tucked along the belly, or down at ~35 degrees
      const [hx, hy] = hookPivot(m.pm.spec), a = Math.min(1, p.hook) * 0.62, ca = Math.cos(a), sa = Math.sin(a);
      H64.fill(0); H64[0] = ca; H64[1] = sa; H64[4] = -sa; H64[5] = ca; H64[10] = 1; H64[12] = hx; H64[13] = hy; H64[15] = 1;
      mat4Mul(P64, S64, H64);
      for (let i = 0; i < 16; i++) P32[i] = P64[i];
      r.add(m.mesh.hook, P32, tint, dmg, fire, rnd);
    }
    if (p.ordnance && m.mesh.ordnance) r.add(m.mesh.ordnance, S32, tint, 0, 0, rnd);
  }

  /**
   * What is seen from the pilot's seat besides the aircraft: the panel with its dials (they read the flight state: paint = speed, height, heading, climb; tint = bank, pitch,
   * revolutions), the stick that follows the controls, the blur of the propeller.
   */
  addCockpit(p, m, S64, S32, tint) {
    const r = this.r, ck = getCockpit(p.typeKey, m.pm.spec);
    this.cockpits ||= new Map();
    let h = this.cockpits.get(p.typeKey);
    if (!h) {
      h = { interior: r.createMesh(ck.interior, 'cockpit ' + p.typeKey), stick: r.createMesh(ck.stick, 'stick ' + p.typeKey), disc: ck.disc ? r.createMesh(ck.disc, 'prop disc ' + p.typeKey) : null };
      this.cockpits.set(p.typeKey, h);
    }
    const lost = p.lost || {};
    const rpm = lost.engine ? 0 : p.eng != null ? p.eng : 0.74 + 0.16 * Math.max(0, Math.min(1, (p.speed - 45) / 70));
    const dyn = [p.bank * 255, p.pitch * 255, rpm * 255];
    r.setCasting(false);
    r.setPaint([p.speed, p.y, p.heading, p.vy]);
    r.add(h.interior, S32, dyn, 0, 0, 0);
    // the stick: it leans with the rate at which the pilot turns the aircraft (a little lag, so that it is seen to move)
    const c = p._ck || (p._ck = { bank: p.bank, pitch: p.pitch, age: p.age, sr: 0, sp: 0 });
    const dt = Math.max(1e-3, p.age - c.age);
    if (p.age !== c.age) {
      const kr = 1 - Math.exp(-dt * 6);
      c.sr += (Math.max(-1, Math.min(1, (p.bank - c.bank) / dt * 0.9)) - c.sr) * kr;
      c.sp += (Math.max(-1, Math.min(1, (p.pitch - c.pitch) / dt * 1.6)) - c.sp) * kr;
      c.bank = p.bank; c.pitch = p.pitch; c.age = p.age;
    }
    const pv = ck.pivot;
    mat4YawPitchAt(Q64, pv[0], pv[1], pv[2], 0, -c.sp * 0.28);       // pulled back = the top of the stick towards the pilot
    mat4RotX(RX, c.sr * 0.3);
    mat4Mul(H64, Q64, RX);
    mat4Mul(P64, S64, H64);
    for (let i = 0; i < 16; i++) P32[i] = P64[i];
    r.add(h.stick, P32, dyn, 0, 0, 0);
    if (h.disc && !lost.engine) {
      mat4RotX(RX, p.spin || 0);
      mat4Mul(P64, S64, RX);
      for (let i = 0; i < 16; i++) P32[i] = P64[i];
      r.add(h.disc, P32, dyn, 0, 0, 0);
    }
    r.setPaint(null);
    r.setCasting(true);
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

  /** Unit meshes of the deck equipment: a lift platform, the dark shaft round it, an arrester wire. */
  deckMeshes() {
    if (this.dm) return this.dm;
    const mk = (fn, label) => { const b = new MeshBuilder(); fn(b); return this.r.createMesh(b.build(), label); };
    this.dm = {
      plat: mk((b) => { b.block({ x0: -1, x1: 1, hw: 1, y0: -0.4, y1: 0 }, rgb('#4d4c48'), MAT.HULL); }, 'lift platform'),
      pit: mk((b) => b.block({ x0: -1, x1: 1, hw: 1, y0: -0.02, y1: 0 }, rgb('#09090a'), MAT.CANVAS), 'lift shaft'),
      wire: mk((b) => b.block({ x0: 0, x1: 1, hw: 0.5, y0: -0.5, y1: 0.5 }, rgb('#1b1b1a'), MAT.DARK), 'arrester wire'),
    };
    return this.dm;
  }

  /** The lifts (a platform that carries the aircraft up from the hangar, with the open shaft round it) and the arrester wire in use. */
  addDeckGear(ship, S, tint, rnd, inHalf) {
    const D = ship._deck, model = ship.model, fdY = model.fdY;
    const dm = this.deckMeshes();
    const put = (mesh, x, y, z, ex, ey, ez, ax = 1, az = 0) => {
      // the local frame: x axis (ax, 0, az) scaled by ex, y up scaled by ey, z axis perpendicular scaled by ez
      W64.fill(0);
      W64[0] = ax * ex; W64[2] = az * ex;
      W64[5] = ey;
      W64[8] = -az * ez; W64[10] = ax * ez;
      W64[12] = x; W64[13] = y; W64[14] = z; W64[15] = 1;
      mat4Mul(P64, S, W64);
      for (let k = 0; k < 16; k++) P32[k] = P64[k];
      this.r.add(mesh, P32, tint, 0, 0, rnd);
    };
    for (const l of D.lifts) {
      if (!inHalf(l.x)) continue;
      if (l.h > 0.995 && !l.user) continue;                                // idle, flush with the deck: the painted square is all there is
      put(dm.pit, l.x, fdY + 0.035, l.z, l.hl - 0.3, 1, l.hw - 0.3);
      put(dm.plat, l.x, fdY + 0.045 - (1 - l.h) * LIFT_DEPTH, l.z, l.hl - 0.45, 1, l.hw - 0.45);
    }
    const w = D.wire;
    if (w && inHalf(w.x)) {
      for (const sg of [-1, 1]) {
        const dx = w.ax - w.x, dz = w.az - sg * w.zs, len = Math.hypot(dx, dz);
        if (len < 0.1) continue;
        put(dm.wire, w.x, fdY + 0.09, sg * w.zs, len, 0.07, 0.07, dx / len, dz / len);
      }
    }
  }

  /** Aircraft parked on a carrier's deck (ship matrix S, camera relative). */
  addParked(ship, S, tint, rnd, inHalf) {
    const model = ship.model;
    const m = this.get(ship.parkType || 'sbd');
    const n = Math.min(ship.parked, model.deckSlots.length);
    for (let i = 0; i < n; i++) {
      const sl = model.deckSlots[i];
      if (!inHalf(sl.x)) continue;
      mat4Ship(W64, 0, 0, 0, sl.yaw, GROUND_PITCH, 0);
      W64[12] = sl.x; W64[13] = sl.y + m.pm.groundY; W64[14] = sl.z;
      mat4Mul(P64, S, W64);
      this.addParts(m, P64, tint, rnd, 1, true);
    }
  }

  /** An aircraft model placed by a camera-relative matrix M (float64), the wings folded by `fold` (0 spread .. 1 folded), the undercarriage down or not. */
  addParts(m, M, tint, rnd, fold, gear, dmg = 0, fire = 0) {
    const r = this.r;
    for (let i = 0; i < 16; i++) Q32[i] = M[i];
    if (fold > 0.003) {
      r.add(m.mesh.body, Q32, tint, dmg, fire, rnd);
      r.add(m.mesh.tail, Q32, tint, dmg, fire, rnd);
      for (const [sg, key] of [[1, 'wingR'], [-1, 'wingL']]) {
        mat4Mul(Q64, M, foldMatrix(F64, m.pm.spec, sg, Math.min(1, fold)));
        for (let i = 0; i < 16; i++) R32[i] = Q64[i];
        r.add(m.mesh[key], R32, tint, dmg, fire, rnd);
      }
    } else r.add(m.mesh.whole, Q32, tint, dmg, fire, rnd);
    if (gear && m.mesh.gear) r.add(m.mesh.gear, Q32, tint, dmg, fire, rnd);
  }
}
