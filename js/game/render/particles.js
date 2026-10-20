// CPU-simulated particle pool drawn as camera-facing quads (see wgsl/particles.js).
import { PARTICLES } from '../../wgsl/particles.js';

const GU = GPUBufferUsage;
export const DEFAULT_MAX = 40000;      // live particles at once; the setting 'Particules max' changes it (setMax), the memory grows with it
const MAX_TRANSIENT = 3000;
const INST = 16;           // floats per instance
const F = 24;              // floats per particle in the pool
// pool layout
const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, R = 10, G = 11, B = 12, A0 = 13, A1 = 14,
  ROT = 15, ROTV = 16, GRAV = 17, DRAG = 18, KIND = 19, SEED = 20, STRETCH = 21, WIND = 22;

export const K = { SMOKE: 0, FIRE: 1, SPRAY: 2, TRACER: 3, FLASH: 4, FIREBALL: 5, FLAME: 6 };      // FLAME: an upright tongue of flame (does not turn with the camera roll or spin)

export class Particles {
  constructor(engine) {
    this.engine = engine; this.device = engine.device;
    this.max = 0;
    this.pool = new Float32Array(0);
    this.n = 0;
    this.setMax(DEFAULT_MAX);
    this.count = 0;
    this.tr = new Float32Array(MAX_TRANSIENT * INST);
    this.nT = 0;                    // transient instances (tracers), rebuilt every frame
    this.wind = [3, 0];
    this.ready = this._init();
  }

  /** Change the capacity of the pool (the particles alive are kept, the oldest-looking ones go first if there are more than the new size). */
  setMax(max) {
    max = Math.max(2000, Math.min(400000, Math.round(max)));
    if (max === this.max) return;
    const pool = new Float32Array(max * F);
    this.n = Math.min(this.n, max);
    pool.set(this.pool.subarray(0, this.n * F));
    this.pool = pool; this.max = max;
    this.inst = new Float32Array((max + MAX_TRANSIENT) * INST);
    this._order = null;
    this.buf?.destroy?.();
    this.buf = this.device.createBuffer({ size: this.inst.byteLength, usage: GU.VERTEX | GU.COPY_DST, label: 'particles' });
  }

