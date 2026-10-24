// Data adapter of the wiki: reads the same spec sheets as the game (js/game/data, js/game/model/planes.js) and turns them into
// display records (French labels, number formatting, tiers, statistic sections). Nothing is copied: the wiki never goes out of date.
import { ALL_SHIPS, NATIONS, ALL_NATIONS, TYPES, typeName } from '../game/data/ships.js';
import { PLANES, floatplaneSpec, planeTypesFor } from '../game/model/planes.js';
import { PERF } from '../game/sim/airperf.js';
import { shipName, ROLE_NAMES } from '../viewer/subjects.js';
import { tierOf } from './tiers.js';
import { tntEquivalent, AIR_TORPEDO } from '../game/data/explosives.js';
import { BOMBS, aircraftRadii, FILL } from '../game/data/ordnance.js';
import { loadoutsOf, bombsIn, loadKg } from '../game/data/loadouts.js';
import { FIGHTER_GUNS, GUNS, BELTS, AMMO, beltMean, beltForGun, UNIT } from '../game/data/airguns.js';
import { planeGuns } from '../game/model/planeGuns.js';

const EXPLOSIVE_NAMES = { tnt: 'TNT', hexanite: 'hexanite', hbx: 'HBX', torpex: 'Torpex' };

export { NATIONS, ALL_NATIONS, TYPES, typeName, shipName, ROLE_NAMES };

// ---- number formatting (French) ----
const fmts = new Map();
export function fr(n, d = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  let f = fmts.get(d);
  if (!f) { f = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }); fmts.set(d, f); }
  return f.format(n).replace(/ /g, ' ');
}
const NB = ' ';
const unit = (n, u, d = 1) => (n == null ? '—' : `${fr(n, d)}${NB}${u}`);

// ---- ships ----
// Classes that never entered service: the year shown is the launch (or conversion) year.
const UNFINISHED = {
  graf_zeppelin: { year: 1938, label: 'lancé en 1938', note: 'Lancé le 8 décembre 1938, achevé à environ 85 %, jamais mis en service.' },
  aquila: { year: 1943, label: 'conversion de 1943', note: 'Paquebot Roma transformé en porte-avions (1941-43), jamais achevé.' },
};

const YEARLESS = 1940;

/** Display record of one ship. */
function makeRecord(spec) {
  const u = UNFINISHED[spec.id];
  const year = u ? u.year : spec.commissioned ?? YEARLESS;
  return {
    id: spec.id, spec, nation: spec.nation, type: spec.type, name: shipName(spec.id),
    year, yearLabel: u ? u.label : String(year), unfinished: !!u, unfinishedNote: u ? u.note : '',
    tier: tierOf(year),
  };
}

export const SHIPS = ALL_SHIPS.map(makeRecord);
export const SHIP = Object.fromEntries(SHIPS.map((r) => [r.id, r]));
export const nationShips = (nation) => SHIPS.filter((r) => r.nation === nation);
export const nationInfo = (id) => NATIONS.find((n) => n.id === id);
export const nationBySlug = (s) => NATIONS.find((n) => n.id.toLowerCase() === s);

/** Largest values over the whole roster, for the relative bars of the cards. */
export const MAXIMA = {
  disp: Math.max(...ALL_SHIPS.map((s) => s.displacementStd)),
  loa: Math.max(...ALL_SHIPS.map((s) => s.loa)),
  speed: Math.max(...ALL_SHIPS.map((s) => s.speedKn)),
  caliber: Math.max(...ALL_SHIPS.map((s) => s.main.caliberMm)),
  guns: Math.max(...ALL_SHIPS.map((s) => s.main.gunsTotal)),
  belt: Math.max(...ALL_SHIPS.map((s) => s.armour.beltMm || 0)),
  crew: Math.max(...ALL_SHIPS.map((s) => s.crew)),
};

