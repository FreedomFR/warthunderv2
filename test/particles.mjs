// The particle pool: node test/particles.mjs — when it is full, the flashes of a shot take the place of old smoke instead of being lost.
globalThis.GPUBufferUsage = { VERTEX: 1, COPY_DST: 2, UNIFORM: 4, STORAGE: 8, INDEX: 16 };
const { Particles, K } = await import('../js/game/render/particles.js');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

const stub = new Proxy({}, { get: () => () => stub });
const engine = { device: { createBuffer: () => ({}), createBindGroup: () => ({}), createRenderPipelineAsync: async () => ({}) }, gpu: { shader: async () => ({}), HDR: 'rgba16float' } };
const P = new Particles(engine);
P.ready.catch(() => {});

const smoke = (age) => ({ kind: K.SMOKE, x: 0, y: 0, z: 0, s0: 1, s1: 2, life: 10, r: 1, g: 1, b: 1, a0: 0.1, a1: 0 });
let guard = 0;
while (P.fill() < 1 && guard++ < 100000) P.add(smoke());
const full = P.n;
ok(full > 10000 && P.fill() === 1, `the pool fills (${full} particles)`);
P.add(smoke());
ok(P.n === full, 'a puff of smoke is refused when it is full');
for (let k = 0; k < full; k++) P.pool[k * 24 + 6] = 5;           // every puff halfway through its life
let kept = 0;
for (let k = 0; k < 20; k++) { P.add({ kind: K.FIREBALL, x: 1, y: 1, z: 1, s0: 1, s1: 5, life: 1, r: 1, g: 1, b: 1, a0: 1, a1: 0 }); }
for (let k = 0; k < full; k++) if (P.pool[k * 24 + 19] === K.FIREBALL) kept++;
ok(P.n === full && kept >= 15, `fireballs take the place of old smoke (${kept} of 20 kept, the pool stays at ${P.n})`);
for (let k = 0; k < full; k++) P.pool[k * 24 + 6] = 0;            // fresh puffs only: nothing is old enough to give way
const before = kept;
P.add({ kind: K.FLASH, x: 1, y: 1, z: 1, s0: 1, s1: 5, life: 1, r: 1, g: 1, b: 1, a0: 1, a1: 0 });
let after = 0;
for (let k = 0; k < full; k++) if (P.pool[k * 24 + 19] === K.FLASH) after++;
ok(after === 0, 'but a fresh puff is not thrown away for it');

// ---- the capacity is a setting ----
{
  const Q = new Particles(engine); Q.ready.catch(() => {});
  for (let k = 0; k < 5000; k++) Q.add(smoke());
  Q.setMax(100000);
  ok(Q.max === 100000 && Q.n === 5000 && Q.pool.length === 100000 * 24, 'a larger pool keeps the particles alive');
  Q.setMax(3000);
  ok(Q.n === 3000 && Q.fill() === 1, 'a smaller one keeps what fits');
  Q.setMax(1);
  ok(Q.max >= 2000, 'and never goes under a floor');
}

// the smoke has levels of detail: a constant of the shader, one pipeline each, built when asked for (a phone fills a lot of smoke)
{
  const { PARTICLES } = await import('../js/wgsl/particles.js');
  ok(/override SMOKE_DETAIL: u32 = 2u;/.test(PARTICLES) && (PARTICLES.match(/SMOKE_DETAIL >= /g) || []).length >= 3, 'the shader has the SMOKE_DETAIL constant and branches on it');
  const made = [];
  const eng = { device: { createBuffer: () => ({}), createBindGroup: () => ({}), createRenderPipelineAsync: async (d) => { made.push(d.fragment.constants.SMOKE_DETAIL); return { getBindGroupLayout: () => ({}) }; } }, gpu: { shader: async () => ({}), HDR: 'x', DEPTH: 'y', MSAA: 4, frameUBO: {}, transView: {}, skyView: {}, sampClamp: {}, envCubeView: {}, sunVisBuf: {} } };
  const R = new Particles(eng);
  R.setDetail(0);
  await R.ready;
  ok(made.length === 1 && made[0] === 0, 'only the level asked for is compiled at the start');
  R.setDetail(2); R.setDetail(2);
  await new Promise((r) => setTimeout(r, 10));
  ok(made.length === 2 && made[1] === 2 && R.detail === 2 && R.pipelines.size === 2, 'another level is built when the quality changes, once');
  R.setDetail(0);
  ok(R.pipeline === R.pipelines.get(0).pipeline, 'and going back to a built level is immediate');
  R.setDetail(9);
  ok(R.detail === 2, 'levels are kept within 0..2');
}