  async _init() {
    const g = this.engine.gpu;
    const module = await g.shader(PARTICLES, 'particles');
    this.pipeline = await this.device.createRenderPipelineAsync({
      label: 'particles', layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{ arrayStride: INST * 4, stepMode: 'instance', attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' },
          { shaderLocation: 2, offset: 32, format: 'float32x4' }, { shaderLocation: 3, offset: 48, format: 'float32x4' },
        ] }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: g.HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: g.DEPTH, depthWriteEnabled: false, depthCompare: 'greater' },
      multisample: { count: g.MSAA },
    });
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.frameUBO } }, { binding: 1, resource: g.transView }, { binding: 2, resource: g.skyView },
        { binding: 3, resource: g.sampClamp }, { binding: 4, resource: g.envCubeView }, { binding: 5, resource: { buffer: g.sunVisBuf } },
      ],
    });
  }

  /**
   * Spawn a particle. o: { kind, x, y, z, vx, vy, vz, s0, s1 (size m), life (s), r, g, b, a0, a1, rot, rotV, grav, drag, wind (0..1), stretch }
   */
  add(o) {
    let n = this.n;
    if (n >= this.max) {
      // the pool is full: what shows the shot (fireballs, flames, flashes, tracers) takes the place of one of the oldest-looking puffs of smoke or spray instead of being lost
      if (o.kind !== K.FIREBALL && o.kind !== K.FLASH && o.kind !== K.FLAME && o.kind !== K.TRACER && o.kind !== K.FIRE) return;
      const q = this.pool;
      let best = -1, ba = 0.3;
      for (let k = 0; k < 24; k++) {
        const i = (Math.random() * n) | 0, kd = q[i * F + KIND];
        if (kd !== K.SMOKE && kd !== K.SPRAY) continue;
        const a = q[i * F + AGE] / q[i * F + LIFE];
        if (a > ba) { ba = a; best = i; }
      }
      if (best < 0) return;
      this._write(best, o);
      return;
    }
    this._write(this.n++, o);
  }

  /** How full the pool is, 0..1: the effects emit less as it fills, the smoke and the spray first. */
  fill() { return this.n / this.max; }

  _write(idx, o) {
    const p = this.pool, i = idx * F;
    p[i + X] = o.x; p[i + Y] = o.y; p[i + Z] = o.z;
    p[i + VX] = o.vx || 0; p[i + VY] = o.vy || 0; p[i + VZ] = o.vz || 0;
    p[i + AGE] = 0; p[i + LIFE] = o.life;
    p[i + S0] = o.s0; p[i + S1] = o.s1 ?? o.s0;
    p[i + R] = o.r ?? 1; p[i + G] = o.g ?? 1; p[i + B] = o.b ?? 1;
    p[i + A0] = o.a0 ?? 1; p[i + A1] = o.a1 ?? 0;
    p[i + ROT] = o.rot ?? Math.random() * 6.28; p[i + ROTV] = o.rotV ?? 0;
    p[i + GRAV] = o.grav || 0; p[i + DRAG] = o.drag || 0;
    p[i + KIND] = o.kind; p[i + SEED] = Math.random();
    p[i + STRETCH] = o.stretch || 0; p[i + WIND] = o.wind ?? 0;
  }

  update(dt) {
    const p = this.pool;
    const wx = this.wind[0], wz = this.wind[1];
    for (let i = this.n - 1; i >= 0; i--) {
      const o = i * F;
      p[o + AGE] += dt;
      if (p[o + AGE] >= p[o + LIFE]) {
        // swap-remove
        const last = --this.n * F;
        if (last !== o) p.copyWithin(o, last, last + F);
        continue;
      }
      const drag = Math.exp(-p[o + DRAG] * dt);
      p[o + VX] *= drag; p[o + VZ] *= drag; p[o + VY] = p[o + VY] * drag - p[o + GRAV] * dt;
      p[o + X] += (p[o + VX] + wx * p[o + WIND]) * dt;
      p[o + Y] += p[o + VY] * dt;
      p[o + Z] += (p[o + VZ] + wz * p[o + WIND]) * dt;
      p[o + ROT] += p[o + ROTV] * dt;
      if (p[o + Y] < 0.2 && p[o + KIND] === K.SPRAY) { p[o + Y] = 0.2; p[o + VY] = 0; p[o + VX] *= 0.5; p[o + VZ] *= 0.5; }
    }
  }

  beginFrame() { this.nT = 0; }

  /** transient streak (shell tracer etc.), world coordinates; direction (dx,dy,dz) unit */
  streak(x, y, z, dx, dy, dz, length, width, r, g, b, a, kind = K.TRACER) {
    if (this.nT >= MAX_TRANSIENT) return;
    const cam = this.engine.cam;
    const o = this.nT++ * INST;
    const d = this.tr;
    d[o] = x - cam.x; d[o + 1] = y - cam.y; d[o + 2] = z - cam.z; d[o + 3] = width;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a;
    d[o + 8] = dx; d[o + 9] = dy; d[o + 10] = dz; d[o + 11] = length;
    d[o + 12] = 0; d[o + 13] = kind; d[o + 14] = 0; d[o + 15] = 0;
  }

  /** Pack the pool (camera relative), then append this frame's transient instances. */
  upload() {
    const cam = this.engine.cam;
    const p = this.pool, d = this.inst;
    // the particles that cover what is behind them (smoke, spray, fireballs) are drawn first, then the ones that add light (flames, flashes, tracers): a flame is
    // seen in front of the smoke that hangs over it instead of being hidden by it
    const order = this._order && this._order.length >= this.n ? this._order : (this._order = new Uint32Array(this.max));
    let ia = 0, ib = this.n;
    for (let i = 0; i < this.n; i++) { const k = p[i * F + KIND]; if (k === K.SMOKE || k === K.SPRAY || k === K.FIREBALL) order[ia++] = i; else order[--ib] = i; }
    for (let j = 0; j < this.n; j++) {
      const i = order[j];
      const o = i * F, q = j * INST;
      const t = p[o + AGE] / p[o + LIFE];
      const size = p[o + S0] + (p[o + S1] - p[o + S0]) * Math.sqrt(t);
      const k = p[o + KIND];
      let a;
      if (k === K.SMOKE || k === K.SPRAY || k === K.FIREBALL) a = p[o + A0] + (p[o + A1] - p[o + A0]) * t * t;
      else a = p[o + A0] * Math.pow(1 - t, 1.5) + p[o + A1] * t;
      d[q] = p[o + X] - cam.x; d[q + 1] = p[o + Y] - cam.y; d[q + 2] = p[o + Z] - cam.z; d[q + 3] = size;
      // fire cools from yellow to dark red as it ages
      if (k === K.FIRE || k === K.FLAME) {
        d[q + 4] = p[o + R]; d[q + 5] = p[o + G] * (1 - 0.7 * t); d[q + 6] = p[o + B] * (1 - 0.95 * t);
      } else { d[q + 4] = p[o + R]; d[q + 5] = p[o + G]; d[q + 6] = p[o + B]; }
      d[q + 7] = a;
      const sp = Math.hypot(p[o + VX], p[o + VY], p[o + VZ]);
      if (p[o + STRETCH] > 0 && sp > 0.5) {
        d[q + 8] = p[o + VX] / sp; d[q + 9] = p[o + VY] / sp; d[q + 10] = p[o + VZ] / sp; d[q + 11] = p[o + STRETCH];
      } else { d[q + 8] = 0; d[q + 9] = 1; d[q + 10] = 0; d[q + 11] = 0; }
      d[q + 12] = p[o + ROT]; d[q + 13] = k; d[q + 14] = p[o + SEED]; d[q + 15] = t;
    }
    if (this.nT) d.set(this.tr.subarray(0, this.nT * INST), this.n * INST);
    this.count = this.n + this.nT;
    if (this.count) this.device.queue.writeBuffer(this.buf, 0, d, 0, this.count * INST);
  }

  draw(rp) {
    if (!this.pipeline || !this.count) return;
    rp.setPipeline(this.pipeline);
    rp.setBindGroup(0, this.bindGroup);
    rp.setVertexBuffer(0, this.buf);
    rp.draw(6, this.count);
  }
}
