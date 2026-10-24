// What each aircraft can carry: the loads that were really hung under it, as lists of stores (a bomb of data/ordnance.js and how many, or the torpedo of the nation), and for what each
// load is good: `ship` any ship, `armor` a ship with an armoured deck or belt (an armour-piercing bomb, or a torpedo), `base` an airfield or a battery (blast against buildings and aircraft
// parked in the open). The crew chooses the load when the strike takes off, from what it is going to attack (sim/aircraft.js, sim/airfield.js); the wiki lists them all.
// Sources: the loads of the aircraft pages of Wikipedia, Tillman (the SBD-5), the Japanese ordnance lists, the manuals of the Luftwaffe bombs (research of the CHANGELOG).
// `alt`: a load that is possible but that the crew does not pick by itself (the wiki lists it).
//   store { ord: 'anm64', n: 4 }    n bombs of that kind          { torp: 1 }   the aerial torpedo of the nation
import { BOMBS } from './ordnance.js';

const L = (id, label, stores, roles, extra = {}) => ({ id, label, stores, roles, ...extra });

export const LOADOUTS = {
  // ---- carrier dive bombers ----
  sbd: [
    L('1000+2x100', '1 bombe de 1 000 lb + 2 de 100 lb', [{ ord: 'anm65', n: 1 }, { ord: 'anm30', n: 2 }], ['ship']),
    L('500+2x100', '1 bombe de 500 lb + 2 de 100 lb', [{ ord: 'anm64', n: 1 }, { ord: 'anm30', n: 2 }], ['base', 'ship']),
  ],
  d3a: [
    L('250+2x60', '1 bombe de 250 kg + 2 de 60 kg', [{ ord: 'jn25', n: 1 }, { ord: 'jn6', n: 2 }], ['ship']),
    L('250l+2x60', '1 bombe de 250 kg (sol) + 2 de 60 kg', [{ ord: 'jn25l', n: 1 }, { ord: 'jn6', n: 2 }], ['base']),
    L('2x60', '2 bombes de 60 kg', [{ ord: 'jn6', n: 2 }], ['base']),
  ],
  skua: [
    L('500sap', '1 bombe de 500 lb SAP', [{ ord: 'uk500sap', n: 1 }], ['ship', 'armor']),
    L('8x30', '8 bombes de 30 lb', [{ ord: 'uk30', n: 8 }], ['base']),
  ],
  ju87: [
    L('sc500+4xsc50', '1 SC 500 + 4 SC 50', [{ ord: 'sc500', n: 1 }, { ord: 'sc50', n: 4 }], ['ship', 'base']),
    L('pc500+4xsc50', '1 PC 500 (perforante) + 4 SC 50', [{ ord: 'pc500', n: 1 }, { ord: 'sc50', n: 4 }], ['armor']),
    L('sc250+4xsc50', '1 SC 250 + 4 SC 50', [{ ord: 'sc250', n: 1 }, { ord: 'sc50', n: 4 }], ['base']),
  ],
  ln401: [
    L('225', '1 bombe de 225 kg', [{ ord: 'fr225', n: 1 }], ['ship', 'base']),
    L('165', '1 bombe de 165 kg', [{ ord: 'fr165', n: 1 }], ['ship']),
    L('10x15', '10 bombes de 15 kg', [{ ord: 'fr15', n: 10 }], ['base']),
  ],
  re2001: [
    L('250+2x50', '1 bombe de 250 kg + 2 de 50 kg', [{ ord: 'it250', n: 1 }, { ord: 'it50', n: 2 }], ['ship', 'base']),
    L('160ap', '1 bombe perforante de 160 kg', [{ ord: 'it160ap', n: 1 }], ['armor']),
  ],
  // ---- the Soviet ground-attack aircraft (the 8 RS-82 rockets of the wings are not simulated) ----
  il2: [
    L('4xfab100', '4 bombes FAB-100 en soute + 2 FAB-100 sous les ailes', [{ ord: 'fab100', n: 6 }], ['ship', 'base']),
    L('2xfab250', '2 bombes FAB-250 sous les ailes', [{ ord: 'fab250', n: 2 }], ['base']),
    L('8xfab50', '8 bombes FAB-50', [{ ord: 'fab50', n: 8 }], ['base']),
  ],
  // ---- carrier torpedo bombers (the torpedo is for ships; the bombs for what they can do on land) ----
  tbf: [
    L('torp', '1 torpille Mk 13', [{ torp: 1 }], ['ship', 'armor']),
    L('4x500', '4 bombes de 500 lb', [{ ord: 'anm64', n: 4 }], ['base']),
    L('1000ap', '1 bombe perforante de 1 000 lb', [{ ord: 'anmk33', n: 1 }], ['alt']),
    L('2000', '1 bombe de 2 000 lb', [{ ord: 'anm66', n: 1 }], ['base']),
  ],
  tdb1: [
    L('torp', '1 torpille Mk 13', [{ torp: 1 }], ['ship', 'armor']),
    L('3x500', '3 bombes de 500 lb', [{ ord: 'anm64', n: 3 }], ['base']),
    L('1000', '1 bombe de 1 000 lb', [{ ord: 'anm65', n: 1 }], ['alt', 'base']),
    L('12x100', '12 bombes de 100 lb', [{ ord: 'anm30', n: 12 }], ['base']),
  ],
  b5n: [
    L('torp', '1 torpille Type 91', [{ torp: 1 }], ['ship', 'armor']),
    L('800ap', '1 bombe perforante de 800 kg', [{ ord: 'jn80ap', n: 1 }], ['alt']),
    L('2x250', '2 bombes de 250 kg', [{ ord: 'jn25', n: 2 }], ['alt', 'base']),
    L('6x60', '6 bombes de 60 kg', [{ ord: 'jn6', n: 6 }], ['base']),
  ],
  swordfish: [
    L('torp', '1 torpille Mk XII', [{ torp: 1 }], ['ship', 'armor']),
    L('6x250', '6 bombes de 250 lb', [{ ord: 'uk250', n: 6 }], ['base']),
    L('500+2x250', '1 bombe de 500 lb + 2 de 250 lb', [{ ord: 'uk500', n: 1 }, { ord: 'uk250', n: 2 }], ['base']),
  ],
  fi167: [
    L('torp', '1 torpille LT F5b', [{ torp: 1 }], ['ship', 'armor']),
    L('sc500+4xsc50', '1 SC 500 + 4 SC 50', [{ ord: 'sc500', n: 1 }, { ord: 'sc50', n: 4 }], ['base']),
    L('sc1000', '1 SC 1000', [{ ord: 'sc1000', n: 1 }], ['base']),
  ],
  pl10: [
    L('torp', '1 torpille aérienne', [{ torp: 1, kg: 650 }], ['ship', 'armor']),
    L('4x60', '4 bombes de 60 kg', [{ ord: 'fr60', n: 4 }], ['base']),
  ],
  re2001t: [
    L('torp', '1 torpille aérienne', [{ torp: 1, kg: 600 }], ['ship', 'armor']),
    L('250', '1 bombe de 250 kg', [{ ord: 'it250', n: 1 }], ['base']),
  ],
  // ---- land-based bombers (a stick of bombs from high level; the torpedo loads of the aircraft that carried them) ----
  b17: [
    L('12x500', '12 bombes de 500 lb', [{ ord: 'anm64', n: 12 }], ['ship', 'base']),
    L('6x1000', '6 bombes de 1 000 lb', [{ ord: 'anm65', n: 6 }], ['armor', 'ship']),
    L('20x100', '20 bombes de 100 lb', [{ ord: 'anm30', n: 20 }], ['base']),
  ],
  b29: [
    L('20x500', '20 bombes de 500 lb', [{ ord: 'anm64', n: 20 }], ['ship', 'base']),
    L('12x1000', '12 bombes de 1 000 lb', [{ ord: 'anm65', n: 12 }], ['armor', 'ship']),
    L('40x250', '40 bombes de 250 lb', [{ ord: 'anm57', n: 40 }], ['base']),
  ],
  g4m: [
    L('torp', '1 torpille Type 91', [{ torp: 1 }], ['armor', 'ship'], { low: true }),
    L('800ap', '1 bombe perforante de 800 kg', [{ ord: 'jn80ap', n: 1 }], ['alt']),
    L('4x250', '4 bombes de 250 kg', [{ ord: 'jn25', n: 4 }], ['ship', 'base']),
    L('800l+12x60', '1 bombe de 800 kg (sol) + 12 de 60 kg', [{ ord: 'jn80l', n: 1 }, { ord: 'jn6', n: 12 }], ['base']),
  ],
  lancaster: [
    L('14x1000', '14 bombes de 1 000 lb', [{ ord: 'uk1000', n: 14 }], ['ship', 'armor', 'base']),
    L('18x500', '18 bombes de 500 lb', [{ ord: 'uk500', n: 18 }], ['ship', 'base']),
  ],
  he111: [
    L('8xsc250', '8 SC 250', [{ ord: 'sc250', n: 8 }], ['ship', 'base']),
    L('32xsc50', '32 SC 50', [{ ord: 'sc50', n: 32 }], ['base']),
    L('2xtorp', '2 torpilles LT F5b', [{ torp: 2 }], ['armor', 'ship'], { low: true }),
  ],
  sm79: [
    L('torp', '1 torpille de 450 mm', [{ torp: 1 }], ['armor', 'ship'], { low: true }),
    L('5x250', '5 bombes de 250 kg', [{ ord: 'it250', n: 5 }], ['ship', 'base']),
    L('2x500', '2 bombes de 500 kg', [{ ord: 'it500', n: 2 }], ['ship']),
    L('12x100', '12 bombes de 100 kg', [{ ord: 'it100', n: 12 }], ['base']),
  ],
  leo451: [
    L('7x225', '7 bombes de 225 kg', [{ ord: 'fr225', n: 7 }], ['ship', 'base']),
    L('10x15', '30 bombes de 15 kg', [{ ord: 'fr15', n: 30 }], ['base']),
  ],
  // ---- the land-based interceptors (a fighter does not bomb in the simulation: the load the wing racks could take is listed for the wiki) ----
  p38: [
    L('2x1000', '2 bombes de 1 000 lb sous les ailes', [{ ord: 'anm65', n: 2 }], ['alt']),
  ],
  mosquito: [
    L('4x500', '4 bombes de 500 lb (2 en soute, 2 sous les ailes)', [{ ord: 'uk500', n: 4 }], ['alt']),
  ],
};

