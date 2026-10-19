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
  const few = cut(8, 23); ok(few.events.includes('strikeMerged') && !few.events.includes('strikeAbort'), 'eight survivors of twenty close up into one formation per kind');
  const none = cut(2, 24); ok(none.events.includes('strikeAbort'), 'two survivors of a big wave turn back');
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
