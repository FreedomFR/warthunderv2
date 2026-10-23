// Top-down damage plan of a ship drawn on a small canvas: hull outline, watertight compartments (water level),
// machinery, magazines, directors, funnels, masts, gun mounts, AA mounts and fires, coloured by state.
import { crewOf, MIN_CREW } from '../sim/hull.js';
const OK = '#5ec26a', HURT = '#e0b43a', DEAD = '#d9534f', JAM = '#e08a3a';

export function drawDamage(cv, ship) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const st = ship.stats, model = ship.model;
  const L = st.L, B = Math.max(st.B, 8);
  const pad = 6;
  const sx = (W - 2 * pad) / (L * 1.02), sz = Math.min(sx * 1.7, (H - 10) / (B * 1.15));
  const Z = (z) => H / 2 + z * sz;
  // hull outline
  ctx.beginPath();
  const n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = -L / 2 + L * i / n; pts.push([x, model.hull.halfBeamDeck(x)]); }
  const px = (x) => pad + (x + L / 2) * sx;
  ctx.moveTo(px(pts[0][0]), Z(-pts[0][1]));
  for (const [x, hb] of pts) ctx.lineTo(px(x), Z(-hb));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(px(pts[i][0]), Z(pts[i][1]));
  ctx.closePath();
  ctx.fillStyle = '#242b32'; ctx.fill();
  ctx.strokeStyle = '#5f6b76'; ctx.lineWidth = 1; ctx.stroke();
  // flooded compartments
  for (const c of ship.comps) {
    const f = (c.water[0] + c.water[1]) / 2;
    if (f < 0.02) continue;
    ctx.fillStyle = `rgba(60,140,235,${Math.min(0.75, 0.12 + f * 0.65)})`;
    const hb = model.hull.halfBeamDeck(c.xc);
    ctx.fillRect(px(c.x0) + 0.5, Z(-hb * 0.9), (c.x1 - c.x0) * sx - 1, hb * 1.8 * sz);
  }
  // the structure: a compartment that is broken shows its cracks (strokes across the hull, more of them the worse it is)
  ctx.lineWidth = 1;
  for (const c of ship.comps) {
    if (c.struct < 0.25) continue;
    const hb = model.hull.halfBeamDeck(c.xc), k = Math.min(4, Math.floor(c.struct * 2));
    ctx.strokeStyle = c.struct > 1 ? '#ff6a4a' : '#e0a040';
    for (let i = 0; i < k; i++) { const x = px(c.x0 + (c.x1 - c.x0) * (i + 0.5) / k); ctx.beginPath(); ctx.moveTo(x - 1.5, Z(-hb * 0.8)); ctx.lineTo(x + 1.5, Z(hb * 0.8)); ctx.stroke(); }
  }
  const col = (state) => (state === 2 ? DEAD : state === 1 ? HURT : OK);
  // internal modules
  for (const m of ship.modules) {
    if (m.part != null) continue;
    ctx.globalAlpha = m.kind === 'flightdeck' || m.kind === 'hangar' || m.kind === 'avgas' ? 0.25 : 0.7;
    ctx.fillStyle = m.flooded ? '#4a7ec8' : col(m.state);
    const w = Math.max(m.hx * 2 * sx, 3), hgt = Math.max(m.hz * 2 * sz, 2.5);
    ctx.fillRect(px(m.x) - w / 2, Z(m.z) - hgt / 2, w, hgt);
  }
  ctx.globalAlpha = 1;
  // visible parts
  for (const m of ship.modules) {
    if (m.part == null) continue;
    ctx.fillStyle = col(m.state);
    const w = Math.max(m.hx * 2 * sx, 3), hgt = Math.max(Math.min(m.hz * 2 * sz, 9), 3);
    ctx.fillRect(px(m.x) - w / 2, Z(m.z) - hgt / 2, w, hgt);
    ctx.strokeStyle = '#0008'; ctx.strokeRect(px(m.x) - w / 2, Z(m.z) - hgt / 2, w, hgt);
  }
  // gun mounts
  for (const m of ship.mounts) {
    const r = Math.max(1.8, m.rec.cal / 90 * 1.1);
    ctx.beginPath(); ctx.arc(px(m.rec.x), Z(m.rec.z), r, 0, 6.283);
    const cr = crewOf(m);
    ctx.fillStyle = !m.alive ? DEAD : m.noAmmo ? '#8a5fc7' : m.jam > 0 ? JAM : m.hp < m.maxHp * 0.5 ? HURT : '#cfd6dc';
    ctx.fill();
    // the ring says how many of its people are left: white when it is manned, yellow when a part of them are gone, red when too few can work it
    ctx.strokeStyle = !m.alive ? '#000a' : cr >= 0.8 ? '#000a' : cr >= MIN_CREW ? '#e0b43a' : '#ff4a3a'; ctx.lineWidth = cr >= 0.8 || !m.alive ? 0.8 : 1.6; ctx.stroke();
  }
  // AA mounts
  for (const a of ship.aaMounts) {
    ctx.fillStyle = !a.alive ? '#7a2e2e' : crewOf(a) < MIN_CREW ? '#b8782e' : '#8fa88f';
    ctx.fillRect(px(a.rec.x) - 1, Z(a.rec.z) - 1, 2, 2);
  }
  // the holes in the hull: a blue tick on the side where the water is coming in, pale where the hole is still above the water
  ctx.lineWidth = 1.4;
  for (const h of ship.holes) {
    ctx.strokeStyle = h.head > 0 ? '#3fb4ff' : '#8fb4cc88';
    const y = Z(h.z), x = px(h.x);
    ctx.beginPath(); ctx.moveTo(x, y - 2.5); ctx.lineTo(x + 2.5, y + 2); ctx.lineTo(x - 2.5, y + 2); ctx.closePath(); ctx.stroke();
  }
  // fires
  for (const f of ship.fires) {
    const g = ctx.createRadialGradient(px(f.x), Z(f.z), 0, px(f.x), Z(f.z), 6);
    g.addColorStop(0, 'rgba(255,170,40,0.95)'); g.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px(f.x) - 6, Z(f.z) - 6, 12, 12);
  }
  if (ship.split) { ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(ship.split.cut), 3); ctx.lineTo(px(ship.split.cut), H - 3); ctx.stroke(); }
}
