// Game orchestrator: ties the simulation world to the ocean engine (hooks), the ship / particle
// renderers, the camera rig and the UI.
import { World, TEAM_COLORS } from './sim/world.js';
import { spawnFleet, teamStart } from './sim/formation.js';
import { getModel } from './model/cache.js';
import { ShipRenderer } from './render/shipRenderer.js';
import { ShipVisuals } from './render/shipVisual.js';
import { IslandVisuals } from './render/islandVisual.js';
import { BaseVisuals } from './render/baseVisual.js';
import { VegetationVisuals } from './render/vegetationVisual.js';
import { Terrain } from './sim/terrain.js';
import { BY_ID } from './data/ships.js';
import { PlaneVisuals } from './render/aircraftVisual.js';
import { isMobile } from './device.js';
import { Particles, K, DEFAULT_MAX } from './render/particles.js';
import { Effects } from './render/effects.js';
import { CameraRig } from './ui/cameras.js';
import { lightMatrix } from './render/shadows.js';
import { GameAudio } from './audio.js';
import { mat4Ship, D2R, clamp, makeRng } from './math.js';

const QUALITY_MODES = ['auto', 'high', 'medium', 'low'];
// presets walked by the adaptive quality controller: render scale, effects density, shadows
const QUALITY_LADDER = [
  { scale: 1.0, fx: 1.0, shadows: true },
  { scale: 0.88, fx: 0.85, shadows: true },
  { scale: 0.76, fx: 0.7, shadows: true },
  { scale: 0.64, fx: 0.55, shadows: false },
  { scale: 0.52, fx: 0.4, shadows: false },
];

const SM = new Float32Array(16), HM = new Float32Array(16), GM = new Float32Array(16);
const S64 = new Float64Array(16), H64 = new Float64Array(16), G64 = new Float64Array(16);

export class Game {
  constructor(engine, canvas, opts = {}) {
    this.engine = engine; this.canvas = canvas;
    this.world = new World(opts.seed || 1);
    this.state = 'setup';            // setup | ready | running | finished
    this.paused = false;
    this.timeScale = 1;
    this.config = { teams: [], sep: 12000, seed: opts.seed || 1, islands: opts.islands ?? 1, bases: opts.bases ?? 1 };      // islands: 0 none, 1 a few, 2 an archipelago; bases: 0 none, 1 an airfield and a battery for each team, 2 fortified
    this.renderModels = new Map();
    this.ui = null;
    this.shakeT = 0;
    this._wp = [0, 0];
    this.lightVP = new Float32Array(16);
    this.shadowsOn = new URLSearchParams(location.search).get('shadows') !== '0';
    this.shadowActive = false;
    this.shadowFocus = null; this.shadowR = 0;
    // quality: 'auto' walks a ladder of presets (render scale, effects density, shadows) down when the GPU cannot keep up and
    // back up when it has room to spare; the fixed presets pin one rung. Never in headless tests / when forced by the URL.
    const qs = new URLSearchParams(location.search);
    this.canAuto = !engine.offscreen && !qs.has('scale');
    let saved = null;
    try { saved = localStorage.getItem('naval.quality'); } catch (e) { /* storage blocked */ }
    this.qualityMode = QUALITY_MODES.includes(qs.get('quality') || saved) ? (qs.get('quality') || saved) : 'auto';
    // a phone starts at the medium rung and lets the adaptive quality go up or down from there
    this.qLevel = this.qualityMode === 'auto' ? (isMobile() ? 2 : 0) : { high: 0, medium: 2, low: 4 }[this.qualityMode];
    this.fxScale = 1;
    this.userShadows = this.shadowsOn;
    this.slowT = 0; this.fastT = 0;
    let pmax = 0;
    try { pmax = Number(localStorage.getItem('naval.particles')) || 0; } catch (e) { /* storage blocked */ }
    this.particleMax = Number(qs.get('particles')) || pmax || (isMobile() ? 20000 : DEFAULT_MAX);
    this.applyQuality();
  }

  /** Capacity of the particle pool (a setting; saved for the next visit). */
  setParticleMax(n) {
    this.particleMax = n;
    try { localStorage.setItem('naval.particles', String(n)); } catch (e) { /* storage blocked */ }
    this.particles?.setMax(n);
  }

  get autoScale() { return this.canAuto && this.qualityMode === 'auto'; }

  /** Select 'auto' | 'high' | 'medium' | 'low'. */
  setQuality(mode) {
    this.qualityMode = mode;
    this.qLevel = mode === 'auto' ? Math.min(this.qLevel, 2) : { high: 0, medium: 2, low: 4 }[mode];
    this.slowT = this.fastT = 0;
    try { localStorage.setItem('naval.quality', mode); } catch (e) { /* storage blocked */ }
    this.applyQuality();
  }

