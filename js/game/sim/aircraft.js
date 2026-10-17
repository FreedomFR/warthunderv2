// Carrier aircraft: air strikes launched from the flight deck (torpedo bombers and dive bombers),
// shot at by the ships' anti-aircraft fire, landing back on the carrier.
import { clamp, wrapPi, approach, D2R } from '../math.js';

const CRUISE_ALT = 700;
const SPEED = 88;               // m/s (~170 kn)
const AA_RANGE = 4200;
let nextPlane = 1;

function bestTarget(world, team, fromX, fromZ) {
  let best = null, bs = -1e9;
  for (const s of world.ships) {
    if (s.team === team || !s.alive) continue;
    const d = Math.hypot(s.x - fromX, s.z - fromZ);
    if (d > 90000) continue;
    // prefer valuable ships, then near ones
    const sc = s.stats.score * 6000 - d + (s.hpFrac < 0.6 ? 3000 : 0) + world.rng() * 2500;
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}

export function updateAir(world, dt) {
  // ---- launches ----
  for (const ship of world.ships) {
    const air = ship.air;
    if (!air || !ship.alive) continue;
    air.cooldown -= dt;
    if (ship.cmd.air.launch && air.cooldown <= 0 && air.ready >= 4) {
      const target = bestTarget(world, ship.team, ship.x, ship.z);
      if (!target) continue;
      const n = Math.min(air.ready, Math.round(6 + world.rng() * 5));
      air.ready -= n;
      air.cooldown = 130 + world.rng() * 60;
      air.wave++;
      const dp = ship.model.deckPoints;
      for (let i = 0; i < n; i++) {
        const lx = dp ? dp.x0 + 8 + (i % 6) * 6 : 0, lz = ((i % 3) - 1) * 4;
        const wp = [0, 0, 0];
        ship.toWorld(lx, (ship.model.fdY || 17) + 1, lz, wp);
        world.planes.push({
          id: nextPlane++, owner: ship, team: ship.team, kind: i % 5 < 3 ? 'torp' : 'dive',
          x: wp[0], y: wp[1], z: wp[2], heading: ship.heading, pitch: 0, roll: 0, speed: ship.speed + 4,
          phase: 'takeoff', t: -i * 1.1, target, hp: 1, bank: 0, leader: i === 0, dropped: false,
          jitter: (world.rng() - 0.5) * 120,
        });
      }
      world.events.push({ type: 'airLaunch', ship, count: n });
    }
  }

  // ---- flight ----
  const arr = world.planes;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.t += dt;
    if (p.t < 0) { // waiting its turn on the deck
      const o = p.owner;
      if (o && o.alive) { p.x += o.vx * dt; p.z += o.vz * dt; p.heading = o.heading; }
      continue;
    }
    // AA fire
    let kill = 0;
    for (const s of world.ships) {
      if (s.team === p.team || !s.alive) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < AA_RANGE && p.y < 3500) kill += s.stats.aaPower * 0.00085 * Math.pow(1 - d / AA_RANGE, 1.4);
      if (d < AA_RANGE && world.rng() < dt * 1.5 && s.model.aa.length) {
        const a = s.model.aa[Math.floor(world.rng() * s.model.aa.length)];
        world.events.push({ type: 'aaFire', ship: s, plane: p, lx: a[0], ly: a[1], lz: a[2] });
      }
    }
    if (p.phase !== 'takeoff' && world.rng() < kill * dt) {
      world.events.push({ type: 'planeDown', plane: p, x: p.x, y: p.y, z: p.z });
      if (p.owner) p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1;
      arr.splice(i, 1);
      continue;
    }

    const tgt = p.target;
    const o = p.owner;
    let wantHeading = p.heading, wantAlt = CRUISE_ALT, wantSpeed = SPEED;

    if (p.phase === 'takeoff') {
      p.speed = approach(p.speed, 62, 14 * dt);
      p.y += (p.t > 3 ? 7 * dt : 0);
      if (o && o.alive && p.t < 3) { /* roll along the deck */ }
      if (p.t > 4) { p.phase = 'cruise'; }
      wantAlt = p.y;
    } else if (p.phase === 'cruise') {
      if (!tgt || !tgt.alive) { p.target = bestTarget(world, p.team, p.x, p.z); if (!p.target) p.phase = 'return'; }
      else {
        const dx = tgt.x + tgt.vx * 20 - p.x, dz = tgt.z + tgt.vz * 20 - p.z;
        const range = Math.hypot(dx, dz);
        wantHeading = Math.atan2(dx, -dz) + (range > 3500 ? p.jitter / range : 0);
        wantAlt = p.kind === 'torp' ? (range < 6000 ? 45 : CRUISE_ALT * 0.6) : CRUISE_ALT;
        if (p.kind === 'torp' && range < 1100) p.phase = 'attack';
        if (p.kind === 'dive' && range < 2100) p.phase = 'attack';
      }
    } else if (p.phase === 'attack') {
      if (!tgt || !tgt.alive) { p.phase = 'egress'; }
      else {
        const dx = tgt.x + tgt.vx * 8 - p.x, dz = tgt.z + tgt.vz * 8 - p.z;
        const range = Math.hypot(dx, dz);
        wantHeading = Math.atan2(dx, -dz);
        if (p.kind === 'torp') {
          wantAlt = 40;
          if (!p.dropped && range < 900 && Math.abs(wrapPi(wantHeading - p.heading)) < 0.25) {
            p.dropped = true;
            const a = p.heading;
            world.spawnTorpedo({ owner: p.owner, x: p.x, z: p.z, vx: Math.sin(a) * 22, vz: -Math.cos(a) * 22, speed: 22, range: 2200, warhead: 250, team: p.team });
            world.events.push({ type: 'torpedoLaunch', ship: p.owner, x: p.x, z: p.z, bearing: a, air: true });
            p.phase = 'egress'; p.t = 0;
          }
        } else {
          // steep dive towards the target
          const tAlt = clamp(range * 0.9, 150, 1500);
          wantAlt = Math.max(tAlt - 400, 80);
          if (p.y < 300 && !p.dropped) {
            p.dropped = true;
            const hitP = 0.2 + 0.25 * clamp(tgt.stats.L / 200, 0.5, 1.3);
            if (world.rng() < hitP) bombHit(world, p, tgt);
            else world.events.push({ type: 'splash', x: tgt.x + (world.rng() - 0.5) * 120, z: tgt.z + (world.rng() - 0.5) * 120, cal: 250 });
            p.phase = 'egress'; p.t = 0;
          }
        }
      }
    } else if (p.phase === 'egress') {
      wantAlt = CRUISE_ALT * 0.8;
      wantHeading = p.heading + (p.jitter > 0 ? 0.02 : -0.02);
      if (p.t > 14) p.phase = 'return';
    } else if (p.phase === 'return') {
      if (!o || !o.alive) { p.phase = 'ditch'; continue; }
      const dx = o.x - p.x, dz = o.z - p.z;
      const range = Math.hypot(dx, dz);
      wantHeading = Math.atan2(dx, -dz);
      wantAlt = range < 1800 ? Math.max(40, range * 0.1) : CRUISE_ALT * 0.8;
      wantSpeed = range < 700 ? 55 : SPEED;
      if (range < 160 && p.y < 40) {
        o.air.ready++;
        world.events.push({ type: 'planeLanded', plane: p });
        arr.splice(i, 1);
        continue;
      }
    } else if (p.phase === 'ditch') {
      wantAlt = 0; wantSpeed = 50;
      if (p.y <= 2) { world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 150 }); arr.splice(i, 1); continue; }
    }

    // kinematics: turn rate limited, altitude via pitch
    const err = wrapPi(wantHeading - p.heading);
    const turn = clamp(err, -0.9 * dt, 0.9 * dt);
    p.heading += turn;
    p.bank += (clamp(-err * 1.2, -0.7, 0.7) - p.bank) * Math.min(1, dt * 3);
    const dAlt = wantAlt - p.y;
    const maxPitch = p.phase === 'attack' && p.kind === 'dive' ? 0.9 : 0.25;
    const pitchT = clamp(dAlt / 400, -maxPitch, maxPitch * 0.7);
    p.pitch += (pitchT - p.pitch) * Math.min(1, dt * 1.5);
    if (p.phase !== 'takeoff') p.speed = approach(p.speed, wantSpeed, 12 * dt);
    p.x += Math.sin(p.heading) * Math.cos(p.pitch) * p.speed * dt;
    p.z += -Math.cos(p.heading) * Math.cos(p.pitch) * p.speed * dt;
    p.y += Math.sin(p.pitch) * p.speed * dt;
    if (p.y < 3 && p.phase !== 'takeoff') p.y = 3;
  }
}

function bombHit(world, plane, ship) {
  const st = ship.stats;
  const lx = (world.rng() - 0.5) * st.L * 0.5, lz = (world.rng() - 0.5) * st.B * 0.4;
  const deckY = ship.model.hull.deckY(lx);
  const w = [0, 0, 0];
  ship.toWorld(lx, deckY, lz, w);
  const dmg = 650 * (st.type === 'CV' ? 1.3 : st.softness * 1.2) * (0.8 + 0.4 * world.rng());
  if (plane.owner) { plane.owner.damageDealt += dmg; plane.owner.shotsHit++; }
  if (ship.fires.length < 8 && world.rng() < 0.55) ship.fires.push({ x: lx, y: deckY + 1, z: lz, t: world.rng() * 30 + 25, power: 0.9 });
  world.events.push({ type: 'impact', kind: 'explode', x: w[0], y: w[1], z: w[2], cal: 250, ship, lx, ly: deckY, lz });
  ship.applyDamage(dmg, plane.owner, 'bomb');
}