/** The loads of an aircraft type (an empty list for a type with none). */
export const loadoutsOf = (typeKey) => LOADOUTS[typeKey] || [];

/** Mass (kg) of the aerial torpedo of each nation (Mk 13, Type 91, Mk XII, LT F5b, the French and the Italian ones). */
const TORPEDO_KG = { USA: 1005, Japan: 848, UK: 702, Germany: 765, France: 700, Italy: 876 };

/** Mass (kg) of a load: the bombs and the torpedo of the nation. */
export function loadKg(load, nation = 'USA') {
  let kg = 0;
  for (const s of load.stores) kg += s.torp ? (s.kg || TORPEDO_KG[nation] || 800) * s.torp : BOMBS[s.ord].kg * s.n;
  return kg;
}

/** The torpedoes of a load (how many). */
export const torpedoesIn = (load) => load.stores.reduce((a, s) => a + (s.torp || 0), 0);
/** The bombs of a load, flat: [bomb record, ...]. */
export function bombsIn(load) { const out = []; for (const s of load.stores) if (s.ord) for (let i = 0; i < s.n; i++) out.push(BOMBS[s.ord]); return out; }

/**
 * The load the crew takes for a target: `ship` (the target is a ship of its class: `armored` when it has a thick deck or belt) or `base`. A load that lists the role first
 * wins; when the aircraft has none for the role (a dive bomber against an armoured ship) it takes the one for any ship.
 */
export function pickLoadout(typeKey, role, armored = false) {
  const list = loadoutsOf(typeKey);
  if (!list.length) return null;
  const want = role === 'base' ? ['base'] : armored ? ['armor', 'ship'] : ['ship'];
  for (const r of want) {
    // (the loads that name the role first are made for it, the others only do for it; between equals the first of the list)
    const found = list.filter((l) => l.roles.includes(r)).sort((a, b) => a.roles.indexOf(r) - b.roles.indexOf(r));
    if (found.length) return found[0];
  }
  return list[0];
}
