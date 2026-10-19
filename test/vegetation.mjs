// The plants of the islands: node test/vegetation.mjs — where they grow, the meshes of each species at each level of detail, the stamping of a square of ground.
import { Island, Terrain } from '../js/game/sim/terrain.js';
import { scatter, cover, climateOf, SPECIES, SP, STEP } from '../js/game/model/vegetation.js';
import { getTemplate, stampPlants } from '../js/game/model/treeMeshes.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const mk = (o) => new Island({ id: 0, x: 0, z: 0, kind: 'large', seed: 11, r0: 1500, H: 300, e: 1.3, phi: 0.4, pw: 1.1, ridge: 0.8, biome: 'green', ...o });
const names = (rec) => { const c = {}; for (let i = 0; i < rec.length; i += 8) { const n = SPECIES[rec[i + 5] & 7].name; c[n] = (c[n] || 0) + 1; } return c; };

// ---- where they grow ----
const green = [mk({ seed: 11 }), mk({ seed: 12 }), mk({ seed: 13 }), mk({ seed: 14 })];
const trop = green.find((i) => climateOf(i) === 'tropical'), temp = green.find((i) => climateOf(i) === 'temperate');
ok(trop && temp, 'green islands are temperate or tropical');
{
  const is = temp, A = scatter(is, -400, -300, 640), B = scatter(is, -400, -300, 640);
  ok(A.length > 8 * 400 && A.length === B.length && A.every((v, i) => v === B[i]), `the same square gives the same plants (${A.length / 8})`);
  // two halves give the whole
  const h1 = scatter(is, -400, -300, 320).length, h2 = scatter(is, -80, -300, 320).length, h3 = scatter(is, -400, 20, 320).length, h4 = scatter(is, -80, 20, 320).length;
  ok(h1 + h2 + h3 + h4 === A.length, 'a square cut in four holds the same plants as the whole');
  let wet = 0, steep = 0, out = 0, hi = 0;
  const n = A.length / 8;
  for (let i = 0; i < A.length; i += 8) {
    const x = A[i], z = A[i + 2];
    if (x < -400 || x >= 240 || z < -300 || z >= 340) out++;
    if (is.heightAt(x, z) < 0.5) wet++;
    if (A[i + 4] <= 0 || !Number.isFinite(A[i + 1]) || A[i + 6] < 0 || A[i + 6] > 1) steep++;
  }
  ok(wet === 0 && out === 0 && steep === 0, 'no plant in the water or out of its square, sizes and tones are sane');
  const area = 640 * 640;
  ok(area / n > 30 && area / n < 260, `a plant for every ${(area / n).toFixed(0)} m2 of a wooded slope`);
  const c = names(A);
  ok((c.fir || 0) + (c.oak || 0) > n * 0.5 && !c.palm && !c.acacia, `temperate island: oaks and firs (${JSON.stringify(c)})`);
}
{
  const is = trop, A = scatter(is, -300, -200, 640), c = names(A);
  ok((c.jungle || 0) > 0 && !c.fir && !c.acacia, `tropical island: canopy trees (${JSON.stringify(c)})`);
  // palms line the shore: look for the lowest plants
  let lowPalm = 0, low = 0;
  for (let x = -is.R; x < is.R; x += 640) for (let z = -is.R; z < is.R; z += 640) {
    const r = scatter(is, x, z, 640);
    for (let i = 0; i < r.length; i += 8) if (is.heightAt(r[i], r[i + 2]) < 6 && (r[i + 5] & 7) !== SP.BOULDER) { low++; if ((r[i + 5] & 7) === SP.PALM) lowPalm++; }
  }
  ok(low > 20 && lowPalm / low > 0.5, `palms on the beach (${lowPalm} of ${low} plants below 6 m)`);
}
{
  const arid = mk({ seed: 15, biome: 'arid' }), rock = mk({ seed: 16, biome: 'rock' }), vol = mk({ seed: 17, biome: 'volcanic' });
  const dens = (is) => { const r = scatter(is, -300, -300, 640); let n = 0; for (let i = 0; i < r.length; i += 8) if ((r[i + 5] & 7) !== SP.BOULDER) n++; return n; };
  ok(dens(arid) < dens(temp) * 0.5 && dens(rock) < dens(arid) && dens(vol) < dens(arid), `dry, bare and volcanic islands are sparser (${dens(temp)}, ${dens(arid)}, ${dens(rock)}, ${dens(vol)} plants)`);
  ok(climateOf(arid) === 'arid' && climateOf(rock) === 'alpine' && climateOf(vol) === 'volcanic', 'climates follow the biome');
  ok(!('palm' in names(scatter(arid, -300, -300, 640))) && ('shrub' in names(scatter(arid, -300, -300, 640))), 'the arid island has scrub and no palms');
}
{
  const is = temp;
  ok(cover(is, 0, 0, 0.8, 0.05) === 0, 'no cover on the beach');
  ok(cover(is, 0, 0, is.top * 1.2, 0.05) < 0.02, 'no cover above the tree line');
  ok(cover(is, 300, 100, 60, 1.2) === 0, 'no cover on a cliff');
  let best = 0; for (let k = 0; k < 400; k++) best = Math.max(best, cover(is, k * 13, k * 7, 40, 0.1));
  ok(best > 0.7 && best <= 1, `a wooded lowland reaches ${best.toFixed(2)}`);
}

