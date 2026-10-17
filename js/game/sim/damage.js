// Impact resolution: shells and torpedoes against ships. Armour, penetration, fires, flooding,
// turret and engine damage, magazine explosions.
import { clamp, D2R } from '../math.js';

const _l = [0, 0, 0];

/** Is the local point inside the ship's hull volume? */
function insideHull(ship, lx, ly, lz) {
  const m = ship.model, st = ship.stats;
  if (Math.abs(lx) > st.L / 2) return false;
  const deck = m.hull.deckY(lx);
  if (ly > deck + 0.3 || ly < -st.D) return false;
  const hbDeck = m.hull.halfBeamDeck(lx), hbWl = m.hull.halfBeamWL(lx);
  let hb;
  if (ly >= 0) hb = hbWl + (hbDeck - hbWl) * clamp(ly / Math.max(deck, 1), 0, 1);
  else hb = hbWl * (1 - Math.pow(-ly / st.D, 2.6));
  return Math.abs(lz) <= hb;
}

function insideSuper(ship, lx, ly, lz) {
  const sb = ship.model.superBox;
  if (!sb) return false;
  const top = sb.y1 + 2;
  const deck = ship.model.hull.deckY(lx);
  return lx >= sb.x0 && lx <= sb.x1 && Math.abs(lz - (sb.zc || 0)) <= sb.hw && ly > deck && ly <= top;
}

function insideMount(ship, lx, ly, lz) {
  for (const m of ship.mounts) {
    if (!m.alive) continue;
    const r = Math.max(m.rec.cal / 1000 * 6, 1.3);
    const dx = lx - m.rec.x, dz = lz - m.rec.z;
    if (dx * dx + dz * dz <= r * r && ly >= m.rec.y - 1.8 && ly <= m.rec.y + 3.4 + m.rec.cal / 200) return m;
  }
  return null;
}

/** Fast reject: closest approach of the segment p0->p1 to the ship's centre vs its bounding radius. */
export function segmentNearShip(ship, x0, y0, z0, x1, y1, z1) {
  const r = ship.model.radius + 5;
  const dx = x1 - x0, dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((ship.x - x0) * dx + (ship.z - z0) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = x0 + dx * t - ship.x, cz = z0 + dz * t - ship.z;
  return cx * cx + cz * cz <= r * r;
}

/**
 * March the segment through the ship's volumes. Returns the first hit
 * { t, part: 'hull' | 'super' | 'mount' | 'deck', lx, ly, lz, mount } or null.
 */
export function segmentHit(ship, x0, y0, z0, x1, y1, z1) {
  if (ship.state === 'sunk') return null;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const n = Math.max(2, Math.ceil(len / 1.2));
  let prevInside = false;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    ship.toLocal(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, _l);
    const lx = _l[0], ly = _l[1], lz = _l[2];
    // ship pitch / roll are ignored for hit detection (small angles)
    const mnt = insideMount(ship, lx, ly, lz);
    if (mnt) return { t: f, part: 'mount', lx, ly, lz, mount: mnt };
    if (insideSuper(ship, lx, ly, lz)) return { t: f, part: 'super', lx, ly, lz };
    if (insideHull(ship, lx, ly, lz)) {
      const deck = ship.model.hull.deckY(lx);
      const part = ly > deck - 0.8 ? 'deck' : 'hull';
      return { t: f, part, lx, ly, lz };
    }
  }
  return null;
}

function addFire(ship, lx, ly, lz, power) {
  if (ship.fires.length >= 8) { ship.fires[0].t += 6; return; }
  ship.fires.push({ x: lx, y: ly, z: lz, t: ship.world.rng.range(22, 55), power });
}

