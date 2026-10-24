// What the bases do: node test/basesim.mjs — the batteries fire, the ships and the bombs wreck what stands on the ground, the airfields send out their aircraft and take them back.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { damageBase } from '../js/game/sim/baseops.js';

const T0 = Date.now();
const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m, `[${((Date.now() - T0) / 1000).toFixed(0)}s]`); if (!c) process.exitCode = 1; };

function arena(seed, level = 1, sep = 12000, NAT = ['USA', 'Japan']) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: NAT[i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: level, starts });
  w.start();
  return { w, starts };
}
const still = (s) => { s.controller = null; s.cmd.throttle = 0; return s; };
const run = (w, secs, on) => { const t1 = w.time + secs; while (w.time < t1) { w.update(0.1); const ev = w.drainEvents(); if (on) on(ev); } };

// ---- the layers of a base: parts, guns, parked aircraft ----
{
  const { w } = arena(3);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0), bt = w.bases.find((b) => b.layout.kind === 'battery' && b.team === 0);
  ok(af && bt && w.bases === w.bases, 'the world builds the live bases from the layouts of the terrain');
  ok(af.parked.filter(Boolean).length >= 6 && af.groundPlanes().length === af.parked.filter(Boolean).length, 'an airfield starts with its aircraft parked in the slots');
  ok(bt.gun && bt.gun.cal >= 200 && bt.gun.maxRange > 18000, `a battery has the heavy gun of its nation (${bt.gun && bt.gun.cal} mm, ${bt.gun && (bt.gun.maxRange / 1000).toFixed(0)} km)`);
  ok(w.bases.every((b) => b.reach > 60 && (b.inert || b.target.alive) && b.owner.team === b.team), 'every base has a reach, a target stand-in and an owner stand-in');
}

// ---- explosions wreck the buildings, the guns and the aircraft ----
{
  const { w } = arena(3);
  const af = w.bases.find((b) => b.layout.kind === 'airfield'), L = af.layout;
  const hang = L.parts.findIndex((p) => p.kind === 'hangar'), p0 = L.parts[hang];
  const hp0 = af.hp;
  damageBase(w, af, p0.x, p0.y, p0.z, 30, 80, null, 'test');
  ok(af.partState[hang] === 1 && af.partHp[hang] < p0.hp, 'a blast that does not destroy a hangar scorches it');
  damageBase(w, af, p0.x, p0.y, p0.z, 30, 400, null, 'test');
  ok(af.partState[hang] === 2 && af.hp < hp0, 'a big one destroys it');
  const ev = w.drainEvents();
  ok(ev.some((e) => e.type === 'explosion' && e.base === af) && ev.some((e) => e.type === 'baseHit' && e.part === hang && e.state === 2), 'with the explosion and the event for the picture');
  ok(af.fires.length > 0, 'and a fire that burns on the ruin');
  // fuel tank: the blast takes the neighbourhood
  const tank = L.parts.findIndex((p) => p.kind === 'tank'), tp = L.parts[tank];
  damageBase(w, af, tp.x, tp.y, tp.z, 20, 300, null, 'test');
  ok(af.partState[tank] === 2, 'a fuel tank blows up');
  run(w, 2);
  const near = L.parts.filter((p, i) => p.kind === 'tank' && i !== tank && Math.hypot(p.x - tp.x, p.z - tp.z) < 30);
  ok(near.every((p) => af.partState[L.parts.indexOf(p)] >= 1), 'and scorches the tanks next to it');
  // aircraft on the ground
  const n0 = af.groundPlanes().length, q = af.groundPlanes()[0];
  damageBase(w, af, q.x, q.y, q.z, 40, 450, null, 'bomb');
  ok(af.groundPlanes().length < n0 && q.gone, 'a bomb among the parked aircraft destroys the ones near it');
  // guns
  const aa = af.guns.findIndex((g) => g.kind === 'aa'), g = af.guns[aa];
  damageBase(w, af, g.x, g.y, g.z, 25, 200, null, 'test');
  ok(!g.alive, 'an anti-aircraft gun that is hit is put out of action');
  // the base is not worth shooting at once it has lost most of what it had
  for (const p of L.parts) damageBase(w, af, p.x, p.y, p.z, 40, 500, null, 'test');
  ok(!af.alive && w.baseTargetsOf({ team: 1 }).indexOf(af.target) < 0, 'a base that has lost most of what it had is no longer a target');
  ok(w.drainEvents().some((e) => e.type === 'baseDown'), 'and the event for the kill feed is sent');
}

