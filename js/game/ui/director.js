// The automatic director: what is worth looking at, and from where. It listens to the battle (hits, fires, salvos, explosions, sinkings, bases going down) to know which
// ship is "hot", cuts at once to the big moments (a magazine, a ship breaking in two, a base put out of action), picks a shot that has not just been seen (not the same kind
// of shot twice, not the same ship twice) and drops a shot that has gone bad (the ship hidden behind an island, the ship lost, nothing left to see).
// It only decides; the camera rig (ui/cameras.js) draws the shots.

const HALF = 6;                     // seconds for the heat of a ship to fall by e
const MIN_HOLD = 2.6;               // a shot is kept at least this long unless it has gone bad or a big moment comes
const BIG = 8;                      // the score of a moment that cuts the current shot

/** What each kind of shot lasts [min, max] seconds. */
const LENGTH = {
  follow: [7, 11], orbit: [8, 12], bridge: [6, 9], shell: [6, 10], tactical: [6, 9], versus: [6, 9], reverse: [5, 8], wide: [5, 8], event: [5, 7], base: [5, 8],
};

export class Director {
  constructor(rig) {
    this.rig = rig;
    this.heat = new Map();          // ship -> { v, t }
    this.moments = [];              // { t, kind, ship, x, z, score, seen }
    this.history = [];              // the last shots: { sub, ship }
    this.lastWide = -99;
    this.lastCut = -99;
    this.bad = 0;                   // how long the current shot has been bad
  }

  reset() { this.heat.clear(); this.moments.length = 0; this.history.length = 0; this.lastWide = -99; this.lastCut = -99; this.bad = 0; }

  warm(ship, v, now) {
    const h = this.heat.get(ship);
    this.heat.set(ship, { v: (h ? h.v * Math.exp(-(now - h.t) / HALF) : 0) + v, t: now });
  }
  heatOf(ship, now) { const h = this.heat.get(ship); return h ? h.v * Math.exp(-(now - h.t) / HALF) : 0; }

  /** The events of the battle: warm the ships they concern and remember the big moments. */
  note(events, now) {
    for (const e of events) {
      switch (e.type) {
        case 'impact': if (e.ship) this.warm(e.ship, e.kind === 'torpedo' ? 4 : (e.cal >= 300 ? 2 : 1.1) * (e.kind === 'penetrate' ? 1.4 : 1), now); break;
        case 'moduleKilled': if (e.ship) this.warm(e.ship, e.kind === 'engine' || e.kind === 'magazine' ? 2 : 0.7, now); break;
        case 'mountKilled': if (e.ship) this.warm(e.ship, 1.2, now); break;
        case 'fireStart': if (e.ship) this.warm(e.ship, 0.8, now); break;
        case 'muzzle': if (e.ship) this.warm(e.ship, e.cal >= 280 ? 1.5 : e.cal >= 150 ? 0.6 : 0.2, now); break;
        case 'torpedoLaunch': if (e.ship) this.warm(e.ship, 2, now); break;
        case 'explosion':
          if (e.ship && e.stage === 'primary') this.moment('magazine', e.ship, e.x, e.z, 12, now);
          else if (e.ship && e.stage === 'secondary' && e.size >= 1.1) this.moment('blast', e.ship, e.x, e.z, 5, now);
          else if (e.base && e.stage === 'secondary' && e.size >= 0.75) this.moment('basefire', null, e.x, e.z, 4, now);
          break;
        case 'shipBreak': this.moment('break', e.ship, e.x, e.z, 11, now); break;
        case 'sinking': if (!e.magazine) this.moment('sinking', e.ship, e.ship.x, e.ship.z, e.ship.stats.type === 'BB' || e.ship.stats.type === 'CV' ? 9 : 6.5, now); break;
        case 'baseDown': this.moment('basedown', null, e.x, e.z, 9, now); break;
        default: break;
      }
    }
    if (this.moments.length > 12) this.moments.splice(0, this.moments.length - 12);
  }

  moment(kind, ship, x, z, score, now) {
    // the same thing happening again within a few seconds (a magazine blowing: primary, then the pieces) is one moment
    const last = this.moments[this.moments.length - 1];
    if (last && last.ship === ship && now - last.t < 4 && last.kind === kind) return;
    this.moments.push({ t: now, kind, ship, x, z, score, seen: false });
  }