/** Resolve a shell hit. Returns nothing; mutates the ship and emits events. */
export function resolveShellHit(world, ship, shell, hit) {
  const g = shell.gun, st = ship.stats, rng = world.rng;
  const speed = Math.hypot(shell.vx, shell.vy, shell.vz);
  const dirx = shell.vx / speed, diry = shell.vy / speed, dirz = shell.vz / speed;
  // local velocity direction
  const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
  const ldx = dirx * sh - dirz * ch, ldy = diry, ldz = dirx * ch + dirz * sh;
  const L = st.L;
  const frac = (L / 2 - hit.lx) / L;
  const cit = ship.model.zones.citadel;
  const inCitadel = frac >= cit[0] && frac <= cit[1];
  const owner = shell.owner;
  const cal = g.cal;
  const kg = g.shellKg;
  const isAP = shell.type === 'AP';
  let armor = 0, dmg = 0, kind = 'explode', cosA = 1;
  let part = hit.part;
  const w = ship.world;

  // armour and incidence angle for the struck surface
  if (part === 'hull') {
    // vertical side: normal along z
    cosA = Math.abs(ldz);
    if (hit.ly > -2.5 && hit.ly < 3.2 && inCitadel) armor = st.armor.belt;
    else if (hit.ly <= -2.5) armor = st.armor.belt * 0.4;
    else armor = Math.max(st.armor.belt * 0.12, 18);
  } else if (part === 'deck') {
    cosA = Math.abs(ldy);
    armor = inCitadel ? st.armor.deck : Math.max(st.armor.deck * 0.2, 12);
  } else if (part === 'super') {
    cosA = 0.7; armor = Math.min(30, st.armor.citadel * 0.15 + 12);
  } else if (part === 'mount') {
    const m = hit.mount;
    // front arc of the turret gets the thick plate
    const yaw = ship.heading + m.rec.arcC + m.trainRel;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const toShell = -(dirx * fx + dirz * fz);   // >0 when the shell comes from the front
    armor = toShell > 0.45 ? st.armor.turretFace : st.armor.turretSide;
    cosA = 0.75;
    if (m.rec.kind === 'dp') armor = Math.max(armor * 0.2, 25);
  }
  cosA = Math.max(cosA, 0.17);
  const eff = armor / cosA;
  const pen = isAP ? g.pen0 * Math.pow(speed / g.v0, 1.43) : cal * 0.18 * Math.pow(speed / g.v0, 1.43);

  const where = [0, 0, 0];
  ship.toWorld(hit.lx, hit.ly, hit.lz, where);

  const emit = (k) => w.events.push({ type: 'impact', kind: k, x: where[0], y: where[1], z: where[2], cal, ship, lx: hit.lx, ly: hit.ly, lz: hit.lz });

  if (isAP) {
    if (pen > eff) {
      // AP shells over-penetrate thin structures without detonating
      const thin = eff < cal * 0.12;
      if (thin && part !== 'mount') {
        dmg = kg * 0.06 * st.softness;
        kind = 'through';
        if (rng() < 0.12) addFire(ship, hit.lx, hit.ly, hit.lz, 0.5);
      } else {
        // detonates inside
        let zone = 0.25;
        if (part === 'hull' || part === 'deck') zone = inCitadel && hit.ly < 3.2 ? 1.0 : 0.38;
        if (part === 'mount') zone = 0.5;
        dmg = kg * 0.95 * zone * (0.85 + 0.3 * rng());
        kind = 'penetrate';
        if (rng() < 0.30) addFire(ship, hit.lx, Math.max(hit.ly, 1), hit.lz, 0.8);
        // flooding for waterline hits
        if ((part === 'hull') && hit.ly < 1.8) ship.floodRate += kg * 0.04;
        if (inCitadel && (part === 'hull' || part === 'deck')) {
          // engine / magazine
          if (rng() < 0.28) ship.engine = Math.max(0.15, ship.engine - 0.2 - 0.3 * rng());
          let near = 0.0;
          for (const m of ship.mounts) if (m.rec.group === 'main' && Math.abs(hit.lx - m.rec.x) < 18) { near = 1; break; }
          const pm = st.magazineChance * clamp(cal / 250, 0.2, 1.2) * (near ? 2.0 : 0.5);
          if (rng() < pm) { world.magazineExplosion(ship, owner, where); return; }
        }
        if (hit.lx < -st.L * 0.38 && rng() < 0.12) { ship.rudderJam = (rng() < 0.5 ? -1 : 1) * 0.6; }
        if (part === 'mount') damageMount(world, ship, hit.mount, kg * 1.0, owner, true);
      }
    } else {
      dmg = kg * 0.035;
      kind = 'bounce';
      if (part === 'mount') damageMount(world, ship, hit.mount, kg * 0.12, owner, false);
    }
  } else {
    // HE: bursts on contact
    let zone = 1.0;
    if (part === 'hull' || part === 'deck') zone = eff > cal * 0.5 ? 0.1 : 0.55;
    if (part === 'mount') zone = 0.3;
    dmg = kg * 0.2 * st.softness * zone * (0.8 + 0.4 * rng());
    kind = eff > cal * 0.9 ? 'bounce' : 'explode';
    const fireP = (part === 'super' || zone > 0.4) ? 0.22 : 0.07;
    if (rng() < fireP) addFire(ship, hit.lx, Math.max(hit.ly, 1), hit.lz, 0.55);
    // blast damages nearby mounts and AA
    for (const m of ship.mounts) {
      if (!m.alive) continue;
      const dx = m.rec.x - hit.lx, dz = m.rec.z - hit.lz;
      if (dx * dx + dz * dz < 36) damageMount(world, ship, m, kg * 0.6 * zone, owner, false);
    }
    if (hit.lx < -st.L * 0.38 && part !== 'super' && rng() < 0.04) ship.rudderJam = (rng() < 0.5 ? -1 : 1) * 0.6;
  }
  emit(kind);
  if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
  ship.applyDamage(dmg, owner, 'shell');
}

function damageMount(world, ship, m, amount, owner, penetrated) {
  if (!m || !m.alive) return;
  m.hp -= amount;
  if (m.hp <= 0) {
    m.alive = false;
    world.events.push({ type: 'mountKilled', ship, mount: m });
    // ammunition fire in the turret
    if (penetrated || world.rng() < 0.3) {
      ship.fires.push({ x: m.rec.x, y: m.rec.y + 1.5, z: m.rec.z, t: world.rng.range(35, 70), power: 1.0 });
      ship.applyDamage(ship.stats.maxHp * (m.rec.group === 'main' ? 0.012 : 0.003), owner, 'turret');
    }
  }
}

/** Torpedo hit on the hull side at local lx. */
export function resolveTorpedoHit(world, ship, torp, wx, wz) {
  const st = ship.stats;
  ship.toLocal(wx, 0, wz, _l);
  const lz = _l[2], lx = _l[0];
  const dmg = torp.warhead * 6 * st.torpFactor * (0.85 + 0.3 * world.rng());
  ship.floodRate += dmg * 0.012;
  ship.listSide = lz >= 0 ? 1 : -1;
  if (torp.owner) { torp.owner.damageDealt += dmg; torp.owner.torpHits++; torp.owner.shotsHit++; }
  ship.engine = Math.max(0.2, ship.engine - 0.15 * world.rng());
  world.events.push({ type: 'impact', kind: 'torpedo', x: wx, y: 0, z: wz, cal: 600, ship, lx, ly: -1.5, lz });
  ship.applyDamage(dmg, torp.owner, 'torpedo');
}
