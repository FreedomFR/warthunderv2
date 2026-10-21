// Volumetric cumulus: a layer of real clouds with a flat base and heaped tops, that the camera can be under, in or over, that hides an aircraft
// flying behind or through a cloud, and that is seen from above from a bomber at its cruising height.
//   NOISE_GEN     once: a tileable 3D noise (rgba8: r Perlin-Worley for the shape, g b a Worley octaves for the eroded edges)
//   WEATHER       every frame: the coverage of the sky round the camera (the same field as the flat layer of sky.js, lowEdge, so the reflections and
//                 the dimming of the sun on the water agree with the volume)
//   CLOUD_MARCH   at half resolution: the ray through the layer up to the scene (the depth buffer), the light marched towards the sun at each step
//                 (self-shadowing), a dual-lobe phase (silver linings against the sun), multiple scattering in octaves, the sky's light from above
//                 and below; out: the radiance and the transmittance, and the distance used (for the upsampling)
//   CLOUD_APPLY   full resolution: the half-resolution result over the image (scene * T + radiance), upsampled with the depth so that the edges of the
//                 aircraft and the ships stay sharp
import { FRAME_WGSL, ATMO_CORE_WGSL, NOISE_WGSL } from './common.js';
import { SKY_RENDER_FUNCS, SKY_CLOUD_FUNCS } from './sky.js';

export const CLOUD_NOISE = 128;        // size of the 3D noise (texels per side)
export const WEATHER_SIZE = 512;       // size of the coverage map (texels per side)
export const WEATHER_KM = 96;          // what the coverage map covers round the camera (km)
export const CSHADOW_SIZE = 512;       // the map of the shadows of the clouds on the sea (texels per side)
export const CSHADOW_KM = 40;          // what it covers round the camera (km)

/** The shadow of the clouds at a camera-relative point (metres), from the map of CLOUD_SHADOW (needs cloudShadowTex and sampC); 1 = in the sun. */
export const CLOUD_SHADOW_FN = /* wgsl */ `
fn cloudShadowAt(rel: vec3f) -> f32 {
  let tex = ${CSHADOW_KM}.0 / ${CSHADOW_SIZE}.0;
  let c = floor(F.camPos.xz * 0.001 / tex) * tex;
  let uv = ((F.camPos.xz + rel.xz) * 0.001 - c) / ${CSHADOW_KM}.0 + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 1.0; }
  let e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return mix(1.0, textureSampleLevel(cloudShadowTex, sampC, uv, 0.0).r, smoothstep(0.0, 0.05, e));
}
`;

const CLOUD_U = /* wgsl */ `
struct CloudU {
  p0: vec4f,     // base km, thickness km, extinction per km, steps
  p1: vec4f,     // shape tile km, detail tile km, detail erosion, max distance km
  p2: vec4f,     // light steps, ambient gain, multiple scattering gain, -
};
`;

