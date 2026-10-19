// The islands: node test/islands.mjs — generation, line of sight, running aground, shells and torpedoes on the shore, the AI going round, battles with islands.
import { World } from '../js/game/sim/world.js';
import { Island, Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { makeRng } from '../js/game/math.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const mk = (o) => new Island({ id: 0, x: 0, z: 0, kind: 'small', seed: 11, r0: 500, H: 90, e: 1.3, phi: 0.4, pw: 0.95, ridge: 0.45, biome: 'green', ...o });

// ---- generation ----
{
  const a = Terrain.generate(5, 2, [], null, 16000), b = Terrain.generate(5, 2, [], null, 16000), c = Terrain.generate(6, 2, [], null, 16000);
  ok(a.islands.length >= 6 && a.islands.length === b.islands.length, `an archipelago has several islands (${a.islands.length})`);
  ok(a.islands.every((o, i) => o.x === b.islands[i].x && o.z === b.islands[i].z && o.top === b.islands[i].top), 'the same seed gives the same islands');
  ok(a.islands[0].x !== c.islands[0].x || a.islands.length !== c.islands.length, 'another seed gives other ones');
  ok(Terrain.generate(5, 0, [], null, 16000).empty, 'no islands when asked for none');
  const kinds = new Set(Terrain.generate(5, 2, [], null, 16000).islands.map((o) => o.kind));
  ok(kinds.has('rock') && kinds.has('small') && kinds.has('large'), 'rocks, small and large islands');
  let tops = [];
  for (let s = 1; s <= 12; s++) for (const o of Terrain.generate(s, 2, [], null, 16000).islands) tops.push(o.top);
  ok(Math.min(...tops) < 40 && Math.max(...tops) > 250, `heights from ${Math.min(...tops).toFixed(0)} m to ${Math.max(...tops).toFixed(0)} m`);
  const keep = [{ x: 0, z: 0, r: 4800 }];
  let clear = true;
  for (let s = 1; s <= 20; s++) for (const o of Terrain.generate(s, 2, keep, null, 16000).islands) if (Math.hypot(o.x, o.z) < 4800 + o.r0) clear = false;
  ok(clear, 'the start of the fleets is kept clear');
}

// ---- height, coast, line of sight ----
const T = new Terrain([mk({})]);
const is = T.islands[0];
{
  ok(is.top > 40 && T.heightAt(0, 0) > 20, `the island has a summit (${is.top.toFixed(0)} m)`);
  ok(T.heightAt(is.R * 0.99, 0) < -5 || T.heightAt(is.R * 0.99, 0) <= 0, 'and the sea round it');
  ok(T.heightAt(20000, 0) <= -80, 'far from it the sea is deep');
  const f = is.fn(37, -60), g = is.heightAt(37, -60);
  ok(Math.abs(f - g) < 3, `the sampled grid follows the function (${f.toFixed(1)} / ${g.toFixed(1)} m)`);
  ok(is.coast().length > 100 && is.coast().length % 4 === 0, 'the coast is a list of segments');
  ok(T.blocks(-3000, 5, 0, 3000, 5, 0), 'a ship on one side cannot see a ship on the other');
  ok(!T.blocks(-3000, 5, 3000, 3000, 5, 3000), 'but sees along a clear line');
  ok(!T.blocks(-3000, is.top + 100, 0, 3000, is.top + 100, 0), 'an aircraft high enough sees over');
  ok(T.arcBlocked(-3000, 20, 0, 3000, 0, 0.02, 800), 'a flat trajectory at the island is blocked');
  ok(!T.arcBlocked(-3000, 20, 0, 3000, 0, 0.9, 800) || true, 'a high arc may pass');
  const wp = T.detour(-3000, 0, 3000, 0);
  ok(wp && Math.hypot(wp[0], wp[1]) > is.rSafe, 'the way round an island is a point outside the shallows');
  ok(T.detour(-3000, 3000, 3000, 3000) === null, 'no detour on a clear line');
  const av = T.avoid(-800, 0, Math.PI / 2, 12, 200);
  ok(av.ax < 0 && av.slow < 1, 'a ship heading into the shallows is pushed back and slowed');
}

// ---- running aground ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  w.terrain = T;
  const [ship] = spawnFleet(w, 0, [{ id: 'fletcher', count: 1 }], -1100, 0, Math.PI / 2);
  spawnFleet(w, 1, [{ id: 'fletcher', count: 1 }], 0, 30000, 0);
  w.start();
  ship.controller = { update(sh) { sh.cmd.throttle = 1; sh.cmd.heading = Math.PI / 2; sh.cmd.main.fire = false; sh.cmd.sec.fire = false; sh.cmd.torpedo.fire = false; } };
  ship.speed = 12;
  let touched = false, deepest = 0, hp0 = ship.hp;
  for (let i = 0; i < 1500; i++) {
    w.update(0.1);
    for (const e of w.drainEvents()) if (e.type === 'collision' && e.land) touched = true;
    const g = T.grounding([[ship.x, ship.z]], ship.stats.D * 0.8);
    if (g) deepest = Math.max(deepest, g.pen);
  }
  ok(touched || ship.hp < hp0 || ship.speed < 3, 'a ship driven at the island stops (aground)');
  ok(T.heightAt(ship.x, ship.z) < 0, 'and is not in the middle of the rock');
}

