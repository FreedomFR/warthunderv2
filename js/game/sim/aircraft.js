// Carrier aircraft. A wave of dive bombers and torpedo bombers takes off from the flight deck, flies to the
// enemy, attacks (bombs are dropped from a steep dive, torpedoes from a low level run), is shot at by the
// ships' anti-aircraft guns (damaged aircraft smoke, burn and fall until they hit the sea or a ship), then
// returns and lands on the carrier. Bombs and torpedoes are simulated bodies, so where they hit decides the damage.
import { clamp, wrapPi, approach, D2R, G } from '../math.js';
import { planeTypeFor, PLANES, groundY } from '../model/planes.js';
import { segmentNearShip, segmentHit, resolveBombHit, resolveNearMiss, resolveCrashHit } from './damage.js';
import { spawnPlaneDebris, spawnScrap } from './debris.js';

let nextPlane = 1;
let nextBomb = 1;

const V_CRUISE = 84;           // m/s (~165 kn)
const V_TORP = 72;
const TAKEOFF_RUN = 135;       // distance before the bow where the take-off run starts (m)

/** Range, rate and damage of a light AA calibre (per mount, per barrel). */
const AA = {
  oerlikon: { range: 1900, rps: 6.5, dps: 0.0068, hit: 0.34, turn: 75 },
  iijn25: { range: 2600, rps: 3.4, dps: 0.0058, hit: 0.4, turn: 60 },
  bofors: { range: 4200, rps: 1.9, dps: 0.0105, hit: 0.9, turn: 55 },
};
const FLAK_RANGE = 7500;

const rn = (world, a, b) => a + (b - a) * world.rng();

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
  launches(world, dt);
  flight(world, dt);
  updateAA(world, dt);
  stepBombs(world, dt);
}

// ---- launch ------------------------------------------------------------------------------------------------------
function launches(world, dt) {
  for (const ship of world.ships) {
    const air = ship.air;
    if (!air || !ship.alive) continue;
    air.cooldown -= dt;
    ship._parkT = (ship._parkT || 0) - dt;
    if (ship._parkT <= 0) { ship._parkT = 1; ship.updateParked(); }
    if (!(ship.cmd.air.launch && air.cooldown <= 0 && air.ready >= 4) || ship.deckWrecked) continue;
    const target = bestTarget(world, ship.team, ship.x, ship.z);
    if (!target) continue;
    const n = Math.min(air.ready, Math.round(6 + world.rng() * 5));
    air.ready -= n;
    air.cooldown = 120 + n * 3.4 + world.rng() * 60;
    air.wave++;
    const dp = ship.model.deckPoints;
    const wave = { ship, n, id: air.wave, launched: 0 };
    const dive = planeTypeFor(ship.stats.nation, 'dive'), torp = planeTypeFor(ship.stats.nation, 'torp');
    const offs = [0, -0.7, 0.7, -0.35, 0.35, -1.0, 1.0, -0.5, 0.5, -0.15, 0.15];
    let ti = 0;
    for (let i = 0; i < n; i++) {
      const kind = i % 5 < 3 ? 'torp' : 'dive';
      const typeKey = kind === 'torp' ? torp : dive;
      const spec = PLANES[typeKey];
      const lx = dp.x1 - TAKEOFF_RUN - i * 9.5;
      const p = {
        id: nextPlane++, owner: ship, team: ship.team, kind, typeKey, spec, wave,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: ship.heading, pitch: 0, roll: 0, bank: 0, speed: 0,
        phase: 'queue', t: -(2 + i * 3.3), age: 0, target, hp: spec.hp, maxHp: spec.hp, ordnance: true,
        spin: 0, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
        lx, lz: 0, u: 0, apOff: kind === 'torp' ? offs[ti++ % offs.length] : 0, jitter: (world.rng() - 0.5) * 2,
        t0Air: 0, cruiseAlt: kind === 'dive' ? rn(world, 1500, 2000) : rn(world, 420, 650), relAlt: rn(world, 480, 620), fuel: 700 + world.rng() * 200,
        aimErr: [world.rng.normal(), world.rng.normal()], diveAng: rn(world, 58, 70) * D2R, group: i,
      };
      ship.toWorld(p.lx, ship.model.fdY + groundY(spec), 0, _w);
      p.x = _w[0]; p.y = _w[1]; p.z = _w[2];
      world.planes.push(p);
    }
    world.events.push({ type: 'airLaunch', ship, count: n });
  }
}
const _w = [0, 0, 0];

// ---- flight ------------------------------------------------------------------------------------------------------
function flight(world, dt) {
  const arr = world.planes;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.age += dt;
    p.t += dt;
    p.spin += dt * (p.lost.engine ? 0 : (p.phase === 'queue' && p.t < 0 ? 4 : 62 + (p.speed - 60) * 0.3));
    p.harass = Math.max(0, p.harass - dt * 0.35);
    const keep = p.dying ? stepDying(world, p, dt) : stepPlane(world, p, dt);
    if (!keep) arr.splice(i, 1);
  }
}

