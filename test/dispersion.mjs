// Accuracy of naval gunfire and what the ships can see: node test/dispersion.mjs
// The horizon and the sight lines (sim/sensors.js), the radars of each ship, how far a gun may be laid on a target, the dispersion of the shells of a salvo and the hit rate of
// duels (sim/accuracy.js, data/gunnery.js). Battles are chaotic: the bands below are judged over several seeds, never on one.
import { World } from '../js/game/sim/world.js';
import { horizonM, canDetect, engageRange, gunRange, visualReach, maxReach, topHeight, eyeHeight } from '../js/game/sim/sensors.js';
import { rangingSigma, systemOf } from '../js/game/sim/accuracy.js';
import { GUNS, SYSTEMS, FIT, RADARS, fitOf, gunProfile } from '../js/game/data/gunnery.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const KN = 0.5144;

function world(seed = 1) { const w = new World(seed); w.addTeam(0); w.addTeam(1); return w; }
const pair = (a, b, d, seed = 1) => { const w = world(seed); const s = w.addShip(a, 0, 0, 0, 0), t = w.addShip(b, 1, 0, -d, 0); w.start(); return { w, s, t }; };

// ---- the data: every ship has a fit, every gun a dispersion ----
{
  let missing = 0, bad = 0;
  for (const sp of ALL_SHIPS) {
    const f = fitOf(sp);
    if (!SYSTEMS[f.main] || !SYSTEMS[f.sec]) bad++;
    for (const r of f.radars) if (!RADARS[r]) bad++;
    if (!FIT[sp.id] && !FIT[sp.baseId]) { missing++; console.log('  no fit:', sp.id); }
    const g = gunProfile(sp.nation, sp.main.caliberMm, [sp.id, sp.baseId]);
    if (g.id === 'generic') { missing++; console.log('  no dispersion entry:', sp.id, sp.main.caliberMm); }
  }
  ok(bad === 0, 'every system and radar named in a fit exists');
  ok(missing === 0, 'every ship has a fit and a dispersion entry for her main guns');
  ok(GUNS.every((g) => g.sr > 0.2 && g.sr < 1.2 && g.sd > 0.05 && g.sd < g.sr), 'the dispersions are between 0.2 and 1.2 % of the range, the sideways one smaller');
  const it = gunProfile('Italy', 381, 'littorio'), us = gunProfile('USA', 406, 'iowa'), de = gunProfile('Germany', 380, 'bismarck');
  ok(it.sr >= 1.3 * us.sr && it.sr >= 1.3 * de.sr, `the Littorio's 381 mm is more scattered (${it.sr} %) than the Iowa's 16 in (${us.sr} %) and the Bismarck's 38 cm (${de.sr} %)`);
  ok(!fitOf({ id: 'littorio', baseId: null }).radars.length && !SYSTEMS[fitOf({ id: 'littorio' }).main].radar, 'the Italian battleship has no radar');
  ok(SYSTEMS[fitOf({ id: 'iowa' }).main].radar === 'mk8' && SYSTEMS[fitOf({ id: 'yamato' }).main].radar === 't22', 'the Iowa ranges with the Mk 8, the Yamato (April 1945) with the Type 22 Mod 4');
  ok(RADARS.t22.err > 5 * RADARS.mk8.err && !RADARS.t22.splash, 'the Japanese radar is far less precise and cannot spot splashes');
}

// ---- the horizon ----
{
  ok(near(horizonM(10, 10), 26.0e3, 300), `horizon between two masts of 10 m: ${(horizonM(10, 10) / 1000).toFixed(1)} km (4.12 (sqrt 10 + sqrt 10))`);
  ok(near(horizonM(36, 45), 4.12e3 * (6 + Math.sqrt(45)), 1), 'the formula: 4.12 (sqrt h1 + sqrt h2) km');
  ok(horizonM(0, 0) === 0 && horizonM(25, 0) < horizonM(25, 25), 'an observer at the waterline sees nothing beyond the nearest wave; the higher the target, the farther it is seen');
  const { s, t } = pair('iowa', 'iowa', 10000);
  ok(topHeight(t) >= 40 && topHeight(t) <= 60 && eyeHeight(s) >= 25 && eyeHeight(s) <= topHeight(s), `the Iowa's masthead is at ${topHeight(t).toFixed(0)} m and her director at ${eyeHeight(s).toFixed(0)} m`);
}

