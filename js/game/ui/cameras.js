// Camera rig: free-fly, chase, orbit, tactical (top-down), bridge, shell-cam and an automatic
// "director" that cuts between the action. It only writes engine.cam each frame.
import { clamp, wrapPi, D2R, TAU } from '../math.js';
import { cockpitEye } from '../model/cockpit.js';
import { DECK_PHASES } from '../sim/deck.js';
import { Director, formations, attacks, dogfights } from './director.js';

export const CAMERA_MODES = [
  { id: 'auto', key: '1', name: 'Auto', hint: 'Réalisateur automatique : suit l\'action' },
  { id: 'follow', key: '2', name: 'Poursuite', hint: 'Derrière le navire (glisser = orbite, molette = zoom)' },
  { id: 'orbit', key: '3', name: 'Orbite', hint: 'Tourne lentement autour du navire' },
  { id: 'bridge', key: '4', name: 'Passerelle', hint: 'Vue depuis la passerelle' },
  { id: 'shell', key: '5', name: 'Obus', hint: 'Suit les obus tirés et les bombes larguées' },
  { id: 'tactical', key: '6', name: 'Tactique', hint: 'Vue de dessus (glisser = déplacer, molette = altitude)' },
  { id: 'free', key: '7', name: 'Libre', hint: 'ZQSD / WASD, Espace/Ctrl, Maj = rapide, glisser = regarder' },
  { id: 'plane', key: '8', name: 'Avions', hint: 'Suit un avion (N / B : avion suivant, V : changer de vue)' },
  { id: 'cockpit', key: '9', name: 'Cockpit', hint: 'Vue du pilote (glisser = regarder autour)', off: true },      // (switched off until the interiors are redone: the glass is clear now)
];

/** Aircraft phases worth watching. */
const ATTACK = new Set(['rollin', 'dive', 'pullout', 'run', 'break']);
/** Phases of an aircraft still flying with its formation. */
const FLY = new Set(['assemble', 'cruise', 'climb', 'egress', 'return', 'escort', 'cap', 'ip']);
/** Is it time for a new place of the fly-by camera (the view "passage")? When there is none, it is for another aircraft, it has been there too long, the aircraft has gone by and drawn away, or is far. */
export function flybyDue(f, p, fx, fz, slow) {
  if (!f || f.plane !== p) return true;
  const past = (p.x - f.x) * fx + (p.z - f.z) * fz, away = Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z);
  return f.age > (slow ? 9 : 13) || (!slow && (past > Math.max(60, p.speed * 2.4) || away > 1300)) || (slow && away > 160);
}

/** A new place for the fly-by camera: ahead of the aircraft along its path (about six seconds of its flight), to the side the last one was not (80-130 m off the path), a little above. */
export function flybyPlace(prev, p, fx, fy, fz, zoom, slow, rnd = Math.random) {
  const hf = Math.hypot(fx, fz) || 1, rx = -fz / hf, rz = fx / hf;
  const side = prev && prev.plane === p ? -prev.side : ((p.id & 1) ? 1 : -1);
  const lead = slow ? 22 : clamp(p.speed * 6, 280, 760) * zoom, off = slow ? 34 + 14 * rnd() : (75 + 55 * rnd()) * zoom;
  const gy = Math.max(p.y + fy * lead, 6);
  return { x: p.x + fx * lead + rx * side * off, y: gy + (slow ? 4 + 3 * rnd() : 8 + 22 * rnd()), z: p.z + fz * lead + rz * side * off, age: 0, side, plane: p };
}

export const PLANE_VIEWS = [
  { id: 'chase', name: 'poursuite' }, { id: 'side', name: 'passage' }, { id: 'victim', name: 'depuis le navire visé' },
];

const FOV_DEFAULT = 58 * D2R;
const _dk = [0, 0, 0], _dk2 = [0, 0, 0];

