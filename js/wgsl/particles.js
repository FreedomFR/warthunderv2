// Camera-facing particle quads: smoke, fire, spray, tracers, flashes. Premultiplied alpha: smoke /
// spray use alpha, fire / tracers / flashes write alpha 0 so they add light.
import { FRAME_WGSL, FLASH_WGSL, ATMO_CORE_WGSL, HAZE_WGSL, ENV_MIPS } from './common.js';
import { SKY_RENDER_FUNCS } from './sky.js';

export const PARTICLES = FRAME_WGSL + FLASH_WGSL + ATMO_CORE_WGSL + HAZE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var envCube: texture_cube<f32>;
@group(0) @binding(5) var<storage, read> sunVis: array<f32, 4>;
` + SKY_RENDER_FUNCS + /* wgsl */ `
const ENV_MAXMIP: f32 = ${ENV_MIPS - 1}.0;
// how much work a puff of smoke gets (a pipeline constant, see Particles.setDetail): 2 lit as a volume with the haze of the surfaces, 1 the cheap lighting with the haze,
// 0 the cheap lighting, two octaves of noise and no haze (what a phone can fill)
override SMOKE_DETAIL: u32 = 2u;

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
  var size = v.a.w;
  var col = v.col;
  // a tracer far off is thinner than a pixel: it is drawn a pixel wide and dimmer by as much, so that it shows as a steady spark instead of flickering in and out
  if (u32(v.misc.y + 0.5) == 3u) {
    let px = length(p) * 0.0011;
    if (px > size) { col = vec4f(col.rgb, col.a * size / px); size = px; }
  }
  if (v.dir.w > 0.0) {
    let axis = normalize(v.dir.xyz);
    let view = normalize(p);
    var side = cross(axis, view);
    let sl = length(side);
    side = select(right, side / sl, sl > 1e-4);
    // x runs along the streak (centre at p), y across it; a streak coming at the lens is cut so that its near end stays well off it (it would open into a cone)
    var len = v.dir.w;
    if (u32(v.misc.y + 0.5) == 3u) { len = min(len, length(v.a.xyz) * 0.6); }
    // the glow of a shell (misc.z = 1) seen end on, going away or coming at the lens: its whole length would pile up in one bright point (a salvo of them, a
    // bouquet of stars); a shell has no tracer, what is seen is the heat haze along its path, which end on is nothing
    if (v.misc.z > 0.5) { col = vec4f(col.rgb, col.a * smoothstep(0.1, 0.45, sl)); }
    p += axis * (c.x * len * 0.5) + side * (c.y * size);
  } else {
    let cr = cos(v.misc.x); let sr = sin(v.misc.x);
    let q = vec2f(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
    p += (right * q.x + up * q.y) * size;
  }
  var o: VOut;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.uv = c;
  o.col = col;
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

// the height field of a puff of smoke: three octaves of value noise (its gradient bends the pseudo-normal that the lighting uses)
fn smokeH(q: vec2f) -> f32 {
  return vnoise(q) * 0.5 + vnoise(q * 2.1 + vec2f(5.0, 2.0)) * 0.3 + vnoise(q * 4.4 + vec2f(9.0, 7.0)) * 0.2;
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
      var q = p;
      var n = 0.0;
      if (SMOKE_DETAIL >= 1u) {
        let wv = vec2f(vnoise(p * 1.4 + vec2f(3.1, 1.7)), vnoise(p * 1.4 + vec2f(8.7, 4.3))) - vec2f(0.5);
        q = p + wv * 1.7;
        n = smokeH(q);
      } else {
        n = vnoise(q) * 0.65 + vnoise(q * 2.3 + vec2f(5.0, 2.0)) * 0.35;      // (two octaves, no domain warp: a phone fills a lot of smoke)
      }
      let r = d / (0.7 + 0.42 * n);
      let dens = smoothstep(1.0, 0.3, r) * (0.5 + 0.75 * n);
      alpha = clamp(dens, 0.0, 1.0) * in.col.a * smoothstep(0.0, 0.05, in.misc.w);      // (it comes in over the first part of its life: smoke does not pop out of the flames)
      let sunE = sunIlluminance() * sunVis[0];
      if (SMOKE_DETAIL >= 2u) {
        // a normal for the puff: a dome facing the lens, bent by the slope of the noise, turned to the screen with the sprite and then to the world;
        // the sun lights it softly (smoke scatters: no hard terminator), the sky and the sea light it from its own side (a pale top, a dark underside
        // with the bounce of the water), and looking towards the sun its edges glow
        let gx = smokeH(q + vec2f(0.12, 0.0)) - n;
        let gy = smokeH(q + vec2f(0.0, 0.12)) - n;
        let dome = sqrt(max(1.0 - d * d, 0.05));
        let nl = normalize(vec3f(in.uv.x - gx * 5.0, in.uv.y - gy * 5.0, dome));
        let cr = cos(in.misc.x); let sr = sin(in.misc.x);
        let toCam = -normalize(in.rel);
        let nw = normalize(normalize(F.camRight.xyz) * (nl.x * cr - nl.y * sr) + normalize(F.camUp.xyz) * (nl.x * sr + nl.y * cr) + toCam * nl.z);
        let Ls = normalize(F.sunDir.xyz);
        let wrapL = clamp((dot(nw, Ls) + 0.55) / 1.55, 0.0, 1.0);
        let towardSun = pow(max(dot(normalize(in.rel), Ls), 0.0), 6.0);
        let skyN = textureSampleLevel(envCube, sampC, nw, ENV_MAXMIP - 2.0).rgb;
        // (and the flash of a salvo: the smoke round the fireball lit from inside, orange)
        let lit = sunE * 0.085 * (0.10 + 0.95 * wrapL) * mix(0.6, 1.0, n) + sunE * 0.05 * towardSun * (1.0 - 0.6 * d) + skyN * 0.95 + flashIrr(in.rel, vec3f(0.0)) * 0.09 * mix(0.6, 1.0, n);
        rgb = rgb * lit * mix(0.78, 1.12, smoothstep(0.1, 0.9, d));
      } else {
        // the cheap lighting: light comes from the sun side of the screen, a bright rim facing it, a dark body, a shaded far side
        let sd = vec2f(dot(normalize(F.sunDir.xyz), normalize(F.camRight.xyz)), dot(normalize(F.sunDir.xyz), normalize(F.camUp.xyz)));
        let facing = clamp(0.5 + 0.9 * dot(in.uv, sd) * (0.4 + n), 0.0, 1.0);
        let amb = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP - 2.0).rgb;
        let lit = sunE * 0.085 * (0.25 + 0.95 * facing) * mix(0.55, 1.0, n) + amb * (0.55 + 0.4 * facing) + flashIrr(in.rel, vec3f(0.0)) * 0.09 * mix(0.6, 1.0, n);
        rgb = rgb * lit * mix(0.7, 1.15, smoothstep(0.1, 0.9, d));
      }
      // young dark smoke over a fire is lit from below by the flames: an orange base that fades in a second or two (the dark colours only)
      let dark = clamp(1.0 - dot(in.col.rgb, vec3f(0.33)) * 3.0, 0.0, 1.0);
      rgb += vec3f(1.0, 0.36, 0.08) * 0.55 * dark * (1.0 - smoothstep(0.0, 0.1, in.misc.w)) * (1.0 - 0.5 * d);
    }
    case 1u: {   // fire / glow (additive)
      // (the pattern climbs: its coordinate falls with the time, so that the detail rises with the hot gas instead of sinking)
      let n = vnoise(in.uv * 3.0 + vec2f(seed * 9.0, -F.camPos.w * 2.4));
      add = pow(smoothstep(1.0, 0.0, d), 1.7) * (0.65 + 0.7 * n) * in.col.a;
    }
    case 6u: {   // a tongue of flame: a teardrop that narrows to a flickering tip, eroded by noise that rises faster than the flame; hot at the foot
      let age = clamp(in.misc.w, 0.0, 1.0);
      let tt = F.camPos.w;
      let y01 = in.uv.y * 0.5 + 0.5;
      let p = vec2f(in.uv.x * 1.7 + seed * 13.0, y01 * 2.6 - tt * (2.4 + seed * 1.6) + seed * 7.0);
      let warp = vnoise(p * 1.5 + vec2f(3.0, -tt * 0.9)) - 0.5;
      let n = vnoise(p + vec2f(warp * 1.1, 0.0)) * 0.6 + vnoise(p * 2.4 + vec2f(5.0, -tt * 3.3)) * 0.4;
      let halfW = pow(max(1.0 - y01, 0.0), 0.62) * 0.8 + 0.05;
      let xr = abs(in.uv.x + warp * 0.55 * y01) / halfW;
      let tip = smoothstep(1.0, 0.45, y01 + (0.75 - n) * 0.5 * y01);
      let body = smoothstep(1.0, 0.15, xr) * tip * smoothstep(0.0, 0.12, y01);
      // the colour runs from a yellow-white foot through orange to a dark red tip (the tint of the particle, which cools with its age, scales it)
      var hc = mix(vec3f(1.0, 0.8, 0.4), vec3f(1.0, 0.42, 0.08), smoothstep(0.0, 0.5, y01));
      hc = mix(hc, vec3f(0.5, 0.07, 0.02), smoothstep(0.45, 1.0, y01));
      rgb = hc * in.col.rgb;
      add = body * (0.35 + 0.8 * n) * in.col.a;
    }
    case 2u: {   // water spray: whiter, crisper
      let n = vnoise(in.uv * 3.5 + vec2f(seed * 13.0, seed * 2.0));
      let n2 = vnoise(in.uv * 8.0 + vec2f(seed * 5.0, seed * 23.0));
      alpha = smoothstep(1.0, 0.5, d) * clamp(0.2 + 0.9 * n + 0.5 * (n2 - 0.5), 0.0, 1.0) * in.col.a;
      let sunE = sunIlluminance() * sunVis[0];
      let amb = textureSampleLevel(envCube, sampC, vec3f(0.0, 1.0, 0.0), ENV_MAXMIP - 2.0).rgb;
      // lit from the sun's side: the edge facing it is bright, the far side a little shaded
      let sd2 = vec2f(dot(normalize(F.sunDir.xyz), normalize(F.camRight.xyz)), dot(normalize(F.sunDir.xyz), normalize(F.camUp.xyz)));
      let face = clamp(0.55 + 0.7 * dot(in.uv, sd2), 0.0, 1.3);
      rgb = rgb * (amb * 1.15 + sunE * 0.1 * face + flashIrr(in.rel, vec3f(0.0)) * 0.1) * 1.25;
    }
    case 3u: {   // tracer streak (additive): a white-hot head in a coloured glow, the tail fading behind it
      let along = in.uv.x * 0.5 + 0.5;
      let across = max(1.0 - abs(in.uv.y), 0.0);
      let head = pow(along, 7.0) * pow(across, 5.0);
      rgb = mix(rgb, vec3f(1.0, 0.9, 0.75), clamp(head * 0.45, 0.0, 0.45));
      add = (pow(across, 2.2) * pow(along, 2.5) * 0.8 + head * 0.6) * in.col.a;
      // one that passes within a few metres of the lens is a quick dim streak, not a bar across the screen
      add = add * smoothstep(0.8, 9.0, dist);
    }
    case 7u: {   // the blur of a propeller seen from the cockpit: a faint darkening, the blades as soft arcs that turn, the tips a little brighter (misc.x: the turn, misc.z: the blades)
      let ang = atan2(in.uv.y, in.uv.x) + in.misc.x;
      let streak = 0.5 + 0.5 * cos(ang * max(in.misc.z, 2.0));
      let rad = smoothstep(1.0, 0.94, d) * smoothstep(0.06, 0.25, d);
      alpha = (0.035 + 0.07 * pow(streak, 3.0)) * rad * in.col.a + 0.18 * (1.0 - smoothstep(0.05, 0.12, d)) * in.col.a;
      rgb = mix(in.col.rgb, vec3f(0.55, 0.5, 0.35), smoothstep(0.9, 0.98, d) * 0.6);
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
  // soft contact with the sea: a billboard that dips under the surface would be cut along a straight line by the depth test,
  // so its alpha fades out over the last stretch above the water (tracer streaks excepted)
  if (kind != 3u) {
    let hy = F.camPos.y + in.rel.y + normalize(F.camUp.xyz).y * in.uv.y * in.size;
    let soft = smoothstep(0.0, max(1.2, in.size * 0.45), hy + 0.5);
    alpha = alpha * soft;
    add = add * soft;
  }
  // aerial perspective
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist * hazeAltFactor(F.camPos.y));
  var out = vec3f(0.0);
  if (add > 0.0) {
    out = rgb * add * T;
    return vec4f(out, 0.0);
  }
  var fogCol = vec3f(0.0);
  var hazeK = 0.0;
  if (SMOKE_DETAIL >= 1u) { fogCol = skyAtmo(normalize(vec3f(in.rel.x, 0.002, in.rel.z))); hazeK = 1.0; }
  let a = alpha * near;
  // (most of a puff's quad is edge: what would add nothing is not blended at all, which is what fills a phone)
  if (a * occl < 0.004) { discard; }
  out = (rgb * T + fogCol * (1.0 - T) * hazeK) * a;
  return vec4f(out, a * occl);
}
`;