function setVel(p) {
  const cp = Math.cos(p.pitch);
  p.vx = Math.sin(p.heading) * cp * p.speed; p.vy = Math.sin(p.pitch) * p.speed; p.vz = -Math.cos(p.heading) * cp * p.speed;
}

/** Flight dynamics step: heading, flight-path angle and speed towards the commanded values. */
function guide(p, dt, hdgT, gamT, spdT, o = {}) {
  const v = Math.max(p.speed, 28);
  const bankMax = o.bankMax ?? 58 * D2R;
  const rateMax = G * Math.tan(bankMax) / v;
  const err = wrapPi(hdgT - p.heading);
  const yr = clamp(err * 1.7, -rateMax, rateMax);
  p.heading += yr * dt;
  if (o.bankOverride != null) p.bank += clamp(o.bankOverride - p.bank, -4 * dt, 4 * dt);
  else p.bank += clamp(Math.atan(yr * v / G) - p.bank, -1.4 * dt, 1.4 * dt);
  const pr = o.pitchRate ?? 0.32;
  p.pitch += clamp(gamT - p.pitch, -pr * dt, pr * dt);
  const acc = clamp(-G * Math.sin(p.pitch) + (spdT - p.speed) * 0.4, -5.5, 9);
  p.speed = Math.max(30, p.speed + acc * dt);
  setVel(p);
}