export class CameraRig {
  constructor(engine, canvas, game) {
    this.engine = engine; this.canvas = canvas; this.game = game;
    this.mode = 'free';
    this.target = null;              // followed ship
    this.keys = Object.create(null);
    // per mode state
    this.free = { x: 0, y: 70, z: 0, yaw: 0, pitch: -0.12, speed: 60 };
    this.follow = { yaw: 0, pitch: 0.0, zoom: 1, headingS: 0 };
    this.orbit = { az: 0.6, el: 0.22, zoom: 1 };
    this.tactical = { x: 0, z: 0, alt: 6000, yaw: 0 };
    this.bridge = { yaw: 0, pitch: -0.02 };
    this.shell = { shell: null, hold: 0, x: 0, y: 0, z: 0, dx: 0, dz: 0, lastImpact: null };
    this.auto = { t: 0, sub: 'follow', hold: 0, held: 0, idle: 0 };
    this.director = new Director(this);
    this.versus = null; this.wide = { az: 0, k: 1 }; this.baseShot = null;
    this.flock = null;               // the formation or the attack being filmed (computeFormation, computeAttack)
    this.plane = null;               // followed aircraft
    this.planeCam = { yaw: 0, pitch: 0, zoom: 1, view: 'chase', t: 0, fix: null, hold: 0, crash: null, deck: false, g: 0, lastVy: null, lastP: null, look: { yaw: 0, pitch: 0 } };
    this.smooth = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, init: false, fov: FOV_DEFAULT };
    this.fovWant = FOV_DEFAULT;
    this.dragging = false;
    this.bindInput();
  }

  setMode(id, user = false) {
    if (user) this.userChoice = true;
    if (this.mode === id) return;
    const cam = this.engine.cam;
    this.mode = id;
    this.smooth.init = false;
    if (id === 'free') {
      Object.assign(this.free, { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch });
      // from high above (the tactical view), down to where the ships can be seen: a little way behind the selected ship, looking at her
      if (cam.y > 2500) {
        const t = this.target && this.target.state !== 'sunk' ? this.target : null, c = t ? { x: t.x, z: t.z } : this.focusPoint(), y = 450, back = 1600, yaw = this.free.yaw;
        Object.assign(this.free, { x: c.x - Math.sin(yaw) * back, z: c.z + Math.cos(yaw) * back, y, pitch: -Math.atan(y / back) });
      }
    }
    if (id === 'tactical') {
      const c = this.focusPoint();
      this.tactical.x = c.x; this.tactical.z = c.z;
      this.tactical.alt = clamp(this.game.battleRadius() * 2.0 + 800, 1500, 22000);
    }
    if (id === 'follow' || id === 'orbit' || id === 'bridge' || id === 'shell') {
      if (!this.target || !this.target.alive) this.pickTarget(1);
    }
    if (id === 'auto') { this.auto.t = 0; }
    if (id === 'plane' || id === 'cockpit') { if (!this.plane || !this.planeAlive(this.plane)) this.pickPlane(1); this.planeCam.fix = null; this.planeCam.hold = 0; this.planeCam.look.yaw = 0; this.planeCam.look.pitch = 0; }
    this.fovWant = id === 'cockpit' ? 66 * D2R : (id === 'bridge' ? (this.bridgeFov ?? FOV_DEFAULT) : FOV_DEFAULT);
    this.game.ui?.onCameraMode?.(id);
  }

  /** Centre of the action (average of living ships). */
  focusPoint() {
    let x = 0, z = 0, n = 0;
    for (const s of this.game.world.ships) if (s.alive) { x += s.x; z += s.z; n++; }
    return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
  }

  pickTarget(dir = 1, team = null) {
    const ships = this.game.world.ships.filter((s) => s.state !== 'sunk' && (team == null || s.team === team));
    if (!ships.length) { this.target = null; return; }
    let i = ships.indexOf(this.target);
    i = (i + dir + ships.length) % ships.length;
    if (i < 0) i = 0;
    this.setTarget(ships[i]);
  }
  setTarget(ship) { this.target = ship; this.smooth.init = false; this.game.ui?.onTarget?.(ship); }

  bindInput() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys[e.code] = true;
      if (e.repeat) return;
      const m = CAMERA_MODES.find((x) => !x.off && ('Digit' + x.key === e.code || 'Numpad' + x.key === e.code));
      if (m) this.setMode(m.id, true);
      const planeMode = this.mode === 'plane' || this.mode === 'cockpit';
      if (e.code === 'KeyN' || e.code === 'BracketRight') { if (planeMode) this.pickPlane(e.shiftKey ? -1 : 1); else this.pickTarget(e.shiftKey ? -1 : 1); e.preventDefault(); }
      if (e.code === 'KeyB' || e.code === 'BracketLeft') { if (planeMode) this.pickPlane(-1); else this.pickTarget(-1); }
      if (e.code === 'KeyV' && this.mode === 'plane') this.nextPlaneView();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
    c.addEventListener('mousedown', (e) => { this.dragging = true; this.dragMoved = 0; });
    addEventListener('mouseup', (e) => {
      if (this.dragging && this.dragMoved < 4 && e.target === this.canvas) this.game.onCanvasClick?.(e);
      this.dragging = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.onDrag(e.movementX, e.movementY);
    });
    c.addEventListener('wheel', (e) => { this.onWheel(e.deltaY); e.preventDefault(); }, { passive: false });
    // touch: one finger = drag, two fingers = zoom
    let last = null, pinch = 0;
    c.addEventListener('touchstart', (e) => { last = [e.touches[0].clientX, e.touches[0].clientY]; if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    c.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) { const p = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); this.onWheel((pinch - p) * 4); pinch = p; }
      else if (last) { this.onDrag(e.touches[0].clientX - last[0], e.touches[0].clientY - last[1]); last = [e.touches[0].clientX, e.touches[0].clientY]; }
      e.preventDefault();
    }, { passive: false });
  }

  onDrag(dx, dy) {
    const k = 0.0042;
    switch (this.mode) {
      case 'free': this.free.yaw += dx * k * 0.6; this.free.pitch = clamp(this.free.pitch - dy * k * 0.6, -1.5, 1.5); break;
      case 'follow': this.follow.yaw += dx * k; this.follow.pitch = clamp(this.follow.pitch - dy * k, -0.2, 1.3); break;
      case 'orbit': this.orbit.az += dx * k; this.orbit.el = clamp(this.orbit.el + dy * k, -0.02, 1.4); break;
      case 'bridge': this.bridge.yaw += dx * k * 0.6; this.bridge.pitch = clamp(this.bridge.pitch - dy * k * 0.6, -0.5, 0.9); break;
      case 'tactical': {
        const s = this.tactical.alt * 0.0016;
        this.tactical.x -= dx * s;
        this.tactical.z -= dy * s;
        break;
      }
      case 'auto': case 'shell': this.follow.yaw += dx * k; break;
      case 'plane': this.planeCam.yaw += dx * k; this.planeCam.pitch = clamp(this.planeCam.pitch - dy * k, -1.2, 1.3); break;
      case 'cockpit': this.planeCam.look.yaw = clamp(this.planeCam.look.yaw + dx * k * 0.6, -2.6, 2.6); this.planeCam.look.pitch = clamp(this.planeCam.look.pitch - dy * k * 0.6, -1.2, 1.2); break;
    }
  }
  onWheel(dy) {
    const f = Math.exp(dy * 0.0012);
    switch (this.mode) {
      case 'free': this.free.speed = clamp(this.free.speed / f, 3, 3000); break;
      case 'follow': this.follow.zoom = clamp(this.follow.zoom * f, 0.25, 6); break;
      case 'orbit': this.orbit.zoom = clamp(this.orbit.zoom * f, 0.25, 8); break;
      case 'tactical': this.tactical.alt = clamp(this.tactical.alt * f, 400, 30000); break;
      case 'plane': this.planeCam.zoom = clamp(this.planeCam.zoom * f, 0.3, 8); break;
      case 'cockpit': this.fovWant = clamp(this.fovWant * f, 30 * D2R, 100 * D2R); break;
      case 'bridge': this.fovWant = this.bridgeFov = clamp(this.fovWant * f, 18 * D2R, 80 * D2R); break;
    }
  }

  // ---- per frame ---------------------------------------------------------------------------------------
  update(dt) {
    const cam = this.engine.cam;
    const w = this.game.world;
    if (this.target && this.target.state === 'sunk' && this.mode !== 'free' && this.mode !== 'tactical') {
      // the target is gone: move on to a ship that is still afloat
      const alive = w.ships.filter((s) => s.alive);
      if (alive.length) this.setTarget(alive.reduce((a, b) => (Math.hypot(a.x - this.target.x, a.z - this.target.z) < Math.hypot(b.x - this.target.x, b.z - this.target.z) ? a : b)));
    }
    let mode = this.mode;
    if (mode === 'auto') mode = this.updateAuto(dt);
    // the ship that carries the camera is lost (blown up, capsizing, going down by the bow): the bridge goes with it, so the view steps out to an outside one
    // instead of sitting in the fireball and then swinging round a hull that rolls while the horizon stays level
    if (mode === 'bridge' && this.target && (this.target.state !== 'afloat' || this.target.exploded)) mode = 'orbit';
    // the automatic director does not put the camera on the bridge of a ship that burns badly or is nearly lost: the screen is black smoke
    else if (mode === 'bridge' && this.mode === 'auto' && this.target && (this.target.fireLevel > 0.4 || this.target.condition < 0.35)) mode = 'follow';
    // the view that is drawn changed between two frames without a cut of the director (the ship under the camera was lost a moment after the cut to her bridge):
    // cut too, instead of sweeping from the bridge to the outside through the hull and the fireball
    if (mode !== this._shown) { if (this._shown === 'bridge' || mode === 'bridge') this.smooth.init = false; this._shown = mode; }
    let px, py, pz, yaw, pitch, roll = 0;
    const tgt = this.target;
    const sm = this.smooth;
    switch (mode) {
      case 'free': {
        const f = this.free;
        const boost = this.keys.ShiftLeft || this.keys.ShiftRight ? 5 : 1;
        const fwd = (this.keys.KeyW || this.keys.KeyZ || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
        const str = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.KeyQ || this.keys.ArrowLeft ? 1 : 0);
        const up = (this.keys.Space || this.keys.KeyE ? 1 : 0) - (this.keys.ControlLeft || this.keys.KeyC ? 1 : 0);
        const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
        const v = f.speed * boost * dt;
        f.x += (fwd * cp * sy + str * cy) * v;
        f.y += (fwd * sp + up) * v;
        f.z += (-fwd * cp * cy + str * sy) * v;
        f.y = clamp(f.y, 2, 30000);
        px = f.x; py = f.y; pz = f.z; yaw = f.yaw; pitch = f.pitch;
        break;
      }
      case 'tactical': {
        const t = this.tactical;
        const pan = (this.keys.ShiftLeft ? 3 : 1) * t.alt * 0.5 * dt;
        t.x += ((this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.KeyQ || this.keys.ArrowLeft ? 1 : 0)) * pan;
        t.z += ((this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) - (this.keys.KeyW || this.keys.KeyZ || this.keys.ArrowUp ? 1 : 0)) * pan;
        const tilt = -1.25;
        // camera sits behind the focus point so that the focus appears at the screen centre
        px = t.x; py = t.alt; pz = t.z + t.alt / Math.tan(-tilt) * 1.0;
        yaw = 0; pitch = tilt;
        break;
      }
      case 'plane': case 'cockpit': {
        const r = this.computePlane(mode, dt);
        if (!r) { px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch; break; }
        px = r.x; py = r.y; pz = r.z; yaw = r.yaw; pitch = r.pitch; roll = r.roll || 0;
        break;
      }
      case 'versus': case 'reverse': case 'wide': {
        const r = mode === 'wide' ? this.computeWide(dt) : this.computeVersus(dt);
        if (!r) { px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch; break; }
        px = r.x; py = r.y; pz = r.z; yaw = r.yaw; pitch = r.pitch;
        break;
      }
      case 'formation': case 'attack': case 'dogfight': {
        const r = mode === 'formation' ? this.computeFormation(dt) : mode === 'attack' ? this.computeAttack(dt) : this.computeDogfight(dt);
        if (!r) { px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch; break; }
        px = r.x; py = r.y; pz = r.z; yaw = r.yaw; pitch = r.pitch;
        break;
      }
      case 'base': {
        const r = this.computeBase(dt);
        if (!r) { px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch; break; }
        px = r.x; py = r.y; pz = r.z; yaw = r.yaw; pitch = r.pitch;
        break;
      }
      case 'follow': case 'orbit': case 'bridge': case 'shell': {
        if (!tgt) { px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch; break; }
        const r = this.compute(mode, tgt, dt);
        px = r.x; py = r.y; pz = r.z; yaw = r.yaw; pitch = r.pitch;
        break;
      }
      default: px = cam.x; py = cam.y; pz = cam.z; yaw = cam.yaw; pitch = cam.pitch;
    }
    // light smoothing of the final pose (keeps cuts crisp, removes jitter)
    // (from the pilot's seat the camera is fixed to the aircraft: smoothed, it would trail a metre or three behind the eye at the speed of the aircraft, in the hull)
    const hard = mode === 'free' || mode === 'tactical' || mode === 'cockpit';
    if (!sm.init || hard) { sm.x = px; sm.y = py; sm.z = pz; sm.yaw = yaw; sm.pitch = pitch; sm.roll = roll; sm.init = true; }
    else {
      const k = 1 - Math.exp(-dt * (mode === 'shell' ? 14 : mode === 'cockpit' ? 40 : mode === 'plane' || mode === 'formation' || mode === 'dogfight' ? 12 : 9));
      sm.x += (px - sm.x) * k; sm.y += (py - sm.y) * k; sm.z += (pz - sm.z) * k;
      sm.yaw += wrapPi(yaw - sm.yaw) * k; sm.pitch += (pitch - sm.pitch) * k; sm.roll += wrapPi(roll - (sm.roll || 0)) * k;
    }
    cam.x = sm.x; cam.y = sm.y; cam.z = sm.z; cam.yaw = sm.yaw; cam.pitch = sm.pitch; cam.roll = sm.roll || 0;
    // stay above the ground of an island
    if (w.terrain) { const th = w.terrain.heightAt(cam.x, cam.z); if (th > -3 && cam.y < th + 3.5) cam.y = th + 3.5; }
    // stay above the sea
    const wh = this.engine.water.camH || 0;
    if (cam.y < wh + 1.2) cam.y = wh + 1.2;
    sm.fov += (this.fovWant - sm.fov) * Math.min(1, dt * 6);
    cam.fovY = sm.fov;
  }

  compute(mode, ship, dt) {
    const st = ship.stats;
    const L = st.L;
    const hs = ship.heading;
    if (mode === 'follow') {
      const f = this.follow;
      f.headingS += wrapPi(hs - f.headingS) * Math.min(1, dt * 1.1);
      const dist = (L * 0.85 + 45) * f.zoom;
      const yaw = f.headingS + Math.PI + f.yaw;
      const el = 0.12 + f.pitch;
      const cx = ship.x + Math.sin(yaw) * Math.cos(el) * dist, cz = ship.z - Math.cos(yaw) * Math.cos(el) * dist;
      const cy = Math.sin(el) * dist + 9 + L * 0.02;
      return this.lookAt(cx, cy, cz, ship.x, ship.model.topY * 0.35, ship.z);
    }
    if (mode === 'orbit') {
      const o = this.orbit;
      o.az += dt * 0.12;
      const dist = (L * 1.0 + 60) * o.zoom;
      const cx = ship.x + Math.sin(o.az) * Math.cos(o.el) * dist, cz = ship.z - Math.cos(o.az) * Math.cos(o.el) * dist;
      const cy = Math.sin(o.el) * dist + 6;
      return this.lookAt(cx, cy, cz, ship.x, ship.model.topY * 0.35, ship.z);
    }
    if (mode === 'bridge') {
      const b = ship.model.bridge || { x: L * 0.2, y: ship.model.topY * 0.6, z: 0 };
      const p = [0, 0, 0];
      ship.toWorld(b.x, b.y, b.z || 0, p);
      return { x: p[0], y: p[1] + (this.engine.water.camH || 0) * 0, z: p[2], yaw: hs + this.bridge.yaw, pitch: this.bridge.pitch + ship.pitch * 0.5 };
    }
    // shell cam
    return this.shellCam(ship, dt);
  }

  lookAt(cx, cy, cz, tx, ty, tz) {
    const fx = tx - cx, fy = ty - cy, fz = tz - cz;
    return { x: cx, y: cy, z: cz, yaw: Math.atan2(fx, -fz), pitch: Math.asin(fy / Math.hypot(fx, fy, fz)) };
  }

  shellCam(ship, dt) {
    const sc = this.shell;
    const w = this.game.world;
    // latest shell fired by the ship (or by any ship if it has none in the air)
    if (!sc.shell || !(w.shells.includes(sc.shell) || w.bombs.includes(sc.shell))) {
      if (sc.shell) { sc.hold = 2.4; sc.lastImpact = { x: sc.x, y: Math.max(sc.y, 2), z: sc.z, dx: sc.dx, dz: sc.dz }; sc.shell = null; }
      let found = null;
      for (let i = w.shells.length - 1; i >= 0; i--) if (w.shells[i].owner === ship && w.shells[i].group === 'main') { found = w.shells[i]; break; }
      if (!found && sc.hold <= 0) for (let i = w.shells.length - 1; i >= 0; i--) if (w.shells[i].gun.cal >= 150) { found = w.shells[i]; break; }
      // no shell in the air: ride a bomb down onto its target
      if (!found && sc.hold <= 0 && w.bombs.length) found = w.bombs[w.bombs.length - 1];
      if (found && sc.hold <= 0) sc.shell = found;
    }
    if (sc.shell) {
      const s = sc.shell;
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      sc.x = s.x; sc.y = s.y; sc.z = s.z; sc.dx = s.vx / sp; sc.dz = s.vz / sp;
      const dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp;
      const back = 22 + this.follow.zoom * 10;
      return this.lookAt(s.x - dx * back + dz * 6, s.y - dy * back + 5, s.z - dz * back - dx * 6, s.x + dx * 30, s.y + dy * 30, s.z + dz * 30);
    }
    if (sc.hold > 0 && sc.lastImpact) {
      sc.hold -= dt;
      const li = sc.lastImpact;
      return this.lookAt(li.x - li.dx * 90 + li.dz * 60, li.y + 28, li.z - li.dz * 90 - li.dx * 60, li.x, li.y + 5, li.z);
    }
    // nothing in flight: chase view of the ship
    const f = this.follow;
    const dist = (ship.stats.L * 0.85 + 45) * 0.9;
    const yaw = ship.heading + Math.PI + 0.5;
    return this.lookAt(ship.x + Math.sin(yaw) * dist, 18 + ship.stats.L * 0.03, ship.z - Math.cos(yaw) * dist, ship.x, ship.model.topY * 0.35, ship.z);
  }


  // ---- aircraft cameras ----------------------------------------------------------------------------------------------
  planeAlive(p) { return this.game.world.planes.includes(p) && !p.hidden && !(p.phase === 'queue' && !(p.owner && p.owner.alive)); }

  /** Aircraft worth watching, best first. */
  planeCandidates() {
    const w = this.game.world, cam = this.engine.cam;
    const out = [];
    for (const p of w.planes) {
      if (p.hidden) continue;
      let sc = Math.random() * 1.2;
      if (ATTACK.has(p.phase)) sc += 5;
      if (p.phase === 'engage') sc += p.firing ? 6 : 3;
      if (p.dying) sc += 6;
      if (p.phase === 'final' || p.phase === 'takeoff' || p.phase === 'rollout') sc += 1.5;
      if (p.ordnance) sc += 1;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      sc -= d * 0.00004;
      out.push({ p, sc });
    }
    out.sort((a, b) => b.sc - a.sc);
    return out;
  }

  pickPlane(dir = 1) {
    const w = this.game.world;
    // (the aircraft parked on an airfield only when none is out: N would otherwise go through a whole parking area)
    let list = w.planes.filter((p) => !p.hidden && p.phase !== 'queue' && p.phase !== 'parked').sort((a, b) => a.id - b.id);
    if (!list.length) list = w.planes.filter((p) => !p.hidden && p.phase !== 'queue').sort((a, b) => a.id - b.id);
    if (!list.length) { this.plane = null; return; }
    // best candidate when nothing is followed, otherwise the neighbour in the list
    let i = list.indexOf(this.plane);
    if (i < 0) { const c = this.planeCandidates(); this.setPlane(c.length ? c[0].p : list[0]); return; }
    i = (i + dir + list.length) % list.length;
    this.setPlane(list[i]);
  }
  setPlane(p) { this.plane = p; this.planeCam.deck = false; this.planeCam.fix = null; this.planeCam.t = 0; this.smooth.init = false; this.game.ui?.onPlane?.(p); }
  nextPlaneView() {
    const pc = this.planeCam;
    const i = PLANE_VIEWS.findIndex((v) => v.id === pc.view);
    pc.view = PLANE_VIEWS[(i + 1) % PLANE_VIEWS.length].id;
    pc.fix = null; this.smooth.init = false;
    this.game.ui?.onPlaneView?.(pc.view);
  }

  /** Events that interest the aircraft cameras (a followed aircraft crashing, a bomb being released...). */
  onEvents(events) {
    const pc = this.planeCam;
    this.director.note(events, this.game.world.time);
    // (a shot of several aircraft is not cut for one of them: the drop is what an attack shot is there for)
    const a = this.auto, group = a.sub === 'attack' || a.sub === 'dogfight' || (a.sub === 'formation' && a.held < 5);
    for (const e of events) {
      if (this.mode === 'auto' && !group && (e.type === 'bombDrop' || e.type === 'torpedoDrop' || e.type === 'planeDown') && Math.random() < 0.45 && this.auto.sub !== 'plane') { this.auto.forcePlane = e.plane; this.auto.t = 0; }
      // the director likes a touchdown on the wire and a take-off run (a take-off only when the carrier is in sight)
      if (this.mode === 'auto' && !group && (e.type === 'planeTouchdown' || e.type === 'planeLaunch') && Math.random() < 0.3 && this.auto.sub !== 'plane') { this.auto.forcePlane = e.plane; this.auto.t = 0; this.auto.deckShot = true; }
      if (e.type === 'planeCrash' && e.plane === this.plane) {
        pc.crash = { x: e.x, y: Math.max(e.y, 2), z: e.z, dx: Math.sin(e.plane.heading), dz: -Math.cos(e.plane.heading) };
        pc.hold = 3.2;
      }
    }
  }

  computePlane(mode, dt) {
    const w = this.game.world, pc = this.planeCam;
    let p = this.plane;
    if (!p || !this.planeAlive(p)) {
      if (pc.hold > 0 && pc.crash) {
        // the aircraft we were following has just crashed: stay on the impact for a moment
        pc.hold -= dt;
        const c = pc.crash;
        return this.lookAt(c.x - c.dx * 120 + c.dz * 70, c.y + 38, c.z - c.dz * 120 - c.dx * 70, c.x, c.y + 8, c.z);
      }
      pc.crash = null;
      const c = this.planeCandidates();
      if (c.length) { this.setPlane(c[0].p); p = this.plane; }
      else { this.plane = null; return this.noPlaneView(); }
    }
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    // the external views follow the way the aircraft is going, smoothed: an aircraft that tumbles, spins or loops as it falls turns its nose every which way, and a
    // camera that followed the nose would swing round it in loops
    const sv = Math.hypot(p.vx, p.vy, p.vz);
    const ax = sv > 8 ? p.vx / sv : sh * cp, ay = sv > 8 ? p.vy / sv : sp, az = sv > 8 ? p.vz / sv : -ch * cp;
    if (pc.fdPlane !== p || !pc.fd) { pc.fd = [ax, ay, az]; pc.fdPlane = p; }
    else {
      const kd = 1 - Math.exp(-dt * (p.dying ? 2.2 : 6));
      pc.fd[0] += (ax - pc.fd[0]) * kd; pc.fd[1] += (ay - pc.fd[1]) * kd; pc.fd[2] += (az - pc.fd[2]) * kd;
      const l = Math.hypot(pc.fd[0], pc.fd[1], pc.fd[2]) || 1; pc.fd[0] /= l; pc.fd[1] /= l; pc.fd[2] /= l;
    }
    const fx = pc.fd[0], fy = pc.fd[1], fz = pc.fd[2];                      // flight direction (smoothed)
    if (mode === 'cockpit' && !p.dying) {
      // the pilot's eye (where the cockpit is built, model/cockpit.js). The view banks and pitches with the aircraft; the head sinks under positive g and shakes
      // with the engine and the air; the eye is a little lower at speed.
      const pitchA = p.pitch + (p.aoa || 0), bank = p.bank || 0;
      const yaw = p.heading + pc.look.yaw, pitch = clamp(pitchA + pc.look.pitch, -1.45, 1.45);
      const E = cockpitEye(p.spec);
      pc.t += dt;
      const ga = pc.lastVy == null || pc.lastP !== p ? 0 : (p.vy - pc.lastVy) / Math.max(dt, 1e-3) / 9.81;
      pc.lastVy = p.vy; pc.lastP = p;
      pc.g += (clamp(ga, -3, 5) - pc.g) * Math.min(1, dt * 3);
      const vib = (0.0014 + 0.0035 * clamp(p.speed / 130, 0, 1)) * (p.lost && p.lost.engine ? 0.2 : 1);
      const tt = pc.t;
      const hx = Math.sin(tt * 61) * vib * 0.5, hy = Math.sin(tt * 47 + 1.3) * vib + Math.sin(tt * 3.1) * 0.0012 * clamp(p.speed / 100, 0, 1), hz = Math.sin(tt * 53 + 0.4) * vib * 0.7;
      const ex = E.x + hx, ey = E.y - pc.g * 0.012 + hy, ez = (E.z || 0) + hz;
      // the eye in the aircraft's frame (x forward, y up, z starboard) -> world: pitch, then bank about the flight axis
      const cpA = Math.cos(pitchA), spA = Math.sin(pitchA), cb = Math.cos(bank), sb = Math.sin(bank);
      const ux = -sh * spA * cb + ch * sb, uy = cpA * cb, uz = ch * spA * cb + sh * sb;      // aircraft up
      const f2 = [sh * cpA, spA, -ch * cpA];
      const rr = [ch, 0, sh];                                                              // (the right-hand vector, bank ignored: the head moves little)
      return { x: p.x + f2[0] * ex + ux * ey + rr[0] * ez, y: p.y + f2[1] * ex + uy * ey, z: p.z + f2[2] * ex + uz * ey + rr[2] * ez, yaw, pitch, roll: bank };
    }
    if (pc.view !== 'victim') { const d = this.deckLanding(p); if (d) return d; }
    pc.t += dt;
    const zoom = pc.zoom;
    if (pc.view === 'chase') {
      // behind the tail along the flight path (so a dive is followed down the line of the dive), a little above it
      const U = [-fx * fy, 1 - fy * fy, -fz * fy];
      const ul = Math.hypot(U[0], U[1], U[2]) || 1; U[0] /= ul; U[1] /= ul; U[2] /= ul;
      const el = 0.22 + pc.pitch, back = 30 * zoom, ya = pc.yaw;
      // -F * back * cos(el) + U * back * sin(el), then turned about the vertical by the user's drag
      const k = Math.cos(el) * back, sn = Math.sin(el) * back;
      const ox = -fx * k + U[0] * sn, oy = -fy * k + U[1] * sn, oz = -fz * k + U[2] * sn;
      const px2 = ox * Math.cos(ya) + oz * Math.sin(ya), pz2 = -ox * Math.sin(ya) + oz * Math.cos(ya);
      this.fovWant = 60 * D2R;
      return this.lookAt(p.x + px2, Math.max(p.y + oy, 6), p.z + pz2, p.x + fx * 12, p.y + fy * 12, p.z + fz * 12);
    }
    if (pc.view === 'side') {
      // a fly-by: the camera waits ahead of the aircraft, off to one side, and lets it come, go by and draw away; then a cut to a new place ahead of it. A long approach
      // (about six seconds), well clear of the path (eighty to a hundred and thirty metres: at fifty it crossed the frame in a blink), the lens narrow at a distance and wider as it
      // comes, a cut at the moment it has drawn away, not a slide of the camera to the new place (which carried it through the aircraft)
      const slow = p.speed < 20;                                  // parked, taxiing, rolling: nothing to fly by, a camera near it
      if (flybyDue(pc.fix, p, fx, fz, slow)) {
        pc.fix = flybyPlace(pc.fix, p, fx, fy, fz, zoom, slow);
        this.smooth.init = false;                                // a cut
      }
      pc.fix.age += dt;
      const dist = Math.hypot(p.x - pc.fix.x, p.y - pc.fix.y, p.z - pc.fix.z), L = (p.spec && p.spec.L) || 10;
      this.fovWant = clamp(2 * Math.atan(L * 3.2 / Math.max(dist, 1)), (slow ? 28 : 9) * D2R, 46 * D2R);
      return this.lookAt(pc.fix.x, pc.fix.y, pc.fix.z, p.x + fx * 3, p.y, p.z + fz * 3);
    }
    // 'victim': from the deck of the ship the aircraft is attacking
    // (not from a ship that is going down, on fire or smoking heavily, nor when the aircraft is almost overhead: the screen is then a brown smoke or a blank sky)
    let tgt = p.target && p.target.state === 'afloat' && !p.target.exploded && p.target.condition > 0.4 && p.target.fireLevel < 0.35 ? p.target : null;
    // the view from the deck of the victim is for an aircraft that is attacking or about to: from a ship far away it would look at an empty sky
    if (tgt && (Math.hypot(p.x - tgt.x, p.z - tgt.z) > 7000 || DECK_PHASES.has(p.phase) || p.phase === 'assemble')) tgt = null;
    if (tgt) {
      const b = tgt.model.bridge || { x: 0, y: tgt.model.topY * 0.6, z: 0 };
      const q = [0, 0, 0];
      tgt.toWorld(b.x, b.y + 1, b.z || 0, q);
      const dist = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
      if ((p.y - q[1]) / Math.max(dist, 1) > 0.85) tgt = null;
    }
    if (tgt) {
      const b = tgt.model.bridge || { x: 0, y: tgt.model.topY * 0.6, z: 0 };
      const q = [0, 0, 0];
      tgt.toWorld(b.x, b.y + 1, b.z || 0, q);
      const dist = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
      this.fovWant = clamp(dist / 150, 8, 50) * D2R;       // narrow enough to see the aircraft at a distance
      return this.lookAt(q[0], q[1], q[2], p.x, p.y, p.z);
    }
    pc.view = 'chase';
    return null;
  }

  /**
   * An aircraft landing on a carrier is followed from the deck, beside the wires on the side away from the island (where the landing signal officer stands):
   * from the turn into the groove until it has stopped and taxied clear. The camera is fixed to the ship, so that the pitching of the deck and the stop on the
   * wire are seen as they are. Returns null when the aircraft is not landing (the usual chase view applies).
   */
  deckLanding(p) {
    const pc = this.planeCam, ship = p.owner, dp = ship && ship.model && ship.model.deckPoints;
    if (!ship || !ship.alive || !dp || !dp.x1 || !(p.phase === 'final' || p.phase === 'rollout' || p.phase === 'taxiIn')) { if (pc.deck) { pc.deck = false; this.smooth.init = false; } return null; }
    ship.toLocal(p.x, p.y, p.z, _dk);
    const lx = _dk[0];
    if (!pc.deck) {
      if (!((p.phase === 'final' && lx >= dp.x0 - 480) || p.phase === 'rollout')) return null;
      pc.deck = true; this.smooth.init = false;
    }
    if (p.phase === 'taxiIn' && lx > dp.x0 + 190) { pc.deck = false; this.smooth.init = false; return null; }
    const isl = ship.model.island, side = isl && isl.z < 0 ? 1 : -1;
    ship.toWorld(dp.x0 + 46, ship.model.fdY + 4.2, side * (dp.hw + 10), _dk2);
    const dist = Math.hypot(p.x - _dk2[0], p.y - _dk2[1], p.z - _dk2[2]);
    this.fovWant = clamp(2 * Math.atan(46 / Math.max(dist, 1)), 14 * D2R, 62 * D2R);
    return this.lookAt(_dk2[0], _dk2[1], _dk2[2], p.x, p.y + 0.8, p.z);
  }

  /** Nothing in the air: look at the flight deck of a carrier that is about to launch (or the nearest one). */
  noPlaneView() {
    const w = this.game.world;
    const cv = w.ships.filter((s) => s.air && s.alive).sort((a, b) => (b.air.cooldown < a.air.cooldown ? 1 : -1))[0];
    if (!cv) return null;
    const f = this.follow;
    const dist = cv.stats.L * 0.55 + 40, yaw = cv.heading + Math.PI * 0.82;
    return this.lookAt(cv.x + Math.sin(yaw) * dist, cv.y + 28, cv.z - Math.cos(yaw) * dist, cv.x, cv.y + (cv.model.fdY || 15), cv.z);
  }

  /** A shot of a base worth looking at: a battery that has just fired (from beside the guns, looking along the barrels) or a base that is burning (circling it). */
  pickBaseShot() {
    const w = this.game.world, pick = (l) => l[Math.floor(Math.random() * l.length)];
    const firing = w.bases.filter((b) => !b.inert && b.gun && w.time - b.lastShotT < 5 && b.guns.some((g) => g.kind === 'coastal' && g.alive));
    const burning = w.bases.filter((b) => !b.inert && b.fires.length > 1);
    if (firing.length && (!burning.length || Math.random() < 0.6)) {
      const b = pick(firing), g = pick(b.guns.filter((q) => q.kind === 'coastal' && q.alive));
      return { kind: 'guns', base: b, gun: g, side: Math.random() < 0.5 ? -1 : 1, dist: 45 + Math.random() * 60, h: 6 + Math.random() * 14, back: 30 + Math.random() * 40, fov: 46 + Math.random() * 12 };
    }
    if (burning.length) {
      const b = pick(burning), f = pick(b.fires);
      return { kind: 'ruins', base: b, fire: f, az: Math.random() * TAU, dist: 160 + Math.random() * 160, h: 55 + Math.random() * 70, fov: 48 };
    }
    return null;
  }

  computeBase(dt) {
    const s = this.baseShot;
    if (!s) return null;
    if (s.kind === 'guns') {
      const g = s.gun, yaw = g.heading + g.train, f = [Math.sin(yaw), -Math.cos(yaw)], r = [Math.cos(yaw), Math.sin(yaw)];
      const th = this.game.world.terrain ? this.game.world.terrain.heightAt(g.x, g.z) : g.y;
      return this.lookAt(g.x - f[0] * s.back + r[0] * s.side * s.dist, th + s.h, g.z - f[1] * s.back + r[1] * s.side * s.dist, g.x + f[0] * 70, g.y + 5, g.z + f[1] * 70);
    }
    s.az += dt * 0.15;
    const f = s.fire;
    return this.lookAt(f.x + Math.sin(s.az) * s.dist, f.y + s.h, f.z - Math.cos(s.az) * s.dist, f.x, f.y + 6, f.z);
  }

  /** A shot of the ruins at a place where something big has just blown up (a base put out of action). */
  ruinsAt(x, z) {
    const T = this.game.world.terrain, y = T ? Math.max(0, T.heightAt(x, z)) : 0;
    return { kind: 'ruins', base: null, fire: { x, y, z }, az: Math.random() * TAU, dist: 220 + Math.random() * 200, h: 70 + Math.random() * 70, fov: 50 };
  }

  /** The camera for a ship that fires on another: from behind and above the shooter (`versus`), or from beyond the target, shells coming in (`reverse`). */
  computeVersus(dt) {
    const v = this.versus, A = v && v.ship;
    if (!A || A.state === 'sunk') return null;
    const B = A.cmd.main.target;
    if (!B || !B.alive) return null;
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, px = -uz, pz = ux;
    if (!v.reverse) {
      const back = A.stats.L * 0.95 + 90 + 60 * v.k, side = (A.stats.B * 0.9 + 14) * v.side;
      const cx = A.x - ux * back + px * side, cz = A.z - uz * back + pz * side, cy = 15 + A.stats.L * 0.05 + 12 * v.k;
      const k = clamp(0.45 + 0.25 * Math.min(1, 5000 / d), 0.4, 0.7);
      return this.lookAt(cx, cy, cz, A.x + dx * k, A.model.topY * 0.3, A.z + dz * k);
    }
    const L = B.stats ? B.stats.L : 200, beyond = L * 0.5 + 150 + 80 * v.k, side = 70 * v.side;
    const cx = B.x + ux * beyond + px * side, cz = B.z + uz * beyond + pz * side, cy = 24 + 26 * v.k;
    return this.lookAt(cx, cy, cz, B.x - ux * Math.min(d, 600) * 0.15, (B.model ? B.model.topY : 10) * 0.3, B.z - uz * Math.min(d, 600) * 0.15);
  }

  /** An establishing shot: the group of the subject ship seen from high and a long way off, the camera circling slowly (the whole battle would be a few pixels). */
  computeWide(dt) {
    const wd = this.wide, t = this.target;
    if (!t) return null;
    wd.az += dt * 0.06;
    // (not too high: above a thousand metres or so the sea and the sky lose their detail)
    const R = (800 + t.stats.L * 2.4) * wd.k, h = clamp(R * 0.14 + 50, 110, 320);
    return this.lookAt(t.x + Math.sin(wd.az) * R, h, t.z - Math.cos(wd.az) * R, t.x + t.vx * 6, 8, t.z + t.vz * 6);
  }

  /** The aircraft of the shot that are still in it (alive, in the air). */
  flockPlanes() {
    const f = this.flock;
    if (!f) return [];
    f.planes = f.planes.filter((p) => this.planeAlive(p) && !p.dying);
    return f.planes;
  }

  /**
   * A formation in the air: the camera flies with it (beside it, above and astern, or ahead of it and to one side, the formation coming on), far enough to hold every aircraft
   * of it in the frame; or it waits ahead and the formation goes by. The way the formation flies is smoothed, so that one aircraft weaving does not swing the camera.
   */
  computeFormation(dt) {
    const f = this.flock, list = this.flockPlanes();
    if (!f || !list.length) return null;
    let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0;
    for (const p of list) { x += p.x; y += p.y; z += p.z; vx += p.vx; vy += p.vy; vz += p.vz; }
    const n = list.length;
    x /= n; y /= n; z /= n;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const k = f.fd ? 1 - Math.exp(-dt * 1.5) : 1;
    f.fd = f.fd || [0, 0, 0];
    f.fd[0] += (vx / vl - f.fd[0]) * k; f.fd[1] += (vy / vl - f.fd[1]) * k; f.fd[2] += (vz / vl - f.fd[2]) * k;
    const fl = Math.hypot(f.fd[0], f.fd[2]) || 1, fx = f.fd[0] / fl, fz = f.fd[2] / fl;      // the way they go, in plan
    const rx = -fz, rz = fx;                                                                     // their right
    let r = 0;
    for (const p of list) r = Math.max(r, Math.hypot(p.x - x, p.y - y, p.z - z));
    // (the radius shrinks when one of them goes down: follow it slowly, the frame does not jump)
    f.r = f.r == null ? r : f.r + (r - f.r) * (1 - Math.exp(-dt * (r > f.r ? 3 : 0.6)));
    // near enough that the aircraft are aircraft, not dots: the group fills the frame (the frame is wider than it is high)
    const half = Math.tan(this.fovWant / 2), need = (f.r + 12) / half * 0.78 + 15;
    if (f.view === 'pass') {
      // a fixed camera ahead of the formation and to one side, at their height or a little under: they come on and go by
      if (!f.fix || (x - f.fix.x) * fx + (z - f.fix.z) * fz > need * 0.6) {
        const lead = need * 1.6 + 120, off = need * 0.55 * f.side;
        f.fix = { x: x + fx * lead + rx * off, y: Math.max(25, y - 20 - 30 * f.k), z: z + fz * lead + rz * off };
      }
      return this.lookAt(f.fix.x, f.fix.y, f.fix.z, x, y, z);
    }
    // flying with it: astern / abeam / ahead (az, from the tail round to the side f.side), above or below (el)
    const az = f.az, el = f.el;
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el);
    const ox = (-fx * ca + rx * sa * f.side) * ce, oz = (-fz * ca + rz * sa * f.side) * ce, oy = Math.sin(el);
    const cy = Math.max(y + oy * need, 18);
    return this.lookAt(x + ox * need, cy, z + oz * need, x + fx * f.r * 0.4, y, z + fz * f.r * 0.4);
  }

  /**
   * Several aircraft attacking one ship: from over the shoulder of the attackers, the ship ahead of them, or from beside the line of their attack, the ship and the
   * aircraft coming at her in one frame.
   */
  computeAttack(dt) {
    const f = this.flock, S = f && f.ship;
    if (!S || S.state === 'sunk') return null;
    // the two or three aircraft nearest the ship: the ones about to drop (the others, kilometres behind, would shrink the frame to nothing)
    const list = this.flockPlanes().filter((p) => p.target === S).sort((a, b) => Math.hypot(a.x - S.x, a.y - S.y, a.z - S.z) - Math.hypot(b.x - S.x, b.y - S.y, b.z - S.z)).slice(0, 3);
    // the aircraft that have dropped and gone, or are all down: hold on the ship a moment longer (the torpedoes running, the bombs falling)
    if (list.length) { let x = 0, y = 0, z = 0; for (const p of list) { x += p.x; y += p.y; z += p.z; } f.at = [x / list.length, y / list.length, z / list.length]; f.lost = 0; }
    else { f.lost = (f.lost || 0) + dt; if (!f.at) return null; }
    const A = f.at;
    // the frame holds the ship and these aircraft
    const pts = list.map((p) => [p.x, p.y, p.z]);
    pts.push(A);
    const T = this.game.world.terrain;
    if (f.view === 'behind' && list.length) {
      // over the shoulder of the attackers: behind them and a little above, the ship ahead of them
      let gr = 0;
      for (const p of list) gr = Math.max(gr, Math.hypot(p.x - A[0], p.y - A[1], p.z - A[2]));
      const tx = S.x - A[0], ty = Math.max(S.model.topY * 0.3, 2) - A[1], tz = S.z - A[2], tl = Math.hypot(tx, ty, tz) || 1, ux = tx / tl, uy = ty / tl, uz = tz / tl;
      const back = gr * 1.1 + 70, sx = -uz * f.side, sz = ux * f.side;
      const cx = A[0] - ux * back + sx * (gr * 0.4 + 20), cz = A[2] - uz * back + sz * (gr * 0.4 + 20);
      const cy = Math.max(A[1] - uy * back + 18 + gr * 0.2, 12);
      return this.lookAt(cx, cy, cz, S.x * 0.75 + A[0] * 0.25, (S.model.topY * 0.3) * 0.75 + A[1] * 0.25, S.z * 0.75 + A[2] * 0.25);
    }
    // from the side of the line from the ship to the aircraft, a little behind the ship: the ship in front, the aircraft beyond
    const dx = A[0] - S.x, dz = A[2] - S.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, px = -uz * f.side, pz = ux * f.side;
    const cx = S.x + dx * 0.45, cz = S.z + dz * 0.45;                                          // the middle of the frame, nearer the ship
    let ext = S.stats.L * 0.6 + 30;
    for (const p of pts) ext = Math.max(ext, Math.hypot(p[0] - cx, p[2] - cz) + 20);
    ext = Math.min(ext, 600);       // (the far ones may leave the frame: better that than a ship and aircraft of a few pixels)
    const half = Math.tan(this.fovWant / 2) * (this.engine.stats.width / Math.max(1, this.engine.stats.height) || 1.6);
    const back = ext / half * 0.95 + 80;
    const camX = cx + px * back * Math.cos(f.k) - ux * back * Math.sin(f.k), camZ = cz + pz * back * Math.cos(f.k) - uz * back * Math.sin(f.k);
    let maxY = 0;
    for (const p of pts) maxY = Math.max(maxY, p[1]);
    let camY = 30 + back * 0.08 + Math.min(maxY, 900) * 0.25;
    if (T) { const th = T.heightAt(camX, camZ); if (th > -2) camY = Math.max(camY, th + 40); }
    return this.lookAt(camX, camY, camZ, cx, Math.min(maxY * 0.45, 400) + 5, cz);
  }

  /**
   * Two aircraft fighting, a fighter on the tail of its prey, both in the frame: from behind and above the hunter, looking past it at the prey (`chase`); from beyond
   * the prey, the hunter coming on behind it (`tail`); or from the side of the pair, the camera keeping pace with them (`side`). When the prey goes down the camera
   * stays on it a few seconds.
   */
  computeDogfight(dt) {
    const f = this.flock;
    if (!f) return null;
    const H = f.hunter, Q = f.prey, w = this.game.world;
    const hOk = w.planes.includes(H) && !H.hidden && !H.gone, qOk = w.planes.includes(Q) && !Q.hidden && !Q.gone;
    if (!hOk || !qOk) return null;
    // the line from the hunter to the prey, smoothed (two aircraft turning hard swing it round fast)
    const dx = Q.x - H.x, dy = Q.y - H.y, dz = Q.z - H.z, d = Math.hypot(dx, dy, dz) || 1;
    const k = f.u ? 1 - Math.exp(-dt * 3) : 1;
    f.u = f.u || [0, 0, 0];
    f.u[0] += (dx / d - f.u[0]) * k; f.u[1] += (dy / d - f.u[1]) * k; f.u[2] += (dz / d - f.u[2]) * k;
    const ul = Math.hypot(f.u[0], f.u[1], f.u[2]) || 1, ux = f.u[0] / ul, uy = f.u[1] / ul, uz = f.u[2] / ul;
    const hl = Math.hypot(ux, uz) || 1, sx = -uz / hl * f.side, sz = ux / hl * f.side;          // to one side, level
    f.d = f.d == null ? d : f.d + (d - f.d) * (1 - Math.exp(-dt * 2));
    const D = f.d;
    if (f.view !== 'chase' && D > 420) f.view = 'chase';
    if (f.view === 'tail') {
      // beyond the prey, a little to one side and above: the prey in the foreground, the hunter behind it
      const back = 22 + D * 0.08;
      return this.frameTwo(Q.x + ux * back + sx * 9, Math.max(Q.y + uy * back + 5, 8), Q.z + uz * back + sz * 9, Q, H);
    }
    if (f.view === 'side') {
      // abeam of the pair, far enough to hold both
      const half = Math.tan(this.fovWant / 2) * (this.engine.stats.width / Math.max(1, this.engine.stats.height) || 1.6);
      const R = (D * 0.5 + 16) / half * 1.15 + 30;
      const mx = (H.x + Q.x) / 2, my = (H.y + Q.y) / 2, mz = (H.z + Q.z) / 2;
      return this.lookAt(mx + sx * R - ux * R * 0.25, Math.max(my + R * 0.12, 8), mz + sz * R - uz * R * 0.25, mx, my, mz);
    }
    // behind and above the hunter, the prey ahead of it
    const back = 30 + D * 0.05;
    return this.frameTwo(H.x - ux * back + sx * 6, Math.max(H.y - uy * back + 4 + D * 0.015, 8), H.z - uz * back + sz * 6, H, Q);
  }

  /** The camera at (cx, cy, cz) aimed between the near aircraft A and the far one B, the field of view just wide enough for both (A a little more in the middle). */
  frameTwo(cx, cy, cz, A, B) {
    let ax = A.x - cx, ay = A.y - cy, az = A.z - cz, bx = B.x - cx, by = B.y - cy, bz = B.z - cz;
    const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
    ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
    const ang = Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1));
    // (beyond about 70 degrees apart the two cannot both be framed: the camera keeps the near one and looks towards the other)
    const wa = ang > 70 * D2R ? 0.75 : 0.55;
    this.fovWant = clamp(ang * 1.3 + 12 * D2R, 30 * D2R, 75 * D2R);
    return this.lookAt(cx, cy, cz, cx + (ax * wa + bx * (1 - wa)) * 100, cy + (ay * wa + by * (1 - wa)) * 100, cz + (az * wa + bz * (1 - wa)) * 100);
  }

  /** Start a shot of two aircraft fighting (from dogfights()). */
  startDogfight(g, now) {
    const a = this.auto, D = this.director;
    // (the views from beyond the prey and from the side only for a close fight: otherwise the far one of the two is a dot)
    const r = Math.random(), view = g.d > 280 || r < 0.45 ? 'chase' : r < 0.75 ? 'tail' : 'side';
    this.flock = { kind: 'dogfight', hunter: g.hunter, prey: g.prey, planes: [g.hunter, g.prey], view, side: Math.random() < 0.5 ? -1 : 1, u: null, d: null, broken: 0, down: 0 };
    this.fovWant = (view === 'side' ? 40 : 50) * D2R;
    a.sub = 'dogfight'; a.t = D.length('dogfight'); a.held = 0;
    this.smooth.init = false;
    D.started('dogfight', null, now);
    D.lastDogfight = now;
  }

  /** Start a shot of a formation (from formations()). */
  startFormation(g, now) {
    const a = this.auto, D = this.director;
    const views = ['abeam', 'quarter', 'high', 'ahead', 'pass'];
    const view = views[Math.floor(Math.random() * views.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    // az: from the tail (0) round to the side (pi/2) and ahead (pi); el: above (+) or below (-)
    const pose = { abeam: [Math.PI * 0.5 + (Math.random() - 0.5) * 0.4, 0.05 + Math.random() * 0.1], quarter: [0.7 + Math.random() * 0.3, 0.15 + Math.random() * 0.1],
      high: [0.35 + Math.random() * 0.3, 0.45 + Math.random() * 0.2], ahead: [2.3 + Math.random() * 0.4, -0.02 + Math.random() * 0.12], pass: [0, 0] }[view];
    this.flock = { kind: 'formation', planes: g.planes.slice(), view, side, az: pose[0], el: pose[1], k: Math.random(), fix: null, fd: null, r: null };
    this.fovWant = (view === 'pass' ? 30 + Math.random() * 10 : 40 + Math.random() * 12) * D2R;
    a.sub = 'formation'; a.t = D.length('formation'); a.held = 0;
    this.smooth.init = false;
    D.started('formation', null, now);
    D.lastFormation = now;
  }

  /** Start a shot of an attack on one ship by several aircraft (from attacks()). */
  startAttack(g, now) {
    const a = this.auto, D = this.director;
    // (no view from her deck: the smoke of her funnels and her fires fills it, and the aircraft are specks kilometres away)
    const view = Math.random() < 0.6 ? 'behind' : 'side';
    this.flock = { kind: 'attack', ship: g.ship, planes: g.planes.slice(), view, side: Math.random() < 0.5 ? -1 : 1, k: (Math.random() - 0.3) * 0.5, at: null };
    this.fovWant = (view === 'behind' ? 50 + Math.random() * 8 : 42 + Math.random() * 10) * D2R;
    this.setTarget(g.ship);
    a.sub = 'attack'; a.t = D.length('attack'); a.held = 0;
    this.smooth.init = false;
    D.started('attack', g.ship, now);
    D.seenAttack.set(g.ship, now);
  }

  /** A reaction to a big moment: the ship that blows up or goes down seen from a good way off, or the ruins of a base. */
  react(m, now) {
    const a = this.auto, w = this.game.world, D = this.director;
    m.seen = true;
    let ship = m.ship && m.ship.state !== 'sunk' ? m.ship : null;
    if (!ship) {
      let bd = 1e9;
      for (const s of w.ships) { const d = Math.hypot(s.x - m.x, s.z - m.z); if (s.state !== 'sunk' && d < bd) { bd = d; ship = s; } }
      if (!ship || bd > 2500 || m.kind === 'basedown' || m.kind === 'basefire') ship = null;
    }
    this.smooth.init = false;
    if (!ship) {
      this.baseShot = this.ruinsAt(m.x, m.z);
      a.sub = 'base'; a.t = 5.5 + Math.random() * 2.5; a.held = 0;
      this.fovWant = this.baseShot.fov * D2R;
      D.started('base', null, now);
      return;
    }
    this.setTarget(ship);
    // from the side, high enough to see the whole ship and the smoke over her
    const o = this.orbit;
    o.az = Math.random() * TAU; o.el = 0.18 + Math.random() * 0.2; o.zoom = 1.5 + Math.random() * 0.9;
    this.fovWant = FOV_DEFAULT;
    a.sub = 'orbit'; a.t = 5.5 + Math.random() * 2.5; a.held = 0;
    D.started('event', ship, now);
  }

  /** Is the current shot still worth keeping? (the ship gone, hidden behind an island, nothing in flight for a shell cam) */
  shotBad(dt, sub) {
    const a = this.auto, D = this.director, w = this.game.world, cam = this.engine.cam, t0 = this.target;
    const shipShot = sub === 'follow' || sub === 'orbit' || sub === 'bridge' || sub === 'shell' || sub === 'tactical' || sub === 'wide';
    if (shipShot) {
      const gone = !t0 || t0.state === 'sunk' || (t0.state === 'sinking' && t0.sinkT > 16) || (t0.state !== 'afloat' && t0.state !== 'sinking');
      if (gone) return true;
    }
    if (sub === 'versus' || sub === 'reverse') {
      const A = this.versus && this.versus.ship;
      if (!A || A.state === 'sunk' || !A.cmd.main.target || !A.cmd.main.target.alive) return true;
    }
    if (sub === 'shell') {
      const sc = this.shell;
      a.idle = !sc.shell && sc.hold <= 0 ? (a.idle || 0) + dt : 0;
      if (a.idle > 2.4) return true;
    }
    if (sub === 'base' && !this.baseShot) return true;
    if (sub === 'formation') {
      const f = this.flock, list = this.flockPlanes();
      // the formation has broken up (attacking, landing, shot down) or gone into the cloud of a high altitude
      if (list.length < 2 || !list.some((p) => FLY.has(p.phase))) return true;
      // a mountain between the camera and the formation
      const T = w.terrain, p0 = list[0];
      if (T && T.blocks(cam.x, cam.y, cam.z, p0.x, p0.y, p0.z)) D.bad += dt; else D.bad = Math.max(0, D.bad - dt * 2);
      if (D.bad > 0.7) return true;
    }
    if (sub === 'dogfight') {
      const f = this.flock;
      if (!f) return true;
      const H = f.hunter, Q = f.prey, w = this.game.world;
      if (!w.planes.includes(H) || !w.planes.includes(Q) || H.gone || Q.gone || Q.hidden) return true;
      // the prey shot down: stay on it as it falls, then go; the hunter gone after another, or the two apart: the fight is over
      if (Q.dying) { f.down += dt; if (f.down > 3.5) return true; }
      else if (H.dying || H.prey !== Q || Math.hypot(Q.x - H.x, Q.y - H.y, Q.z - H.z) > 800) { f.broken += dt; if (f.broken > 1.5) return true; }
      else f.broken = 0;
    }
    if (sub === 'attack') {
      const f = this.flock;
      if (!f || !f.ship || f.ship.state === 'sunk' || (f.lost || 0) > 3.5) return true;
    }
    // an island between the camera and what is to be seen
    const subj = sub === 'versus' || sub === 'reverse' ? (this.versus && this.versus.reverse ? this.versus.ship.cmd.main.target : this.versus && this.versus.ship) : t0;
    if ((shipShot && sub !== 'tactical' && sub !== 'wide') || sub === 'versus' || sub === 'reverse') {
      if (subj && subj.model && D.hidden(cam, subj)) D.bad += dt; else D.bad = Math.max(0, D.bad - dt * 2);
      if (D.bad > 0.7) return true;
    }
    return false;
  }

  /** Choose the next shot (not an aircraft shot, those are handled by updateAuto). */
  newShot(now) {
    const a = this.auto, w = this.game.world, D = this.director;
    // a battery that is firing, or the ruins of a base that has been bombed: cut to it (now and then)
    if (w.state === 'running' && w.bases.length && Math.random() < 0.1) {
      const shot = this.pickBaseShot();
      if (shot) { this.baseShot = shot; a.sub = 'base'; a.t = D.length('base'); a.held = 0; this.fovWant = (shot.fov || 50) * D2R; this.smooth.init = false; D.started('base', null, now); return; }
    }
    // the most interesting ship
    let best = null, bs = -1e9;
    for (const s of w.ships) {
      if (!s.alive && !(s.state === 'sinking' && s.sinkT < 12)) continue;
      const sc = D.interest(s, now, this.target);
      if (sc > bs) { bs = sc; best = s; }
    }
    if (best) this.setTarget(best);
    const subject = this.target;
    const ctx = D.weights(subject, now);
    const kind = D.pickKind(ctx.weights);
    this.fovWant = FOV_DEFAULT;
    this.smooth.init = false;
    this.shell.shell = null; this.shell.hold = 0;
    const tg = ctx.target;
    // the camera goes on the side opposite the enemy, so that the enemy is seen beyond the ship
    const brg = tg && tg.alive ? Math.atan2(tg.x - subject.x, -(tg.z - subject.z)) : null;
    const side = Math.random() < 0.5 ? -1 : 1;
    switch (kind) {
      case 'follow': {
        this.follow.pitch = Math.random() * 0.15; this.follow.zoom = 0.7 + Math.random() * 0.9;
        this.follow.yaw = brg == null ? (Math.random() - 0.5) * 1.4 : clamp(wrapPi(brg + Math.PI - (this.follow.headingS + Math.PI)) * 0.5 + side * 0.5, -1.6, 1.6);
        break;
      }
      case 'orbit': {
        this.orbit.az = brg == null ? Math.random() * TAU : brg + Math.PI + side * (0.5 + Math.random() * 0.6);
        this.orbit.el = 0.08 + Math.random() * 0.3; this.orbit.zoom = 0.7 + Math.random();
        break;
      }
      case 'tactical': {
        this.tactical.x = subject.x; this.tactical.z = subject.z; this.tactical.alt = 1800 + Math.random() * 1500;
        break;
      }
      case 'versus': this.versus = { ship: subject, reverse: false, side, k: Math.random() }; this.fovWant = (46 + Math.random() * 10) * D2R; break;
      case 'reverse': this.versus = { ship: subject, reverse: true, side, k: Math.random() }; this.fovWant = (34 + Math.random() * 10) * D2R; break;
      case 'wide': this.wide = { az: Math.random() * TAU, k: 0.85 + Math.random() * 0.3 }; this.fovWant = 46 * D2R; break;
      default: break;
    }
    a.sub = kind; a.t = D.length(kind); a.held = 0; a.idle = 0;
    D.started(kind, subject, now);
  }

  /** Automatic director: the shots follow the action (see ui/director.js). */
  updateAuto(dt) {
    const a = this.auto, w = this.game.world, D = this.director, now = w.time;
    a.t -= dt; a.held = (a.held || 0) + dt;
    if (a.sub === 'plane' && !this.planeAlive(this.plane) && this.planeCam.hold <= 0) a.t = 0;
    // a big moment (a magazine, a ship breaking in two, a base put out of action): cut to it at once
    const big = a.sub === 'plane' && this.planeCam.hold > 0 ? null : D.interrupt(now, a.held);
    if (big) { this.react(big, now); return a.sub; }
    // an aircraft is attacking (dive, torpedo run) or has been shot down: cut to it
    // several aircraft going for one ship together: cut to it (once per attack), even in the middle of a shot that has run long enough
    if (w.state === 'running' && a.sub !== 'attack' && (a.t <= 0 || (a.held > 4 && a.sub !== 'plane'))) {
      const att = attacks(w).filter((g) => now - (D.seenAttack.get(g.ship) ?? -99) > 25);
      if (att.length && (a.t <= 0 ? Math.random() < 0.75 : att[0].planes.length >= 3 && Math.random() < dt * 2)) { this.startAttack(att[0], now); return a.sub; }
    }
    // two aircraft fighting: at the end of a shot now and then, or in the middle of a ship shot when one is firing at the other close up
    if (w.state === 'running' && a.sub !== 'dogfight' && now - D.lastDogfight > 20 && (a.t <= 0 || (a.held > 4 && !['plane', 'attack', 'formation'].includes(a.sub)))) {
      const df = dogfights(w);
      if (df.length && (a.t <= 0 ? Math.random() < 0.4 : df[0].hunter.firing && df[0].d < 450 && Math.random() < dt * 0.8)) { this.startDogfight(df[0], now); return a.sub; }
    }
    // a formation on its way: now and then, never twice running
    if (a.t <= 0 && a.sub !== 'formation' && now - D.lastFormation > 30 && Math.random() < 0.3) {
      const fm = formations(w);
      if (fm.length) { this.startFormation(fm[0], now); return a.sub; }
    }
    let planeShot = null;
    if (a.t <= 0) {
      const forced = a.forcePlane && this.planeAlive(a.forcePlane) ? a.forcePlane : null;
      a.forcePlane = null;
      const hot = this.planeCandidates().filter((c) => c.sc > 4.2);
      if (forced) planeShot = forced;
      else if (hot.length && Math.random() < 0.5) planeShot = hot[0].p;
    }
    if (planeShot) {
      this.setPlane(planeShot);
      // (a take-off or a landing is seen from outside, not from the ship the aircraft will attack, which is tens of kilometres away)
      const views = a.deckShot ? ['chase', 'side', 'chase'] : ['chase', 'side', 'victim', 'chase'];
      a.deckShot = false;
      this.planeCam.view = views[Math.floor(Math.random() * views.length)];
      this.planeCam.yaw = (Math.random() - 0.5) * 0.5; this.planeCam.pitch = Math.random() * 0.1; this.planeCam.zoom = 0.8 + Math.random() * 0.6;
      this.planeCam.hold = 0; this.planeCam.crash = null; this.planeCam.fix = null;
      a.sub = 'plane'; a.t = 6 + Math.random() * 5; a.held = 0;
      this.smooth.init = false;
      D.started('plane', null, now);
      return a.sub;
    }
    // a shot that has gone bad is dropped once it has been seen for a moment
    if (a.t > 0 && a.held > 1.2 && this.shotBad(dt, a.sub)) a.t = 0;
    if (a.t <= 0) this.newShot(now);
    if (a.sub === 'tactical') { this.tactical.x += ((this.target?.x ?? this.tactical.x) - this.tactical.x) * Math.min(1, dt * 0.6); this.tactical.z += ((this.target?.z ?? this.tactical.z) - this.tactical.z) * Math.min(1, dt * 0.6); }
    return a.sub;
  }
}
