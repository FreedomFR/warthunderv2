// Everything the 3D viewer (and the wiki) can show: the 30 ships, the carrier aircraft and the catapult floatplanes.
// A subject key is a ship id ("iowa"), "plane:<type>" ("plane:sbd") or "float:<nation>" ("float:USA").
import { ALL_SHIPS, BY_ID, NATIONS, TYPES, nationName, typeName } from '../game/data/ships.js';
import { PLANES, floatplaneSpec } from '../game/model/planes.js';

export const ROLE_NAMES = { dive: 'Bombardier en piqué', torp: 'Torpilleur', fighter: 'Chasseur', float: 'Hydravion embarqué', level: 'Bombardier terrestre' };

// Display names of the 30 classes (the spec sheets carry the English class names).
export const SHIP_NAMES = {
  fletcher: 'Fletcher', cleveland: 'Cleveland', baltimore: 'Baltimore', iowa: 'Iowa', essex: 'Essex',
  kagero: 'Kagerō', agano: 'Agano', takao: 'Takao', yamato: 'Yamato', shokaku: 'Shōkaku',
  tribal: 'Tribal', belfast: 'Town (Belfast)', norfolk: 'County (Norfolk)', kgv: 'King George V', illustrious: 'Illustrious',
  type1936a_mob: 'Type 1936A (Mob)', koenigsberg: 'Königsberg', admiral_hipper: 'Admiral Hipper', bismarck: 'Bismarck', graf_zeppelin: 'Graf Zeppelin',
  fantasque: 'Le Fantasque', la_galissoniere: 'La Galissonnière', algerie: 'Algérie', richelieu: 'Richelieu', bearn: 'Béarn',
  soldati: 'Soldati', montecuccoli: 'Raimondo Montecuccoli', zara: 'Zara', littorio: 'Littorio', aquila: 'Aquila',
};
export const shipName = (id) => SHIP_NAMES[id] || BY_ID[id]?.className.replace(/ \(.*$/, '') || id;

export function kindOf(key) {
  if (key.startsWith('plane:')) return 'plane';
  if (key.startsWith('float:')) return 'float';
  return 'ship';
}

/** Spec sheet of an aircraft subject. */
export function aircraftSpec(key) {
  if (key.startsWith('float:')) return floatplaneSpec(key.slice(6));
  return PLANES[key.slice(6)];
}

export function isSubject(key) {
  const k = kindOf(key);
  if (k === 'ship') return !!BY_ID[key];
  if (k === 'plane') return !!PLANES[key.slice(6)];
  return NATIONS.some((n) => n.id === key.slice(6));
}

/** Short label of a subject, for menus. */
export function labelOf(key) {
  if (kindOf(key) === 'ship') return `${shipName(key)} — ${typeName(BY_ID[key].type).toLowerCase()}`;
  return aircraftSpec(key).name;
}

/** Menu groups: [{ label, items: [{ key, label }] }], ships by nation (in type order) then aircraft by nation. */
export function subjectGroups() {
  const groups = [];
  for (const n of NATIONS) {
    const items = [];
    for (const t of TYPES) for (const s of ALL_SHIPS) if (s.nation === n.id && s.type === t.id) items.push({ key: s.id, label: labelOf(s.id) });
    groups.push({ label: n.name, items });
  }
  for (const n of NATIONS) {
    const items = [];
    for (const [id, p] of Object.entries(PLANES)) if (p.nation === n.id) items.push({ key: 'plane:' + id, label: p.name + ' (' + ROLE_NAMES[p.role].toLowerCase() + ')' });
    items.push({ key: 'float:' + n.id, label: floatplaneSpec(n.id).name + ' (hydravion)' });
    groups.push({ label: 'Aviation — ' + n.name, items });
  }
  return groups;
}

export const ALL_KEYS = subjectGroups().flatMap((g) => g.items.map((i) => i.key));

/** A sensible first view: distance, height of the point looked at, azimuth / elevation, and the altitude of an aircraft (hovering above the sea). */
export function framing(key) {
  if (kindOf(key) === 'ship') {
    const L = BY_ID[key].loa;
    return { dist: Math.round(L * 1.05), ty: Math.round(L * 0.07 * 10) / 10, az: 215, el: 14, alt: 0 };
  }
  const s = aircraftSpec(key);
  return { dist: Math.round(Math.max(s.span, s.L) * 1.5 * 10) / 10, ty: 22, az: 215, el: 14, alt: 22 };
}

export { nationName };