/** The few figures shown as bars at the top of a ship card. */
export function bars(rec) {
  const s = rec.spec;
  return [
    { label: 'Déplacement', v: s.displacementStd / MAXIMA.disp, text: unit(s.displacementStd, 't', 0) },
    { label: 'Longueur', v: s.loa / MAXIMA.loa, text: unit(s.loa, 'm') },
    { label: 'Vitesse', v: s.speedKn / MAXIMA.speed, text: unit(s.speedKn, 'nœuds') },
    { label: 'Calibre principal', v: s.main.caliberMm / MAXIMA.caliber, text: unit(s.main.caliberMm, 'mm', 0) },
    { label: 'Canons principaux', v: s.main.gunsTotal / MAXIMA.guns, text: fr(s.main.gunsTotal, 0) },
    { label: 'Ceinture blindée', v: (s.armour.beltMm || 0) / MAXIMA.belt, text: s.armour.beltMm ? unit(s.armour.beltMm, 'mm', 0) : 'aucune' },
  ];
}

// ---- helpers for the statistic sections ----
const GUN_NAMES = ['', 'simple', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'];
const plural = (n, one, many) => (n > 1 ? many : one);

/** "3 affûts triples", "2 affûts doubles + 1 affût simple" from a list of { guns } or counts. */
export function describeMounts(list) {
  const by = new Map();
  for (const m of list) by.set(m.guns, (by.get(m.guns) || 0) + (m.n || 1));
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([g, n]) => `${n}${NB}${plural(n, 'affût', 'affûts')} ${GUN_NAMES[g] || g + ' canons'}${n > 1 ? 's' : ''}`).join(' + ');
}

/** Was this value flagged as estimated in the spec sheet? ("armour" marks the whole block, "main.reloadSecPerGun" one field) */
export function isEstimated(spec, path) {
  return (spec.estimated || []).some((e) => {
    const t = (e.match(/^[A-Za-z0-9_.*[\]]+/) || [''])[0].replace(/\[[^\]]*\]/g, '');
    return t === path || path.startsWith(t + '.');
  });
}

const row = (spec, k, v, path) => ({ k, v, est: path ? isEstimated(spec, path) : false });

