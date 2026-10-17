// Gameplay statistics derived from the real-ship spec sheets.
import { KN } from '../math.js';

const TURN_FACTOR = { DD: 2.3, CL: 2.5, CA: 2.6, BB: 2.7, CV: 2.7 };     // turning radius (full rudder) / length
const ACCEL_SECONDS = { DD: 38, CL: 52, CA: 62, BB: 95, CV: 80 };      // time to reach full speed
const HP_FACTOR = { DD: 0.42, CL: 0.36, CA: 0.34, BB: 0.30, CV: 0.28 };

/** Penetration of an AP shell against vertical armour at the muzzle (mm). */
function penAtMuzzle(cal) {
  if (cal >= 300) return 2.0 * cal;
  if (cal >= 190) return 1.9 * cal;
  if (cal >= 120) return 1.5 * cal;
  return 1.1 * cal;
}

function gunStats(g, group, extra = {}) {
  const cal = g.caliberMm;
  return {
    group, cal, bore: g.boreCalibers || 40,
    v0: g.muzzleVelocityMs || 800, shellKg: g.shellKg || Math.pow(cal / 100, 3) * 15,
    maxRange: g.maxRangeM || cal * 90, maxElevDeg: Math.min(g.maxElevationDeg || 45, 85),
    reload: g.reloadSecPerGun || 8, trainRate: g.trainRateDegS || (cal >= 300 ? 4 : cal >= 190 ? 6 : 15),
    pen0: penAtMuzzle(cal),
    // AP capable only for the heavier guns
    ap: cal >= 150,
    ...extra,
  };
}

export function makeStats(spec) {
  const t = spec.type;
  const L = spec.loa, dispFull = spec.displacementFull || spec.displacementStd * 1.15;
  const maxSpeed = spec.speedKn * KN;
  const main = gunStats(spec.main, 'main');
  const secs = (spec.secondary || []).map((s, i) => ({ s, i })).filter(({ s }) => s.caliberMm >= 70 && s.mounts > 0).map(({ s, i }) => gunStats(s, 'sec', { specIndex: i }));
  const arm = spec.armour || {};
  const stats = {
    id: spec.id, nation: spec.nation, type: t, className: spec.className, refShip: spec.refShip, classShips: spec.classShips || [spec.refShip],
    L, B: spec.beam, D: spec.draft, dispFull,
    maxSpeed, accel: maxSpeed / ACCEL_SECONDS[t], decel: maxSpeed / (ACCEL_SECONDS[t] * 0.6),
    turnRadius: TURN_FACTOR[t] * L, rudderRate: t === 'DD' ? 0.22 : t === 'BB' || t === 'CV' ? 0.1 : 0.14,
    maxHp: Math.round(dispFull * HP_FACTOR[t]),
    armor: {
      belt: arm.beltMm ?? (t === 'DD' ? 5 : 20), deck: arm.deckMm ?? (t === 'DD' ? 6 : 25),
      turretFace: arm.turretFaceMm ?? (t === 'DD' ? 12 : t === 'CV' ? 20 : 40), turretSide: arm.turretSideMm ?? (arm.turretFaceMm ? arm.turretFaceMm * 0.5 : 20),
      citadel: arm.conningTowerMm ?? 30,
    },
    main, secs,
    torpedo: spec.torpedoes && spec.torpedoes.tubes ? {
      tubes: spec.torpedoes.tubes, speed: (spec.torpedoes.speedKn || 40) * KN, range: spec.torpedoes.rangeM || 7000,
      warhead: spec.torpedoes.warheadKg || 300, cal: spec.torpedoes.caliberMm || 533,
    } : null,
    air: spec.aircraft && t === 'CV' ? { capacity: spec.aircraft.capacity || 30 } : null,
    // anti-aircraft strength (barrels), rough: all secondary + light AA estimated from displacement
    aaPower: Math.round(Math.sqrt(dispFull) * 0.35 + secs.reduce((a, s, i) => a + (s.cal <= 140 ? 6 : 1), 0)),
    // gameplay-scaled magazine / turret toughness
    mountHp: (cal) => (cal >= 300 ? 900 : cal >= 180 ? 520 : cal >= 120 ? 240 : 110),
    // chance that a penetrating hit in the citadel detonates the magazine
    magazineChance: { DD: 0.35, CL: 0.14, CA: 0.11, BB: 0.035, CV: 0.05 }[t],
    // fraction of torpedo damage that gets through underwater protection
    torpFactor: { DD: 1.3, CL: 1.0, CA: 0.9, BB: 0.6, CV: 0.8 }[t],
    sinkTime: { DD: 28, CL: 45, CA: 55, BB: 90, CV: 80 }[t],
    softness: { DD: 1.0, CL: 0.85, CA: 0.65, BB: 0.28, CV: 0.55 }[t],     // damage taken from HE / unarmoured hits
    score: { DD: 1, CL: 1.5, CA: 2.2, BB: 4, CV: 3.5 }[t],
    visualRange: 32000,
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