function stepPlane(world, p, dt) {
  const ship = p.owner;
  const spec = p.spec;
  // ---- queue and deck run ----
  if (p.phase === 'queue' || p.phase === 'takeoff' || p.phase === 'rollout') return stepDeck(world, p, dt);
  // fuel
  p.fuel -= dt;
  let tgt = p.target;
  if (p.kind && (!tgt || !tgt.alive) && (p.phase === 'cruise' || p.phase === 'ip' || p.phase === 'run' || p.phase === 'dive')) {
    p.target = tgt = bestTarget(world, p.team, p.x, p.z);
    if (!tgt) p.phase = 'return';
  }
  if (p.fuel < 0 && p.phase !== 'ditch' && p.phase !== 'floating' && p.phase !== 'final') p.phase = 'return';
  const carrierOk = ship && ship.alive && !ship.deckWrecked;
  if (p.gearDown && p.age > p.t0Air + 3 && p.phase !== 'pattern' && p.phase !== 'final' && p.phase !== 'waveoff') p.gearDown = false;

  let hdg = p.heading, gam = 0, spd = V_CRUISE, o = {};
  switch (p.phase) {
    case 'cruise': {
      const dx = tgt.x + tgt.vx * 30 - p.x, dz = tgt.z + tgt.vz * 30 - p.z;
      const range = Math.hypot(dx, dz);
      hdg = Math.atan2(dx, -dz);
      if (p.kind === 'dive') {
        // climb to the attack altitude on the way
        const want = Math.min(p.cruiseAlt, Math.max(p.y, 500 + range * 0.07));
        gam = clamp((p.cruiseAlt - p.y) / 700, -0.1, 0.1);
        if (range < 3600 || (range < 7000 && p.y > p.cruiseAlt - 150)) {
          // roll in from the side: lead the target a little and go over the top
          p.phase = 'rollin'; p.t = 0; p.rollSide = p.jitter > 0 ? 1 : -1;
          p.diveAlt = p.y;
        }
        spd = V_CRUISE;
      } else {
        const height = range > 15000 ? p.cruiseAlt : 55 + clamp((range - 5000) / 10000, 0, 1) * (p.cruiseAlt - 55);
        gam = clamp((height - p.y) / 500, -0.07, 0.09);
        // take position on an approach bearing around the target, so that the torpedo bombers arrive from different directions
        if (range < 9500) { p.phase = 'ip'; p.t = 0; const a = Math.atan2(p.x - tgt.x, -(p.z - tgt.z)); p.ipAngle = a + p.apOff * 0.9; }
        spd = V_TORP + 8;
      }
      break;
    }
    case 'ip': {      // torpedo bombers: fly to a point on their approach bearing, dropping to wave height
      const ipx = tgt.x + tgt.vx * 40 + Math.sin(p.ipAngle) * 4200, ipz = tgt.z + tgt.vz * 40 - Math.cos(p.ipAngle) * 4200;
      const dIp = Math.hypot(ipx - p.x, ipz - p.z);
      const rangeT = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      hdg = Math.atan2(ipx - p.x, -(ipz - p.z));
      gam = clamp((50 - p.y) / 300, -0.08, 0.06);
      spd = V_TORP;
      if (dIp < 700 || rangeT < 3300) { p.phase = 'run'; p.t = 0; }
      break;
    }
    case 'run': {     // straight and level torpedo run
      const range = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      const tt = range / 21;       // torpedo running speed ~ 42 kn
      const ax = tgt.x + tgt.vx * (tt + 3.5) - p.x, az = tgt.z + tgt.vz * (tt + 3.5) - p.z;
      hdg = Math.atan2(ax, -az);
      gam = clamp((46 - p.y) / 160, -0.1, 0.1);
      spd = V_TORP;
      o = { bankMax: 25 * D2R };
      const aligned = Math.abs(wrapPi(hdg - p.heading)) < 0.07;
      if (p.ordnance && range < 1000 + p.jitter * 120 && p.y < 90 && (aligned || range < 650)) dropTorpedo(world, p, tgt, range);
      if (!p.ordnance) { p.phase = 'break'; p.t = 0; }
      if (range < 300) { p.phase = 'break'; p.t = 0; }
      break;
    }
    case 'rollin': {      // the dive bomber rolls over and pulls its nose down onto the target
      const dx = tgt.x + tgt.vx * 20 - p.x, dz = tgt.z + tgt.vz * 20 - p.z;
      hdg = Math.atan2(dx, -dz);
      const u = clamp(p.t / 2.4, 0, 1);
      gam = -p.diveAng * Math.min(1, p.t / 1.6);
      o = { bankOverride: p.rollSide * (1.9 * Math.sin(u * Math.PI) + 0.1 * (1 - u)), pitchRate: 0.55 };
      spd = V_CRUISE + 20;
      if (p.t > 2.4) { p.phase = 'dive'; p.t = 0; p.gearDown = false; }
      break;
    }
    case 'dive': {
      // aim point: the ship (+ a systematic error, bigger when the pilot is being shot at)
      const err = 14 + 36 * clamp(p.harass, 0, 1.5);
      const tof = Math.sqrt(2 * Math.max(p.y, 50) / G) * 0.55;
      const ax = tgt.x + tgt.vx * (tof + 1.5) + p.aimErr[0] * err * 0.5, az = tgt.z + tgt.vz * (tof + 1.5) + p.aimErr[1] * err * 0.5;
      const dx = ax - p.x, dz = az - p.z;
      const range = Math.hypot(dx, dz);
      hdg = Math.atan2(dx, -dz);
      gam = clamp(-Math.atan2(Math.max(p.y - 8, 20), Math.max(range, 30)), -1.25, -0.65);
      o = { bankOverride: 0, pitchRate: 0.5 };
      spd = 125;
      if (p.ordnance && p.y <= p.relAlt && range < 1100) dropBomb(world, p, tgt);
      else if (p.ordnance && p.y < 260) dropBomb(world, p, tgt);
      if (!p.ordnance) { p.phase = 'pullout'; p.t = 0; }
      break;
    }
    case 'pullout': {
      hdg = p.heading + p.rollSide * 0.0;
      gam = 0.04;
      o = { pitchRate: (4.6 - 1) * G / Math.max(p.speed, 60), bankOverride: p.rollSide * 0.35 * Math.max(0, 1 - p.t / 3) };
      spd = 95;
      if (p.pitch > -0.05 || p.t > 7) { p.phase = 'egress'; p.t = 0; }
      break;
    }
    case 'break': {
      // torpedo bomber: hard turn away low over the water
      const ang = p.ipAngle ?? p.heading;
      hdg = p.heading + (p.jitter >= 0 ? 1 : -1) * 0.9;
      gam = clamp((70 - p.y) / 200, -0.05, 0.08);
      o = { bankMax: 62 * D2R };
      spd = V_TORP + 25;
      if (p.t > 5) { p.phase = 'egress'; p.t = 0; }
      break;
    }
    case 'egress': {
      // away from the enemy at low level, then climb
      const away = tgt ? Math.atan2(p.x - tgt.x, -(p.z - tgt.z)) : p.heading;
      hdg = away + p.jitter * 0.5;
      gam = p.t < 14 ? clamp((90 - p.y) / 200, -0.06, 0.06) : 0.1;
      spd = 95;
      if (p.t > 22) p.phase = 'return';
      break;
    }
    case 'return': {
      if (!carrierOk) { p.phase = 'ditch'; break; }
      const dx = ship.x - p.x, dz = ship.z - p.z;
      const range = Math.hypot(dx, dz);
      hdg = Math.atan2(dx, -dz);
      gam = clamp((650 - p.y) / 700, -0.08, 0.1);
      spd = V_CRUISE;
      if (range < 5200) { p.phase = 'pattern'; p.t = 0; p.gearDown = true; p.t0Air = p.age; }
      break;
    }
    case 'pattern': {   // join the final approach 3.2 km astern of the carrier, descending
      if (!carrierOk) { p.phase = 'ditch'; break; }
      const fx = Math.sin(ship.heading), fz = -Math.cos(ship.heading);
      const px = ship.x - fx * 3000 + ship.vx * 6, pz = ship.z - fz * 3000 + ship.vz * 6;
      const dx = px - p.x, dz = pz - p.z;
      hdg = Math.atan2(dx, -dz);
      gam = clamp((190 - p.y) / 500, -0.08, 0.05);
      spd = 62;
      p.gearDown = true;
      if (Math.hypot(dx, dz) < 450 || p.t > 60) { p.phase = 'final'; p.t = 0; }
      break;
    }
    case 'final': {
      if (!carrierOk) { p.phase = 'waveoff'; p.t = 0; break; }
      ship.toLocal(p.x, p.y, p.z, _l2);
      const lx = _l2[0], lz = _l2[2];
      const dp = ship.model.deckPoints;
      const behind = dp.x0 + 6 - lx;                          // metres astern of the touchdown point
      const deckY = ship.y + ship.model.fdY;
      hdg = ship.heading + clamp(-lz * 0.012, -0.3, 0.3) * clamp(behind / 600, 0.25, 1);
      const wantY = deckY + 3.5 + Math.max(0, behind) * 0.062;
      gam = clamp((wantY - p.y) / Math.max(120, behind * 0.6), -0.09, 0.06);
      spd = Math.max(ship.speed + 24, 44);
      o = { bankMax: 18 * D2R };
      p.gearDown = true;
      if (behind < 10 && behind > -80) {
        if (Math.abs(lz) < dp.hw * 0.75 && p.y - deckY < 9 && p.y - deckY > -3) {
          p.phase = 'rollout'; p.t = 0; p.lx = lx; p.lz = lz; p.u = Math.max(18, p.speed - ship.speed);
          world.events.push({ type: 'planeTouchdown', plane: p, ship });
          return true;
        }
        if (behind < -15) { p.phase = 'waveoff'; p.t = 0; }
      }
      if (behind > 2500) p.phase = 'pattern';
      break;
    }
    case 'waveoff': {
      hdg = p.heading; gam = 0.1; spd = 70;
      if (p.t > 22) { p.phase = 'return'; }
      break;
    }
    case 'ditch': {
      hdg = p.heading; gam = clamp(-(p.y - 2) / 260, -0.12, 0); spd = 48;
      p.gearDown = false;
      if (p.y <= 3) { ditch(world, p); return true; }
      break;
    }
    case 'floating': {
      p.t2 = (p.t2 || 0) + dt;
      p.speed = Math.max(0, p.speed - 14 * dt);
      setVel(p);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.y = 0.2 - Math.max(0, p.t2 - 7) * 0.6;
      p.pitch += (-0.06 - p.pitch) * dt; p.bank += (0.1 - p.bank) * dt;
      if (p.t2 < 8) world.events.push({ type: 'wakeStamp', x: p.x, z: p.z, vx: p.vx, vz: p.vz, kind: 'plane' });
      return p.t2 < 13;
    }
    default: break;
  }
  if (p.phase === 'return' && p.carrierOkLast !== carrierOk) p.carrierOkLast = carrierOk;
  const prev = _prev; prev[0] = p.x; prev[1] = p.y; prev[2] = p.z;
  guide(p, dt, hdg, gam, spd, o);
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  // never below the sea: a low pass over the water stays at a few metres
  if (p.y < 4 && p.phase !== 'ditch' && p.phase !== 'floating') {
    p.y = 4; if (p.pitch < 0) p.pitch = 0;
    if (p.phase === 'dive' || p.phase === 'rollin') { crash(world, p, null); return false; }
  }
  return collideShips(world, p, prev);
}
const _l2 = [0, 0, 0];
const _prev = [0, 0, 0];

