// Trailer director: scripted scenes recorded frame by frame with the offline recorder (tools/trailer/record.mjs).
//
// Loaded with ?trailer=1&manual=1. A scene is an async function that builds a battle (fleets, time of day), lets the simulation
// run ("pre-roll": frames that only run the physics and the ocean read-back, nothing is drawn) until something worth filming
// happens, then records shots: for every frame the camera function of the shot places the camera and the engine renders and
// captures exactly 1/FPS s (24 by default). All randomness comes from the seeded world, so a scene can be recorded again identically.
import { clamp, lerp, smoothstep, D2R, KN, makeRng } from './game/math.js';
import { spawnFleet } from './game/sim/formation.js';
import { magazineExplosion } from './game/sim/explosions.js';
import { PRESETS } from './game/scenarios.js';
import { renderMusic, wavBase64 } from './trailerMusic.js';
import { TEAM_COLORS } from './game/sim/world.js';

export const FPS = Number(new URLSearchParams(location.search).get('fps')) || 24;   // ?fps=60 for the 0.1.0 trailer
const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// time-of-day / sea presets for the engine parameters
export const LOOKS = {
  dawn: { sunElev: 4.5, sunAzim: 0, exposure: 1.5, haze: 4.2, clouds: 0.5, veil: 0.4, windSpeed: 5.5, swellHs: 1.3, bloom: 0.16, saturation: 1.1, contrast: 1.08, warmth: -0.12, vignette: 0.16 },
  morning: { sunElev: 17, sunAzim: 18, exposure: 1.3, haze: 3.0, clouds: 0.35, veil: 0.3, windSpeed: 7, swellHs: 1.7, bloom: 0.10, saturation: 1.08, contrast: 1.07, warmth: -0.05, vignette: 0.12 },
  noon: { sunElev: 38, sunAzim: 25, exposure: 1.15, haze: 2.4, clouds: 0.3, veil: 0.25, windSpeed: 8, swellHs: 1.9, bloom: 0.08, saturation: 1.1, contrast: 1.08, warmth: 0.0, vignette: 0.1 },
  afternoon: { sunElev: 13, sunAzim: -25, exposure: 1.35, haze: 3.4, clouds: 0.4, veil: 0.35, windSpeed: 9, swellHs: 2.2, bloom: 0.13, saturation: 1.1, contrast: 1.08, warmth: -0.1, vignette: 0.14 },
  dusk: { sunElev: 3.5, sunAzim: 8, exposure: 1.6, haze: 4.4, clouds: 0.45, veil: 0.4, windSpeed: 7, swellHs: 1.8, bloom: 0.2, saturation: 1.12, contrast: 1.1, warmth: -0.2, vignette: 0.18 },
};

export class Trailer {
  constructor(game) {
    this.g = game;
    this.e = game.engine;
    this.cam = { p: [0, 10, 0], l: [0, 10, -100], fov: 55 };
    this.camFn = null;
    this.t = 0;                    // shot time
    this.sink = null;              // async (shot, index, base64png) => void, provided by the recorder
    this.stride = Number(this.e.qs.get('stride')) || 1;        // render only every Nth frame (contact sheets while developing a shot)
    this.rng = makeRng(99);
    this.frames = 0;
    this.preLite = Number(this.e.qs.get('prelite')) || 8;
    this.audioOn = this.e.qs.get('audio') === '1';       // render the game sounds of the recorded frames to a WAV (offline audio context)
    this.at = 0;                   // time on the audio timeline = recorded time since the scene started
    this.marks = {};               // shot name -> start on that timeline
    // scene scripts can look at what happened: counts and the last event of each type (impacts, explosions, drops...)
    this.ev = { counts: {}, last: {} };
    const w = game.world, drain = w.drainEvents.bind(w);
    w.drainEvents = () => {
      const ev = drain();
      for (const e of ev) { this.ev.counts[e.type] = (this.ev.counts[e.type] || 0) + 1; this.ev.last[e.type] = e; }
      return ev;
    };
    // after the game has moved the world and the default camera, put the scripted camera in place
    const prev = this.e.hooks.update;
    this.e.hooks.update = (dt, now) => { prev(dt, now); if (this.camFn) this.applyCamera(); };
  }

