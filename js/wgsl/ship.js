// Warship surface shader. Lit with the same sky / sun / aerial-perspective model as the ocean so
// ships sit in the scene. Everything is procedural (no textures): plating seams, deck planks,
// weathering, wet hull near the waterline, soot and fire glow when damaged.
import { FRAME_WGSL, ATMO_CORE_WGSL, HAZE_WGSL, SHADOW_STRUCT_WGSL, SHADOW_FUNC_WGSL, ENV_MIPS } from './common.js';
import { SKY_RENDER_FUNCS } from './sky.js';

export const SHIP = FRAME_WGSL + ATMO_CORE_WGSL + HAZE_WGSL + SHADOW_STRUCT_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var skyLUT: texture_2d<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var envCube: texture_cube<f32>;
@group(0) @binding(5) var<storage, read> sunVis: array<f32, 4>;
@group(0) @binding(6) var shadowTex: texture_depth_2d;
@group(0) @binding(7) var shadowSamp: sampler_comparison;
@group(0) @binding(8) var<uniform> SH: ShadowU;
` + SHADOW_FUNC_WGSL + SKY_RENDER_FUNCS + /* wgsl */ `
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
};

@vertex fn vs(v: VIn) -> VOut {
  let M = mat4x4f(v.m0, v.m1, v.m2, v.m3);
  let rel = (M * vec4f(v.pos, 1.0)).xyz;
  var o: VOut;
  o.pos = F.viewProj * vec4f(rel, 1.0);
  o.rel = rel;
  o.nrm = normalize((M * vec4f(v.nrm.xyz, 0.0)).xyz);
  o.lnrm = v.nrm.xyz;
  o.local = v.pos;
  o.col = v.col;
  o.ao = v.nrm.w;
  o.tint = v.tint;
  o.misc = v.misc;
  return o;
}

fn srgb2lin(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
fn hash11(p: f32) -> f32 { return fract(sin(p * 127.1) * 43758.5453); }

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

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  if (in.misc.w != 0.0 && (in.local.x - in.misc.z) * in.misc.w < 0.0) { discard; }
  var N = normalize(in.nrm);
  if (!ff) { N = -N; }
  let dist = length(in.rel);
  let V = -in.rel / dist;
  let Ld = F.sunDir.xyz;
  let mat = u32(in.col.a * 255.0 + 0.5);
  if (mat == 2u && in.misc.x < 0.0) { discard; }                 // open canopy in the cockpit view
  var albedo = srgb2lin(in.col.rgb);
  var rough = 0.74;
  var metal = 0.0;
  var emissive = vec3f(0.0);
  var f0 = vec3f(0.035);
  let lp = in.local;
  let fw = max(fwidth(lp.x) + fwidth(lp.y) + fwidth(lp.z), 1e-4);   // local-space pixel footprint
  let up = abs(in.lnrm.y);

  // ---- broad weathering (large scale mottling + vertical rust / water streaks) ----
  let mott = gnoise(vec2f(lp.x * 0.11 + in.misc.y * 13.0, lp.z * 0.11 + lp.y * 0.07));
  let fineN = gnoise(vec2f(lp.x * 1.3 + lp.y * 0.9, lp.z * 1.7 - lp.y * 1.1));
  let streakN = gnoise(vec2f(lp.x * 0.9 + lp.z * 0.9, lp.y * 0.07 + in.misc.y * 7.0));
  var weather = 1.0 + 0.10 * mott + 0.05 * fineN * smoothstep(40.0, 4.0, dist);

  switch (mat) {
    case 5u: {   // hull plating with waterline bands
      let y = lp.y;
      // horizontal strakes and vertical butt joints
      let sy = abs(fract(y / 1.9) - 0.5) * 2.0;
      let sx = abs(fract((lp.x + 1.3) / 7.5) - 0.5) * 2.0;
      let fadeS = 1.0 - smoothstep(0.02, 0.12, fw * 1.9);
      let seam = (smoothstep(0.93, 1.0, sy) * 0.6 + smoothstep(0.985, 1.0, sx) * 0.45) * fadeS;
      weather *= 1.0 - 0.18 * seam;
      // scuttles (portholes): a row of dark discs along the topsides, only resolved when close
      if (abs(in.lnrm.z) > 0.65 && y > 1.6 && y < 6.5) {
        let px = (fract((lp.x + in.misc.y * 3.0) / 3.1) - 0.5) * 3.1;
        let d = length(vec2f(px, y - 3.4));
        let m = (1.0 - smoothstep(0.17, 0.24, d)) * (1.0 - smoothstep(0.08, 0.35, fw));
        weather *= 1.0 - 0.72 * m;
      }
      let rustStreak = smoothstep(0.35, 0.8, streakN) * smoothstep(-0.2, 2.5, y) * 0.35;
      albedo = mix(albedo, albedo * vec3f(1.1, 0.7, 0.5) * 0.9, rustStreak * 0.5);
      // anti-fouling red below the waterline, dark boot topping just above it
      let boot = 1.0 - smoothstep(0.45, 0.55, y);
      let red = 1.0 - smoothstep(-0.7, -0.55, y);
      let bootCol = albedo * 0.22;
      albedo = mix(albedo, bootCol, boot);
      albedo = mix(albedo, vec3f(0.19, 0.05, 0.04), red);
      rough = 0.72;
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
      weather *= 1.0 + 0.08 * mott;
      rough = 0.9;
    }
    case 4u: {   // carrier flight deck: dark non-slip surface with expansion seams
      let sx = abs(fract(lp.x / 14.0) - 0.5) * 2.0;
      let fade = 1.0 - smoothstep(0.1, 0.6, fw * 2.0);
      albedo = albedo * (0.9 + 0.15 * fineN) * (1.0 - 0.3 * smoothstep(0.985, 1.0, sx) * fade);
      rough = 0.7;
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
    default: { rough = 0.74; }
  }
  albedo *= weather;

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
  let shadow = shadowAt(in.rel + N * 0.35);
  let sunE = sunIlluminance() * sunVis[0] * shadow;
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

  // specular: sun GGX + environment reflection
  let H = normalize(V + Ld);
  let a = max(rough * rough, 0.02);
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
  let Fe = fresnelSchlick(nv, mix(f0, albedo, metal));
  col = col * (1.0 - metal * 0.8) + spec + refl * Fe * ao * mix(0.55, 1.0, 1.0 - rough);
  col += emissive;
  col = mix(col, albedo * (sunE * 0.15 + amb) , select(0.0, 0.3, mat == 8u));

  // ---- aerial perspective (same as the ocean) ----
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist * hazeAltFactor(F.camPos.y));
  let hz = normalize(vec3f(-V.x, 0.002, -V.z));
  let fogCol = skyAtmo(hz);
  col = col * T + fogCol * (1.0 - T);
  return vec4f(col, 1.0);
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
