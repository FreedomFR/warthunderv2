// The flight dynamics of an aircraft, one step: heading, flight-path angle and speed towards the commanded values, with the thrust, the drag, the lift, the stall and
// the limits of the load factor and of the roll rate of its type (the figures of sim/airperf.js).
import { clamp, wrapPi, D2R, G } from '../math.js';
import { perfOf, aeroOf, dragAcc, thrustAcc } from './airperf.js';

export function setVel(p) {
  const cp = Math.cos(p.pitch);
  p.vx = Math.sin(p.heading) * cp * p.speed; p.vy = Math.sin(p.pitch) * p.speed; p.vz = -Math.cos(p.heading) * cp * p.speed;
}

/** The stall speed (m/s) of an aircraft where it is: lower with the flaps down and in the denser air low down. */
export function stallSpeed(p, flaps = !!p.gearDown) {
  const rho = 1.225 * Math.exp(-Math.max(p.y, 0) / 9500);
  return aeroOf(p.typeKey, p.spec).vs * Math.sqrt(1.0 / rho) * (flaps ? 0.79 : 1);
}

/** Flight dynamics step: heading, flight-path angle and speed towards the commanded values. */
export function guide(p, dt, hdgT, gamT, spdT, o = {}) {
  const pf = perfOf(p), A = aeroOf(p.typeKey, p.spec);
  const v = Math.max(p.speed, 20);
  // how much the wing can lift here: (v / vs)^2 times the weight, vs lower with the flaps down (gear down: the landing configuration) and in the denser air low down
  const flaps = !!p.gearDown;
  const vs = stallSpeed(p, flaps);
  const nLift = (v / vs) * (v / vs);
  const nAvail = Math.max(1.02, Math.min(A.nmax, nLift * 0.9));
  // the climb the engine can hold: the excess of thrust over drag; above the climb speed the aircraft may zoom (trade its speed for height), below it it cannot
  const power = (p.lost && p.lost.engine ? 0 : p.lost && p.lost.engines ? 1 - p.lost.engines.filter(Boolean).length / p.lost.engines.length : 1) * (o.powerMax ?? 1);
  const cosG = Math.cos(p.pitch);
  const k0 = flaps ? 2.0 : 1, brakes = !!(o.brakes && pf.brakes);
  // (what it could climb at in level flight: not at the load of the moment, which would feed back into the pull and make it swing)
  const excess = thrustAcc(A, v, power) - dragAcc(A, v, 1, k0, brakes);
  // (no slower than 1.1 times the stall in a climb; level or going down, only the stall is guarded against)
  // (a climb is flown at the speed it is told, but no faster than a cruise climb, between the best climb speed and the cruise: what is asked beyond comes once level)
  // (one that asks for more than the cruise, to catch up with its formation, a little faster)
  const cc = (pf.vcl + 0.4 * Math.max(0, pf.vc - pf.vcl)) * (spdT > pf.vc ? 1.3 : 1);
  // (with the flaps and the gear still out, just off the deck or the runway, it climbs away at its lift-off speed and gathers speed in the climb: it does not
  //  go down to build speed first, which off a carrier's bow means into the sea)
  const vKeep = gamT > 0 ? (flaps ? vs * 1.05 : Math.max(vs * 1.1, Math.min(spdT, cc))) : vs * 1.15;
  const gamMax = Math.asin(clamp(excess / G, -0.5, 0.6)) + clamp((v - vKeep) / v * 1.2, -0.25, 0.35);
  const climbLimited = gamT > gamMax;
  const gamW = Math.min(gamT, Math.max(gamMax, -1.5));
  const pr = o.pitchRate ?? pf.pr;
  const bankPilot = Math.min(o.bankMax ?? pf.bank * D2R, pf.bank * D2R);
  const err = wrapPi(hdgT - p.heading);
  let yr, n;
  if (o.bankOverride != null) {
    // a manoeuvre flown by attitude (the roll-in of a dive bomber, the wings held level in the dive): the bank as told, the nose moved at the pilot's rate
    p.bank += clamp(o.bankOverride - p.bank, -A.roll * 1.5 * dt, A.roll * 1.5 * dt);
    yr = clamp(err * 1.7, -G * Math.tan(Math.min(bankPilot, 1.4)) / v, G * Math.tan(Math.min(bankPilot, 1.4)) / v);
    p.heading += yr * dt;
    const upMax = Math.max(0.02, (nAvail - cosG) * G / v), downMax = (cosG + 1) * G / v;
    p.pitch += clamp(gamW - p.pitch, -Math.min(pr, downMax) * dt, Math.min(pr, upMax) * dt);
    n = Math.max(0.2, Math.hypot(cosG, v * yr * cosG / G));
  } else {
    // the pilot asks for a turn rate and a rate of change of the path; the lift that makes both is one pull, tilted by the bank: its size no more than the wing
    // gives at this speed (or the pilot pulls), its tilt no steeper than he is told. The aircraft rolls to that bank at the rate of the type, then turns as its
    // lift, tilted as it actually is, makes it turn: a heavy bomber is slow to start a turn, a fighter quick
    const yrW = clamp(err * 1.7, -2, 2), grW = clamp((gamW - p.pitch) * 2.2, -pr, pr);
    let nv = cosG + v * grW / G, nh = v * yrW * cosG / G;
    nh = clamp(nh, -Math.abs(nv) * Math.tan(bankPilot) - 0.05, Math.abs(nv) * Math.tan(bankPilot) + 0.05);
    // (the path first, the turn with what is left: a turn at the limit is flown level, tighter only by trading height when the pilot asks to go down)
    // A push over is flown with the wings about level and the stick forward (a negative load, -1.5 g at most), not by rolling on to the back
    const nNeg = Math.min(1.5, nLift * 0.5);
    nv = clamp(nv, -nNeg, nAvail);
    const nTop = nv >= 0 ? nAvail : nNeg;
    const hLeft = Math.sqrt(Math.max(0, nTop * nTop - nv * nv));
    nh = clamp(nh, -hLeft, hLeft);
    const neg = nv < -0.05;
    const nw = Math.hypot(nv, nh) * (neg ? -1 : 1);
    const bankW = Math.abs(nw) > 0.05 ? (neg ? Math.atan2(-nh, -nv) : Math.atan2(nh, nv)) : 0;
    p.bank += clamp(wrapPi(bankW - p.bank), -A.roll * dt, A.roll * dt);
    // the lift actually flown: as much as wanted, along the bank the aircraft has (rolled part of the way, the pull is eased in proportion)
    const align = Math.max(0, Math.cos(wrapPi(bankW - p.bank)));
    // (while it rolls the pilot pulls what holds the path he wants: the vertical part of the lift, along the bank it has)
    const cb = Math.cos(p.bank);
    n = neg ? clamp(nw * align, -nNeg, 0) : clamp(Math.max(nw * align, cb > 0.25 ? nv / cb : 0), 0.05, nAvail);
    yr = n * Math.sin(p.bank) * G / (v * Math.max(cosG, 0.1));
    const gr = (n * Math.cos(p.bank) - cosG) * G / v;
    // (the last of the heading error is taken out without overshoot, as a pilot eases off the turn)
    p.heading += Math.abs(yr * dt) > Math.abs(err) && Math.sign(yr) === Math.sign(err) ? err : yr * dt;
    p.pitch += clamp(gr * dt, -1.5, 1.5);
    p.pitch = clamp(p.pitch, -1.55, 1.55);
  }
  // the speed: thrust (the throttle set for the speed wanted, within what the engine gives) less the drag and the weight along the path
  const drag = dragAcc(A, v, n, k0, brakes), full = thrustAcc(A, v, power);
  // (a climb that asks more than the engine has is flown at full power, the speed held with the nose)
  const thr = climbLimited ? 1 : clamp((drag + G * Math.sin(p.pitch) + (spdT - v) * 0.5) / Math.max(full, 1e-3), 0, 1);
  // (o.accMax: what the engine can give just after the take-off, flaps and gear still out, at full power and low speed)
  // (throttled right back the propeller windmills and brakes the aircraft: about half the drag of the airframe again)
  const mill = (1 - thr) * (1 - thr) * 0.5 * A.c0 * v * v;
  const acc = Math.min(thr * full - drag - mill - G * Math.sin(p.pitch), o.accMax ?? 99);
  p.thr = thr;
  p.load = n;
  p.speed = Math.max(vs * 0.8, p.speed + acc * dt);
  setVel(p);
}
