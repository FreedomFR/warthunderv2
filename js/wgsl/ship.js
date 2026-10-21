// Warship surface shader. Lit with the same sky / sun / aerial-perspective model as the ocean so
// ships sit in the scene. Everything is procedural (no textures): plating seams, deck planks,
// weathering, wet hull near the waterline, soot and fire glow when damaged.
import { FRAME_WGSL, ATMO_CORE_WGSL, HAZE_WGSL, SHADOW_STRUCT_WGSL, SHADOW_FUNC_WGSL, SANE_WGSL, ENV_MIPS } from './common.js';
import { SKY_RENDER_FUNCS } from './sky.js';
import { CLOUD_SHADOW_FN } from './clouds.js';
import { PALETTES } from '../game/model/livery.js';
import { GLYPH_BITS } from '../game/model/glyphs.js';

// camouflage palettes (generated from the livery tables) and the 5x7 hull-number font
const hexToVec = (h) => { const n = parseInt(h.slice(1), 16); return `vec3f(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255})`; };
const PALETTE_WGSL = `fn camoColor(pal: u32, tone: u32) -> vec3f {
  switch (pal) {
${PALETTES.map((p, i) => `    case ${i}u: { if (tone == 0u) { return ${hexToVec(p[0])}; } if (tone == 1u) { return ${hexToVec(p[1])}; } return ${hexToVec(p[2])}; }`).join('\n')}
    default: { return vec3f(0.5); }
  }
}`;
const GLYPH_WGSL = `var<private> GLYPH: array<vec2<u32>, ${GLYPH_BITS.length}> = array<vec2<u32>, ${GLYPH_BITS.length}>(${GLYPH_BITS.map((g) => `vec2<u32>(${g[0]}u, ${g[1]}u)`).join(', ')});`;

export const SHIP = FRAME_WGSL + ATMO_CORE_WGSL + HAZE_WGSL + SHADOW_STRUCT_WGSL + SANE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var envCube: texture_cube<f32>;
@group(0) @binding(5) var<storage, read> sunVis: array<f32, 4>;
@group(0) @binding(6) var shadowTex: texture_depth_2d;
@group(0) @binding(7) var shadowSamp: sampler_comparison;
@group(0) @binding(8) var<uniform> SH: ShadowU;
@group(0) @binding(9) var cloudShadowTex: texture_2d<f32>;
` + SHADOW_FUNC_WGSL + SKY_RENDER_FUNCS + CLOUD_SHADOW_FN + PALETTE_WGSL + GLYPH_WGSL + /* wgsl */ `
const ENV_MAXMIP: f32 = ${ENV_MIPS - 1}.0;

struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec4f,     // xyz normal, w = baked ambient occlusion
  @location(2) col: vec4f,     // sRGB albedo, a = material id / 255
  @location(3) m0: vec4f,      // instance model matrix, camera relative
  @location(4) m1: vec4f,
  @location(5) m2: vec4f,
  @location(6) m3: vec4f,
  @location(7) tint: vec4f,    // rgb = team colour, a = damage (soot) 0..1
  @location(8) misc: vec4f,    // x = fire glow, y = per-ship random, z = cut plane (local x), w = cut side (+1 bow part, -1 stern part, 0 whole)
  @location(9) paint: vec4f,   // x = camouflage pattern, y = pattern seed, z = nation (ensign), w = camouflage palette
};
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) rel: vec3f,
  @location(1) nrm: vec3f,
  @location(2) local: vec3f,
  @location(3) col: vec4f,
  @location(4) ao: f32,
  @location(5) tint: vec4f,
  @location(6) misc: vec4f,
  @location(7) lnrm: vec3f,
  @location(8) paint: vec4f,
};

@vertex fn vs(v: VIn) -> VOut {
  let M = mat4x4f(v.m0, v.m1, v.m2, v.m3);
  var lpos = v.pos;
  var lnrm = v.nrm.xyz;
  let vmat = u32(v.col.a * 255.0 + 0.5);
  if (vmat == 10u) {
    // ensign: cloth rippling away from the staff (u = distance along the flag, length in decimetres in the blue channel)
    let u = v.col.r;
    let len = max(v.col.b * 25.5, 0.5);
    let ph = F.camPos.w * 6.2 - u * 6.5 + v.pos.y * 0.9 + v.misc.y * 20.0;
    let amp = 0.11 * u * min(len, 6.0);
    lpos.z += (sin(ph) + 0.35 * sin(ph * 2.3 + 1.7)) * amp;
    let dzdu = (cos(ph) * (-6.5) + 0.35 * cos(ph * 2.3 + 1.7) * (-6.5 * 2.3)) * amp + (sin(ph) + 0.35 * sin(ph * 2.3 + 1.7)) * 0.11 * min(len, 6.0);
    lnrm = normalize(vec3f(dzdu / len * 1.0, 0.0, 1.0));
  }
  if (vmat == 14u || vmat == 15u) {
    // wind on the foliage: a gust travelling across the island (the phase follows the position), the amplitude baked in the vertex (metres / 0.6)
    let amp = select(v.col.b, v.nrm.w, vmat == 15u) * 0.6;
    let ph = F.camPos.w * 1.45 + v.misc.y * 40.0 + dot(v.pos.xz, vec2f(0.7, 0.55)) * 0.045;
    let gust = sin(ph) + 0.42 * sin(ph * 2.7 + 1.3);
    lpos.x += 0.8 * gust * amp; lpos.z += 0.6 * gust * amp; lpos.y -= abs(gust) * amp * 0.12;
    if (vmat == 15u) { lpos += v.nrm.xyz * sin(F.camPos.w * 6.5 + dot(v.pos, vec3f(5.1, 7.3, 3.9))) * 0.035 * min(1.0, amp * 6.0); }
  }
  let rel = (M * vec4f(lpos, 1.0)).xyz;
  var o: VOut;
  o.pos = F.viewProj * vec4f(rel, 1.0);
  o.rel = rel;
  o.nrm = normalize((M * vec4f(lnrm, 0.0)).xyz);
  o.lnrm = lnrm;
  o.local = lpos;
  o.col = v.col;
  o.ao = v.nrm.w;
  o.tint = v.tint;
  o.misc = v.misc;
  o.paint = v.paint;
  return o;
}