// ---- the meshes ----
const budget = [[12000, 6000], [700, 0], [250, 0], [60, 0]];
let bad = 0, wrong = [];
for (let sp = 0; sp < 8; sp++) for (let v = 0; v < 3; v++) for (let lod = 0; lod < 4; lod++) {
  const t = getTemplate(sp, v, lod, sp === SP.SHRUB && v === 1);
  for (const m of [t.solid, t.cards]) {
    if (!m) continue;
    const f = new Float32Array(m.vertices);
    for (let i = 0; i < m.vertexCount; i++) for (let k = 0; k < 3; k++) if (!Number.isFinite(f[i * 6 + k])) bad++;
    for (const ix of m.indices) if (ix >= m.vertexCount) bad++;
  }
  const tris = t.solid.indexCount / 3, ctris = t.cards ? t.cards.indexCount / 3 : 0;
  if (tris > budget[lod][0] || ctris > budget[lod][1] || (lod > 0 && t.cards)) wrong.push(`${SPECIES[sp].name} v${v} L${lod}: ${tris}+${ctris}`);
  const h = t.solid.aabb[4], H0 = SPECIES[sp].H0;
  if (h < H0 * 0.35 || h > H0 * 1.6) wrong.push(`${SPECIES[sp].name} L${lod} is ${h.toFixed(1)} m high for ${H0}`);
  if (t.solid.aabb[1] < -0.8) wrong.push(`${SPECIES[sp].name} L${lod} goes ${t.solid.aabb[1].toFixed(1)} m under its base`);
}
ok(bad === 0, 'every template vertex is finite and every index is valid');
ok(wrong.length === 0, 'triangle budgets, heights and bases of the 8 species x 3 variants x 4 levels' + (wrong.length ? ': ' + wrong.slice(0, 5).join('; ') : ''));
ok(getTemplate(SP.OAK, 0, 0).cards && !getTemplate(SP.OAK, 0, 1).cards, 'only the nearest level has cards of leaves');
ok(getTemplate(SP.OAK, 0, 0) === getTemplate(SP.OAK, 0, 0), 'templates are built once');
{
  // shared silhouette: the levels are about as tall and as wide
  for (const sp of [SP.OAK, SP.FIR, SP.PALM, SP.JUNGLE]) {
    const t0 = getTemplate(sp, 0, 0), a = t0.solid.aabb, ac = t0.cards ? t0.cards.aabb : a, d = getTemplate(sp, 0, 3).solid.aabb;
    const w0 = Math.max(Math.max(a[3], ac[3]) - Math.min(a[0], ac[0]), Math.max(a[5], ac[5]) - Math.min(a[2], ac[2])), w3 = Math.max(d[3] - d[0], d[5] - d[2]);
    if (!(w3 > w0 * 0.3 && w3 < w0 * 1.7 && d[4] > a[4] * 0.6 && d[4] < a[4] * 1.4)) { ok(false, `${SPECIES[sp].name}: far level is ${w3.toFixed(1)} x ${d[4].toFixed(1)} against ${w0.toFixed(1)} x ${a[4].toFixed(1)}`); }
  }
  ok(true, 'the far levels keep the size of the near one');
}

// ---- stamping ----
{
  const rec = scatter(temp, -300, -200, 160);
  const n = rec.length / 8;
  let total = 0;
  for (let lod = 1; lod <= 3; lod++) {
    const m = stampPlants(rec, -300, -200, lod, {});
    let exp = 0, expI = 0;
    for (let i = 0; i < n; i++) { const t = getTemplate(rec[i * 8 + 5] & 7, ((rec[i * 8 + 5] >> 3) % 3), lod, false).solid; exp += t.vertexCount; expI += t.indexCount; }
    let idxOk = true; for (const ix of m.indices) if (ix >= m.vertexCount) idxOk = false;
    const f = new Float32Array(m.vertices); let fin = true; for (let i = 0; i < m.vertexCount * 6; i++) if (i % 6 < 3 && !Number.isFinite(f[i])) fin = false;
    if (lod === 3) {   // boulders under 1.6 m are left out far away
      ok(m.vertexCount <= exp && m.indexCount <= expI && m.vertexCount > exp * 0.55 && idxOk && fin, `level 3 stamp of ${n} plants: ${m.vertexCount} vertices`);
    } else ok(m.vertexCount === exp && m.indexCount === expI && idxOk && fin, `level ${lod} stamp of ${n} plants: ${m.vertexCount} vertices, ${m.indexCount / 3} triangles`);
    total += m.indexCount;
    ok(m.aabb[0] > -30 && m.aabb[3] < 160 + 30 && m.aabb[2] > -30 && m.aabb[5] < 160 + 30, `level ${lod}: the stamp stays in its square (x ${m.aabb[0].toFixed(0)}..${m.aabb[3].toFixed(0)}, z ${m.aabb[2].toFixed(0)}..${m.aabb[5].toFixed(0)})`);
  }
  const thin = stampPlants(rec, -300, -200, 3, { keep: 0.5 }), full = stampPlants(rec, -300, -200, 3, {});
  ok(thin.vertexCount < full.vertexCount * 0.7 && thin.vertexCount > full.vertexCount * 0.3, 'thinning keeps about the given fraction');
  ok(stampPlants(new Float32Array(0), 0, 0, 1, {}).indexCount === 0, 'an empty square gives an empty mesh');
}

// ---- the whole archipelago of a battle ----
{
  let plants = 0, islands = 0;
  for (const s of [3, 5, 7]) for (const is of Terrain.generate(s, 2, [], null, 16000).islands) { islands++; plants += scatter(is, is.x - 300, is.z - 300, 320).length / 8; }
  ok(islands > 15 && plants > 0, `${islands} islands, ${plants} plants in their middle squares`);
}
