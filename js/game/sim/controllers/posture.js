// How a captain turns his ship to the enemy's fire: broadside gives every gun a bearing and the enemy the whole length to hit; angled (the bow or the stern turned towards the
// enemy) the belt meets the shells at a slant, so that the plate counts for more and the shell may not go through, and the enemy has less ship to hit, at the price of the guns
// that no longer bear. The offset is chosen by what the exchange is worth: the share of the guns that bear against the share of the enemy's hits that go through, times the
// ship he can see.
import { gunBallistics } from '../ballistics.js';
import { effectiveThickness, V_EXP } from '../penetration.js';
import { inArcRel } from '../../model/clearance.js';
import { wrapPi } from '../../math.js';

const D2R = Math.PI / 180;
const STEPS = [0, 8, 16, 24, 32, 40, 48, 56];

/** Share of the shells of `enemy` (AP at this range) that the belt of `ship` lets through, turned `theta` rad off broadside: 0..1. */
function beltPenShare(ship, enemy, range, theta) {
  const g = enemy.stats.main, a = ship.stats.armor;
  const b = gunBallistics({ cal: g.cal, v0: g.v0, shellKg: g.shellKg, maxRange: g.maxRange, maxElevDeg: Math.min(g.maxElevDeg, 50) });
  const lk = b.lookup(range);
  if (!lk) return 0;
  const pen = g.pen0 * Math.pow(lk.vImpact / g.v0, V_EXP);
  const belt = Math.max(a.belt, a.skin), incl = (a.incl || 0) * D2R;
  const cb = Math.min(1, Math.max(0, Math.cos(lk.fall) * Math.cos(theta) * Math.cos(incl) + Math.sin(lk.fall) * Math.sin(incl)));
  const eff = effectiveThickness(belt, Math.acos(cb) / D2R);
  return Math.min(1, Math.max(0, 0.5 + (pen - eff) / (0.3 * pen)));
}

/** The share of the main guns (by barrels) that bear on an enemy at `rel` rad from the bow. */
function gunsBearing(ship, rel) {
  let n = 0, all = 0;
  for (const m of ship.mounts) {
    if (m.group !== 'main' || !m.alive) continue;
    all += m.n;
    const r = inArcRel(m.rec, wrapPi(rel - m.rec.arcC));
    if (!m.rec.noArc && r >= m.rec.arcMin - 0.03 && r <= m.rec.arcMax + 0.03) n += m.n;
  }
  return all ? n / all : 1;
}

/**
 * The offset from broadside (degrees) at which to hold `ship` against `enemy` at `range`, and whether bow or stern goes to the enemy: positive = the bow turned towards him
 * (the heading is `bearing + circle * (90 - offset)`), negative = the stern. `circle` is the side the ship circles to (+1 / -1), `prev` the offset held so far (a change is made
 * only for a gain worth it, so that the ship does not swing from one to the other).
 */
export function chooseOffset(ship, enemy, range, circle, prev = 0) {
  const st = ship.stats, ratio = st.B / st.L;
  let best = { v: -1, off: 0 }, cur = null;
  for (const sign of [1, -1]) for (const deg of STEPS) {
    if (deg === 0 && sign < 0) continue;
    const th = deg * D2R, off = sign * deg;
    const phi = (90 - off) * D2R;
    const f = gunsBearing(ship, -circle * phi);
    const area = Math.cos(th) + ratio * Math.sin(th);
    const p = beltPenShare(ship, enemy, range, th);
    const v = f / (area * (0.3 + 0.7 * p));
    if (Math.abs(off - prev) < 4) cur = { v, off };
    if (v > best.v) best = { v, off };
  }
  if (cur && best.v < cur.v * 1.08) return cur.off;
  return best.off;
}
