// The look of the bases: node test/basemesh.mjs — the models of the layouts of several seeds and nations build, every building has an intact and a ruined mesh,
// the vertices are finite and where the base is, the triangle counts are sane, the radars have an antenna that turns, and BaseVisuals queues what it should.
import { Terrain } from '../js/game/sim/terrain.js';
import { BaseState } from '../js/game/sim/bases.js';
import { teamStart } from '../js/game/sim/formation.js';
import { buildBaseModel, orientPart, clearBaseCaches } from '../js/game/model/baseMesh.js';
import { BASE_PAL } from '../js/game/model/baseKit.js';
import { getMountModel } from '../js/game/model/mounts.js';
import { BaseVisuals } from '../js/game/render/baseVisual.js';
import { VERTEX_STRIDE } from '../js/game/model/meshbuilder.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const NATIONS = Object.keys(BASE_PAL);

/** Check one packed mesh: finite vertices (positions, normals, colours), valid indices; returns { tris, bb: [x0, y0, z0, x1, y1, z1] }. */
function check(m, label, bad) {
  const dv = new DataView(m.vertices);
  const n = m.vertexCount;
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = i * VERTEX_STRIDE;
    for (let k = 0; k < 3; k++) {
      const v = dv.getFloat32(o + k * 4, true);
      if (!Number.isFinite(v) || Math.abs(v) > 5000) { bad.push(label + ': vertex ' + i); return { tris: 0, bb }; }
      if (v < bb[k]) bb[k] = v; if (v > bb[k + 3]) bb[k + 3] = v;
    }
    let l = 0;
    for (let k = 0; k < 3; k++) { const v = dv.getInt16(o + 12 + k * 2, true) / 32767; l += v * v; }
    if (!(l > 0.8 && l < 1.2)) { bad.push(label + ': normal ' + i + ' ' + l.toFixed(2)); return { tris: 0, bb }; }
  }
  for (let i = 0; i < m.indices.length; i++) if (m.indices[i] >= n) { bad.push(label + ': index ' + i); break; }
  return { tris: m.indexCount / 3, bb };
}

const make = (seed, dens, level, nat) => {
  const sep = 12000, starts = [0, 1].map((i) => ({ ...teamStart(i, 2, sep), nation: nat[i] }));
  const keep = starts.map((q) => ({ x: q.x, z: q.z, r: 4800 }));
  return Terrain.generate(seed, dens, keep, [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: level, starts });
};

