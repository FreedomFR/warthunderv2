# Changelog

## Unreleased — fidelity batch 3 (the remaining carriers, the aircraft)

- **Graf Zeppelin**: the ONI 204 sheet of September 1942 (Commons, public domain): flight deck 16.0 m above the waterline with its real outline
  (narrowing at both ends), a long low island on a sponson, funnel and tower blocks, six groups of 150 mm casemates. Profile 2.4 -> 1.2 m.
  The sheet is an intelligence reconstruction ("substantially correct for hull proportion").
- **Aquila**: a colour profile and plan with a 30 m scale bar and the waterline drawn, shared by the project owner (author and licence unknown:
  measurements only, not in the repository). The flight deck is 16.0 m above the waterline (the spec's 23 m was above the keel), lifts at
  0.363 / 0.5385 (the spec had 0.43 / 0.55), the funnel 13.4 m long at 0.482-0.539, bridge and tower on a sponson. Profile 3.2 -> 1.0 m.
- **Bearn**: the 1927 starboard photograph (public domain): flight deck 19.8 m over a forecastle at 10 m, open under the deck forward,
  hangar side aft, a big island box with the funnel inside, stepped bridge tiers, mast 56 m; +-1.5 m (perspective of the near side), no plan.
- **Aircraft**: the planforms of the SBD, B5N and Skua compared with their three-view drawings (`tools/refs/planecheck.mjs` + `planecheck.py`).
  The tailplane span of every aircraft had been drawn at about half the real size (SBD 2.0 m instead of 5.4 m, which the BuAer plan prints
  as 17 ft 9 in): measured for the three with a drawing, 0.33 of the wing span (estimated) for the others. SBD and B5N wings moved forward
  by 0.9 / 1.3 m and deepened (3.0 / 3.3 m root chord), the SBD tail aft. Planform mean difference SBD 3.1 -> 1.1 m.
- **TBF Avenger and D3A Val**: compared with drawings shared by the project owner (a blueprint poster with the dimensions printed; Printscale and Artscale
  decal art; copyright, measurements only). Wings 0.9 / 1.2 m too far aft and tails 0.9 / 1.2 m too far forward with too short a chord:
  corrected (TBF tail chord 1.8 -> 2.4 m, D3A 1.3 -> 2.0 m). Planform mean difference TBF 5.3 -> 1.7 m, D3A 3.3 -> 1.6 m.
- **Fi 167**: a clean 3-view shared by the project owner (measurements only): the wing planform already matched (13.5 m span); the tail was 1.2 m too far
  forward (-4.4 -> -5.6 m), the wing 0.4 m too far aft. Planform mean difference 1.6 -> 1.0 m.
- **Ju 87 Stuka**: a 1:72 sheet with a scale bar (Zurek) and D-5 plans, shared by the project owner (copyright; measurements only). The tailplane is only 3.0 m
  across (0.22 of the span, measured on the plan view) with a 1.0 m chord, not the estimated 4.6 m; wing root chord 2.9 m, tip 1.1 m. The wing's position
  could not be checked reliably: the sheet's other views leak into the planform comparison.
- **Swordfish (second pass, a detailed 1:50 plan with a scale bar in feet)**: calibrated on its length (11.0 m, 90.9 px/m: the plan measures 13.86 m across
  the upper wing, which confirms the scale). The wings sit 0.95 m forward of the first guess's origin (the low-resolution 3-views had put them
  1.0 m further forward and the tail wrong), the stagger is 0.1 m, the tail 5.3 m aft of the origin. Planform mean difference 3.0 -> 2.3 m (the rest is the
  sheet's other views leaking into the crop: the side view of this plan is not reliable).
- **Swordfish**: a cutaway with the specification table (length 36 ft 1 in = 11.0 m, upper span 45 ft 6 in = 13.87 m) and two 3-views, shared by the project
  owner (measurements only). Length 10.9 -> 11.0 m, upper wing 1.0 m forward, tail 0.8 m aft and deeper (chord 1.5 -> 2.0 m), stagger 0.5 -> 0.3 m.
  The 3-views are low resolution with dashed lines, so the silhouette comparison is unreliable here: positions were read by eye on the overlay.
- Builder: the carrier island can be built from measured blocks with its own mast, radar and director positions (`island.blocks`); lifts
  take a measured size and position; carriers take a measured flight deck outline (`fdPlan`).
- Tools: `planecheck.mjs` / `planecheck.py` (aircraft planform and profile against a 3-view), `dilate` for 1 px line drawings, `open`
  for hairlines.

## Unreleased — fidelity batch 2 (King George V, Richelieu, Littorio, Shōkaku, Illustrious)

Same method as batch 1: free plans from Commons, positions read on a grid in fractions of the length and metres (`tools/refs/grid.py`), the model
compared with the drawing in metres (`check.mjs` + `silhouette.py`), hull tables read off the drawing (`hull.py`).
- **Littorio**: the ONI 202 sheet (Feb 1943, public domain, height scale in feet). The spec had one funnel (there are two ovals), the turrets
  5-30 m out; now turrets A / B / C at 0.287 / 0.372 / 0.752, the 152 mm pairs, six 90 mm a side, deck heights, the plan outline. Profile 6.3 -> 2.5 m,
  plan 2.2 -> 0.2 m mean difference.
- **Richelieu**: the class inboard profile with the machinery (Commons, CC BY-SA 4.0): turret axes, tower with the conning tower block, the funnel merged
  with the aft mast, hangar, catapult; boiler rooms 1 and 2, the two engine rooms (one HP / MP / LP set per shaft) and the turbo-generators from the
  power plant plan. A centre-line section, so the wing mounts are estimated. Profile 5.3 -> 1.3 m (0.3 m under water).
- **Shōkaku**: profile and plan with a 50 m scale bar (Commons, CC BY-SA 3.0): the real flight deck outline (14.0 m above the water, narrowing
  both ways), the island on its sponson, the lifts, the two outboard funnels rebuilt as flattened ducts with a downward exhaust, the 127 mm sponsons.
  Profile 4.8 -> 0.6 m.
- **Illustrious**: the ONI 201 sheet (flight deck 40 ft, stack 91.5 ft printed on it): the island's blocks, funnel and mast, the flight deck outline
  with its narrow stern and bow ends, two lifts, four pairs of 4.5 in sponsons, the octuple pom-poms. Profile 6.3 -> 0.8 m.
- **King George V**: measured on Manuel P. Gonzalez Lopez's profile and plan "King George V 1941 / Duke of York 1945" (copyright, consulted for
  measurements only and credited; shared by the project owner), with the metre ruler of the sheet. The spec had the turrets 25-40 m out (A / B / Y
  were at 0.13 / 0.195 / 0.835, they are at 0.287 / 0.352 / 0.760); long forecastle, hull outline from the plan (pointed stern), keel, funnels,
  bridge, tripod fore- and mainmasts, two cranes, athwartships catapult, boat deck, props and rudder. Profile 4.2 -> 1.9 m, plan 1.9 -> 0.2 m.
  Fixed: the deckhouse followed the foremast instead of the tower, so the bridge overhung it and floated; the crane was an oblique strut.
- New gun-house families: 381/50 and 152/55 (Italy), 380 quadruple and 152 Mle 1936 (France), built from one parametric flat-roofed house.
- Builder: carriers can take a measured flight deck outline (`fdPlan`), island blocks (`island.blocks`), lift sizes, mast / radar / director
  positions; measured hull tables; `aa` / `boats` for every nation (octuple pom-pom added).
- Tools: `grid.py`, `hull.py`, `outline.py` (the profile as plateaus), automatic cameras in `plans.json`, `open` (removes hairlines such as scale lines).

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
