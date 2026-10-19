// Ship damage model: every ship is a set of modules (engine rooms, magazines, steering gear, shafts,
// bridge, fire-control directors, radar, funnels, masts, torpedo tubes, AA mounts, ...) placed where they
// are on the real model, plus watertight compartments. A hit is resolved by *where* it lands: blast damage
// falls off with the distance to each module and depends on whether the module is protected from the
// burst (armour, hull) or exposed to it. Destroyed modules degrade the ship (speed, steering, fire control,
// anti-aircraft fire, ...) and, for visible parts, are replaced by their wreck in the 3D model.
import { clamp } from '../math.js';

const TYPE_I = { DD: 0, CL: 1, CA: 2, BB: 3, CV: 4 };
const pick = (t, arr) => arr[TYPE_I[t]];

/** Hit points of the module kinds (units comparable to shell mass in kg: a 406 mm AP shell is 1225). */
const HP = {
  engine: (t) => pick(t, [140, 260, 340, 900, 650]),
  magazine: (t) => pick(t, [140, 230, 340, 800, 280]),
  steering: (t) => pick(t, [45, 80, 110, 220, 170]),
  shaft: (t) => pick(t, [30, 55, 75, 140, 110]),
  bridge: (t) => pick(t, [60, 130, 210, 450, 260]),
  director: (t) => pick(t, [30, 60, 90, 160, 90]),
  radar: (t) => pick(t, [14, 22, 30, 40, 36]),
  funnel: (t) => pick(t, [60, 100, 130, 220, 150]),
  mast: (t) => pick(t, [40, 70, 90, 140, 90]),
  tubes: (t) => pick(t, [45, 60, 60, 60, 60]),
  catapult: (t) => pick(t, [30, 40, 50, 60, 60]),
  crane: (t) => pick(t, [25, 25, 30, 40, 30]),
  hangar: (t) => 520,
  avgas: (t) => 260,
  flightdeck: (t) => 700,
};
/** Rounds carried for each barrel of a light AA mount (a gun fires in bursts, about 60 % of the time it has a target). */
export const AA_ROUNDS = { oerlikon: 3600, iijn25: 2700, bofors: 1400 };
export const AA_HP = { oerlikon: 7, iijn25: 18, bofors: 26 };

const LABEL = {
  engine: 'Machines', magazine: 'Soute à munitions', steering: 'Appareil à gouverner', shaft: 'Ligne d\'arbre', bridge: 'Passerelle',
  director: 'Direction de tir', radar: 'Radar', funnel: 'Cheminée', mast: 'Mât', tubes: 'Tubes lance-torpilles', catapult: 'Catapulte',
  crane: 'Grue', hangar: 'Hangar', avgas: 'Soute à essence', flightdeck: 'Pont d\'envol',
};

/** Structural damage (fraction of the ship's hit points) when a module is destroyed. */
const STRUCT = { engine: 0.02, magazine: 0.02, steering: 0.006, shaft: 0.005, bridge: 0.012, director: 0.003, radar: 0.001, funnel: 0.006, mast: 0.002, tubes: 0.004, catapult: 0.003, crane: 0.001, hangar: 0.03, avgas: 0.03, flightdeck: 0.02 };

/**
 * Build the module list of a ship from its model. Local coordinates: x forward, y up from the waterline, z starboard.
 * Each module: { id, kind, label, x, y, z, hx, hy, hz, hp, maxHp, state (0 ok, 1 damaged, 2 destroyed), prot ('exposed' | 'internal'), part, mount }
 */