// ---- the tileable 3D noise -------------------------------------------------------------------------------------------------------------------------------------
export const NOISE_GEN = /* wgsl */ `
@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;
const S: u32 = ${CLOUD_NOISE}u;
fn h3(p: vec3i, seed: u32) -> u32 {
  var v = u32(p.x) * 1664525u + u32(p.y) * 1013904223u + u32(p.z) * 2654435761u + seed * 97u;
  v = v * 747796405u + 2891336453u;
  let w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}
fn hf(p: vec3i, seed: u32) -> f32 { return f32(h3(p, seed) >> 8u) / 16777216.0; }
fn wrap(p: vec3i, per: i32) -> vec3i { return ((p % per) + per) % per; }
// gradient noise with a period of 'per' cells
fn grad(p: vec3i, per: i32, seed: u32) -> vec3f {
  let q = wrap(p, per);
  let a = hf(q, seed) * 6.2831853;
  let z = hf(q, seed + 1u) * 2.0 - 1.0;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3f(cos(a) * r, sin(a) * r, z);
}
fn perlin(x: vec3f, per: i32, seed: u32) -> f32 {
  let i = vec3i(floor(x));
  let f = x - floor(x);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  var n = 0.0;
  let c000 = dot(grad(i, per, seed), f);
  let c100 = dot(grad(i + vec3i(1, 0, 0), per, seed), f - vec3f(1.0, 0.0, 0.0));
  let c010 = dot(grad(i + vec3i(0, 1, 0), per, seed), f - vec3f(0.0, 1.0, 0.0));
  let c110 = dot(grad(i + vec3i(1, 1, 0), per, seed), f - vec3f(1.0, 1.0, 0.0));
  let c001 = dot(grad(i + vec3i(0, 0, 1), per, seed), f - vec3f(0.0, 0.0, 1.0));
  let c101 = dot(grad(i + vec3i(1, 0, 1), per, seed), f - vec3f(1.0, 0.0, 1.0));
  let c011 = dot(grad(i + vec3i(0, 1, 1), per, seed), f - vec3f(0.0, 1.0, 1.0));
  let c111 = dot(grad(i + vec3i(1, 1, 1), per, seed), f - vec3f(1.0, 1.0, 1.0));
  return mix(mix(mix(c000, c100, u.x), mix(c010, c110, u.x), u.y), mix(mix(c001, c101, u.x), mix(c011, c111, u.x), u.y), u.z);
}
// distance to the nearest feature point (one per cell), 0 at a point .. about 1 between them; inverted below so that the cells are blobs
fn worley(x: vec3f, per: i32, seed: u32) -> f32 {
  let i = vec3i(floor(x));
  let f = x - floor(x);
  var d = 9.0;
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var m = -1; m <= 1; m++) {
        let c = vec3i(m, j, k);
        let q = i + c;
        let o = vec3f(hf(wrap(q, per), seed + 7u), hf(wrap(q, per), seed + 11u), hf(wrap(q, per), seed + 13u));
        d = min(d, length(vec3f(c) + o - f));
      }
    }
  }
  return clamp(d, 0.0, 1.0);
}
fn wfbm(x: vec3f, per: i32, seed: u32) -> f32 {
  return (1.0 - worley(x, per, seed)) * 0.625 + (1.0 - worley(x * 2.0, per * 2, seed + 3u)) * 0.25 + (1.0 - worley(x * 4.0, per * 4, seed + 5u)) * 0.125;
}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= S || id.y >= S || id.z >= S) { return; }
  let u = (vec3f(id) + 0.5) / f32(S);
  // the shape: low-frequency Perlin fbm, made billowy by the Worley cells (the cauliflower of a cumulus)
  var pf = 0.0;
  var a = 0.5;
  var per = 4;
  for (var o = 0; o < 4; o++) { pf += a * perlin(u * f32(per), per, 1u + u32(o)); a *= 0.5; per *= 2; }
  pf = clamp(pf * 0.9 + 0.5, 0.0, 1.0);
  let w0 = wfbm(u * 4.0, 4, 20u);
  let shape = clamp((pf - (1.0 - w0)) / max(w0, 1e-3) * 0.5 + w0 * 0.65, 0.0, 1.0);
  textureStore(dst, id, vec4f(shape, wfbm(u * 8.0, 8, 40u), wfbm(u * 16.0, 16, 60u), wfbm(u * 32.0, 32, 80u)));
}
`;

// ---- the coverage map ------------------------------------------------------------------------------------------------------------------------------------------
export const WEATHER = FRAME_WGSL + ATMO_CORE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
` + SKY_RENDER_FUNCS + SKY_CLOUD_FUNCS + /* wgsl */ `
const WS: f32 = ${WEATHER_SIZE}.0;
const WKM: f32 = ${WEATHER_KM}.0;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id3: vec3u) {
  let id = id3.xy;
  if (f32(id.x) >= WS || f32(id.y) >= WS) { return; }
  let tex = WKM / WS;
  let c = floor(F.camPos.xz * 0.001 / tex) * tex;          // the map follows the camera a texel at a time (no swimming)
  let q = c + (vec2f(id.xy) + 0.5 - WS * 0.5) * tex;
  // the same field as the flat layer (sky.js lowEdge): where it is above 0 there is cloud; the coverage grows with it
  let e = lowEdge(q, tex * 0.6, 6);
  let cov = clamp(e * 1.6 + 0.32, 0.0, 1.0);
  // r: coverage, g: how tall the clouds grow there (towering where the coverage is high, a second field for variety)
  let tall = clamp(0.35 + 0.65 * cov + gnoise(q * 0.11 + vec2f(5.1, 2.3)) * 0.35, 0.15, 1.0);
  textureStore(dst, id.xy, vec4f(cov, tall, 0.0, 1.0));
}
`;

// the density of the layer (shared by the shadows and the march; needs F, CU, sampC, noiseTex, sampW, weatherTex)
const DENSITY_FUNCS = /* wgsl */ `
const WKM: f32 = ${WEATHER_KM}.0;
const WS: f32 = ${WEATHER_SIZE}.0;
fn weatherAt(xz: vec2f) -> vec2f {
  let tex = WKM / WS;
  let c = floor(F.camPos.xz * 0.001 / tex) * tex;
  let uv = (xz - c) / WKM + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec2f(0.0); }
  let w = textureSampleLevel(weatherTex, sampC, uv, 0.0).rg;
  // fades out towards the edge of the map
  let e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return w * vec2f(smoothstep(0.0, 0.08, e), 1.0);
}

