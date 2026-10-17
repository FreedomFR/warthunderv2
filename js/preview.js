// Model preview: ?preview=<shipId> renders one ship on the ocean with an orbit camera.
//   view=dist,azimuthDeg,elevationDeg[,lookY]   (azimuth 0 = looking at the ship from the stern... see below)
//   heading=deg
import { ShipRenderer } from './game/render/shipRenderer.js';
import { BY_ID } from './game/data/ships.js';
import { buildShipModel } from './game/model/shipbuilder.js';
import { TWEAKS } from './game/model/tweaks.js';
import { getMountModel } from './game/model/mounts.js';
import { mat4Ship, mountMatrices, D2R } from './game/math.js';
import { addWakeStamps } from './game/render/effects.js';
import { makeStats } from './game/sim/shipdata.js';

export async function runPreview(engine, ids, qs) {
  const renderer = new ShipRenderer(engine);
  await renderer.ready;
  const items = [];
  let xOff = 0;
  for (const id of ids) {
    const spec = BY_ID[id];
    if (!spec) throw new Error('unknown ship ' + id);
    const model = buildShipModel(spec, TWEAKS[id] || {});
    const mesh = renderer.createMesh(model.mesh, id);
    const cacheMeshes = new Map();
    const mounts = model.mounts.map((m) => {
      const mm = getMountModel({ kind: m.kind, cal: m.cal, n: m.n, bore: m.bore, col: model.pal.sup });
      if (!cacheMeshes.has(mm)) cacheMeshes.set(mm, { house: renderer.createMesh(mm.house, id + ' house'), guns: renderer.createMesh(mm.guns, id + ' guns') });
      const meshes = cacheMeshes.get(mm);
      return { m, mm, house: meshes.house, guns: meshes.guns };
    });
    items.push({ id, model, mesh, mounts, x: xOff, z: 0 });
    xOff += 1200;
  }
  const view = (qs.get('view') || '').split(',').map(Number);
  const st = { dist: view[0] || 260, az: (view[1] ?? 35) * D2R, el: (view[2] ?? 18) * D2R, lookY: view[3] ?? 12, target: 0, lookX: 0, heading: (Number(qs.get('heading')) || 0) * D2R };
  const cam = engine.cam;
  const S = new Float64Array(16), H = new Float64Array(16), G = new Float64Array(16);
  const SM = new Float32Array(16), HM = new Float32Array(16), GM = new Float32Array(16);
  const pitchDeg = Number(qs.get('elev')) || 0;
  const tint = [220, 60, 50];
  // ?wake=1 : stamp a sailing ship's wake around the first model (visual test of the foam stamps)
  const wake = qs.get('wake') === '1';
  const wakeShip = wake ? { x: items[0].x, z: items[0].z, heading: 0, speed: 15, state: 'afloat', stats: makeStats(BY_ID[ids[0]]) } : null;
  engine.hooks.update = () => {
    if (wakeShip) { wakeShip.heading = st.heading; addWakeStamps(engine.foam, wakeShip, 100, 0.9); }
    const tx = items[st.target].x + st.lookX, tz = items[st.target].z, ty = st.lookY;
    const cx = tx + st.dist * Math.sin(st.az) * Math.cos(st.el), cy = ty + st.dist * Math.sin(st.el), cz = tz - st.dist * Math.cos(st.az) * Math.cos(st.el);
    cam.x = cx; cam.y = Math.max(cy, 3); cam.z = cz;
    const fx = tx - cx, fy = ty - cam.y, fz = tz - cz;
    cam.yaw = Math.atan2(fx, -fz);
    cam.pitch = Math.asin(fy / Math.hypot(fx, fy, fz));
    cam.fovY = (Number(qs.get('fov')) || 40) * D2R;
  };
  engine.hooks.prepare = () => {
    renderer.begin();
    for (const it of items) {
      mat4Ship(S, it.x - cam.x, -cam.y + 0.0, it.z - cam.z, st.heading, 0, 0);
      for (let i = 0; i < 16; i++) SM[i] = S[i];
      renderer.add(it.mesh, SM, tint, Number(qs.get('dmg')) || 0, Number(qs.get('fire')) || 0, 0.3);
      for (const mo of it.mounts) {
        const yaw = Number(qs.get('yaw')) ? Number(qs.get('yaw')) * D2R : 0;
        mountMatrices(H, G, S, mo.m.x, mo.m.y, mo.m.z, yaw, pitchDeg * D2R, mo.mm.trunnion[0], mo.mm.trunnion[1], 0);
        for (let i = 0; i < 16; i++) { HM[i] = H[i]; GM[i] = G[i]; }
        renderer.add(mo.house, HM, tint, 0, 0, 0.3);
        renderer.add(mo.guns, GM, tint, 0, 0, 0.3);
      }
    }
    renderer.upload();
  };
  engine.hooks.drawOpaque = (rp) => renderer.draw(rp);
  window.__preview = {
    items, renderer,
    /** set({dist, az, el (deg), lookY, lookX, target, heading (deg)}) */
    set(o) {
      if (o.dist != null) st.dist = o.dist;
      if (o.az != null) st.az = o.az * D2R;
      if (o.el != null) st.el = o.el * D2R;
      if (o.lookY != null) st.lookY = o.lookY;
      if (o.lookX != null) st.lookX = o.lookX;
      if (o.target != null) st.target = o.target;
      if (o.heading != null) st.heading = o.heading * D2R;
    },
  };
}
