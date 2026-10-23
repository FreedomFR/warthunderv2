// Model preview: ?preview=<shipId>[,<shipId>|plane:<type>...] renders models on the ocean with an orbit camera.
//   view=dist,azimuthDeg,elevationDeg[,lookY]   heading=deg   elev=gun elevation   yaw=turret train
//   ruin=1       every destroyable part wrecked        scars=N   N battle scars         split=x   ship broken in two at local x
//   parked=N     aircraft parked on carriers           gear=1    undercarriage down      ord=1     ordnance hung on planes
//   cockpit=1&look=yawDeg,pitchDeg   the camera at the pilot's eye of the first aircraft, looking that way (0,0 = ahead; fov= for the field of view)
//   gunaim=yaw,pitch  the gunners aim there (deg, aircraft frame)
//   bay=0..1 bomb doors of a bomber   eng=0,1,.. engines lost (1)   efire=0,1,.. engines on fire   bank=deg pitch=deg  attitude of planes   fold=0..1 wings folded   hook=0..1 arrester hook down
import { ShipRenderer } from './game/render/shipRenderer.js';
import { ShipVisuals } from './game/render/shipVisual.js';
import { PlaneVisuals } from './game/render/aircraftVisual.js';
import { BY_ID } from './game/data/ships.js';
import { buildShipModel } from './game/model/shipbuilder.js';
import { TWEAKS } from './game/model/tweaks.js';
import { PLANES, getPlaneModel } from './game/model/planes.js';
import { inArc } from './game/model/planeGuns.js';
import { mat4Ship, D2R, makeRng } from './game/math.js';
import { addWakeStamps } from './game/render/effects.js';
import { makeStats } from './game/sim/shipdata.js';
import { OPT } from './game/model/parts.js';
import { cockpitEye } from './game/model/cockpit.js';

