// The look of the bases: node test/basemesh.mjs — the models of the layouts of several seeds and nations build, every building has an intact and a ruined mesh,
// the vertices are finite and where the base is, the triangle counts are sane, the radars have an antenna that turns, and BaseVisuals queues what it should; then the ports of a theatre of war (pier, warehouses, dockyards, quay cranes).
import { Terrain } from '../js/game/sim/terrain.js';
import { BaseState } from '../js/game/sim/bases.js';
import { teamStart } from '../js/game/sim/formation.js';
import { buildBaseModel, orientPart, clearBaseCaches } from '../js/game/model/baseMesh.js';
import { BASE_PAL } from '../js/game/model/baseKit.js';
import { gunMountSpec } from '../js/game/model/baseGuns.js';
import { getMountModel } from '../js/game/model/mounts.js';
import { BaseVisuals } from '../js/game/render/baseVisual.js';
import { VERTEX_STRIDE } from '../js/game/model/meshbuilder.js';
import { THEATRE } from '../js/game/data/theatre.js';

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
let flakGuns = 0, flakBad = 0, heavyGuns = 0, heavyBad = 0;
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
    for (const g of L.guns) if (g.kind === 'aa' && g.cal === 20 && g.n >= 4) { flakGuns++; if (!gunMountSpec(g, BASE_PAL[L.nation]).look) flakBad++; }
    for (const g of L.guns) if (g.kind === 'aa' && g.cal >= 80) { heavyGuns++; if (gunMountSpec(g, BASE_PAL[L.nation]).look !== 'flak/flak88') heavyBad++; }
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
ok(heavyGuns > 0 && heavyBad === 0, `the 8.8 cm guns of the German bases (${heavyGuns}) are the Flak 36 of the reference model`);
ok(flakGuns > 0 && flakBad === 0, `the quadruple 20 mm guns of the bases (${flakGuns}: the German fields and the Italian ones) are the Flakvierling of the reference model`);
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

