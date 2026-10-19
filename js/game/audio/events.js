// Mapping of the simulation's battle events to sounds: which sound, how loud, how far it carries, how it is pitched.
import { clamp01, clampR } from './common.js';

const rnd = Math.random;

export const eventMethods = {
  onEvents(events) {
    if (!this.live) return;
    const R = (a, b) => a + (b - a) * rnd();
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': {
          const cal = e.cal, v = e.mount ? (e.mount.idx % 3) : 0, nb = Math.min(e.n || 1, 4);
          const gm = 0.82 + 0.1 * nb;
          // a heavy gun fired a few hundred metres from the listener: the blast rings in the ears (the sound ducks, then comes back, dull at first)
          if (cal >= 190) { const dd = this.geo(e.x, e.y, e.z).d; this.shock = Math.max(this.shock, Math.min(1, (cal >= 300 ? 1 : 0.6) * Math.min(1, 220 / Math.max(60, dd)) * Math.min(1, 0.5 + 0.2 * nb)) * (dd < 600 ? 1 : 0)); }
          if (cal >= 300) this.play('gun_big', e.x, e.y, e.z, { arg: v, gain: gm, ref: 2400, pri: 3, wet: 0.4, rate: R(0.97, 1.03) });
          else if (cal >= 190) this.play('gun_med', e.x, e.y, e.z, { arg: v, gain: 0.95 * gm, ref: 1600, pri: 3, wet: 0.35, rate: R(0.96, 1.04) });
          else if (cal >= 100) this.play('gun_small', e.x, e.y, e.z, { arg: v, gain: 0.9 * gm, ref: 1000, pri: 2, wet: 0.3, rate: R(0.94, 1.06) * (cal >= 140 ? 0.92 : 1) });
          else this.play('gun_small', e.x, e.y, e.z, { arg: v, gain: 0.55, ref: 520, pri: 1, wet: 0.2, rate: R(1.25, 1.5) });
          break;
        }
        case 'splash': {
          const big = e.bomb || e.cal >= 300, mid = e.cal >= 150;
          if (big) this.play('splash_big', e.x, 1, e.z, { gain: e.bomb ? 1 : clamp01(e.cal / 406) * 0.9 + 0.2, ref: 650, pri: 2, wet: 0.3, rate: R(0.92, 1.08) });
          else if (mid) this.play('splash_big', e.x, 1, e.z, { gain: 0.45, ref: 380, pri: 1, wet: 0.2, rate: R(1.15, 1.35) });
          else this.play('splash_small', e.x, 1, e.z, { gain: 0.7, ref: 190, pri: 1, wet: 0.1, rate: R(0.9, 1.15) });
          break;
        }
        case 'impact': {
          const k = e.kind, cal = e.cal || 150;
          if (k === 'penetrate' && e.shell === 'AP') {
            // armour-piercing: a ringing clang at the plate, then the dull burst inside a moment later
            this.play('impact_through', e.x, e.y, e.z, { gain: 0.7, ref: 900, pri: 2, wet: 0.2, rate: R(0.75, 0.95) });
            this.play('impact_pen', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 300, 0.45, 1.15), ref: 1500, pri: 3, wet: 0.45, when: 0.09, rate: R(0.8, 0.95) * (cal < 200 ? 1.15 : 1) });
            if (cal >= 250) this.play('explosion_small', e.x, e.y, e.z, { gain: 0.5, ref: 1000, pri: 2, wet: 0.35, when: 0.17, rate: 0.7 });
          } else if (k === 'penetrate') {
            this.play('impact_pen', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 300, 0.45, 1.15), ref: 1500, pri: 3, wet: 0.35, rate: R(0.93, 1.08) * (cal < 200 ? 1.15 : 1) });
            if (cal >= 250) this.play('explosion_small', e.x, e.y, e.z, { gain: 0.45, ref: 1000, pri: 2, wet: 0.3, when: 0.08, rate: 0.8 });
          } else if (k === 'explode') this.play('impact_he', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 250, 0.4, 1.1), ref: 1000, pri: 2, wet: 0.25, rate: R(0.94, 1.08) * (cal < 150 ? 1.2 : 1) });
          else if (k === 'bounce') this.play('ricochet', e.x, e.y, e.z, { gain: 0.85, ref: 700, pri: 2, wet: 0.2, rate: R(0.8, 1.2) });
          else if (k === 'through') this.play('impact_through', e.x, e.y, e.z, { gain: 0.8, ref: 600, pri: 2, wet: 0.15, rate: R(0.9, 1.15) });
          else if (k === 'torpedo') this.play('torpedo_hit', e.x, 0, e.z, { gain: 1.15, ref: 2400, pri: 4, wet: 0.4 });
          if (e.killed > 0) this.play('crash_metal', e.x, e.y, e.z, { gain: 0.6, ref: 900, pri: 2, when: 0.1 });
          break;
        }
        case 'landImpact': {
          const cal = e.cal || 150;
          if (e.torpedo) this.play('torpedo_hit', e.x, 0, e.z, { gain: 1.0, ref: 2200, pri: 3, wet: 0.4 });
          else if (e.shell === 'AP') this.play('impact_through', e.x, e.y, e.z, { gain: clampR(cal / 360, 0.35, 0.9), ref: 800, pri: 2, wet: 0.2, rate: R(0.7, 0.9) });
          else this.play('impact_he', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 250, 0.4, 1.1), ref: 1000, pri: 2, wet: 0.3, rate: R(0.85, 1) });
          break;
        }
        case 'explosion': {
          if (e.stage === 'secondary') this.play('explosion_med', e.x, e.y, e.z, { gain: 0.8 * Math.min(1.2, 0.5 + e.size), ref: 1900, pri: 3, wet: 0.4, rate: R(0.9, 1.1) });
          else if (e.stage === 'air') this.play('explosion_small', e.x, e.y, e.z, { gain: 0.9, ref: 1000, pri: 3, wet: 0.3, rate: R(0.85, 1.1) });
          else this.play('explosion_big', e.x, e.y, e.z, { gain: 1.35, ref: 5200, pri: 4, wet: 0.55, rate: R(0.94, 1.04) });
          break;
        }
        case 'mountKilled': {
          const w = e.ship.toWorld(e.mount.rec.x, e.mount.rec.y, e.mount.rec.z, [0, 0, 0]);
          this.play('explosion_med', w[0], w[1], w[2], { gain: 0.65, ref: 1300, pri: 2, wet: 0.3, rate: R(1, 1.25) });
          this.play('crash_metal', w[0], w[1], w[2], { gain: 0.5, ref: 800, pri: 2, when: 0.15 });
          break;
        }
        case 'moduleKilled': {
          const s = e.ship;
          if (e.kind === 'aa') { const w = s.toWorld(e.x, e.y, e.z, [0, 0, 0]); this.play('explosion_small', w[0], w[1], w[2], { gain: 0.35, ref: 450, pri: 1, rate: R(1.2, 1.5) }); break; }
          const w = s.toWorld(e.x, e.y, e.z, [0, 0, 0]);
          if (e.kind === 'engine') this.play('boiler_burst', w[0], w[1], w[2], { gain: 0.95, ref: 1100, pri: 3, wet: 0.3 });
          else if (e.kind === 'director' || e.kind === 'radar') { this.play('zap', w[0], w[1], w[2], { gain: 0.8, ref: 450, pri: 2 }); this.play('crash_metal', w[0], w[1], w[2], { gain: 0.4, ref: 600, pri: 1, when: 0.1, rate: 1.3 }); }
          else if (e.kind === 'tubes') this.play('explosion_small', w[0], w[1], w[2], { gain: 0.7, ref: 900, pri: 2 });
          else if (e.kind === 'hangar' || e.kind === 'avgas') this.play('explosion_med', w[0], w[1], w[2], { gain: 0.85, ref: 1700, pri: 3, wet: 0.4 });
          else if (e.kind === 'magazine' || e.kind === 'steering' || e.kind === 'shaft') this.play('bulkhead', w[0], w[1], w[2], { gain: 0.8, ref: 700, pri: 2, wet: 0.2 });
          else this.play('crash_metal', w[0], w[1], w[2], { gain: 0.85, ref: 1100, pri: 2, wet: 0.3, rate: R(0.9, 1.1) });
          break;
        }
        case 'magazineFlooded': {
          const w = e.ship.toWorld(e.x, e.y, e.z, [0, 0, 0]);
          this.play('bulkhead', w[0], w[1], w[2], { gain: 0.5, ref: 500, pri: 1, rate: 0.85 });
          break;
        }
        case 'shipBreak': {
          this.play('crash_metal', e.x, e.y, e.z, { gain: 1.2, ref: 3000, pri: 4, wet: 0.45, rate: 0.7 });
          this.play('explosion_med', e.x, e.y, e.z, { gain: 1.0, ref: 3500, pri: 4, wet: 0.5, rate: 0.85 });
          this.play('hull_groan', e.x, e.y, e.z, { gain: 1.0, ref: 2200, pri: 3, when: 0.5, rate: 0.75 });
          break;
        }
        case 'sinking': {
          const s = e.ship;
          this.play('hull_groan', s.x, 4, s.z, { gain: 0.9, ref: 1300, pri: 2, when: 0.6, rate: R(0.8, 1.05) });
          this.play('bulkhead', s.x, 2, s.z, { gain: 0.7, ref: 900, pri: 2, when: 1.6 });
          this.play('hull_groan', s.x, 4, s.z, { gain: 0.8, ref: 1300, pri: 2, when: 3.6, rate: R(0.6, 0.9) });
          if (!e.magazine) this.play('boiler_burst', s.x, 2, s.z, { gain: 0.7, ref: 1200, pri: 2, when: 5.5 + rnd() * 4, rate: 0.9 });
          break;
        }
        case 'debrisSplash': {
          if (e.size < 1.5 && rnd() > 0.35) break;
          this.play(e.size > 5 ? 'splash_big' : 'splash_small', e.x, 1, e.z, { gain: e.size > 5 ? 0.5 : 0.4, ref: e.size > 5 ? 420 : 200, pri: 1, rate: e.size > 5 ? R(1.2, 1.4) : R(0.9, 1.2) });
          break;
        }
        case 'torpedoLaunch': this.play('torpedo_launch', e.x, 1, e.z, { gain: 0.8, ref: 800, pri: 2 }); break;
        case 'torpedoDrop': this.play('splash_small', e.x, e.y, e.z, { gain: 0.5, ref: 300, pri: 1, rate: 0.8 }); break;
        case 'collision': this.play('collision', e.x, 4, e.z, { gain: 1.1, ref: 1300, pri: 3, wet: 0.3 }); break;
        // ---- anti-aircraft ----
        case 'aaFire': {
          if (rnd() > (this.active > 40 ? 0.3 : 0.7)) break;          // a lot of guns: sample the bursts
          const cb = e.cal >= 35 ? 40 : e.cal >= 22 ? 25 : 20;
          this.play('aa_burst', e.x, e.y, e.z, { arg: cb, gain: 0.55 + 0.08 * Math.min(e.n, 4), ref: cb >= 40 ? 700 : 450, pri: 1, wet: 0.12, rate: R(0.94, 1.08) });
          break;
        }
        case 'flak': this.play('flak_burst', e.x, e.y, e.z, { gain: 0.95, ref: 1100, pri: 2, wet: 0.3, rate: R(0.9, 1.1) }); break;
        // ---- aircraft ----
        case 'mgBurst': this.play('mg_burst', e.x, e.y, e.z, { gain: 0.42, ref: 380, pri: 1, wet: 0.1, rate: R(0.9, 1.12) }); break;
        case 'planeHit': this.play('ricochet', e.x, e.y, e.z, { gain: 0.4, ref: 300, pri: 1, rate: R(1.3, 1.9) }); break;
        case 'planeDown': {
          if (e.mode !== 'explode') this.play('plane_fall', e.x, e.y, e.z, { gain: 0.9, ref: 2000, pri: 2, wet: 0.2, rate: R(0.9, 1.1) });
          break;
        }
        case 'planeBreakup': this.play('crash_metal', e.x, e.y, e.z, { gain: 0.5, ref: 800, pri: 1, rate: R(1.2, 1.6) }); break;
        case 'planeCrash': {
          if (e.water) {
            this.play('splash_big', e.x, 1, e.z, { gain: 0.9, ref: 900, pri: 2, wet: 0.3, rate: R(0.95, 1.15) });
            this.play('explosion_small', e.x, 2, e.z, { gain: e.ordnance ? 0.95 : 0.6, ref: 1300, pri: 3, wet: 0.35, when: 0.05, rate: R(0.8, 1) });
          } else {
            this.play('explosion_med', e.x, e.y, e.z, { gain: 0.8, ref: 1700, pri: 3, wet: 0.35 });
            this.play('crash_metal', e.x, e.y, e.z, { gain: 0.7, ref: 1000, pri: 2, when: 0.1 });
          }
          break;
        }
        case 'planeDitch': this.play('splash_big', e.x, 1, e.z, { gain: 0.5, ref: 500, pri: 1, rate: 1.2 }); break;
        case 'planeTouchdown': this.play('touchdown', e.plane.x, e.plane.y, e.plane.z, { gain: 0.8, ref: 700, pri: 1, rate: R(0.92, 1.1) }); break;
        case 'wireCatch': this.play('arrest', e.plane.x, e.plane.y, e.plane.z, { gain: 0.7, ref: 700, pri: 1, when: 0.05 }); break;
        case 'engineStart': this.play('engine_start', e.plane.x, e.plane.y, e.plane.z, { gain: 0.45, ref: 450, pri: 0, rate: R(0.92, 1.08) }); break;
        case 'liftMove': this.play('lift_motor', e.x, e.y, e.z, { gain: 0.4, ref: 350, pri: 0 }); break;
        default: break;
      }
    }
  },
};