  applyQuality() {
    const q = QUALITY_LADDER[this.qLevel];
    this.fxScale = q.fx;
    if (this.canAuto) this.engine.setRenderScale(q.scale);
    this.shadowsOn = this.userShadows && q.shadows;
    this.ui?.onRenderScale?.(this.engine.getRenderScale());
    this.vegetation?.setQuality(this.qLevel);
  }

  async init() {
    const e = this.engine;
    this.shipRenderer = new ShipRenderer(e);
    this.particles = new Particles(e);
    this.particles.setMax(this.particleMax);
    await Promise.all([this.shipRenderer.ready, this.particles.ready]);
    this.effects = new Effects(e, this.particles, this);
    this.camera = new CameraRig(e, this.canvas, this);
    this.audio = new GameAudio(this);
    this.shipVisuals = new ShipVisuals(this.shipRenderer);
    this.planeVisuals = new PlaneVisuals(this.shipRenderer);
    this.shipVisuals.planes = this.planeVisuals;
    this.islandVisuals = new IslandVisuals(this.shipRenderer, e);
    this.baseVisuals = new BaseVisuals(this.shipRenderer, e);
    this.vegetation = new VegetationVisuals(this.shipRenderer, e);
    this.vegetation.enabled = new URLSearchParams(location.search).get('trees') !== '0';
    this.vegetation.setQuality(this.qLevel);

    e.hooks.update = (dt, now) => this.update(dt, now);
    e.hooks.prepare = () => this.prepare();
    e.hooks.preMain = (enc) => { if (this.shadowActive) this.shipRenderer.drawShadow(enc); };
    e.hooks.drawOpaque = (rp) => this.shipRenderer.draw(rp);
    e.hooks.drawOverlay = (rp) => this.particles.draw(rp);
    e.hooks.onWater = (tag, n) => this.onWater(tag, n);
  }

  // ---- setup / lifecycle -------------------------------------------------------------------------------------
  /** Build (or rebuild) the fleets from `config.teams` and put them on the water. */
  spawn(keepCamera = false) {
    const w = this.world;
    w.clear();
    this.particles.n = 0;
    w.rng = makeRng(this.config.seed);
    const teams = this.config.teams.filter((t) => t.entries.some((x) => x.count > 0));
    teams.forEach((t, i) => {
      w.addTeam(i, t.name, t.rgb);
      const s = teamStart(i, teams.length, this.config.sep);
      spawnFleet(w, i, t.entries.filter((x) => x.count > 0), s.x, s.z, s.heading);
    });
    // the islands of this battle: the same seed gives the same sea; the fleets and the axis between them are kept clear
    {
      const starts = teams.map((_, i) => teamStart(i, teams.length, this.config.sep));
      const keep = starts.map((q) => ({ x: q.x, z: q.z, r: 4800 }));
      const axis = starts.length >= 2 ? [starts[0].x, starts[0].z, starts[1].x, starts[1].z] : null;
      const nation = (t) => { const c = {}; for (const e of t.entries) { const n = BY_ID[e.id]?.nation; if (n) c[n] = (c[n] || 0) + (e.count || 1); } return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'USA'; };
      w.terrain = Terrain.generate(this.config.seed, this.config.islands, keep, axis, clamp(this.config.sep * 0.9 + 5000, 9000, 21000), { bases: this.config.bases, starts: starts.map((q, i) => ({ x: q.x, z: q.z, nation: nation(teams[i]) })) });
      this.islandVisuals.set(w.terrain);
      this.baseVisuals.set(w.terrain);
      this.vegetation.set(w.terrain);
    }
    this.state = 'ready';
    this.paused = false;
    // show the first fleet from a pleasant angle (unless the player is just editing the fleets)
    if (!keepCamera || !this.camera.target || !w.ships.includes(this.camera.target)) {
      if (!keepCamera) { this.camera.userChoice = false; this.camera.setMode('orbit'); }
      // the first team's flagship (largest ship) is the centre of attention
      const flag = w.ships.filter((s) => s.team === 0).sort((a, b) => b.stats.L - a.stats.L)[0] || w.ships[0];
      if (flag) this.camera.setTarget(flag);
    }
    this.ui?.onSpawn?.();
  }