export function createModules(model, stats) {
  const t = stats.type, L = stats.L, B = stats.B;
  const mods = [];
  const add = (m) => { m.id = mods.length; m.maxHp = m.hp; m.state = 0; m.label = m.label || LABEL[m.kind]; mods.push(m); return m; };

  // ---- machinery: the ship's own boiler and engine rooms (model.machinery), or rooms spread over the engine zone ----
  const z = model.zones;
  if (model.machinery?.length) {
    const nb = { boiler: 0, engine: 0 };
    const share = 4 / model.machinery.length;      // the whole plant is worth about four generic rooms
    for (const r of model.machinery) {
      nb[r.k]++;
      add({ kind: 'engine', label: (r.k === 'boiler' ? 'Chaufferie ' : 'Salle des turbines ') + nb[r.k], x: r.x, y: -2.2, z: r.z, hx: r.hx * 0.95, hy: 3.6, hz: r.hz || B * 0.3, hp: HP.engine(t) * Math.max(0.5, share), prot: 'internal' });
    }
  } else {
    const n = pick(t, [2, 3, 3, 4, 4]);
    const xa = L / 2 - z.engine[0] * L, xb = L / 2 - z.engine[1] * L;
    const span = Math.abs(xa - xb) || L * 0.2;
    for (let i = 0; i < n; i++) {
      const cx = Math.max(xa, xb) - (i + 0.5) / n * span;
      add({ kind: 'engine', label: (i % 2 === 0 ? 'Chaufferie ' : 'Salle des machines ') + (Math.floor(i / 2) + 1), x: cx, y: -2.2, z: 0, hx: span / n / 2 * 0.95, hy: 3.6, hz: B * 0.3, hp: HP.engine(t), prot: 'internal' });
    }
  }

  // ---- magazines under the main turrets ----
  const seen = new Set();
  model.mounts.forEach((m, mi) => {
    if (m.group !== 'main') return;
    const key = Math.round(m.x / 3);
    if (seen.has(key) && t !== 'CV') return;
    seen.add(key);
    if (mods.filter((q) => q.kind === 'magazine').length >= 6) return;
    add({ kind: 'magazine', label: 'Soute ' + (m.label || ''), x: m.x, y: -3.2, z: 0, hx: 3.6, hy: 2.4, hz: Math.min(B * 0.2, 5), hp: HP.magazine(t) * clamp(m.cal / 200, 0.5, 1.5), prot: 'internal', mount: mi });
  });

  // ---- steering gear and shafts at the stern ----
  const rx = model.rudders?.length ? Math.max(...model.rudders.map((r) => r.x)) : -L * 0.44;
  add({ kind: 'steering', x: rx + 3, y: -1.4, z: 0, hx: 3.2, hy: 2.2, hz: B * 0.12, hp: HP.steering(t), prot: 'internal' });
  if (model.shafts?.length) {
    for (const sh of model.shafts) {
      const side = sh.side, name = side === 0 ? 'centrale' : (side < 0 ? 'bâbord' : 'tribord') + (model.shafts.filter((q) => q.side === side).length > 1 ? (Math.abs(sh.z) === Math.min(...model.shafts.filter((q) => q.side === side).map((q) => Math.abs(q.z))) ? ' int.' : ' ext.') : '');
      add({ kind: 'shaft', label: 'Ligne d\'arbre ' + name, x: sh.x, y: sh.y, z: sh.z, hx: Math.max(4, sh.hx), hy: 1.4, hz: 0.9, hp: HP.shaft(t), prot: 'internal', side });
    }
  }
  const nShafts = model.shafts?.length ? 0 : t === 'DD' || t === 'CL' ? 2 : 4;
  for (let i = 0; i < nShafts; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    add({ kind: 'shaft', label: 'Ligne d\'arbre ' + (side < 0 ? 'bâbord' : 'tribord') + (nShafts > 2 ? (row ? ' ext.' : ' int.') : ''), x: -L * 0.4, y: -3.2, z: side * B * (0.14 + 0.15 * row), hx: 6, hy: 1.4, hz: 0.9, hp: HP.shaft(t), prot: 'internal', side });
  }

  // ---- visible parts ----
  model.parts.forEach((p, pi) => {
    const kind = { funnel: 'funnel', bridge: 'bridge', mast: 'mast', director: 'director', radar: 'radar', tubes: 'tubes', catapult: 'catapult', crane: 'crane' }[p.kind];
    if (!kind) return;
    const bb = p.bb;
    const cx = (bb[0] + bb[3]) / 2, cy = (bb[1] + bb[4]) / 2, cz = (bb[2] + bb[5]) / 2;
    const thin = kind === 'mast' || kind === 'radar';
    add({ kind, label: p.label, x: cx, y: cy, z: cz, hx: Math.max((bb[3] - bb[0]) / 2, 0.9), hy: Math.max((bb[4] - bb[1]) / 2, 0.9), hz: Math.max((bb[5] - bb[2]) / 2, thin ? 1.6 : 0.9), hp: HP[kind](t), prot: 'exposed', part: pi });
  });

  // ---- carriers: hangar, aviation fuel and the flight deck itself ----
  if (t === 'CV' && model.deckPoints && model.deckPoints.x0 != null) {
    const dp = model.deckPoints;
    const cx = (dp.x0 + dp.x1) / 2, len = Math.abs(dp.x1 - dp.x0);
    add({ kind: 'hangar', x: cx, y: dp.y - 5.5, z: 0, hx: len * 0.38, hy: 3.2, hz: dp.hw * 0.7, hp: HP.hangar(t), prot: 'internal' });
    add({ kind: 'avgas', x: cx + len * 0.12, y: -1.5, z: 0, hx: 14, hy: 2.5, hz: dp.hw * 0.4, hp: HP.avgas(t), prot: 'internal' });
    add({ kind: 'flightdeck', x: cx, y: dp.y, z: 0, hx: len / 2, hy: 0.6, hz: dp.hw, hp: HP.flightdeck(t), prot: 'exposed' });
  }
  return mods;
}

