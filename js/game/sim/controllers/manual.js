// Manual controller (prepared, not wired into the UI yet).
//
// It writes the very same ShipCommand as the AI, so taking over a ship is just:
//     ship.controller = new ManualController(inputState);
// `inputState` is a plain object the UI keeps up to date:
//     { up, down, left, right,          // throttle / rudder keys
//       aim: {x, z} | null,             // world point under the mouse (on the sea plane)
//       lockedTarget: Ship | null,      // optional lock: the fire-control computer leads this ship
//       fireMain, fireSec, fireTorpedo, launchAir }
// The ship itself already does the rest (turret slewing within arcs, fire-control lead on a locked
// target, reload, salvos), so no extra gameplay code is needed to switch a ship to manual.
import { clamp } from '../../math.js';

export class ManualController {
  constructor(input) { this.input = input; }

  update(ship, world, dt) {
    const c = ship.cmd, i = this.input;
    c.desiredHeading = null;                                   // no autopilot: direct rudder
    c.rudder = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    c.throttle = clamp(c.throttle + ((i.up ? 1 : 0) - (i.down ? 1 : 0)) * dt * 0.35, -0.33, 1);
    c.main.target = i.lockedTarget || null;
    c.main.aim = i.aim || null;
    c.main.fire = !!i.fireMain;
    c.sec.target = i.lockedTarget || null;
    c.sec.aim = i.aim || null;
    c.sec.fire = i.fireSec ?? !!i.fireMain;
    c.torpedo.target = i.lockedTarget || null;
    c.torpedo.fire = !!i.fireTorpedo;
    c.air.launch = !!i.launchAir;
  }
}
