// Balance: multipliers of the damage done in the battle, so that it can be tuned without touching the code.
// Three layers, each over the one before: the neutral values here (all 1: the damage as the simulation computes it, what the tests use), the file
// config/balance.json (read by the game at start, built into naval.html), and what is set in the game (Réglages -> Dégâts, kept in the browser).
// The simulation reads BALANCE at every hit, so a change applies at once, in the battle under way.

/** What can be tuned: group -> [key, label (French, for the panel), hint]. */
export const BALANCE_FIELDS = {
  ships: {
    label: 'Navires : dégâts reçus',
    keys: [
      ['shell', 'Obus', 'Obus des canons des navires et des batteries côtières'],
      ['torpedo', 'Torpilles', 'Torpilles des navires et des avions'],
      ['bomb', 'Bombes', 'Bombes des avions (piqué et gros bombardiers)'],
      ['fire', 'Incendies', 'Dégâts des incendies à bord'],
      ['flood', 'Voies d\'eau', 'Dégâts de l\'eau qui entre dans la coque'],
      ['blast', 'Explosions voisines', 'Souffle d\'un navire voisin qui explose'],
      ['turret', 'Feux de tourelle', 'Flamme qui descend vers les soutes après une tourelle percée'],
      ['collision', 'Collisions', 'Abordages entre navires et échouages'],
      ['modules', 'Modules et tourelles', 'Dégâts aux machines, gouvernail, tourelles, DCA... (ce qui tombe en panne, pas la coque)'],
    ],
  },
  planes: {
    label: 'Avions : dégâts reçus',
    keys: [
      ['aa', 'DCA', 'Tirs antiaériens des navires et des bases'],
      ['gun', 'Chasseurs', 'Mitrailleuses et canons des chasseurs'],
      ['gunner', 'Mitrailleurs', 'Mitrailleurs des bombardiers (tourelles, postes arrière)'],
    ],
  },
  bases: {
    label: 'Bases : dégâts reçus',
    keys: [
      ['all', 'Obus et bombes', 'Bâtiments, pièces d\'artillerie et avions au sol'],
    ],
  },
};

/** The limits of a multiplier (0: that cause does no damage at all). */
export const BALANCE_MIN = 0, BALANCE_MAX = 5;

const neutral = () => Object.fromEntries(Object.entries(BALANCE_FIELDS).map(([g, f]) => [g, Object.fromEntries(f.keys.map(([k]) => [k, 1]))]));

/** The values in force (the simulation reads these). */
export const BALANCE = neutral();
/** The values of config/balance.json, once read (what "reset" goes back to). */
let fileValues = null;

/** A copy of the neutral values, of the file's, or of those in force. */
export const balanceNeutral = () => neutral();
export const balanceOfFile = () => merge(neutral(), fileValues);
export const balanceNow = () => JSON.parse(JSON.stringify(BALANCE));

/** Only the known keys, as finite numbers within the limits. */
function merge(into, o) {
  if (!o || typeof o !== 'object') return into;
  for (const [g, f] of Object.entries(BALANCE_FIELDS)) {
    const src = o[g];
    if (!src || typeof src !== 'object') continue;
    for (const [k] of f.keys) {
      const v = Number(src[k]);
      if (src[k] != null && Number.isFinite(v)) into[g][k] = Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, v));
    }
  }
  return into;
}

/** Set the values in force: the file's under `o` (unknown keys and bad values are ignored). */
export function setBalance(o) {
  const v = merge(balanceOfFile(), o);
  for (const g of Object.keys(BALANCE)) Object.assign(BALANCE[g], v[g]);
  return BALANCE;
}

/** The values of config/balance.json (they become what reset goes back to, and are put in force). */
export function setBalanceFile(o) { fileValues = o && typeof o === 'object' ? o : null; return setBalance(null); }

/** What differs from the file (what the game keeps in the browser). */
export function balanceDiff() {
  const base = balanceOfFile(), out = {};
  for (const g of Object.keys(BALANCE)) for (const k of Object.keys(BALANCE[g])) if (BALANCE[g][k] !== base[g][k]) (out[g] ||= {})[k] = BALANCE[g][k];
  return out;
}

/** The multiplier of the damage a ship takes from a cause ('shell', 'torpedo', ...; any other: 1). */
export const shipDmg = (cause) => BALANCE.ships[cause] ?? 1;
/** The multiplier of the damage an aircraft takes from a cause ('aa', 'gun', 'gunner'). */
export const planeDmg = (cause) => BALANCE.planes[cause] ?? 1;