// ---- who sees whom ----
{
  const at = (a, b, d) => { const { w, s, t } = pair(a, b, d); return canDetect(w, s, t); };
  ok(at('iowa', 'iowa', 20000).visual, 'two battleships see each other at 20 km on a clear day');
  ok(!at('iowa', 'iowa', 31000).visual && at('iowa', 'iowa', 31000).radar, 'at 31 km the eye is beyond the visibility (28 km) but the Iowa\'s radar has the other battleship');
  ok(!at('iowa', 'iowa', 40000).radar, 'a surface radar does not reach a battleship at 40 km');
  ok(!at('littorio', 'iowa', 31000).visual && !at('littorio', 'iowa', 31000).radar, 'the Littorio, with no radar, does not see the Iowa at 31 km');
  ok(at('littorio', 'iowa', 31000).radar === false && at('iowa', 'littorio', 31000).radar, 'radar: the Iowa sees the Littorio at 31 km, not the other way round');
  {
    const { w, s, t } = pair('fletcher', 'iowa', 24000);
    ok(visualReach(w, t, s) <= 28000 * 0.78 + 1, `a destroyer is lost in the haze sooner than a battleship (${(visualReach(w, t, s) / 1000).toFixed(1)} km)`);
  }
  // aircraft
  {
    const { w, s, t } = pair('iowa', 'iowa', 10000);
    const plane = (x, y, span) => ({ x, y, z: -100, team: 1, spec: { span }, phase: 'cruise', kind: span > 20 ? 'level' : 'fighter' });
    const hi = plane(0, 2500, 11);
    // an aircraft at 2,500 m sees a ship at 40-60 km
    const seesShip = (d) => canDetect(w, { ...hi, x: 0, z: 0 }, { ...t, x: 0, z: -d, stats: t.stats, model: t.model }).visual;
    ok(seesShip(42000) && !seesShip(65000), 'an aircraft at 2,500 m sees a ship at 42 km but not at 65 km');
    const seesPlane = (p, d) => canDetect(w, s, { ...p, x: 0, z: -d });
    ok(seesPlane(hi, 12000).visual && !seesPlane(hi, 25000).visual, 'a ship sees a fighter at 12 km, not at 25 km');
    ok(seesPlane(plane(0, 2500, 30), 22000).visual, 'and a heavy bomber at 22 km');
    ok(seesPlane(hi, 90000).radar && !seesPlane(hi, 170000).radar, 'the Iowa\'s SK radar picks up a high fighter at 90 km, not at 170 km');
    ok(!seesPlane(plane(0, 30, 11), 80000).radar, 'a fighter on the waves is under the radar horizon at 80 km');
    ok(!canDetect(w, { ...s, modules: [] }, { ...plane(0, 2500, 30), x: 0, z: -60000 }).visual && canDetect(w, w.addShip('fletcher', 0, 0, 0, 0), { ...plane(0, 2500, 30), x: 0, z: -60000 }).radar, 'a bomber at 60 km is seen by radar only');
    // an island between blocks the eye and the radar
    w.terrain = { blocks: () => true };
    ok(!canDetect(w, s, t).visual && !canDetect(w, s, t).radar, 'an island between the ships blocks both the eye and the radar');
  }
}

// ---- how far the guns can be laid ----
{
  const { s, t } = pair('iowa', 'iowa', 33000);
  const m = s.mounts.find((q) => q.group === 'main');
  ok(engageRange(s, t) >= 33000 && gunRange(s, m, t) >= 33000 && gunRange(s, m, t) <= m.gun.maxRange * 0.97, `the Iowa can lay her 16 in on a battleship at 33 km (radar): ${(gunRange(s, m, t) / 1000).toFixed(1)} km, never beyond her gun's own reach`);
  const L = pair('littorio', 'iowa', 33000);
  const ml = L.s.mounts.find((q) => q.group === 'main');
  ok(engageRange(L.s, L.t) < 29000 && gunRange(L.s, ml, L.t) < 29000, `the Littorio, without radar, can only lay on the Iowa as far as the eye reaches (${(engageRange(L.s, L.t) / 1000).toFixed(1)} km), well under her 42 km`);
  // a spotting aircraft lifts the horizon
  L.s.spotter = true;
  ok(engageRange(L.s, L.t) > 1e6, 'with a spotting aircraft in the air the horizon no longer limits the guns');
  // the radar is lost with its antenna
  const I = pair('baltimore', 'littorio', 31000);
  ok(engageRange(I.s, I.t) >= 31000 && I.s.modules.some((q) => q.kind === 'radar'), 'the Baltimore has the Littorio on her radar at 31 km');
  for (const q of I.s.modules) if (q.kind === 'radar') q.state = 2;
  I.s._radT = -1;
  ok(engageRange(I.s, I.t) < 29000 && maxReach(I.s) <= 28000, 'with her radar antennas destroyed she is back to the eye and the haze');
  const D = pair('fletcher', 'iowa', 12000);
  ok(visualReach(D.w, D.s, D.t) < 30000 && engageRange(D.s, D.t) >= visualReach(D.w, D.s, D.t), 'a destroyer\'s reach is that of her eye or her radar, whichever is farther');
}