export async function runPreview(engine, ids, qs) {
  OPT.flags = qs.get('flags') !== '0';    // ?flags=0: no ensigns or pennants (tools/refs/check.mjs)
  const renderer = new ShipRenderer(engine);
  await renderer.ready;
  const sv = new ShipVisuals(renderer), pv = new PlaneVisuals(renderer);
  sv.planes = pv;
  const items = [];
  let xOff = 0;
  const rng = makeRng(5);
  for (const id of ids) {
    if (id.startsWith('plane:')) {
      const key = id.slice(6);
      if (!PLANES[key]) throw new Error('unknown plane ' + key);
      items.push({ plane: key, x: xOff, z: 0 });
      xOff += 120;
      continue;
    }
    const spec = BY_ID[id];
    if (!spec) throw new Error('unknown ship ' + id);
    const model = buildShipModel(spec, TWEAKS[id] || {});
    const ship = {
      id: items.length + 1, model, parked: Number(qs.get('parked') ?? model.deckSlots.length), parkType: 'sbd',
      mounts: model.mounts.map(() => ({ alive: true, wrecked: false, trainRel: (Number(qs.get('yaw')) || 0) * D2R, elev: (Number(qs.get('elev')) || 0) * D2R, recoil: 0 })),
      aaMounts: model.aaMounts.map(() => ({ alive: true, train: 0, elev: 0.3, recoil: 0 })),
      partState: model.parts.map(() => (qs.get('ruin') === '1' ? 2 : 0)),
      scars: [], split: null,
    };
    const nScar = Number(qs.get('scars')) || 0;
    for (let i = 0; i < nScar; i++) {
      const lx = (rng() - 0.5) * spec.loa * 0.8, side = rng() < 0.5 ? -1 : 1;
      ship.scars.push({ x: lx, y: 2 + rng() * 4, z: side * model.hull.halfBeamDeck(lx) * 0.97, nx: 0, ny: 0.18, nz: side, r: 0.6 + rng() * 1.3, k: rng() < 0.5 ? 1 : 2, spin: rng() * 6 });
    }
    if (qs.get('split')) {
      const cut = Number(qs.get('split'));
      ship.split = { cut, t: 0, halves: [
        { sign: 1, dx: 14, dy: 3, dz: 0, yaw: 0.06, pitch: 0.35, roll: 0.15 },
        { sign: -1, dx: -6, dy: -6, dz: 0, yaw: -0.05, pitch: -0.25, roll: -0.3 },
      ] };
    }
    items.push({ id, ship, model, x: xOff, z: 0 });
    xOff += 1200;
  }
  const view = (qs.get('view') || '').split(',').map(Number);
  const st = { dist: view[0] || 260, az: (view[1] ?? 35) * D2R, el: (view[2] ?? 18) * D2R, lookY: view[3] ?? 12, target: 0, lookX: 0, heading: (Number(qs.get('heading')) || 0) * D2R };
  const cam = engine.cam;
  const S = new Float64Array(16);
  const tint = [220, 60, 50];
  // ?wake=1 : stamp a sailing ship's wake around the first model (visual test of the foam stamps)
  const wake = qs.get('wake') === '1';
  const first = items.find((i) => i.id);
  const wakeShip = wake && first ? { x: first.x, z: first.z, heading: 0, speed: 15, state: 'afloat', stats: makeStats(BY_ID[first.id]) } : null;
  const look = qs.get('look') && qs.get('cockpit') === '1' ? qs.get('look').split(',').map(Number) : null;
  engine.hooks.update = () => {
    if (wakeShip) { wakeShip.heading = st.heading; addWakeStamps(engine.foam, wakeShip, 100, 0.9); }
    if (look) {
      // from the pilot's seat (the aircraft level, the head turned by `look`)
      const it = items.find((i) => i.plane), E = cockpitEye(PLANES[it.plane]), h = st.heading, alt = Number(qs.get('alt')) || 40;
      cam.x = it.x + Math.sin(h) * E.x + Math.cos(h) * E.z; cam.y = alt + E.y; cam.z = it.z - Math.cos(h) * E.x + Math.sin(h) * E.z;
      cam.yaw = h + (look[0] || 0) * D2R; cam.pitch = (look[1] || 0) * D2R; cam.roll = 0;
      cam.fovY = (Number(qs.get('fov')) || 66) * D2R;
      return;
    }
    const tx = items[st.target].x + st.lookX, tz = items[st.target].z + (st.lookZ || 0), ty = st.lookY;
    const cx = tx + st.dist * Math.sin(st.az) * Math.cos(st.el), cy = ty + st.dist * Math.sin(st.el), cz = tz - st.dist * Math.cos(st.az) * Math.cos(st.el);
    cam.x = cx; cam.y = Math.max(cy, 3); cam.z = cz;
    const fx = tx - cx, fy = ty - cam.y, fz = tz - cz;
    cam.yaw = Math.atan2(fx, -fz);
    cam.pitch = Math.asin(fy / Math.hypot(fx, fy, fz));
    cam.fovY = (Number(qs.get('fov')) || 40) * D2R;
  };
  // gunaim=yaw,pitch (deg, in the frame of the aircraft: 0 ahead, 90 to starboard, 180 astern): every gun position that can bear there aims there, the others stay at rest
  let aim = qs.get('gunaim') ? qs.get('gunaim').split(',').map((v) => Number(v) * D2R) : null;
  const gunAim = (key) => (aim ? getPlaneModel(key).guns.map((g) => (inArc(g, aim[0], aim[1]) ? { yaw: aim[0], pitch: aim[1] } : { yaw: g.rest[0], pitch: g.rest[1] })) : null);
  engine.hooks.prepare = () => {
    renderer.begin();
    for (const it of items) {
      if (it.plane) {
        const spec = PLANES[it.plane];
        pv.addPlane({
          typeKey: it.plane, x: it.x, y: Number(qs.get('alt')) || 40, z: it.z, heading: st.heading, pitch: (Number(qs.get('pitch')) || 0) * D2R, roll: (Number(qs.get('bank')) || 0) * D2R,
          spin: 0.7, gearDown: qs.get('gear') === '1', fold: Number(qs.get('fold')) || 0, hook: Number(qs.get('hook')) || 0, ordnance: qs.get('ord') !== '0', bay: Number(qs.get('bay')) || 0, inCockpit: qs.get('cockpit') === '1', speed: 70, bank: 0, age: 0, vy: 0, lost: { wingL: qs.get('lost') === 'wing', wingR: false, tail: qs.get('lost') === 'tail', engine: false, engines: qs.get('eng') ? qs.get('eng').split(',').map((v) => v === '1') : null },
          engFire: qs.get('efire') && spec.engines ? qs.get('efire').split(',').map(Number) : null,
          gun: gunAim(it.plane),
        }, cam, tint, 0.5, 0, 0);
        continue;
      }
      mat4Ship(S, it.x - cam.x, -cam.y + 0.0, it.z - cam.z, st.heading, 0, 0);
      sv.addShip(it.ship, S, tint, Number(qs.get('dmg')) || 0, Number(qs.get('fire')) || 0, 0.3);
    }
    renderer.upload();
  };
  engine.hooks.drawOpaque = (rp) => renderer.draw(rp);
  engine.hooks.drawGlass = (rp) => renderer.drawPanes(rp);
  window.__preview = {
    items, renderer, planes: pv,
    /** set({dist, az, el (deg), lookY, lookX, lookZ, target, heading (deg), gunaim: [yaw, pitch] (deg) | null}) */
    set(o) {
      if (o.dist != null) st.dist = o.dist;
      if (o.az != null) st.az = o.az * D2R;
      if (o.el != null) st.el = o.el * D2R;
      if (o.lookY != null) st.lookY = o.lookY;
      if (o.lookX != null) st.lookX = o.lookX;
      if (o.lookZ != null) st.lookZ = o.lookZ;
      if (o.target != null) st.target = o.target;
      if (o.heading != null) st.heading = o.heading * D2R;
      if (o.gunaim !== undefined) aim = o.gunaim ? o.gunaim.map((v) => v * D2R) : null;
    },
  };
}
