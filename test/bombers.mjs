// The land-based bombers (B-17G, G4M1, Lancaster, He 111 H, SM.79, LeO 451): node test/bombers.mjs
// The sheets are checked against the published dimensions, the meshes against the part groups the damage code expects, the performance figures against the
// published ones and against what the take-off and the bombing run need, and the drawing code against a recording renderer.
import { PLANES, planeTypeFor, getPlaneModel, groundY, propsOf, GROUND_PITCH } from '../js/game/model/planes.js';
import { PERF } from '../js/game/sim/airperf.js';
import { presentedArea, airframe } from '../js/game/sim/airhit.js';
import { buildCockpit, cockpitEye, GAUGE } from '../js/game/model/cockpit.js';
import { MAT } from '../js/game/model/meshbuilder.js';
import { PlaneVisuals } from '../js/game/render/aircraftVisual.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// published figures: length, span, height (m), number of engines, bomb load (kg), stated cruise and bombing altitude limits
const REAL = {
  b17: { nation: 'USA', L: 22.66, span: 31.62, H: 5.82, engines: 4, bombKg: 2700 },
  b29: { nation: 'USA', L: 30.18, span: 43.05, H: 9.01, engines: 4, bombKg: 9000 },
  g4m: { nation: 'Japan', L: 19.97, span: 24.89, H: 4.9, engines: 2, bombKg: 800 },
  lancaster: { nation: 'UK', L: 21.13, span: 31.09, H: 6.25, engines: 4, bombKg: 6400 },
  he111: { nation: 'Germany', L: 16.4, span: 22.6, H: 4.0, engines: 2, bombKg: 2000 },
  sm79: { nation: 'Italy', L: 15.62, span: 21.2, H: 4.1, engines: 3, bombKg: 1000 },
  leo451: { nation: 'France', L: 17.17, span: 22.52, H: 5.24, engines: 2, bombKg: 1500 },
};
const keys = Object.keys(REAL);
const verts = (m) => { const dv = new DataView(m.vertices), out = []; for (let i = 0; i < m.vertexCount; i++) out.push([dv.getFloat32(i * 24, true), dv.getFloat32(i * 24 + 4, true), dv.getFloat32(i * 24 + 8, true)]); return out; };

// ---- who flies what ----
{
  const t = ['USA', 'Japan', 'UK', 'Germany', 'France', 'Italy'].map((n) => planeTypeFor(n, 'level'));
  ok(t.join(',') === 'b17,g4m,lancaster,he111,leo451,sm79', 'planeTypeFor(nation, "level"): ' + t.join(', '));
  ok(planeTypeFor('USA', 'dive') === 'sbd' && planeTypeFor('Italy', 'fighter') === 'mc202' && planeTypeFor('Nowhere', 'level') === 'b17', 'the other roles are unchanged, an unknown nation gets the B-17');
  for (const k of keys) {
    const s = PLANES[k], r = REAL[k];
    ok(s.role === 'level' && s.kind === 'mono' && s.nation === r.nation && s.bombKg === r.bombKg && s.engines.length === r.engines && s.hp > 5 && s.mass > 5, `${k}: role level, ${r.engines} engines, ${r.bombKg} kg of bombs, hp ${s.hp}`);
    ok(s.L === r.L && s.span === r.span, `${k}: the sheet gives the published length and span (${s.L} x ${s.span} m)`);
  }
}

