// The wiki and the viewer without a browser: node test/wiki.mjs
// Every ship and aircraft has a record, a tier, statistic sections and silhouettes; the tech-tree layout of each nation places every ship
// once, without overlaps, with its ships of one type chained from the oldest to the newest; the viewer's link format round-trips.
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { SHIPS, AIRCRAFT, NATIONS, TYPES, shipSections, bars, sheetNotes, aircraftSections, fr, describeMounts } from '../js/wiki/data.js';
import { TIERS, tierOf } from '../js/wiki/tiers.js';
import { layoutNation, G } from '../js/wiki/layout.js';
import { shipProfile, aircraftTop } from '../js/wiki/profile.js';
import { fromQuery, toQuery, defaults } from '../js/viewer/state.js';
import { ALL_KEYS, isSubject, framing } from '../js/viewer/subjects.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; process.exitCode = 1; console.log('FAIL', m); } };

// ---- data ----
ok(SHIPS.length === ALL_SHIPS.length && SHIPS.length === 31, 'one record per ship');
ok(fr(48880, 0) === '48 880' && fr(2.5, 1) === '2,5', 'French number format: ' + fr(48880, 0));
ok(tierOf(1927).n === 1 && tierOf(1940).n === 4 && tierOf(1943).n === 6 && tierOf(1999).n === 6, 'tier boundaries');
for (let i = 1; i < TIERS.length; i++) ok(TIERS[i].from === TIERS[i - 1].to + 1, 'tiers are contiguous: ' + TIERS[i].roman);
for (const r of SHIPS) {
  ok(Number.isFinite(r.year) && r.tier, `${r.id}: year and tier`);
  const secs = shipSections(r);
  ok(secs.length >= 6, `${r.id}: statistic sections (${secs.length})`);
  for (const s of secs) for (const row of s.rows) ok(!/undefined|NaN|null/.test(row.v), `${r.id}: "${row.k}" = ${row.v}`);
  ok(bars(r).every((b) => b.v >= 0 && b.v <= 1.0001 && !/NaN/.test(b.text)), `${r.id}: bars`);
  ok(sheetNotes(r).length > 0, `${r.id}: notes`);
  const svg = shipProfile(r.spec);
  ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), `${r.id}: silhouette`);
  ok(!/NaN|undefined/.test(shipProfile(r.spec, { full: true })), `${r.id}: full silhouette`);
}
ok(describeMounts([{ guns: 3 }, { guns: 3 }, { guns: 3 }]) === '3 affûts triples', 'describeMounts: ' + describeMounts([{ guns: 3 }, { guns: 3 }, { guns: 3 }]));
ok(AIRCRAFT.length === 18 + 6 + 6, 'aircraft records (18 carrier types, 6 land-based bombers, 6 floatplanes): ' + AIRCRAFT.length);
for (const a of AIRCRAFT) {
  ok(aircraftSections(a)[0].rows.length >= 5, `${a.key}: rows`);
  ok(!/NaN|undefined/.test(aircraftTop(a.spec)), `${a.key}: top view`);
  ok(isSubject(a.key), `${a.key}: viewer subject`);
}
ok(AIRCRAFT.filter((a) => a.key.startsWith('plane:') && a.role !== 'level').every((a) => a.users.length >= 1), 'every carrier aircraft has a carrier');
ok(AIRCRAFT.filter((a) => a.role === 'level').length === 6 && AIRCRAFT.filter((a) => a.role === 'level').every((a) => a.users.length === 0 && aircraftSections(a)[0].rows.some((r) => r.k === 'Altitude de bombardement')), 'the six bombers have no carrier, and their sheet gives the bombing altitude');

// ---- tech tree ----
for (const compact of [true, false]) {
  for (const n of NATIONS) {
    const L = layoutNation(n.id, { compact });
    const mine = SHIPS.filter((r) => r.nation === n.id);
    ok(L.nodes.length === mine.length, `${n.id}: ${L.nodes.length} nodes for ${mine.length} ships`);
    ok(new Set(L.nodes.map((x) => x.rec.id)).size === L.nodes.length, `${n.id}: a ship is placed twice`);
    ok(L.lanes.length === TYPES.length, `${n.id}: five lanes`);
    ok(compact ? L.cols.length === new Set(mine.map((r) => r.tier.n)).size : L.cols.length === TIERS.length, `${n.id}: columns (${L.cols.length})`);
    for (const a of L.nodes) {
      ok(a.x >= G.rootW && a.x + G.nodeW <= L.width && a.y >= G.headH && a.y + G.nodeH <= L.height, `${n.id}/${a.rec.id}: inside the tree`);
      ok(L.cols[a.col].tier.n === a.rec.tier.n, `${n.id}/${a.rec.id}: in the column of its tier`);
      for (const b of L.nodes) if (a !== b) ok(a.x + G.nodeW <= b.x || b.x + G.nodeW <= a.x || a.y + G.nodeH <= b.y || b.y + G.nodeH <= a.y, `${n.id}: ${a.rec.id} overlaps ${b.rec.id}`);
    }
    // one branch per lane, successors only inside a lane and from an older to a newer ship
    const branches = L.edges.filter((e) => e.kind === 'branch');
    ok(branches.length === L.lanes.filter((l) => l.ships.length).length, `${n.id}: one branch per used lane`);
    for (const e of L.edges.filter((x) => x.kind === 'succ')) {
      const a = L.nodes.find((x) => x.rec.id === e.from_id), b = L.nodes.find((x) => x.rec.id === e.to_id);
      ok(a.rec.type === b.rec.type && a.col <= b.col, `${n.id}: succession ${e.from_id} -> ${e.to_id}`);
    }
  }
}

// ---- viewer link ----
ok(ALL_KEYS.length === 31 + 30, 'viewer subjects: ' + ALL_KEYS.length);
for (const k of ALL_KEYS) ok(isSubject(k) && framing(k).dist > 0, `${k}: subject and framing`);
const st = defaults('yamato');
Object.assign(st, { az: 123.4, el: -10.2, dist: 456.7, tx: 12, light: 'coucher', ocean: false, damage: 'ruin', train: 35, parked: 3 });
const q = toQuery(st);
const back = fromQuery(new URLSearchParams(q.toString()));
for (const k of ['subject', 'az', 'el', 'dist', 'tx', 'light', 'ocean', 'damage', 'train', 'parked']) ok(Math.abs(back[k] - st[k]) < 0.06 || back[k] === st[k], `link round trip: ${k} ${back[k]} vs ${st[k]}`);
ok(toQuery(defaults('iowa')).toString() === 'm=iowa', 'a default view is just the subject: ' + toQuery(defaults('iowa')));
ok(fromQuery(new URLSearchParams('m=nonsense&dm=zzz&l=zzz')).subject === 'iowa', 'bad subject falls back');
ok(fromQuery(new URLSearchParams('m=plane:sbd&dm=ruin')).damage === 'none', 'damage only applies to ships');

console.log(fail ? `wiki test: ${fail} failures` : 'wiki test ok');