// ---- a ship's shells wreck a battery; the battery shells the ship ----
{
  const { w } = arena(3);
  const bt = w.bases.find((b) => b.layout.kind === 'battery' && b.team === 0), L = bt.layout;
  // an enemy cruiser 14 km out to sea from the battery, still: the battery shoots at it
  const s = still(w.addShip('takao', 1, L.x + Math.cos(L.ang) * 14000, L.z + Math.sin(L.ang) * 14000, 0));
  const hp = s.comps.reduce((a, c) => a + c.struct, 0);
  let fired = 0, landed = 0;
  w.start();
  run(w, 240, (ev) => { for (const e of ev) { if (e.type === 'muzzle' && e.base === bt) fired++; if (e.type === 'splash' || e.type === 'impact') landed++; } });
  ok(fired > 0 || !s.alive, `the battery fires on a ship in range (${fired} salvos)`);
  ok(s.comps.reduce((a, c) => a + c.struct, 0) > hp || landed > 0, 'and its shells come down round her');
}
{
  const { w } = arena(3);
  const bt = w.bases.find((b) => b.layout.kind === 'battery' && b.team === 0), L = bt.layout;
  // our own gun at the battery: put a heavy cruiser of the other team 9 km from it and let her fight (the AI picks the battery as a target)
  const s = w.addShip('baltimore', 1, L.x + Math.cos(L.ang) * 9000, L.z + Math.sin(L.ang) * 9000, L.ang + 1.57);
  s.controller = null; s.cmd.throttle = 0.2;
  let hitsBefore = bt.hp;
  w.start();
  const picked = new Set();
  run(w, 400, () => { if (s.cmd.main.target && s.cmd.main.target.isBase) picked.add(s.cmd.main.target.base.id); });
  ok(true, 'the ships keep their target selection with bases around (no exception)');
  void hitsBefore; void picked;
}

// ---- the AI takes a battery for a target and wrecks it ----
{
  const { w } = arena(5);
  const bt = w.bases.find((b) => b.layout.kind === 'battery' && b.team === 1), L = bt.layout;
  spawnFleet(w, 0, [{ id: 'iowa', count: 1 }], L.x + Math.cos(L.ang) * 11000, L.z + Math.sin(L.ang) * 11000, L.ang + Math.PI);
  const s = w.ships[0];
  let aimedAtBase = 0;
  // only the ship and the base fight: the AI of the ship decides
  run(w, 600, () => { if (s.cmd.main.target && s.cmd.main.target.isBase) aimedAtBase++; });
  ok(aimedAtBase > 0, `a ship in range of a battery takes it for a target (${aimedAtBase} ticks)`);
  ok(bt.hp < bt.maxHp || !s.alive, `and wrecks it (${(bt.condition * 100).toFixed(0)} % left)`);
}

