// Finding one's way in the interface: node test/ui.mjs — the line that says what the camera shows, the area and the scale bar of the map.
import { captionOf } from '../js/game/ui/caption.js';
import { niceLength, mapExtent } from '../js/game/ui/minimap.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const iowa = { name: 'USS Iowa', team: 0, state: 'afloat', x: 0, z: 0 }, yamato = { name: 'IJN Yamato', team: 1, state: 'afloat', x: 12000, z: 0 };
iowa.cmd = { main: { target: yamato } };
const zero = { spec: { name: 'A6M2 Zero' }, team: 1 }, hellcat = { spec: { name: 'F6F Hellcat' }, team: 0 };
const rig = (o) => ({ mode: 'auto', auto: { sub: 'follow' }, target: iowa, plane: null, flock: null, versus: null, baseShot: null, ...o });
const txt = (c) => c.parts.map((p) => p.text).join(' ');

let c = captionOf(rig({}));
ok(c.mode === 'Auto' && c.shot === 'Poursuite' && txt(c) === 'USS Iowa' && c.parts[0].team === 0, `the automatic camera on one ship: "${c.mode} · ${c.shot} ${txt(c)}"`);
c = captionOf(rig({ auto: { sub: 'versus' }, versus: { ship: iowa } }));
ok(c.shot === 'Duel' && txt(c) === 'USS Iowa contre IJN Yamato' && c.parts[2].team === 1, `a duel names both ships: "${txt(c)}"`);
c = captionOf(rig({ auto: { sub: 'dogfight' }, flock: { hunter: hellcat, prey: zero } }));
ok(c.shot === 'Combat aérien' && txt(c) === 'F6F Hellcat contre A6M2 Zero', `a dogfight names both aircraft: "${txt(c)}"`);
c = captionOf(rig({ auto: { sub: 'attack' }, flock: { ship: yamato, planes: [hellcat, { ...hellcat, dying: true }, hellcat] } }));
ok(txt(c) === '2 avions sur IJN Yamato', `an air attack counts the aircraft still flying: "${txt(c)}"`);
c = captionOf(rig({ auto: { sub: 'formation' }, flock: { planes: [zero, zero, zero] } }));
ok(txt(c) === '3 × A6M2 Zero' && c.parts[0].team === 1, `a formation: "${txt(c)}"`);
c = captionOf(rig({ auto: { sub: 'base' }, baseShot: { base: null } }));
ok(c.shot === 'Base' && c.parts.length === 1, 'the ruins of a base without a base still say something');
c = captionOf(rig({ mode: 'free' }));
ok(c.mode === 'Libre' && c.hint && /ZQSD/.test(c.hint), 'the free camera says how to move it');
c = captionOf(rig({ mode: 'cockpit', plane: null }));
ok(c.mode === 'Cockpit' && txt(c) === 'aucun avion en vol', 'the cockpit with no aircraft in the air says so');
c = captionOf(rig({ mode: 'bridge' }));
ok(c.mode === 'Passerelle' && txt(c) === 'USS Iowa', 'a ship camera names the ship');

ok(niceLength(1730) === 1000 && niceLength(2600) === 2000 && niceLength(7400) === 5000 && niceLength(380) === 200, 'the scale bar is a round length');
const e = mapExtent([iowa, yamato]);
ok(Math.abs(e.x - 6000) < 1 && e.r > 6000 && e.r < 10000, `the map holds both fleets (centre ${e.x.toFixed(0)} m, radius ${e.r.toFixed(0)} m)`);
ok(mapExtent([{ ...iowa, state: 'sunk' }, yamato]).x === 12000, 'a sunk ship is left out of the map area');
ok(Math.abs(mapExtent([iowa, yamato], 2).r - e.r / 2) < 1, 'zooming in halves the area');

// ---- the reload gauges (ui/reloads.js): one cell per mount, filling while it reloads ----
{
  const { World } = await import('../js/game/sim/world.js');
  const { reloadGroups, mountState } = await import('../js/game/ui/reloads.js');
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const a = w.addShip('graf_spee', 0, 0, 0, 0), e = w.addShip('fletcher', 1, 9000, 0, Math.PI);
  w.start();
  let g = reloadGroups(a, w);
  const nMounts = a.mounts.length, nCells = g.filter((q) => q.kind === 'main' || q.kind === 'sec').reduce((n, q) => n + q.cells.length, 0);
  ok(nCells === nMounts && g[0].kind === 'main' && g[0].cells.length === 2 && /Principale 283/.test(g[0].title), `a cell for each of the ${nMounts} mounts, the main battery first (${g.map((q) => q.title).join(' · ')})`);
  ok(g.some((q) => q.kind === 'torp' && q.cells[0].sub === '8/8') && g.filter((q) => q.kind === 'sec').length === 2, 'the 15 cm and the 10.5 cm are two groups, the torpedo tubes have their cell');
  let sawReload = false, ready = false, sec = 0, fracBefore = 0;
  for (let t = 0; t < 120; t += 0.1) {
    w.update(0.1); w.drainEvents();
    const m = a.mounts.find((q) => q.group === 'main'), st = mountState(m);
    if (st.state === 'reload' && !sawReload) { sawReload = true; sec = st.sec; fracBefore = st.frac; }
    if (sawReload && st.state === 'ready') { ready = true; break; }
  }
  ok(sawReload && ready && sec > 0 && fracBefore >= 0 && fracBefore < 1, `a mount that has fired shows its reload (${sec.toFixed(1)} s left, ${Math.round(fracBefore * 100)} % loaded) and then PRÊT`);
  const m0 = a.mounts[0]; m0.alive = false;
  ok(mountState(m0).state === 'dead', 'a destroyed mount shows a cross');
  m0.alive = true; m0.jam = 3;
  ok(mountState(m0).state === 'jam', 'a jammed mount is flagged');
  const ad = new World(1); ad.addTeam(0); ad.addTeam(1);
  const adams = ad.addShip('adams', 0, 0, 0, 0); ad.start();
  const gm = reloadGroups(adams, ad).filter((q) => q.kind === 'missile');
  ok(gm.length === 2 && gm[0].cells[0].sub === '42' && gm[1].cells[0].sub === '8', 'the missile systems show their stock (42 Tartar, 8 ASROC)');
}
