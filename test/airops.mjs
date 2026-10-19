// Strike formations and the light anti-aircraft magazines: node test/airops.mjs
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
const setup = (a, b, seed, sep = 30000) => {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  [parse(a), parse(b)].forEach((f, i) => { const s = teamStart(i, 2, sep); spawnFleet(w, i, f, s.x, s.z, s.heading); });
  for (const s of w.ships) s.cmd.throttle = 0.5;
  w.start();
  return w;
};
const run = (w, secs, f) => { const n = Math.round(secs / 0.1); for (let i = 0; i < n; i++) { w.update(0.1); if (f && f(i * 0.1) === false) break; } };

// ---- a wave leaves in sections of the same kind, up to four, and flies to the enemy in formation ----
{
  const w = setup('essex:1,cleveland:2', 'shokaku:1,agano:2', 21);
  let wave = null;
  run(w, 400, () => { const p = w.planes.find((q) => q.owner.stats.id === 'essex'); if (p) { wave = p.wave; return false; } });
  ok(!!wave, 'a carrier launches a strike wave');
  run(w, 120);
  const secs = wave.sections;
  ok(secs.length >= 2 && secs.every((q) => q.members.length >= 1 && q.members.length <= 4 && q.members.every((m) => m.kind === q.kind)), `${wave.n} aircraft in ${secs.length} sections of one kind (${secs.map((q) => q.kind[0] + q.members.length).join(' ')})`);
  // once formed up (cruise, all airborne) the followers hold their slots behind the leader
  let worst = 0, checked = 0;
  run(w, 200, () => {
    for (const sec of secs) {
      const live = sec.members.filter((m) => !m.dying && !m.gone && m.phase === 'cruise');
      // (a big section takes a while to join up: judged once its last aircraft has been flying for some time)
      if (live.length < 3 || !live.every((m) => m.age - m.t0Air > 60)) continue;
      const L = live[0];
      for (const m of live.slice(1)) { const d = Math.hypot(m.x - L.x, m.z - L.z); checked++; worst = Math.max(worst, d); }
    }
  });
  ok(checked > 20 && worst < 400, `the followers stay close to their leader (${checked} checks, worst ${worst.toFixed(0)} m)`);
}

// ---- the torpedo sections come in on different bearings, the aircraft of a section line abreast ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2', 22, 24000);
  const perWave = new Map();
  run(w, 700, () => {
    for (const p of w.planes) {
      if (p.owner.stats.id !== 'essex' || p.phase !== 'ip' || p.kind !== 'torp') continue;
      const r = perWave.get(p.wave) || { bearings: new Set(), lat: new Set(), secs: new Set() };
      r.bearings.add(Math.round(p.ipAngle * 20) / 20); r.lat.add(p.lat); r.secs.add(p.sec.id); perWave.set(p.wave, r);
    }
  });
  const multi = [...perWave.values()].filter((r) => r.secs.size >= 2);
  ok(multi.length > 0 && multi.every((r) => r.bearings.size >= 2), `${multi.length} wave(s) with several torpedo sections, each on a bearing of its own`);
  ok([...perWave.values()].some((r) => r.lat.size >= 3), 'the aircraft of a section line abreast (offsets of 0 and +-135 m)');
}

// ---- a wave that has lost most of its aircraft closes up, or turns back when too few are left ----
{
  const cut = (survivors, seed) => {
    const w = setup('essex:1,cleveland:2', 'shokaku:1,agano:2', seed, 40000);
    let wave = null, done = false; const events = [];
    run(w, 600, () => {
      for (const e of w.drainEvents()) events.push(e.type);
      if (!wave) { const p = w.planes.find((q) => q.owner.stats.id === 'essex'); if (p) wave = p.wave; }
      // once the whole wave has left the deck, shoot down all but `survivors` of it
      if (wave && !done && wave.launched >= wave.n && w.planes.filter((q) => q.wave === wave && q.phase === 'cruise').length >= wave.n - 2) {
        done = true;
        w.planes.filter((q) => q.wave === wave).slice(survivors).forEach((q) => { q.hp = 0; q.dying = true; });
      }
    });
    return { wave, events };
  };
  const few = cut(8, 24); ok(few.events.includes('strikeMerged') && !few.events.includes('strikeAbort'), 'eight survivors of twenty close up into one formation per kind');
  const none = cut(2, 24); ok(none.events.includes('strikeAbort'), 'two survivors of a big wave turn back');
}

