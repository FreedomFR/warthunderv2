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
    this.smooth = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, init: false, fov: FOV_DEFAULT };
    this.fovWant = FOV_DEFAULT;
    this.dragging = false;
    this.bindInput();
  }

  setMode(id) {
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
      if (m) this.setMode(m.id);
      if (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'BracketRight') { this.pickTarget(e.shiftKey ? -1 : 1); e.preventDefault(); }
      if (e.code === 'KeyB' || e.code === 'BracketLeft') this.pickTarget(-1);
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
    }
  }
  onWheel(dy) {
    const f = Math.exp(dy * 0.0012);
    switch (this.mode) {
      case 'free': this.free.speed = clamp(this.free.speed / f, 3, 3000); break;
      case 'follow': this.follow.zoom = clamp(this.follow.zoom * f, 0.25, 6); break;
      case 'orbit': this.orbit.zoom = clamp(this.orbit.zoom * f, 0.25, 8); break;
      case 'tactical': this.tactical.alt = clamp(this.tactical.alt * f, 400, 30000); break;
      case 'bridge': this.fovWant = clamp(this.fovWant * f, 18 * D2R, 80 * D2R); break;
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
      const k = 1 - Math.exp(-dt * (mode === 'shell' ? 14 : 9));
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

  /** Automatic director: chooses a ship and a shot every few seconds. */
  updateAuto(dt) {
    const a = this.auto, w = this.game.world;
    a.t -= dt;
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