/** Aircraft on the flight deck: queueing, take-off run, landing roll. */
function stepDeck(world, p, dt) {
  const ship = p.owner;
  if (!ship || ship.state === 'sunk' || !ship.model.deckPoints.x1) return false;
  const dp = ship.model.deckPoints;
  const gy = groundY(p.spec);
  if (p.phase === 'queue') {
    if (!ship.alive) return false;
    // taxi forward to the start of the run as the aircraft ahead launch
    const startX = dp.x1 - TAKEOFF_RUN;
    const queued = p.wave.n - p.wave.launched;
    const targetLx = startX - Math.max(0, p.group - p.wave.launched) * 9.5;
    p.lx += clamp(targetLx - p.lx, -4 * dt, 4 * dt);
    p.lz = 0;
    p.heading = ship.heading; p.speed = ship.speed; p.gearDown = true;
    ship.toWorld(p.lx, ship.model.fdY + gy, p.lz, _w);
    p.x = _w[0]; p.y = _w[1]; p.z = _w[2]; p.pitch = ship.pitch * 0.5; p.roll = ship.roll * 0.5; p.bank = ship.roll * 0.5;
    p.vx = ship.vx; p.vz = ship.vz; p.vy = 0;
    if (p.group === p.wave.launched && p.t >= 0 && Math.abs(p.lx - startX) < 1.5) { p.phase = 'takeoff'; p.t = 0; p.u = 0; p.wave.launched++; world.events.push({ type: 'planeLaunch', plane: p, ship }); }
    return true;
  }
  if (p.phase === 'takeoff') {
    p.u += 5.8 * dt;
    p.lx += p.u * dt;
    ship.toWorld(p.lx, ship.model.fdY + gy, 0, _w);
    p.x = _w[0]; p.y = _w[1]; p.z = _w[2];
    p.heading = ship.heading; p.speed = ship.speed + p.u;
    p.vx = ship.vx + Math.sin(ship.heading) * p.u; p.vz = ship.vz - Math.cos(ship.heading) * p.u; p.vy = 0;
    p.pitch = p.u > 20 ? 0.06 : 0;
    if (p.u >= 25 || p.lx > dp.x1 - 2) {
      p.phase = 'cruise'; p.t = 0; p.t0Air = p.age;
      p.speed = Math.max(40, ship.speed + p.u);
      p.pitch = 0.12; setVel(p);
    }
    return true;
  }
  // rollout after landing: the arrester wire stops the aircraft within a couple of seconds
  p.u = Math.max(0, p.u - 17 * dt);
  p.lx += p.u * dt;
  ship.toWorld(p.lx, ship.model.fdY + gy, p.lz * (1 - Math.min(1, p.t / 1.5)), _w);
  p.x = _w[0]; p.y = _w[1]; p.z = _w[2];
  p.heading = ship.heading; p.speed = ship.speed + p.u; p.pitch = 0; p.bank = 0; p.gearDown = true;
  p.vx = ship.vx + Math.sin(ship.heading) * p.u; p.vz = ship.vz - Math.cos(ship.heading) * p.u; p.vy = 0;
  if (p.u <= 0.5 || p.lx > dp.x1 - 25) {
    if (ship.alive) { ship.air.ready++; world.events.push({ type: 'planeLand', plane: p, ship }); }
    return false;
  }
  return true;
}

