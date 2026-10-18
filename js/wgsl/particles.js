// Camera-facing particle quads: smoke, fire, spray, tracers, flashes. Premultiplied alpha: smoke /
// spray use alpha, fire / tracers / flashes write alpha 0 so they add light.
import { FRAME_WGSL, ATMO_CORE_WGSL, HAZE_WGSL, ENV_MIPS } from './common.js';
import { SKY_RENDER_FUNCS } from './sky.js';

export const PARTICLES = FRAME_WGSL + ATMO_CORE_WGSL + HAZE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var envCube: texture_cube<f32>;
@group(0) @binding(5) var<storage, read> sunVis: array<f32, 4>;
` + SKY_RENDER_FUNCS + /* wgsl */ `
const ENV_MAXMIP: f32 = ${ENV_MIPS - 1}.0;

struct VIn {
  @builtin(vertex_index) vi: u32,
  @location(0) a: vec4f,      // camera-relative position, size (m)
  @location(1) col: vec4f,    // rgb, alpha
  @location(2) dir: vec4f,    // streak axis (world), stretch length (m); 0 = billboard
  @location(3) misc: vec4f,   // rotation, kind, seed, unused
};
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
  @location(2) misc: vec4f,
  @location(3) rel: vec3f,
  @location(4) size: f32,
};

@vertex fn vs(v: VIn) -> VOut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[v.vi];
  let right = normalize(F.camRight.xyz);
  let up = normalize(F.camUp.xyz);
  var p = v.a.xyz;
  let size = v.a.w;
  if (v.dir.w > 0.0) {
    let axis = normalize(v.dir.xyz);
    let view = normalize(p);
    var side = cross(axis, view);
    let sl = length(side);
    side = select(right, side / sl, sl > 1e-4);
    // x runs along the streak (centre at p), y across it
    p += axis * (c.x * v.dir.w * 0.5) + side * (c.y * size);
  } else {
    let cr = cos(v.misc.x); let sr = sin(v.misc.x);
    let q = vec2f(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
    p += (right * q.x + up * q.y) * size;
  }
  var o: VOut;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.uv = c;
  o.col = v.col;
  o.misc = v.misc;
  o.rel = v.a.xyz;
  o.size = size;
  return o;
}

