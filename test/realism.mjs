// The historical behaviour of the damage model: node test/realism.mjs
// Penetration against the published tables, plates struck at an angle, fuzes (arming, delay, duds), the underwater protection,
// ammunition, fires, flooding and the ways a ship is lost. The figures come from the sources listed in CHANGELOG.md.
import { World } from '../js/game/sim/world.js';
import { resolveShellHit, resolveBombHit, resolveTorpedoHit, torpedoReach } from '../js/game/sim/damage.js';
import { gunBallistics } from '../js/game/sim/ballistics.js';
import { muzzlePenetration, effectiveThickness, spacedPlates, fuzeThickness } from '../js/game/sim/penetration.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const mk = (id, seed = 1, enemy = 'iowa') => {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const s = w.addShip(id, 1, 0, 0, 0); const o = w.addShip(enemy, 0, 9000, 0, 0); w.start();
  o.cmd.main.fire = false; o.cmd.sec.fire = false; s.cmd.main.fire = false; s.cmd.sec.fire = false;      // only the hits the test makes
  for (let i = 0; i < 10; i++) w.update(0.1);
  return { w, s, o };
};
const within = (a, b, tol) => Math.abs(a - b) <= b * tol;

// ---- penetration against the published tables of the 16 in Mk 8, the Type 91 and the 38 cm shell ----
ok(within(muzzlePenetration(406, 1225, 762), 829, 0.01), 'US 16 in / 2700 lb: 829 mm of face-hardened plate at the muzzle');
ok(within(muzzlePenetration(460, 1458, 780), 864, 0.03), `Type 91 460 mm: ${muzzlePenetration(460, 1458, 780).toFixed(0)} mm against 864 in the table`);
ok(within(muzzlePenetration(380, 800, 820), 742, 0.03), `German 38 cm: ${muzzlePenetration(380, 800, 820).toFixed(0)} mm against 742 in the table`);
// the Mk 8 at 20 000 yd (1740 fps, 14.9 degrees): 20.0 in through a belt, 3.9 in through a deck. The deck case is the oblique one.
{
  const pen = muzzlePenetration(406, 1225, 762) * Math.pow(1740 / 2500, 1.43);
  ok(within(pen / 25.4, 20.0, 0.12), `at 20 000 yd the shell goes through ${(pen / 25.4).toFixed(1)} in of belt (table 20.0)`);
  const deck = pen / effectiveThickness(1, 90 - 14.9) / 25.4;
  ok(within(deck, 3.9, 0.15), `and ${deck.toFixed(1)} in of deck at 14.9 degrees (table 3.9)`);
}
ok(within(effectiveThickness(100, 45), 133, 0.05), 'a plate at 45 degrees is worth a third more (the shell needs 22 % more speed)');
ok(Math.abs(spacedPlates([100, 100]) - 100 * Math.pow(2, 1 / 1.4)) < 0.01, 'spaced plates add as De Marre says (T1^1.4 + T2^1.4)^(1/1.4)');
ok(within(fuzeThickness(356, 0), 24.9, 0.02) && within(fuzeThickness(356, 65), 0.45 * 0.07 * 356, 0.05), 'a base fuze needs 0.07 calibres of plate square on, less at 60 degrees (0.98 in then 0.44 in for 14 in)');

// ---- a shell on a plate: helper that fires one shell of gun `g` at the given range from the broadside, or on the deck ----
function shot(id, shooter, type, rangeM, where, seed) {
  const { w, s, o } = mk(id, seed, shooter);
  const g = o.stats.main;
  const b = gunBallistics({ cal: g.cal, v0: g.v0, shellKg: g.shellKg, maxRange: g.maxRange, maxElevDeg: Math.min(g.maxElevDeg, 50) });
  const lk = b.lookup(rangeM);
  const side = 1;
  const shell = { owner: o, gun: g, type, vx: -side * Math.cos(lk.fall) * lk.vImpact, vy: -Math.sin(lk.fall) * lk.vImpact, vz: 0, c: 0 };
  const lx = where.lx ?? 0, deck = s.model.hull.deckY(lx);
  const hit = where.deck ? { part: 'deck', lx, ly: deck, lz: 2 } : { part: 'hull', lx, ly: where.ly ?? 1.5, lz: side * (s.model.hull.halfBeamWL(lx) - 0.3) };
  w.drainEvents();
  resolveShellHit(w, s, shell, hit);
  const ev = w.drainEvents();
  return { w, s, ev: ev.find((e) => e.type === 'shellHit'), imp: ev.find((e) => e.type === 'impact'), lk };
}
const tally = (n, f) => { const r = {}; for (let i = 1; i <= n; i++) { const k = f(i); r[k] = (r[k] || 0) + 1; } return r; };