  start() {
    if (this.state !== 'ready') return;
    for (const s of this.world.ships) s.cmd.throttle = 0.7;
    this.world.start();
    this.state = 'running';
    // unless the player picked a camera, let the automatic director follow the action
    if (!this.camera.userChoice) this.camera.setMode('auto');
    this.ui?.onStart?.();
  }

  reset() {
    this.world.clear();
    this.islandVisuals.set(null);
    this.baseVisuals.set(null);
    this.vegetation.set(null);
    this.particles.n = 0;
    this.camera.target = null;
    this.camera.setMode('free');
    this.state = 'setup';
    this.ui?.onReset?.();
  }

  setTimeScale(s) { this.timeScale = s; this.ui?.onTimeScale?.(s); }
  togglePause() { this.paused = !this.paused; this.ui?.onPause?.(this.paused); }

  /** Advance the battle by `sec` simulated seconds without rendering (also runs the effects). Dev / test helper. */
  fastForward(sec, step = 0.1) {
    const w = this.world;
    for (let t = 0; t < sec; t += step) {
      w.update(step);
      const ev = w.drainEvents();
      this.effects.emitScale = 0.5;
      this.effects.process(ev);
      this.effects.update(step, w);
      this.particles.update(step);
      this.ui?.onEvents?.(ev);
      if (w.state === 'finished') break;
    }
  }

  battleRadius() {
    let r = 1000;
    const ships = this.world.ships;
    for (const a of ships) for (const b of ships) r = Math.max(r, Math.hypot(a.x - b.x, a.z - b.z) / 2);
    return r;
  }

  // ---- per frame ----------------------------------------------------------------------------------------------
  update(dtReal, now) {
    const w = this.world;
    const dt = Math.min(dtReal, 0.1);
    let gdt = this.paused || this.state === 'setup' ? 0 : dt * this.timeScale;
    if (this.state === 'ready') gdt = 0;
    if (gdt > 0) w.update(gdt);
    else if (w.state === 'setup') w.update(dt);        // ships settle on the waves while the teams are being prepared
    if (w.state === 'finished' && this.state === 'running') { this.state = 'finished'; this.ui?.onFinished?.(); }

    const ev = w.drainEvents();
    this.effects.emitScale = this.fxScale / Math.max(1, this.timeScale * 0.55);
    this.effects.process(ev);
    this.ui?.onEvents?.(ev);
    this.camera.onEvents(ev);
    this.audio.onEvents(ev);
    this.effects.update(gdt, w);
    this.particles.update(gdt);
    this.audio.update(dt);

    // water probes: 8 points per ship (a few frames of latency, the ship hull filters them)
    const water = this.engine.water;
    const list = [];
    let k = 0;
    for (const s of w.ships) {
      if (s.state === 'sunk') continue;
      for (let i = 0; i < s.model.floatPts.length; i++) {
        s.floatPtWorld(i, this._wp);
        water.setPoint(k++, this._wp[0], this._wp[1]);
      }
      list.push(s);
    }
    water.count = k;
    water.tag = list;

    // adaptive quality
    if (this.autoScale) {
      const fps = this.engine.stats.fps;
      if (fps > 0 && fps < 26) { this.slowT += dt; this.fastT = 0; } else { this.slowT = Math.max(0, this.slowT - dt * 0.5); this.fastT = fps > 56 ? this.fastT + dt : 0; }
      if (this.slowT > 3.5 && this.qLevel < QUALITY_LADDER.length - 1) { this.slowT = 0; this.qLevel++; this.applyQuality(); }
      else if (this.fastT > 12 && this.qLevel > 0) { this.fastT = 0; this.qLevel--; this.applyQuality(); }
    }
    this.camera.update(dt);
    // camera shake from explosions
    const cam = this.engine.cam;
    const sh = this.effects.shake;
    if (sh > 0.002) {
      cam.yaw += (Math.random() - 0.5) * 0.004 * sh; cam.pitch += (Math.random() - 0.5) * 0.004 * sh;
      this.effects.shake *= Math.exp(-dt * 4);
    }
    this.ui?.update?.(dt, now);
  }

  onWater(list, n) {
    if (!list) return;
    const h = this.engine.water.heights;
    let k = 0;
    for (const s of list) {
      const m = s.model.floatPts.length;
      if (k + m > n) break;
      s.setWaterHeights(h.subarray(k, k + m));
      k += m;
    }
  }