fn srgb2lin(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
fn hash11(p: f32) -> f32 { return f32(pcgHash(bitcast<u32>(p)) >> 8u) * (1.0 / 16777216.0); }


// integer hash (exact on every rasteriser): a random value in [0, 1) for a pair of cell indices
fn hash21(p: vec2f) -> f32 {
  let a = u32(i32(p.x * 10.0 + 4096.0));
  let b = u32(i32(p.y * 10.0 + 4096.0));
  return f32(pcgHash(a * 1664525u + pcgHash(b + 1013904223u)) >> 8u) * (1.0 / 16777216.0);
}

// ---- camouflage: which of the three palette tones a point of the hull wears ----
fn camoTone(lp: vec3f, scheme: u32, seed: f32) -> u32 {
  let sd = select(-1.0, 1.0, lp.z > 0.0);              // the two sides are painted differently
  let sx = lp.x + seed * 61.0 + select(0.0, 23.0, lp.z > 0.0);
  var h = 0.5;
  if (scheme == 1u) {          // dazzle: slanted bands broken by a coarser second grid
    let u = sx * 0.19 + lp.y * 0.62 * sd;
    let w = sx * 0.085 - lp.y * 0.34 * sd + 5.0;
    h = hash21(vec2f(floor(u), floor(w) + seed * 9.0));
  } else if (scheme == 2u) {   // Admiralty disruptive: wide raked polygons
    let u = sx * 0.07 + lp.y * 0.30 * sd;
    let w = sx * 0.045 - lp.y * 0.52 * sd + 2.0;
    h = hash21(vec2f(floor(u) * 1.3, floor(w) + seed * 7.0));
  } else if (scheme == 3u) {   // sunburst: triangular panels fanning out from a point low on the bow
    let a = atan2(lp.y + 7.0, (sx - 40.0) * 0.16) * 3.4 * sd + seed * 5.0;
    h = hash21(vec2f(floor(a), floor(sx * 0.018)));
  } else {                     // splotches
    let n = gnoise(vec2f(sx * 0.055 + sd * 3.0, lp.y * 0.16)) + 0.5 * gnoise(vec2f(sx * 0.14, lp.y * 0.38 + 7.0));
    h = n * 1.2 + 0.5;
  }
  return select(select(0u, 1u, h > 0.34), 2u, h > 0.68);
}

// ---- national ensigns (uv: x from the hoist to the fly, y from the top down) ----
fn rect(uv: vec2f, c: vec2f, hs: vec2f) -> bool { let d = abs(uv - c); return d.x < hs.x && d.y < hs.y; }
fn ensign(n: u32, uv: vec2f) -> vec3f {
  let white = vec3f(0.92, 0.92, 0.9);
  let red = vec3f(0.70, 0.08, 0.10);
  if (n == 1u) {               // USA: 13 stripes, 50 stars
    var c = select(white, red, (u32(floor(uv.y * 13.0)) % 2u) == 0u);
    if (uv.x < 0.4 && uv.y < 7.0 / 13.0) {
      c = vec3f(0.10, 0.13, 0.37);
      let cx = uv.x / 0.4;
      let cy = uv.y / (7.0 / 13.0);
      let row = floor(cy * 9.0);
      let even = (u32(row) % 2u) == 0u;
      let sx = select(clamp(round(cx * 6.0), 1.0, 5.0) / 6.0, (clamp(round(cx * 6.0 - 0.5), 0.0, 5.0) + 0.5) / 6.0, even);
      let sy = (row + 0.5) / 9.0;
      if (length(vec2f((cx - sx) * 0.4, (cy - sy) * (7.0 / 13.0))) < 0.015) { c = white; }
    }
    return c;
  }
  if (n == 2u) {               // Japan: rising sun with sixteen rays
    let p = vec2f((uv.x - 0.42) * 1.5, uv.y - 0.5);
    let r = length(p);
    let ray = sin(atan2(p.y, p.x) * 16.0) > 0.0;
    return select(white, red, r < 0.17 || (r < 1.4 && ray));
  }
  if (n == 3u) {               // UK: White Ensign
    var c = white;
    if (abs(uv.x - 0.5) < 0.06 || abs(uv.y - 0.5) < 0.09) { c = red; }
    if (uv.x < 0.5 && uv.y < 0.5) {
      let q = vec2f(uv.x * 2.0, uv.y * 2.0);
      c = vec3f(0.07, 0.10, 0.34);
      let d1 = abs(q.x * 1.5 - q.y * 1.0) / 1.8;
      let d2 = abs((1.0 - q.x) * 1.5 - q.y) / 1.8;
      if (d1 < 0.10 || d2 < 0.10) { c = white; }
      if (d1 < 0.04 || d2 < 0.04) { c = red; }
      if (abs(q.x - 0.5) < 0.17 || abs(q.y - 0.5) < 0.17) { c = white; }
      if (abs(q.x - 0.5) < 0.09 || abs(q.y - 0.5) < 0.09) { c = red; }
    }
    return c;
  }
  if (n == 4u) {               // Germany: Reichskriegsflagge of 1921 (black-white-red, iron cross in the canton)
    var c = select(select(red, white, uv.y < 0.667), vec3f(0.03), uv.y < 0.333);
    if (uv.x < 0.34 && uv.y < 0.5) {
      c = red;
      let q = vec2f(uv.x / 0.34, uv.y / 0.5);
      if (abs(q.x - 0.5) < 0.12 || abs(q.y - 0.5) < 0.16) { c = vec3f(0.03); }
      if ((abs(q.x - 0.5) < 0.05 && abs(q.y - 0.5) < 0.30) || (abs(q.y - 0.5) < 0.07 && abs(q.x - 0.5) < 0.30)) { c = white; }
    }
    return c;
  }
  if (n == 5u) {               // France: tricolour
    return select(select(vec3f(0.08, 0.14, 0.45), white, uv.x > 0.333), red, uv.x > 0.667);
  }
  // Italy: tricolour with the Savoy arms
  var c = select(select(vec3f(0.0, 0.40, 0.20), white, uv.x > 0.333), red, uv.x > 0.667);
  if (rect(uv, vec2f(0.5, 0.52), vec2f(0.085, 0.16))) { c = red; if (abs(uv.x - 0.5) < 0.016 || abs(uv.y - 0.52) < 0.025) { c = white; } }
  if (rect(uv, vec2f(0.5, 0.30), vec2f(0.07, 0.035))) { c = vec3f(0.80, 0.62, 0.15); }
  return c;
}

// Normal perturbation from a procedural height field (Mikkelsen), no tangents needed.
fn bumpNormal(N: vec3f, p: vec3f, h: f32) -> vec3f {
  let sx = dpdx(p);
  let sy = dpdy(p);
  let dhx = dpdx(h);
  let dhy = dpdy(h);
  let r1 = cross(sy, N);
  let r2 = cross(N, sx);
  let det = dot(sx, r1);
  let g = sign(det) * (dhx * r1 + dhy * r2);
  return select(normalize(abs(det) * N - g), N, abs(det) < 1e-10);
}

fn fresnelSchlick(c: f32, f0: vec3f) -> vec3f {
  let x = 1.0 - clamp(c, 0.0, 1.0);
  let x2 = x * x;
  return f0 + (vec3f(1.0) - f0) * (x2 * x2 * x);
}
fn ggx(nh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-6);
}

