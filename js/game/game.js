// Game orchestrator: ties the simulation world to the ocean engine (hooks), the ship / particle
// renderers, the camera rig and the UI.
import { World, TEAM_COLORS } from './sim/world.js';
import { spawnFleet, teamStart } from './sim/formation.js';
import { getModel } from './model/cache.js';
import { getMountModel } from './model/mounts.js';
import { MeshBuilder, MAT, rgb } from './model/meshbuilder.js';
import * as PT from './model/parts.js';
import { ShipRenderer } from './render/shipRenderer.js';
import { Particles, K } from './render/particles.js';
import { Effects } from './render/effects.js';
import { CameraRig } from './ui/cameras.js';
import { mat4Ship, mountMatrices, D2R, clamp, makeRng } from './math.js';

const SM = new Float32Array(16), HM = new Float32Array(16), GM = new Float32Array(16);
const S64 = new Float64Array(16), H64 = new Float64Array(16), G64 = new Float64Array(16);

export class Game {
  constructor(engine, canvas, opts = {}) {
    this.engine = engine; this.canvas = canvas;
    this.world = new World(opts.seed || 1);
    this.state = 'setup';            // setup | ready | running | finished
    this.paused = false;
    this.timeScale = 1;
    this.config = { teams: [], sep: 12000, seed: opts.seed || 1 };
    this.renderModels = new Map();
    this.ui = null;
    this.shakeT = 0;
    this._wp = [0, 0];
  }

  async init() {
    const e = this.engine;
    this.shipRenderer = new ShipRenderer(e);
    this.particles = new Particles(e);
    await Promise.all([this.shipRenderer.ready, this.particles.ready]);
    this.effects = new Effects(e, this.particles, this);
    this.camera = new CameraRig(e, this.canvas, this);
    // plane mesh shared by every aircraft
    const b = new MeshBuilder();
    PT.aircraft(b, { x: 0, y: 0, z: 0, yaw: 0, kind: 'fighter', col: '#7d868c', scale: 1.5 }, { sup: '#7d868c', dark: '#222' });
    this.planeMesh = this.shipRenderer.createMesh(b.build(), 'plane');

    e.hooks.update = (dt, now) => this.update(dt, now);
    e.hooks.prepare = () => this.prepare();
    e.hooks.drawOpaque = (rp) => this.shipRenderer.draw(rp);
    e.hooks.drawOverlay = (rp) => this.particles.draw(rp);
    e.hooks.onWater = (tag, n) => this.onWater(tag, n);
  }

  // ---- setup / lifecycle -------------------------------------------------------------------------------------
  /** Build (or rebuild) the fleets from `config.teams` and put them on the water. */
  spawn() {
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
    this.state = 'ready';
    this.paused = false;
    this.camera.target = w.ships[0] || null;
    this.ui?.onSpawn?.();
  }

  start() {
    if (this.state !== 'ready') return;
    for (const s of this.world.ships) s.cmd.throttle = 0.7;
    this.world.start();
    this.state = 'running';
    this.ui?.onStart?.();
  }

  reset() {
    this.world.clear();
    this.particles.n = 0;
    this.state = 'setup';
    this.ui?.onReset?.();
  }

  setTimeScale(s) { this.timeScale = s; this.ui?.onTimeScale?.(s); }
  togglePause() { this.paused = !this.paused; this.ui?.onPause?.(this.paused); }

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
    this.effects.emitScale = 1 / Math.max(1, this.timeScale * 0.55);
    this.effects.process(ev);
    this.ui?.onEvents?.(ev);
    this.effects.update(gdt, w);
    this.particles.update(gdt);

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

  renderModel(ship) {
    const model = ship.model;
    let rm = this.renderModels.get(model.id);
    if (rm) return rm;
    const r = this.shipRenderer;
    rm = { hull: r.createMesh(model.mesh, model.id), mounts: new Map() };
    for (const m of model.mounts) {
      const mm = getMountModel({ kind: m.kind, cal: m.cal, n: m.n, bore: m.bore, col: model.pal.sup });
      if (!rm.mounts.has(mm)) rm.mounts.set(mm, { mm, house: r.createMesh(mm.house, model.id + ' house'), guns: r.createMesh(mm.guns, model.id + ' guns') });
    }
    rm.mountOf = model.mounts.map((m) => rm.mounts.get(getMountModel({ kind: m.kind, cal: m.cal, n: m.n, bore: m.bore, col: model.pal.sup })));
    this.renderModels.set(model.id, rm);
    return rm;
  }

  prepare() {
    const r = this.shipRenderer, cam = this.engine.cam, w = this.world;
    r.begin();
    this.particles.beginFrame();
    for (const s of w.ships) {
      if (s.state === 'sunk') continue;
      const rm = this.renderModel(s);
      const team = w.teams[s.team];
      const tint = team ? team.rgb : [255, 255, 255];
      const dmg = clamp((1 - s.hpFrac - 0.1) * 1.25, 0, 1);
      const fire = s.fireLevel || 0;
      const rnd = (s.id * 0.6180339) % 1;
      mat4Ship(S64, s.x - cam.x, s.y - cam.y, s.z - cam.z, s.heading, s.pitch, s.roll);
      for (let i = 0; i < 16; i++) SM[i] = S64[i];
      r.add(rm.hull, SM, tint, dmg, fire, rnd);
      for (let i = 0; i < s.mounts.length; i++) {
        const m = s.mounts[i], mo = rm.mountOf[i], rec = m.rec;
        const alive = m.alive;
        const yaw = rec.arcC + m.trainRel;
        const pitch = alive ? m.elev : -0.12;
        mountMatrices(H64, G64, S64, rec.x, rec.y, rec.z, yaw, pitch, mo.mm.trunnion[0], mo.mm.trunnion[1], alive ? m.recoil * mo.mm.recoil : 0);
        for (let k = 0; k < 16; k++) { HM[k] = H64[k]; GM[k] = G64[k]; }
        r.add(mo.house, HM, tint, dmg, fire, rnd);
        r.add(mo.guns, GM, tint, dmg, fire, rnd);
      }
    }
    // aircraft
    for (const p of w.planes) {
      if (p.t < 0 && !(p.owner && p.owner.alive)) continue;
      mat4Ship(S64, p.x - cam.x, p.y - cam.y, p.z - cam.z, p.heading, p.pitch, p.bank);
      for (let i = 0; i < 16; i++) SM[i] = S64[i];
      r.add(this.planeMesh, SM, [255, 255, 255], 0, 0, 0.5);
    }
    r.upload();
    // shells: bright streaks along their velocity
    for (const s of w.shells) {
      const sp = Math.hypot(s.vx, s.vy, s.vz);
      if (sp < 1) continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d > 30000) continue;
      const cal = s.gun.cal;
      const len = cal >= 300 ? 60 : cal >= 150 ? 40 : 18;
      const wid = (cal >= 300 ? 1.1 : cal >= 150 ? 0.8 : 0.5) * (1 + d / 5000);
      this.particles.streak(s.x, s.y, s.z, s.vx / sp, s.vy / sp, s.vz / sp, len * (1 + d / 8000), wid, 1, 0.68, 0.28, 6);
    }
    this.particles.upload();
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