let nBases = 0, nParts = 0, nGuns = 0;
const bad = [], missing = [], big = [], kinds = new Set();
let worstBase = 0, worstPart = 0, worstGround = 0, groundHigh = 0, radars = 0, spinning = 0, badAngle = 0, flat = 0;
const t0 = Date.now();
for (let seed = 1; seed <= 8; seed++) {
  const level = 1 + (seed % 2), nat = [NATIONS[seed % 6], NATIONS[(seed + 3) % 6]];
  const T = make(seed, 2, level, nat);
  for (const L of T.bases) {
    const is = T.islands.find((q) => q.id === L.island);
    const M = buildBaseModel(L, L.nation, { biome: is.biome });
    nBases++;
    let tris = 0;
    for (const k of ['ground', 'groundFine', 'deco', 'decoFine']) {
      if (!M[k]) { if (k === 'ground' && L.kind === 'airfield') missing.push('ground of base ' + L.id); continue; }
      const r = check(M[k], `${seed}/${L.id} ${k}`, bad);
      tris += r.tris;
      if (k === 'ground') { worstGround = Math.max(worstGround, r.tris); groundHigh = Math.max(groundHigh, r.bb[4]); if (r.bb[4] > 0.5 || r.bb[1] < 0) flat++; }
    }
    if (M.parts.length !== L.parts.length || M.guns.length !== L.guns.length) missing.push('entries of base ' + L.id);
    L.parts.forEach((p, i) => {
      const e = M.parts[i];
      kinds.add(p.kind);
      nParts++;
      const g = e.mesh.groups;
      if (!g.body || !g.body_ruin || !g.body.indexCount || !g.body_ruin.indexCount) missing.push(`${p.kind} ${seed}/${L.id}/${i}: ${Object.keys(g)}`);
      for (const [name, m] of Object.entries(g)) {
        const r = check(m, `${seed}/${L.id} ${p.kind} ${name}`, bad);
        if (name === 'body') worstPart = Math.max(worstPart, r.tris);
        // the building stays in its box (the bund of a tank and the banks of a magazine reach a little further)
        if (name === 'body' && (Math.abs(r.bb[0]) > p.w + p.l || Math.abs(r.bb[3]) > p.w + p.l || r.bb[1] < -3 || r.bb[4] > p.h * 1.6 + 8)) bad.push(`${p.kind} ${seed}/${L.id}/${i} leaves its box ${r.bb.map((v) => v.toFixed(1))}`);
      }
      if (p.kind === 'radar') { radars++; if (g.spin && e.spin && e.spin.rate > 0) spinning++; }
      const o = orientPart(p, L);
      if (Math.abs(Math.sin(o.a * 2)) > 1e-6) badAngle++;
      tris += (g.body ? g.body.indexCount / 3 : 0) + (g.fine ? g.fine.indexCount / 3 : 0);
    });
    L.guns.forEach((q, i) => {
      const e = M.guns[i];
      nGuns++;
      const mm = getMountModel(e.mount);
      if (!mm.house || !mm.guns || !(mm.trunnion[1] > 0)) missing.push(`gun mount ${q.kind} ${seed}/${L.id}/${i}`);
      if (!e.body.groups.body) missing.push(`gun emplacement ${seed}/${L.id}/${i}`);
      for (const [name, m] of Object.entries(e.body.groups)) check(m, `${seed}/${L.id} gun ${name}`, bad);
      tris += (e.body.groups.body.indexCount + (e.body.groups.fine ? e.body.groups.fine.indexCount : 0)) / 3;
    });
    worstBase = Math.max(worstBase, tris);
    if (tris > 150000) big.push(`base ${seed}/${L.id}: ${tris} triangles`);
  }
}
ok(nBases >= 20 && nParts > 100 && nGuns > 60, `built ${nBases} bases, ${nParts} buildings and ${nGuns} guns of ${NATIONS.length} nations in ${Date.now() - t0} ms`);
ok(bad.length === 0, 'every vertex is finite, in range, with a unit normal, and every index is valid' + (bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''));
ok(missing.length === 0, 'every building has an intact and a ruined mesh, every gun a mount and an emplacement' + (missing.length ? ': ' + missing.slice(0, 4).join('; ') : ''));
ok(['hangar', 'tower', 'tank', 'barracks', 'radar', 'depot', 'bunker', 'post'].every((k) => kinds.has(k)), 'every kind of building is modelled (' + [...kinds].join(', ') + ')');
ok(worstBase < 150000 && big.length === 0, `triangle counts are sane (worst base ${worstBase}, worst building ${worstPart}, ground ${worstGround})`);
ok(flat === 0 && groundHigh < 0.5, `the flat work lies within half a metre of the ground (highest ${groundHigh.toFixed(2)} m)`);
ok(radars > 0 && spinning === radars, `the antenna of every radar is a separate mesh that turns (${spinning} of ${radars})`);
ok(badAngle === 0, 'buildings are turned by whole quarter turns');