// the height profile of a cumulus: a sharp flat base, a rounded top that rises with 'tall'
fn profile(hf: f32, tall: f32) -> f32 {
  let top = 0.25 + 0.75 * tall;
  return smoothstep(0.0, 0.06, hf) * (1.0 - smoothstep(top * 0.55, top, hf));
}

// p: world position (km, y = height above the sea); detail: with the eroding octaves; returns the density 0..1
fn density(p: vec3f, detail: bool) -> f32 {
  let hf = (p.y - CU.p0.x) / CU.p0.y;
  if (hf < 0.0 || hf > 1.0) { return 0.0; }
  let w = weatherAt(p.xz);
  let base = w.x * profile(hf, w.y);
  if (base < 0.01) { return 0.0; }
  // the clouds drift with the wind and boil slowly at the top
  let t = F.cloudP.w;
  let wind = vec3f(F.windP[0].x, 0.0, F.windP[0].y) * t * 0.004 + vec3f(0.0, -t * 0.0004, 0.0);
  let n = textureSampleLevel(noiseTex, sampW, (p + wind) / CU.p1.x, 0.0);
  // the shape noise carves the cells, more at the edges of a cloud than in its heart
  var d = clamp((base - (1.0 - n.r) * 0.72) / (1.0 - (1.0 - n.r) * 0.72 + 1e-3), 0.0, 1.0);
  if (detail && d > 0.0) {
    let m = textureSampleLevel(noiseTex, sampW, (p + wind * 1.6) / CU.p1.y, 0.0);
    let dn = m.g * 0.625 + m.b * 0.25 + m.a * 0.125;
    // wispy at the base, cauliflower higher up
    let er = mix(1.0 - dn, dn, smoothstep(0.1, 0.5, hf)) * CU.p1.z;
    d = clamp((d - er) / (1.0 - er + 1e-3), 0.0, 1.0);
  }
  return d;
}

`;

// ---- the shadows on the sea ------------------------------------------------------------------------------------------------------------------------------------
// For each point of the sea round the camera, the light of the sun through the layer: a march from the sea towards the sun, the shape of the clouds without
// their eroded edges (a shadow is softer than the cloud). Under a thick cumulus about a quarter of the direct light is left (the light scattered down through it).
export const CLOUD_SHADOW = FRAME_WGSL + ATMO_CORE_WGSL + CLOUD_U + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sampC: sampler;
@group(0) @binding(2) var noiseTex: texture_3d<f32>;
@group(0) @binding(3) var sampW: sampler;
@group(0) @binding(4) var weatherTex: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var<uniform> CU: CloudU;
` + DENSITY_FUNCS + /* wgsl */ `
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id3: vec3u) {
  let id = id3.xy;
  let S = ${CSHADOW_SIZE}.0;
  if (f32(id.x) >= S || f32(id.y) >= S) { return; }
  let tex = ${CSHADOW_KM}.0 / S;
  let c = floor(F.camPos.xz * 0.001 / tex) * tex;
  let xz = c + (vec2f(id.xy) + 0.5 - S * 0.5) * tex;
  let sd = F.sunDir.xyz;
  var T = 1.0;
  if (sd.y > 0.03) {
    let t0 = CU.p0.x / sd.y;
    let t1 = (CU.p0.x + CU.p0.y) / sd.y;
    let dt = (t1 - t0) / 8.0;
    var tau = 0.0;
    for (var i = 0; i < 8; i++) {
      let t = t0 + (f32(i) + 0.5) * dt;
      tau += density(vec3f(xz.x + sd.x * t, sd.y * t, xz.y + sd.z * t), false) * dt;
    }
    T = mix(0.26, 1.0, exp(-tau * CU.p0.z * 0.35));
  }
  textureStore(dst, id, vec4f(T, 0.0, 0.0, 1.0));
}
`;