/** Statistic sections of a ship card: [{ id, title, rows: [{ k, v, est }] }]. Empty rows are left out. */
export function shipSections(rec) {
  const s = rec.spec, sec = [];
  const add = (id, title, rows) => { rows = rows.filter(Boolean).filter((r) => r.v != null && r.v !== ''); if (rows.length) sec.push({ id, title, rows }); };

  add('id', 'Identité', [
    row(s, 'Classe', s.className),
    row(s, 'Navire de référence', s.refShip),
    row(s, rec.unfinished ? 'Statut' : 'Mise en service', rec.unfinished ? rec.unfinishedNote : String(rec.year)),
    row(s, 'Ère', `${rec.tier.roman} · ${rec.tier.name} (${rec.tier.years})`),
    s.classShips && s.classShips.length ? row(s, 'Navires de la classe', `${s.classShips.length}${NB}: ${s.classShips.slice(0, 4).join(', ')}${s.classShips.length > 4 ? '…' : ''}`) : null,
  ]);

  add('dim', 'Dimensions', [
    row(s, 'Longueur hors tout', unit(s.loa, 'm'), 'loa'),
    row(s, 'Longueur à la flottaison', unit(s.lwl, 'm'), 'lwl'),
    row(s, 'Largeur', unit(s.beam, 'm'), 'beam'),
    s.beamWaterline && Math.abs(s.beamWaterline - s.beam) > 0.5 ? row(s, 'Largeur à la flottaison', unit(s.beamWaterline, 'm'), 'beamWaterline') : null,
    row(s, 'Tirant d\'eau', unit(s.draft, 'm'), 'draft'),
    row(s, 'Déplacement standard', unit(s.displacementStd, 't', 0), 'displacementStd'),
    row(s, 'Déplacement en charge', unit(s.displacementFull, 't', 0), 'displacementFull'),
    s.flightDeckLength ? row(s, 'Pont d\'envol', `${fr(s.flightDeckLength, 0)}${NB}m × ${fr(s.flightDeckWidth, 1)}${NB}m`, 'flightDeckLength') : null,
  ]);

  add('prop', 'Propulsion et équipage', [
    row(s, 'Vitesse maximale', `${fr(s.speedKn)}${NB}nœuds (${fr(s.speedKn * 1.852, 0)}${NB}km/h)`, 'speedKn'),
    row(s, 'Puissance', unit(s.shp, 'ch d\'arbre (shp)', 0), 'shp'),
    row(s, 'Rayon d\'action', unit(s.rangeNm, 'milles marins', 0), 'rangeNm'),
    row(s, 'Équipage', unit(s.crew, 'hommes', 0), 'crew'),
  ]);

  const m = s.main;
  add('main', s.type === 'CV' ? 'Artillerie (double emploi)' : 'Artillerie principale', [
    row(s, 'Canons', `${fr(m.gunsTotal, 0)}${NB}× ${fr(m.caliberMm, 1)}${NB}mm (L/${fr(m.boreCalibers, 0)})`),
    row(s, 'Disposition', describeMounts(m.mounts)),
    row(s, 'Obus', unit(m.shellKg, 'kg', 0)),
    row(s, 'Vitesse initiale', unit(m.muzzleVelocityMs, 'm/s', 0)),
    row(s, 'Portée maximale', `${fr(m.maxRangeM / 1000, 1)}${NB}km`, 'main.maxRangeM'),
    row(s, 'Élévation maximale', `${fr(m.maxElevationDeg, 0)}°`),
    row(s, 'Cadence', `${fr(60 / m.reloadSecPerGun, 1)}${NB}coups/min par canon`, 'main.reloadSecPerGun'),
    row(s, 'Rotation des tourelles', `${fr(m.trainRateDegS, 1)}°/s`, 'main.trainRateDegS'),
  ]);

  const secRows = [];
  for (const sc of s.secondary || []) {
    const many = s.secondary.length > 1;
    secRows.push(
      row(s, many ? `Canons de ${fr(sc.caliberMm, 1)}${NB}mm` : 'Canons', `${fr(sc.mounts * sc.gunsPerMount, 0)}${NB}× ${fr(sc.caliberMm, 1)}${NB}mm (L/${fr(sc.boreCalibers, 0)}), ${sc.mounts}${NB}${plural(sc.mounts, 'affût', 'affûts')} ${GUN_NAMES[sc.gunsPerMount] || ''}${sc.mounts > 1 ? 's' : ''}`),
      row(s, many ? `Portée (${fr(sc.caliberMm, 1)}${NB}mm)` : 'Portée maximale', `${fr(sc.maxRangeM / 1000, 1)}${NB}km`),
      row(s, many ? `Obus (${fr(sc.caliberMm, 1)}${NB}mm)` : 'Obus', unit(sc.shellKg, 'kg', 0)));
  }
  add('sec', 'Artillerie secondaire', secRows);

  if (s.torpedoes) {
    const t = s.torpedoes;
    add('torp', 'Torpilles', [
      row(s, 'Tubes', `${fr(t.tubes, 0)}${NB}× ${fr(t.caliberMm, 0)}${NB}mm`),
      row(s, 'Vitesse', unit(t.speedKn, 'nœuds', 0)),
      row(s, 'Portée', `${fr(t.rangeM / 1000, 1)}${NB}km`),
      row(s, 'Charge explosive', `${fr(t.warheadKg, 0)}${NB}kg de ${EXPLOSIVE_NAMES[t.explosive || 'tnt']}`),
      row(s, 'Équivalent TNT', unit(tntEquivalent(t.warheadKg, t.explosive), 'kg', 0)),
    ]);
  }

  if (s.missiles && s.missiles.length) {
    add('msl', 'Missiles', s.missiles.flatMap((m) => {
      const sam = m.kind === 'sam';
      return [
        row(s, `${m.name}`, `${fr(m.count, 0)}${NB}missiles · ${sam ? 'contre les avions' : m.kind === 'ssm' ? ((m.targets || []).includes('base') ? 'contre les navires et les bases (vol rasant, ' : 'contre les navires (vol rasant, ') + `ogive de ${fr(m.warheadKg, 0)}${NB}kg)` : 'contre les navires (torpille Mk 46 larguée)'}`),
        row(s, `Portée (${m.name})`, `${fr(m.minRangeM / 1000, 1)} à ${fr(m.maxRangeM / 1000, 1)}${NB}km`),
        row(s, `Cadence (${m.name})`, `${fr(m.salvo, 0)}${NB}${plural(m.salvo, 'missile', 'missiles')} toutes les ${fr(m.cycleS, 0)}${NB}s`),
        sam ? row(s, `Guidage (${m.name})`, `radar semi-actif, ${fr(m.channels, 0)}${NB}cibles à la fois`) : null,
        m.kind === 'ssm' ? row(s, `Vitesse (${m.name})`, `${fr(m.speedMs * 3.6, 0)}${NB}km/h (Mach ${fr(m.speedMs / 340, 2)}), à ${fr(m.altM, 0)}${NB}m au-dessus de l'eau`) : null,
      ];
    }));
  }

  if (s.aircraft) {
    add('air', s.type === 'CV' ? 'Groupe aérien' : 'Hydravions', [
      row(s, s.type === 'CV' ? 'Capacité' : 'Hydravions embarqués', `${fr(s.aircraft.capacity, 0)}${NB}${plural(s.aircraft.capacity, 'appareil', 'appareils')}`, 'aircraft.capacity'),
      row(s, 'Catapultes', fr(s.aircraft.catapults, 0)),
    ]);
  }

  const a = s.armour;
  const mm = (v) => (v ? unit(v, 'mm', 0) : 'non blindé');
  add('armour', 'Protection', [
    row(s, 'Ceinture', mm(a.beltMm), 'armour.beltMm'),
    row(s, 'Pont blindé', mm(a.deckMm), 'armour.deckMm'),
    row(s, 'Tourelles (face)', mm(a.turretFaceMm), 'armour.turretFaceMm'),
    row(s, 'Tourelles (côtés)', mm(a.turretSideMm), 'armour.turretSideMm'),
    row(s, 'Poste de commandement', mm(a.conningTowerMm), 'armour.conningTowerMm'),
  ]);

  const sil = s.silhouette, fun = sil && sil.funnels;
  const mastTop = sil && sil.masts && sil.masts.length ? Math.max(...sil.masts.map((x) => x.heightAboveWaterM)) : null;
  add('sil', 'Silhouette', [
    fun ? row(s, 'Cheminées', `${fun.count}${NB}(${fr(fun.heightAboveDeckM, 1)}${NB}m au-dessus du pont)`) : null,
    mastTop ? row(s, 'Mât le plus haut', unit(mastTop, 'm au-dessus de l\'eau')) : null,
    sil && sil.island ? row(s, 'Îlot', `à ${sil.island.side === 'starboard' ? 'tribord' : 'bâbord'}, ${fr(sil.island.lengthM, 0)}${NB}m de long`) : null,
  ]);

  return sec;
}

