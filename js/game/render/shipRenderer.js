// Instanced renderer for the procedurally built ship meshes. Draws into the engine's main HDR /
// MSAA / reverse-Z pass (see engine.hooks.drawOpaque). Instances are camera-relative.
import { SHIP, SHIP_SHADOW } from '../../wgsl/ship.js';
import { VERTEX_STRIDE } from '../model/meshbuilder.js';

const INST_FLOATS = 28;          // 4 x vec4 matrix + tint + misc + paint
const MAX_INSTANCES = 32768;
const GU = GPUBufferUsage;

export class ShipRenderer {
  constructor(engine) {
    this.engine = engine;
    this.device = engine.device;
    this.meshes = [];
    this.instData = new Float32Array(MAX_INSTANCES * INST_FLOATS);
    this.instBuf = this.device.createBuffer({ size: this.instData.byteLength, usage: GU.VERTEX | GU.COPY_DST, label: 'ship instances' });
    this.count = 0;
    this.paint = [0, 0, 0, 0];     // livery of the instances queued next (camouflage, seed, nation, palette); see setPaint()
    this.casting = true;           // do the instances queued next cast sun shadows (ships far from the shadow focus do not)
    this.ready = this._init();
  }

  async _init() {
    const g = this.engine.gpu;
    const module = await g.shader(SHIP, 'ship');
    const vertex = {
        module, entryPoint: 'vs',
        buffers: [
          { arrayStride: VERTEX_STRIDE, stepMode: 'vertex', attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'snorm16x4' },
            { shaderLocation: 2, offset: 20, format: 'unorm8x4' },
          ] },
          { arrayStride: INST_FLOATS * 4, stepMode: 'instance', attributes: [
            { shaderLocation: 3, offset: 0, format: 'float32x4' },
            { shaderLocation: 4, offset: 16, format: 'float32x4' },
            { shaderLocation: 5, offset: 32, format: 'float32x4' },
            { shaderLocation: 6, offset: 48, format: 'float32x4' },
            { shaderLocation: 7, offset: 64, format: 'float32x4' },
            { shaderLocation: 8, offset: 80, format: 'float32x4' },
            { shaderLocation: 9, offset: 96, format: 'float32x4' },
          ] },
        ],
      };
    this.pipeline = await this.device.createRenderPipelineAsync({
      label: 'ship', layout: 'auto',
      vertex,
      fragment: { module, entryPoint: 'fs', targets: [{ format: g.HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: g.DEPTH, depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: g.MSAA },
    });
    const sh = this.engine.shadow;
    // the clear panes of the aircraft canopies: the same shader, blended over the scene, nothing written to the depth
    this.panePipeline = await this.device.createRenderPipelineAsync({
      label: 'ship panes', layout: 'auto',
      vertex,
      fragment: { module, entryPoint: 'fs', targets: [{ format: g.HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: g.DEPTH, depthWriteEnabled: false, depthCompare: 'greater' },
      multisample: { count: g.MSAA },
    });
    const bindEntries = [
        { binding: 0, resource: { buffer: g.frameUBO } },
        { binding: 1, resource: g.transView },
        { binding: 2, resource: g.skyView },
        { binding: 3, resource: g.sampClamp },
        { binding: 4, resource: g.envCubeView },
        { binding: 5, resource: { buffer: g.sunVisBuf } },
        { binding: 6, resource: sh.view },
        { binding: 7, resource: sh.sampler },
        { binding: 8, resource: { buffer: sh.ubo } },
        { binding: 9, resource: g.cshadowView },
    ];
    this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: bindEntries });
    this.paneBindGroup = this.device.createBindGroup({ layout: this.panePipeline.getBindGroupLayout(0), entries: bindEntries });
    // depth-only shadow pass (same vertex / instance layouts)
    const smod = await g.shader(SHIP_SHADOW, 'ship shadow');
    this.shadowPipeline = await this.device.createRenderPipelineAsync({
      label: 'ship shadow', layout: 'auto',
      vertex: {
        module: smod, entryPoint: 'vs',
        buffers: [
          { arrayStride: VERTEX_STRIDE, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: INST_FLOATS * 4, stepMode: 'instance', attributes: [
            { shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 4, offset: 16, format: 'float32x4' },
            { shaderLocation: 5, offset: 32, format: 'float32x4' }, { shaderLocation: 6, offset: 48, format: 'float32x4' },
          ] },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 2.5, depthBiasClamp: 0 },
    });
    this.shadowBG = this.device.createBindGroup({ layout: this.shadowPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: sh.ubo } }] });
  }

  /** Upload a built mesh ({vertices, indices, indexCount, aabb}) and return a handle. */
  createMesh(built, label = 'mesh') {
    const vbuf = this.device.createBuffer({ size: built.vertices.byteLength, usage: GU.VERTEX | GU.COPY_DST, label: label + ' vb' });
    this.device.queue.writeBuffer(vbuf, 0, built.vertices);
    const ibuf = this.device.createBuffer({ size: built.indices.byteLength, usage: GU.INDEX | GU.COPY_DST, label: label + ' ib' });
    this.device.queue.writeBuffer(ibuf, 0, built.indices);
    const mesh = { id: this.meshes.length, vbuf, ibuf, indexCount: built.indexCount, solidCount: built.paneStart ?? built.indexCount, aabb: built.aabb, label, first: 0, n: 0, n2: 0, cpu: null, cpu2: null };
    this.meshes.push(mesh);
    return mesh;
  }

  /** Free a mesh made by createMesh() (islands are rebuilt for every battle). */
  releaseMesh(mesh) {
    const k = this.meshes.indexOf(mesh);
    if (k >= 0) this.meshes.splice(k, 1);
    mesh.vbuf.destroy(); mesh.ibuf.destroy();
  }

  /** Do the instances added from now on cast sun shadows? (default yes) */
  setCasting(on) { this.casting = on; }

  /** Livery for the instances added from now on: [camouflage pattern, seed, nation id, palette]; pass nothing to reset. */
  setPaint(p) { const q = this.paint; q[0] = p ? p[0] : 0; q[1] = p ? p[1] : 0; q[2] = p ? p[2] : 0; q[3] = p ? p[3] : 0; }

  /** Start collecting instances for a new frame. */
  begin() {
    for (const m of this.meshes) { m.n = 0; m.n2 = 0; }
    this.count = 0;
  }

  /**
   * Queue an instance (data is copied immediately, callers may reuse their arrays).
   * `mat` is a camera-relative column-major 4x4 (the current livery is attached, see setPaint); tint = [r, g, b] team colour (0-255 sRGB),
   * damage 0..1 (soot), fire 0..1 (glow), rnd 0..1 per ship. cutSide = +1 / -1 keeps only the part of the mesh forward / abaft
   * of local x = cutX (a ship broken in two), 0 = whole.
   */
  add(mesh, mat, tint, damage = 0, fire = 0, rnd = 0, cutX = 0, cutSide = 0) {
    if (this.count >= MAX_INSTANCES) return;
    // shadow casters and non-casters are staged separately so the shadow pass can draw a prefix of each mesh's instances
    const cast = this.casting;
    let d = cast ? mesh.cpu : mesh.cpu2;
    const idx = cast ? mesh.n : mesh.n2;
    if (!d || (idx + 1) * INST_FLOATS > d.length) {
      const bigger = new Float32Array(Math.max(INST_FLOATS * 8, d ? d.length * 2 : 0));
      if (d) bigger.set(d);
      d = bigger;
      if (cast) mesh.cpu = d; else mesh.cpu2 = d;
    }
    const o = idx * INST_FLOATS;
    for (let k = 0; k < 16; k++) d[o + k] = mat[k];
    d[o + 16] = tint[0] / 255; d[o + 17] = tint[1] / 255; d[o + 18] = tint[2] / 255; d[o + 19] = damage;
    d[o + 20] = fire; d[o + 21] = rnd; d[o + 22] = cutX; d[o + 23] = cutSide;
    const pt = this.paint;
    d[o + 24] = pt[0]; d[o + 25] = pt[1]; d[o + 26] = pt[2]; d[o + 27] = pt[3];
    if (cast) mesh.n++; else mesh.n2++;
    this.count++;
  }

  /** Pack and upload everything queued this frame. */
  upload() {
    let o = 0;
    const d = this.instData;
    for (const m of this.meshes) {
      m.first = o / INST_FLOATS;
      if (m.n) { d.set(m.cpu.subarray(0, m.n * INST_FLOATS), o); o += m.n * INST_FLOATS; }
      if (m.n2) { d.set(m.cpu2.subarray(0, m.n2 * INST_FLOATS), o); o += m.n2 * INST_FLOATS; }
    }
    if (o) this.device.queue.writeBuffer(this.instBuf, 0, d, 0, o);
  }

  /** Render all queued instances into the sun shadow map. */
  drawShadow(enc) {
    if (!this.shadowPipeline || !this.count) return;
    const sh = this.engine.shadow;
    const pass = enc.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: sh.view, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      timestampWrites: this.engine.tsWrites?.('shadow'),
    });
    pass.setPipeline(this.shadowPipeline);
    pass.setBindGroup(0, this.shadowBG);
    pass.setVertexBuffer(1, this.instBuf);
    for (const m of this.meshes) {
      if (!m.n) continue;          // only the shadow casters
      pass.setVertexBuffer(0, m.vbuf);
      pass.setIndexBuffer(m.ibuf, 'uint32');
      pass.drawIndexed(m.solidCount, m.n, 0, 0, m.first);
    }
    pass.end();
  }

  draw(rp) {
    if (!this.pipeline || !this.count) return;
    rp.setPipeline(this.pipeline);
    rp.setBindGroup(0, this.bindGroup);
    rp.setVertexBuffer(1, this.instBuf);
    for (const m of this.meshes) {
      const n = m.n + m.n2;
      if (!n) continue;
      rp.setVertexBuffer(0, m.vbuf);
      rp.setIndexBuffer(m.ibuf, 'uint32');
      rp.drawIndexed(m.solidCount, n, 0, 0, m.first);
    }
  }

  /** The clear panes (glass of the canopies), blended over the scene: after the sea and the sky, which the glass shows. */
  drawPanes(rp) {
    if (!this.panePipeline || !this.count) return;
    let set = false;
    for (const m of this.meshes) {
      const n = m.n + m.n2;
      if (!n || m.solidCount >= m.indexCount) continue;
      if (!set) { rp.setPipeline(this.panePipeline); rp.setBindGroup(0, this.paneBindGroup); rp.setVertexBuffer(1, this.instBuf); set = true; }
      rp.setVertexBuffer(0, m.vbuf);
      rp.setIndexBuffer(m.ibuf, 'uint32');
      rp.drawIndexed(m.indexCount - m.solidCount, n, m.solidCount, 0, m.first);
    }
  }
}
