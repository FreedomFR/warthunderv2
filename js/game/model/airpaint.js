// The paint schemes of the aircraft drawn from their models: the colours of the upper and the lower surfaces, the flanks, the camouflage patches, the cowling, the anti-glare panel and the
// national markings, as the real aircraft wore them. The shader (wgsl/ship.js, material AIRPAINT) paints the skin from this table in the aircraft's own frame (+x nose, y up, +z starboard),
// so the model's own textures are not used: only its shape. A vertex of the material carries the scheme number in its red channel.
// Sources: the colour standards of each air arm as the aircraft pages of Wikipedia and the colour guides of the modellers give them (IJN grey-green J3 and dark green D1, the US Navy blue-gray
// over light gray of 1942 and the tricolour of the Avengers, the RLM 74 / 75 / 76 of the Luftwaffe, the 4BO green and the light blue of the Soviet aircraft); the places and sizes of the
// markings are measured on the reference models (tools/refs/planepaint.py) or, where the model has none, taken from the published sizes and looked at on the aircraft; `est` marks a guess.
//   upper, lower   the colours; `side` (optional): the colour of the upper flanks of the fuselage (a tricolour); `line`: the height of the line between the upper and the lower colour on the
//   flanks (null: by the normal alone); `camo`: [{ col, scale, thr }] patches of colour on the upper surfaces (soft noise: a splinter or a blotch scheme); `mottle`: spots on the flanks;
//   `hw`: half the width of the fuselage (m): inside it the line decides, outside it the normal (the wings); `cowl`, `glare`: the black-blue nose of the Japanese aircraft; `finish`: [roughness, metalness] of the paint (bare metal is gloss and metal).
//   decals: a marking is placed on a `face` ('side': both flanks; 'top' / 'bottom' of the wings) at (x, y or z) and drawn from primitives in its own frame (u forward, v up on the flank, v
//   outboard on a wing): { disc: r, col }, { star: r, col, rot }, { rect: [u0, u1, v0, v1], col }. `wing: 'both'` on both wings, 'port' / 'starboard' on one.

/** The American national insignia of 1943 (a white star in a blue disc, with white bars): on a flank the bars run fore and aft, on a wing across the chord (`wing`: along the span). */
const usInsignia = (r, wing) => [
  { disc: r, col: '#1d3a78' }, { star: r * 0.8, col: '#f0eee6', rot: wing ? 0 : Math.PI / 2 },
  ...(wing ? [{ rect: [-r * 0.27, r * 0.27, r * 0.95, r * 2.0], col: '#f0eee6' }, { rect: [-r * 0.27, r * 0.27, -r * 2.0, -r * 0.95], col: '#f0eee6' }]
    : [{ rect: [r * 0.95, r * 2.0, -r * 0.27, r * 0.27], col: '#f0eee6' }, { rect: [-r * 2.0, -r * 0.95, -r * 0.27, r * 0.27], col: '#f0eee6' }]),
];
/** The RAF roundel (`ring`: the yellow ring of the fuselage roundel): blue, white and red (the outer red of the early type is not worn by 1943 aircraft). */
const raf = (r, ring) => [...(ring ? [{ disc: r * 1.25, col: '#e0b92b' }] : []), { disc: r, col: '#1f3a78' }, { disc: r * 0.66, col: '#eeece4' }, { disc: r * 0.33, col: '#b3222a' }];
/** The Luftwaffe cross: a black cross with a white edge (`a`: the half length of an arm). */
const balkenkreuz = (a) => [
  { rect: [-a * 1.1, a * 1.1, -a * 0.32, a * 0.32], col: '#f0eee6' }, { rect: [-a * 0.32, a * 0.32, -a * 1.1, a * 1.1], col: '#f0eee6' },
  { rect: [-a, a, -a * 0.25, a * 0.25], col: '#141414' }, { rect: [-a * 0.25, a * 0.25, -a, a], col: '#141414' },
];
/** The Soviet red star with its white edge. */
const redStar = (r) => [{ star: r * 1.12, col: '#e8e4d8', rot: Math.PI / 2 }, { star: r, col: '#c42a24', rot: Math.PI / 2 }];