  /** A big moment that has just happened and has not been shown (and that can be shown: the shot has run long enough). */
  interrupt(now, held) {
    if (held < MIN_HOLD) return null;
    for (let i = this.moments.length - 1; i >= 0; i--) {
      const m = this.moments[i];
      if (m.seen || now - m.t > 3) continue;
      if (m.score < BIG) continue;
      return m;
    }
    return null;
  }

  /** How good a ship is as the subject of the next shot. */
  interest(ship, now, cur) {
    const w = this.rig.game.world;
    let sc = Math.random() * 1.2 + ship.stats.score * 0.25 + this.heatOf(ship, now);
    if (ship.state === 'sinking') sc += ship.sinkT < 14 ? 5 : -3;
    sc += ship.fires.length * 0.3;
    if (cur === ship) sc -= 3;
    const prev = this.history[this.history.length - 1];
    if (prev && prev.ship === ship) sc -= 2;
    if (this.history.slice(-3).some((h) => h.ship === ship)) sc -= 1;
    // a ship that is alone and far from everything is dull
    let near = 1e9;
    for (const o of w.ships) if (o !== ship && o.team !== ship.team && o.alive) near = Math.min(near, Math.hypot(o.x - ship.x, o.z - ship.z));
    if (near > 14000) sc -= 2.5;
    return sc;
  }

  /** The line of sight from the camera to the ship is cut by an island. */
  hidden(cam, ship) {
    const T = this.rig.game.world.terrain;
    if (!T || !ship) return false;
    return T.blocks(cam.x, cam.y, cam.z, ship.x, Math.max(2, ship.model.topY * 0.4), ship.z);
  }

  /** The shot kinds that can be used now, with their weights. */
  weights(subject, now) {
    const w = this.rig.game.world, T = w.terrain;
    const running = w.state === 'running';
    const ctx = { subject };
    const tg = subject && subject.cmd && subject.cmd.main.target;
    const shooting = !!(tg && tg.alive && running && subject.mounts.some((m) => m.alive && m.reload > m.gun.reload - 4));
    const dist = tg ? Math.hypot(tg.x - subject.x, tg.z - subject.z) : 1e9;
    const W = { follow: 2, orbit: 1.6, bridge: 1.1, shell: 1.2, tactical: 0.7, versus: 0, reverse: 0, wide: 0 };
    if (shooting && dist < 16000 && dist > 800) { W.versus = 3; W.reverse = 1.6; W.shell = 2.2; }
    if (!running) { W.versus = W.reverse = 0; W.shell = 0; W.bridge = 0.4; }
    // an establishing shot now and then, always at the start of the battle
    const sinceWide = now - this.lastWide;
    if (w.time < 12 && sinceWide > 20) W.wide = 40;
    else if (sinceWide > 55) W.wide = 2.5;
    if (T && T.islands.length) W.tactical *= 0.6;
    // the bridge is not for a ship that burns or is nearly lost
    if (subject && (subject.fireLevel > 0.4 || subject.hpFrac < 0.35)) W.bridge = 0;
    const last = this.history[this.history.length - 1], last2 = this.history[this.history.length - 2];
    for (const k in W) { if (last && last.sub === k) W[k] *= 0.15; else if (last2 && last2.sub === k) W[k] *= 0.6; }
    ctx.weights = W;
    ctx.target = tg;
    ctx.dist = dist;
    return ctx;
  }

  pickKind(W) {
    let sum = 0;
    for (const k in W) sum += W[k];
    let r = Math.random() * sum;
    for (const k in W) { r -= W[k]; if (r <= 0) return k; }
    return 'follow';
  }

  length(kind) { const [a, b] = LENGTH[kind] || [6, 9]; return a + Math.random() * (b - a); }

  /** Remember a shot that was started. */
  started(sub, ship, now) {
    this.history.push({ sub, ship });
    if (this.history.length > 5) this.history.shift();
    if (sub === 'wide') this.lastWide = now;
    this.lastCut = now;
    this.bad = 0;
  }
}
