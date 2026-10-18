# Changelog

## Unreleased — fidelity batch 1 (Iowa, Yamato, Bismarck, Essex)

### Guns
- Mount families with measured proportions in `js/game/model/mounts.js`: 16"/50 Mk 7 triple turret (Iowa), 46 cm Type 94 triple (Yamato), 38 cm Drh LC/34 twin (Bismarck), 5"/38 Mk 28 twin and Mk 30 single (Essex, Iowa secondaries). Trunnion height, barrel spacing, sleeve, recoil rod, barbette radius and muzzle distance come from the reference photographs.
- The simulation fires from the real muzzle of every barrel (`mountDims`) and the recoil follows a fast-out / slow-return curve (`recoilCurve`); the hull heels away from a broadside in proportion to the shell energy.

### Muzzle blast
- New `FIREBALL` particle kind: opaque billowing gas, white-hot core, orange body and dark rim, cooling with age. Flash, jet, glow, lobes, smoke ring, powder cloud, foam sheet and spray, scaled by the calibre (`effects.muzzle` / `blast`).
- Particles fade out near the sea surface instead of being cut along a straight line by the depth test.
- Ship tweaks: Iowa 7-tier conning tower, Yamato pagoda and funnel, Bismarck tower, Essex island; 1944 dazzle liveries for Iowa and Essex.

### Tooling
- `?ocean=0` skips the ocean pass (fast model previews); `firetest` trailer scene (`node tools/trailer/record.mjs firetest <out> --q ship=essex`) films a salvo from any ship.

## 0.0.1 — first public version

Autonomous WWII naval combat simulation on the Noniv/web-ocean WebGPU engine.

### Simulation
- 30 real ships (6 nations × 5 types) built procedurally from spec sheets; fleets set up before the battle, AI-only combat, follow / orbit / bridge / shell / tactical / free / aircraft / cockpit cameras and an automatic director.
- Carrier air operations (take-off queue, dive-bombing, low-level torpedo attacks, landing, ditching), per-mount anti-aircraft fire, flak.
- Modular damage model: modules placed where they are on the 3D model (machinery, magazines, bridge, directors, radar, funnels, masts, torpedo tubes, catapults, hangar...), watertight compartments, list / trim / flooding, fires, destroyable parts shown as wrecks, magazine explosions with the hull breaking in two.
- Procedural sound: every gun, impact, explosion, engine, siren and structural groan synthesised at run time, positional with delay, Doppler and reverb.

### Graphics
- Ship rendering: baked ambient occlusion, camouflage schemes (dazzle, Admiralty disruptive, "sunburst", splotch) following the paint notes of each class, national ensigns that ripple in the wind, hull numbers drawn with a bitmap font, plate relief, rebuilt gun turrets, lifelines, boats on davits, life rafts, rigging, signal flags.
- Smoke plumes that rise and lean with the wind, billowy sprite shading, torpedo water columns, tamed muzzle smoke and tracer streaks.
- Performance: frustum culling of ships, distance level of detail (fine detail only up close, light AA dropped at range), shadow casters limited to the focus ship, adaptive quality ladder (auto / high / medium / low), NaN / Inf guard on the HDR output, `?fft=` and `?grid=` to thin the ocean for slow GPUs.

### Tooling
- `npm test`: models, damage, audio, manual control, air operations, fuzz and full battles.
- `npm run check:shaders`: compile the WGSL with a real WebGPU device.
- `tools/trailer`: deterministic offline recorder (frame-by-frame WebGPU capture, game sound rendered offline), procedural score and an ffmpeg assembler; produced `docs/trailer-v0.0.1.mp4`.