// ---- the dimensions of the meshes ----
for (const k of keys) {
  const pm = getPlaneModel(k), r = REAL[k], w = pm.meshes.whole.aabb;
  const L = w[3] - w[0], span = w[5] - w[2];
  ok(Math.abs(L - r.L) / r.L < 0.01, `${k}: the mesh is ${L.toFixed(2)} m long (published ${r.L})`);
  ok(Math.abs(span - r.span) / r.span < 0.005, `${k}: ${span.toFixed(2)} m span (published ${r.span})`);
  ok(Math.abs(w[2] + w[5]) < 0.05, `${k}: symmetric about the centre line`);
  // height standing on its three wheels (nose up by GROUND_PITCH): from the tyres to the highest point
  const gp = PLANES[k].groundPitch ?? GROUND_PITCH, cp = Math.cos(gp), sp = Math.sin(gp);
  let top = -1e9, bot = 1e9;
  for (const [x, y] of [...verts(pm.meshes.whole), ...verts(pm.meshes.gear)]) { const yy = y * cp + x * sp; top = Math.max(top, yy); bot = Math.min(bot, yy); }
  ok((top - bot) / r.H > 0.85 && (top - bot) / r.H < 1.1, `${k}: ${(top - bot).toFixed(2)} m high on its wheels (published ${r.H})`);
  // it stands on its wheels: the tyres and the tail wheel reach the ground the sheet gives, and the belly is clear of it
  const g = pm.meshes.gear.aabb;
  ok(Math.abs(g[1] + groundY(PLANES[k])) < 0.02 && groundY(PLANES[k]) === pm.groundY, `${k}: the wheels touch the ground at ${pm.groundY.toFixed(2)} m under the origin`);
  ok(w[1] + pm.groundY > 0.7, `${k}: ${(w[1] + pm.groundY).toFixed(2)} m between the lowest part of the airframe and the ground`);
}

// ---- the part groups ----
for (const k of keys) {
  const pm = getPlaneModel(k), s = pm.spec, M = pm.meshes, n = s.engines.length;
  const names = ['whole', 'body', 'wingL', 'wingR', 'tail', 'prop', 'gear', 'ordnance', 'bay', 'hull'];
  for (let i = 0; i < n; i++) names.push('eng' + i, 'burn' + i);
  const miss = names.filter((p) => !M[p] || M[p].indexCount < 6);
  ok(miss.length === 0 && !M.hook, `${k}: has every part (${names.length}) and no arrester hook${miss.length ? ' (missing ' + miss.join(', ') + ')' : ''}`);
  const sum = M.body.vertexCount + M.wingL.vertexCount + M.wingR.vertexCount + M.tail.vertexCount;
  ok(sum === M.whole.vertexCount, `${k}: the whole is exactly its body, two wings and tail (${M.whole.vertexCount} vertices, ${M.whole.indexCount / 3} triangles)`);
  let nan = 0;
  for (const p of names) for (const v of verts(M[p])) if (!v.every(Number.isFinite)) nan++;
  ok(nan === 0, `${k}: no NaN in any mesh`);
  // the wings carry the nacelles of their side, the body those of the axis: losing a wing loses its engines
  const wl = M.wingL.aabb, wr = M.wingR.aabb, ez = s.engines.filter((e) => e.z < 0).map((e) => e.z - e.r), er = s.engines.filter((e) => e.z > 0).map((e) => e.z + e.r);
  ok((ez.length === 0 || wl[2] <= Math.min(...ez) + 0.01) && (er.length === 0 || wr[5] >= Math.max(...er) - 0.01) && wl[5] <= 0.3 && wr[2] >= -0.3, `${k}: each wing has the nacelles on its side`);
  // the single propeller has its hub at the origin and the right size, and there is a mount for each engine
  const pa = M.prop.aabb;
  ok(Math.abs(pa[4] - s.prop.r) < 0.25 && pa[3] - pa[0] < (s.v4 ? 0.9 : 0.6) && Math.abs(pa[2] + pa[5]) < s.prop.r * 0.6, `${k}: the propeller (${(pa[4] * 2).toFixed(2)} m across) is built round its hub`);
  const mt = propsOf(s);
  ok(mt.length === n && mt.every((m, i) => Math.abs(m.z - s.engines[i].z) < 1e-9 && Math.abs(m.dir) === 1) && Math.abs(mt.reduce((a, m) => a + m.z, 0)) < 1e-6, `${k}: one propeller mount per engine, symmetric about the centre line, ${mt.map((m) => m.dir).join('/')} the senses of rotation`);
  // the engines are on the wings (clear of the fuselage) except a nose engine
  ok(s.engines.every((e) => e.nose ? e.z === 0 : Math.abs(e.z) > s.fus.r + e.r * 0.6), `${k}: the engines clear the fuselage`);
  // the propeller discs of neighbours do not overlap, nor reach the fuselage
  let clash = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(s.engines[i].z - s.engines[j].z, s.engines[i].y - s.engines[j].y) < s.prop.r * 2 - 0.6 && Math.abs(s.engines[i].d - s.engines[j].d) < 0.5) clash++;
  ok(clash === 0 || s.engines.some((e) => e.nose), `${k}: the propeller discs do not overlap`);
  // the nose cannot be seen from the pilot's seat: the hull starts behind him
  const E = cockpitEye(s), hb = M.hull.aabb;
  ok(hb[3] <= E.x - 0.8 && Math.abs(E.z) > 0.2 && E.z < 0, `${k}: from the pilot's seat (left seat, x ${E.x.toFixed(2)}) the hull starts ${(E.x - hb[3]).toFixed(1)} m behind the eye`);
}