/** Watertight compartments along the hull. */
export function createCompartments(stats) {
  const n = clamp(Math.round(stats.L / 14), 8, 18);
  const comps = [];
  for (let i = 0; i < n; i++) {
    const x1 = stats.L / 2 - i * stats.L / n, x0 = x1 - stats.L / n;
    comps.push({ x0, x1, xc: (x0 + x1) / 2, water: [0, 0], inflow: [0, 0] });   // [port, starboard], 0..1
  }
  return comps;
}

/** Closest distance from a local point to a module's box. */
function boxDistance(m, lx, ly, lz) {
  const dx = Math.max(Math.abs(lx - m.x) - m.hx, 0), dy = Math.max(Math.abs(ly - m.y) - m.hy, 0), dz = Math.max(Math.abs(lz - m.z) - m.hz, 0);
  return Math.hypot(dx, dy, dz);
}

/** Radius (m) at which a burst of strength P (kg-equivalent) has dropped to a third of its centre value. */
export function blastRadius(P) { return 0.9 * Math.cbrt(Math.max(P, 1)); }

const DEFAULT_PROT = { exposed: { outside: 1, inside: 0.4, under: 0 }, internal: { outside: 0.03, inside: 1, under: 1 }, armored: { outside: 0.1, inside: 1, under: 0.2 } };

/**
 * Apply a burst of strength P (kg-equivalent) at a local point to every module of the ship.
 * where: 'outside' (HE on the surface / bomb on deck), 'inside' (AP detonating in the hull) or 'under' (torpedo, near miss).
 * Returns the list of modules destroyed by the burst.
 */
export function blast(world, ship, lx, ly, lz, P, where, owner, cause = 'shell') {
  const rb = blastRadius(P);
  const reach = rb * 3.2;
  const killed = [];
  const fx = DEFAULT_PROT;
  // box modules
  for (const m of ship.modules) {
    if (m.state === 2) continue;
    const d = boxDistance(m, lx, ly, lz);
    if (d > reach) continue;
    const g = 1 / Math.pow(1 + (d / rb) * (d / rb), 1.5);
    const dmg = P * g * fx[m.prot][where];
    if (dmg < 0.5) continue;
    if (damageModule(world, ship, m, dmg, owner, cause)) killed.push(m);
  }
  // gun mounts (open DP mounts are exposed, turrets are armoured against an outside burst)
  for (const m of ship.mounts) {
    if (!m.alive) continue;
    const rec = m.rec;
    const d = Math.max(0, Math.hypot(rec.x - lx, rec.z - lz, (rec.y + 1) - ly) - (rec.cal / 1000 * 4 + 0.8));
    if (d > reach) continue;
    const armored = rec.kind === 'turret';
    const g = 1 / Math.pow(1 + (d / rb) * (d / rb), 1.5);
    const dmg = P * g * (armored ? fx.armored[where] : fx.exposed[where]);
    if (dmg >= 0.5 && damageMount(world, ship, m, dmg, owner, where === 'inside')) killed.push(m);
  }
  // light AA mounts
  for (const a of ship.aaMounts) {
    if (!a.alive) continue;
    const rec = a.rec;
    const d = Math.max(0, Math.hypot(rec.x - lx, rec.z - lz, rec.y - ly) - 0.9);
    if (d > reach) continue;
    const g = 1 / Math.pow(1 + (d / rb) * (d / rb), 1.5);
    const dmg = P * g * fx.exposed[where];
    if (dmg < 0.5) continue;
    a.hp -= dmg;
    if (a.hp <= 0) {
      a.alive = false;
      world.events.push({ type: 'moduleKilled', ship, kind: 'aa', label: rec.label, x: rec.x, y: rec.y, z: rec.z });
      if (world.rng() < 0.18) ship.addFire(rec.x, rec.y, rec.z, 0.4);
      ship.applyDamage(ship.stats.maxHp * 0.0008, owner, cause);
    }
  }
  return killed;
}