// ---- ranging: the error grows with the square of the range for a rangefinder, is fixed for a radar ----
{
  const I = pair('iowa', 'iowa', 20000), B = pair('bismarck', 'iowa', 20000), L = pair('littorio', 'iowa', 20000), K = pair('kagero', 'iowa', 12000);
  const sig = (P, d) => { P.t.z = -d; return rangingSigma(P.s, systemOf(P.s, 'main'), P.t, d, P.w); };
  ok(sig(I, 20000) < 20 && sig(I, 30000) < 20, `the Iowa's radar ranges to within ${sig(I, 20000).toFixed(0)} m at 20 km and ${sig(I, 30000).toFixed(0)} m at 30 km, whatever the range`);
  const l10 = sig(L, 10000), l20 = sig(L, 20000);
  ok(near(l20 / l10, 4, 0.2), `the Littorio's rangefinder error grows with the square of the range (${l10.toFixed(0)} m at 10 km, ${l20.toFixed(0)} m at 20 km)`);
  ok(sig(L, 20000) > 4 * sig(I, 20000), 'at 20 km a ship with radar ranges much better than one with a rangefinder alone');
  ok(sig(B, 20000) < sig(L, 20000), 'the Bismarck\'s FuMO 23 and stereoscopic rangefinders range better than the Littorio\'s rangefinders alone');
  ok(sig(K, 12000) > 3 * sig(L, 12000) / 3 && sig(K, 12000) > sig(I, 12000) * 5, 'a destroyer\'s short rangefinder is poor at 12 km');
  L.t.z = -29500;
  ok(rangingSigma(L.s, systemOf(L.s, 'main'), L.t, 29500, L.w) >= 0.04 * 29500 - 1, 'beyond the visibility, with no radar, a ship can only reckon: 4 % of the range');
}