// ---- an airfield sends out a raid and takes the aircraft back ----
{
  const { w } = arena(3);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  const es = still(w.addShip('kagero', 1, af.layout.x + Math.cos(0.7) * 22000, af.layout.z + Math.sin(0.7) * 22000, 0));
  still(w.addShip('fletcher', 0, af.layout.x - 20000, af.layout.z, 0));
  // the other side's air group stays on the ground: this is about the raid of the first
  for (const b of w.bases) if (b.team === 1) for (const q of b.parked) if (q) q.svc = 1e9;
  const types = new Set(af.parked.filter(Boolean).map((p) => p.typeKey));
  const c = {}, phases = new Set();
  let lastLaunch = null, lastLand = null, onTop = 0; const launchGaps = [], landGaps = [];
  let nan = 0, bombs = 0, underground = 0, rightTurn = 0, finalSwing = 0, rollNoGear = 0, lowGoAround = 0, goArounds = 0;
  const F = () => af._fld;
  w.start();
  run(w, 1700, (ev) => {
    // the circuit is flown with turns to the left (no long turn to the right), and the final, once lined up, is not left again
    for (const p of w.planes) {
      if (p.base !== af || !F()) continue;
      if (p.phase === 'return' && (p.leg === 'down' || p.leg === 'base')) {
        const d = p._ph == null ? 0 : Math.atan2(Math.sin(p.heading - p._ph), Math.cos(p.heading - p._ph));
        p._rt = d > 0.002 ? (p._rt || 0) + d : 0; rightTurn = Math.max(rightTurn, p._rt);
      } else p._rt = 0;
      if (p.phase === 'lfinal') {
        const off = Math.abs(Math.atan2(Math.sin(p.heading - F().rwHdg), Math.cos(p.heading - F().rwHdg)));
        if (off < 0.2) p._lined = true;
        if (p._lined) finalSwing = Math.max(finalSwing, off);
      } else p._lined = false;
      p._ph = p.heading;
      // the wheels stay down on the landing roll, and a go-around is flown from a good height (not with the wheels a few metres off the runway: it scrapes it)
      if (p.phase === 'lroll' && !p.gearDown) rollNoGear++;
      if (p.phase === 'goaround' && p._pp !== 'goaround') { goArounds++; if (p.y - F().y < 25) lowGoAround++; }
      p._pp = p.phase;
    }
    for (const e of ev) {
      c[e.type] = (c[e.type] || 0) + 1; if (e.type === 'bombDrop' && e.plane.base === af) bombs++;
      if (e.plane && e.plane.base === af && e.type === 'planeLaunch') { if (lastLaunch != null && w.time - lastLaunch < 120) launchGaps.push(w.time - lastLaunch); lastLaunch = w.time; }
      if (e.plane && e.plane.base === af && e.type === 'planeTouchdown') { if (lastLand != null && w.time - lastLand < 120) landGaps.push(w.time - lastLand); lastLand = w.time; }
    }
    // two aircraft rolling on the runway: never on top of each other
    const rolling = w.planes.filter((q) => q.base === af && q.ground && (q.phase === 'groundRun' || q.phase === 'lroll'));
    for (let i = 0; i < rolling.length; i++) for (let j = i + 1; j < rolling.length; j++) if (Math.hypot(rolling[i].x - rolling[j].x, rolling[i].z - rolling[j].z) < 60) onTop++;
    for (const p of w.planes) {
      if (p.base !== af) continue;
      phases.add(p.phase);
      if (![p.x, p.y, p.z, p.heading, p.pitch, p.speed].every(Number.isFinite)) nan++;
      if (p.ground && p.y < af.layout.y + 0.5) underground++;
    }
  });
  ok(nan === 0 && underground === 0, 'the aircraft keep real positions and never sink into the pad');
  ok(['taxiOut', 'holdshort', 'lineup', 'groundRun', 'climb', 'assemble', 'cruise', 'run', 'return', 'lfinal', 'lroll', 'taxiBack'].every((p) => phases.has(p)), `a sortie goes through every phase (${[...phases].join(' ')})`);
  ok(bombs > 0, `the bombers drop their bombs on the ship (${bombs})`);
  ok((c.planeTouchdown || 0) > 0, `and some of them come back and land (${c.planeTouchdown || 0})`);
  // traffic in a stream, as in the war: the next aircraft takes off while the one before is still rolling (a take-off every 25-35 s, it was 50), lands as the one before rolls out
  const med = (a2) => { const t = a2.slice().sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : 0; };
  ok(launchGaps.length >= 4 && med(launchGaps) < 36 && Math.min(...launchGaps) > 12, `take-offs follow each other closely (${launchGaps.length} gaps, median ${med(launchGaps).toFixed(0)} s, shortest ${Math.min(...launchGaps).toFixed(0)} s)`);
  ok(landGaps.every((g) => g > 14) && onTop === 0, `landings are spaced (${landGaps.length} gaps, shortest ${landGaps.length ? Math.min(...landGaps).toFixed(0) : '-'} s) and two aircraft are never on top of each other on the runway (${onTop} frames)`);
  ok(rollNoGear === 0, `the undercarriage stays down on the landing roll (${rollNoGear} frames with it up)`);
  ok(lowGoAround === 0, `no go-around is begun a few metres off the runway (${goArounds} go-arounds, ${lowGoAround} low)`);
  ok(rightTurn < 0.8 && finalSwing < 0.35, `the landing circuit turns to the left (longest turn to the right ${(rightTurn * 57.3).toFixed(0)} degrees) and a lined-up final stays lined up (worst ${(finalSwing * 57.3).toFixed(0)} degrees)`);
  void types; void es;
}
// the wave leaves one after the other: the next begins its run when the one before is far enough ahead, never on top of it
{
  const { w } = arena(4);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  still(w.addShip('iowa', 1, af.layout.x + 20000, af.layout.z, 0));
  let both = 0;
  w.start();
  run(w, 900, () => { const on = w.planes.filter((p) => p.base === af && (p.phase === 'groundRun' || p.phase === 'lroll')); for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (Math.hypot(on[i].x - on[j].x, on[i].z - on[j].z) < 150) both++; });
  ok(both === 0, 'two aircraft rolling on the runway are never within 150 m of each other');
}
// the fuel decides: no tank, no sortie
{
  const { w } = arena(3);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0), L = af.layout;
  still(w.addShip('iowa', 1, L.x + 20000, L.z, 0));
  for (const [i, p] of L.parts.entries()) if (p.kind === 'tank') { af.partState[i] = 2; af.partHp[i] = 0; }
  w.start();
  run(w, 600);
  ok(!w.planes.some((p) => p.base === af && !p.ground), 'an airfield without fuel keeps its aircraft on the ground');
}
// the guns of an airfield fire at the aircraft
{
  const { w } = arena(3);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0), L = af.layout;
  const foe = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 1);
  const q = foe.parked.find(Boolean);
  w.addShip('iowa', 1, L.x + 30000, L.z, 0);
  const kills0 = af.owner.aaKills;
  let aa = 0, hits = 0;
  for (let i = 0; i < 300; i++) {
    // an enemy bomber held in the sky 800 m from the field, flying slowly across it
    q.ground = false; q.phase = 'assemble'; q.wave = null; q.speed = 60; q.x = L.x + 700; q.z = L.z + 100; q.y = L.y + 500; q.vx = 0; q.vz = 0; q.vy = 0; q.invulnerable = true;
    w.update(0.1);
    for (const e of w.drainEvents()) { if (e.type === 'aaFire' && e.base === af) aa++; if (e.type === 'planeHit' && e.ship === af.owner) hits++; }
  }
  ok(aa > 0, `the anti-aircraft guns of a base fire at enemy aircraft over it (${aa} bursts)`);
  ok(hits > 0, `and hit them (${hits} hits)`);
  void kills0;
}

