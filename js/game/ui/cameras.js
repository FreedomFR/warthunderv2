// Camera rig: free-fly, chase, orbit, tactical (top-down), bridge, shell-cam and an automatic
// "director" that cuts between the action. It only writes engine.cam each frame.
import { clamp, wrapPi, lerp, D2R, TAU } from '../math.js';

export const CAMERA_MODES = [
  { id: 'auto', key: '1', name: 'Auto', hint: 'Réalisateur automatique : suit l\'action' },
  { id: 'follow', key: '2', name: 'Poursuite', hint: 'Derrière le navire (glisser = orbite, molette = zoom)' },
  { id: 'orbit', key: '3', name: 'Orbite', hint: 'Tourne lentement autour du navire' },
  { id: 'bridge', key: '4', name: 'Passerelle', hint: 'Vue depuis la passerelle' },
  { id: 'shell', key: '5', name: 'Obus', hint: 'Suit les obus tirés' },
  { id: 'tactical', key: '6', name: 'Tactique', hint: 'Vue de dessus (glisser = déplacer, molette = altitude)' },
  { id: 'free', key: '7', name: 'Libre', hint: 'ZQSD / WASD, Espace/Ctrl, Maj = rapide, glisser = regarder' },
  { id: 'plane', key: '8', name: 'Avions', hint: 'Suit un avion (N / B : avion suivant, V : changer de vue)' },
  { id: 'cockpit', key: '9', name: 'Cockpit', hint: 'Vue du pilote (glisser = regarder autour)' },
];

/** Aircraft phases worth watching. */
const ATTACK = new Set(['rollin', 'dive', 'pullout', 'run', 'break']);
export const PLANE_VIEWS = [
  { id: 'chase', name: 'poursuite' }, { id: 'side', name: 'passage' }, { id: 'victim', name: 'depuis le navire visé' },
];

