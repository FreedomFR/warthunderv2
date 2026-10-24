// Gameplay statistics derived from the real-ship spec sheets.
import { missileStats } from './missiles.js';
import { KN } from '../math.js';
import { muzzlePenetration } from './penetration.js';
import { navyOf, protectionOf } from '../data/protection.js';
import { tntEquivalent } from '../data/explosives.js';

const TURN_FACTOR = { DD: 2.3, CL: 2.5, CA: 2.6, BB: 2.7, CV: 2.7 };     // turning radius (full rudder) / length
const ACCEL_SECONDS = { DD: 38, CL: 52, CA: 62, BB: 95, CV: 80 };      // time to reach full speed
const SKIN = { DD: 10, CL: 16, CA: 20, BB: 25, CV: 18 };           // mm of hull plating where there is no belt
const SUP = { DD: 6, CL: 10, CA: 12, BB: 15, CV: 10 };            // mm of superstructure plating
const FLIGHT = { essex: 19, enterprise: 19, shokaku: 19 };                         // thin unarmoured flight deck over the armoured hangar deck (estimated)
const HULL_FACTOR = { DD: 0.42, CL: 0.27, CA: 0.25, BB: 0.30, CV: 0.28 };

function gunStats(g, group, navy, extra = {}) {
  const cal = g.caliberMm;
  return {
    group, cal, bore: g.boreCalibers || 40,
    v0: g.muzzleVelocityMs || 800, shellKg: g.shellKg || Math.pow(cal / 100, 3) * 15,
    maxRange: g.maxRangeM || cal * 90, maxElevDeg: Math.min(g.maxElevationDeg || 45, 85),
    reload: g.reloadSecPerGun || 8, trainRate: g.trainRateDegS || (cal >= 300 ? 4 : cal >= 190 ? 6 : 15),
    // armour penetration at the muzzle from the shell's mass and velocity (see penetration.js)
    pen0: muzzlePenetration(cal, g.shellKg || Math.pow(cal / 100, 3) * 15, g.muzzleVelocityMs || 800),
    // the base fuze of the armour-piercing shell: delay (s) and the share that fail to function
    fuzeDelay: navy.fuze.find(([lim]) => cal < lim)[1], dud: navy.dud, breakup: navy.breakup,
    // AP capable only for the heavier guns
    ap: cal >= 150,
    // the magazine: rounds per gun (a 16 in battleship carried about 100 a gun, a 6 in cruiser 200, a destroyer's 5 in 400 or more) and the share of them that is armour-piercing
    rpg: cal >= 300 ? 100 : cal >= 200 ? 150 : cal >= 150 ? 200 : cal >= 120 ? 280 : cal >= 90 ? 400 : 500,
    apShare: cal >= 280 ? 0.62 : cal >= 150 ? 0.5 : 0,
    ...extra,
  };
}