// ---- the march -------------------------------------------------------------------------------------------------------------------------------------------------
export const CLOUD_MARCH = FRAME_WGSL + ATMO_CORE_WGSL + CLOUD_U + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var noiseTex: texture_3d<f32>;
@group(0) @binding(5) var sampW: sampler;
@group(0) @binding(6) var weatherTex: texture_2d<f32>;
@group(0) @binding(7) var depthTex: texture_depth_multisampled_2d;
@group(0) @binding(8) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(9) var outDist: texture_storage_2d<r32float, write>;
@group(0) @binding(10) var<uniform> CU: CloudU;
` + SKY_RENDER_FUNCS + DENSITY_FUNCS + /* wgsl */ `
fn hg(c: f32, g: f32) -> f32 { let g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }

// where the ray is in the layer: [t0, t1] in km (t1 < t0: never)
fn slab(ro: vec3f, rd: vec3f) -> vec2f {
  let rb = RG + CU.p0.x;
  let rt = RG + CU.p0.x + CU.p0.y;
  let r = length(ro);
  let inner = raySphere(ro, rd, rb);
  let outer = raySphere(ro, rd, rt);
  var t0 = 0.0;
  var t1 = -1.0;
  if (r < rb) {
    // under the layer: from where the ray rises through the base to where it leaves the top
    if (inner.y > 0.0) { t0 = inner.y; t1 = outer.y; }
  } else if (r > rt) {
    // over it: from the top down to the base (or out through the top again, along the horizon)
    if (outer.x > 0.0) { t0 = outer.x; t1 = select(outer.y, inner.x, inner.x > 0.0); }
  } else {
    t0 = 0.0; t1 = select(outer.y, inner.x, inner.x > 0.0);
  }
  return vec2f(t0, t1);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id3: vec3u) {
  let id = id3.xy;
  let hs = vec2u(textureDimensions(outTex));
  if (id.x >= hs.x || id.y >= hs.y) { return; }
  let full = vec2u(textureDimensions(depthTex));
  let px = min(id.xy * 2u + 1u, full - 1u);
  let ndc = vec2f((f32(px.x) + 0.5) / f32(full.x) * 2.0 - 1.0, 1.0 - (f32(px.y) + 0.5) / f32(full.y) * 2.0);
  let dir = normalize(F.camFwd.xyz + ndc.x * F.camRight.xyz + ndc.y * F.camUp.xyz);
  // the distance to the scene along the ray (reverse-Z, infinite: depth = near / view distance); the sky is at infinity
  let z = textureLoad(depthTex, vec2i(px), 0);
  var sceneKm = 1e9;
  if (z > 0.0) { sceneKm = 0.05 / z / max(dot(dir, F.camFwd.xyz), 1e-3) * 0.001; }
  let ro = vec3f(0.0, RG + F.camPos.y * 0.001, 0.0);
  var ts = slab(ro, dir);
  ts.y = min(min(ts.y, sceneKm), CU.p1.w);
  var col = vec3f(0.0);
  var T = 1.0;
  var used = 0.0;
  if (ts.y > ts.x) {
    let camKm = F.camPos.xyz * 0.001;
    let cosT = dot(dir, F.sunDir.xyz);
    // dual-lobe phase: a strong forward lobe (the silver lining against the sun), a weak back lobe
    let phA = mix(hg(cosT, 0.8), hg(cosT, -0.3), 0.3);
    let phB = mix(hg(cosT, 0.4), hg(cosT, -0.15), 0.3);
    let ambTop = skyAtmo(vec3f(0.0, 1.0, 0.0));
    let ambSide = skyAtmo(normalize(vec3f(dir.x, 0.06, dir.z)));
    let sunUp = F.sunDir.y;
    // a jitter of the first step, different from one pixel and one frame to the next (the banding of the steps becomes a fine grain)
    let jit = fract(52.9829189 * fract(dot(vec2f(id.xy) + f32(u32(F.post.z) % 16u) * vec2f(5.3, 7.1), vec2f(0.06711056, 0.00583715))));
    let len = ts.y - ts.x;
    let n = CU.p0.w;
    var dt = max(len / n, 0.02);
    var t = ts.x + dt * jit;
    var wsum = 0.0;
    var tw = 0.0;
    for (var i = 0; i < 160; i++) {
      if (t >= ts.y || T < 0.015) { break; }
      let pr = ro + dir * t;
      let h = length(pr) - RG;
      let p = vec3f(camKm.x + dir.x * t, h, camKm.z + dir.z * t);
      let coarse = density(p, false);
      if (coarse <= 0.0) { t += dt * 2.2; continue; }
      let d = density(p, true);
      if (d > 0.002) {
        let ext = d * CU.p0.z;
        // the light towards the sun: a few steps that grow, the coarse density only
        var tauL = 0.0;
        var sl = 0.035;
        var q = p;
        for (var k = 0; k < i32(CU.p2.x); k++) {
          q += F.sunDir.xyz * sl;
          tauL += density(q, false) * sl;
          sl *= 1.9;
        }
        tauL *= CU.p0.z;
        let hf = clamp((h - CU.p0.x) / CU.p0.y, 0.0, 1.0);
        let sunC = sampleTrans(RG + h, sunUp) * F.sunDir.w;
        // multiple scattering in three octaves (each one less extinct and less peaked), with the 'powder' darkening of thin edges facing the eye
        let powder = 1.0 - exp(-ext * 0.06);
        // (the light that has scattered many times inside a cumulus is nearly isotropic and goes deep: it is what makes the heart of a cloud white, not grey)
        let ms = phA * exp(-tauL) + (0.6 * phB * exp(-tauL * 0.25) + 0.11 * exp(-tauL * 0.07)) * CU.p2.z;
        let sun = sunC * ms * mix(1.0, powder * 2.0, 0.35);
        // the sky's light: from above on the tops, from the sides and the sea under the bases
        let amb = mix(ambSide * 0.55 + ambTop * 0.15, ambTop * 0.9 + ambSide * 0.2, hf) * CU.p2.y * (1.0 - 0.45 * exp(-tauL * 0.4));
        let L = sun + amb;
        let a = 1.0 - exp(-ext * dt);
        col += T * L * a;
        T *= 1.0 - a;
        tw += t * a * T;
        wsum += a;
      }
      // finer steps inside the clouds, coarser in the gaps and further away
      dt = max(len / n, 0.02) * (1.0 + t * 0.01);
      t += dt;
    }
    used = select(ts.x, tw / max(wsum, 1e-4), wsum > 0.0);
    // aerial perspective: a far cloud fades into the haze (the sky and the sea behind it are hazed by their own shaders)
    let fade = exp(-max(used, 0.0) * 0.022 * (0.6 + 0.4 * F.atmo.x));
    col *= fade;
    T = 1.0 - (1.0 - T) * fade;
  }
  textureStore(outTex, id.xy, vec4f(col, T));
  textureStore(outDist, id.xy, vec4f(min(sceneKm, 1e5), 0.0, 0.0, 0.0));
}
`;

// ---- over the image --------------------------------------------------------------------------------------------------------------------------------------------
export const CLOUD_APPLY = /* wgsl */ `
@group(0) @binding(0) var cloudTex: texture_2d<f32>;
@group(0) @binding(1) var cloudDist: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_multisampled_2d;
@group(0) @binding(3) var<uniform> A: vec4f;     // camFwd . (ray) is folded in: x = near, y = 1 / tanX, z = 1 / tanY, w = enabled
struct VO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var o: VO;
  o.pos = vec4f(p, 0.0, 1.0);
  o.ndc = p;
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let px = vec2i(in.pos.xy);
  let z = textureLoad(depthTex, px, 0);
  // the distance of this pixel's scene (km), as the march measured it (the forward distance, divided by the cosine of the ray)
  let ray = sqrt(1.0 + in.ndc.x * in.ndc.x / (A.y * A.y) + in.ndc.y * in.ndc.y / (A.z * A.z));
  let dKm = select(1e5, A.x / max(z, 1e-12) * ray * 0.001, z > 0.0);
  let hs = vec2i(textureDimensions(cloudTex));
  let hp = (in.pos.xy - 1.5) * 0.5;      // (a half-resolution texel i was marched at the centre of full pixel 2i + 1)
  let b = vec2i(floor(hp));
  let f = hp - vec2f(b);
  var acc = vec4f(0.0);
  var wsum = 0.0;
  // bilateral: the four half-resolution neighbours, weighted by the bilinear weights and by how close their scene is to this pixel's
  for (var j = 0; j <= 1; j++) {
    for (var i = 0; i <= 1; i++) {
      let q = clamp(b + vec2i(i, j), vec2i(0), hs - 1);
      let wb = select(1.0 - f.x, f.x, i == 1) * select(1.0 - f.y, f.y, j == 1);
      let dq = textureLoad(cloudDist, q, 0).r;
      let rel = abs(dq - dKm) / max(min(dq, dKm), 0.02);
      let wd = 1.0 / (1.0 + rel * rel * 400.0);
      let w = wb * wd + 1e-5;
      acc += textureLoad(cloudTex, q, 0) * w;
      wsum += w;
    }
  }
  let c = acc / wsum;
  // premultiplied: the scene behind is kept by T (blend: src one, dst src-alpha)
  return vec4f(c.rgb, c.a);
}
`;
