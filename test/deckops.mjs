// Flight-deck operations: node test/deckops.mjs [carrier ids]
// A carrier launches a wave from the deck park and the lifts, the wave is called back and lands one aircraft at a time on the wires, the park is
// struck below for the recovery and spotted again afterwards.
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { wrapPi, G } from '../js/game/math.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
const ids = process.argv.length > 2 ? process.argv.slice(2) : ['essex', 'shokaku', 'illustrious', 'graf_zeppelin', 'bearn', 'aquila'];
// the enemy is one destroyer, far away: nothing else happens on the carrier's deck but its own operations

for (const id of ids) {
  const w = new World(31); w.addTeam(0); w.addTeam(1);
  const s0 = teamStart(0, 2, 74000), s1 = teamStart(1, 2, 74000);
  spawnFleet(w, 0, parse(id + ':1,fletcher:1'), s0.x, s0.z, s0.heading);
  spawnFleet(w, 1, parse('fletcher:1'), s1.x, s1.z, s1.heading);
  for (const s of w.ships) s.cmd.throttle = s.team === 0 ? 0.5 : 0;      // the enemy lies still and far away: the battle must not end during the test
  w.start();
  const ship = w.ships.find((s) => s.stats.id === id);
  const dp = ship.model.deckPoints;
  const parked0 = ship.parked;
  const ev = {};
  const states = new Map();      // plane id -> set of 'phase/ds' it went through
  let wave = null, minGap = 1e9, lastTD = -1, worstLz = 0, firstTakeoff = null, lastTakeoff = null, maxOnDeck = 0, called = false, tCall = 0;
  const tdPos = [];
  let parkedMin = parked0, parkedAfter = null;
  let climbDev = 0, climbY = 1e9, firstGo = 1e9, orbitUp = 0, peakDecel = 0, peakJerk = 0, arrestT = 1e9, arrestN = 0, rollYaw = 0;
  const liftOff = [], runT = [];
  const step = (secs, until) => { const f = until && (() => (until() ? false : undefined)); for (let i = 0; i < secs * 10; i++) { w.update(0.1); for (const e of w.drainEvents()) { ev[e.type] = (ev[e.type] || 0) + 1; if (e.type === 'bolter' && e.ship === ship) lastTD = -1; if (e.type === 'planeTouchdown' && e.ship === ship) { if (lastTD >= 0) minGap = Math.min(minGap, w.time - lastTD); lastTD = w.time; worstLz = Math.max(worstLz, Math.abs(e.lz)); tdPos.push(e.lx); } if (e.type === 'planeLaunch' && e.ship === ship) { lastTakeoff = w.time; firstTakeoff ??= w.time; } }
    if (process.env.TRACE && called) for (const p of w.planes) if (p.owner === ship && !p.service) { const k = p.phase + '/' + (p.ds || '') + (p.leg ? '#' + p.leg : ''); if (p._k !== k) { p._k = k; console.log('   ', w.time.toFixed(0), 'p' + p.id, k); } }
    for (const p of w.planes) if (p.owner === ship) { const set = states.get(p.id) || new Set(); set.add(p.phase + '/' + (p.ds || '')); states.set(p.id, set); }
    for (const p of w.planes) if (p.owner === ship && !p.service) {
      // the take-off run: how long, and how far from the bow the wheels leave the deck; the landing roll: the aircraft stays along the deck
      if (p.phase === 'takeoff') { p._t0 ??= w.time; p._lxT = p.lx; } else if (p._t0 != null && !p._toDone) { p._toDone = true; liftOff.push(dp.x1 - p._lxT); runT.push(w.time - p._t0); }
      if (p.phase === 'rollout') rollYaw = Math.max(rollYaw, Math.abs(p.yaw || 0));
      if (p.phase === 'assemble' && p.asm === 'climb') climbDev = Math.max(climbDev, Math.abs(wrapPi(p.heading - ship.heading)));
      if (p.phase === 'assemble' && p.asm === 'orbit') orbitUp++;
      if (p.wave && !p.wave.cap && (p.phase === 'cruise' || p.phase === 'escort')) firstGo = Math.min(firstGo, w.time);
      if (p.ds === 'arrest') {
        // (the first tick of an arrest may follow the touchdown itself: the speed before it is the one in the air)
        if (p._arN) {
          const a = (p._pu - p.u) / 0.1; peakDecel = Math.max(peakDecel, a);
          if (p._pa != null) peakJerk = Math.max(peakJerk, Math.abs(a - p._pa) / 0.1);
          p._pa = a;
        }
        p._arN = (p._arN || 0) + 1;
      } else if (p._arN) { arrestT = Math.min(arrestT, p._arN * 0.1); arrestN++; p._arN = 0; p._pa = null; }
      p._pu = p.u;
    }
    parkedMin = Math.min(parkedMin, ship.parked);
    if (f && f() === false) break; } };
  // 1. the launch
  step(250, () => { if (!wave) { const p = w.planes.find((q) => q.owner === ship && q.wave); if (p) wave = p.wave; } if (wave) ship.air.cooldown = 1e9; return wave && wave.launched >= wave.planes.length; });
  ok(!!wave && wave.launched >= wave.planes.length, `${id}: the whole wave (${wave && wave.planes.length} with its escort) took off, in ${firstTakeoff ? (lastTakeoff - firstTakeoff).toFixed(0) : '?'} s from the first to the last`);
  if (!wave) continue;
  const lifted = wave.planes.filter((p) => states.get(p.id)?.has('queue/rise'));
  const fromPark = wave.planes.filter((p) => !states.get(p.id)?.has('queue/rise'));
  console.log(`   ${fromPark.length} from the deck park (${parked0} spotted), ${lifted.length} up on a lift (${ship.model.elevators.length} lifts in the model)`);
  ok(fromPark.length > 0 || parked0 === 0, `${id}: aircraft leave the deck park first`);
  ok(lifted.every((p) => states.get(p.id).has('queue/lower') && states.get(p.id).has('queue/spot') && states.get(p.id).has('queue/taxi') && states.get(p.id).has('takeoff/run')), `${id}: the aircraft that came up on a lift went through lower, rise, spot and taxi to the take-off run`);
  // 2. call the wave back once it is in the air and has settled
  step(110);
  ok(runT.length && runT.every((t) => t > 4.5) && liftOff.every((d) => d < 60), `${id}: the take-off run takes the deck ahead of the aircraft (${Math.min(...runT).toFixed(1)}-${Math.max(...runT).toFixed(1)} s, off the deck ${Math.max(...liftOff).toFixed(0)} m or less before the bow)`);
  ok(climbDev < 0.06, `${id}: the aircraft fly straight ahead off the deck until clear of the bow (worst turn ${(climbDev * 57.3).toFixed(1)} degrees)`);
  ok(orbitUp > 0 && firstGo >= lastTakeoff, `${id}: the strike circles over the sea until the last aircraft has taken off (leaves ${(firstGo - lastTakeoff).toFixed(0)} s after the last take-off)`);
  for (const p of wave.planes) if (p.phase === 'cruise' || p.phase === 'assemble' || STRIKE(p)) { p.phase = 'return'; p.asm = null; }
  wave.aborted = true; wave.assessed = true; called = true; tCall = w.time;
  function STRIKE(p) { return ['cruise', 'ip', 'run', 'rollin', 'dive', 'egress'].includes(p.phase); }
  const inAir = wave.planes.filter((p) => p.phase === 'return').length;
  if (process.env.DEBUG) console.log('   called back', inAir, 'of', wave.planes.length, wave.planes.map((p) => p.phase + (p.dying ? '!' : '')).join(' '));
  const total = () => ship.air.ready + ship.air.fReady + ship.air.servicing.length;
  const readyBefore = total();
  step(3000, () => !w.planes.some((p) => p.owner === ship && !p.service && ['return', 'pattern', 'final', 'waveoff', 'rollout', 'taxiIn'].includes(p.phase)));
  if (process.env.DEBUG) console.log('   after', w.time.toFixed(0), JSON.stringify(ev), wave.planes.map((p) => p.phase + (p.gone ? 'G' : '')).join(' '));
  const landed = ev.planeLand || 0;
  ok(landed >= inAir - 1, `${id}: ${landed} of the ${inAir} aircraft called back landed (touchdowns ${ev.planeTouchdown || 0}, bolters ${ev.bolter || 0}, wire catches ${ev.wireCatch || 0})`);
  ok(arrestN > 0 && peakDecel < 1.5 * G && arrestT > 1.6 && peakJerk < 70, `${id}: the wire stops the aircraft smoothly (${arrestN} arrests, peak ${(peakDecel / G).toFixed(2)} g, jerk ${peakJerk.toFixed(0)} m/s3, shortest ${arrestT.toFixed(1)} s)`);
  ok(total() >= readyBefore + landed - 0, `${id}: the aircraft that landed are back in the air group, being serviced or ready (${readyBefore} -> ${total()})`);
  ok(rollYaw < 0.3, `${id}: the aircraft stays along the deck as it lands (worst ${(rollYaw * 57.3).toFixed(1)} degrees off the ship's heading)`);
  // (after a bolter the next aircraft, already in the groove behind it, lands as it comes: that gap is not the spacing of the approaches)
  // (a landing every 20-30 seconds, as in the war; never less than 15)
  ok(minGap > 15, `${id}: touchdowns at least ${minGap > 1e8 ? '-' : minGap.toFixed(0)} s apart`);
  ok(worstLz < dp.hw * 0.85, `${id}: touchdowns within ${worstLz.toFixed(1)} m of the centre line (deck half-width ${dp.hw.toFixed(1)} m)`);
  ok(tdPos.every((x) => x > dp.x0 - 2 && x < dp.x0 + 70), `${id}: the wheels come down between the stern and the first wires (x0 + ${Math.min(...tdPos).toFixed(0)}..${Math.max(...tdPos).toFixed(0)} m from the ship's origin ${dp.x0.toFixed(0)})`);
  const bad = [...states.entries()].filter(([pid, set]) => set.has('rollout/arrest') && !set.has('taxiIn/ride'));
  ok(bad.length === 0, `${id}: every aircraft that was stopped by the wire went below`);
  // 3. the deck park is struck for the recovery and spotted again afterwards
  if (parked0 > 0 && ship.model.elevators.length) {
    ok(parkedMin === 0 || ship.parked > 0, `${id}: the park was struck below for the recovery (lowest ${parkedMin})`);
    step(900, () => ship.parked >= Math.round(ship.model.deckSlots.length * ship.air.ready / ship.stats.air.capacity) - 0);
    const want = Math.round(ship.model.deckSlots.length * ship.air.ready / ship.stats.air.capacity);
    if (process.env.DEBUG) { const D = ship._deck; console.log('   lifts', D.lifts.map((l) => l.x.toFixed(0) + ':h' + l.h.toFixed(2) + ':tgt' + l.tgt + (l.user ? ':user p' + l.user.id + '/' + l.user.phase + '/' + l.user.ds + (l.user.gone ? 'GONE' : '') : '')).join(' ')); console.log('   respot state', w.time.toFixed(0), 'parked', ship.parked, 'want', want, 'striking', D.striking, 'rec', D.recovering, 'circuit', D.circuit, 'pending', D.pending.length, 'nextService', D.nextService.toFixed(0), w.planes.filter((q) => q.owner === ship).map((q) => q.phase + '/' + q.ds + (q.service ? 'S' : '') + (q.leg ? '#' + q.leg : '') + ' hold' + (q.holdT||0).toFixed(0) + ' fuel' + q.fuel.toFixed(0) + ' land:' + D.landing.map((z)=>z.id+z.phase).join(',')).join(' ')); }
    ok(ship.parked >= want - 1, `${id}: and spotted again from the hangar (${ship.parked} of ${want})`);
  }
  const stuck = w.planes.filter((p) => p.owner === ship && ['queue', 'rollout', 'taxiIn'].includes(p.phase) && !p.service);
  ok(stuck.length === 0, `${id}: no aircraft left on the deck`);
}
console.log(fail ? `${fail} deck operation checks FAILED` : 'all deck operation checks OK');
