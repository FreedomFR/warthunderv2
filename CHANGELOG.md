# Changelog

## Unreleased — fidelity batch 5 (the destroyers)

- **Fletcher**: a profile / plan / lines sheet with a 20 m scale bar, shared by the project owner (a monograph; copyright, measurements only). Flush deck from 6.8 m at the stem to 3.0 m aft, the
  5 in mounts at 0.177 / 0.238 / 0.679 / 0.754 / 0.831 (the spec had 0.10 / 0.165 / 0.66 / 0.78 / 0.885), the bridge block, pole mast (28.7 m), funnels at 0.419 / 0.534, quintuple tubes at
  0.465 / 0.585, the after structure with its Bofors platform, a screw and a rudder. Plan 0.2 m; profile figure dominated by the rigging drawn on the sheet. `mk30` lowered (superfiring on a
  1.7 m base, not 2.4 m).
- **Kagero**: the Commons outline drawing (MacMoreno, CC BY-SA 4.0, scaled to the length): forecastle 5.3 m stepping down at f 0.31-0.33, A at 0.152 and X / Y at 0.730 / 0.800 (the spec had
  0.13 / 0.76 / 0.87), bridge to 12.5 m, pole foremast (23.7 m), funnels at 0.373 / 0.517 (the big forward one 12.3 m), tubes at 0.45 / 0.60 (the spec had 0.58 / 0.67), the long deckhouse, screw and
  rudder; new `type3_127` family. Plan 0.1 m.
- **Tribal**: the TZoli profile and plan (shared by the project owner, copyright, measurements only): forecastle 6.3 m ending at f 0.455, A / B at 0.177 / 0.254 and X / Y at 0.808 / 0.905
  (the spec had 0.115 / 0.185 / 0.775 / 0.86), the bridge block with the director, the leaning lattice radar mast (29.4 m), funnels at 0.448 / 0.57, the long after deckhouse with the pom-pom;
  new `brit120` family. Profile 1.7 m, plan 0.2 m.
- **Type 1936A (Mob)**: a small coloured 3-view (shared by the project owner; about +-0.8 m): the single 15 cm guns at 0.76 / 0.81 / 0.868 and the Drh LC/38 twin at 0.19, funnels at 0.374 /
  0.505, tubes at 0.45 / 0.64 (the spec had both abaft the funnels), the bridge block and mast (28.7 m); new `de150_2` / `de150_1` families (`mainVariant` can now be an object keyed by the number
  of guns). Profile 2.2 m, plan 0.2 m.
- **Le Fantasque**: a profile and plan with a scale in feet (434 ft 5 in), shared by the project owner (source unknown, measurements only): forecastle 7.6 m at the stem, 6.8 m at f 0.3,
  4.4 m aft of f 0.45; the 138.6 mm single mounts at 0.17 / 0.207 / 0.757 / 0.855 / 0.883 (the spec had 0.10 / 0.17 / 0.66 / 0.80 / 0.88), the stepped bridge block (to 16 m), a pole foremast (26.6 m),
  funnels at 0.375 / 0.611, the after deckhouse with its director tower; new `fr138` family. Profile 1.6 m, plan 0.7 m (the drawing is hatched and about 10 % too wide: normalised).
- **Soldati**: only photographs (a camouflaged Legionario, public domain): funnel, masts and guns moved, about +-2.5 m.

## Unreleased — fidelity batch 4 (the cruisers)

Every ship below was measured on a drawing (profile and, when there is one, plan view), compared with `tools/refs/check.mjs` + `silhouette.py` in
metres and corrected; new turret families and houses were created from the measured dimensions (the guns were never in the right place before).

- **Takao** (ONI 41-42 sheet of the Atago class, public domain): forecastle 5.0 m (7.4 m at the stem) to a quarterdeck at 4.4 m, A / B / C at 0.205 / 0.245 /
  0.277 and X / Y at 0.735 / 0.777 (superfiring B 3.3 m above A), the stepped bridge (19 / 24.5 / 27.9 m), a lattice tripod foremast (top 36.5 m), a slanted funnel,
  a cylinder and a stub stack, the aircraft deck at 8.6 m with its crane and the catapult 8.7 m off the centre line. New `type3_203` family (20 cm/50 No. 3 twin).
  Profile 3.1 m, plan 0.3 m mean difference.
- **Admiral Hipper / Prinz Eugen** (ONI 204 sheets): 20.3 cm twins at 0.232 / 0.283 / 0.75 / 0.80, a tower of four tiers (13 / 11.5 / 7.2 / 5.4 m), the foremast
  and a single raked funnel at 0.475, masts at 0.437 (35.7 m) and 0.60 (38.5 m); new `drh203` family.
- **Königsberg / Köln** (ONI 204 sheet): forecastle 6.8 m (7.7 m at the stem), a quarterdeck at 4.1 m from f 0.73, turrets A / B / C at 0.176 / 0.71 / 0.794 (B on
  the high deck, not over C), a narrow tower pole, two funnels at 0.335 and 0.452, the turntable catapult at 11.9 m and the mainmast with a derrick jib. Profile 2.8 m, plan 0.4 m.
