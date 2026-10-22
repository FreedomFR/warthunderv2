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
import { FRAME_WGSL, ATMO_CORE_WGSL } from './common.js';
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
fn remap(x: f32, a: f32, b: f32, c: f32, d: f32) -> f32 { return c + (x - a) / (b - a) * (d - c); }
// the Worley fbm of the detail: three overlapping octave sums, as in Hillaire's TileableVolumeNoise
fn worleyFbm(u: vec3f, c: i32, seed: u32) -> f32 {
  let n = vec4f(1.0 - worley(u * f32(c), c, seed), 1.0 - worley(u * f32(c * 2), c * 2, seed + 1u), 1.0 - worley(u * f32(c * 4), c * 4, seed + 2u), 1.0 - worley(u * f32(c * 8), c * 8, seed + 3u));
  let f = vec3f(dot(n.xyz, vec3f(0.625, 0.25, 0.125)), dot(n.yzw, vec3f(0.625, 0.25, 0.125)), dot(n.zw, vec2f(0.75, 0.25)));
  return dot(f, vec3f(0.625, 0.25, 0.125));
}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= S || id.y >= S || id.z >= S) { return; }
  let u = (vec3f(id) + 0.5) / f32(S);
  // the shape (r): a Perlin fbm whose valleys are filled by Worley cells (the billows of a cumulus), then cut by a second Worley fbm
  var pf = 0.0;
  var a = 0.5;
  var per = 8;
  for (var o = 0; o < 3; o++) { pf += a * perlin(u * f32(per), per, 1u + u32(o)); a *= 0.5; per *= 2; }
  pf = clamp(pf * 1.1 + 0.5, 0.0, 1.0);
  let wf = dot(vec3f(1.0 - worley(u * 8.0, 8, 20u), 1.0 - worley(u * 32.0, 32, 21u), 1.0 - worley(u * 56.0, 56, 22u)), vec3f(0.625, 0.25, 0.125));
  let pw = remap(pf, 0.0, 1.0, wf, 1.0);
  let shape = clamp(remap(pw, worleyFbm(u, 4, 30u) - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  // the detail (g): a finer Worley fbm (sampled at a smaller tile); b: a second one, offset, for the shadows' softer edges
  textureStore(dst, id, vec4f(shape, worleyFbm(u, 2, 40u), worleyFbm(u, 4, 60u), 1.0));
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
  // a field of cumulus is separate clouds: cells of 1-3 km (Worley, jittered) break the coverage into heaps of different sizes, with clear sky between them
  let t = F.cloudP.w;
  let cq = q / 1.7 + vec2f(t * 0.0023, t * 0.0007);
  let ci = floor(cq);
  var d1 = 9.0;
  var sz = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = ci + vec2f(f32(i), f32(j));
      let h = hashGrad(vec2i(c) + vec2i(91, 37));
      let r = 0.55 + 0.45 * hashGrad(vec2i(c) + vec2i(13, 71)).x;          // the size of this cell's cloud
      let dd = length(c + 0.5 + h * 0.38 - cq) / r;
      if (dd < d1) { d1 = dd; sz = r; }
    }
  }
  let cell = clamp(1.0 - d1 * 0.95, 0.0, 1.0);
  let lw = clamp(cov * (0.25 + 0.95 * cell) + gnoise(q * 1.3 + vec2f(2.7, 8.1)) * 0.12, 0.0, 1.0);
  // r: the local weather, g: how tall the clouds grow there (the big cells in the cloudy regions tower; one height per cell: varying it across a cell made cones), b: the coverage alone
  let tall = clamp(0.15 + 0.85 * cov * sz + gnoise(q * 0.11 + vec2f(5.1, 2.3)) * 0.2, 0.12, 1.0);
  textureStore(dst, id.xy, vec4f(lw, tall, cov, 1.0));
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

fn remap01(x: f32, a: f32, b: f32) -> f32 { return clamp((x - a) / (b - a), 0.0, 1.0); }