export const AIRPAINT = {
  // Mitsubishi A6M2: overall grey-green, a black-blue cowling and anti-glare panel, red hinomaru on the flanks and on the wings
  a6m: {
    upper: '#a6a690', lower: '#b2b19e', line: null,
    cowl: { x0: 2.8, col: '#1a1d24', hw: 0.72 },
    glare: { x0: 1.4, x1: 2.85, hw: 0.36, col: '#1a1d24' },
    decals: [
      { face: 'side', x: -1.14, y: 0.05, prims: [{ disc: 0.44, col: '#c0212a' }] },
      { face: 'top', wing: 'both', x: 1.39, z: 4.6, prims: [{ disc: 0.47, col: '#c0212a' }] },
      { face: 'bottom', wing: 'both', x: 1.39, z: 4.6, prims: [{ disc: 0.47, col: '#c0212a' }] },
    ],
  },
  // Nakajima B5N2 (Pearl Harbor, 1941): overall light grey-green (J3), a black cowling, hinomaru on the flanks behind the canopy and on both faces of both wings (the tail stripes of the carriers
  // are not painted; places and sizes measured on the model)
  b5n: {
    upper: '#adaf9b', lower: '#bcbdab', line: null,
    cowl: { x0: 2.55, col: '#1b1d22', hw: 0.72 },
    decals: [
      { face: 'side', x: -2.45, y: 0.05, prims: [{ disc: 0.36, col: '#c0212a' }] },
      { face: 'top', wing: 'both', x: 0.97, z: 5.63, prims: [{ disc: 0.5, col: '#c0212a' }] },
      { face: 'bottom', wing: 'both', x: 0.97, z: 5.63, prims: [{ disc: 0.5, col: '#c0212a' }] },
    ],
  },
  // Grumman F6F-3 Hellcat (1944): the Navy's tricolour of non-specular sea blue over intermediate blue over insignia white, the star and bars on the rear fuselage and on the upper port and lower
  // starboard wings
  f6f: {
    hw: 1.0, upper: '#202e46', side: '#4b6286', lower: '#e2e4de', line: -0.3, finish: [0.82, 0.0],
    decals: [
      { face: 'side', x: -2.9, y: 0.15, prims: usInsignia(0.45, false) },
      { face: 'top', wing: 'port', x: 0.7, z: 4.2, prims: usInsignia(0.6, true) },
      { face: 'bottom', wing: 'starboard', x: 0.7, z: 4.2, prims: usInsignia(0.6, true) },
    ],
  },
  // Aichi D3A1: dark green over grey-green, a black-blue cowling, hinomaru as on the Zero
  d3a: {
    upper: '#46563a', lower: '#a9ad9a', line: -0.02,
    cowl: { x0: 3.05, col: '#1a1d24', hw: 0.8 },
    decals: [
      { face: 'side', x: -1.88, y: 0.03, prims: [{ disc: 0.43, col: '#c0212a' }] },
      { face: 'top', wing: 'both', x: 1.05, z: 5.93, prims: [{ disc: 0.62, col: '#c0212a' }] },
      { face: 'bottom', wing: 'both', x: 1.05, z: 5.93, prims: [{ disc: 0.62, col: '#c0212a' }] },
    ],
  },
  // Douglas SBD-3 Dauntless (1942-43): blue-gray over light gray, the star on a flank and on the upper port and lower starboard wings
  sbd: {
    hw: 1.0, upper: '#4b5a6b', lower: '#adb1b3', line: -0.2, finish: [0.82, 0.0],
    decals: [
      { face: 'side', x: -2.0, y: 0.1, prims: usInsignia(0.4, false) },
      { face: 'top', wing: 'port', x: 0.64, z: 4.4, prims: usInsignia(0.55, true) },
      { face: 'bottom', wing: 'starboard', x: 0.64, z: 4.4, prims: usInsignia(0.55, true) },
    ],
  },
  // Grumman TBF-1C Avenger (1943): the tricolour, sea blue over intermediate blue over insignia white
  tbf: {
    hw: 1.3, upper: '#202e46', side: '#4b6286', lower: '#e2e4de', line: -0.35, finish: [0.82, 0.0],
    decals: [
      { face: 'side', x: -3.2, y: 0.0, prims: usInsignia(0.5, false) },
      { face: 'top', wing: 'port', x: 0.67, z: 5.6, prims: usInsignia(0.75, true) },
      { face: 'bottom', wing: 'starboard', x: 0.67, z: 5.6, prims: usInsignia(0.75, true) },
    ],
  },
  // Ilyushin Il-2 (1942): 4BO green with black-green and brown blotches over light blue, red stars with a white edge
  il2: {
    hw: 1.0, upper: '#4b5b35', lower: '#8fa3b6', line: -0.1, finish: [0.85, 0.0],
    camo: [{ col: '#2b3224', scale: 1.25, thr: 0.55, seed: 3, sides: true }, { col: '#5d4b30', scale: 0.9, thr: 0.64, seed: 11, sides: true }],
    decals: [
      { face: 'side', x: -3.0, y: 0.1, prims: redStar(0.45) },
      { face: 'top', wing: 'both', x: 0.7, z: 4.6, prims: redStar(0.65) },
      { face: 'bottom', wing: 'both', x: 0.7, z: 4.6, prims: redStar(0.65) },
    ],
  },
  // Messerschmitt Bf 109 F-4: RLM 74 / 75 splinter above, RLM 76 below and on the flanks with a mottle of 74, Balkenkreuz
  bf109: {
    upper: '#5c6350', side: '#93a2a6', lower: '#a8b7bc', line: -0.12, finish: [0.8, 0.0],
    camo: [{ col: '#6f7385', scale: 1.1, thr: 0.5, seed: 5 }],
    mottle: { col: '#5f6753', scale: 5.0, thr: 0.74 },
    decals: [
      { face: 'side', x: -2.3, y: 0.2, prims: balkenkreuz(0.42) },
      { face: 'top', wing: 'both', x: 0.75, z: 3.5, prims: balkenkreuz(0.5) },
      { face: 'bottom', wing: 'both', x: 0.75, z: 3.5, prims: balkenkreuz(0.5) },
    ],
  },
  // Avro Lancaster B.I (1943): dark earth and dark green over matt black, the fuselage roundel with its yellow ring, the roundels on the upper wings (the night bombers' undersides carry none)
  lancaster: {
    hw: 1.0, upper: '#4b4a35', lower: '#25272a', line: -0.05, finish: [0.9, 0.0],
    camo: [{ col: '#34402d', scale: 0.8, thr: 0.5, seed: 4 }],
    decals: [
      { face: 'side', x: -6.8, y: 0.15, prims: raf(0.75, true) },
      { face: 'top', wing: 'both', x: 0.85, z: 9.5, prims: raf(1.0, false) },
    ],
  },
  // Heinkel He 111 H: RLM 70 black-green and 71 dark green in splinters over RLM 65 light blue, the Balkenkreuz on the fuselage and the wings, the yellow fuselage band of the Mediterranean
  he111: {
    hw: 1.3, upper: '#4a5a3e', lower: '#8da3b7', line: -0.2, finish: [0.85, 0.0],
    camo: [{ col: '#38442f', scale: 0.9, thr: 0.48, seed: 11 }],
    decals: [
      { face: 'side', x: -3.9, y: 0.0, prims: balkenkreuz(0.6) },
      { face: 'top', wing: 'both', x: 1.9, z: 7.0, prims: balkenkreuz(0.75) },
      { face: 'bottom', wing: 'both', x: 1.9, z: 7.0, prims: balkenkreuz(0.75) },
    ],
  },
  // Boeing B-29 Superfortress: bare aluminium, the star and bars on the fuselage and the upper port and lower starboard wings
  b29: {
    hw: 1.55, upper: '#b7bbbd', lower: '#b7bbbd', line: null, finish: [0.36, 0.8],
    decals: [
      { face: 'side', x: -6.2, y: 0.1, prims: usInsignia(0.8, false) },
      { face: 'top', wing: 'port', x: 0.7, z: 13.0, prims: usInsignia(1.15, true) },
      { face: 'bottom', wing: 'starboard', x: 0.7, z: 13.0, prims: usInsignia(1.15, true) },
    ],
  },
  // Boeing B-17G Flying Fortress (the natural-metal finish of the late 1943 aircraft): bare aluminium with an olive-drab glare panel on the nose, the star and bars on the fuselage and on the
  // upper port and lower starboard wings (measured on the model: the wing star at 11.9 m of the span and mid-chord; the fuselage star between the waist windows and the tailplane)
  b17: {
    hw: 1.5, upper: '#b9bdbf', lower: '#b9bdbf', line: null, finish: [0.38, 0.78],
    glare: { x0: 6.9, x1: 9.3, hw: 0.5, col: '#4a4c36' },
    decals: [
      { face: 'side', x: -6.5, y: 0.15, prims: usInsignia(0.55, false) },
      { face: 'top', wing: 'port', x: 1.8, z: 11.85, prims: usInsignia(0.85, true) },
      { face: 'bottom', wing: 'starboard', x: 1.8, z: 11.85, prims: usInsignia(0.85, true) },
    ],
  },
};