// ---- vegetation ----
// colour of a foliage family at shade t (0 dark .. 1 light), sRGB 0..1
fn leafPal(fam: u32, t: f32) -> vec3f {
  var a = vec3f(32.0, 64.0, 22.0); var b = vec3f(84.0, 112.0, 38.0);
  switch (fam) {
    case 1u: { a = vec3f(20.0, 46.0, 34.0); b = vec3f(44.0, 80.0, 56.0); }
    case 2u: { a = vec3f(36.0, 80.0, 24.0); b = vec3f(92.0, 124.0, 42.0); }
    case 3u: { a = vec3f(22.0, 62.0, 22.0); b = vec3f(58.0, 108.0, 36.0); }
    case 4u: { a = vec3f(100.0, 116.0, 56.0); b = vec3f(152.0, 152.0, 84.0); }
    case 5u: { a = vec3f(36.0, 60.0, 40.0); b = vec3f(64.0, 92.0, 58.0); }
    case 6u: { a = vec3f(38.0, 70.0, 30.0); b = vec3f(76.0, 108.0, 44.0); }
    case 7u: { a = vec3f(84.0, 64.0, 34.0); b = vec3f(122.0, 94.0, 48.0); }
    case 8u: { a = vec3f(110.0, 102.0, 58.0); b = vec3f(164.0, 146.0, 86.0); }
    default: {}
  }
  return mix(a, b, clamp(t, 0.0, 1.0)) / 255.0;
}
fn shapeFam(shape: u32) -> u32 {
  switch (shape) { case 1u: { return 1u; } case 2u: { return 2u; } case 3u: { return 6u; } case 4u: { return 4u; } case 5u: { return 3u; } case 6u: { return 8u; } default: { return 0u; } }
}
// the cut-out of a card of leaves (uv: u across, v from the base to the tip): x = opacity (0 / 1), y = shade 0..1 (veins, individual leaflets)
fn leafMask(shape: u32, uv: vec2f) -> vec2f {
  let w = (uv.x - 0.5) * 2.0;
  var m = 0.0; var sh = 0.5;
  switch (shape) {
    case 0u: {   // a twig of broad leaflets in opposite pairs, a leaflet at the tip
      let y = uv.y * 5.2;
      let side = select(-1.0, 1.0, w > 0.0);
      let ys = y + select(0.0, 0.5, w > 0.0);
      let cell = floor(ys); let fy = fract(ys) - 0.5;
      let e = length(vec2f((abs(w) - 0.5) / 0.48, fy / 0.62 * (1.0 + 0.5 * abs(fy))));
      let tip = length(vec2f(w / 0.4, (uv.y - 0.9) / 0.1));
      let rib = select(0.0, 1.0, abs(w) < 0.045 && uv.y < 0.95);
      m = max(max(1.0 - smoothstep(0.82, 1.0, e), 1.0 - smoothstep(0.85, 1.0, tip)), rib);
      sh = 0.35 + 0.55 * hash21(vec2f(cell, side * 3.0)) + 0.2 * (1.0 - abs(abs(w) - 0.5) * 2.0);
    }
    case 1u: {   // a spray of needles fanning out from the base
      let p = vec2f(w, uv.y + 0.04);
      let ang = atan2(p.x, p.y);
      let r = length(p);
      let line = abs(fract(ang * 13.0) - 0.5) * 2.0;
      m = select(0.0, 1.0, line > 0.58 && r < 1.0 && abs(ang) < 1.05) ;
      sh = 0.4 + 0.5 * hash21(vec2f(floor(ang * 13.0), 2.0));
    }
    case 2u: {   // a palm frond: the rachis and the pinnate leaflets hanging on both sides
      let k = fract(uv.y * 15.0 - abs(w) * 4.5);
      let leaflet = k < 0.72 && abs(w) > 0.05 && abs(w) < 1.0 - 0.3 * uv.y;
      let rib = abs(w) < 0.06;
      m = select(0.0, 1.0, leaflet || rib);
      sh = select(0.3 + 0.6 * k, 0.9, rib);
    }
    case 4u: {   // fine bipinnate leaves (acacia): rows of tiny leaflets
      let k = abs(fract(uv.y * 8.0 - abs(w) * 1.6) - 0.5);
      let fine = abs(fract(w * 5.0 + uv.y * 8.0) - 0.5);
      m = select(0.0, 1.0, (k < 0.26 && fine < 0.4 && abs(w) > 0.06) || abs(w) < 0.05);
      sh = 0.3 + 0.7 * hash21(vec2f(floor(uv.y * 8.0), floor(w * 5.0)));
    }
    case 5u: {   // a fan of simple pointed leaves (tropical canopy) with their veins
      let p = vec2f(w * 0.5, uv.y);
      for (var k = 0; k < 5; k++) {
        let a = (f32(k) - 2.0) * 0.5;
        let ca = cos(a); let sa = sin(a);
        let q = vec2f(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
        let hw = 0.2 * sin(3.14159 * clamp(q.y / 0.98, 0.0, 1.0));
        if (q.y > 0.0 && abs(q.x) < hw) { m = 1.0; sh = 0.6 + 0.25 * select(0.0, 1.0, abs(q.x) < 0.012) - 0.15 * smoothstep(0.7, 1.0, abs(fract(q.y * 8.0 - abs(q.x) * 14.0) - 0.5) * 2.0) + 0.1 * f32(k % 2); }
      }
    }
    default: {   // 3 / 6: a tuft of small leaves (rounded, ragged)
      let c = (uv - 0.5) * 2.0;
      let n = gnoise(uv * 11.0 + 3.0);
      let leaf = abs(fract(uv * 7.0 + n) - 0.5);
      let r = length(c);
      m = select(0.0, 1.0, r + n * 0.45 < 0.92 && (leaf.x < 0.32 || leaf.y < 0.26));
      if (shape == 6u) { m = select(0.0, m, n > -0.18); }
      sh = 0.3 + 0.6 * clamp(0.5 + 1.4 * n, 0.0, 1.0);
    }
  }
  return vec2f(m, sh);
}

// ---- the instruments of a cockpit ----
const TAU2: f32 = 6.2831853;
// a needle from the centre of a dial at the angle a (clockwise from the top), length len, half width w
fn needle(p: vec2f, a: f32, len: f32, w: f32) -> f32 {
  let d = vec2f(sin(a), cos(a));
  let t = dot(p, d);
  let dist = abs(p.x * d.y - p.y * d.x);
  return select(0.0, 1.0 - smoothstep(w * 0.55, w, dist), t > -0.16 * len && t < len);
}
// ticks round a dial: count of them over the sweep from a0 to a1 (clockwise from the top), between the radii r0 and r1
fn ticks(p: vec2f, a0: f32, a1: f32, count: f32, r0: f32, r1: f32, w: f32) -> f32 {
  let r = length(p);
  var ang = atan2(p.x, p.y);
  if (ang < a0 - 0.01 && a0 < 0.0) { ang += TAU2; }
  let u = (ang - a0) / (a1 - a0) * count;
  let d = abs(u - round(u)) * (a1 - a0) / count * r;
  let inside = select(0.0, 1.0, ang >= a0 - 0.01 && ang <= a1 + 0.01 && r > r0 && r < r1);
  return inside * (1.0 - smoothstep(w * 0.6, w, d));
}
fn rot2(p: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(p.x * c - p.y * s, p.x * s + p.y * c); }
// a dial: rgb and 1 inside the face, 0 outside. kind: 0 airspeed, 1 artificial horizon, 2 altimeter, 3 compass, 4 climb, 5 revolutions, 6 clock, 7 engine gauge
fn gauge(kind: u32, uv: vec2f, ias: f32, alt: f32, hdg: f32, vsi: f32, bank: f32, pitch: f32, rpm: f32) -> vec4f {
  let p = (uv - 0.5) * 2.0;
  let r = length(p);
  if (r > 1.0) { return vec4f(0.0); }
  let ink = vec3f(0.78, 0.76, 0.68);
  if (r > 0.9) { return vec4f(vec3f(0.07, 0.07, 0.075) * (0.8 + 0.5 * smoothstep(0.9, 1.0, r)), 1.0); }     // the bezel
  var col = vec3f(0.012, 0.013, 0.012);
  var m = 0.0;
  var red = 0.0;
  if (kind == 0u) {
    let a = -2.3 + 4.6 * clamp(ias / 140.0, 0.0, 1.0);
    m = max(ticks(p, -2.3, 2.3, 14.0, 0.72, 0.86, 0.025) , 0.8 * ticks(p, -2.3, 2.3, 28.0, 0.78, 0.86, 0.014));
    red = ticks(p, 2.3 * 0.86, 2.3, 1.0, 0.62, 0.9, 0.03);
    m = max(m, needle(p, a, 0.78, 0.05));
  } else if (kind == 1u) {
    let q = rot2(p, -bank);
    let off = -pitch * 1.4;
    let sky = q.y > off;
    col = select(vec3f(0.17, 0.11, 0.05), vec3f(0.12, 0.26, 0.44), sky);
    let line = 1.0 - smoothstep(0.012, 0.03, abs(q.y - off));
    let ladder = (1.0 - smoothstep(0.01, 0.02, abs(fract((q.y - off) / 0.24 + 0.5) - 0.5) * 0.24)) * select(0.0, 1.0, abs(q.x) < 0.2) * step(0.12, abs(q.y - off));
    m = max(line, ladder * 0.8);
    // the fixed aircraft and the bank marks
    let wing = (1.0 - smoothstep(0.02, 0.04, abs(p.y))) * select(0.0, 1.0, abs(p.x) > 0.12 && abs(p.x) < 0.55) + (1.0 - smoothstep(0.03, 0.06, length(p)));
    col = mix(col, vec3f(1.0, 0.55, 0.1), clamp(wing, 0.0, 1.0));
    m = max(m, ticks(p, -1.05, 1.05, 4.0, 0.76, 0.9, 0.03));
  } else if (kind == 2u) {
    m = ticks(p, -3.14159, 3.14159, 10.0, 0.74, 0.88, 0.03);
    m = max(m, 0.7 * ticks(p, -3.14159, 3.14159, 50.0, 0.8, 0.88, 0.014));
    m = max(m, needle(p, fract(alt / 1000.0) * TAU2, 0.8, 0.045));
    m = max(m, needle(p, fract(alt / 10000.0) * TAU2, 0.5, 0.07));
  } else if (kind == 3u) {
    // the card turns with the heading; the lubber line is fixed
    let q = rot2(p, -hdg);
    m = max(ticks(q, -3.14159, 3.14159, 36.0, 0.72, 0.88, 0.02), ticks(q, -3.14159, 3.14159, 12.0, 0.66, 0.88, 0.03));
    let north = (1.0 - smoothstep(0.03, 0.07, abs(q.x))) * select(0.0, 1.0, q.y > 0.3 && q.y < 0.62);
    red = north;
    col = mix(col, vec3f(1.0, 0.8, 0.1), (1.0 - smoothstep(0.015, 0.03, abs(p.x))) * select(0.0, 1.0, p.y > 0.55 && p.y < 0.9));
  } else if (kind == 4u) {
    m = ticks(p, -2.3, 2.3, 10.0, 0.72, 0.86, 0.03);
    m = max(m, needle(p, -1.5708 + clamp(vsi / 10.0, -1.0, 1.0) * 2.2, 0.78, 0.05));
  } else if (kind == 5u) {
    m = ticks(p, -2.4, 2.4, 12.0, 0.72, 0.86, 0.03);
    red = ticks(p, 2.4 * 0.82, 2.4, 1.0, 0.62, 0.9, 0.03);
    m = max(m, needle(p, -2.4 + 4.8 * clamp(rpm, 0.0, 1.0), 0.78, 0.05));
  } else if (kind == 6u) {
    m = ticks(p, -3.14159, 3.14159, 12.0, 0.74, 0.88, 0.03);
    m = max(m, needle(p, 0.9 + F.camPos.w * 0.0001, 0.5, 0.055));
    m = max(m, needle(p, 4.1, 0.78, 0.035));
  } else {
    m = ticks(p, -1.6, 1.6, 6.0, 0.7, 0.86, 0.04);
    m = max(m, needle(p, -0.4 + 0.5 * sin(F.camPos.w * 0.3 + hdg), 0.7, 0.07));
  }
  col = mix(col, ink, clamp(m, 0.0, 1.0));
  col = mix(col, vec3f(0.9, 0.12, 0.08), clamp(red, 0.0, 1.0));
  return vec4f(col, 1.0);
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  if (in.misc.w != 0.0 && (in.local.x - in.misc.z) * in.misc.w < 0.0) { discard; }
  var N = normalize(in.nrm);
  let matId = u32(in.col.a * 255.0 + 0.5);
  if (!ff && (matId <= 14u || matId == 17u)) { N = -N; }
  let Ng = N;                                              // geometric normal (shadow offset), before any bump
  let dist = length(in.rel);
  let V = -in.rel / dist;
  let Ld = F.sunDir.xyz;
  let mat = u32(in.col.a * 255.0 + 0.5);
  if ((mat == 2u || mat == 17u) && in.misc.x < 0.0) { discard; }                 // open canopy in the cockpit view
  var albedo = srgb2lin(in.col.rgb);
  var rough = 0.74;
  var metal = 0.0;
  var emissive = vec3f(0.0);
  var trans = 0.0;
  var interior = 0.0;                                        // lit by the sky more than by the sun (a cockpit)                                           // light let through foliage
  var f0 = vec3f(0.035);
  let lp = in.local;
  let fw = max(fwidth(lp.x) + fwidth(lp.y) + fwidth(lp.z), 1e-4);   // local-space pixel footprint
  let up = abs(in.lnrm.y);

  // ---- broad weathering (large scale mottling + vertical rust / water streaks) ----
  let mott = gnoise(vec2f(lp.x * 0.11 + in.misc.y * 13.0, lp.z * 0.11 + lp.y * 0.07));
  let fineN = gnoise(vec2f(lp.x * 1.3 + lp.y * 0.9, lp.z * 1.7 - lp.y * 1.1));
  let streakN = gnoise(vec2f(lp.x * 0.9 + lp.z * 0.9, lp.y * 0.07 + in.misc.y * 7.0));
  var weather = 1.0 + 0.10 * mott + 0.05 * fineN * smoothstep(40.0, 4.0, dist);

  var hgt = 0.0;                                         // procedural relief (metres), turned into a normal perturbation below
  let scheme = u32(in.paint.x + 0.5);
  let nearFade = 1.0 - smoothstep(30.0, 140.0, dist);
  let isSide = abs(in.lnrm.y) < 0.55;

  switch (mat) {
    case 5u: {   // hull plating with waterline bands
      let y = lp.y;
      // horizontal strakes and vertical butt joints
      let sy = abs(fract(y / 1.9) - 0.5) * 2.0;
      let sx = abs(fract((lp.x + 1.3) / 7.5) - 0.5) * 2.0;
      let fadeS = 1.0 - smoothstep(0.02, 0.12, fw * 1.9);
      let seam = (smoothstep(0.93, 1.0, sy) * 0.6 + smoothstep(0.985, 1.0, sx) * 0.45) * fadeS;
      weather *= 1.0 - 0.18 * seam;
      // overlapping strakes: each plate stands a little proud of the one below it
      hgt = (0.05 * smoothstep(0.0, 0.1, fract(y / 1.9)) + 0.02 * smoothstep(0.0, 0.05, fract((lp.x + 1.3) / 7.5))) * fadeS * nearFade;
      // oil-canning: thin plating sags a little between the frames (every 1.1 m along the hull), more on some plates than on others
      if (abs(in.lnrm.z) > 0.5) {
        let fp = lp.x / 1.1 + 0.37;
        let dish = 0.5 - 0.5 * cos(6.2831853 * fract(fp));
        let amp = 0.35 + 0.65 * hash21(vec2f(floor(fp * 0.5), floor(y / 1.9) + in.misc.y * 17.0));
        hgt -= 0.012 * dish * amp * nearFade * (1.0 - smoothstep(0.03, 0.2, fw));
      }
      // scuttles (portholes): a row of dark discs along the topsides, only resolved when close
      if (abs(in.lnrm.z) > 0.65 && y > 1.6 && y < 6.5) {
        let px = (fract((lp.x + in.misc.y * 3.0) / 3.1) - 0.5) * 3.1;
        let d = length(vec2f(px, y - 3.4));
        let m = (1.0 - smoothstep(0.17, 0.24, d)) * (1.0 - smoothstep(0.08, 0.35, fw));
        weather *= 1.0 - 0.72 * m;
      }
      // camouflage over the topsides
      if (scheme > 0u) {
        albedo = srgb2lin(camoColor(u32(in.paint.w + 0.5), camoTone(lp, scheme, in.paint.y)));
      }
      let rustStreak = smoothstep(0.35, 0.8, streakN) * smoothstep(-0.2, 2.5, y) * 0.35;
      albedo = mix(albedo, albedo * vec3f(1.1, 0.7, 0.5) * 0.9, rustStreak * 0.5);
      // a rust tear runs down from each scuttle and from the lower edge of the deck, broken up by noise (little: a ship in service is painted often)
      if (abs(in.lnrm.z) > 0.65 && y > 1.0 && y < 6.5) {
        let px2 = (fract((lp.x + in.misc.y * 3.0) / 3.1) - 0.5) * 3.1;
        let tearLen = 0.7 + 1.6 * hash21(vec2f(floor((lp.x + in.misc.y * 3.0) / 3.1), 5.0));
        let below = clamp((3.2 - y) / tearLen, 0.0, 1.0);
        let tear = (1.0 - smoothstep(0.03, 0.10 + 0.05 * below, abs(px2 + 0.04 * sin(y * 7.0)))) * (1.0 - below) * step(y, 3.2) * step(0.35, hash21(vec2f(floor((lp.x + in.misc.y * 3.0) / 3.1), 9.0)));
        albedo = mix(albedo, albedo * vec3f(1.05, 0.62, 0.42) * 0.8, tear * 0.55 * (1.0 - smoothstep(0.05, 0.25, fw)));
      }
      // sea salt dries into a pale crust in the splash zone, thickest low on the hull and streaked downwards
      let saltBand = (1.0 - smoothstep(1.2, 4.2, y)) * smoothstep(0.5, 0.9, y);
      let saltN = smoothstep(-0.1, 0.55, streakN + 0.5 * fineN);
      albedo = mix(albedo, mix(albedo, vec3f(0.62, 0.62, 0.58), 0.55), saltBand * saltN * 0.38);
      // anti-fouling red below the waterline, dark boot topping just above it
      let boot = 1.0 - smoothstep(0.45, 0.55, y);
      let red = 1.0 - smoothstep(-0.7, -0.55, y);
      let bootCol = albedo * 0.22;
      albedo = mix(albedo, bootCol, boot);
      albedo = mix(albedo, vec3f(0.19, 0.05, 0.04), red);
      // a thin band of green-brown growth at the waterline, between the boot topping and the anti-fouling
      let growth = smoothstep(-0.12, 0.05, y) * (1.0 - smoothstep(0.12, 0.38, y));
      albedo = mix(albedo, vec3f(0.07, 0.10, 0.04) * (0.7 + 0.6 * fineN), growth * 0.5);
      rough = 0.72;
    }
    case 0u: {   // painted steel (superstructure, funnels, turret houses)
      if (scheme > 0u && isSide && lp.y > 1.5) {
        albedo = srgb2lin(camoColor(u32(in.paint.w + 0.5), camoTone(lp, scheme, in.paint.y)));
      }
      // fine plate lines on large vertical surfaces
      if (isSide) {
        let px = abs(fract(lp.y / 1.2) - 0.5) * 2.0;
        let fadeP = (1.0 - smoothstep(0.02, 0.10, fw * 1.6)) * nearFade;
        weather *= 1.0 - 0.10 * smoothstep(0.94, 1.0, px) * fadeP;
        hgt = 0.03 * smoothstep(0.0, 0.08, fract(lp.y / 1.2)) * fadeP;
      }
      rough = 0.7;
    }
    case 1u: {   // wooden / linoleum deck: planks
      let pz = lp.z / 0.24;
      let pl = abs(fract(pz) - 0.5) * 2.0;
      let seg = floor(lp.x / 2.6 + floor(pz) * 0.37);
      let jx = abs(fract(lp.x / 2.6 + floor(pz) * 0.37) - 0.5) * 2.0;
      let fade = 1.0 - smoothstep(0.1, 0.5, fw * 4.2);
      let line = (smoothstep(0.9, 1.0, pl) * 0.5 + smoothstep(0.975, 1.0, jx) * 0.35) * fade;
      let tone = 0.88 + 0.24 * hash11(floor(pz) * 3.1 + seg * 1.7);
      albedo = albedo * tone * (1.0 - 0.45 * line);
      hgt = -0.012 * (smoothstep(0.9, 1.0, pl) + smoothstep(0.975, 1.0, jx)) * fade * nearFade;
      weather *= 1.0 + 0.08 * mott;
      rough = 0.9;
    }
    case 4u: {   // carrier flight deck: dark non-slip surface with expansion seams
      let sx = abs(fract(lp.x / 14.0) - 0.5) * 2.0;
      let fade = 1.0 - smoothstep(0.1, 0.6, fw * 2.0);
      albedo = albedo * (0.9 + 0.15 * fineN) * (1.0 - 0.3 * smoothstep(0.985, 1.0, sx) * fade);
      // wear: lighter, polished strips where aircraft wheels run, rubber streaks at the arrester wires
      let wear = smoothstep(0.35, 0.8, gnoise(vec2f(lp.x * 0.35, lp.z * 3.0)));
      albedo *= 1.0 + 0.10 * wear;
      hgt = -0.01 * smoothstep(0.985, 1.0, sx) * fade * nearFade;
      rough = mix(0.72, 0.55, wear);
    }
    case 2u: {   // glass
      albedo = vec3f(0.012, 0.018, 0.024);
      rough = 0.06;
      f0 = vec3f(0.06);
    }
    case 3u: {   // dark metal: barrels, caps
      metal = 0.5;
      rough = 0.38;
      f0 = mix(vec3f(0.04), albedo * 1.2 + 0.05, 0.5);
    }
    case 6u: {   // lamps
      emissive = albedo * 6.0;
    }
    case 7u: { rough = 0.95; }
    case 8u: {   // team pennant (double sided)
      albedo = srgb2lin(in.tint.rgb);
      rough = 0.9;
      emissive = albedo * 0.12;
    }
    case 9u: { rough = 0.4; f0 = vec3f(0.05); }
    case 10u: {  // national ensign
      albedo = srgb2lin(ensign(u32(in.paint.z + 0.5), in.col.rg));
      rough = 0.9;
      emissive = albedo * 0.10;
    }
    case 11u: {  // hull number glyph: red channel = glyph index, green / blue = position in the glyph box
      let gi = u32(in.col.r * 255.0 + 0.5);
      let cu = u32(clamp(floor(in.col.g * 5.0), 0.0, 4.0));
      let cv = u32(clamp(floor(in.col.b * 7.0), 0.0, 6.0));
      let bit = cv * 5u + cu;
      let word = select(GLYPH[gi].x, GLYPH[gi].y, bit >= 32u);
      if (((word >> (bit & 31u)) & 1u) == 0u) { discard; }
      albedo = vec3f(0.78, 0.78, 0.74);
      rough = 0.8;
    }
    case 12u: {  // the ground of an island: the soil colour is in the vertex, the grain is added here
      let tf = 1.0 - smoothstep(40.0, 420.0, dist);
      let g1 = clamp(0.5 + 0.9 * gnoise(lp.xz * 0.21), 0.0, 1.0);
      let g2 = clamp(0.5 + 0.9 * gnoise(lp.xz * 0.55 + 7.0), 0.0, 1.0);
      let g3 = clamp(0.5 + 0.9 * gnoise(lp.xz * 2.1 + 3.0), 0.0, 1.0);
      let steep = smoothstep(0.35, 0.75, 1.0 - up);
      // strata and crumbled rock on the steep ground, tufts and patches on the gentle one
      let strata = sin(lp.y * 0.9 + g1 * 5.0 + lp.x * 0.05) * 0.5 + 0.5;
      albedo *= (0.78 + 0.4 * g1) * (0.9 + 0.2 * g2 * tf + 0.08 * g3 * tf);
      albedo *= mix(1.0, 0.72 + 0.4 * strata, steep * 0.7);
      // the sand next to the water is wet and darker
      albedo *= mix(0.62, 1.0, smoothstep(0.0, 1.4, lp.y));
      hgt = (0.16 * (g2 - 0.5) + 0.05 * (g3 - 0.5)) * tf;
      rough = mix(0.93, 0.7, (1.0 - smoothstep(0.0, 0.8, lp.y)) * 0.7);
      weather = 1.0;
    }
    case 13u: {  // bark: furrows running along the trunk
      let fur = gnoise(vec2f((lp.x + lp.z * 0.7) * 7.0, lp.y * 0.55));
      let fur2 = gnoise(vec2f((lp.x - lp.z * 0.8) * 15.0 + 3.0, lp.y * 1.8));
      let nf = 1.0 - smoothstep(20.0, 160.0, dist);
      albedo *= 0.74 + 0.55 * clamp(0.5 + fur + 0.4 * fur2, 0.0, 1.0);
      hgt = (0.5 * fur + 0.25 * fur2) * 0.07 * nf;
      rough = 0.93; weather = 1.0;
    }
    case 14u: {  // the crown of a tree: lumps of foliage worn into leaves at the edge, lit from behind
      let rc = u32(in.col.r * 255.0 + 0.5);
      let fam = rc >> 4u;
      let shade = f32(rc & 15u) / 15.0;
      let nw = abs(in.lnrm) + vec3f(0.05);
      let f1 = 2.7;
      let nA = gnoise(lp.yz * f1 + 1.0); let nB = gnoise(lp.xz * f1 + 5.0); let nC = gnoise(lp.xy * f1 + 9.0);
      let leafN = (nA * nw.x + nB * nw.y + nC * nw.z) / (nw.x + nw.y + nw.z);
      let nA2 = gnoise(lp.yz * 8.5 + 2.0); let nB2 = gnoise(lp.xz * 8.5 + 7.0); let nC2 = gnoise(lp.xy * 8.5 + 4.0);
      let fineN = (nA2 * nw.x + nB2 * nw.y + nC2 * nw.z) / (nw.x + nw.y + nw.z);
      let big = gnoise(lp.xz * 0.45 + lp.y * 0.2);
      let res = 1.0 - smoothstep(0.05, 0.4, fw);                    // leaf scale is only resolved close up
      let facing = abs(dot(normalize(in.nrm), V));
      let rim = 1.0 - facing;
      // the edge of the crown is ragged: leaves missing where the surface turns away
      let hole = 0.5 + 0.8 * leafN + 0.35 * fineN;
      if (hole < (rim * 1.5 + 0.06) * (0.25 + 0.75 * res)) { discard; }
      let t = clamp(shade * 0.7 + 0.15 + 0.6 * leafN + 0.2 * big + 0.15 * fineN * res, 0.0, 1.0) * (0.78 + 0.5 * in.col.g);
      albedo = srgb2lin(leafPal(fam, t) * mix(vec3f(1.0), vec3f(1.15, 1.1, 0.8), clamp(0.5 + 0.9 * big, 0.0, 1.0) * 0.5)) * (0.78 + 0.5 * in.col.g);
      albedo *= in.tint.rgb * 2.0;
      hgt = (0.5 * leafN + 0.25 * fineN) * 0.16 * (1.0 - smoothstep(25.0, 200.0, dist));
      rough = 0.7; f0 = vec3f(0.02); trans = 0.55; weather = 1.0;
    }
    case 15u: {  // a card of leaves with a cut-out
      let shape = u32(in.col.b * 255.0 + 0.5) >> 4u;
      let m = leafMask(shape, in.col.rg);
      if (m.x < 0.5) { discard; }
      let big = gnoise(lp.xz * 0.6 + lp.y * 0.3);
      let t = clamp(m.y * 0.8 + 0.25 * big + 0.1, 0.0, 1.0);
      albedo = srgb2lin(leafPal(shapeFam(shape), t)) * (0.85 + 0.3 * hash21(vec2f(floor(lp.x * 2.0) + floor(lp.y * 2.0), floor(lp.z * 2.0))));
      albedo *= in.tint.rgb * 2.0;
      rough = 0.55; f0 = vec3f(0.03); trans = 0.7; weather = 1.0;
    }
    case 16u: {  // boulders: speckled stone, moss on the top
      let g1 = gnoise(lp.xz * 4.2 + lp.y * 2.5); let g2 = gnoise(lp.xy * 11.0 + 3.0);
      let g3 = gnoise(lp.xz * 0.8 + 11.0);
      albedo *= (0.72 + 0.5 * clamp(0.5 + g1 + 0.5 * g2, 0.0, 1.0)) * in.tint.rgb * 2.0;
      let moss = smoothstep(0.35, 0.8, in.lnrm.y) * smoothstep(-0.25, 0.35, g3);
      albedo = mix(albedo, vec3f(0.05, 0.1, 0.03) * (0.7 + 0.6 * clamp(0.5 + g2, 0.0, 1.0)), moss * 0.6);
      hgt = (0.5 * g1 + 0.3 * g2) * 0.1 * (1.0 - smoothstep(20.0, 150.0, dist));
      rough = mix(0.9, 0.97, moss); weather = 1.0;
    }
    case 17u: { rough = 0.4; f0 = vec3f(0.05); }
    case 18u: {  // a dial: drawn from the flight state (paint: speed, height, heading, climb; tint: bank, pitch, revolutions)
      let kind = u32(in.col.b * 255.0 + 0.5) >> 4u;
      let gq = gauge(kind, in.col.rg, in.paint.x, in.paint.y, in.paint.z, in.paint.w, in.tint.r, in.tint.g, in.tint.b);
      if (gq.a < 0.5) { discard; }
      albedo = gq.rgb * gq.rgb; emissive = gq.rgb * gq.rgb * 0.45;
      rough = 0.22; f0 = vec3f(0.05); interior = 1.0; weather = 1.0;
    }
    case 19u: {  // a reflector sight: the ring, the dot and the marks, lit
      let q = (in.col.rg - 0.5) * 2.0;
      let rr = length(q);
      let ang = atan2(q.x, q.y);
      var ring = 1.0 - smoothstep(0.035, 0.06, abs(rr - 0.62));
      ring = max(ring, 1.0 - smoothstep(0.05, 0.09, rr));
      let tk = abs(fract(ang * 8.0 / TAU2 + 0.5) - 0.5) * TAU2 / 8.0 * rr;
      if (abs(rr - 0.62) < 0.13 && tk < 0.02) { ring = 1.0; }
      ring = max(ring, (1.0 - smoothstep(0.012, 0.025, abs(q.x))) * select(0.0, 1.0, abs(q.y) > 0.14 && abs(q.y) < 0.4));
      ring = max(ring, (1.0 - smoothstep(0.012, 0.025, abs(q.y))) * select(0.0, 1.0, abs(q.x) > 0.14 && abs(q.x) < 0.4));
      if (ring < 0.35) { discard; }
      albedo = vec3f(0.0); emissive = vec3f(1.0, 0.42, 0.1) * 3.5 * ring; interior = 1.0; weather = 1.0;
    }
    case 20u: {  // the blur of a propeller: a dark disc seen through a screen of dither, streaked by the blades
      let q = (in.col.rg - 0.5) * 2.0;
      let rr = length(q);
      if (rr > 1.0) { discard; }
      let blades = f32(u32(in.col.b * 255.0 + 0.5) >> 4u);
      let streak = 0.5 + 0.5 * sin(atan2(q.y, q.x) * blades);
      let alpha = (0.025 + 0.09 * streak) * smoothstep(0.08, 0.3, rr) * (1.0 - 0.6 * smoothstep(0.85, 1.0, rr)) + 0.1 * (1.0 - smoothstep(0.04, 0.16, rr));
      let h = f32(pcgHash(u32(in.pos.x) * 1973u + u32(in.pos.y) * 9277u + u32(F.camPos.w * 90.0) * 26699u) >> 8u) * (1.0 / 16777216.0);
      if (h > alpha) { discard; }
      albedo = vec3f(0.03); rough = 0.85; interior = 1.0; weather = 1.0;
    }
    case 21u: { rough = 0.82; interior = 1.0; weather = 1.0; }
    default: { rough = 0.74; }
  }
  N = bumpNormal(N, in.rel, hgt);
  albedo *= weather;
  // grime collects where the baked occlusion is strong (under overhangs, in corners) and the paint fades on the faces that look up
  if (mat <= 5u) {
    albedo *= mix(0.8, 1.0, smoothstep(0.25, 0.85, in.ao));
    albedo = mix(albedo, albedo * 1.1 + vec3f(0.006), up * select(0.0, 0.35, mat == 0u));
  }

  // wet hull near the waterline: darker and glossier, the spray zone
  let wet = (1.0 - smoothstep(0.0, 2.6, lp.y)) * select(0.0, 1.0, mat == 5u);
  albedo *= 1.0 - 0.38 * wet;
  rough = mix(rough, 0.18, wet * 0.8);

  // damage: soot darkening everywhere, brighter patches where fires burn
  let dmg = in.tint.a;
  let sootN = gnoise(vec2f(lp.x * 0.5 + 3.0, lp.z * 0.5 + lp.y * 0.4));
  albedo *= 1.0 - dmg * (0.45 + 0.4 * smoothstep(-0.2, 0.5, sootN)) * smoothstep(0.0, 4.0, lp.y + 2.0);
  let fireN = gnoise(vec2f(lp.x * 0.22 - F.camPos.w * 0.3, lp.z * 0.22 + in.misc.y * 40.0 + F.camPos.w * 0.15));
  // glowing patches on decks and roofs only (hull sides would show vertical streaks)
  let upFace = smoothstep(0.55, 0.9, in.lnrm.y);
  emissive += vec3f(1.0, 0.34, 0.05) * max(in.misc.x, 0.0) * smoothstep(0.35, 0.7, fireN) * 2.2 * upFace * smoothstep(1.0, 4.0, lp.y);

  // torn edge of a ship broken in two: charred steel, glowing
  if (in.misc.w != 0.0) {
    let cd = abs(lp.x - in.misc.z);
    let hot = 1.0 - smoothstep(0.0, 2.4, cd);
    let ragged = gnoise(vec2f(lp.y * 1.7 + in.misc.y * 9.0, lp.z * 1.9));
    let h2 = hot * smoothstep(0.1, 0.8, ragged + hot * 0.6);
    albedo = mix(albedo, albedo * 0.08, h2 * 0.9);
    emissive += vec3f(1.0, 0.32, 0.05) * h2 * h2 * (1.2 + 1.6 * gnoise(vec2f(lp.y * 0.8 - F.camPos.w * 2.0, lp.z * 0.8)));
  }

  // ---- lighting ----
  // shadow: surfaces facing away from the sun are already dark; the map handles occlusion by other geometry
  let shadow = shadowAt(in.rel + Ng * 0.35);
  let sunE = sunIlluminance() * select(sunVis[0], cloudShadowAt(in.rel), F.camFwd.w > 0.5) * shadow * mix(1.0, 0.3, interior);
  let NdL = dot(N, Ld);
  // soft terminator: ships have lots of small features, a bit of wrap avoids hard black faces
  let wrap = clamp((NdL + 0.15) / 1.15, 0.0, 1.0);
  let diffSun = sunE * wrap * step(-0.02, Ld.y) / PI;
  // sky irradiance from the blurred environment cube (lower hemisphere = sea bounce)
  let skyN = textureSampleLevel(envCube, sampC, N, ENV_MAXMIP - 1.0).rgb;
  let skyUp = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP).rgb;
  let amb = skyN * 0.85 + skyUp * 0.35;
  let heightAO = mix(0.72, 1.0, smoothstep(-1.5, 7.0, lp.y));
  let ao = in.ao * heightAO;
  var col = albedo * (diffSun + amb * ao * 1.15);
  // leaves let the sun through: the side facing away from it glows yellow-green
  col += albedo * vec3f(1.0, 0.93, 0.5) * sunE * max(-NdL, 0.0) * trans * 0.5 / PI * step(-0.02, Ld.y);

  // specular: sun GGX + environment reflection
  let H = normalize(V + Ld);
  // specular anti-aliasing: where the normal changes quickly inside a pixel (bumpy plating far away, silhouettes) the highlight is widened instead of sparkling
  let dNx = dpdx(N); let dNy = dpdy(N);
  let nVar = min(2.0 * 0.15915494 * 0.25 * (dot(dNx, dNx) + dot(dNy, dNy)), 0.18);
  let a = sqrt(clamp(max(rough * rough, 0.02) * max(rough * rough, 0.02) + nVar, 0.0004, 1.0));
  let nh = max(dot(N, H), 0.0);
  let nv = max(dot(N, V), 1e-3);
  let nl = max(NdL, 0.0);
  let Fh = fresnelSchlick(max(dot(V, H), 0.0), mix(f0, albedo, metal));
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let Gs = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
  let spec = sunE * ggx(nh, a) * Fh * Gs / max(4.0 * nv * max(nl, 1e-3), 1e-3) * nl * step(0.0, Ld.y);
  let R = reflect(-V, N);
  var Rr = R;
  Rr.y = max(Rr.y, -0.1);
  let envLod = clamp(rough * 7.0, 0.0, ENV_MAXMIP);
  let refl = textureSampleLevel(envCube, sampC, normalize(Rr), envLod).rgb;
  // roughness-aware Fresnel for the environment reflection: rough paint does not turn into a mirror at grazing angles
  let F0e = mix(f0, albedo, metal);
  let Fe = F0e + (max(vec3f(1.0 - rough), F0e) - F0e) * pow(1.0 - clamp(nv, 0.0, 1.0), 5.0);
  col = col * (1.0 - metal * 0.8) + spec + refl * Fe * ao * mix(0.55, 1.0, 1.0 - rough);
  col += emissive;
  col = mix(col, albedo * (sunE * 0.15 + amb) , select(0.0, 0.3, mat == 8u));

  // ---- aerial perspective (same as the ocean) ----
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist * hazeAltFactor(F.camPos.y));
  let hz = normalize(vec3f(-V.x, 0.002, -V.z));
  let fogCol = skyAtmo(hz);
  col = col * T + fogCol * (1.0 - T);
  return vec4f(sane(col), 1.0);
}
`;

// Depth-only pass from the sun's point of view.
export const SHIP_SHADOW = /* wgsl */ `
struct ShadowU { vp: mat4x4f, p: vec4f };
@group(0) @binding(0) var<uniform> SH: ShadowU;
struct VIn {
  @location(0) pos: vec3f,
  @location(3) m0: vec4f, @location(4) m1: vec4f, @location(5) m2: vec4f, @location(6) m3: vec4f,
};
@vertex fn vs(v: VIn) -> @builtin(position) vec4f {
  let M = mat4x4f(v.m0, v.m1, v.m2, v.m3);
  return SH.vp * vec4f((M * vec4f(v.pos, 1.0)).xyz, 1.0);
}
`;
