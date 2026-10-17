// Camera-facing particle quads: smoke, fire, spray, tracers, flashes. Premultiplied alpha: smoke /
// spray use alpha, fire / tracers / flashes write alpha 0 so they add light.
import { FRAME_WGSL, ATMO_CORE_WGSL, ENV_MIPS } from './common.js';
import { SKY_RENDER_FUNCS } from './sky.js';

export const PARTICLES = FRAME_WGSL + ATMO_CORE_WGSL + /* wgsl */ `
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

fn hash21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
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
  // never let a huge billboard pop in front of the lens
  let near = smoothstep(in.size * 0.15, in.size * 0.9 + 2.0, dist);
  switch (kind) {
    case 0u: {   // smoke / mist: soft noisy puff, lit by sun and sky
      let n = vnoise(in.uv * 2.4 + vec2f(seed * 17.0, seed * 5.0)) * 0.6 + vnoise(in.uv * 5.1 + vec2f(seed * 3.0, 11.0)) * 0.4;
      let shape = smoothstep(1.0, 0.25, d);
      alpha = shape * shape * (0.45 + 0.8 * n) * in.col.a;
      let sunE = sunIlluminance() * sunVis[0];
      let amb = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP - 2.0).rgb;
      let lit = sunE * 0.07 * (0.55 + 0.45 * (1.0 - in.uv.y * 0.5)) + amb * 0.95;
      rgb = rgb * lit;
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
    default: {   // flash (additive)
      add = pow(smoothstep(1.0, 0.0, d), 2.4) * in.col.a;
    }
  }
  // aerial perspective
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist);
  var out = vec3f(0.0);
  if (add > 0.0) {
    out = rgb * add * T;
    return vec4f(out, 0.0);
  }
  let hz = normalize(vec3f(in.rel.x, 0.002, in.rel.z));
  let fogCol = skyAtmo(hz);
  let a = alpha * near;
  out = (rgb * T + fogCol * (1.0 - T) * 0.0) * a;
  return vec4f(out, a);
}
`;