/** Damage one module. Returns true when it was destroyed by this call. */
export function damageModule(world, ship, m, amount, owner, cause) {
  if (m.state === 2) return false;
  m.hp -= amount;
  if (m.hp <= 0) {
    m.hp = 0; m.state = 2;
    onModuleDestroyed(world, ship, m, owner, cause);
    return true;
  }
  if (m.hp < m.maxHp * 0.5 && m.state === 0) { m.state = 1; if (m.part != null && ship.partState[m.part] === 0) ship.partState[m.part] = 1; }
  return false;
}

export function damageMount(world, ship, m, amount, owner, penetrated) {
  if (!m || !m.alive) return false;
  m.hp -= amount;
  const frac = m.hp / m.maxHp;
  // a damaged mount may jam for a while
  if (frac < 0.5 && m.hp > 0 && world.rng() < 0.12 + amount / m.maxHp * 0.6) m.jam = Math.max(m.jam || 0, 15 + world.rng() * 40);
  if (m.hp <= 0) {
    m.alive = false; m.wrecked = true;
    world.events.push({ type: 'mountKilled', ship, mount: m });
    ship.refreshArmament();
    // ammunition fire in the turret; a fire reaching the magazine below is the classic way to lose a ship
    if (penetrated || world.rng() < 0.3) {
      ship.addFire(m.rec.x, m.rec.y + 1.5, m.rec.z, 1.0);
      ship.applyDamage(ship.stats.maxHp * (m.rec.group === 'main' ? 0.012 : 0.003), owner, 'turret');
      if (penetrated && m.rec.kind === 'turret') ship.turretFlash(m, world, owner);
    }
    return true;
  }
  return false;
}

/** Side effects of a module being destroyed. */
function onModuleDestroyed(world, ship, m, owner, cause) {
  const st = ship.stats, rng = world.rng;
  const ev = { type: 'moduleKilled', ship, kind: m.kind, label: m.label, x: m.x, y: m.y, z: m.z, module: m };
  world.events.push(ev);
  if (m.part != null) {
    ship.partState[m.part] = 2;
    ship.onPartDestroyed(m, world);
  }
  const sd = STRUCT[m.kind] || 0;
  if (sd) ship.applyDamage(st.maxHp * sd, owner, cause === 'torpedo' ? 'torpedo' : 'turret');
  switch (m.kind) {
    case 'engine':
      ship.updatePropulsion();
      if (rng() < 0.6) ship.addFire(m.x, 2, m.z, 0.8);
      ship.flood(m.x, m.z, 0.15);
      break;
    case 'steering':
      ship.rudderDead = true;
      ship.rudderJam = (ship.rudder >= 0 ? 1 : -1) * (0.35 + 0.5 * rng());
      break;
    case 'shaft': ship.updatePropulsion(); break;
    case 'magazine': ship.magazineLost(m, world, owner, cause); break;
    case 'bridge':
      ship.commandLoss = true;
      ship.updateFireControl();
      ship.addFire(m.x, m.y, m.z, 0.9);
      break;
    case 'director':
    case 'radar': ship.updateFireControl(); break;
    case 'mast':
      // radar sets on the mast go with it
      for (const q of ship.modules) if (q.kind === 'radar' && q.state < 2 && Math.abs(q.x - m.x) < 4) damageModule(world, ship, q, 1e6, owner, cause);
      break;
    case 'funnel':
      ship.updatePropulsion();
      ship.addFire(m.x, m.y * 0.5, m.z, 0.6);
      break;
    case 'tubes': ship.tubesLost(m, world, owner); break;
    case 'catapult': if (rng() < 0.6) ship.addFire(m.x, m.y, m.z, 0.7); break;
    case 'hangar':
    case 'avgas': ship.hangarLost(m, world, owner); break;
    case 'flightdeck': ship.deckWrecked = true; break;
    default: break;
  }
}