  // ------------------------------------------------------------------------------------------------------ setup
  /** Clear the world and set the look of the sea and sky. */
  reset(seed, look = 'morning', extra = {}) {
    const g = this.g, w = g.world;
    w.clear();
    g.particles.n = 0;
    w.rng = makeRng(seed);
    this.rng = makeRng(seed + 1);
    g.effects.shake = 0;
    g.state = 'ready';
    g.paused = false;
    g.timeScale = 1;
    this.camFn = null;
    this.look(look, extra);
    if (this.audioOn) this.audioReset();
    TEAM_COLORS.forEach((t, i) => w.addTeam(i, t.name, t.rgb));
  }

  look(name, extra = {}) {
    const P = this.e.P, L = { ...LOOKS[name], ...extra };
    let spec = false, lut = false;
    for (const [k, v] of Object.entries(L)) {
      if (P[k] === v) continue;
      if (k === 'windSpeed' || k === 'swellHs') spec = true;
      if (k === 'haze') lut = true;
      P[k] = v;
    }
    if (spec) this.e.markDirty('spec');
    if (lut) this.e.markDirty('lut');
    this.e.markDirty('');
  }

  /** Put a fleet on the water. entries: [{ id, count }]; (x, z) = position of the leader, heading in degrees (0 = north, 90 = east). */
  fleet(team, entries, x, z, headingDeg, o = {}) {
    const w = this.g.world, h = headingDeg * D2R;
    const ships = spawnFleet(w, team, entries, x, z, h, { spread: o.spread ?? 1 });
    for (const s of ships) { s.speed = (o.knots ?? 14) * KN; s.cmd.throttle = o.throttle ?? 0.5; }
    return ships;
  }

  /** A single ship at an exact position. */
  ship(id, team, x, z, headingDeg, knots = 12, name) {
    const s = this.g.world.addShip(id, team, x, z, headingDeg * D2R, { speed: knots * KN, throttle: 0.5, name });
    return s;
  }

  /** Line of ships ahead of each other, same heading; returns them in order. */
  column(ids, team, x, z, headingDeg, gap = 420, knots = 14) {
    const h = headingDeg * D2R, fx = Math.sin(h), fz = -Math.cos(h);
    return ids.map((id, i) => this.ship(id, team, x - fx * gap * i, z - fz * gap * i, headingDeg, knots));
  }

  go() {
    const g = this.g;
    g.state = 'ready';
    g.start();
    g.camera.setMode('free', true);
  }

  log(...a) { console.log('[T]', ...a); }
  count(type) { return this.ev.counts[type] || 0; }
  get w() { return this.g.world; }

  /** Total battle time of the world (s). */
  get now() { return this.g.world.time; }

  // ------------------------------------------------------------------------------------------------------ stepping
  /** Advance one frame; draw and capture it when `capture` is given. */
  async tick(dt, capture = false) {
    this.e.setLite(capture ? 0 : this.preLite);      // pre-roll: the wave simulation only every few frames
    await this.e.step(dt, capture, capture);
    this.frames++;
  }

  /** Run the simulation (no drawing) until cond() holds. dt: pre-roll step (s). Returns true when the condition was met. */
  async until(cond, o = {}) {
    const dt = o.dt ?? 1 / 12, max = o.max ?? 600;
    const t0 = this.g.world.time;
    while (this.g.world.time - t0 < max) {
      if (cond()) return true;
      await this.tick(dt, false);
    }
    return cond();
  }