/** Texts of the spec sheet that exist only in English (sources notes): shown apart, in a folded block. */
export function sheetNotes(rec) {
  const s = rec.spec, out = [];
  if (s.silhouette && s.silhouette.distinctive) out.push(['Traits distinctifs', s.silhouette.distinctive]);
  if (s.aa) out.push(['Défense antiaérienne', s.aa]);
  if (s.armour && s.armour.magazineNote) out.push(['Blindage', s.armour.magazineNote]);
  if (s.main && s.main.penetrationNote) out.push(['Artillerie principale', s.main.penetrationNote]);
  if (s.torpedoes && s.torpedoes.type) out.push(['Torpilles', s.torpedoes.type]);
  if (s.aircraft && s.aircraft.notes) out.push(['Aviation', s.aircraft.notes]);
  if (s.measured) out.push(['Relevé du modèle 3D', s.measured]);
  return out;
}

/** Sources of the spec sheet: [{ text, href? }]. */
export function sourcesOf(rec) {
  return (rec.spec.sources || []).map((t) => (/^https?:\/\//.test(t) ? { text: t.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), href: t } : { text: t }));
}

// ---- aircraft ----
export function aircraftRecords() {
  const out = [];
  for (const [id, p] of Object.entries(PLANES)) out.push(makeAircraft('plane:' + id, p));
  for (const n of NATIONS) out.push(makeAircraft('float:' + n.id, floatplaneSpec(n.id)));
  return out;
}

function makeAircraft(key, spec) {
  let users = [];
  if (key.startsWith('plane:')) {
    const k = key.slice(6);
    users = SHIPS.filter((r) => r.nation === spec.nation && r.type === 'CV').filter((r) => ['dive', 'torp', 'fighter'].some((role) => planeTypesFor(spec.nation, role, 'carrier').includes(k)));
  } else {
    users = SHIPS.filter((r) => r.nation === spec.nation && r.type !== 'CV' && r.spec.aircraft && r.spec.aircraft.capacity > 0 && r.type !== 'DD');
  }
  return { key, id: key, spec, nation: spec.nation, name: spec.name, role: spec.role, roleName: ROLE_NAMES[spec.role] || spec.role, users };
}

export const AIRCRAFT = aircraftRecords();
export const AIRCRAFT_BY_KEY = Object.fromEntries(AIRCRAFT.map((a) => [a.key, a]));

const ENGINE_KIND = { radial: 'en étoile', inline: 'en ligne' };
export function aircraftSections(a) {
  const s = a.spec, pf = a.key.startsWith('plane:') ? PERF[a.key.slice(6)] : null, kmh = (v) => unit(Math.round(v * 3.6 / 5) * 5, 'km/h', 0);
  const level = s.role === 'level';
  const rows = [
    ['Nation', ALL_NATIONS.find((n) => n.id === s.nation).name],
    ['Rôle', a.roleName],
    ['Configuration', (s.kind === 'bi' ? 'biplan' : 'monoplan') + (s.engines ? `, ${s.engines.length}${NB}moteurs ${ENGINE_KIND[s.engine.type] || ''}` : '')],
    ['Longueur', unit(s.L, 'm', 2)],
    ['Envergure', unit(s.span, 'm', 2)],
    s.mass ? ['Masse (modèle du jeu)', unit(s.mass, 't')] : null,
    level ? ['Charge', `${fr(s.bombKg, 0)}${NB}kg de bombes en soute`] : s.bombKg ? ['Charge', `une bombe de ${fr(s.bombKg, 0)}${NB}kg`] : (s.role === 'torp' ? ['Charge', 'une torpille'] : null),
    pf ? ['Vitesse maximale', kmh(pf.vmax)] : null,
    pf ? ['Vitesse de croisière', kmh(pf.vc)] : null,
    level && pf ? ['Altitude de bombardement', unit(pf.bombAlt, 'm', 0)] : null,
    level && pf ? ['Plafond pratique', unit(pf.ceil, 'm', 0)] : null,
    level && pf ? ['Roulement au décollage', unit(pf.runLen, 'm', 0)] : null,
    level || s.role === 'interceptor' ? ['Mise en œuvre', 'bases aériennes des îles (piste de 800 à 1 200 m)'] : null,
    s.siren ? ['Particularité', 'sirène « trompettes de Jéricho » en piqué'] : null,
    a.users.length ? [s.role === 'float' ? 'Embarqué sur' : 'Porte-avions', a.users.map((r) => r.name).join(', ')] : null,
  ].filter(Boolean);
  const out = [{ id: 'air', title: 'Caractéristiques', rows: rows.map(([k, v]) => ({ k, v, est: false })) }];
  const key = a.key.startsWith('plane:') ? a.key.slice(6) : null, loads = key ? loadoutsOf(key) : [];
  if (key && FIGHTER_GUNS[key]) {
    // the guns of a fighter and the rounds of its belts: what one hit does (against the .50 API round) and how often it starts a fire in a tank
    const beltText = (b) => Object.entries(BELTS[b]).map(([id, w]) => `${AMMO[id].name} ${fr(w * 100, 0)}${NB}%`).join(', ');
    const where = { wing: 'dans les ailes', cowl: 'sur le capot, tirant à travers l\'hélice', hub: 'dans le moyeu de l\'hélice', fus: 'dans le nez', at: 'dans la bosse dorsale' };
    out.push({ id: 'guns', title: s.role === 'fighter' || s.role === 'attack' || s.role === 'interceptor' ? 'Armement' : 'Armement fixe (tirant vers l\'avant)', rows: FIGHTER_GUNS[key].map((g) => {
      const gun = GUNS[g.gun], m = beltMean(g.belt), secs = g.rpg / (gun.rpm / 60);
      return { k: `${g.n}${NB}×${NB}${gun.name}`, v: `${g.where || where[g.mount] || ''} · ${g.rpg}${NB}coups par arme (${fr(secs, 0)}${NB}s de tir) · ${fr(gun.rpm, 0)}${NB}coups/min · bande : ${beltText(g.belt)} · un coup fait en moyenne ${fr(m.dmg, 1)}${NB}fois un coup de 12,7${NB}mm API, met le feu à un réservoir dans ${fr(m.fire * 100, 0)}${NB}% des cas`, est: false };
    }) });
  }
  if (key) {
    const guns = planeGuns(s, key);
    if (guns.length) {
      const by = {};
      for (const g of guns) { const b = beltForGun(g.cal, s.nation), k = `${g.cal}|${b}`; by[k] = by[k] || { cal: g.cal, belt: b, n: 0, pos: 0 }; by[k].n += g.n; by[k].pos++; }
      out.push({ id: 'guns', title: 'Armement défensif', rows: Object.values(by).map((g) => { const m = beltMean(g.belt); return { k: `${g.n}${NB}×${NB}${fr(g.cal, 1)}${NB}mm`, v: `en ${g.pos}${NB}poste${g.pos > 1 ? 's' : ''} · un coup fait en moyenne ${fr(m.dmg, 2)}${NB}fois un coup de 12,7${NB}mm API`, est: false }; }) });
    }
  }
  if (loads.length) {
    const ROLE = { ship: 'navires', armor: 'navires cuirassés', base: 'bases', alt: 'autre usage' };
    out.push({ id: 'loads', title: 'Charges possibles (bombes et torpilles)', rows: loads.map((l) => {
      const kg = loadKg(l, s.nation), t = l.stores.reduce((x, st) => x + (st.torp || 0), 0);
      const use = l.roles.map((r) => ROLE[r]).filter(Boolean).join(', ');
      return { k: l.label, v: `${fr(kg, 0)}${NB}kg au total · pour ${use}${t ? ' · torpille ' + torpName(s.nation) : ''}`, est: false };
    }) });
    // the bombs themselves: what is in them and what they do
    const seen = new Set(), rowsB = [];
    for (const l of loads) for (const b of bombsIn(l)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const R = aircraftRadii(b), nmax = Math.max(...loads.map((q) => q.stores.reduce((x, st) => x + (st.ord === b.id ? st.n : 0), 0)));
      rowsB.push({ k: b.name, v: `${fr(b.kg, 0)}${NB}kg dont ${fr(b.filler, b.filler < 10 ? 1 : 0)}${NB}kg d'explosif (${FILL_NAME[b.fill] || b.fill}) · fusée ${b.delay ? fr(b.delay * 1000, 0) + NB + 'ms de retard' : 'instantanée'} · perce ${fr(b.pen, 0)}${NB}mm de pont (en piqué) · détruit un avion au sol à ${fr(R.dead, 0)}${NB}m · jusqu'à ${nmax} par avion`, est: !!b.est });
    }
    if (rowsB.length) out.push({ id: 'bombs', title: 'Bombes', rows: rowsB });
  }
  return out;
}

const FILL_NAME = { tnt: 'TNT', amatol: 'amatol', shimose: 'shimose', type91: 'type 91', explosiveD: 'explosif D', trialen: 'trialen', compB: 'composition B', torpex: 'torpex' };
const TORP_NAME = { USA: 'Mk 13', Japan: 'Type 91', UK: 'Mk XII', Germany: 'LT F5b', France: 'aérienne de 400 mm', Italy: 'W 200/450' };
const torpName = (nation) => `${TORP_NAME[nation] || ''} (${fr(AIR_TORPEDO[nation] ? AIR_TORPEDO[nation].kg : 200, 0)}${NB}kg d'explosif)`;
