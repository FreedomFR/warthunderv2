// Impact resolution against ships: shells, bombs, torpedoes and crashing aircraft. A hit is traced through
// the ship's volumes (mounts, AA mounts, visible parts, superstructure, deck, hull), armour and penetration decide
// where the burst happens (on the surface, or inside the hull after the fuze delay), and the burst then damages
// every module around that point (see modules.js).
import { clamp, D2R } from '../math.js';
import { effectiveThickness, spacedPlates, fuzeThickness, residualSpeed, V_EXP } from './penetration.js';
import { blast, damageMount, damageModule } from './modules.js';

const _l = [0, 0, 0];

/** Is the local point inside the ship's hull volume? */
export function insideHull(ship, lx, ly, lz) {
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

function insideAA(ship, lx, ly, lz) {
  for (const a of ship.aaMounts) {
    if (!a.alive) continue;
    const r = a.rec;
    const dx = lx - r.x, dy = ly - r.y, dz = lz - r.z;
    if (dx * dx + dz * dz <= 1.5 && dy > -1.2 && dy < 2.4) return a;
  }
  return null;
}

/** Visible, destroyable parts (funnels, masts, bridge...) are hit through their module boxes. */
function insidePart(ship, lx, ly, lz) {
  for (const m of ship.modules) {
    if (m.part == null || m.state === 2) continue;
    if (Math.abs(lx - m.x) <= m.hx * 0.85 && Math.abs(ly - m.y) <= m.hy && Math.abs(lz - m.z) <= m.hz * 0.85) return m;
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
 * { t, part: 'hull' | 'super' | 'mount' | 'deck' | 'aa' | 'module', lx, ly, lz, mount, aa, module } or null.
 */
export function segmentHit(ship, x0, y0, z0, x1, y1, z1) {
  if (ship.state === 'sunk') return null;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const n = Math.max(2, Math.ceil(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    ship.toLocal(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, _l);
    const lx = _l[0], ly = _l[1], lz = _l[2];
    // ship pitch / roll are ignored for hit detection (small angles)
    const mnt = insideMount(ship, lx, ly, lz);
    if (mnt) return { t: f, part: 'mount', lx, ly, lz, mount: mnt };
    const aa = insideAA(ship, lx, ly, lz);
    if (aa) return { t: f, part: 'aa', lx, ly, lz, aa };
    const mod = insidePart(ship, lx, ly, lz);
    if (mod) return { t: f, part: 'module', lx, ly, lz, module: mod };
    if (insideSuper(ship, lx, ly, lz)) return { t: f, part: 'super', lx, ly, lz };
    if (insideHull(ship, lx, ly, lz)) {
      const deck = ship.model.hull.deckY(lx);
      const part = ly > deck - 0.8 ? 'deck' : 'hull';
      return { t: f, part, lx, ly, lz };
    }
  }
  return null;
}

/** cosine of the angle between the shell's path and the normal of the surface it struck (superstructure, modules) */
function faceCos(ship, hit, ldx, ldy, ldz) {
  const n = hitNormal(ship, hit);
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return Math.abs((ldx * n[0] + ldy * n[1] + ldz * n[2]) / l);
}

/** Surface normal at a hit, in ship-local axes. */
function hitNormal(ship, hit) {
  switch (hit.part) {
    case 'deck': case 'mount': case 'aa': return [0, 1, 0];
    case 'hull': {
      const side = hit.lz >= 0 ? 1 : -1;
      return [hit.lx > ship.stats.L * 0.38 ? 0.45 : hit.lx < -ship.stats.L * 0.4 ? -0.4 : 0, 0.18, side];
    }
    case 'super': case 'module': {
      const sb = ship.model.superBox;
      if (sb && Math.abs(hit.lz - (sb.zc || 0)) > sb.hw * 0.8) return [0, 0.05, hit.lz >= 0 ? 1 : -1];
      return [hit.lx > (sb ? (sb.x0 + sb.x1) / 2 : 0) ? 1 : -1, 0.1, 0];
    }
    default: return [0, 1, 0];
  }
}

/** `inside`: the fire is within the armoured citadel, where it can heat the magazines. */
function addFireAt(ship, lx, ly, lz, power, inside = false) { ship.addFire(lx, Math.max(ly, 1), lz, power, inside); }

/**
 * Burst of strength P at a local point: damages the modules around it, makes the visual event and scars the hull.
 * kind: event kind ('penetrate' | 'explode' | 'bomb'), cal: for the size of the effect.
 */
function detonate(world, ship, lx, ly, lz, P, where, owner, cause, kind, cal, hitInfo, extra) {
  const killed = blast(world, ship, lx, ly, lz, P, where, owner, cause);
  const w = ship.toWorld(lx, ly, lz, [0, 0, 0]);
  world.events.push({ type: 'impact', kind, x: w[0], y: w[1], z: w[2], cal, ship, lx, ly, lz, part: hitInfo ? hitInfo.part : null, inside: where === 'inside', killed: killed.length, ...extra });
  return killed;
}

/**
 * The plates a shell meets at a hit and how it meets them: { plates: [mm...], cosA, kind }.
 * `d` = direction of the shell in ship-local axes, `w` = its direction in the world (turrets turn).
 */
function plateAt(ship, hit, d, w, inCitadel) {
  const st = ship.stats, a = st.armor, part = hit.part;
  const [ldx, ldy, ldz] = d;
  switch (part) {
    case 'hull': {
      if (hit.ly > -2.5 && hit.ly < 3.2 && inCitadel) {
        // the belt: inclined plates (top inboard) face a falling shell more squarely. The outward normal is (cos i) across and (sin i) up.
        const ci = Math.cos(a.incl * D2R), si = Math.sin(a.incl * D2R);
        const side = hit.lz >= 0 ? 1 : -1;
        return { plates: [Math.max(a.belt, a.skin)], cosA: clamp(-ldz * side * ci - ldy * si, 0, 1), kind: 'belt' };
      }
      if (hit.ly <= -2.5) return { plates: [inCitadel ? Math.max(a.lower, a.skin) : a.skin], cosA: Math.abs(ldz), kind: 'lower' };
      return { plates: [a.skin], cosA: Math.abs(ldz), kind: 'skin' };
    }
    case 'deck': {
      const cosA = Math.abs(ldy);
      if (st.type === 'CV') return { plates: inCitadel ? [a.flight || a.skin, a.deck] : [a.flight || a.skin], cosA, kind: 'deck' };
      return { plates: inCitadel ? [a.weather, a.deck].filter((x) => x > 0) : [a.skin * 0.7], cosA, kind: 'deck' };
    }
    case 'super': return { plates: [a.sup], cosA: faceCos(ship, hit, ldx, ldy, ldz), kind: 'super' };
    case 'module': return { plates: [hit.module.kind === 'bridge' ? Math.min(40, a.citadel * 0.2 + 10) : hit.module.kind === 'funnel' ? 6 : 10], cosA: faceCos(ship, hit, ldx, ldy, ldz), kind: 'module' };
    case 'aa': return { plates: [6], cosA: 0.7, kind: 'aa' };
    case 'mount': {
      const m = hit.mount;
      const top = m.rec.y + 3.4 + m.rec.cal / 200;
      // a shell that comes down on the house hits its roof; otherwise the front or the side of the house
      if (hit.ly > top - 0.9 && ldy < -0.1) {
        const roof = m.rec.kind === 'dp' ? Math.max(a.roof * 0.2, 12) : a.roof;
        return { plates: [roof], cosA: Math.abs(ldy), kind: 'roof' };
      }
      const yaw = ship.heading + m.rec.arcC + m.trainRel;
      const fx = Math.sin(yaw), fz = -Math.cos(yaw);
      const toShell = -(w[0] * fx + w[2] * fz);            // > 0 when the shell comes from the front
      let armor = toShell > 0.45 ? a.turretFace : a.turretSide;
      // incidence on the nearest vertical face of the house (front or side), allowing for the dive of the shell
      const along = Math.abs(w[0] * fx + w[2] * fz), across = Math.abs(-w[0] * fz + w[2] * fx);
      const cosA = clamp(Math.max(along, across) * Math.sqrt(Math.max(0, 1 - w[1] * w[1])), 0.17, 1);
      if (m.rec.kind === 'dp') armor = Math.max(armor * 0.2, 25);
      return { plates: [armor], cosA, kind: toShell > 0.45 ? 'face' : 'side' };
    }
    default: return { plates: [a.skin], cosA: 1, kind: 'skin' };
  }
}

/** Where the shell goes next after it passed through a thin plate without bursting: a shell through the superstructure comes down on the deck below it. */
function nextHit(ship, hit, d) {
  if (hit.part !== 'super' && hit.part !== 'module' && hit.part !== 'aa') return null;
  if (d[1] > -0.05) return null;
  const deck = ship.model.hull.deckY(hit.lx);
  const t = (deck - hit.ly) / d[1];
  if (!(t > 0 && t < 60)) return null;
  const lx = hit.lx + d[0] * t, lz = hit.lz + d[2] * t;
  if (Math.abs(lx) > ship.stats.L / 2 || !insideHull(ship, lx, deck - 0.2, lz)) return null;
  return { part: 'deck', lx, ly: deck, lz, t };
}

/** Resolve a shell hit. Mutates the ship and emits events. */
export function resolveShellHit(world, ship, shell, hit) {
  const g = shell.gun, st = ship.stats, rng = world.rng;
  const speed = Math.hypot(shell.vx, shell.vy, shell.vz);
  const dirx = shell.vx / speed, diry = shell.vy / speed, dirz = shell.vz / speed;
  // local velocity direction
  const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
  const ldx = dirx * sh - dirz * ch, ldy = diry, ldz = dirx * ch + dirz * sh;
  const d = [ldx, ldy, ldz], wd = [dirx, diry, dirz];
  const L = st.L;
  const cit = ship.model.zones.citadel;
  const owner = shell.owner;
  const cal = g.cal;
  const kg = g.shellKg;
  const isAP = shell.type === 'AP';
  // the world direction and the shell, as the effects need them (a tracer's last leg, the way the burst is thrown)
  const fx = { shell: shell.type, dx: dirx, dy: diry, dz: dirz, speed };

  let cur = hit, v = speed, stage = 0;
  for (;;) {
    const frac = (L / 2 - cur.lx) / L;
    const inCitadel = frac >= cit[0] && frac <= cit[1];
    const part = cur.part;
    const pl = plateAt(ship, cur, d, wd, inCitadel);
    const armor = Math.max(...pl.plates);
    const angle = Math.acos(clamp(pl.cosA, 0, 1)) * 180 / Math.PI;            // incidence: 0 = square on the plate, 90 = grazing
    const eff = spacedPlates(pl.plates.map((t) => effectiveThickness(t, angle)));
    const vr = v / g.v0;
    // plate quality and shell condition vary from one hit to the next
    const pen = (isAP ? g.pen0 * Math.pow(vr, V_EXP) : cal * 0.18 * Math.pow(vr, V_EXP)) * (0.93 + 0.14 * rng());
    // the hit report (shown on the screen and in the log): what the shell was, how it met the plate, what the plate was worth and what came of it
    const label = cur.module ? cur.module.label : cur.mount ? (cur.mount.rec.label ? 'Tourelle ' + cur.mount.rec.label : 'Affût') : part === 'aa' ? 'DCA' : part === 'hull' ? (cur.ly < 0 ? 'Carène' : 'Muraille') : part === 'deck' ? 'Pont' : 'Superstructure';
    const lx = cur.lx, ly = cur.ly, lz = cur.lz;
    const report = (result, dmgv) => world.events.push({ type: 'shellHit', ship, owner, shell: shell.type, cal, speed: v, angle, armor, eff, pen, result, dmg: dmgv, part, label, lx, ly, lz, time: world.time, stage });
    const nrm = hitNormal(ship, cur);
    const scarR = 0.35 + cal / 320;
    const modHit = part === 'module' ? cur.module : null;
    let dmg = 0, kind = 'explode';

    if (isAP) {
      // an armour-piercing shell that meets the plate at a grazing angle glances off, whatever its energy; a Japanese shell breaks up on a
      // thick plate at a moderate angle (the Type 91 did in the tests, with its long-delay fuze and thin walls)
      const glance = armor > cal * 0.08 && angle > 68 && rng() < clamp((angle - 68) / 14, 0, 1);
      const breakup = !glance && armor > cal * 0.12 && angle > g.breakup && rng() < clamp((angle - g.breakup) / 35, 0, 0.7);
      if (pen > eff && !glance && !breakup) {
        // through the plate; does the fuze fire? It needs a plate thick enough to set it off, and a few of them fail
        const vres = residualSpeed(v, eff, pen);
        if (shell.dud == null) shell.dud = rng() < g.dud;
        const thickEnough = armor >= fuzeThickness(cal, angle);
        const armed = thickEnough && !shell.dud;
        // inside the ship the shell is slowed by decks and bulkheads; the fuze fires after its delay
        // (a shell that has just defeated real armour is stopped by the structure behind it before it can leave on the far side)
        const heavy = armor >= cal * 0.25;
        const delay = Math.min(g.fuzeDelay * vres * 0.7, 12 + 14 * Math.sqrt(kg / 1000));
        let px = lx, py = ly, pz = lz, inside = armed || part === 'mount';
        if (inside && part !== 'mount') {
          const steps = Math.ceil(delay / 1.0);
          for (let i = 1; i <= steps; i++) {
            const dd = Math.min(i, delay);
            const qx = lx + ldx * dd, qy = ly + ldy * dd, qz = lz + ldz * dd;
            if (!insideHull(ship, qx, qy, qz) && !insideSuper(ship, qx, qy, qz)) { if (!heavy) inside = false; break; }
            px = qx; py = qy; pz = qz;
          }
        }
        if (!inside && part !== 'mount') {
          // a thin superstructure does not fire the fuze, but the shell comes down on the deck below and may burst there
          const nx = !armed && stage < 2 ? nextHit(ship, cur, d) : null;
          if (nx) { cur = nx; v = vres; stage++; continue; }
          // over-penetration: the shell goes through and out without bursting
          dmg = kg * 0.06 * st.softness;
          kind = 'through';
          if (rng() < 0.14) addFireAt(ship, lx, ly, lz, 0.5);
          // it still smashes whatever it passed through
          blast(world, ship, lx, ly, lz, kg * 0.12, 'outside', owner, 'shell');
          if (part === 'module') damageModule(world, ship, modHit, kg * 0.25, owner, 'shell');
          if (part === 'aa') { cur.aa.hp = 0; cur.aa.alive = false; world.events.push({ type: 'moduleKilled', ship, kind: 'aa', label: cur.aa.rec.label, x: cur.aa.rec.x, y: cur.aa.rec.y, z: cur.aa.rec.z }); }
          ship.addScar(lx + nrm[0] * 0.02, ly, lz, nrm[0], nrm[1], nrm[2], scarR * 0.8, 1);
          const we = ship.toWorld(lx, ly, lz, [0, 0, 0]), wx = ship.toWorld(px, py, pz, [0, 0, 0]);
          world.events.push({ type: 'impact', kind, x: we[0], y: we[1], z: we[2], cal, ship, lx, ly, lz, part, ...fx, angle, exit: wx });
          report(thickEnough && shell.dud ? 'dud' : 'over', dmg);
          if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
          ship.applyDamage(dmg, owner, 'shell');
          return;
        }
        // detonates inside
        let zone = 0.25;
        if (part === 'hull' || part === 'deck') zone = inCitadel && ly < 3.2 ? 1.0 : 0.38;
        if (part === 'mount') zone = 0.5;
        dmg = kg * 0.95 * zone * (0.85 + 0.3 * rng());
        kind = 'penetrate';
        if (rng() < 0.30) addFireAt(ship, px, py, pz, 0.8, inCitadel && part !== 'super' && part !== 'module');
        // flooding for waterline hits
        if (part === 'hull' && ly < 1.8) ship.flood(lx, lz, kg * 0.04);
        if (inCitadel && (part === 'hull' || part === 'deck') && rng() < 0.28) ship.engine = Math.max(0.15, ship.engine - 0.2 - 0.3 * rng());
        if (lx < -L * 0.38 && rng() < 0.12) ship.rudderJam = (rng() < 0.5 ? -1 : 1) * 0.6;
        // the burst: centred where the fuze fired
        const pm = part === 'mount' ? 0.7 : 1.0;
        if (part === 'mount') damageMount(world, ship, cur.mount, kg * 1.0, owner, true);
        detonate(world, ship, px, py, pz, kg * pm, 'inside', owner, 'shell', 'penetrate', cal, cur, { ...fx, angle, entry: ship.toWorld(lx, ly, lz, [0, 0, 0]), delay, thin: !armed });
        ship.addScar(lx, ly, lz, nrm[0], nrm[1], nrm[2], scarR, 1);
        report('pen', dmg);
        if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
        ship.applyDamage(dmg, owner, 'shell');
        return;
      }
      // bounced off the armour: ricochet at a grazing angle, or too thick to pierce
      dmg = kg * 0.035;
      kind = 'bounce';
      if (part === 'mount') damageMount(world, ship, cur.mount, kg * 0.12, owner, false);
      blast(world, ship, lx, ly, lz, kg * 0.03, 'outside', owner, 'shell');
      ship.addScar(lx, ly, lz, nrm[0], nrm[1], nrm[2], scarR * 0.6, 0);
      const w0 = ship.toWorld(lx, ly, lz, [0, 0, 0]);
      // the direction it leaves in: reflected about the plate
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1, nn = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
      const dn = ldx * nn[0] + ldy * nn[1] + ldz * nn[2];
      const rl = [ldx - 2 * dn * nn[0], ldy - 2 * dn * nn[1], ldz - 2 * dn * nn[2]];
      const r0 = ship.toWorld(lx, ly, lz, [0, 0, 0]), r1 = ship.toWorld(lx + rl[0], ly + rl[1], lz + rl[2], [0, 0, 0]);
      world.events.push({ type: 'impact', kind, x: w0[0], y: w0[1], z: w0[2], cal, ship, lx, ly, lz, part, ...fx, angle, glance: glance || breakup, rwx: r1[0] - r0[0], rwy: r1[1] - r0[1], rwz: r1[2] - r0[2] });
      report(glance ? 'glance' : 'bounce', dmg);
      if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
      ship.applyDamage(dmg, owner, 'shell');
      return;
    }

    // ---- HE: bursts on contact ----
    let zone = 1.0;
    if (part === 'hull' || part === 'deck') zone = eff > cal * 0.5 ? 0.1 : 0.55;
    if (part === 'mount') zone = 0.3;
    dmg = kg * 0.2 * st.softness * zone * (0.8 + 0.4 * rng());
    kind = eff > cal * 0.9 ? 'bounce' : 'explode';
    const fireP = (part === 'super' || part === 'module' || zone > 0.4) ? 0.22 : 0.07;
    if (rng() < fireP) addFireAt(ship, lx, Math.max(ly, 1), lz, 0.55);
    // thin plating: the burst happens just behind the skin
    const thinSkin = (part === 'hull' || part === 'deck' || part === 'super') && eff < cal * 0.45;
    const P = kg * 0.35;
    if (part === 'mount') damageMount(world, ship, cur.mount, P * 0.6, owner, false);
    detonate(world, ship, lx - (thinSkin ? ldx * 1.2 : 0), ly - (thinSkin ? ldy * 1.2 : 0), lz - (thinSkin ? ldz * 1.2 : 0), P * (thinSkin ? 0.85 : 1), thinSkin ? 'inside' : 'outside', owner, 'shell', kind, cal, cur, { ...fx, angle, thin: thinSkin });
    report(kind === 'bounce' ? 'shatter' : thinSkin ? 'pen' : 'burst', dmg);
    ship.addScar(lx, ly, lz, nrm[0], nrm[1], nrm[2], scarR * (kind === 'bounce' ? 0.6 : 1), kind === 'bounce' ? 0 : (rng() < 0.4 ? 2 : 1));
    if (lx < -L * 0.38 && part !== 'super' && rng() < 0.04) ship.rudderJam = (rng() < 0.5 ? -1 : 1) * 0.6;
    if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
    ship.applyDamage(dmg, owner, 'shell');
    return;
  }
}

/** A bomb hit: GP bomb, penetrates light decks and bursts below. */
export function resolveBombHit(world, ship, bomb, hit) {
  const st = ship.stats, rng = world.rng;
  const speed = Math.hypot(bomb.vx, bomb.vy, bomb.vz);
  const kg = bomb.kg;
  const owner = bomb.owner;
  const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
  const ldx = (bomb.vx * sh - bomb.vz * ch) / speed, ldy = bomb.vy / speed, ldz = (bomb.vx * ch + bomb.vz * sh) / speed;
  const lx = hit.lx, ly = hit.ly, lz = hit.lz;
  const cit = ship.model.zones.citadel;
  const frac = (st.L / 2 - lx) / st.L;
  const inCitadel = frac >= cit[0] && frac <= cit[1];
  let armor = 8;
  if (hit.part === 'deck') armor = inCitadel ? st.armor.deck : Math.max(st.armor.deck * 0.25, 10);
  if (hit.part === 'deck' && st.type === 'CV') armor = Math.max(st.armor.deck, 10);
  if (hit.part === 'mount') armor = ship.model.mounts.length && hit.mount.rec.kind === 'turret' ? st.armor.turretFace * 0.6 : 20;
  if (hit.part === 'hull') armor = Math.max(st.armor.belt * 0.2, 10);
  const pen = 2.2 * Math.sqrt(kg) * Math.pow(speed / 120, 1.3);
  const nrm = hitNormal(ship, hit);
  let dmg, kind;
  let px = lx, py = ly, pz = lz, inside = false;
  if (pen > armor && hit.part !== 'aa') {
    // fuze delay: the bomb bursts a few metres below the deck, inside the ship
    const vres = speed * 0.7;
    const d = 0.06 * vres;
    px = lx + ldx * d; py = ly + ldy * d; pz = lz + ldz * d;
    inside = insideHull(ship, px, py, pz) || hit.part === 'mount';
    if (!inside) { px = lx + ldx * 2; py = ly + ldy * 2; pz = lz + ldz * 2; inside = insideHull(ship, px, py, pz); }
  }
  if (inside) {
    dmg = kg * 1.15 * st.softness * (0.8 + 0.4 * rng()) * (st.type === 'CV' ? 1.15 : 1);
    kind = 'penetrate';
    if (rng() < 0.7) addFireAt(ship, px, py, pz, 1.0, inCitadel);
    if (hit.part === 'mount') damageMount(world, ship, hit.mount, kg * 0.9, owner, true);
    detonate(world, ship, px, py, pz, kg * 0.9, 'inside', owner, 'bomb', 'penetrate', 250, hit);
  } else {
    dmg = kg * 0.35 * st.softness * (0.8 + 0.4 * rng());
    kind = 'explode';
    if (rng() < 0.5) addFireAt(ship, lx, Math.max(ly, 1), lz, 0.7);
    if (hit.part === 'mount') damageMount(world, ship, hit.mount, kg * 0.5, owner, false);
    detonate(world, ship, lx, ly, lz, kg * 0.45, 'outside', owner, 'bomb', 'explode', 250, hit);
  }
  ship.addScar(lx, ly, lz, nrm[0], nrm[1], nrm[2], 1.1 + kg / 400, inside ? 1 : 2);
  if (owner) { owner.damageDealt += dmg; owner.shotsHit++; }
  ship.applyDamage(dmg, owner, 'bomb');
}

/** A bomb that missed but burst in the water against the hull: shock and flooding. */
export function resolveNearMiss(world, ship, bomb, wx, wz) {
  const st = ship.stats;
  ship.toLocal(wx, 0, wz, _l);
  const lx = _l[0], lz = _l[2];
  const side = Math.abs(lz) - ship.model.hull.halfBeamWL(clamp(lx, -st.L / 2, st.L / 2));
  if (side > 14 || Math.abs(lx) > st.L / 2 + 14) return;
  const k = 1 - clamp(side / 14, 0, 1);
  const P = bomb.kg * 0.8 * k * st.torpFactor * 0.5;
  if (P < 8) return;
  blast(world, ship, lx, -1.5, clamp(lz, -st.B / 2, st.B / 2), P, 'under', bomb.owner, 'bomb');
  ship.flood(lx, lz, bomb.kg * 0.02 * k);
  if (bomb.owner) bomb.owner.damageDealt += P * 0.2;
  ship.applyDamage(P * 0.25, bomb.owner, 'bomb');
}

/** A crashing aircraft slams into the ship. */
export function resolveCrashHit(world, ship, plane, hit) {
  const st = ship.stats, rng = world.rng;
  const kg = 90 + (plane.ordnance ? (plane.kind === 'torp' ? 300 : 220) : 0);
  const nrm = hitNormal(ship, hit);
  if (rng() < 0.9) addFireAt(ship, hit.lx, Math.max(hit.ly, 1), hit.lz, 0.9);
  detonate(world, ship, hit.lx, hit.ly, hit.lz, kg * 0.6, 'outside', plane.owner, 'bomb', 'explode', 150, hit);
  ship.addScar(hit.lx, hit.ly, hit.lz, nrm[0], nrm[1], nrm[2], 1.4, 2);
  ship.applyDamage(kg * 0.12 * st.softness, null, 'fire');
}

/** Torpedo hit on the hull side at local lx. */
export function resolveTorpedoHit(world, ship, torp, wx, wz) {
  const st = ship.stats;
  ship.toLocal(wx, 0, wz, _l);
  const lz = _l[2], lx = _l[0];
  const dmg = torp.warhead * 6 * st.torpFactor * (0.85 + 0.3 * world.rng());
  ship.flood(lx, lz, dmg * 0.012);
  ship.listSide = lz >= 0 ? 1 : -1;
  if (torp.owner) { torp.owner.damageDealt += dmg; torp.owner.torpHits++; torp.owner.shotsHit++; }
  ship.engine = Math.max(0.2, ship.engine - 0.15 * world.rng());
  const P = torp.warhead * 1.6 * st.torpFactor;
  const killed = blast(world, ship, lx, -2.0, clamp(lz, -st.B / 2, st.B / 2), P, 'under', torp.owner, 'torpedo');
  world.events.push({ type: 'impact', kind: 'torpedo', x: wx, y: 0, z: wz, cal: 600, ship, lx, ly: -1.5, lz, killed: killed.length });
  ship.applyDamage(dmg, torp.owner, 'torpedo');
}
