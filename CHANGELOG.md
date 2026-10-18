# Changelog

## Unreleased — fidelity batch 1 (Iowa, Yamato, Bismarck, Essex)

### Checked in metres against the plans (batch 1, third pass)
- `tools/refs/check.mjs` + `silhouette.py`: matte renders (`?matte=1`, `?flags=0`) compared with the profile and plan drawings station by
  station, above and under water; `plans.json` holds each drawing's calibration. The Yamato profile is drawn 10 % flat (checked on the
  builders' depth and bow height): its heights are now read at its own vertical scale. Bismarck freeboards for its full-load draft.
- Iowa, Yamato and Bismarck corrected from the check: bridges, towers, funnel caps (hooded, sloped), after control towers, turret
  heights (Type 94 3.9 m), per-turret barbettes, the Yamato bulb and keel line, the Bismarck Atlantic forefoot, cranes, catapults.
- From the plans instead of at random: light AA (Iowa 20 quadruple Bofors and ~40 Oerlikons, Yamato 50 triple 25 mm, Bismarck twin
  3.7 cm, quadruple and single 2 cm; Essex estimated from photographs), boats, the Bismarck SL-8 AA directors, the Iowa conning tower,
  bridge wings and rails; Yamato's 12.7 cm mounts re-measured.
- Propulsion: screws, shafts, brackets, skegs and rudders under water (Yamato and Bismarck as drawn, Iowa from dry-dock photographs,
  Essex estimated); finer underwater sections towards the ends. Damage model: each ship's own boiler and turbine rooms (published
  arrangements) and shaft lines (Bismarck's three, a centre shaft pushes straight ahead), steering gear at the rudders.

### Measured on plans (batch 1, second pass)
- The four ships are now laid out from profile and plan drawings instead of the estimated spec positions, and checked by drawing
  the plan over a far, narrow-angle side view of the model (`tools/refs/overlay.py`). Turrets, funnels, masts, towers, secondary
  mounts, directors, catapults and hangars moved by up to 40 m (the spec sheets had them too far forward).
- Gun houses rebuilt to their measured height: the Mk 7 (Iowa) is 3.4 m high, not 6 m; the Type 94 (Yamato) 4.3 m, the Drh LC/34
  (Bismarck) 3.5 m; superfiring turrets 3-3.7 m above the lower ones. New families for Yamato's 15.5 cm triple and Bismarck's 15 cm
  twin turrets.
- Hulls: measured deck and waterline half-breadths (`planDeck`, `planWL`: Iowa's long narrow bow, Yamato's beam of 38.9 m at the
  deck over 36.9 m at the waterline), measured freeboards (Iowa 13.5 / 6.5 / 7.8 m, Yamato 10.0 / 8.667 / 6.4 m from the builders'
  table, Bismarck 10.9 / 6.6 / 7.9 m), bulwarks only round the bow, the long-hull Essex clipper stem ahead of the flight deck.
- Superstructures described level by level (`house.plan`, `decks`, tower `tiers` with heights), per-funnel sizes, extra fire-control
  directors (Iowa's four Mk 37 and after Mk 38, Yamato's and Bismarck's rangefinder cupolas, Essex's island directors), Iowa's
  fantail catapults, Bismarck's athwartships catapult between the funnel and the hangars, the Essex island well forward of midships
  with its twin 5in pairs on the flight deck, firing ahead, astern and across the deck.
- Muzzle blast of the dual-purpose and medium guns: a smaller fireball and a greyer cloud that thins out in a few seconds (a 5in
  battery firing every 4 s no longer hides its own ship); the heavy guns are unchanged.
- `firetest` scene: `--q mount=A` films one turret, `--q group=sec` the secondary battery.

### Guns
- Mount families with measured proportions in `js/game/model/mounts.js`: 16"/50 Mk 7 triple turret (Iowa), 46 cm Type 94 triple (Yamato), 38 cm Drh LC/34 twin (Bismarck), 5"/38 Mk 28 twin and Mk 30 single (Essex, Iowa secondaries). Trunnion height, barrel spacing, sleeve, recoil rod, barbette radius and muzzle distance come from the reference photographs.
- The simulation fires from the real muzzle of every barrel (`mountDims`) and the recoil follows a fast-out / slow-return curve (`recoilCurve`); the hull heels away from a broadside in proportion to the shell energy.

### Muzzle blast
- New `FIREBALL` particle kind: opaque billowing gas, white-hot core, orange body and dark rim, cooling with age. Flash, jet, glow, lobes, smoke ring, powder cloud, foam sheet and spray, scaled by the calibre (`effects.muzzle` / `blast`).
- Particles fade out near the sea surface instead of being cut along a straight line by the depth test.
- Ship tweaks: Iowa 7-tier conning tower, Yamato pagoda and funnel, Bismarck tower, Essex island; 1944 dazzle liveries for Iowa and Essex.

### Tooling
- `tools/refs/search.py` (Commons search with licences) and `tools/refs/overlay.py` (a drawing over the model, red lines or stacked).
- The browser tools run on the real GPU (checked on an RTX 3080); under WSL2 through the Windows Node and Chrome (see `CLAUDE.md`).
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