// ---- single-engine types are untouched ----
{
  const sbd = getPlaneModel('sbd');
  ok(!sbd.meshes.bay && !sbd.meshes.hull && !sbd.meshes.eng0 && sbd.meshes.hook && propsOf(sbd.spec).length === 1 && propsOf(sbd.spec)[0].x === 0, 'a Dauntless has no bay, no hull piece and one propeller on the axis, and still its hook');
}

// ---- the figures of performance ----
{
  const bad = [];
  const FIELDS = Object.keys(PERF.sbd);
  for (const k of keys) {
    const f = PERF[k];
    if (!f) { bad.push(k + ' has no figures'); continue; }
    for (const q of FIELDS) if (!(q in f)) bad.push(`${k} lacks ${q}`);
    for (const q of ['bombAlt', 'bombSpeed', 'vs', 'climb', 'ceil', 'runLen', 'landRun']) if (!(f[q] > 0)) bad.push(`${k} lacks ${q}`);
    if (!(f.vc < f.vmax && f.vcl < f.vc && f.va < f.vcl + 3 && f.vto < f.va + 8 && f.vp > f.va && f.vp < f.vc)) bad.push(k + ' speeds out of order');
    if (f.vt !== 0 || f.vd !== 0 || f.vcomb !== 0) bad.push(k + ' neither torpedoes, nor dives, nor fights');
    const cruise = f.vc * 3.6, acc = f.vto * f.vto / (2 * f.runLen);
    if (cruise < 280 || cruise > 420) bad.push(`${k} cruise ${cruise.toFixed(0)} km/h`);
    if (f.bombAlt < 2500 || f.bombAlt > 5000 || f.ceil < f.bombAlt * 1.2) bad.push(`${k} bombs from ${f.bombAlt} m, ceiling ${f.ceil} m`);
    if (f.bombSpeed < f.va * 1.4 || f.bombSpeed > f.vc * 1.02) bad.push(`${k} bombing speed ${f.bombSpeed}`);
    if (f.runLen < 400 || f.runLen > 1200 || acc < 0.7 || acc > 1.8) bad.push(`${k} run ${f.runLen} m, acceleration ${acc.toFixed(2)} m/s2`);
    if (!(f.vs * 1.15 < f.va && f.vs * 1.4 > f.va && f.vto > f.vs * 1.1 && f.vto < f.vs * 1.5)) bad.push(`${k} stall ${f.vs}, approach ${f.va}, lift-off ${f.vto}`);
    if (f.landRun > 800 || f.landRun < 300) bad.push(`${k} landing run ${f.landRun}`);
    // the climb to the bombing altitude takes a believable time (6-25 minutes) at the rate given
    const t = f.bombAlt / f.climb / 60;
    if (t < 6 || t > 25) bad.push(`${k} climbs for ${t.toFixed(0)} minutes`);
  }
  ok(bad.length === 0, `the six bombers have every field of the carrier types and the figures of the level bombing run, in order${bad.length ? ': ' + bad.join('; ') : ''}`);
  ok(PERF.b17.vmax * 3.6 > 465 && PERF.b17.vmax * 3.6 < 480 && Math.abs(PERF.g4m.vmax * 3.6 - 428) < 6 && Math.abs(PERF.lancaster.vmax * 3.6 - 454) < 6 && Math.abs(PERF.leo451.vmax * 3.6 - 495) < 6 && PERF.lancaster.runLen > PERF.g4m.runLen && PERF.sm79.runLen < PERF.b17.runLen, 'top speeds are the published ones (472, 428, 454, 495 km/h), a Lancaster runs longer than a Betty');
}

