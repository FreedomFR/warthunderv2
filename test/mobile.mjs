// The touch interface: node test/mobile.mjs — what counts as a phone, the pixel density cap, the keys a virtual stick holds down.
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

async function device(search, { coarse, w, h }) {
  globalThis.location = { search };
  globalThis.matchMedia = (q) => ({ matches: q.includes('coarse') ? coarse : false });
  globalThis.innerWidth = w; globalThis.innerHeight = h;
  return import('../js/game/device.js?' + Math.random());
}

{
  const d = await device('', { coarse: true, w: 915, h: 412 });
  ok(d.isMobile() && d.maxPixelRatio() === 1.5, 'a phone held sideways is mobile, and its pixel density is capped');
}
{
  const d = await device('', { coarse: true, w: 412, h: 915 });
  ok(d.isMobile(), 'and held upright');
}
{
  const d = await device('', { coarse: false, w: 1920, h: 1080 });
  ok(!d.isMobile() && d.maxPixelRatio() === Infinity, 'a computer with a mouse is not, and keeps its full density');
}
{
  const d = await device('', { coarse: true, w: 1280, h: 800 });
  ok(d.isMobile(), 'a tablet has no mouse either: it gets the touch interface');
}
{
  const a = await device('?mobile=1', { coarse: false, w: 1920, h: 1080 });
  ok(a.isMobile(), '?mobile=1 forces the touch interface (to try it on a computer)');
  const b = await device('?mobile=0', { coarse: true, w: 915, h: 412 });
  ok(!b.isMobile(), '?mobile=0 forces the desktop one');
}
{
  const { joyKeys } = await import('../js/game/ui/mobile.js');
  const eq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
  ok(eq(joyKeys(0, 0), []), 'a stick at rest holds nothing');
  ok(eq(joyKeys(0.1, -0.2), []), 'the dead zone ignores small pushes');
  ok(eq(joyKeys(0, -0.9), ['KeyW']), 'up is forward');
  ok(eq(joyKeys(0, 0.9), ['KeyS']), 'down is backward');
  ok(eq(joyKeys(-0.8, 0), ['KeyA']) && eq(joyKeys(0.8, 0), ['KeyD']), 'left and right strafe');
  ok(eq(joyKeys(0.7, -0.7), ['KeyW', 'KeyD']), 'a diagonal holds two keys');
}
