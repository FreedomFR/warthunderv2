// The viewer's 3D scene: one subject (ship, aircraft or catapult floatplane) at the origin, an orbit camera around a target point,
// a sun that can follow the camera, and the options that change how the model is drawn (damage, turret train, folded wings...).
import { ShipRenderer } from '../game/render/shipRenderer.js';
import { ShipVisuals } from '../game/render/shipVisual.js';
import { PlaneVisuals } from '../game/render/aircraftVisual.js';
import { lightMatrix } from '../game/render/shadows.js';
import { BY_ID } from '../game/data/ships.js';
import { buildShipModel } from '../game/model/shipbuilder.js';
import { TWEAKS } from '../game/model/tweaks.js';
import { mat4Ship, D2R, makeRng } from '../game/math.js';
import { kindOf, aircraftSpec } from './subjects.js';
import { LIGHTS, defaults } from './state.js';

const TINT = [200, 200, 200];
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export async function createScene(engine, initial) {
  const renderer = new ShipRenderer(engine);
  await renderer.ready;
  const sv = new ShipVisuals(renderer), pv = new PlaneVisuals(renderer);
  sv.planes = pv;
  const cam = engine.cam, P = engine.P;
  const S = new Float64Array(16), S32 = new Float32Array(16);

  const st = { ...initial };
  let subject = null;          // { key, kind, model?, ship?, spec?, radius, topY }
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f(st));
  const built = new Map();

  // ---- subjects ----
  function make(key) {
    if (built.has(key)) return built.get(key);
    const kind = kindOf(key);
    let sub;
    if (kind === 'ship') {
      const spec = BY_ID[key];
      const model = buildShipModel(spec, TWEAKS[key] || {});
      const ship = {
        id: 1, model, parked: 0, parkType: 'sbd',
        mounts: model.mounts.map(() => ({ alive: true, wrecked: false, trainRel: 0, elev: 0, recoil: 0 })),
        aaMounts: model.aaMounts.map(() => ({ alive: true, train: 0, elev: 0.3, recoil: 0 })),
        partState: model.parts.map(() => 0), scars: [], split: null,
      };
      sub = { key, kind, spec, model, ship, radius: spec.loa / 2, topY: model.topY, slots: model.deckSlots.length };
    } else {
      const spec = aircraftSpec(key);
      sub = { key, kind, spec, radius: Math.hypot(spec.span / 2, spec.L / 2), topY: 4, slots: 0 };
    }
    built.set(key, sub);
    return sub;
  }

  /** Apply the damage / turret options to the ship object. */
  function applyShipOptions() {
    if (!subject || subject.kind !== 'ship') return;
    const { ship, model, spec } = subject;
    ship.parked = st.parked < 0 ? model.deckSlots.length : Math.min(st.parked, model.deckSlots.length);
    for (const m of ship.mounts) { m.trainRel = st.train * D2R; m.elev = st.elev * D2R; }
    ship.partState = model.parts.map(() => (st.damage === 'ruin' ? 2 : 0));
    ship.scars = []; ship.split = null;
    const nScar = st.damage === 'scars' ? 30 : st.damage === 'ruin' ? 40 : 0;
    const rng = makeRng(5);
    for (let i = 0; i < nScar; i++) {
      const lx = (rng() - 0.5) * spec.loa * 0.8, side = rng() < 0.5 ? -1 : 1;
      ship.scars.push({ x: lx, y: 2 + rng() * 4, z: side * model.hull.halfBeamDeck(lx) * 0.97, nx: 0, ny: 0.18, nz: side, r: 0.6 + rng() * 1.3, k: rng() < 0.5 ? 1 : 2, spin: rng() * 6 });
    }
    if (st.damage === 'split') {
      ship.split = { cut: 0, t: 0, halves: [
        { sign: 1, dx: 14, dy: 3, dz: 0, yaw: 0.06, pitch: 0.35, roll: 0.15 },
        { sign: -1, dx: -6, dy: -6, dz: 0, yaw: -0.05, pitch: -0.25, roll: -0.3 },
      ] };
    }
  }

  /** Switch to another subject; the camera is framed on it again unless `keepCamera`. */
  function setSubject(key, keepCamera = false) {
    subject = make(key);
    const d = defaults(key);
    st.subject = key;
    if (!keepCamera) Object.assign(st, { az: d.az, el: d.el, dist: d.dist, tx: 0, ty: d.ty, tz: 0, alt: d.alt, parked: -1, train: 0, elev: 0, damage: 'none', bank: 0, pitch: 0, fold: 0, gear: false });
    applyShipOptions();
    notify();
  }

  function frame() {
    const d = defaults(st.subject);
    Object.assign(st, { az: d.az, el: d.el, dist: d.dist, tx: 0, ty: d.ty, tz: 0, fov: 40 });
    notify();
  }

  // ---- per-frame hooks ----
  let lightKey = null;
  function applyLight(force) {
    const L = LIGHTS[st.light] || LIGHTS.jour;
    if (force || lightKey !== st.light) {
      Object.assign(P, L.P);
      engine.markDirty('lut');
      lightKey = st.light;
    }
    P.sunElev = st.sunEl != null ? st.sunEl : L.sunEl;
    P.sunAzim = wrap180(st.sunFollow ? st.az + st.sunOffset : st.sunAz);
  }

  let shadowActive = false;
  const lightVP = new Float32Array(16);
  function updateShadow() {
    const se = P.sunElev * D2R, sa = P.sunAzim * D2R;
    const sun = [Math.sin(sa) * Math.cos(se), Math.sin(se), -Math.cos(sa) * Math.cos(se)];
    if (!st.shadows || sun[1] < 0.015 || !subject) {
      if (shadowActive) engine.shadow.setLight(lightVP, 0, false);
      shadowActive = false;
      return;
    }
    const R = Math.max(subject.kind === 'ship' ? 170 : 14, Math.min(800, st.dist * 0.8 + subject.radius * 1.1));
    const cy = subject.kind === 'ship' ? subject.topY * 0.25 : st.alt;
    const info = lightMatrix(lightVP, sun, -cam.x, cy - cam.y, -cam.z, R, engine.shadow.size);
    engine.shadow.setLight(lightVP, 0.9 / info.depthRange, true);
    shadowActive = true;
  }

  let pitchLimit = 89;
  engine.hooks.update = (dt) => {
    if (!subject) return;
    if (st.auto) st.az = wrap180(st.az + st.auto * Math.min(dt, 0.1));
    // with the sea in view the camera must stay above the waves; without it the model can be seen from below
    const minEl = st.ocean ? Math.max(-pitchLimit, Math.asin(Math.max(-1, Math.min(1, (3.5 - st.ty) / st.dist))) / D2R) : -pitchLimit;
    st.el = Math.max(minEl, Math.min(pitchLimit, st.el));
    const az = st.az * D2R, el = st.el * D2R;
    const cx = st.tx + st.dist * Math.sin(az) * Math.cos(el);
    const cy = st.ty + st.dist * Math.sin(el);
    const cz = st.tz - st.dist * Math.cos(az) * Math.cos(el);
    cam.x = cx; cam.y = cy; cam.z = cz; cam.roll = 0;
    const fx = st.tx - cx, fy = st.ty - cy, fz = st.tz - cz;
    cam.yaw = Math.atan2(fx, -fz);
    cam.pitch = Math.asin(fy / Math.hypot(fx, fy, fz));
    cam.fovY = st.fov * D2R;
    engine.showOcean = st.ocean;
    applyLight(false);
    updateShadow();
  };

  engine.hooks.prepare = () => {
    renderer.begin();
    if (subject) {
      if (subject.kind === 'ship') {
        mat4Ship(S, -cam.x, -cam.y, -cam.z, st.heading * D2R, 0, 0);
        sv.addShip(subject.ship, S, TINT, 0, 0, 0.3);
      } else {
        mat4Ship(S, -cam.x, st.alt - cam.y, -cam.z, st.heading * D2R, st.pitch * D2R, st.bank * D2R);
        if (subject.kind === 'plane') {
          pv.addPlane({
            typeKey: subject.key.slice(6), x: 0, y: st.alt, z: 0, heading: st.heading * D2R, pitch: st.pitch * D2R, roll: st.bank * D2R,
            spin: 0.7, gearDown: st.gear, fold: st.fold, hook: st.gear ? 1 : 0, ordnance: st.ord, bay: st.ord ? 1 : 0, lost: { wingL: false, wingR: false, tail: false, engine: false },
          }, cam, TINT, 0.5, 0, 0);
        } else {
          for (let i = 0; i < 16; i++) S32[i] = S[i];
          renderer.add(pv.floatplane(subject.key.slice(6)), S32, TINT, 0, 0, 0.5);
        }
      }
    }
    renderer.upload();
  };
  engine.hooks.preMain = (enc) => { if (shadowActive) renderer.drawShadow(enc); };
  engine.hooks.drawOpaque = (rp) => renderer.draw(rp);
  engine.hooks.drawGlass = (rp) => renderer.drawPanes(rp);

  // ---- API ----
  const api = {
    st,
    get subject() { return subject; },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    /** Change options (anything in the state); `silent` skips the UI refresh. */
    set(o, silent = false) {
      const dmg = ['damage', 'train', 'elev', 'parked'].some((k) => k in o && o[k] !== st[k]);
      Object.assign(st, o);
      if (dmg) applyShipOptions();
      if ('light' in o) applyLight(true);
      if (!silent) notify();
    },
    setSubject,
    frame,
    /** the state was changed from outside (camera moved by the mouse): refresh the interface */
    touch: notify,
    /** Pan the target along the camera's right / up axes (`dx`, `dy` in pixels of a view `h` pixels high). */
    pan(dx, dy, h) {
      const k = (2 * st.dist * Math.tan(st.fov * D2R / 2)) / Math.max(1, h);
      const rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      const fx = cp * sy, fy = sp, fz = -cp * cy;
      // up = right x forward
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const ul = Math.hypot(ux, uy, uz) || 1;
      st.tx += (-dx * rx + dy * ux / ul) * k;
      st.ty += (dy * uy / ul) * k;
      st.tz += (-dx * rz + dy * uz / ul) * k;
      st.ty = Math.max(-60, Math.min(400, st.ty));
    },
    /** Move the camera to one of the standard views. */
    view(name) {
      const V = { profil: [270, 4], proue: [90, 8], poupe: [-90, 8], tribord: [180, 4], babord: [0, 4], dessus: [200, 88], dessous: [200, -80], trois_quarts: [215, 14] };
      const v = V[name];
      if (!v) return;
      const d = defaults(st.subject);
      Object.assign(st, { az: v[0], el: v[1], dist: d.dist, tx: 0, ty: d.ty, tz: 0 });
      st.auto = 0;
      notify();
    },
    /** Render a PNG of the next frame and return it as a Blob. */
    async screenshot() {
      const b64 = await engine.capture();
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: 'image/png' });
    },
  };
  setSubject(initial.subject, true);
  applyLight(true);
  return api;
}