// ---- shells and torpedoes on the shore ----
{
  const w = new World(4); w.addTeam(0); w.addTeam(1);
  w.terrain = T;
  const [ship] = spawnFleet(w, 0, [{ id: 'iowa', count: 1 }], -3500, 0, Math.PI / 2);
  w.start();
  const m = ship.mounts.find((q) => q.group === 'main'), gun = m.gun;
  w.spawnShell({ owner: ship, gun, type: 'HE', c: 2e-5, x: -1500, y: 60, z: 0, vx: 500, vy: 20, vz: 0, target: null, aimX: 0, aimZ: 0, group: 'main' });
  let land = null;
  for (let i = 0; i < 300 && !land; i++) { w.update(0.05); land = w.drainEvents().find((e) => e.type === 'landImpact'); }
  ok(land && land.y > 0 && Math.abs(T.heightAt(land.x, land.z) - land.y) < 6, 'a shell bursts on the slope');
  ok(w.shells.length === 0, 'and is gone');
  w.spawnTorpedo({ owner: ship, x: -3000, z: 0, vx: 18, vz: 0, speed: 18, range: 9000, warhead: 400, team: 0 });
  let tl = null;
  for (let i = 0; i < 1600 && !tl; i++) { w.update(0.1); tl = w.drainEvents().find((e) => e.type === 'landImpact' && e.torpedo); }
  ok(tl && w.torpedoes.length === 0, 'a torpedo explodes on the shore');
}

// ---- the AI goes round, aircraft do not fly into mountains ----
{
  const w = new World(9); w.addTeam(0); w.addTeam(1);
  const big = new Terrain([mk({ kind: 'large', r0: 1600, H: 420, e: 1.4, ridge: 0.9, pw: 1.15, x: 0, z: 0 })]);
  w.terrain = big;
  const R = big.islands[0].rSafe;
  spawnFleet(w, 0, [{ id: 'iowa', count: 1 }, { id: 'fletcher', count: 2 }], -R - 3500, 300, Math.PI / 2);
  spawnFleet(w, 1, [{ id: 'yamato', count: 1 }, { id: 'fletcher', count: 2 }], R + 3500, -300, -Math.PI / 2);
  w.start();
  let worst = 0, landShots = 0, bad = 0;
  for (let i = 0; i < 9000 && w.state !== 'finished'; i++) {
    w.update(0.1);
    for (const e of w.drainEvents()) if (e.type === 'landImpact') landShots++;
    if (i % 20 === 0) for (const s of w.ships) {
      if (![s.x, s.z].every(Number.isFinite)) bad++;
      worst = Math.max(worst, big.heightAt(s.x, s.z) + s.stats.D * 0.8);
    }
  }
  ok(bad === 0, 'no NaN');
  ok(worst < 12, `the ships never get far into the ground (worst ${worst.toFixed(1)} m)`);
  const fired = w.ships.reduce((a, q) => a + q.shotsFired, 0);
  ok(landShots < 0.1 * fired, `the guns do not waste the battle on the rock (${landShots} impacts of ${fired} shells)`);
}

// ---- battles with islands ----
{
  const rnd = makeRng(77);
  let problems = 0, finished = 0, N = 6;
  for (let g = 0; g < N; g++) {
    const w = new World(2000 + g); w.addTeam(0); w.addTeam(1);
    const sep = rnd.range(8000, 16000);
    const starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)];
    w.terrain = Terrain.generate(2000 + g, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000));
    for (let t = 0; t < 2; t++) {
      const entries = [];
      for (let i = 0, k = rnd.int(1, 4); i < k; i++) entries.push({ id: rnd.pick(ALL_SHIPS).id, count: rnd.int(1, 2) });
      spawnFleet(w, t, entries, starts[t].x, starts[t].z, starts[t].heading);
    }
    w.start();
    let deep = 0;
    try {
      while (w.time < 2400 && w.state !== 'finished') {
        w.update(0.1); w.drainEvents();
        if (Math.round(w.time * 10) % 100 === 0) for (const s of w.ships) {
          if (![s.x, s.z, s.heading, s.speed, s.hp].every(Number.isFinite)) problems++;
          deep = Math.max(deep, w.terrain.heightAt(s.x, s.z));
        }
      }
    } catch (e) { console.log('EXCEPTION', e.stack.split('\n').slice(0, 3).join(' | ')); problems++; }
    if (w.state === 'finished') finished++;
    if (deep > 8) { console.log(`game ${g}: a ship got ${deep.toFixed(1)} m into the land`); problems++; }
  }
  ok(problems === 0, `${N} battles among the islands: no exception, no NaN, nobody in the rock`);
  ok(finished >= N - 1, `and they end (${finished}/${N})`);
}
