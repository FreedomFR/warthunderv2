// Synthesised sound (Web Audio, no sample files): gun blasts with propagation delay and distance
// filtering, impacts, explosions, splashes, AA fire and a sea ambience. M mutes. Sounds are muted when
// the simulation runs faster than 2.5x or is paused.
export class GameAudio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
    this.active = 0;
    try { this.muted = localStorage.getItem('naval-muted') === '1'; } catch (e) { /* storage unavailable */ }
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  unlock() {
    if (this.ctx || typeof AudioContext === 'undefined') { this.ctx?.resume?.(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    // 3 s of white noise reused by every burst
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // sea ambience: low-passed noise, slowly modulated
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambient = g;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('naval-muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  get live() {
    const g = this.game;
    return this.ctx && !this.muted && !g.paused && g.timeScale <= 2.5 && this.ctx.state === 'running';
  }

  /** One noise burst (+ optional sub-bass thump). t = delay in seconds. */
  burst(t, amp, cutoff, dur, thumpHz = 0) {
    const ctx = this.ctx;
    if (this.active > 48) return;
    const t0 = ctx.currentTime + t;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.loopStart = Math.random() * 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t0, Math.random() * 2, dur + 0.1);
    this.active++;
    src.onended = () => { this.active--; };
    if (thumpHz) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(thumpHz * 1.7, t0);
      o.frequency.exponentialRampToValueAtTime(thumpHz * 0.5, t0 + dur * 0.8);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(amp * 0.9, t0 + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.9);
      o.connect(og); og.connect(this.master);
      o.start(t0); o.stop(t0 + dur);
    }
  }

  /** Distance model: loudness, high-frequency loss and speed-of-sound delay. */
  at(x, z) {
    const c = this.game.engine.cam;
    const d = Math.hypot(x - c.x, z - c.z, c.y * 0.3);
    const ts = Math.max(0.5, this.game.timeScale);
    return { d, delay: Math.min(d / 343 / ts, 40), gain: 1 / (1 + d / 450), lp: 150 + 6000 / (1 + d / 700) };
  }

  onEvents(events) {
    if (!this.live) return;
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': {
          const m = this.at(e.x, e.z);
          if (m.gain < 0.02) break;
          const k = Math.min(1.6, e.cal / 220);
          this.burst(m.delay, Math.min(1, 0.9 * k * m.gain * (0.7 + 0.1 * e.n)), m.lp * (0.6 + 0.4 / (0.5 + k)), 0.5 + 0.9 * k, 70 / (0.6 + k * 0.7));
          break;
        }
        case 'impact': {
          const m = this.at(e.x, e.z);
          if (m.gain < 0.02) break;
          const k = Math.min(1.5, e.cal / 250);
          const heavy = e.kind === 'penetrate' || e.kind === 'torpedo';
          this.burst(m.delay, Math.min(1, (heavy ? 1.0 : 0.5) * k * m.gain), m.lp * 0.8, heavy ? 1.2 : 0.5, heavy ? 55 : 0);
          break;
        }
        case 'explosion': {
          const m = this.at(e.x, e.z);
          this.burst(m.delay, Math.min(1, 1.6 * m.gain + 0.1), 900 + m.lp * 0.3, 3.2, 38);
          break;
        }
        case 'splash': {
          const m = this.at(e.x, e.z);
          if (m.gain < 0.05) break;
          this.burst(m.delay, 0.18 * m.gain * Math.min(1.5, e.cal / 300), 1500 + m.lp * 0.2, 0.9);
          break;
        }
        case 'aaFire': {
          const m = this.at(e.ship.x, e.ship.z);
          if (m.gain < 0.08) break;
          this.burst(m.delay, 0.08 * m.gain, 3500, 0.12);
          break;
        }
        case 'torpedoLaunch': {
          const m = this.at(e.x, e.z);
          this.burst(m.delay, 0.2 * m.gain, 1200, 0.6);
          break;
        }
        case 'collision': {
          const m = this.at(e.x, e.z);
          this.burst(m.delay, 0.7 * m.gain, 700, 1.2, 80);
          break;
        }
        default: break;
      }
    }
  }
}
