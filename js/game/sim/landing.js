// Where an aircraft that is going home lands. As long as there is somewhere it can land, it lands: its own carrier or airfield, or the nearest friendly one that has room for it (an
// aircraft of an airfield may come down on a carrier that is nearer than the field, a carrier aircraft on a field). A carrier aircraft (a dive bomber, a torpedo bomber, a carrier fighter,
// with a hook and folding wings) can use a deck or a runway; a land-based bomber, a runway only. A carrier takes no more than its air group, an airfield as many as it has places on
// its apron. The aircraft that is sent elsewhere becomes part of the air group of the field or the ship that takes it in.

/** Can this aircraft land on a carrier (the hook, the folding wings, the strength of a deck landing): the carrier aircraft, not the land-based bombers and the floatplanes. */
export const carrierCapable = (p) => !!p.spec && !p.spec.engines && p.spec.role !== 'float' && p.spec.role !== 'level';

const HOME_BIAS = 0.8;       // the home site counts for 0.8 of its distance (the aircraft goes home unless another site is much nearer)
const MARGIN = 6000;         // m: the aircraft does not change its mind for a site that is only a little nearer

/** Aircraft that have been sent to this ship or this field as visitors and have not yet landed. */
function visitors(world, host, ship) {
  let n = 0;
  for (const q of world.planes) if (q.visitor === host && !q.dying && !q.gone && !q.landedAt) n++;
  return n;
}

/** Does the ship have a place on board for one more aircraft (its air group is below the hangar's capacity, counting the visitors on their way)? */
function shipHasRoom(world, ship) {
  const air = ship.air;
  if (!air) return false;
  return air.ready + air.fReady + air.servicing.length + visitors(world, ship) < ship.stats.air.capacity;
}

/** The free place on the apron of a field (a slot nobody holds), the one nearest the taxiway first; -1 when it is full. */
function freeSlot(base) {
  for (let i = 0; i < base.parked.length; i++) if (!base.parked[i]) return i;
  return -1;
}

function fieldHasRoom(world, base) {
  let free = 0;
  for (let i = 0; i < base.parked.length; i++) if (!base.parked[i]) free++;
  return free - visitors(world, base) > 0;
}

/**
 * The site where the aircraft should land: { kind: 'ship', ship } or { kind: 'base', base } (null when there is none: it ditches when its fuel runs out). `home` is the one it
 * belongs to (the ship that launched it, or its field): kept unless it cannot take the aircraft, or another site is nearer by a good margin.
 */
export function chooseSite(world, p) {
  const canDeck = carrierCapable(p);
  let best = null, bd = Infinity;
  const home = p.base || p.owner;
  for (const s of world.ships) {
    if (s.team !== p.team || !s.alive || s.deckWrecked || !s.air || !canDeck || !s.model.deckPoints.x1) continue;
    if (s !== home && !shipHasRoom(world, s)) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z) * (s === home ? HOME_BIAS : 1);
    if (d < bd) { bd = d; best = { kind: 'ship', ship: s }; }
  }
  if (world.bases) for (const b of world.bases) {
    if (b.team !== p.team || b.layout.kind !== 'airfield' || !b.alive || b.inert || !b.air) continue;
    if (b !== p.base && !fieldHasRoom(world, b)) continue;
    const d = Math.hypot(b.layout.x - p.x, b.layout.z - p.z) * (b === p.base ? HOME_BIAS : 1);
    if (d < bd) { bd = d; best = { kind: 'base', base: b }; }
  }
  if (best && home) {
    // (a site that is only a little nearer than home does not change the aircraft's mind)
    const homeSite = home.isBase ? null : home;
    const same = best.kind === 'ship' ? best.ship === homeSite : best.base === p.base;
    if (!same) {
      const hx = p.base ? p.base.layout.x : home.x, hz = p.base ? p.base.layout.z : home.z;
      const homeOk = p.base ? p.base.alive && !p.base.inert : home.alive && !home.deckWrecked && !!home.air;
      if (homeOk && Math.hypot(hx - p.x, hz - p.z) * HOME_BIAS - bd < MARGIN) return p.base ? { kind: 'base', base: p.base } : { kind: 'ship', ship: home };
    }
  }
  return best;
}

/**
 * Send the aircraft to the site: it belongs to it from now on (its owner, its field), and goes into its landing procedure (the circuit of the carrier, the circuit of the field).
 * Returns false when the site cannot take it after all (a field with no free place).
 */
export function divert(world, p, site) {
  if (p.home === undefined) p.home = p.base || p.owner;       // (where it came from: it counts for the visitors of the place that takes it in)
  if (site.kind === 'ship') {
    const s = site.ship;
    if (p.base) { const b = p.base; if (b.parked[p.slot] === p) b.parked[p.slot] = null; p.base = null; p.ground = false; }
    p.owner = s; p.visitor = s !== p.home ? s : null; p.landedAt = false;
    p.phase = 'return'; p.leg = null; p.t = 0; p.asm = null; p.siteT = 5;
    return true;
  }
  const b = site.base, slot = freeSlot(b);
  if (slot < 0 && b !== p.base) return false;
  if (b !== p.base) {
    if (p.base && p.base.parked[p.slot] === p) p.base.parked[p.slot] = null;
    p.base = b; p.owner = b.owner; p.slot = slot; b.parked[slot] = p; p.visitor = b !== p.home ? b : null; p.landedAt = false;
    p.ground = false;
  }
  p.phase = 'return'; p.leg = null; p.t = 0; p.asm = null; p.gearDown = false; p.siteT = 5;
  return true;
}