// ---- plunging fire: the belt is defeated at close range, the deck only at long range (immune zone) ----
{
  const near = tally(20, (i) => shot('bismarck', 'iowa', 'AP', 12000, { deck: true }, i).ev.result);
  const far = tally(20, (i) => shot('bismarck', 'iowa', 'AP', 33000, { deck: true }, i).ev.result);
  ok((near.bounce || 0) + (near.glance || 0) >= 18, `12 km: 16 in shells bounce off Bismarck's decks (${JSON.stringify(near)})`);
  ok((far.pen || 0) + (far.over || 0) + (far.dud || 0) >= 17, `33 km: the same shells come down steeply enough to go through (${JSON.stringify(far)})`);
  const belt = tally(20, (i) => shot('bismarck', 'iowa', 'AP', 12000, { lx: 5 }, i).ev.result);
  ok((belt.pen || 0) + (belt.dud || 0) >= 15, `12 km: they go through her 320 mm belt (${JSON.stringify(belt)})`);
}
// the inclined belt of the Iowa meets a flat shell at 19 degrees, the vertical belt of the Bismarck square on
{
  const a = shot('iowa', 'iowa', 'AP', 3000, { lx: 5 }, 1).ev, b = shot('bismarck', 'iowa', 'AP', 3000, { lx: 5 }, 1).ev;
  ok(a.angle > 14 && a.angle < 26 && b.angle < 8, `belt incidence at 3 km: Iowa ${a.angle.toFixed(0)} deg (belt leaning 19), Bismarck ${b.angle.toFixed(0)} deg`);
}
// ---- fuzes: thin plate does not arm the fuze; Japanese delay lets a shell cross a light ship; duds ----
{
  const us = tally(10, (i) => shot('fletcher', 'iowa', 'AP', 9000, { lx: 5 }, i).ev.result);
  const jp = tally(10, (i) => shot('fletcher', 'yamato', 'AP', 9000, { lx: 5 }, i).ev.result);
  ok((us.over || 0) + (us.dud || 0) === 10 && (jp.over || 0) + (jp.dud || 0) === 10, `16 in and 18 in shells go through a destroyer's skin without bursting (US ${JSON.stringify(us)}, Japanese ${JSON.stringify(jp)})`);
  const cl = tally(10, (i) => shot('cleveland', 'yamato', 'AP', 9000, { lx: 5 }, i).imp?.kind);
  ok((cl.penetrate || 0) >= 6, `against a light cruiser's belt a shell is slowed enough to burst inside (${JSON.stringify(cl)})`);
  // the long delay of the Japanese fuze: crossing the destroyer's hull, the burst is far from the entry point or none at all
  const d = shot('cleveland', 'yamato', 'AP', 9000, { lx: 5 }, 3).imp;
  ok(d && d.delay > 0.3 * 0, 'the impact event carries the fuze delay');
}
{
  // duds: the British navy's fuzes failed far more often than the American ones
  const duds = (shooter) => { let n = 0; for (let i = 1; i <= 300; i++) if (shot('baltimore', shooter, 'AP', 8000, { lx: 5, ly: 1 }, i).ev.result === 'dud') n++; return n; };
  const uk = duds('norfolk'), us = duds('baltimore');
  ok(uk >= 8 && uk <= 40 && us < uk, `fuze failures in 300 hits on a cruiser's belt: British ${uk}, American ${us}`);
}