  prepare() {
    const r = this.shipRenderer, cam = this.engine.cam, w = this.world;
    r.begin();
    this.particles.beginFrame();
    this.islandVisuals.add(cam);
    this.baseVisuals.add(cam, w.bases, { teams: w.teams, shadow: { active: this.shadowActive, focus: this.shadowFocus, R: this.shadowR } });
    this.vegetation.add(cam);
    for (const s of w.ships) {
      if (s.state === 'sunk') continue;
      const team = w.teams[s.team];
      const tint = team ? team.rgb : [255, 255, 255];
      const dmg = clamp((1 - s.hpFrac - 0.1) * 1.25, 0, 1);
      const fire = s.fireLevel || 0;
      const rnd = (s.id * 0.6180339) % 1;
      const rx = s.x - cam.x, ry = s.y - cam.y, rz = s.z - cam.z;
      const dist = Math.hypot(rx, ry, rz);
      // culling and level of detail: off-screen ships are skipped (unless they cast a shadow onto the focus ship),
      // distant ones lose their small guns, close ones get the fine detail (lifelines, boats, rigging)
      const sf = this.shadowFocus;
      const casts = !!sf && this.shadowActive && Math.hypot(s.x - sf.x, s.z - sf.z) < this.shadowR + s.stats.L;
      if (!casts && !this.engine.sphereVisible(rx, ry, rz, s.model.radius * 1.05)) continue;
      s.casts = casts;
      s.near = dist < 250 + s.stats.L * 0.9;
      s.aaNear = dist < 900 + s.stats.L;
      s.lod = dist > 7000 ? 2 : dist > 2400 ? 1 : 0;
      mat4Ship(S64, rx, ry, rz, s.heading, s.pitch, s.roll);
      this.shipVisuals.addShip(s, S64, tint, dmg, fire, rnd);
    }
    // aircraft, ordnance in flight and wreckage
    const pv = this.planeVisuals;
    for (const p of w.planes) {
      const team = w.teams[p.team];
      const tint = team ? team.rgb : [255, 255, 255];
      if (p.hidden || (p.phase === 'queue' && !(p.owner && p.owner.alive))) continue;
      const cockpit = this.camera.mode === 'cockpit' && this.camera.plane === p;
      p.inCockpit = cockpit;
      pv.addPlane(p, cam, tint, (p.id * 0.37) % 1, p.dying ? 0.85 : p.smoke > 0 ? 0.35 : 0, cockpit ? -1 : p.fire > 0.5 ? 0.6 : 0);
    }
    for (const b of w.bombs) {
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      pv.addOrdnance(b.mesh, b.x, b.y, b.z, Math.atan2(b.vx, -b.vz), Math.asin(b.vy / sp), cam);
    }
    for (const t of w.torpedoes) {
      if (t.air && t.h > 0.2) pv.addOrdnance('torpedo', t.x, t.h, t.z, t.fallDir, Math.atan2(t.hv, t.fallSpeed || 1), cam);
    }
    // the body of every shell within a few hundred metres of the camera (3.8 calibres long)
    for (const s of w.shells) {
      const sp = Math.hypot(s.vx, s.vy, s.vz);
      if (sp < 1 || Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z) > 700) continue;
      pv.addShell(s.type, s.x, s.y, s.z, s.vx / sp, s.vy / sp, s.vz / sp, s.gun.cal * 0.0038, cam);
    }
    for (const d of w.debris) {
      if (d.kind === 'plane') { const team = w.teams[0]; pv.addPiece(d, cam, [120, 120, 120], 0.5); continue; }
      this.shipVisuals.addDebris(d, cam, [130, 130, 130]);
    }
    r.upload();
    this.updateShadow();
    // shells in flight: the body of the shell itself when the camera is near (a few hundred metres), a glowing tracer streak along the path at any
    // distance (red-orange for armour-piercing, yellow-white for high explosive) and a thin trail of hot vapour that hangs behind it
    const running = w.state === 'running' && !this.paused;
    for (const s of w.shells) {
      const sp = Math.hypot(s.vx, s.vy, s.vz);
      if (sp < 1) continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d > 30000) continue;
      const cal = s.gun.cal, ap = s.type === 'AP';
      const ux = s.vx / sp, uy = s.vy / sp, uz = s.vz / sp;
      const d3 = Math.hypot(d, s.y - cam.y);
      // streaks shrink when the shell is close to the lens (a 60 m white bar a few metres from the camera looks absurd)
      const near = clamp(d / 400, 0.18, 1);
      const len = Math.min((cal >= 300 ? 60 : cal >= 150 ? 40 : 18) * near, 0.6 + d * 0.06);
      const wid = (cal >= 300 ? 1.1 : cal >= 150 ? 0.8 : 0.5) * (1 + d / 5000) * clamp(d / 250, 0.3, 1);
      // a shell passing a few metres from the lens is a smear across the screen: fade it out
      const f = clamp((d3 - 10) / 35, 0, 1);
      if (f <= 0) continue;
      const k = 6 * clamp(d / 150, 0.35, 1) * f * f * (3 - 2 * f);
      const fresh = clamp(1 - s.age / 0.5, 0, 1);                 // the first half second: the hot gases still round the shell
      if (ap) this.particles.streak(s.x, s.y, s.z, ux, uy, uz, len * (1 + d / 8000), wid, 1, 0.42, 0.18, k * (1 + fresh));
      else this.particles.streak(s.x, s.y, s.z, ux, uy, uz, len * (1 + d / 8000) * 0.8, wid * 1.15, 1, 0.84, 0.46, k * (1 + fresh));
      // a bright head
      this.particles.streak(s.x, s.y, s.z, ux, uy, uz, len * 0.18, wid * 1.5, 1, 0.95, 0.8, k * 0.9);
      // vapour trail: one puff every few tens of metres of flight (not one per simulated step: hundreds of shells in the air would fill the particle pool and starve the muzzle flashes)
      if (running && s._trailT !== w.time && d < 4500 && s.age > 0.04) {
        const cs = clamp(cal / 300, 0.3, 1.5), tr = this.effects.emitScale ?? 1;
        const gap = 22 + 40 * (1 - cs / 1.5);
        s._trailD = (s._trailD ?? gap) + sp * Math.max(0, w.time - (s._trailT ?? w.time - 1 / 60));
        s._trailT = w.time;
        if (s._trailD >= gap) {
          s._trailD = 0;
          if (Math.random() < tr) this.particles.add({ kind: K.SMOKE, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0.3, vz: 0, s0: 0.5 * cs, s1: (ap ? 3 : 4.2) * cs, life: 1.4, r: 0.9, g: 0.9, b: 0.92, a0: ap ? 0.09 : 0.14, a1: 0, drag: 0.6, wind: 0.5 });
        }
      }
    }
    this.particles.upload();
  }

  /** Position the sun shadow map around the ship the camera is looking at (or the nearest one). */
  updateShadow() {
    const e = this.engine, cam = e.cam, w = this.world, P = e.P;
    const se = P.sunElev * D2R, sa = P.sunAzim * D2R;
    const sun = [Math.sin(sa) * Math.cos(se), Math.sin(se), -Math.cos(sa) * Math.cos(se)];
    const off = () => { if (this.shadowActive) e.shadow.setLight(this.lightVP, 0, false); this.shadowActive = false; };
    if (!this.shadowsOn || sun[1] < 0.015) return off();
    let focus = this.camera.target && this.camera.target.state !== 'sunk' ? this.camera.target : null;
    const dist = (s) => Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
    if (!focus || dist(focus) > 2500) {
      focus = null;
      let bd = 2500;
      for (const s of w.ships) if (s.state !== 'sunk' && dist(s) < bd) { bd = dist(s); focus = s; }
    }
    // no ship near: the shadows fall on the base the camera is over
    if (!focus) { const bf = this.baseVisuals.focusNear(cam, 2500); if (bf) focus = { x: bf.x, y: bf.y, z: bf.z, stats: { L: bf.L }, model: { topY: 14 }, state: 'base' }; }
    if (!focus) return off();
    const d = dist(focus);
    const R = clamp(d * 0.8 + focus.stats.L * 0.55, 170, 800);
    const info = lightMatrix(this.lightVP, sun, focus.x - cam.x, focus.y + focus.model.topY * 0.25 - cam.y, focus.z - cam.z, R, e.shadow.size);
    e.shadow.setLight(this.lightVP, 0.9 / info.depthRange, true);
    this.shadowActive = true;
    this.shadowFocus = focus; this.shadowR = R;
  }

  /** Click on the canvas (no drag): select the ship under the cursor. */
  onCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = null, bd = 28;
    const out = [0, 0, 0];
    for (const s of this.world.ships) {
      if (s.state === 'sunk') continue;
      if (!this.engine.project(s.x, s.y + s.model.topY * 0.3, s.z, out)) continue;
      const d = Math.hypot(out[0] - x, out[1] - y);
      const R = clamp(s.stats.L * 0.5 / out[2] * this.canvas.clientHeight / (2 * Math.tan(this.engine.cam.fovY / 2)), 10, 60);
      if (d < Math.max(bd, R) && d < bd + R) { bd = d; best = s; }
    }
    if (best) { this.camera.setTarget(best); if (['free', 'tactical', 'auto'].includes(this.camera.mode)) { /* keep the mode, only select */ } }
  }
}