export function makeStats(spec) {
  const t = spec.type;
  const L = spec.loa, dispFull = spec.displacementFull || spec.displacementStd * 1.15;
  const maxSpeed = spec.speedKn * KN;
  const navy = navyOf(spec.nation), prot = protectionOf(spec);
  const main = gunStats(spec.main, 'main', navy);
  const secs = (spec.secondary || []).map((s, i) => ({ s, i })).filter(({ s }) => s.caliberMm >= 70 && s.mounts > 0).map(({ s, i }) => gunStats(s, 'sec', navy, { specIndex: i }));
  const arm = spec.armour || {};
  const stats = {
    id: spec.id, nation: spec.nation, type: t, className: spec.className, refShip: spec.refShip, classShips: spec.classShips || [spec.refShip],
    L, B: spec.beam, D: spec.draft, dispFull,
    maxSpeed, accel: maxSpeed / ACCEL_SECONDS[t], decel: maxSpeed / (ACCEL_SECONDS[t] * 0.6),
    turnRadius: TURN_FACTOR[t] * L, rudderRate: t === 'DD' ? 0.22 : t === 'BB' || t === 'CV' ? 0.1 : 0.14,
    hullStrength: Math.round(dispFull * HULL_FACTOR[t]),      // the strength of the hull, a scale for blows and holes (there are no hit points: see sim/hull.js)
    crew: Math.round(spec.crew || { DD: 250, CL: 750, CA: 1000, BB: 1900, CV: 1800 }[t]),
    armor: {
      belt: arm.beltMm ?? (t === 'DD' ? 5 : 20), deck: arm.deckMm ?? (t === 'DD' ? 6 : 25),
      turretFace: arm.turretFaceMm ?? (t === 'DD' ? 12 : t === 'CV' ? 20 : 40), turretSide: arm.turretSideMm ?? (arm.turretFaceMm ? arm.turretFaceMm * 0.5 : 20),
      citadel: arm.conningTowerMm ?? 30,
      // the roof of a turret is about 0.4 of its face on every battleship and cruiser measured (Iowa 184 / 432, Yamato 270 / 650, Bismarck 180 / 360)
      roof: arm.turretRoofMm ?? Math.max(6, (arm.turretFaceMm ?? 12) * 0.42),
      // plating of an unarmoured hull side and deck, and of the superstructure (the 3/8 in skin of a destroyer let 14 in shells through unburst)
      skin: SKIN[t], sup: SUP[t],
      incl: prot.beltIncl ?? 0, weather: prot.weather ?? 0, flight: prot.flight ?? (t === 'CV' ? FLIGHT[spec.baseId || spec.id] ?? 0 : 0),
      lower: prot.lower ?? (arm.beltMm ?? 0) * 0.4,
    },
    main, secs,
    navy, torpProt: prot.torp || { kg: 0 }, avgas: prot.avgas || null,
    torpedo: spec.torpedoes && spec.torpedoes.tubes ? {
      tubes: spec.torpedoes.tubes, speed: (spec.torpedoes.speedKn || 40) * KN, range: spec.torpedoes.rangeM || 7000,
      // `warhead` is the TNT equivalent in kg (what the damage and the protection tables work on), `filler` the weight of the explosive itself
      warhead: tntEquivalent(spec.torpedoes.warheadKg || 300, spec.torpedoes.explosive), filler: spec.torpedoes.warheadKg || 300, cal: spec.torpedoes.caliberMm || 533,
      bow: !!spec.torpedoes.bow,                   // fixed tubes in the bow: the ship is aimed at the target
      spare: spec.torpedoes.reloads ?? null,       // torpedoes in store for the tubes (null: reloaded without limit, as before)
      reloadS: spec.torpedoes.reloadS || 300,
    } : null,
    missiles: missileStats(spec),                  // guided missiles and rocket-thrown torpedoes (sim/missiles.js)
    air: spec.aircraft && t === 'CV' ? { capacity: spec.aircraft.capacity || 30 } : null,
    // anti-aircraft strength (barrels), rough: all secondary + light AA estimated from displacement
    aaPower: Math.round(Math.sqrt(dispFull) * 0.35 + secs.reduce((a, s, i) => a + (s.cal <= 140 ? 6 : 1), 0)),
    // gameplay-scaled magazine / turret toughness
    mountHp: (cal) => (cal >= 300 ? 900 : cal >= 180 ? 520 : cal >= 120 ? 240 : 110),
    // fraction of torpedo damage that gets through underwater protection
    torpFactor: { DD: 1.3, CL: 1.0, CA: 0.9, BB: 0.6, CV: 0.8 }[t],
    sinkTime: { DD: 40, CL: 75, CA: 100, BB: 200, CV: 180 }[t],
    softness: { DD: 4.2, CL: 0.85, CA: 0.65, BB: 0.28, CV: 0.55 }[t],     // damage taken from HE / unarmoured hits
    score: { DD: 1, CL: 1.5, CA: 2.2, BB: 4, CV: 3.5 }[t],
  };
  return stats;
}

const PREFIX = { USA: 'USS ', UK: 'HMS ', Japan: 'IJN ', Germany: 'KMS ' };
const SKIP = /never|cancel|unfinish|planned|abandon|sold|completed as|not laid/i;

/** Clean a display name from the spec sheet ("Japanese cruiser Takao (1930), as rebuilt..." -> "IJN Takao"). */
export function cleanName(raw, nation) {
  let n = raw.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim();
  n = n.replace(/^(Japanese|German|French|Italian)\s+(destroyer|cruiser|battleship|aircraft carrier|carrier)\s+/i, '');
  n = n.replace(/^KMS\s+/, '');
  if (/^(USS|HMS|HMAS|IJN|KMS)\b/.test(n)) return n;
  if (/^Z\d+$/.test(n)) return n;                // German destroyers are just numbered
  return (PREFIX[nation] || '') + n;
}

/** Real hull names of the class: the reference ship first, then its sisters, then numbered repeats. */
export function shipNames(stats) {
  if (stats._names) return stats._names;
  const raw = (stats.classShips && stats.classShips.length ? stats.classShips : [stats.refShip]).filter((n) => !SKIP.test(n));
  let names = raw.map((n) => cleanName(n, stats.nation));
  const ref = cleanName(stats.refShip, stats.nation);
  names = [ref, ...names.filter((n) => n !== ref)];
  // the class name itself ("Kagero", "Yamato"...) is also the first ship, keep unique order
  stats._names = [...new Set(names)];
  return stats._names;
}

export function pickName(stats, index) {
  const ordered = shipNames(stats);
  const n = ordered[index % ordered.length];
  return index >= ordered.length ? `${n} (${Math.floor(index / ordered.length) + 1})` : n;
}