// ---- the dispersion of the shells, measured on the sea ----
/** Fire the main battery of `a` at a steady `b` from `d` m on parallel courses; returns the offsets (range, deflection) of each shell from the target, with the time it was fired. */
function shoot(a, b, d, seed, secs = 600, knots = 15) {
  const w = world(seed);
  const s = w.addShip(a, 0, 0, 0, 0, { speed: knots * KN }), t = w.addShip(b, 1, 0, -d, 0, { speed: knots * KN });
  s.cmd.throttle = Math.min(1, knots * KN / s.stats.maxSpeed); t.cmd.throttle = Math.min(1, knots * KN / t.stats.maxSpeed);
  w.start();
  const flying = new Map(), out = [];
  let shells = 0;
  for (let i = 0; i < secs * 10 && t.alive; i++) {
    s.cmd.main.target = t; s.cmd.main.fire = true; s.cmd.sec.target = null; s.cmd.sec.fire = false;
    w.update(0.1);
    w.drainEvents();
    const live = new Set(w.shells);
    for (const sh of w.shells) if (sh.owner === s && sh.group === 'main') { if (!flying.has(sh)) { flying.set(sh, { t0: w.time }); shells++; } flying.get(sh).p = [sh.x, sh.z]; }
    for (const [sh, rec] of flying) if (!live.has(sh)) {
      flying.delete(sh);
      const ux = t.x - s.x, uz = t.z - s.z, l = Math.hypot(ux, uz), dx = rec.p[0] - t.x, dz = rec.p[1] - t.z;
      out.push({ r: (dx * ux + dz * uz) / l, d: (-dx * uz + dz * ux) / l, t0: rec.t0, R: l });
    }
  }
  return { shots: s.stats && shells, hits: s.shotsHit, fired: s.shotsFired, impacts: out };
}
/** The scatter inside a salvo, as a share of the range: the shells that left one mount at the same instant, round their mean, pooled (mounts fire at their own moment: the error all the salvo shares drifts between two of them). */
function withinSalvo(imps) {
  const rs = [], ds = [];
  const sorted = [...imps].sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < sorted.length;) {
    let j = i; while (j < sorted.length && sorted[j].t0 - sorted[i].t0 < 0.15) j++;
    const g = sorted.slice(i, j);
    if (g.length >= 2) { const mr = mean(g.map((x) => x.r)), md = mean(g.map((x) => x.d)); for (const x of g) { rs.push((x.r - mr) / x.R * Math.sqrt(g.length / (g.length - 1))); ds.push((x.d - md) / x.R * Math.sqrt(g.length / (g.length - 1))); } }
    i = j;
  }
  return { r: Math.sqrt(mean(rs.map((x) => x * x))) * 100, d: Math.sqrt(mean(ds.map((x) => x * x))) * 100, n: rs.length };
}
{
  const pool = (a, b, d, seeds) => { let imps = [], hits = 0, fired = 0; for (const sd_ of seeds) { const r = shoot(a, b, d, sd_); imps = imps.concat(r.impacts); hits += r.hits; fired += r.fired; } return { imps, hits, fired }; };
  const US = pool('iowa', 'iowa', 20000, [1, 2, 3, 4]);
  const it = pool('littorio', 'iowa', 20000, [1, 2, 3, 4]);
  const wUS = withinSalvo(US.imps), wIT = withinSalvo(it.imps);
  ok(wUS.n > 100, `${wUS.n} shells of full salvos of the Iowa measured at 20 km`);
  ok(wUS.r > 0.2 && wUS.r < 0.5, `Iowa 16 in/50 at 20 km: shells of a salvo scatter ${wUS.r.toFixed(2)} % of the range in range (published 0.36 % shell to shell in 1987, 0.4-0.5 % in 1944)`);
  ok(wUS.d > 0.05 && wUS.d < 0.2, `and ${wUS.d.toFixed(2)} % sideways (published about 0.15 %)`);
  ok(wIT.r > 1.25 * wUS.r, `Littorio 381 mm: ${wIT.r.toFixed(2)} % in range, clearly wider than the Iowa's ${wUS.r.toFixed(2)} % (salvo spreads of 200-300 m at 20-30 km)`);
  ok(wIT.d > 1.25 * wUS.d, `and ${wIT.d.toFixed(2)} % sideways against ${wUS.d.toFixed(2)} %`);
  // ranging in: a ship that has only her rangefinder (the Littorio at 20 km: 83 m of error) is wild in her first salvos and settles as she watches the splashes; one with radar is not wild at all
  const rms = (a) => Math.sqrt(mean(a.map((x) => x * x)));
  // (judged over eight seeds, not four: the difference is a few per cent of a scatter of one per cent of the range, and a battle that is changed by anything else on the map moves it either way)
  const it8 = pool('littorio', 'iowa', 20000, [1, 2, 3, 4, 5, 6, 7, 8]);
  const firstIT = it8.imps.filter((x) => x.t0 < 80).map((x) => x.r / x.R * 100), laterIT = it8.imps.filter((x) => x.t0 > 200).map((x) => x.r / x.R * 100);
  ok(firstIT.length > 10 && laterIT.length > 10 && rms(firstIT) > 1.0 * rms(laterIT), `the Littorio's first salvos miss by ${rms(firstIT).toFixed(2)} % of the range (rms), the ranged-in ones by ${rms(laterIT).toFixed(2)} %`);
  const firstUS = US.imps.filter((x) => x.t0 < 80).map((x) => x.r / x.R * 100);
  ok(rms(firstUS) < rms(firstIT), `the Iowa's radar gives her a first salvo that is already near (${rms(firstUS).toFixed(2)} % rms against ${rms(firstIT).toFixed(2)} %)`);
  const sdAll = sd(US.imps.filter((x) => x.t0 > 120).map((x) => x.r / x.R * 100));
  ok(sdAll > wUS.r * 1.1 && sdAll < 1.6, `the salvos share errors: over the whole fight the scatter in range (${sdAll.toFixed(2)} %) is wider than inside a salvo (${wUS.r.toFixed(2)} %), as the pattern (0.64 %) is wider than the shell to shell figure (0.36 %)`);
  // the error of the fire control: radar against none, at a range where the eye is useless
  const hitRate = (r) => r.hits / Math.max(1, r.fired);
  const radar = pool('iowa', 'iowa', 27000, [1, 2, 3, 4]);
  ok(hitRate(radar) > 0.02, `ideal case, steady target, Iowa vs battleship at 27 km: ${(100 * hitRate(radar)).toFixed(1)} % of rounds hit (AMP 79.2R: 2.7 %)`);
  // the hit rates of a battleship on a steady target at 9, 18 and 27 km against the 1944 estimates for an Iowa-sized target (32.7, 10.5, 2.7 %): the same order, a little higher
  // (a target that holds its course and speed; a fight with captains who turn and zigzag is lower, see below)
  const r9 = pool('iowa', 'iowa', 9000, [1, 2, 3]), r18 = pool('iowa', 'iowa', 18000, [1, 2, 3]);
  const h9 = hitRate(r9), h18 = hitRate(r18), h27 = hitRate(radar);
  ok(h9 > h18 && h18 > h27, `the hit rate falls with the range: ${(100 * h9).toFixed(0)} % at 9 km, ${(100 * h18).toFixed(0)} % at 18 km, ${(100 * h27).toFixed(1)} % at 27 km`);
  ok(h9 > 0.25 && h9 < 0.72 && h18 > 0.07 && h18 < 0.28 && h27 > 0.015 && h27 < 0.14, 'and each is within the band of the 1944 estimates (33, 10.5 and 2.7 %) widened for a steady target');
  // the Littorio with her eye alone shoots worse than the Iowa with her radar at the same range
  const lit = hitRate(it), us = hitRate(US);
  ok(lit < us, `at 20 km the Littorio hits ${(100 * lit).toFixed(1)} % of her rounds, the Iowa ${(100 * us).toFixed(1)} %`);
}