export const AIRPAINT_KEYS = Object.keys(AIRPAINT);
export const airPaintId = (key) => AIRPAINT_KEYS.indexOf(key);

const f = (v) => (Math.abs(v) < 1e-9 ? '0.0' : String(+v.toFixed(4)).includes('.') ? String(+v.toFixed(4)) : v.toFixed(1));
const col = (h) => { const n = parseInt(h.slice(1), 16); return `vec3f(${f(((n >> 16) & 255) / 255)}, ${f(((n >> 8) & 255) / 255)}, ${f((n & 255) / 255)})`; };

/** One marking as WGSL statements that blend its primitives into `c`. */
function decalCode(d, hw) {
  const L = [];
  const sgn = d.wing === 'port' ? -1 : 1;
  let q, mask;
  if (d.face === 'side') { q = `vec2f(p.x - ${f(d.x)}, p.y - ${f(d.y)})`; mask = `smoothstep(0.1, 0.3, abs(ng.z)) * (1.0 - smoothstep(${f(hw + 0.25)}, ${f(hw + 0.45)}, az))`; }
  else {
    const top = d.face === 'top', both = d.wing === 'both';
    const v = both ? `(az - ${f(d.z)})` : `(p.z * ${f(sgn)} - ${f(d.z)})`;      // (outboard on the wing the marking is on)
    q = `vec2f(p.x - ${f(d.x)}, ${v})`;
    mask = `smoothstep(0.25, 0.5, abs(ng.y)) * step(0.0, ${top ? 'n.y' : '-n.y'})${both ? '' : ` * step(0.0, p.z * ${f(sgn)})`}`;
  }
  L.push(`      { let q = ${q}; let m = ${mask};`);
  for (const pr of d.prims) {
    if (pr.disc != null) L.push(`        c = mix(c, ${col(pr.col)}, markDisc(q, ${f(pr.disc)}, fw) * m);`);
    else if (pr.star != null) L.push(`        c = mix(c, ${col(pr.col)}, markStar(q, ${f(pr.star)}, ${f(pr.rot ?? Math.PI / 2)}, fw) * m);`);
    else if (pr.rect) L.push(`        c = mix(c, ${col(pr.col)}, markRect(q, vec4f(${pr.rect.map(f).join(', ')}), fw) * m);`);
  }
  L.push('      }');
  return L.join('\n');
}