  /** Pre-roll for a given number of simulated seconds. */
  async wait(sec, dt = 1 / 12) {
    const t0 = this.g.world.time;
    while (this.g.world.time - t0 < sec) await this.tick(dt, false);
  }

  /**
   * Record a shot of `seconds` seconds. camFn(t, T) -> { p: [x,y,z], l: [x,y,z], fov } is evaluated every frame after the world moved.
   */
  async shot(name, seconds, camFn, o = {}) {
    const n = Math.round(seconds * FPS), stride = this.stride;
    this.dur = seconds;
    this.marks[name] = this.at;
    this.camFn = (t) => camFn(t, this);
    const au = this.g.audio.offline;
    for (let i = 0; i < n; i++) {
      this.t = i / FPS;
      const draw = i % stride === 0;
      this.e.setLite(draw ? 0 : this.preLite);
      if (au) { au.t = this.at; au.on = true; }
      const png = await this.e.step(1 / FPS, draw, draw);
      this.at += 1 / FPS;
      this.frames++;
      if (png && this.sink) await this.sink(name, i, png);
    }
    if (au) au.on = false;
    this.camFn = null;
  }

  // ------------------------------------------------------------------------------------------------------ audio
  audioReset() {
    const ctx = new OfflineAudioContext(2, 44100 * 150, 44100);
    this.g.audio.ctx = null; this.g.audio.loops.clear(); this.g.audio.rushed.clear();
    this.g.audio.useOffline(ctx);
    this.at = 0; this.marks = {};
  }

  /** End of a scene: render the sounds of everything that was recorded and hand the WAV to the recorder. */
  async finish(name) {
    if (!this.audioOn || !this.g.audio.offline) return;
    const buf = await this.g.audio.ctx.startRendering();
    if (window.__sinkAudio) await window.__sinkAudio(name, wavBase64(buf, this.at), this.marks, this.at);
  }

  /** Render the music for a given edit (see tools/trailer/score) and hand it to the recorder. */
  async music(spec) {
    const buf = await renderMusic(spec);
    await window.__sinkAudio('music', wavBase64(buf, spec.dur), {}, spec.dur);
  }

  applyCamera() {
    const cam = this.e.cam, c = this.camFn(this.t) || this.cam;
    const [px, py, pz] = c.p, [lx, ly, lz] = c.l;
    cam.x = px; cam.y = py; cam.z = pz;
    const fx = lx - px, fy = ly - py, fz = lz - pz;
    cam.yaw = Math.atan2(fx, -fz);
    cam.pitch = Math.asin(fy / Math.max(1e-6, Math.hypot(fx, fy, fz)));
    cam.fovY = (c.fov ?? 55) * D2R;
    // explosion shake, deterministic
    const sh = this.g.effects.shake;
    if (sh > 0.002) { cam.yaw += (this.rng() - 0.5) * 0.004 * sh; cam.pitch += (this.rng() - 0.5) * 0.004 * sh; }
  }
}

// ---------------------------------------------------------------------------------------------------- camera moves
export const mv = {
  ease, easeOut, lerp, clamp, smoothstep,
  /** point on a ship in world coordinates */
  at(ship, lx, ly, lz) { const o = [0, 0, 0]; ship.toWorld(lx, ly, lz, o); return o; },
  /** a camera that orbits a moving centre: az in degrees (0 = camera north of the centre looking south), r, height above the centre */
  orbit(centre, a0, a1, r0, r1, h0, h1, lookY = 0, fov = 50, k = ease) {
    return (t, T) => {
      const u = k(clamp(t / T.dur, 0, 1)), c = centre();
      const az = lerp(a0, a1, u) * D2R, r = lerp(r0, r1, u), h = lerp(h0, h1, u);
      return { p: [c[0] + Math.sin(az) * r, c[1] + h, c[2] - Math.cos(az) * r], l: [c[0], c[1] + lookY, c[2]], fov: typeof fov === 'function' ? fov(u) : fov };
    };
  },
};
