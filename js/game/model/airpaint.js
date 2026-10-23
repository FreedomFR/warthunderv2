// The paint schemes of the aircraft drawn from their models: the colours of the upper and the lower surfaces, the cowling, the anti-glare panel and the national markings, as the
// real aircraft wore them. The shader (wgsl/ship.js, material AIRPAINT) paints the skin from this table in the aircraft's own frame (+x nose, y up, +z starboard), so the model's
// own textures are not used: only its shape. A vertex of the material carries the scheme number in its red channel.
// Sources: the colour of the IJN grey-green ("ameiro" J3) and dark green (D1) from the Japanese colour standards as reported by the aircraft pages of Wikipedia and the Model Art monographs;
// the places and sizes of the roundels are measured on the reference models (tools/refs/planepaint.py); `est` marks a guess.
//   side   { x, y, r }  a disc on the flanks of the fuselage (both sides)       wing { x, z, r }  a disc on the top and the bottom of each wing
export const AIRPAINT = {
  // Mitsubishi A6M2: overall grey-green, a black-blue cowling and anti-glare panel, red hinomaru on the fuselage and on the wings
  a6m: {
    upper: '#a6a690', lower: '#b2b19e', line: null,
    cowl: { x0: 2.8, col: '#1a1d24', hw: 0.72 },
    glare: { x0: 1.4, x1: 2.85, hw: 0.36, col: '#1a1d24' },
    red: '#c0212a',
    side: [{ x: -1.14, y: 0.05, r: 0.44 }],
    wing: [{ x: 1.39, z: 4.6, r: 0.47 }],
  },
  // Aichi D3A1: dark green over grey-green, a black-blue cowling, hinomaru as on the Zero
  d3a: {
    upper: '#46563a', lower: '#a9ad9a', line: -0.02,
    cowl: { x0: 3.05, col: '#1a1d24', hw: 0.8 },
    glare: null,
    red: '#c0212a',
    side: [{ x: -1.88, y: 0.03, r: 0.43 }],
    wing: [{ x: 1.05, z: 5.93, r: 0.62 }],
  },
};

export const AIRPAINT_KEYS = Object.keys(AIRPAINT);
export const airPaintId = (key) => AIRPAINT_KEYS.indexOf(key);

const f = (v) => (Math.abs(v) < 1e-9 ? '0.0' : String(+v.toFixed(4)).includes('.') ? String(+v.toFixed(4)) : v.toFixed(1));
const col = (h) => { const n = parseInt(h.slice(1), 16); return `vec3f(${f(((n >> 16) & 255) / 255)}, ${f(((n >> 8) & 255) / 255)}, ${f((n & 255) / 255)})`; };

/** The WGSL function `airPaint(id, p, n, ng, fw)` -> sRGB colour of the skin at the local position p with the local normal n (fw: the size of a pixel in metres). */
export function airPaintWgsl() {
  const cases = AIRPAINT_KEYS.map((k, i) => {
    const s = AIRPAINT[k];
    const L = [];
    L.push(`      let sideMask = 1.0 - smoothstep(0.55, 0.75, az);`);
    L.push(`      let byN = smoothstep(-0.30, -0.05, n.y);`);
    if (s.line !== null) {
      L.push(`      let byY = smoothstep(${f(s.line - 0.04)}, ${f(s.line + 0.04)}, p.y + 0.035 * sin(p.x * 2.6));`);
      L.push(`      let upperK = mix(byN, mix(byY, byN, smoothstep(0.4, 0.8, abs(n.y))), sideMask);`);
    } else L.push(`      let upperK = byN;`);
    L.push(`      var c = mix(${col(s.lower)}, ${col(s.upper)}, upperK);`);
    if (s.glare) L.push(`      c = mix(c, ${col(s.glare.col)}, smoothstep(${f(s.glare.x0 - 0.04)}, ${f(s.glare.x0 + 0.04)}, p.x) * (1.0 - smoothstep(${f(s.glare.x1 - 0.04)}, ${f(s.glare.x1 + 0.04)}, p.x)) * (1.0 - smoothstep(${f(s.glare.hw - 0.03)}, ${f(s.glare.hw + 0.03)}, az)) * smoothstep(0.3, 0.6, n.y));`);
    if (s.cowl) L.push(`      c = mix(c, ${col(s.cowl.col)}, smoothstep(${f(s.cowl.x0 - 0.025)}, ${f(s.cowl.x0 + 0.025)}, p.x) * (1.0 - smoothstep(${f(s.cowl.hw - 0.05)}, ${f(s.cowl.hw)}, az)));`);
    for (const d of s.side || []) L.push(`      c = mix(c, ${col(s.red)}, disc(vec2f(p.x - ${f(d.x)}, p.y - ${f(d.y)}), ${f(d.r)}, fw) * smoothstep(0.1, 0.3, abs(ng.z)) * (1.0 - smoothstep(0.8, 1.0, az)));`);
    for (const d of s.wing || []) L.push(`      c = mix(c, ${col(s.red)}, disc(vec2f(p.x - ${f(d.x)}, az - ${f(d.z)}), ${f(d.r)}, fw) * smoothstep(0.25, 0.5, abs(ng.y)));`);
    L.push(`      return c;`);
    return `    case ${i}u: {\n${L.join('\n')}\n    }`;
  });
  return `fn disc(q: vec2f, r: f32, fw: f32) -> f32 { return 1.0 - smoothstep(r - max(fw, 0.004), r + max(fw, 0.004), length(q)); }
fn airPaint(id: u32, p: vec3f, n: vec3f, ng: vec3f, fw: f32) -> vec3f {
  let az = abs(p.z);
  switch (id) {
${cases.join('\n')}
    default: { return vec3f(0.6); }
  }
}`;
}