function dropBomb(world, p, tgt) {
  p.ordnance = false;
  const kg = p.spec.bombKg || 250;
  const b = {
    id: nextBomb++, owner: p.owner, team: p.team, kg, x: p.x + Math.sin(p.heading) * 3, y: p.y - 1.5, z: p.z - Math.cos(p.heading) * 3,
    vx: p.vx, vy: p.vy, vz: p.vz, age: 0, mesh: kg >= 400 ? 'bomb500' : 'bomb250', target: tgt, plane: p,
  };
  world.bombs.push(b);
  world.events.push({ type: 'bombDrop', plane: p, bomb: b, x: b.x, y: b.y, z: b.z });
}

function dropTorpedo(world, p, tgt, range) {
  p.ordnance = false;
  const a = p.heading;
  world.spawnTorpedo({
    owner: p.owner, x: p.x + Math.sin(a) * 4, z: p.z - Math.cos(a) * 4, vx: Math.sin(a) * 21.5, vz: -Math.cos(a) * 21.5, speed: 21.5, range: 2600, warhead: 230, team: p.team,
    air: true, h: Math.max(8, p.y - 3), hv: p.vy, fallSpeed: p.speed * 0.85, fallDir: a,
  });
  world.events.push({ type: 'torpedoDrop', plane: p, x: p.x, y: p.y, z: p.z, bearing: a });
}

// ---- bombs -------------------------------------------------------------------------------------------------------
function stepBombs(world, dt) {
  const arr = world.bombs;
  for (let i = arr.length - 1; i >= 0; i--) {
    const b = arr[i];
    const px = b.x, py = b.y, pz = b.z;
    b.vy -= G * dt;
    const k = Math.exp(-0.00035 * Math.hypot(b.vx, b.vy, b.vz) * dt);
    b.vx *= k; b.vz *= k; b.vy *= k;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.age += dt;
    let done = false;
    for (const ship of world.ships) {
      if (ship.team === b.team || ship.state === 'sunk') continue;
      if (!segmentNearShip(ship, px, py, pz, b.x, b.y, b.z)) continue;
      const hit = segmentHit(ship, px, py, pz, b.x, b.y, b.z);
      if (hit) { if (ship.state === 'afloat' || ship.sinkDepth < 3) resolveBombHit(world, ship, b, hit); done = true; break; }
    }
    if (!done && b.y <= 0) {
      const f = py / (py - b.y);
      const wx = px + (b.x - px) * f, wz = pz + (b.z - pz) * f;
      world.events.push({ type: 'splash', x: wx, z: wz, cal: 300, bomb: true });
      for (const ship of world.ships) if (ship.team !== b.team && ship.state === 'afloat') resolveNearMiss(world, ship, b, wx, wz);
      done = true;
    }
    if (done || b.age > 40) arr.splice(i, 1);
  }
}