- **Montecuccoli** (ONI 202 sheet): the turrets were wrong (A / B at 0.205 / 0.262 instead of 0.14 / 0.21, X / Y at 0.775 / 0.83), funnels at 0.392 and 0.632,
  the round armoured tower to 21 m, the catapult and a derrick jib; new `it152` twin family. Plan 0.2 m.
- **Zara** (ONI sheet): A / B at 0.279 / 0.327 (B 2.7 m above A) and X / Y at 0.694 / 0.745 (the spec had 0.19 / 0.255 / 0.735 / 0.80), the deck sweeping from
  6.9 to 4.4 m, the massive tower (director 30 m), funnels at 0.463 and 0.603, tripod mainmast 38 m, the catapult rails on the forecastle; new `zara203` family. Profile 1.8 m, plan 0.2 m.
- **La Galissonnière** (small ONI sheet, 5 px/m): flush forecastle 8.4 m (the bottom line is taken as the waterline), A / B at 0.233 / 0.278, C at 0.778 with the catapult on
  its roof, tripod bridge to 29.8 m, funnels at 0.43 and 0.549, the aft deckhouse and a derrick; new `fr152_30` family. Profile 1.7 m, plan 0.2 m.
- **Algérie** (ONI sheet, 4.7 px/m): the turrets were 0.1 off (A / B / X / Y at 0.225 / 0.275 / 0.69 / 0.74, not 0.12 / 0.2 / 0.79 / 0.87), the block tower to 35 m with a
  40 m pole, one big funnel at 0.409, a central searchlight tower with a crane boom, the catapult rails; new `fr203` family. Plan 0.2 m.
- **Cleveland**: a 1942 Colosseum drawing with a scale bar and the waterline (profile) and the Pit-Road 1/700 sheet (plan), shared by the project owner (copyright of their
  authors: measurements only, not in the repository). Turrets at 0.193 / 0.26 / 0.729 / 0.79 (the spec had 0.14 / 0.21 / 0.76 / 0.84), freeboard 8.8 -> 6.8 m, the bridge
  block, funnels at 0.469 / 0.537 (25 m), 36 m masts, a 9.6 m hangar roof; new `us152` family. Profile 2.4 m, plan 0.7 m.
- **Baltimore**: the Shipbucket profile (Ian B. Roberts, with a 100 m scale bar and the waterline) and the TZoli plan, shared by the project owner (copyright: measurements only).
  Turrets 0.225 / 0.285 / 0.77 (the spec had 0.12 / 0.185 / 0.8), a 41.5 m foremast carrying the SP radar, two funnels at 0.491 / 0.582 (25 m), the 5 in twins on the centreline
  and wings read on the plan, two catapults 6.9 m off the centre line; new `us203` family. Profile 1.8 m, plan 0.5 m.
- **Agano**: a detailed profile and plan with a 50 m scale bar, shared by the project owner (author unknown: measurements only; the stylised Agano-kai profile of CC BY 3.0 was
  used first). Turrets at 0.192 / 0.243 / 0.813 (the spec had 0.12 / 0.19 / 0.88), the bridge tiers, a big raked funnel at 0.478, the catapult with two floatplane carriages and
  the crane mast at 0.78; new `type41_152` twin family. The silhouette figures are dominated by the rigging and crane stays drawn on the sheet (not modelled).
- **Belfast**: James Goulding's profile and plan of 1943 (Profile Publications, scale bar in feet; copyright, measurements only). Turrets at 0.158 / 0.211 / 0.771 / 0.823 (the spec
  had 0.11 / 0.165 / 0.775 / 0.855), forecastle 8.5 m to f 0.775, bridge block with the director tower (26 m) and a 41.7 m foremast, funnels at 0.489 / 0.631, tripod mainmast, the
  athwartships catapult with a crane each side; new `brit152` family. Profile 2.2 m, plan 0.5 m.
- **Norfolk**: the plan and profile of a three-funnel County class cruiser from a Hasegawa 1/700 instruction sheet (copyright, measurements only). Turrets at 0.175 / 0.247 / 0.763 /
  0.829 (the spec had 0.10 / 0.155 / 0.79 / 0.855), a flush deck 8.5 m, the stepped bridge block, three funnels, tripod masts; new `brit203` family. Profile 2.0 m, plan 0.2 m.
- Tools: `fit_decks.py` (profile -> `decks:`), `rulers` / `rulerRegion` and an automatic camera in `silhouette.py`, `hull.py --B`.

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
- **LN.401**: the 1/72 plans of the LN-401 / LN-411 (a magazine, copyright; measurements only): the tail is a tailplane with twin end-plate fins (the model had a
  single central fin): new `tail.plates` option; tailplane span 3.9 m (0.28 of the span), the wing bends at 0.23 of the half span (was 0.30) and its tips
  stand 0.95 m above the knee (was 0.6 m; the knee and the rise are now `kneeFrac` and `tipRise`, shared with the Ju 87's gull wing), deeper fuselage.
- **Re.2001**: a 3-view of the Falco II: the wing 0.5 m too far aft, the tail 0.8 m too far forward and too small, the fin too low: corrected; planform
  mean difference 5.6 -> 4.0 m after the first pass (the figure is dominated by the sheet's lettering); the picture overlays well.
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