// the ports of a theatre of war: both sizes, all six nations
{
  const nations = Object.entries(THEATRE.nations).map(([nation, n]) => ({ nation, team: n.side, home: n.home, ports: 2, batteries: 0 }));
  const T = Terrain.generateTheatre(1, THEATRE, { nations });
  const ports = T.bases.filter((q) => q.kind === 'port');
  const sizes = new Set(ports.map((q) => q.size)), seen = new Set(ports.map((q) => q.nation));
  ok(ports.length >= 8 && sizes.size === 2 && seen.size >= 4, `the theatre has ${ports.length} ports of ${seen.size} nations, both sizes`);
  const badP = [], kindsP = new Set();
  let sheds = 0, shedsToSea = 0, cranes = 0, craneSides = 0, jibs = 0, piles = 0, pierOk = 0, reachOk = 0, flatP = 0, ruinsP = 0;
  for (const L of ports) {
    const M = buildBaseModel(L, L.nation, { biome: T.islands.find((q) => q.id === L.island).biome, heightAt: (x, z) => T.heightAt(x, z) });
    for (const k of ['ground', 'groundFine', 'deco', 'decoFine']) if (!M[k]) badP.push(`${L.id} has no ${k}`);
    const bb = {};
    for (const k of ['ground', 'groundFine', 'deco', 'decoFine']) if (M[k]) bb[k] = check(M[k], `port ${L.id} ${k}`, badP).bb;
    const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    const head = (L.pier.x1 - L.x) * ca + (L.pier.z1 - L.z) * sa;
    // the pier: the deck reaches the head, the piles go down under the sea, the flat work stays a few centimetres above the deck
    if (bb.deco && bb.deco[3] >= head - 1) pierOk++;
    if (bb.deco && bb.deco[1] < -L.pier.y - 5) piles++;
    if (bb.ground && bb.ground[4] < 0.5 && bb.ground[1] >= 0) flatP++;
    if (M.radius > head + 10 && L.moorings.every((m) => Math.hypot(m.x - L.x, m.z - L.z) < M.radius)) reachOk++;
    L.parts.forEach((p, i) => {
      const e = M.parts[i], g = e.mesh.groups;
      kindsP.add(p.kind);
      if (['warehouse', 'dockyard', 'crane'].includes(p.kind)) {
        if (!g.body || !g.body_ruin || !g.body.indexCount || !g.body_ruin.indexCount) badP.push(`${p.kind} ${L.id}/${i} lacks a mesh`); else ruinsP++;
        for (const [name, m] of Object.entries(g)) check(m, `port ${L.id} ${p.kind} ${name}`, badP);
      }
      if (p.kind === 'warehouse') {                  // the doors face the sea: the canonical +z side points along +s
        sheds++;
        const dl = e.heading - L.heading, door = -Math.sin(dl);
        if (door > 0.9) shedsToSea++;
      }
      if (p.kind === 'crane') {
        cranes++;
        const t = -(p.x - L.x) * sa + (p.z - L.z) * ca;
        const sp = g.spin ? check(g.spin, `port ${L.id} crane spin`, badP).bb : null;
        if (sp && e.spin && e.spin.swing > 0 && e.spin.rate > 0) jibs++;
        // at rest the jib points over the side of the pier the crane stands on
        if (sp && (t < 0 ? sp[2] < -15 && sp[5] < 8 : sp[5] > 15 && sp[2] > -8)) craneSides++;
      }
    });
  }
  ok(badP.length === 0, 'every vertex of the ports is finite, with a unit normal and a valid index' + (badP.length ? ': ' + badP.slice(0, 4).join('; ') : ''));
  ok(['warehouse', 'dockyard', 'crane', 'tank', 'depot', 'barracks', 'radar', 'tower'].every((k) => kindsP.has(k)) && ruinsP >= ports.length * 4, `every kind of building of a port is modelled, with a ruin (${[...kindsP].join(', ')})`);
  ok(pierOk === ports.length && piles === ports.length, `the pier reaches the head and its piles go down into the sea (${pierOk} / ${piles} of ${ports.length})`);
  ok(flatP === ports.length, `the flat work of the ports lies within half a metre of the yard (${flatP} of ${ports.length})`);
  ok(reachOk === ports.length, 'the model of a port takes in the pier and the anchorage (for the culling)');
  ok(sheds > 0 && shedsToSea === sheds, `the warehouses turn their doors to the quay (${shedsToSea} of ${sheds})`);
  ok(cranes > 0 && craneSides === cranes && jibs === cranes, `the quay cranes have a jib over their own side that swings (${craneSides} / ${jibs} of ${cranes})`);
  // BaseVisuals draws a port: the cranes swing with time, a ruined part draws its ruin
  const calls = [];
  const r = { createMesh: (b, label) => ({ b, label }), releaseMesh() {}, setPaint() {}, setCasting() {}, add: (mesh, mat, tint, dmg, fire) => calls.push({ label: mesh.label, m: Array.from(mat), dmg, fire }) };
  const bv = new BaseVisuals(r, { sphereVisible: () => true });
  bv.set(T);
  const k = T.bases.findIndex((q) => q.kind === 'port' && q.size === 'large'), L = T.bases[k];
  const states = T.bases.map((q) => new BaseState(q)), cam = { x: L.x - 300, y: L.y + 120, z: L.z - 300 };
  const run = (time) => { calls.length = 0; bv.add(cam, states, { time }); return calls.filter((c) => c.label.includes('crane spin')); };
  const c1 = run(3), c2 = run(9);
  const nCranes = T.bases.reduce((n, q) => n + q.parts.filter((c) => c.kind === 'crane').length, 0);
  ok(c1.length === nCranes && c1.some((c, i) => c.m.some((v, q) => Math.abs(v - c2[i].m[q]) > 1e-3)), 'the jibs of the quay cranes swing with time');
  const iCrane = L.parts.findIndex((q) => q.kind === 'crane');
  states[k].partState[iCrane] = 2;
  run(3);
  ok(calls.some((c) => c.label === 'base crane ruin') && run(3).length === c1.length - 1, 'a destroyed crane draws its ruin and no jib');
  bv.set(null);
}