// ---- the hit volume ----
{
  const a = Object.fromEntries(keys.map((k) => [k, airframe(k)]));
  const p = (k) => ({ typeKey: k, spec: PLANES[k], heading: 0, pitch: 0 });
  const top = Object.fromEntries(keys.map((k) => [k, presentedArea(p(k), 0, -1, 0)]));
  ok(top.b17 > top.he111 * 1.3 && top.lancaster > top.g4m * 1.2 && top.b17 > presentedArea(p('tbf'), 0, -1, 0) * 2.5, `from above a B-17 shows ${top.b17.toFixed(0)} m2, an Avenger ${presentedArea(p('tbf'), 0, -1, 0).toFixed(0)}`);
  ok(a.lancaster.fin > 8 && a.lancaster.fin > a.leo451.fin && Math.abs(a.sm79.wing - 61.7) < 12 && Math.abs(a.b17.wing - 131.9) < 25 && Math.abs(a.lancaster.wing - 120.5) < 20, `twin fins count twice, the wing area is that of the panels (B-17 ${a.b17.wing.toFixed(0)} m2 of 131.9, Lancaster ${a.lancaster.wing.toFixed(0)} of 120.5, SM.79 ${a.sm79.wing.toFixed(0)} of 61.7)`);
}

// ---- the cockpit ----
for (const k of keys) {
  const s = PLANES[k], c = buildCockpit(s), u = new Uint8Array(c.interior.vertices);
  let gauges = 0, rpm = 0;
  for (let i = 0; i < c.interior.vertexCount; i++) if (u[i * 24 + 23] === MAT.GAUGE) { gauges++; if (u[i * 24 + 22] === GAUGE.RPM * 16) rpm++; }
  ok(gauges / 4 >= 9 + 2 * s.engines.length && rpm / 4 === s.engines.length, `${k}: ${gauges / 4} dials, a revolution counter for each of the ${s.engines.length} engines`);
  ok(c.discMounts.length === s.engines.length && c.disc.aabb[3] - c.disc.aabb[0] < 0.01, `${k}: a propeller blur for each engine, built round its hub`);
}

