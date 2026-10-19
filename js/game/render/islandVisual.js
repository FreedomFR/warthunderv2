// What is drawn for the islands: one mesh each (built from the height field, model/islandMesh.js), drawn by the ship renderer like any other model.
import { buildIslandMesh } from '../model/islandMesh.js';

const M = new Float32Array(16);

export class IslandVisuals {
  constructor(renderer, engine) {
    this.r = renderer;
    this.engine = engine;
    this.items = [];
  }

  /** Replace the islands (a Terrain of sim/terrain.js, or null). The old meshes are released. */
  set(terrain) {
    for (const it of this.items) this.r.releaseMesh(it.mesh);
    this.items = [];
    if (!terrain) return;
    for (const is of terrain.islands) {
      const built = buildIslandMesh(is);
      this.items.push({ island: is, mesh: this.r.createMesh(built, 'island ' + is.id), radius: Math.hypot(is.R, is.top) });
    }
  }

  /** Queue the islands in view for this frame (after r.begin()). */
  add(cam) {
    const r = this.r;
    r.setPaint(null);
    for (const it of this.items) {
      const is = it.island, rx = is.x - cam.x, rz = is.z - cam.z;
      if (!this.engine.sphereVisible(rx, is.top * 0.4 - cam.y, rz, it.radius)) continue;
      M[0] = 1; M[5] = 1; M[10] = 1; M[15] = 1;
      M[12] = rx; M[13] = -cam.y; M[14] = rz;
      r.add(it.mesh, M, [255, 255, 255], 0, 0, (is.id * 0.37) % 1);
    }
  }
}