// integer hash of a lattice point (exact on every rasteriser, unlike fract(sin()) hashes)
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn hash21(p: vec2f) -> f32 {
  let a = u32(i32(floor(p.x) + 8192.0));
  let b = u32(i32(floor(p.y) + 8192.0));
  return f32(pcg(a * 1664525u + pcg(b + 1013904223u)) >> 8u) * (1.0 / 16777216.0);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let kind = u32(in.misc.y + 0.5);
  let dist = length(in.rel);
  let seed = in.misc.z;
  let d = length(in.uv);
  var rgb = in.col.rgb;
  var alpha = 0.0;
  var add = 0.0;
  var occl = 1.0;
  // never let a huge billboard pop in front of the lens
  let near = smoothstep(in.size * 0.15, in.size * 0.9 + 2.0, dist);
  switch (kind) {
    case 0u: {   // smoke / mist: billowy puff with a noise-eroded edge, lit by the sun and the sky
      let p = in.uv * 2.1 + vec2f(seed * 17.0, seed * 5.0);
      let wv = vec2f(vnoise(p * 1.4 + vec2f(3.1, 1.7)), vnoise(p * 1.4 + vec2f(8.7, 4.3))) - vec2f(0.5);
      let q = p + wv * 1.7;
      let n = vnoise(q) * 0.5 + vnoise(q * 2.1 + vec2f(5.0, 2.0)) * 0.3 + vnoise(q * 4.4 + vec2f(9.0, 7.0)) * 0.2;
      let r = d / (0.7 + 0.42 * n);
      let dens = smoothstep(1.0, 0.3, r) * (0.5 + 0.75 * n);
      alpha = clamp(dens, 0.0, 1.0) * in.col.a;
      // light comes from the sun side of the screen: bright rim facing it, dark body, shaded far side
      let sd = vec2f(dot(normalize(F.sunDir.xyz), normalize(F.camRight.xyz)), dot(normalize(F.sunDir.xyz), normalize(F.camUp.xyz)));
      let facing = clamp(0.5 + 0.9 * dot(in.uv, sd) * (0.4 + n), 0.0, 1.0);
      let sunE = sunIlluminance() * sunVis[0];
      let amb = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP - 2.0).rgb;
      let lit = sunE * 0.085 * (0.25 + 0.95 * facing) * mix(0.55, 1.0, n) + amb * (0.55 + 0.4 * facing);
      rgb = rgb * lit * mix(0.7, 1.15, smoothstep(0.1, 0.9, d));
    }
    case 1u: {   // fire / glow (additive)
      let n = vnoise(in.uv * 3.0 + vec2f(seed * 9.0, F.camPos.w * 2.0));
      add = pow(smoothstep(1.0, 0.0, d), 1.7) * (0.65 + 0.7 * n) * in.col.a;
    }
    case 2u: {   // water spray: whiter, crisper
      let n = vnoise(in.uv * 3.5 + vec2f(seed * 13.0, seed * 2.0));
      alpha = smoothstep(1.0, 0.45, d) * (0.5 + 0.6 * n) * in.col.a;
      let sunE = sunIlluminance() * sunVis[0];
      let amb = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP - 2.0).rgb;
      rgb = rgb * (amb * 1.1 + sunE * 0.09);
    }
    case 3u: {   // tracer streak (additive): hot head, fading tail
      let along = in.uv.x * 0.5 + 0.5;
      let across = 1.0 - abs(in.uv.y);
      add = pow(max(across, 0.0), 2.2) * pow(along, 2.5) * in.col.a;
    }
    case 5u: {   // fireball lobe: opaque billowing gas, white-hot core, orange body, dark red-brown rim; cools with age (misc.w)
      let age = clamp(in.misc.w, 0.0, 1.0);
      let p = in.uv * 1.8 + vec2f(seed * 31.0, seed * 11.0);
      let wv = vec2f(vnoise(p * 1.6 + vec2f(1.3, 4.1)), vnoise(p * 1.6 + vec2f(6.2, 2.9))) - vec2f(0.5);
      let q = p + wv * 1.5;
      let n = vnoise(q) * 0.5 + vnoise(q * 2.2 + vec2f(4.0, 8.0)) * 0.3 + vnoise(q * 4.7 + vec2f(2.0, 5.0)) * 0.2;
      let r = d / (0.7 + 0.36 * n);
      let body = smoothstep(1.0, 0.72, r);
      let heat = clamp((1.0 - r * 0.75) * (0.55 + 0.95 * n) * (1.0 - 0.65 * age) + 0.14, 0.0, 1.4);
      var c = vec3f(0.2, 0.075, 0.035);
      c = mix(c, vec3f(0.62, 0.17, 0.04), smoothstep(0.12, 0.34, heat));
      c = mix(c, vec3f(1.0, 0.36, 0.06), smoothstep(0.30, 0.55, heat));
      c = mix(c, vec3f(1.0, 0.70, 0.2), smoothstep(0.52, 0.82, heat));
      c = mix(c, vec3f(1.0, 0.95, 0.72), smoothstep(0.80, 1.15, heat));
      let glow = 0.35 + 7.5 * smoothstep(0.45, 1.2, heat);
      rgb = c * glow * in.col.rgb;
      alpha = body * mix(0.5, 0.98, smoothstep(0.1, 0.45, heat)) * clamp(in.col.a, 0.0, 1.0);
      occl = mix(1.0, 0.42, smoothstep(0.3, 0.85, heat));      // the hot gas adds its light instead of hiding the lobes behind it
    }
    default: {   // flash (additive)
      add = pow(smoothstep(1.0, 0.0, d), 2.4) * in.col.a;
    }
  }
  // aerial perspective
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist * hazeAltFactor(F.camPos.y));
  var out = vec3f(0.0);
  if (add > 0.0) {
    out = rgb * add * T;
    return vec4f(out, 0.0);
  }
  let hz = normalize(vec3f(in.rel.x, 0.002, in.rel.z));
  let fogCol = skyAtmo(hz);
  let a = alpha * near;
  out = (rgb * T + fogCol * (1.0 - T) * 0.0) * a;
  return vec4f(out, a * occl);
}
`;
