// The visual effects fed by a real battle (no GPU: the particle pool and the foam are stubs): node test/effects.mjs
// Every kind of event of a fleet fight with carriers goes through the effects code; none may throw or write a NaN into the pool.
globalThis.GPUBufferUsage = { VERTEX: 1, COPY_DST: 2, UNIFORM: 4, STORAGE: 8, INDEX: 16 };
const { World } = await import('../js/game/sim/world.js');
const { spawnFleet, teamStart } = await import('../js/game/sim/formation.js');
const { Particles } = await import('../js/game/render/particles.js');
const { Effects } = await import('../js/game/render/effects.js');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

const P = { windDir: 40, windSpeed: 6 };
const engine = {
  device: { createBuffer: () => ({}), createBindGroup: () => ({}), createRenderPipelineAsync: async () => ({}) },
  gpu: { shader: async () => ({}), HDR: 'rgba16float' },
  cam: { x: 0, y: 25, z: 0 }, P: new Proxy(P, { get: (t, k) => t[k] ?? 0 }),
  foam: { add() {}, addPoint() {}, stamp() {} },
};
const particles = new Particles(engine); particles.ready.catch(() => {});
const fx = new Effects(engine, particles, {});

const w = new World(31); w.addTeam(0); w.addTeam(1);
const sep = 14000;
[[{ id: 'essex', count: 1 }, { id: 'iowa', count: 1 }, { id: 'fletcher', count: 2 }], [{ id: 'shokaku', count: 1 }, { id: 'yamato', count: 1 }, { id: 'agano', count: 1 }]].forEach((f, i) => {
  const s = teamStart(i, 2, sep); spawnFleet(w, i, f, s.x, s.z, s.heading);
});
w.start();
const types = new Set();
let threw = null, steps = 0;
try {
  for (let t = 0; t < 900 && w.state !== 'finished'; t += 0.1) {
    w.update(0.1);
    const ev = w.drainEvents();
    for (const e of ev) types.add(e.type);
    // the camera follows the action so that the distance-dependent branches run
    const s = w.ships[(steps / 200 | 0) % w.ships.length];
    engine.cam.x = s.x + 400; engine.cam.z = s.z + 400;
    fx.emitScale = 1;
    fx.process(ev); fx.update(0.1, w); particles.update(0.1);
    steps++;
  }
} catch (e) { threw = e; }
ok(!threw, 'the effects run through a fifteen minute battle without an exception' + (threw ? ': ' + threw.stack.split('\n').slice(0, 3).join(' | ') : ''));
let bad = 0;
for (let k = 0; k < particles.n * 24; k++) if (!Number.isFinite(particles.pool[k])) bad++;
ok(bad === 0, 'no NaN in the particle pool');
ok(types.has('muzzle') && types.has('splash') && types.has('impact'), `the events of a battle were seen (${[...types].join(', ')})`);
ok(particles.n > 0 && particles.fill() < 1, `and the pool is neither empty nor full (${particles.n} particles)`);
