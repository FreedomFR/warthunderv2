// An aircraft drawn from the pieces of its reference model (aircraft/<key>_v4.js, tools/refs/planegroups.py): the body (fuselage, cowl, fixed undercarriage), the tail, the two wings, the
// propeller, the retractable undercarriage and the panes of the canopy, in the frame of the game's aircraft, with the colour of the textures at each vertex (the camouflage, the markings and
// the panel lines are the model's own). The groups are the ones of planes.js `drawPlane`: whole / body / tail / wingL / wingR / prop / gear / cabin; the hook and the ordnance stay procedural.
import { MAT, rgb } from './meshbuilder.js';
import { decodeBaked } from './bakedmesh.js';

const GLASS = rgb('#3d5560');

function add(b, v4, key, mat = MAT.AIRCRAFT, col = null) {
  const piece = v4.PLANE[key];
  if (!piece) return;
  const d = decodeBaked(piece, v4.SCALE);
  if (col) { const c = new Uint8Array(d.col.length); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; } b.raw(d.pos, d.nrm, c, d.idx, mat); return; }
  b.raw(d.pos, d.nrm, d.col, d.idx, mat);
}

/** The team band on the fin (tinted with the team colour by the renderer): two quads on the sides of the fin, as the procedural aircraft have them. */
function finBand(b, s) {
  const t = s.tail, fy = s.fus.r * s.fus.ar * 0.15, tx = t.x, acc = rgb('#e8e6dc'), zz = s.finHalf ?? 0.075;
  b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, zz], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, zz], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, zz], [tx - t.finChord * 0.2, fy + t.fin * 0.82, zz], acc, MAT.TEAMBAND, [tx, fy, -1], 1);
  b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, -zz], [tx - t.finChord * 0.2, fy + t.fin * 0.82, -zz], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, -zz], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, -zz], acc, MAT.TEAMBAND, [tx, fy, 1], 1);
}

/** Draw `part` of the aircraft `s` (its sheet has `v4`: the module of the pieces) into the builder. The parts that stay procedural ('hook', 'ordnance') are not drawn here. */
export function drawV4Plane(b, s, part) {
  const v4 = s.v4, all = part === 'whole';
  if (all || part === 'body') { add(b, v4, 'body'); add(b, v4, 'canopy'); add(b, v4, 'glass', MAT.GLASS, GLASS); }
  if (part === 'cabin') add(b, v4, 'body');          // (from the pilot's seat: the panes of his canopy are not drawn)
  if (all || part === 'tail' || part === 'cabin' && false) { add(b, v4, 'tail'); finBand(b, s); }
  if (all || part === 'wingR') add(b, v4, 'wingR');
  if (all || part === 'wingL') add(b, v4, 'wingL');
  if (part === 'prop') add(b, v4, 'prop', MAT.AIRCRAFT);
  if (part === 'gear') add(b, v4, 'gear');
}
