// Ship roster: the six nations' spec sheets (real-ship data) indexed by id / nation / type.
import { SHIPS as USA } from './specs/usa.js';
import { SHIPS as JAPAN } from './specs/japan.js';
import { SHIPS as UK } from './specs/uk.js';
import { SHIPS as GERMANY } from './specs/germany.js';
import { SHIPS as FRANCE } from './specs/france.js';
import { SHIPS as ITALY } from './specs/italy.js';

export const NATIONS = [
  { id: 'USA', name: 'États-Unis', adj: 'US Navy', flag: '#3c5a9a' },
  { id: 'Japan', name: 'Japon', adj: 'Marine impériale', flag: '#c0392b' },
  { id: 'UK', name: 'Royaume-Uni', adj: 'Royal Navy', flag: '#2b4a80' },
  { id: 'Germany', name: 'Allemagne', adj: 'Kriegsmarine', flag: '#555' },
  { id: 'France', name: 'France', adj: 'Marine nationale', flag: '#2f58a8' },
  { id: 'Italy', name: 'Italie', adj: 'Regia Marina', flag: '#2e8b57' },
];

export const TYPES = [
  { id: 'DD', name: 'Destroyer' },
  { id: 'CL', name: 'Croiseur léger' },
  { id: 'CA', name: 'Croiseur lourd' },
  { id: 'BB', name: 'Cuirassé' },
  { id: 'CV', name: 'Porte-avions' },
];

export const ALL_SHIPS = [...USA, ...JAPAN, ...UK, ...GERMANY, ...FRANCE, ...ITALY];
export const BY_ID = Object.fromEntries(ALL_SHIPS.map((s) => [s.id, s]));
export const typeName = (t) => TYPES.find((x) => x.id === t)?.name || t;
export const nationName = (n) => NATIONS.find((x) => x.id === n)?.name || n;
export const shipsOf = (nation, type) => ALL_SHIPS.filter((s) => s.nation === nation && (!type || s.type === type));