// p: world position (km, y = height above the sea); detail: with the eroding detail noise (near: it is only resolved there); returns the density 0..1.
// After Schneider (Nubis, 2015-2017) and @takram/three-clouds: the local weather, rounded towards the top of each cloud (a semicircle in a biased height, so
// that the base is flat and the top a dome), turned into a density by the coverage with a soft edge, eroded by the shape noise (the billows), then by
// the detail: billowy cauliflower at the top, wispy at the base.
fn density(p: vec3f, detail: bool) -> f32 {
  let hf = (p.y - CU.p0.x) / CU.p0.y;
  if (hf < 0.0 || hf > 1.0) { return 0.0; }
  let w = weatherAt(p.xz);
  let top = 0.25 + 0.75 * w.y;
  if (hf >= top || w.x < 0.02) { return 0.0; }
  let hn = hf / top;                                   // height within this cloud
  let x = pow(hn, 0.35) * 2.0 - 1.0;
  let hs = 1.0 - x * x;
  let cov = CU.p1.z;
  let fac = 1.0 - cov * hs;
  // the coverage: soft, it falls off from the heart of the cell to its edge, and with the height
  let base = remap01(mix(w.x, 1.0, 0.4), fac, fac + 0.4);
  if (base <= 0.0) { return 0.0; }
  // the clouds drift with the wind and boil slowly
  let t = F.cloudP.w;
  let wind = vec3f(F.windP[0].x, 0.0, F.windP[0].y) * t * 0.004 + vec3f(0.0, -t * 0.0004, 0.0);
  let n = textureSampleLevel(noiseTex, sampW, (p + wind) / CU.p1.x, 0.0).r;
  // the shape noise drawn through the coverage (Schneider): in the heart of a cloud most of it is cloud, towards its edges only its billows are, so that the
  // outline of a cumulus is heaps of rounded lumps, not the smooth surface of the coverage
  var d = remap01(n, 1.0 - base, 1.0) * base;
  if (detail && d > 0.0) {
    let dn = textureSampleLevel(noiseTex, sampW, (p + wind * 1.3) / CU.p1.y, 0.0).g;
    let m = mix(pow(dn, 6.0), 1.0 - dn, remap01(hn, 0.2, 0.4));
    d = remap01(d * 2.0, m * 0.5, 1.0);
  }
  // denser up in the cloud than at its ragged base
  return clamp(d * (0.3 + 0.7 * hn), 0.0, 1.0);
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
@group(0) @binding(9) var outDist: texture_storage_2d<rg32float, write>;
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
    let ambTop = skyAtmo(vec3f(0.0, 1.0, 0.0));
    let ambSide = skyAtmo(normalize(vec3f(dir.x, 0.06, dir.z)));
    let sunUp = F.sunDir.y;
    // the first step jittered, differently from one pixel and one frame to the next (interleaved gradient noise moved by the golden ratio): the banding
    // of the steps becomes a grain, which the temporal filter (CLOUD_RESOLVE) averages out
    let jit = fract(52.9829189 * fract(dot(vec2f(id.xy), vec2f(0.06711056, 0.00583715))) + F.post.z * 0.61803399);
    // steps of 60 m near the camera, growing with the distance (a cloud far away is small on the screen); longer in clear air
    let step0 = 0.06 * CU.p2.w;
    var t = ts.x + step0 * (1.0 + ts.x * 0.02) * jit;
    var wsum = 0.0;
    var tw = 0.0;
    let maxI = i32(CU.p0.w);
    for (var i = 0; i < maxI; i++) {
      if (t >= ts.y || T < 0.01) { break; }
      let dt = step0 * (1.0 + t * 0.02);
      let pr = ro + dir * t;
      let h = length(pr) - RG;
      let p = vec3f(camKm.x + dir.x * t, h, camKm.z + dir.z * t);
      let coarse = density(p, false);
      if (coarse <= 0.0) { t += dt * 2.5; continue; }
      // (the detail is only resolved near the camera: further away it would alias into noise)
      let d = select(coarse, density(p, true), t < 22.0);
      if (d > 0.003) {
        let ext = d * CU.p0.z;
        // the optical depth towards the sun: steps that double, the shape without its detail
        var tauL = 0.0;
        var sl = 0.04;
        // (a jitter of its own: the same as the view ray's lines the two marches up in the plane of the sun, a bright band through the clouds)
        let jl = fract(jit * 7.31 + f32(i) * 0.6180339 + 0.37);
        var q = p + F.sunDir.xyz * sl * jl;
        for (var k = 0; k < i32(CU.p2.x); k++) {
          q += F.sunDir.xyz * sl;
          tauL += density(q, false) * sl;
          sl *= 2.0;
        }
        tauL *= CU.p0.z;
        let hf = clamp((h - CU.p0.x) / CU.p0.y, 0.0, 1.0);
        let sunC = sampleTrans(RG + h, sunUp) * F.sunDir.w;
        // multiple scattering in octaves (Wrenninge, Oz the Great and Powerful): each octave less extinct, weaker and less peaked. It is what makes the
        // heart of a cumulus white and its thick base grey, not the flat white of a constant term
        var ms = 0.0;
        var ca = 1.0;
        for (var o = 0; o < 6; o++) {
          let g = 0.8 * ca;
          ms += ca * exp(-tauL * ca) * mix(hg(cosT, g), hg(cosT, -0.3 * ca), 0.25);
          ca *= 0.5;
        }
        var L = sunC * ms * CU.p2.z;
        // the sky's light: more on the tops than under the base (a crude gradient, better than none in the shadows)
        L += mix(ambSide * 0.6 + ambTop * 0.1, ambTop * 0.75 + ambSide * 0.25, hf) * CU.p2.y * (0.45 + 0.55 * hf);
        // powder: the thin edges facing the eye are darker (little light has scattered into them), less so against the sun
        L *= 1.0 - 0.75 * exp(-ext * 0.12) * (1.0 - 0.6 * smoothstep(0.4, 1.0, cosT));
        let a = 1.0 - exp(-ext * dt);
        col += T * L * a;
        T *= 1.0 - a;
        tw += t * a * T;
        wsum += a * T;
      }
      t += dt;
    }
    used = select(ts.x, tw / max(wsum, 1e-4), wsum > 1e-4);
    // aerial perspective: a far cloud fades into the haze (the sky and the sea behind it are hazed by their own shaders)
    let fade = exp(-max(used, 0.0) * 0.022 * (0.6 + 0.4 * F.atmo.x));
    col *= fade;
    T = 1.0 - (1.0 - T) * fade;
  }
  textureStore(outTex, id.xy, vec4f(col, T));
  // r: the scene's distance (the upsampling), g: the clouds' (the reprojection of the temporal filter; the far sky when there are none)
  textureStore(outDist, id.xy, vec4f(min(sceneKm, 1e5), select(min(sceneKm, 300.0), used, T < 0.98), 0.0, 0.0));
}
`;

// ---- the temporal filter -----------------------------------------------------------------------------------------------------------------------------------------
// Each frame marches with a new jitter: the result of the frames before, reprojected to where the clouds were then (with the distance of the clouds that the march
// measured), is blended with this frame's, held within the range of this frame's neighbours (no ghost of a cloud that is not there any more).
export const CLOUD_RESOLVE = /* wgsl */ `
struct RU {
  prevPos: vec4f,     // the previous camera's position (km) relative to this one's; w = blend of the new frame (1: no history)
  prevR: vec4f,       // the previous camera's right axis / tan(fovX/2)
  prevU: vec4f,       // up / tan(fovY/2)
  prevF: vec4f,       // forward
  curR: vec4f,        // this frame's camera: right * tan(fovX/2), up * tan(fovY/2), forward (as the march builds its rays)
  curU: vec4f,
  curF: vec4f,
};
@group(0) @binding(0) var curTex: texture_2d<f32>;
@group(0) @binding(1) var distTex: texture_2d<f32>;
@group(0) @binding(2) var histTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> R: RU;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id3: vec3u) {
  let id = vec2i(id3.xy);
  let hs = vec2i(textureDimensions(curTex));
  if (id.x >= hs.x || id.y >= hs.y) { return; }
  let c = textureLoad(curTex, id, 0);
  // the range of this frame's neighbours (3x3), a little widened
  var lo = c;
  var hi = c;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) { continue; }
      let q = textureLoad(curTex, clamp(id + vec2i(i, j), vec2i(0), hs - 1), 0);
      lo = min(lo, q); hi = max(hi, q);
    }
  }
  let mid = (lo + hi) * 0.5;
  lo = mid + (lo - mid) * 1.1;
  hi = mid + (hi - mid) * 1.1;
  var k = R.prevPos.w;
  var outv = c;
  if (k < 0.999) {
    // where this texel's cloud was on the previous frame's screen
    let full = vec2f(hs) * 2.0;
    let px = vec2f(id) * 2.0 + 1.5;
    let ndc = vec2f(px.x / full.x * 2.0 - 1.0, 1.0 - px.y / full.y * 2.0);
    let dir = normalize(R.curF.xyz + ndc.x * R.curR.xyz + ndc.y * R.curU.xyz);
    let dk = textureLoad(distTex, id, 0).g;
    // a near cloud moves across the screen with the camera (parallax) and its depth is a mean through a soft volume: trust the history less there
    k = max(k, clamp(length(R.prevPos.xyz) / max(dk, 0.01) * 150.0, 0.0, 1.0));
    let rel = dir * dk - R.prevPos.xyz;
    let z = dot(rel, R.prevF.xyz);
    if (z > 1e-4) {
      let pn = vec2f(dot(rel, R.prevR.xyz), dot(rel, R.prevU.xyz)) / z;
      let uv = vec2f(pn.x * 0.5 + 0.5, 0.5 - pn.y * 0.5);
      if (all(uv > vec2f(0.0)) && all(uv < vec2f(1.0))) {
        let h = clamp(textureSampleLevel(histTex, samp, uv, 0.0), lo, hi);
        outv = mix(h, c, k);
      }
    }
  }
  textureStore(outTex, id, outv);
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
