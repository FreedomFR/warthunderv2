// Tech-tree layout of one nation (pure functions, no DOM): tiers in columns (left = oldest), the five ship types in rows (lanes),
// a ship in the cell of its tier and its type. Ships of the same type are chained from the oldest to the newest ("successor" links);
// the first ship of every lane hangs from the nation's root through a common trunk.
import { TYPES, nationShips } from './data.js';
import { TIERS } from './tiers.js';

export const G = { rootW: 150, cellW: 204, cellH: 128, nodeW: 180, nodeH: 110, headH: 68, pad: 8 };

/**
 * layoutNation(nationId, { compact }) -> { cols, lanes, nodes, edges, width, height }
 *   compact (default): only the tiers in which the nation has a ship get a column.
 *   cols:  [{ tier, x }]            lanes: [{ type, row, rows, y }]
 *   nodes: [{ rec, col, row, x, y }] (x, y: top-left corner)
 *   edges: [{ kind: 'trunk' | 'branch' | 'succ', from: {x, y}, to: {x, y}, type }] (points on node borders)
 */
export function layoutNation(nationId, { compact = true } = {}) {
  const ships = nationShips(nationId);
  const used = new Set(ships.map((r) => r.tier.n));
  const tiers = TIERS.filter((t) => !compact || used.has(t.n));
  const colOf = new Map(tiers.map((t, i) => [t.n, i]));
  const cols = tiers.map((t, i) => ({ tier: t, x: G.rootW + i * G.cellW }));

  // lanes: one row per type, taller when a tier holds several ships of that type
  const lanes = [];
  let row = 0;
  for (const type of TYPES) {
    const inLane = ships.filter((r) => r.type === type.id).sort((a, b) => a.tier.n - b.tier.n || a.year - b.year || a.spec.displacementStd - b.spec.displacementStd);
    const perTier = new Map();
    for (const r of inLane) perTier.set(r.tier.n, (perTier.get(r.tier.n) || 0) + 1);
    const rows = Math.max(1, ...perTier.values());
    lanes.push({ type: type.id, name: type.name, row, rows, ships: inLane, y: G.headH + row * G.cellH });
    row += rows;
  }

  const nodes = [];
  for (const lane of lanes) {
    const slot = new Map();
    for (const rec of lane.ships) {
      const k = slot.get(rec.tier.n) || 0;
      slot.set(rec.tier.n, k + 1);
      const col = colOf.get(rec.tier.n), r = lane.row + k;
      nodes.push({ rec, col, row: r, type: lane.type, x: cols[col].x + (G.cellW - G.nodeW) / 2, y: G.headH + r * G.cellH + (G.cellH - G.nodeH) / 2 });
    }
  }

  const height = G.headH + row * G.cellH + G.pad;
  const width = G.rootW + cols.length * G.cellW + G.pad;
  const root = { x: 8, y: 8, w: G.rootW - 16, h: 52 };           // the nation's card, in the header band
  const trunkX = G.rootW - 14;

  const edges = [];
  for (const lane of lanes) {
    const chain = nodes.filter((n) => n.type === lane.type).sort((a, b) => a.col - b.col || a.row - b.row);
    chain.forEach((n, i) => {
      const mid = n.y + G.nodeH / 2;
      if (i === 0) edges.push({ kind: 'branch', type: lane.type, from: { x: trunkX, y: mid }, to: { x: n.x, y: mid }, to_id: n.rec.id });
      else {
        const p = chain[i - 1];
        edges.push({ kind: 'succ', type: lane.type, from: { x: p.x + G.nodeW, y: p.y + G.nodeH / 2 }, to: { x: n.x, y: mid }, from_id: p.rec.id, to_id: n.rec.id });
      }
    });
  }
  if (nodes.length) {
    const ys = edges.filter((e) => e.kind === 'branch').map((e) => e.from.y);
    edges.push({ kind: 'trunk', from: { x: trunkX, y: root.y + root.h }, to: { x: trunkX, y: Math.max(...ys) } });
  }
  return { cols, lanes, nodes, edges, root, trunkX, width, height };
}