// ---- duels of two captains who turn and zigzag: the hit rate of the real fights ----
// Denmark Strait 1941: 3-5 % of the rounds of Bismarck, Prinz Eugen and the Prince of Wales hit at 13-18 km; Calabria and Matapan: Italian fire at 20-26 km well under 1 %; Guadalcanal 1942:
// Washington hit with 9 of 75 16 in rounds (12 %) at 8 km; Surigao Strait: West Virginia's radar ranging at 22,800 yd, hits from the first salvo.
{
  const buckets = [[0, 10000], [10000, 16000], [16000, 22000]];
  const run = (A, B, sep, seeds) => {
    const tot = buckets.map(() => ({ f: 0, h: 0 }));
    for (const seed of seeds) {
      const w = world(seed);
      for (const [i, id] of [A, B].entries()) { const st = teamStart(i, 2, sep); spawnFleet(w, i, [{ id, count: 1 }], st.x, st.z, st.heading); }
      for (const s of w.ships) s.cmd.throttle = 0.7;
      w.start();
      const prev = new Map(w.ships.map((s) => [s, [0, 0]]));
      while (w.time < 1500 && w.state !== 'finished') {
        w.update(0.1); w.drainEvents();
        for (const s of w.ships) {
          const p = prev.get(s), df = s.shotsFired - p[0], dh = s.shotsHit - p[1];
          if (df || dh) { const e = w.ships.find((x) => x.team !== s.team), d = Math.hypot(e.x - s.x, e.z - s.z), k = buckets.findIndex(([a, b]) => d >= a && d < b); if (k >= 0) { tot[k].f += df; tot[k].h += dh; } }
          p[0] = s.shotsFired; p[1] = s.shotsHit;
        }
      }
    }
    return tot;
  };
  const pct = (t) => (100 * t.h / Math.max(1, t.f));
  const D = [run('kgv', 'bismarck', 18000, [1, 2, 3]), run('iowa', 'yamato', 18000, [1, 2, 3]), run('littorio', 'kgv', 22000, [1, 2, 3]), run('iowa', 'yamato', 8000, [1, 2, 3])];
  const near = (k) => D.reduce((a, d) => ({ f: a.f + d[k].f, h: a.h + d[k].h }), { f: 0, h: 0 });
  const long = near(2), mid = near(1), close = near(0);
  ok(long.f > 1000 && pct(long) > 1.2 && pct(long) < 9, `battleship duels at 16-22 km: ${pct(long).toFixed(1)} % of ${long.f} rounds hit (history: 2-8 %)`);
  ok(mid.f > 1000 && pct(mid) > 2 && pct(mid) < 14, `at 10-16 km: ${pct(mid).toFixed(1)} % of ${mid.f} rounds (every calibre counted)`);
  ok(close.f > 200 && pct(close) > 8 && pct(close) < 40, `inside 10 km: ${pct(close).toFixed(1)} % of ${close.f} rounds (history: 10-20 % with radar once ranged in; AMP 79.2R 33 % at 9 km on a steady course)`);
  ok(pct(long) < pct(mid) && pct(mid) < pct(close), 'the nearer, the more rounds hit');
  const italy = D[2][2];
  ok(italy.f > 500 && pct(italy) < 5, `the Littorio shooting at the KGV at 16-22 km: ${pct(italy).toFixed(1)} % (Matapan and Calabria: well under 5 %)`);
}

console.log(fail ? `${fail} FAIL` : 'all PASS');