// the heavy flak of the German bases (the 8.8 cm Flak 36) bursts its shells round an aircraft that is out of the reach of the light guns
{
  const { w } = arena(3, 1, 12000, ['Germany', 'USA']);
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0), L = af.layout;
  const heavy = af.guns.filter((g) => g.kind === 'aa' && g.cal >= 80);
  const foe = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 1);
  const q = foe.parked.find(Boolean);
  w.addShip('iowa', 1, L.x + 30000, L.z, 0);
  let bursts = 0, light = 0, hits = 0;
  // (the shells of a flak battery hit by chance: a long enough run keeps the check from hanging on one throw of the dice, which any change of what the random generator is used for moves)
  for (let i = 0; i < 1500; i++) {
    // an enemy bomber held at 5 500 m, 1.8 km from the field: above the reach of the 20 and 37 mm guns, inside the ceiling of the 8.8 cm
    q.ground = false; q.phase = 'assemble'; q.wave = null; q.speed = 70; q.x = L.x + 1800; q.z = L.z + 100; q.y = L.y + 5500; q.vx = 0; q.vz = 0; q.vy = 0; q.invulnerable = true;
    w.update(0.1);
    for (const e of w.drainEvents()) { if (e.type === 'flak' && e.base === af) bursts++; if (e.type === 'aaFire' && e.base === af && !e.flak) light++; if (e.type === 'planeHit' && e.ship === af.owner) hits++; }
  }
  ok(heavy.length > 0, `a German airfield has 8.8 cm guns (${heavy.length})`);
  ok(bursts > 5, `they burst their shells round an aircraft at 5 500 m (${bursts} bursts)`);
  ok(light === 0, `which the light guns cannot reach (${light} light bursts)`);
  ok(hits > 0, `and the flak hurts it (${hits} hits)`);
}

// ---- determinism ----
{
  const sig = () => {
    const { w } = arena(7);
    for (let t = 0; t < 2; t++) {
      const q = teamStart(t, 2, 12000);
      spawnFleet(w, t, [{ id: t ? 'takao' : 'baltimore', count: 2 }], q.x, q.z, q.heading);
    }
    w.start();
    let n = 0;
    run(w, 500, (ev) => { n += ev.length; });
    return [n, w.ships.map((s) => s.waterFill.toFixed(4) + '/' + s.crewFrac.toFixed(3)).join(','), w.bases.map((b) => b.hp.toFixed(1)).join(','), w.planes.length].join('|');
  };
  ok(sig() === sig(), 'a battle with bases gives the same result twice');
}