// ---- the drawing: what is sent to the renderer ----
{
  const calls = [];
  const fake = { createMesh: (m, label) => ({ label }), add: (mesh, mat, tint, dmg, fire) => calls.push({ label: mesh.label, dmg, fire }), setCasting() {}, setPaint() {} };
  const pv = new PlaneVisuals(fake), cam = { x: 0, y: 0, z: 0 };
  const draw = (k, o = {}) => { calls.length = 0; pv.addPlane({ typeKey: k, x: 0, y: 500, z: 0, heading: 0, pitch: 0, roll: 0, spin: 1, gearDown: false, ordnance: true, bank: 0, age: 1, speed: 80, vy: 0, lost: { wingL: false, wingR: false, tail: false, engine: false }, ...o }, cam, [200, 200, 200]); return calls.map((c) => c.label.replace(/^\w+ /, '')); };
  const count = (l, name) => l.filter((x) => x === name).length;
  for (const k of keys) {
    const n = PLANES[k].engines.length;
    let l = draw(k);
    ok(l.includes('whole') && count(l, 'prop') === n && !l.includes('bay') && !l.includes('ordnance') && !l.includes('gear'), `${k}: in flight, the aircraft and ${n} propellers; the bombs stay inside the closed bay`);
    l = draw(k, { gearDown: true, bay: 1 });
    ok(l.includes('gear') && l.includes('bay') && l.includes('ordnance'), `${k}: gear down, the bay open: the doors and the load are drawn`);
    l = draw(k, { bay: 1, ordnance: false });
    ok(l.includes('bay') && !l.includes('ordnance'), `${k}: the bombs gone, the doors still open`);
    const lost = { wingL: false, wingR: false, tail: false, engine: false, engines: PLANES[k].engines.map((e, i) => i === 0) };
    l = draw(k, { lost });
    ok(count(l, 'prop') === n - 1, `${k}: engine 0 lost: ${count(l, 'prop')} propellers turn`);
    l = draw(k, { lost: { wingL: true, wingR: false, tail: false, engine: false } });
    const port = PLANES[k].engines.filter((e) => e.z < 0).length;
    ok(!l.includes('whole') && !l.includes('wingL') && l.includes('wingR') && l.includes('tail') && count(l, 'prop') === n - port, `${k}: the port wing lost: its ${port} engine(s) and propeller(s) go with it`);
    l = draw(k, { lost: { wingL: false, wingR: false, tail: false, engine: true } });
    ok(count(l, 'prop') === 0, `${k}: lost.engine stops them all`);
    l = draw(k, { engFire: PLANES[k].engines.map((e, i) => (i === 1 ? 1 : 0)) });
    ok(count(l, 'burn1') === 1 && count(l, 'burn0') === 0, `${k}: a burning engine is drawn charred`);
    l = draw(k, { inCockpit: true });
    // (the blurs of the propellers are drawn by the particles, see-through: the aircraft lists their hubs in pv.discs)
    ok(l.includes('hull') && !l.includes('whole') && !l.includes('body') && !l.includes('prop') && l.includes('wingL') && l.includes('tail') && pv.discs.length === n, `${k}: from the pilot's seat: no nose skin, the hull behind, ${pv.discs.length} propeller blurs, the dials and the yoke`);
  }
  // a single-engine aircraft is drawn as before
  let l = draw('sbd');
  ok(l.includes('whole') && count(l, 'prop') === 1 && !l.includes('burn0'), 'a Dauntless: the aircraft and its propeller');
  l = draw('sbd', { inCockpit: true });
  ok(l.includes('cabin') && !l.includes('whole') && !l.includes('body') && l.includes('tail') && l.includes('wingL') && pv.discs.length === 1 && !l.includes('hull'), 'a Dauntless from the cockpit: the fuselage open over the cockpit, the tail, the wings and one propeller blur');
  // parked on an apron: the propellers are drawn, stopped
  calls.length = 0;
  const M = new Float64Array(16); M[0] = M[5] = M[10] = M[15] = 1;
  pv.addParts(pv.get('he111'), M, [200, 200, 200], 0.5, 0, true);
  const parked = calls.map((c) => c.label.replace(/^\w+ /, ''));
  ok(count(parked, 'prop') === 2 && parked.includes('gear') && parked.includes('whole'), 'a parked bomber has its propellers and its undercarriage');
  calls.length = 0;
  pv.addParts(pv.get('sbd'), M, [200, 200, 200], 0.5, 0, true);
  ok(!calls.some((c) => /prop/.test(c.label)), 'a parked carrier aircraft has none (as before)');
}

process.exit(fail ? 1 : 0);
