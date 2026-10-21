// What the performance test records beyond the frame times (read by bench.js): the CPU time of each part of the frame, the long tasks of the page, a histogram of the
// frame times, the worst frames, a census of the particles (how many of each kind and how many screens of them are drawn: the overdraw that fills a phone) and
// the memory. Everything is added to the report's data so that the next round of work can start from the numbers.

/** The CPU time of the parts of a frame, measured by wrapping the game's own methods while the test runs (and putting them back after). */
export class CpuProbe {
  constructor(game) {
    this.t = {};
    this.undo = [];
    const wrap = (obj, name, key) => {
      if (!obj || typeof obj[name] !== 'function') return;
      const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name];
      obj[name] = (...a) => { const t0 = performance.now(); try { return orig.apply(obj, a); } finally { this.t[key] = (this.t[key] || 0) + performance.now() - t0; } };
      this.undo.push(() => { if (had) obj[name] = orig; else delete obj[name]; });
    };
    wrap(game.world, 'update', 'sim');
    wrap(game.effects, 'process', 'fxEvents');
    wrap(game.effects, 'update', 'fxUpdate');
    wrap(game.particles, 'update', 'particles');
    wrap(game.camera, 'update', 'camera');
    wrap(game.audio, 'update', 'audio');
    wrap(game.audio, 'onEvents', 'audioEvents');
    wrap(game.shipRenderer, 'upload', 'upload');
    this.mark = {};
  }
  /** The totals now: the difference between two readings is what a view cost. */
  snap() { return { ...this.t }; }
  static diff(a, b, frames) {
    const o = {};
    for (const k of Object.keys(b)) o[k] = +(((b[k] || 0) - (a[k] || 0)) / Math.max(1, frames)).toFixed(3);
    return o;
  }
  restore() { for (const u of this.undo.reverse()) u(); this.undo = []; }
}

/** Long tasks of the page (a task that holds the main thread for over 50 ms: a stutter that is not the GPU's). */
export class LongTasks {
  constructor() {
    this.list = [];
    try {
      this.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) this.list.push({ t: e.startTime, d: e.duration }); });
      this.obs.observe({ type: 'longtask', buffered: false });
    } catch (e) { this.obs = null; }
  }
  /** What happened between two times (performance.now()). */
  between(t0, t1) {
    const l = this.list.filter((x) => x.t >= t0 && x.t <= t1);
    return { n: l.length, totalMs: +l.reduce((s, x) => s + x.d, 0).toFixed(0), maxMs: l.length ? +Math.max(...l.map((x) => x.d)).toFixed(0) : 0 };
  }
  stop() { try { this.obs?.disconnect(); } catch (e) { /* nothing */ } }
}

export const HIST_EDGES = [8.4, 12.5, 17.5, 25, 34, 50, 100];
/** How many frames fell in each band of frame time (< 8.4 ms, < 12.5, < 17.5, < 25, < 34, < 50, < 100, more). */
export function histogram(times) {
  const h = new Array(HIST_EDGES.length + 1).fill(0);
  for (const t of times) { let i = 0; while (i < HIST_EDGES.length && t >= HIST_EDGES[i]) i++; h[i]++; }
  return h;
}

/** The slowest frames of a view: [{ at (s into the view), ms, particles }]. */
export function worstFrames(frames, n = 5) {
  return frames.map((f, i) => ({ i, f })).sort((a, b) => b.f.w - a.f.w).slice(0, n).map(({ f }) => ({ at: +(f.at || 0).toFixed(2), ms: +f.w.toFixed(1), particles: f.n ?? null, gpu: +(f.g || 0).toFixed(1) }));
}

/** The mean of each GPU pass over the frames of a view (ms; passes that did not run are left out). */
export function meanPasses(frames) {
  const sum = {}, cnt = {};
  for (const f of frames) if (f.ps) for (const [k, v] of Object.entries(f.ps)) if (v > 0) { sum[k] = (sum[k] || 0) + v; cnt[k] = (cnt[k] || 0) + 1; }
  const o = {};
  for (const k of Object.keys(sum)) o[k] = +(sum[k] / cnt[k]).toFixed(2);
  return Object.keys(o).length ? o : null;
}

/**
 * The particles that would be drawn: how many of each kind, and, for each kind, how many screens' worth of quads they cover (the sum of the areas of their quads
 * over the area of the image: 3 means every pixel is covered three times). Smoke and spray are alpha blended over a multisampled target, which is what fills a phone.
 */
export function particleCensus(game) {
  const P = game.particles, e = game.engine, c = e.cam, W = e.stats.width || 1, H = e.stats.height || 1;
  const names = ['smoke', 'fire', 'spray', 'tracer', 'flash', 'fireball', 'flame', 'disc'];
  const out = { total: P.n, inView: 0, kinds: {} };
  const pool = P.pool, F = 24, tanY = Math.tan(c.fovY / 2), tanX = tanY * W / H, px = (H / 2) / tanY;
  const cp = Math.cos(c.pitch ?? 0), sp = Math.sin(c.pitch ?? 0), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const fx = sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = sy;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                  // up = right x forward
  for (let i = 0; i < P.n; i++) {
    const o = i * F, kind = pool[o + 19] | 0, k = names[kind] || 'other';
    const rec = out.kinds[k] || (out.kinds[k] = { n: 0, inView: 0, screens: 0, big: 0 });
    rec.n++;
    const dx = pool[o] - c.x, dy = pool[o + 1] - c.y, dz = pool[o + 2] - c.z;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth < 0.5) continue;
    const t = Math.min(1, pool[o + 6] / Math.max(0.01, pool[o + 7])), size = pool[o + 8] + (pool[o + 9] - pool[o + 8]) * Math.sqrt(t);
    if (Math.abs(dx * rx + dz * rz) > depth * tanX + size || Math.abs(dx * ux + dy * uy + dz * uz) > depth * tanY + size) continue;
    rec.inView++; out.inView++;
    const diam = Math.min(2 * Math.max(W, H), 2 * size * px / depth);           // pixels across (the quad is the diameter: the shader's size is a half-width)
    rec.screens += (diam * diam) / (W * H);
    if (diam > 0.25 * H) rec.big++;
  }
  for (const r of Object.values(out.kinds)) r.screens = +r.screens.toFixed(2);
  return out;
}

/** The JS heap in MB (Chrome only). */
export const heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null);
