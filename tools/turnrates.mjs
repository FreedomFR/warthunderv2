// The turning performance of the fighters from the flight model (sim/airperf.js): stall speed, wing loading, the instantaneous and the sustained turn rate (deg/s) and radius at combat speed.
// usage: node tools/turnrates.mjs
import { PLANES } from '../js/game/model/planes.js';
import { PERF, aeroOf, dragAcc, thrustAcc } from '../js/game/sim/airperf.js';
const G = 9.81;
console.log('type      mass  S    load  vs   vcomb  inst deg/s (n)   sustained deg/s @ 90 / 110 / 130 m/s   best sustained  radius@vcomb');
for (const k of Object.keys(PERF)) {
  const pf = PERF[k], spec = PLANES[k];
  if (!spec || !pf.vcomb) continue;
  const A = aeroOf(k, spec), v = pf.vcomb;
  const nLift = (v / A.vs) ** 2 * 0.9, n = Math.min(A.nmax, nLift), inst = G * Math.sqrt(n * n - 1) / v * 180 / Math.PI;
  const sus = (vv) => { let lo = 1, hi = A.nmax; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (thrustAcc(A, vv) - dragAcc(A, vv, m) > 0 ? (lo = m) : (hi = m)); } const nn = Math.min(lo, (vv / A.vs) ** 2 * 0.9); return G * Math.sqrt(Math.max(0, nn * nn - 1)) / vv * 180 / Math.PI; };
  let best = 0, bv = 0; for (let vv = 60; vv <= 160; vv += 2) { const s = sus(vv); if (s > best) { best = s; bv = vv; } }
  console.log(k.padEnd(9), (spec.mass * 1000 | 0).toString().padStart(5), A.S.toFixed(1).padStart(5), (spec.mass * 1000 / A.S).toFixed(0).padStart(5), A.vs.toFixed(0).padStart(4), String(v).padStart(5), inst.toFixed(1).padStart(8), `(${n.toFixed(1)})`.padStart(7), [90, 110, 130].map((x) => sus(x).toFixed(1).padStart(6)).join(' '), `${best.toFixed(1)} @ ${bv}`.padStart(16), (v * v / (G * Math.sqrt(n * n - 1))).toFixed(0).padStart(8), 'm');
}