// ---- the way in: the strike keeps away from the screen's guns ----
{
  const { chooseApproach, aaSources, exposure } = await import('../js/game/sim/routing.js');
  const w = new World(5); w.addTeam(0); w.addTeam(1);
  // the enemy: a battleship with two cruisers 3 km to the west of it, on the side the strike comes from
  const bb = w.addShip('yamato', 1, 0, 0, 0, { speed: 0, throttle: 0 });
  w.addShip('cleveland', 1, -3000, -600, 0, { speed: 0, throttle: 0 });
  w.addShip('cleveland', 1, -3200, 700, 0, { speed: 0, throttle: 0 });
  w.addShip('fletcher', 0, -40000, 0, 0, { speed: 0, throttle: 0 });
  const from = { x: -22000, z: 0 };
  const a = chooseApproach(w, 0, from, bb, 'torp', []);
  const a0 = Math.atan2(from.x - bb.x, -(from.z - bb.z));
  const srcs = aaSources(w, 0, 0);
  const path = (ang) => { let e = 0; for (const [x0, z0, x1, z1] of [[from.x, from.z, Math.sin(ang) * 9800, -Math.cos(ang) * 9800], [Math.sin(ang) * 9800, -Math.cos(ang) * 9800, 0, 0]]) { for (let i = 0; i <= 40; i++) e += exposure(srcs, x0 + (x1 - x0) * i / 40, z0 + (z1 - z0) * i / 40, true, bb); } return e; };
  ok(Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) > 0.5, `the torpedo bombers come in ${(Math.abs(a - a0) * 57.3).toFixed(0)} degrees away from the direct bearing, round the screen`);
  ok(path(a) < path(a0) * 0.6, `with ${(path(a) / path(a0) * 100).toFixed(0)} % of the fire along the direct way in`);
  const taken = chooseApproach(w, 0, from, bb, 'torp', [a]);
  ok(Math.abs(Math.atan2(Math.sin(taken - a), Math.cos(taken - a))) > 0.3, 'a second section takes a bearing of its own');
}

// ---- the bombers with a gunner shoot back, and the fighters protect the strike ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2,kagero:2', 33, 30000);
  let burstsByBombers = 0, fromGunners = 0, escortKills = 0;
  run(w, 600, () => { for (const e of w.drainEvents()) { if (e.type === 'mgFire' && !e.plane.fighter) burstsByBombers++; if (e.type === 'planeDown' && e.cause === 'gunner') fromGunners++; if (e.type === 'planeDown' && e.cause === 'gun' && e.plane.fighter && e.attacker && e.plane.owner !== e.attacker) escortKills++; } });
  ok(burstsByBombers > 0, `the bombers' gunners fired ${burstsByBombers} times at the fighters round them`);
  ok(escortKills + fromGunners > 0, `fighters shot down by fighters (${escortKills}) or by gunners (${fromGunners})`);
}

// ---- a bomber that fighters are hunting takes shelter under the guns of the friendly ships ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2', 21, 60000);
  let b = null;
  run(w, 300, () => { b = w.planes.find((q) => !q.fighter && q.phase === 'cruise' && q.y > 100); if (b) return false; });
  ok(!!b, 'a bomber is in the air');
  if (b) {
    b.phase = 'return'; b.ordnance = false;
    let refuge = false, near = 1e9;
    run(w, 40, () => { b.hunted = 3; if (b.phase === 'refuge') { refuge = true; for (const s of w.ships) if (s.team === b.team) near = Math.min(near, Math.hypot(s.x - b.x, s.z - b.z)); } });
    ok(refuge && near < 2500, `hunted, it circles round a friendly ship (${near.toFixed(0)} m from the nearest)`);
    run(w, 40);
    ok(b.phase !== 'refuge' || b.gone, `and goes home when the fighters have gone (${b.phase})`);
  }
}