// a base is the same twice, and another nation is painted differently
{
  const T = make(5, 2, 2, ['USA', 'Japan']);
  const L = T.bases.find((q) => q.kind === 'airfield');
  clearBaseCaches();
  const a = buildBaseModel(L, 'USA'), b = buildBaseModel(L, 'USA');
  clearBaseCaches();
  const c = buildBaseModel(L, 'Japan');
  const same = (x, y) => Buffer.compare(Buffer.from(x.vertices), Buffer.from(y.vertices)) === 0;
  ok(same(a.ground, b.ground) && same(a.parts[0].mesh.groups.body, b.parts[0].mesh.groups.body), 'the same layout gives the same meshes');
  ok(!same(a.parts[0].mesh.groups.body, c.parts[0].mesh.groups.body), 'another nation is painted another way');
  ok(a.radius > 300 && a.ref === L.pads[0].y, 'the model knows its radius and the height of its pad');
}

// BaseVisuals with a stand-in renderer: what is queued for intact, damaged and destroyed parts, for guns that move, and for aircraft in the slots
{
  const T = make(3, 2, 2, ['USA', 'Japan']);
  const calls = [];
  const r = {
    createMesh: (b, label) => ({ b, label }), releaseMesh() {}, setPaint() {}, setCasting() {},
    add: (mesh, mat, tint, dmg, fire) => calls.push({ label: mesh.label, m: Array.from(mat), dmg, fire }),
  };
  const eng = { sphereVisible: () => true };
  const bv = new BaseVisuals(r, eng);
  bv.planes = { get: () => ({ pm: { groundY: 1.2 } }), addParts: (m, M) => calls.push({ label: 'plane', m: Array.from(M) }) };
  bv.set(T);
  ok(bv.items.length === T.bases.length, 'one set of meshes per base');
  const L = T.bases.find((q) => q.kind === 'airfield');
  const k = T.bases.indexOf(L);
  const states = T.bases.map((q) => new BaseState(q));
  const cam = { x: L.x + 400, y: L.y + 120, z: L.z - 300 };
  const run = () => { calls.length = 0; bv.add(cam, states, { teams: [{ rgb: [200, 40, 40] }, { rgb: [40, 40, 200] }], time: 12 }); return calls.slice(); };
  const base = run();
  const count = (list, s) => list.filter((c) => c.label.includes(s)).length;
  ok(base.length > 30 && count(base, 'ground') >= 1 && count(base, 'hangar') >= 4 && count(base, 'tower') >= 1, `an intact airfield queues ${base.length} instances: the ground, the hangars, the tower`);
  ok(count(base, 'ruin') === 0 && count(base, 'spin') >= 1, 'no ruin is drawn while everything stands, the radar antenna is');
  const st = states[k];
  st.partState[0] = 2; st.partState[1] = 1; st.guns[0].alive = false; st.guns[1].train = 1.2; st.guns[1].recoil = 0.8; st.guns[2].elev = 0.9;
  st.parked[0] = 'sbd'; st.parked[1] = 'tbf';
  const hit = run();
  ok(count(hit, 'hangar ruin') === 1 && count(hit, 'hangar') === count(base, 'hangar') + 0 && hit.some((c) => c.label.includes('hangar') && !c.label.includes('ruin') && c.dmg > 0 && c.fire > 0), 'a destroyed part draws its ruin, a damaged one its scorched mesh');
  ok(count(hit, 'plane') === 2, 'aircraft parked in the slots are drawn');
  const rad = hit.filter((c) => c.label.includes('spin')), rad2 = (() => { cam.x += 0; calls.length = 0; bv.add(cam, states, { time: 13 }); return calls.filter((c) => c.label.includes('spin')); })();
  ok(rad.length > 0 && rad.length === rad2.length && rad.some((c, i) => c.m.some((v, q) => Math.abs(v - rad2[i].m[q]) > 1e-3)), 'the radar antennas turn with time');
  const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  const before = base.filter((c) => c.label.includes('gun')), after = hit.filter((c) => c.label.includes('gun'));
  ok(before.length > 0 && after.length > 0 && after.some((c, i) => !before[i] || !same(c.m, before[i].m)), 'the guns follow their train, elevation and recoil');
  bv.set(null);
  ok(bv.items.length === 0 && bv.owned.length === 0, 'the meshes are released');
}