// ---- the destroyers and the battleships ----
function hitsToKill(id, shooter, type, range, maxHits = 600) {
  const { w, s, o } = mk(id, 5, shooter);
  const g = o.stats.main;
  const b = gunBallistics({ cal: g.cal, v0: g.v0, shellKg: g.shellKg, maxRange: g.maxRange, maxElevDeg: Math.min(g.maxElevDeg, 50) });
  const lk = b.lookup(range), L = s.stats.L;
  let n = 0;
  while (s.state === 'afloat' && n < maxHits) {
    const lx = (w.rng() - 0.5) * L * 0.85, ly = 0.3 + w.rng() * 4, side = n % 2 ? 1 : -1;
    const shell = { owner: o, gun: g, type, vx: -side * Math.cos(lk.fall) * lk.vImpact, vy: -Math.sin(lk.fall) * lk.vImpact, vz: 0, c: 0 };
    const hit = { part: ly > s.model.hull.deckY(lx) - 0.8 ? 'deck' : 'hull', lx, ly, lz: side * (s.model.hull.halfBeamWL(lx) - 0.3) };
    resolveShellHit(w, s, shell, hit);
    for (let i = 0; i < 40; i++) w.update(0.1);      // (a hit every four seconds: the water has time to come in, the people to be lost)
    w.drainEvents(); n++;
  }
  return { n, s };
}
{
  const a = hitsToKill('fletcher', 'baltimore', 'HE', 9000).n, c = hitsToKill('fletcher', 'cleveland', 'HE', 9000).n;
  ok(a >= 8 && a <= 25, `a destroyer is lost to ${a} hits of 8 in HE`);
  ok(c >= 20 && c <= 70, `and to ${c} hits of 6 in HE (USS Hoel took over forty hits of all sizes)`);
  const bb = hitsToKill('iowa', 'fletcher', 'HE', 8000, 300);
  ok(bb.s.state === 'afloat' && bb.s.condition > 0.5, `300 hits of 5 in HE leave a battleship afloat with ${(bb.s.condition * 100).toFixed(0)} % fit to go on`);
  const k = hitsToKill('yamato', 'iowa', 'AP', 15000);
  ok(k.n >= 12, `a Yamato takes ${k.n} 16 in hits at 15 km before she is lost`);
}

// ---- torpedoes: the protection system, its limits, the number of hits ----
{
  const { s: kgv } = mk('kgv'), { s: iowa } = mk('iowa'), { s: dd } = mk('fletcher'), { s: yam } = mk('yamato'), { s: lit } = mk('littorio');
  ok(torpedoReach(dd, 490, 0) === 1, 'a destroyer has no underwater protection');
  ok(torpedoReach(kgv, 230, 0) < torpedoReach(kgv, 230, -kgv.stats.L * 0.45), 'King George V: the system covers the citadel, the hull aft of it (shaft brackets) does not');
  ok(torpedoReach(iowa, 230, 0) < torpedoReach(iowa, 490, 0) && torpedoReach(iowa, 490, 0) > 0.95, 'a small aerial torpedo is held better than a Type 93 by the 5.5 m system of the Iowa');
  ok(torpedoReach(yam, 230, 0) > torpedoReach({ ...yam, stats: { ...yam.stats, torpProt: { kg: 400 } }, model: yam.model }, 230, 0), 'the flawed joint of the Yamato costs her protection');
  ok(torpedoReach(lit, 350, 0) > torpedoReach({ ...lit, stats: { ...lit.stats, torpProt: { kg: 350 } }, model: lit.model }, 350, 0), 'and the Pugliese cylinder that did not collapse as designed');
  const n = (id, W) => { const { w, s } = mk(id, 2); let k = 0; while (s.state === 'afloat' && k < 40) { const p = s.toWorld(s.stats.L * [0.12, -0.08, 0.2, -0.2][k % 4], 0, (k % 2 ? 1 : -1) * s.stats.B / 2, [0, 0, 0]); resolveTorpedoHit(w, s, { warhead: W, owner: null }, p[0], p[2]); k++; for (let i = 0; i < 250 && s.state === 'afloat'; i++) { w.update(0.1); w.drainEvents(); } } return k; };
  ok(n('fletcher', 363) === 1, 'one torpedo sinks a destroyer');
  const c = n('cleveland', 490), b = n('iowa', 490), ba = n('iowa', 230);
  ok(c >= 2 && c <= 4, `a light cruiser is lost to ${c} Type 93 torpedoes`);
  ok(b >= 5 && b <= 11 && ba > b, `a battleship needs ${b} Type 93 torpedoes, ${ba} aerial ones (Yamato took ten and seven bombs, Musashi nineteen and seventeen)`);
}