// ---- anti-aircraft fire ---------------------------------------------------------------------------------------------
function planeThreats(world, ship) {
  const out = [];
  for (const p of world.planes) {
    if (p.team === ship.team || p.phase === 'queue' || p.phase === 'takeoff' || p.phase === 'rollout' || p.y < 2) continue;
    const dx = p.x - ship.x, dz = p.z - ship.z, d = Math.hypot(dx, dz);
    if (d > FLAK_RANGE) continue;
    out.push({ p, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

function updateAA(world, dt) {
  if (!world.planes.length) {
    // relax the guns
    for (const ship of world.ships) for (const a of ship.aaMounts) { a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4); }
    return;
  }
  const rng = world.rng;
  for (const ship of world.ships) {
    if (ship.state !== 'afloat') continue;
    const threats = planeThreats(world, ship);
    // light AA mounts
    for (const a of ship.aaMounts) {
      a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4);
      if (!a.alive) continue;
      const cfg = AA[a.rec.variant];
      a.retarget -= dt;
      if (a.retarget <= 0 || !a.target || a.target.dying || !world.planes.includes(a.target)) {
        a.retarget = 0.35 + rng() * 0.5;
        a.target = null;
        // the plane threatening this ship first, within reach of the gun
        let best = null, bs = 1e9;
        for (const { p, d } of threats) {
          if (d > cfg.range * 1.05 || p.y > 3400) continue;
          const s = d * (p.target === ship ? 0.6 : 1) * (p.dying ? 2 : 1);
          if (s < bs) { bs = s; best = p; }
        }
        a.target = best;
      }
      const p = a.target;
      if (!p) { a.elev += (0.25 - a.elev) * Math.min(1, dt * 1.5); continue; }
      // slew towards the lead point
      const w = ship.toWorld(a.rec.x, a.rec.y + 1.2, a.rec.z, _w);
      const t0 = Math.hypot(p.x - w[0], p.z - w[2]) / 600;
      const dx = p.x + p.vx * t0 - w[0], dy = p.y + p.vy * t0 - w[1], dz = p.z + p.vz * t0 - w[2];
      const hd = Math.hypot(dx, dz);
      const want = Math.atan2(dx, -dz) - ship.heading - a.rec.yaw0;
      a.train += clamp(wrapPi(want - a.train), -cfg.turn * D2R * dt, cfg.turn * D2R * dt);
      a.elev += clamp(Math.atan2(dy, hd) - a.elev, -cfg.turn * D2R * dt, cfg.turn * D2R * dt);
      const dist = Math.hypot(dx, dy, dz);
      if (dist > cfg.range) continue;
      const aligned = Math.abs(wrapPi(want - a.train)) < 0.12;
      if (!aligned) continue;
      // the rounds that reach the aircraft
      const fall = Math.pow(1 - dist / cfg.range, 1.5);
      const motion = 0.6 + 0.4 / (1 + (Math.hypot(p.vx, p.vz) * 0.002));
      const rate = cfg.dps / cfg.hit * a.rec.n / 2 * fall * motion * (a.rec.n >= 3 ? 1.1 : 1);
      if (rng() < rate * dt) hitPlane(world, ship, p, cfg.hit * (0.7 + 0.6 * rng()), a.rec.cal);
      // visible fire
      a.burstLeft -= dt;
      if (a.burstLeft <= 0) {
        a.burstLeft = 0.26 + rng() * 0.16;
        a.flash = 1; a.recoil = 1;
        world.events.push({ type: 'aaFire', ship, mount: a, plane: p, x: w[0], y: w[1], z: w[2], cal: a.rec.cal, n: a.rec.n, variant: a.rec.variant });
      }
      p.harass = Math.min(2, p.harass + dt * 0.1 * fall);
    }
    // heavy dual-purpose guns: flak bursts
    for (const m of ship.mounts) {
      if (m.group !== 'sec' || !m.alive || m.gun.cal > 140 || m.gun.maxElevDeg < 55 || m.noAmmo || m.jam > 0) continue;
      m.airT = (m.airT || 0) - dt;
      if (m.airT <= 0 || !m.airTarget || !world.planes.includes(m.airTarget)) {
        m.airT = 0.8 + rng() * 0.6; m.airTarget = null;
        let best = null, bs = 1e9;
        for (const { p, d } of threats) {
          if (d > FLAK_RANGE || p.y > 5500 || p.dying) continue;
          const s = d * (p.target === ship ? 0.5 : 1);
          if (s < bs) { bs = s; best = p; }
        }
        m.airTarget = best;
      }
      const p = m.airTarget;
      if (!p) continue;
      m.busyAir = true;
      m.reload = Math.max(0, m.reload - dt);
      const w = ship.toWorld(m.rec.x, m.rec.y + 1.2, m.rec.z, _w);
      const dx = p.x + p.vx * 2.2 - w[0], dy = p.y + p.vy * 2.2 - w[1], dz = p.z + p.vz * 2.2 - w[2];
      const hd = Math.hypot(dx, dz), dist = Math.hypot(dx, dy, dz);
      const bearing = Math.atan2(dx, -dz);
      const rel = wrapPi(bearing - ship.heading - m.rec.arcC);
      const inArc = Math.abs(rel) <= m.rec.arcH;
      const rate = m.gun.trainRate * D2R * dt * 1.6;
      m.trainRel += clamp(clamp(rel, -m.rec.arcH, m.rec.arcH) - m.trainRel, -rate, rate);
      m.elev += clamp(Math.min(Math.atan2(dy, hd), 1.45) - m.elev, -rate, rate);
      if (!inArc || m.reload > 0 || dist > FLAK_RANGE) continue;
      if (Math.abs(rel - m.trainRel) > 0.07) continue;
      m.reload = m.gun.reload * (0.9 + rng() * 0.2) * 1.15;
      m.recoil = 1; m.flash = 1;
      // fuze setting error grows with distance; the burst is lethal within ~20 m
      const sig = 12 + dist * 0.016 + 14 * p.harass;
      const ox = rng.normal() * sig, oy = rng.normal() * sig, oz = rng.normal() * sig;
      const off = Math.hypot(ox, oy, oz);
      const bx = p.x + p.vx * 0.2 + ox, by = p.y + oy, bz = p.z + p.vz * 0.2 + oz;
      world.events.push({ type: 'flak', ship, mount: m, x: bx, y: by, z: bz, cal: m.gun.cal, mx: w[0], my: w[1], mz: w[2], n: m.n });
      world.events.push({ type: 'muzzle', ship, mount: m, x: w[0] + Math.sin(ship.heading + m.rec.arcC + m.trainRel) * 4, y: w[1] + 2, z: w[2] - Math.cos(ship.heading + m.rec.arcC + m.trainRel) * 4, dx: 0, dy: 1, dz: 0, cal: m.gun.cal, n: m.n, group: 'aa' });
      p.harass = Math.min(2, p.harass + 0.25 * clamp(1 - off / 90, 0, 1));
      const lethal = 22 + m.gun.cal * 0.12;
      if (off < lethal * 1.5) hitPlane(world, ship, p, 1.6 * clamp(1 - off / (lethal * 1.5), 0.2, 1) * m.n * 0.7, m.gun.cal);
    }
  }
}

/** The AA shot connects: damage, smoke, fire, or the aircraft is lost. */
function hitPlane(world, ship, p, dmg, cal) {
  if (p.dying || p.phase === 'floating') return;
  p.hp -= dmg;
  world.events.push({ type: 'planeHit', plane: p, ship, x: p.x, y: p.y, z: p.z, cal, dmg });
  const frac = p.hp / p.maxHp;
  if (frac < 0.65 && p.smoke < 0.4) p.smoke = 0.4 + world.rng() * 0.3;
  if (frac < 0.4 && p.fire < 0.3) p.fire = 0.4;
  if (p.hp <= 0) { if (ship) { ship.aaKills++; } killPlane(world, p, 'aa', ship); return; }
  // a lucky hit: engine, pilot, wing
  const r = world.rng();
  if (r < 0.06 * dmg + 0.01) { p.lost.engine = true; p.smoke = 1; world.events.push({ type: 'planeEngineOut', plane: p }); }
  else if (r < 0.1 * dmg + 0.02 && dmg > 0.8) killPlane(world, p, 'aa', ship);
}

/** Start the death throes of an aircraft: it falls and burns, and the crash is seen to the end. */
export function killPlane(world, p, cause, attacker) {
  if (p.dying) return;
  const rng = world.rng;
  p.dying = true; p.dyingT = 0; p.cause = cause;
  if (p.phase === 'rollout' || p.phase === 'queue' || p.phase === 'takeoff') { p.dying = false; return; }
  p.owner && (p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1);
  if (attacker && attacker !== p.owner) attacker.planeKills = (attacker.planeKills || 0) + 1;
  const r = rng();
  let mode;
  if (cause === 'blast') mode = r < 0.5 ? 'tumble' : 'explode';
  else mode = r < 0.27 ? 'spin' : r < 0.5 ? 'dive' : r < 0.7 ? 'wing' : r < 0.85 ? 'glide' : 'explode';
  if (mode === 'explode' && !p.ordnance && rng() < 0.5) mode = 'spin';
  p.mode = mode;
  p.smoke = 1; p.fire = mode === 'glide' ? 0.4 : 1;
  p.gearDown = false;
  p.spinRate = (rng() < 0.5 ? -1 : 1) * (2.5 + rng() * 4);
  if (mode === 'glide') p.lost.engine = true;
  p.bomb = p.ordnance;
  setVel(p);
  world.events.push({ type: 'planeDown', plane: p, mode, x: p.x, y: p.y, z: p.z, cause, hasOrdnance: p.ordnance, attacker: attacker || null });
  if (mode === 'wing') { const w = rng() < 0.5 ? 'wingL' : 'wingR'; breakPiece(world, p, w); p.spinRate = (w === 'wingL' ? -1 : 1) * (5 + rng() * 4); }
  if (mode === 'explode') {
    // the aircraft breaks up in the air: tail and wings come off, the burning fuselage falls on
    breakPiece(world, p, 'tail'); breakPiece(world, p, rng() < 0.5 ? 'wingL' : 'wingR');
    world.events.push({ type: 'explosion', stage: 'air', x: p.x, y: p.y, z: p.z, size: p.ordnance ? 0.42 : 0.28, plane: p });
    spawnScrap(world, p.x, p.y, p.z, 8, 16, p.vx, p.vz, 1);
    p.spinRate *= 1.4;
  }
  if (p.ordnance) { p.ordnance = false; }
}

function breakPiece(world, p, piece) {
  if (piece === 'tail') { if (p.lost.tail) return; p.lost.tail = true; }
  else if (piece === 'wingL') { if (p.lost.wingL) return; p.lost.wingL = true; }
  else if (piece === 'wingR') { if (p.lost.wingR) return; p.lost.wingR = true; }
  spawnPlaneDebris(world, p, piece);
  world.events.push({ type: 'planeBreakup', plane: p, piece, x: p.x, y: p.y, z: p.z });
}

/** Dying aircraft: ballistic fall with its own tumbling, until it hits the sea or a ship. */
function stepDying(world, p, dt) {
  p.dyingT += dt;
  const rng = world.rng;
  const prev = _prev; prev[0] = p.x; prev[1] = p.y; prev[2] = p.z;
  if (p.mode === 'glide' && p.y > 4) {
    // engine dead, aircraft still flying: a long glide towards the sea
    p.pitch += (-0.1 - p.pitch) * dt * 0.8;
    p.speed = Math.max(42, p.speed - 6 * dt);
    p.bank += (p.spinRate * 0.04 - p.bank) * dt;
    p.heading += p.bank * 0.1 * dt;
    setVel(p);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y <= 1.5) { ditch(world, p, true); return true; }
    return collideShips(world, p, prev);
  }
  // uncontrolled: gravity, drag, tumbling or spinning
  p.vy -= G * dt * (p.mode === 'dive' ? 1.0 : 0.9);
  const dr = Math.exp(-(p.mode === 'tumble' || p.mode === 'wing' ? 0.35 : 0.12) * dt);
  p.vx *= dr; p.vz *= dr; p.vy *= (p.mode === 'tumble' || p.mode === 'wing' ? Math.exp(-0.05 * dt) : 1);
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  p.speed = sp;
  if (p.mode === 'spin' || p.mode === 'wing' || p.mode === 'explode') {
    p.bank += p.spinRate * dt;
    const pit = Math.asin(clamp(p.vy / Math.max(sp, 1), -1, 1));
    p.pitch += clamp(pit - p.pitch, -1.2 * dt, 1.2 * dt);
    if (Math.hypot(p.vx, p.vz) > 4) p.heading += wrapPi(Math.atan2(p.vx, -p.vz) - p.heading) * Math.min(1, dt * 0.8);
  } else if (p.mode === 'tumble') {
    p.bank += p.spinRate * dt; p.pitch += p.spinRate * 0.4 * dt; p.heading += p.spinRate * 0.2 * dt;
  } else {   // dive: pilot dead, nose drops
    const pit = Math.asin(clamp(p.vy / Math.max(sp, 1), -1, 1));
    p.pitch += clamp(pit - p.pitch, -0.7 * dt, 0.7 * dt);
    p.bank += (Math.sin(p.dyingT * 1.3) * 0.5 - p.bank) * dt;
    if (Math.hypot(p.vx, p.vz) > 4) p.heading += wrapPi(Math.atan2(p.vx, -p.vz) - p.heading) * Math.min(1, dt * 0.6);
  }
  if (p.y <= 0.8) { crash(world, p, null); return false; }
  const ok = collideShips(world, p, prev);
  return ok;
}

/** Collision of an aircraft with a ship (it flew into it, or crashed on it). Returns false when the aircraft is gone. */
function collideShips(world, p, prev) {
  if (p.y > 130) return true;
  for (const ship of world.ships) {
    if (ship.state === 'sunk' || p.phase === 'final' || p.phase === 'rollout') continue;
    if (p.owner === ship && !p.dying) continue;
    if (!segmentNearShip(ship, prev[0], prev[1], prev[2], p.x, p.y, p.z)) continue;
    const hit = segmentHit(ship, prev[0], prev[1], prev[2], p.x, p.y, p.z);
    if (!hit) continue;
    if (!p.dying && ship.team === p.team) continue;      // a healthy pilot does not hit his own ships
    crash(world, p, ship, hit);
    return false;
  }
  return true;
}

function ditch(world, p, burning) {
  world.events.push({ type: 'planeDitch', plane: p, x: p.x, z: p.z });
  world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 220 });
  p.phase = 'floating'; p.dying = false; p.t2 = 0; p.y = 0.2; p.pitch = 0; p.roll = 0; p.bank = 0.1; p.gearDown = false;
  p.lost.engine = true;
  p.speed = Math.min(p.speed, 36);
  setVel(p); p.vy = 0;
  if (burning) world.addSeaFire(p.x, p.z, 7, 18, 0.5);
}

/** The aircraft hits the water, or a ship. */
function crash(world, p, ship, hit) {
  const sp = p.speed;
  const ord = p.bomb ?? p.ordnance;
  world.events.push({ type: 'planeCrash', plane: p, x: p.x, y: Math.max(0.5, p.y), z: p.z, water: !ship, ship, speed: sp, ordnance: ord });
  if (ship) resolveCrashHit(world, ship, p, hit);
  else {
    world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 260 + (ord ? 120 : 0) });
    world.addSeaFire(p.x, p.z, 6 + (ord ? 4 : 0), 14 + world.rng() * 16, 0.55);
    spawnScrap(world, p.x, 1, p.z, 7, 14, p.vx * 0.2, p.vz * 0.2, 0.9);
  }
}