const FOV_DEFAULT = 58 * D2R;

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
    this.auto = { t: 0, sub: 'follow', hold: 0 };
    this.plane = null;               // followed aircraft
    this.planeCam = { yaw: 0, pitch: 0, zoom: 1, view: 'chase', t: 0, fix: null, hold: 0, crash: null, look: { yaw: 0, pitch: 0 } };
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
    this.fovWant = id === 'cockpit' ? 75 * D2R : (id === 'bridge' ? (this.bridgeFov ?? FOV_DEFAULT) : FOV_DEFAULT);
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
      const m = CAMERA_MODES.find((x) => 'Digit' + x.key === e.code || 'Numpad' + x.key === e.code);
      if (m) this.setMode(m.id, true);
      const planeMode = this.mode === 'plane' || this.mode === 'cockpit';
      if (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'BracketRight') { if (planeMode) this.pickPlane(e.shiftKey ? -1 : 1); else this.pickTarget(e.shiftKey ? -1 : 1); e.preventDefault(); }
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
    let px, py, pz, yaw, pitch;
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
    const hard = mode === 'free' || mode === 'tactical';
    if (!sm.init || hard) { sm.x = px; sm.y = py; sm.z = pz; sm.yaw = yaw; sm.pitch = pitch; sm.init = true; }
    else {
      const k = 1 - Math.exp(-dt * (mode === 'shell' ? 14 : mode === 'cockpit' ? 40 : mode === 'plane' ? 12 : 9));
      sm.x += (px - sm.x) * k; sm.y += (py - sm.y) * k; sm.z += (pz - sm.z) * k;
      sm.yaw += wrapPi(yaw - sm.yaw) * k; sm.pitch += (pitch - sm.pitch) * k;
    }
    cam.x = sm.x; cam.y = sm.y; cam.z = sm.z; cam.yaw = sm.yaw; cam.pitch = sm.pitch;
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
      const b = ship.model.bridge || { x: L * 0.2, y: ship.model.topY * 0.6 };
      const p = [0, 0, 0];
      ship.toWorld(b.x + 5, b.y + 1.0, 0, p);
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
    if (!sc.shell || !w.shells.includes(sc.shell)) {
      if (sc.shell) { sc.hold = 2.4; sc.lastImpact = { x: sc.x, y: Math.max(sc.y, 2), z: sc.z, dx: sc.dx, dz: sc.dz }; sc.shell = null; }
      let found = null;
      for (let i = w.shells.length - 1; i >= 0; i--) if (w.shells[i].owner === ship && w.shells[i].group === 'main') { found = w.shells[i]; break; }
      if (!found && sc.hold <= 0) for (let i = w.shells.length - 1; i >= 0; i--) if (w.shells[i].gun.cal >= 150) { found = w.shells[i]; break; }
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
  planeAlive(p) { return this.game.world.planes.includes(p) && !(p.phase === 'queue' && p.t < -1 && !(p.owner && p.owner.alive)); }

  /** Aircraft worth watching, best first. */
  planeCandidates() {
    const w = this.game.world, cam = this.engine.cam;
    const out = [];
    for (const p of w.planes) {
      if (p.phase === 'queue') continue;
      let sc = Math.random() * 1.2;
      if (ATTACK.has(p.phase)) sc += 5;
      if (p.dying) sc += 6;
      if (p.phase === 'final' || p.phase === 'takeoff') sc += 1.5;
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
    const list = w.planes.filter((p) => p.phase !== 'queue').sort((a, b) => a.id - b.id);
    if (!list.length) { this.plane = null; return; }
    // best candidate when nothing is followed, otherwise the neighbour in the list
    let i = list.indexOf(this.plane);
    if (i < 0) { const c = this.planeCandidates(); this.setPlane(c.length ? c[0].p : list[0]); return; }
    i = (i + dir + list.length) % list.length;
    this.setPlane(list[i]);
  }
  setPlane(p) { this.plane = p; this.planeCam.fix = null; this.planeCam.t = 0; this.smooth.init = false; this.game.ui?.onPlane?.(p); }
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
    for (const e of events) {
      if (this.mode === 'auto' && (e.type === 'bombDrop' || e.type === 'torpedoDrop' || e.type === 'planeDown') && Math.random() < 0.45 && this.auto.sub !== 'plane') { this.auto.forcePlane = e.plane; this.auto.t = 0; }
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
    const fx = sh * cp, fy = sp, fz = -ch * cp;                      // flight direction
    if (mode === 'cockpit') {
      const yaw = p.heading + pc.look.yaw, pitch = clamp(p.pitch + pc.look.pitch, -1.45, 1.45);
      // the pilot's eye: above the seat, in the canopy
      const cn = p.spec.canopy[0], ry0 = p.spec.fus.r * p.spec.fus.ar;
      const ex = (cn.x0 + (cn.x1 - cn.x0) * 0.55), ey = ry0 * 0.78 + cn.h * 0.85;
      return { x: p.x + fx * ex - Math.sin(p.heading) * 0, y: p.y + ey * Math.cos(p.pitch) + fy * ex, z: p.z + fz * ex, yaw, pitch };
    }
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
      // a fixed camera placed ahead of the aircraft to one side: it sweeps past
      if (!pc.fix || (p.x - pc.fix.x) * fx + (p.z - pc.fix.z) * fz > 25 || pc.fix.age > 12) {
        const side = (p.id & 1) ? 1 : -1, lead = clamp(p.speed * 2.1, 90, 330) * zoom;
        const off = 45 + 40 * Math.random();
        pc.fix = { x: p.x + fx * lead + ch * side * off, y: Math.max(p.y + fy * lead * 0.5 + 5, 6), z: p.z + fz * lead + sh * side * off, age: 0 };
      }
      pc.fix.age += dt;
      this.fovWant = 40 * D2R;
      return this.lookAt(pc.fix.x, pc.fix.y, pc.fix.z, p.x + fx * 3, p.y, p.z + fz * 3);
    }
    // 'victim': from the deck of the ship the aircraft is attacking
    const tgt = p.target && p.target.state !== 'sunk' ? p.target : null;
    if (tgt) {
      const b = tgt.model.bridge || { x: 0, y: tgt.model.topY * 0.6 };
      const q = [0, 0, 0];
      tgt.toWorld(b.x + 3, b.y + 2, 0, q);
      const dist = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
      this.fovWant = clamp(dist * 0.013, 16, 52) * D2R;
      return this.lookAt(q[0], q[1], q[2], p.x, p.y, p.z);
    }
    pc.view = 'chase';
    return null;
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

  /** Automatic director: chooses a ship and a shot every few seconds. */
  updateAuto(dt) {
    const a = this.auto, w = this.game.world;
    a.t -= dt;
    if (a.sub === 'plane' && !this.planeAlive(this.plane) && this.planeCam.hold <= 0) a.t = 0;
    // an aircraft is attacking (dive, torpedo run) or has been shot down: cut to it
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
      this.planeCam.view = ['chase', 'side', 'victim', 'chase'][Math.floor(Math.random() * 4)];
      this.planeCam.yaw = (Math.random() - 0.5) * 0.5; this.planeCam.pitch = Math.random() * 0.1; this.planeCam.zoom = 0.8 + Math.random() * 0.6;
      this.planeCam.hold = 0; this.planeCam.crash = null; this.planeCam.fix = null;
      a.sub = 'plane'; a.t = 6 + Math.random() * 5;
      this.smooth.init = false;
      return a.sub;
    }
    if (a.t <= 0 || !this.target || !this.target.alive) {
      // look for the most interesting ship: recently hit / firing / burning
      let best = null, bs = -1;
      for (const s of w.ships) {
        if (!s.alive && !(s.state === 'sinking' && s.sinkT < 14)) continue;
        let sc = Math.random() * 1.5 + s.stats.score * 0.3;
        if (w.time - s.lastHitT < 8) sc += 5;
        if (s.mounts.some((m) => m.reload > m.gun.reload - 3)) sc += 3;
        if (s.state === 'sinking') sc += 6;
        sc += s.fires.length * 0.4;
        if (s === this.target) sc -= 2.5;
        if (sc > bs) { bs = sc; best = s; }
      }
      if (best) this.setTarget(best);
      const kinds = ['follow', 'follow', 'orbit', 'bridge', 'shell', 'shell', 'tactical'];
      a.sub = kinds[Math.floor(Math.random() * kinds.length)];
      if (w.state !== 'running') a.sub = 'orbit';
      a.t = 8 + Math.random() * 7;
      this.fovWant = FOV_DEFAULT;
      this.follow.yaw = (Math.random() - 0.5) * 1.4; this.follow.pitch = Math.random() * 0.15; this.follow.zoom = 0.7 + Math.random() * 0.9;
      this.orbit.az = Math.random() * TAU; this.orbit.el = 0.08 + Math.random() * 0.3; this.orbit.zoom = 0.7 + Math.random();
      this.smooth.init = false;
      if (a.sub === 'tactical') { const c = this.focusPoint(); this.tactical.x = this.target?.x ?? c.x; this.tactical.z = this.target?.z ?? c.z; this.tactical.alt = 1800 + Math.random() * 1500; }
      this.shell.shell = null; this.shell.hold = 0;
    }
    if (a.sub === 'tactical') { this.tactical.x += ((this.target?.x ?? this.tactical.x) - this.tactical.x) * Math.min(1, dt * 0.6); this.tactical.z += ((this.target?.z ?? this.tactical.z) - this.tactical.z) * Math.min(1, dt * 0.6); }
    return a.sub;
  }
}