// ---- light AA spends its rounds ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2,kagero:2', 25, 14000);
  const rounds = (sh) => sh.aaMounts.reduce((a, m) => a + m.ammo, 0);
  const before = new Map(w.ships.map((s) => [s.id, rounds(s)]));
  ok([...before.values()].every((v) => v > 0), 'every ship carries AA rounds');
  run(w, 700);
  let spent = 0; for (const s of w.ships) spent += before.get(s.id) - rounds(s);
  const fr = Math.min(...w.ships.map((q) => q.aaAmmo().frac));
  ok(spent > 0 && fr < 1, `the AA guns have fired ${Math.round(spent)} rounds in the raids (the emptiest ship is down to ${Math.round(fr * 100)} %)`);
}
console.log(fail ? `${fail} check(s) failed` : 'all air operation checks OK');

// ---- a section with fighters on it closes up, and opens out again afterwards ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2', 21, 70000);
  let sec = null;
  const spread = (s) => { const m = s.members.filter((q) => q.phase === 'cruise' && !q.dying && !q.gone); const l = m[0]; return m.length < 3 ? 1e9 : m.slice(1).reduce((a, q) => a + Math.hypot(q.x - l.x, q.z - l.z), 0) / (m.length - 1); };
  run(w, 400, () => {
    for (const p of w.planes) if (p.sec && !p.fighter && p.phase === 'cruise' && spread(p.sec) < 120 && w.time - (p.sec.t0 ?? w.time) > 20) { sec = p.sec; return false; }
  });
  ok(!!sec, 'a section is formed up and flying');
  if (sec) {
    const before = spread(sec);
    run(w, 40, () => { for (const m of sec.members) m.hunted = 3; });
    const tight = spread(sec);
    run(w, 40);
    const after = spread(sec);
    ok(tight < before * 0.8, `hunted, the section closes up (${before.toFixed(0)} m -> ${tight.toFixed(0)} m mean distance to the leader)`);
    ok(after > tight * 1.2 || after === 1e9, `and opens out again when the fighters have gone (${after === 1e9 ? 'attack' : after.toFixed(0) + ' m'})`);
  }
}

// ---- the light AA fires only inside the field of fire of its mount: not through the tower, not above what the barrel reaches ----
{
  const w = setup('essex:1,cleveland:2,fletcher:2', 'shokaku:1,agano:2,kagero:2', 11, 30000);
  let shots = 0, outside = 0, worst = 0;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  run(w, 700, () => {
    for (const e of w.drainEvents()) {
      if (e.type !== 'aaFire') continue;
      shots++;
      const r = e.mount.rec, dx = e.plane.x - e.x, dy = e.plane.y - e.y, dz = e.plane.z - e.z;
      if (Math.hypot(dx, dz) < 600) continue;               // close in, the lead the gun took and the aircraft's position differ by more than the tolerance
      const rel = wrap(Math.atan2(dx, -dz) - e.ship.heading - r.yaw0), el = Math.atan2(dy, Math.hypot(dx, dz));
      const slack = 14 * Math.PI / 180;
      const miss = Math.min(...[rel - 2 * Math.PI, rel, rel + 2 * Math.PI].map((q) => Math.max(r.arcMin - q, q - r.arcMax, 0)));
      worst = Math.max(worst, miss);
      if (process.env.DBG && miss > slack) console.log('outlier', e.ship.stats.id, 'rel', (rel * 180 / Math.PI).toFixed(0), 'arc', (r.arcMin * 180 / Math.PI).toFixed(0), (r.arcMax * 180 / Math.PI).toFixed(0), 'dist', Math.hypot(dx, dz).toFixed(0), 'el', (el * 180 / Math.PI).toFixed(0), 'y', e.plane.y.toFixed(0), e.plane.phase);
      if (miss > slack || el > (e.variant === 'iijn25' ? 80 : 88) * Math.PI / 180 + slack) outside++;
    }
  });
  ok(shots > 50, `the light AA fired ${shots} times`);
  ok(outside === 0, `every shot of the light AA is inside the arc of its mount and below its highest elevation (${outside} outside, worst ${(worst * 180 / Math.PI).toFixed(0)} deg beyond the arc)`);
}
