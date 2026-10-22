// Volume audit of every gun house and light AA mount: node tools/audit/overlap.mjs [ship,...] [-v]
// Each house (the box of the mesh that is drawn, turned as it stands at rest, see model/layout.js) is sampled every 0.35 m: the points that fall inside a structure, a funnel, a mast or the hull
// above the deck are counted (the part of the house that is buried and how deep). It also reports the houses that overlap one another. Prints the worst first;
// exit code 1 when a house is buried deeper than DEPTH or two houses overlap more than the limits below. DETAIL=ship:name prints the structures a house is sunk in.
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';
import { houseBox, buriedIn, obstacles } from '../../js/game/model/layout.js';

const only = (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '').split(',').filter(Boolean);
const verbose = process.argv.includes('-v');
const DEPTH = 1.0;         // m: a corner of a house sunk deeper than this in something is a wall going through it (smaller touches are rounding of the plans)
const TURRET = 0.10;       // a turret is tested at rest (trained ahead): its long rear overhang can touch a tower that it never faces when trained, so only a big share counts
const PAIR = 0.12;         // share of a house inside another house
const STEP = 0.35, FOOT = 1.0;

/** The rows of the audit of one ship: [{ name, share, depth, bug, at, by }] */
export function auditShip(spec) {
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  if (TWEAKS[spec.id]?.bakedHull) return [];                           // a ship drawn from a baked reference mesh: what the model shows cannot collide with itself (its box solids only serve the arcs)
  const solids = obstacles(m.solids), rows = [];
  const items = [...m.mounts.map((r, i) => ({ r, aa: false, name: `${r.group}${r.label ? ':' + r.label : '#' + i}` })), ...m.aaMounts.map((r, i) => ({ r, aa: true, name: `aa#${i}(${r.variant})` }))];
  const boxes = [];
  for (const { r, aa, name } of items) {
    const hb = houseBox(m, r, aa), t = buriedIn(m, r, aa, solids, m.hull, { box: hb, carrier: spec.type === 'CV' });
    boxes.push({ name, r, hb, yaw: aa ? (r.arcC ?? r.yaw0 ?? 0) : (r.arcC || 0) });
    if (t.share > 0.01) rows.push({ name, share: t.share, depth: t.depth, bug: r.group === 'main' ? (t.share > TURRET && t.depth > 0.4) : t.depth > DEPTH, at: `(${r.x.toFixed(1)}, ${r.z.toFixed(1)}) y=${r.y.toFixed(1)}`, by: t.by });
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.abs(a.r.x - b.r.x) > 14 || Math.abs(a.r.z - b.r.z) > 14) continue;
    let inter = 0, na = 0;
    const ca = Math.cos(a.yaw), sa = Math.sin(a.yaw), cb = Math.cos(b.yaw), sb = Math.sin(b.yaw);
    for (let px = a.hb.x0 + STEP / 2; px < a.hb.x1; px += STEP) for (let pz = a.hb.z0 + STEP / 2; pz < a.hb.z1; pz += STEP) for (let py = a.hb.y0 + FOOT; py < a.hb.y1 - 0.05; py += STEP) {
      na++;
      const wx = a.r.x + px * ca - pz * sa, wz = a.r.z + px * sa + pz * ca, wy = a.r.y + py;
      const dx = wx - b.r.x, dz = wz - b.r.z, qx = dx * cb + dz * sb, qz = -dx * sb + dz * cb, qy = wy - b.r.y;
      if (qx >= b.hb.x0 && qx <= b.hb.x1 && qz >= b.hb.z0 && qz <= b.hb.z1 && qy >= b.hb.y0 + FOOT && qy <= b.hb.y1 - 0.05) inter++;
    }
    const share = na ? inter / na : 0;
    if (share > 0.05) rows.push({ name: `${a.name} x ${b.name}`, share, depth: 0, bug: share > PAIR, at: `(${a.r.x.toFixed(1)}, ${a.r.z.toFixed(1)}) y=${a.r.y.toFixed(1)}`, by: 'another house' });
  }
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith('overlap.mjs')) {
  const all = [];
  for (const spec of ALL_SHIPS) {
    if (only.length && !only.includes(spec.id)) continue;
    for (const r of auditShip(spec)) all.push({ ship: spec.id, ...r });
  }
  all.sort((a, b) => b.depth - a.depth || b.share - a.share);
  for (const r of all) if (r.bug || verbose) console.log(`${r.bug ? '!' : ' '} ${r.ship.padEnd(16)} ${r.name.padEnd(28)} ${(r.share * 100).toFixed(0).padStart(3)} % ${r.depth.toFixed(2)} m deep  ${r.at}  in ${r.by}`);
  const bugs = all.filter((r) => r.bug).length;
  console.log(`${bugs} houses sunk deeper than ${DEPTH} m or overlapping, ${all.length} touching something (use -v to list them)`);
  process.exitCode = bugs ? 1 : 0;
}