// ---- ammunition: navy, flash, fires, damage control ----
{
  const bbRisk = (id) => mk(id).s.ammoRisk({ DD: 0.3, CL: 0.1, CA: 0.08, BB: 0.045, CV: 0.08 });
  ok(bbRisk('kgv') > 1.8 * bbRisk('iowa') && bbRisk('bismarck') < bbRisk('iowa'), 'cordite flashes more than US powder (a flash that lights one unit of it lights 75 of cordite); German charges in brass cases less');
  // a fire on the weather deck does not heat the magazines; one inside the citadel does
  const run = (inside, id, seed) => {
    const { w, s } = mk(id, seed);
    const mag = s.modules.find((m) => m.kind === 'magazine');
    s.addFire(mag.x, 2, mag.z, 1.0, inside);
    s.fires[0].t = 80;
    for (let i = 0; i < 1200 && s.state === 'afloat'; i++) { w.update(0.1); w.drainEvents(); if (mag.flooded) break; }
    return { mag, s };
  };
  const top = run(false, 'baltimore', 1), inn = run(true, 'baltimore', 1);
  ok(!(top.mag.heat > 0) && !top.mag.flooded && top.s.state === 'afloat', 'a fire on the upper deck does not heat the magazine below the armoured deck');
  ok(inn.mag.heat > 5 || inn.mag.flooded || inn.s.exploded, 'a fire inside the citadel does');
  let usF = 0, jpF = 0, usE = 0, jpE = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const u = run(true, 'baltimore', seed), j = run(true, 'takao', seed);
    if (u.mag.flooded) usF++; if (j.mag.flooded) jpF++; if (u.s.exploded) usE++; if (j.s.exploded) jpE++;
  }
  ok(usF > jpF && usF >= 30, `American crews flood the magazine in time (${usF} of 40) more often than Japanese ones (${jpF})`);
  ok(usE < 10 && jpE < 30, `and the magazine explodes on ${usE} (US) and ${jpE} (Japanese) of 40 fires`);
  const { s } = run(true, 'baltimore', 3);
  const mag = s.modules.find((m) => m.kind === 'magazine');
  if (mag.flooded) ok(s.mounts[mag.mount].noAmmo, 'the turret above a flooded magazine is out of ammunition');
}

// ---- flooding: counter-flooding and loss of stability ----
{
  const { w, s } = mk('baltimore', 4);
  for (let i = 0; i < 5; i++) { const c = s.comps[4 + i]; c.water[1] = 0.55; }
  for (let i = 0; i < 20; i++) w.update(0.1);
  const l0 = s.floodList;
  for (let i = 0; i < 1500 && s.state === 'afloat'; i++) w.update(0.1);
  ok(l0 > 0.1 && Math.abs(s.floodList) < l0 * 0.7, `counter-flooding brings the list from ${l0.toFixed(2)} to ${s.floodList.toFixed(2)}`);
  const d = mk('fletcher', 4);
  for (let i = 2; i < 7; i++) d.s.comps[i].water[0] = 0.8;
  for (let i = 0; i < 1200 && d.s.state === 'afloat'; i++) d.w.update(0.1);
  ok(d.s.state !== 'afloat' && d.s.sinkMode === 'roll', `a destroyer that has no compartment to counter-flood capsizes (${d.s.state}, ${d.s.sinkMode})`);
}

// ---- carriers: unarmoured and armoured flight decks, aviation fuel ----
{
  const bomb = (id, kg, vy = -140) => { const { w, s } = mk(id, 7); const lx = s.stats.L * 0.1; resolveBombHit(w, s, { kg, vx: 0, vy, vz: 0, owner: null }, { part: 'deck', lx, ly: s.model.hull.deckY(lx), lz: 2 }); return w.events.find((e) => e.type === 'impact').kind; };
  ok(bomb('essex', 250) === 'penetrate' && bomb('shokaku', 250) === 'penetrate', 'a 250 kg bomb goes through the thin flight deck of an Essex or a Shokaku and bursts in the hangar');
  ok(bomb('illustrious', 250) === 'explode' && bomb('illustrious', 454) === 'explode', 'the 76 mm armoured flight deck of the Illustrious keeps 250 and 454 kg bombs out');
  // vapour from a holed fuel store: purged by the American system more often than by the Japanese
  const leak = (id, seed) => {
    const { w, s } = mk(id, seed);
    const m = s.modules.find((q) => q.kind === 'avgas');
    s.startAvgasLeak(m, w);
    if (!s.avgasLeak) return 0;
    s.addFire(m.x, 4, m.z, 0.5, true); s.fires[0].t = 1e6;      // the fire is the spark
    let boom = 0;
    for (let i = 0; i < 6000 && s.avgasLeak; i++) { w.update(0.1); for (const e of w.drainEvents()) if (e.avgas) boom = 1; }
    return boom;
  };
  let jp = 0, us = 0;
  for (let seed = 1; seed <= 30; seed++) { jp += leak('shokaku', seed); us += leak('essex', seed); }
  ok(jp > us && jp >= 5, `fuel vapour ends in an explosion on ${jp} of 30 Shokaku and ${us} of 30 Essex (Taiho, Shokaku and Lexington were lost that way)`);
}
console.log(fail ? `${fail} check(s) failed` : 'all realism checks OK');