/** The WGSL functions `airPaint(id, p, n, ng, fw)` -> sRGB colour of the skin at the local position p, with the smooth normal n and the normal ng of the triangle (fw: a pixel in metres), and `airFinish(id)` -> (roughness, metalness). */
export function airPaintWgsl() {
  const cases = AIRPAINT_KEYS.map((k, i) => {
    const s = AIRPAINT[k];
    const L = [];
    L.push(`      let sideMask = 1.0 - smoothstep(${f(s.hw ?? 0.55)}, ${f((s.hw ?? 0.55) + 0.2)}, az);`);
    L.push(`      let byN = smoothstep(-0.30, -0.05, n.y);`);
    if (s.line != null) {
      L.push(`      let byY = smoothstep(${f(s.line - 0.04)}, ${f(s.line + 0.04)}, p.y + 0.035 * sin(p.x * 2.6));`);
      L.push(`      let upperK = mix(byN, byY, sideMask * (1.0 - smoothstep(0.6, 0.85, abs(n.y))));`);      // (on the flanks of the fuselage the line decides: the normals of a decimated mesh are noisy there; what faces up or down goes by its normal, the root of a low wing included)
    } else L.push(`      let upperK = byN;`);
    L.push(`      var top = ${col(s.upper)};`);
    if (s.side) L.push(`      top = mix(top, ${col(s.side)}, (1.0 - smoothstep(0.3, 0.65, abs(n.y))) * sideMask);`);
    for (const cm of s.camo || []) L.push(`      top = mix(top, ${col(cm.col)}, smoothstep(${f(cm.thr - 0.06)}, ${f(cm.thr + 0.06)}, 0.5 + 0.9 * gnoise(vec2f(p.x * ${f(cm.scale)} + ${f(cm.seed ?? 0)}, p.z * ${f(cm.scale)} + p.y * ${f(cm.scale * 0.6)}))) * ${cm.sides ? '1.0' : 'smoothstep(0.3, 0.6, abs(n.y))'});`);
    L.push(`      var c = mix(${col(s.lower)}, top, upperK);`);
    if (s.mottle) L.push(`      c = mix(c, ${col(s.mottle.col)}, smoothstep(${f(s.mottle.thr)}, ${f(s.mottle.thr + 0.06)}, 0.5 + 0.9 * gnoise(vec2f(p.x * ${f(s.mottle.scale)}, p.y * ${f(s.mottle.scale)} + p.z * ${f(s.mottle.scale * 0.5)}))) * (1.0 - smoothstep(0.3, 0.6, abs(n.y))) * sideMask);`);
    if (s.glare) L.push(`      c = mix(c, ${col(s.glare.col)}, smoothstep(${f(s.glare.x0 - 0.04)}, ${f(s.glare.x0 + 0.04)}, p.x) * (1.0 - smoothstep(${f(s.glare.x1 - 0.04)}, ${f(s.glare.x1 + 0.04)}, p.x)) * (1.0 - smoothstep(${f(s.glare.hw - 0.03)}, ${f(s.glare.hw + 0.03)}, az)) * smoothstep(0.3, 0.6, n.y));`);
    if (s.cowl) L.push(`      c = mix(c, ${col(s.cowl.col)}, smoothstep(${f(s.cowl.x0 - 0.025)}, ${f(s.cowl.x0 + 0.025)}, p.x) * (1.0 - smoothstep(${f(s.cowl.hw - 0.05)}, ${f(s.cowl.hw)}, az)));`);
    for (const d of s.decals || []) L.push(decalCode(d, s.hw ?? 0.55));
    L.push(`      return c;`);
    return `    case ${i}u: {\n${L.join('\n')}\n    }`;
  });
  const fin = AIRPAINT_KEYS.map((k, i) => { const v = AIRPAINT[k].finish || [0.8, 0.0]; return `    case ${i}u: { return vec2f(${f(v[0])}, ${f(v[1])}); }`; });
  return `fn markDisc(q: vec2f, r: f32, fw: f32) -> f32 { return 1.0 - smoothstep(r - max(fw, 0.004), r + max(fw, 0.004), length(q)); }
fn markRect(q: vec2f, b: vec4f, fw: f32) -> f32 {
  let e = max(fw, 0.004);
  return smoothstep(b.x - e, b.x + e, q.x) * (1.0 - smoothstep(b.y - e, b.y + e, q.x)) * smoothstep(b.z - e, b.z + e, q.y) * (1.0 - smoothstep(b.w - e, b.w + e, q.y));
}
fn markStar(q: vec2f, r: f32, rot: f32, fw: f32) -> f32 {
  // a five-pointed star: the radius of its outline in the direction of q (a tip at angle rot)
  let seg = 1.2566371;
  let ri = r * 0.382;
  let a = atan2(q.y, q.x) - rot + seg * 0.5;
  let ph = abs(a - seg * floor(a / seg) - seg * 0.5);
  let bx = ri * cos(seg * 0.5);
  let by = ri * sin(seg * 0.5);
  let R = r * by / max(cos(ph) * by - sin(ph) * (bx - r), 1e-4);
  return 1.0 - smoothstep(R - max(fw, 0.004), R + max(fw, 0.004), length(q));
}
fn airPaint(id: u32, p: vec3f, n: vec3f, ng: vec3f, fw: f32) -> vec3f {
  let az = abs(p.z);
  switch (id) {
${cases.join('\n')}
    default: { return vec3f(0.6); }
  }
}
fn airFinish(id: u32) -> vec2f {
  switch (id) {
${fin.join('\n')}
    default: { return vec2f(0.8, 0.0); }
  }
}`;
}
