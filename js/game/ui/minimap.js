// The map in the corner: the islands, the bases, every ship (an arrow in the colour of her team, pointing where she goes), the aircraft in the air, the selected ship and
// what she is shooting at, and the camera with the cone it sees. North is up (-z). A click picks the ship or the aircraft under it, or (free and tactical cameras) moves the
// camera there; the wheel zooms; K changes its size (small, large, hidden).
const SIZES = [210, 360, 0];
const LAND_PX = 400;                 // the land picture of the whole map area (blitted, smoothed, with the coast drawn over it as lines)
const TYPE_PX = { BB: 9, CV: 9, CA: 7.5, CL: 7, DD: 6 };
const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
const inAir = (p) => !p.gone && !['queue', 'parked', 'holdshort', 'lineup', 'taxiOut', 'taxiIn', 'taxiBack', 'rollout', 'lroll', 'floating'].includes(p.phase);

/** Round a distance to a nice length for the scale bar (m). */
export function niceLength(m) {
  const p = 10 ** Math.floor(Math.log10(Math.max(m, 1))), f = m / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

/** The area the map shows: the centre of the living ships and a radius that holds them all (m). */
export function mapExtent(ships, zoom = 1) {
  let x = 0, z = 0, n = 0;
  for (const s of ships) if (s.state !== 'sunk') { x += s.x; z += s.z; n++; }
  if (!n) return { x: 0, z: 0, r: 6000 / zoom };
  x /= n; z /= n;
  let r = 0;
  for (const s of ships) if (s.state !== 'sunk') r = Math.max(r, Math.hypot(s.x - x, s.z - z));
  return { x, z, r: Math.max(3000, r * 1.25 + 1200) / zoom };
}

export function createMinimap(game, o = {}) {
  const world = game.world, engine = game.engine;
  const cv = document.createElement('canvas');
  const box = document.createElement('div');
  box.id = 'minimap'; box.className = 'hud';
  box.append(cv);
  let sizeI = 0, zoom = 1, land = null, landKey = '', ext = { x: 0, z: 0, r: 6000 }, t = 0;
  const S = () => SIZES[sizeI];

  function resize() {
    const s = S(), dpr = Math.min(2, devicePixelRatio || 1);
    box.classList.toggle('hidden', !s);
    box.classList.toggle('big', sizeI === 1);
    if (!s) return;
    cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr);
    cv.style.width = cv.style.height = s + 'px';
  }
  resize();

  // the land of every island, once per battle: a picture of the area that holds all of them
  function buildLand() {
    const T = world.terrain;
    if (!T || !T.islands.length) { land = null; return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const is of T.islands) { x0 = Math.min(x0, is.x - is.R); x1 = Math.max(x1, is.x + is.R); z0 = Math.min(z0, is.z - is.R); z1 = Math.max(z1, is.z + is.R); }
    const span = Math.max(x1 - x0, z1 - z0), N = LAND_PX, px = span / N;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * px, z = z0 + (j + 0.5) * px;
      let h = -1e9;
      for (const is of T.islands) if (Math.abs(x - is.x) < is.R && Math.abs(z - is.z) < is.R) h = Math.max(h, is.heightAt(x, z));
      const k = (j * N + i) * 4;
      if (h > 0) { const e = Math.min(1, h / 300); d[k] = 104 + e * 70; d[k + 1] = 118 + e * 40; d[k + 2] = 76 + e * 40; d[k + 3] = 255; }
      else if (h > -25) { d[k] = 70; d[k + 1] = 120; d[k + 2] = 130; d[k + 3] = 150; }      // the shallows
    }
    g.putImageData(img, 0, 0);
    const coast = new Path2D();
    for (const is of T.islands) { const q = is.coast(); for (let i = 0; i < q.length; i += 4) { coast.moveTo(q[i], q[i + 1]); coast.lineTo(q[i + 2], q[i + 3]); } }
    land = { c, x0, z0, span, coast };
  }

  function reset() { land = null; landKey = ''; zoom = 1; }

  const toMap = (x, z, out) => { const s = S(), k = s / (2 * ext.r); out[0] = s / 2 + (x - ext.x) * k; out[1] = s / 2 + (z - ext.z) * k; return out; };
  const toWorld = (mx, my) => { const s = S(), k = (2 * ext.r) / s; return { x: ext.x + (mx - s / 2) * k, z: ext.z + (my - s / 2) * k }; };

  function draw() {
    const s = S(); if (!s) return;
    const key = world.terrain ? world.terrain.islands.length + ':' + (world.terrain.islands[0]?.x ?? 0) : '';
    if (key !== landKey) { landKey = key; buildLand(); }
    // the area eases towards the ships, so that the map does not jump when one of them sinks
    const want = mapExtent(world.ships, zoom);
    if (!ext.init) ext = { ...want, init: true };
    else { const a = 0.25; ext.x += (want.x - ext.x) * a; ext.z += (want.z - ext.z) * a; ext.r += (want.r - ext.r) * a; }
    const g = cv.getContext('2d'), dpr = cv.width / s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#0d2836d0'; g.fillRect(0, 0, s, s);
    const P = [0, 0], Q = [0, 0], k = s / (2 * ext.r);
    // land
    if (land) {
      toMap(land.x0, land.z0, P);
      g.imageSmoothingEnabled = true;
      g.drawImage(land.c, P[0], P[1], land.span * k, land.span * k);
      // the coast as lines over it: one path in metres, drawn through the transform of the map
      g.save(); g.setTransform(dpr * k, 0, 0, dpr * k, dpr * (s / 2 - ext.x * k), dpr * (s / 2 - ext.z * k));
      g.strokeStyle = '#d8d0a8aa'; g.lineWidth = 0.8 / k; g.stroke(land.coast); g.restore();
    }
    // bases
    for (const b of world.bases || []) {
      if (b.inert) continue;
      const tc = world.teams[b.team];
      toMap(b.layout.x, b.layout.z, P);
      g.fillStyle = b.alive && tc ? css(tc.rgb) : '#888';
      g.strokeStyle = '#000a'; g.lineWidth = 1;
      if (b.layout.kind === 'airfield') { g.fillRect(P[0] - 4, P[1] - 4, 8, 8); g.strokeRect(P[0] - 4, P[1] - 4, 8, 8); }
      else { g.beginPath(); g.moveTo(P[0], P[1] - 5); g.lineTo(P[0] + 5, P[1] + 4); g.lineTo(P[0] - 5, P[1] + 4); g.closePath(); g.fill(); g.stroke(); }
    }
    // the selected ship's target
    const sel = game.camera.target, rig = game.camera;
    if (sel && sel.alive && sel.cmd && sel.cmd.main.target && sel.cmd.main.target.alive) {
      const tg = sel.cmd.main.target;
      toMap(sel.x, sel.z, P); toMap(tg.x, tg.z, Q);
      g.setLineDash([4, 4]); g.strokeStyle = '#ffd27aaa'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(Q[0], Q[1]); g.stroke(); g.setLineDash([]);
    }
    // aircraft in the air
    const fp = (rig.mode === 'plane' || rig.mode === 'cockpit') ? rig.plane : null;
    for (const p of world.planes) {
      if (!inAir(p)) continue;
      const tc = world.teams[p.team];
      toMap(p.x, p.z, P);
      if (P[0] < -4 || P[0] > s + 4 || P[1] < -4 || P[1] > s + 4) continue;
      g.fillStyle = p.dying ? '#999' : tc ? css(tc.rgb) : '#ccc';
      g.fillRect(P[0] - 1.3, P[1] - 1.3, 2.6, 2.6);
      if (p === fp) { g.strokeStyle = '#e2a04e'; g.lineWidth = 1.6; g.beginPath(); g.arc(P[0], P[1], 6, 0, Math.PI * 2); g.stroke(); }
    }
    // ships
    for (const sh of world.ships) {
      if (sh.state === 'sunk') continue;
      const tc = world.teams[sh.team], L = TYPE_PX[sh.stats.type] || 5;
      toMap(sh.x, sh.z, P);
      g.save(); g.translate(P[0], P[1]); g.rotate(sh.heading);
      g.beginPath(); g.moveTo(0, -L); g.lineTo(L * 0.55, L * 0.7); g.lineTo(0, L * 0.35); g.lineTo(-L * 0.55, L * 0.7); g.closePath();
      g.fillStyle = sh.alive ? css(tc.rgb) : '#777'; g.fill();
      g.strokeStyle = '#000b'; g.lineWidth = 1; g.stroke();
      g.restore();
      if (sh === sel && !fp) { g.strokeStyle = '#e2a04e'; g.lineWidth = 1.8; g.beginPath(); g.arc(P[0], P[1], L + 4, 0, Math.PI * 2); g.stroke(); }
    }
    // the camera and what it sees
    const cam = engine.cam, half = Math.atan(Math.tan(cam.fovY / 2) * (innerWidth / Math.max(1, innerHeight)));
    toMap(cam.x, cam.z, P);
    const cx = Math.min(s - 3, Math.max(3, P[0])), cy = Math.min(s - 3, Math.max(3, P[1])), R = 26;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#ffffff55'); grad.addColorStop(1, '#ffffff00');
    g.fillStyle = grad; g.beginPath(); g.moveTo(cx, cy);
    g.arc(cx, cy, R, cam.yaw - half - Math.PI / 2, cam.yaw + half - Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 2.6, 0, Math.PI * 2); g.fill();
    // north and the scale
    g.fillStyle = '#ffffffb0'; g.font = '600 10px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('N', s - 11, 14); g.beginPath(); g.moveTo(s - 11, 17); g.lineTo(s - 14, 23); g.lineTo(s - 8, 23); g.closePath(); g.fill();
    const L = niceLength(ext.r * 0.5), lp = L * k;
    g.strokeStyle = '#ffffffb0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, s - 9); g.lineTo(8 + lp, s - 9); g.moveTo(8, s - 12); g.lineTo(8, s - 6); g.moveTo(8 + lp, s - 12); g.lineTo(8 + lp, s - 6); g.stroke();
    g.textAlign = 'left'; g.fillText(L >= 1000 ? `${L / 1000} km` : `${L} m`, 12 + lp, s - 6);
  }

  // a click: the ship or the aircraft under it, else the camera goes there (free, tactical)
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, P = [0, 0];
    let best = null, bd = 11;
    for (const sh of world.ships) { if (sh.state === 'sunk') continue; toMap(sh.x, sh.z, P); const d = Math.hypot(P[0] - mx, P[1] - my); if (d < bd) { bd = d; best = { ship: sh }; } }
    if (!best) { bd = 7; for (const p of world.planes) { if (!inAir(p) || p.dying) continue; toMap(p.x, p.z, P); const d = Math.hypot(P[0] - mx, P[1] - my); if (d < bd) { bd = d; best = { plane: p }; } } }
    o.onPick?.(best || { point: toWorld(mx, my) });
  });
  cv.addEventListener('wheel', (e) => { zoom = Math.min(6, Math.max(0.5, zoom * (e.deltaY > 0 ? 0.85 : 1 / 0.85))); e.preventDefault(); }, { passive: false });
  cv.addEventListener('dblclick', (e) => { zoom = 1; e.preventDefault(); });

  return {
    el: box, reset,
    get visible() { return S() > 0; },
    /** small -> large -> hidden -> small */
    cycle() { sizeI = (sizeI + 1) % SIZES.length; resize(); ext.init = false; draw(); return sizeI; },
    setSize(i) { sizeI = i; resize(); },
    update(dt) { t += dt; if (t < 0.1) return; t = 0; draw(); },
  };
}
