# Plan du code

Généré par `node tools/codemap.mjs` (`npm run map`) : ne pas modifier à la main ; `test/codemap.mjs` vérifie qu'il est à jour. Chaque ligne : le fichier (nombre de lignes), ce qu'il fait (son premier commentaire),
ce qu'il exporte, et le nombre de fichiers (js, tools, test) qui l'importent (← n ; 0 = point d'entrée, ou code mort à vérifier). Pour trouver un sujet : `node tools/codemap.mjs --find mot`.

## js/

- `engine.js` (1238) WebGPU ocean engine — derived from Noniv/web-ocean (MIT), restructured so a game can sit on top. [P, SLIDERS, MAX_PROBE, MAX_STAMPS, createEngine] ← 3
- `main.js` (77) Entry point. ← 0
- `preview.js` (129) Model preview: ?preview=<shipId>[,<shipId>|plane:<type>...] renders models on the ocean with an orbit camera. [runPreview] ← 1
- `trailer.js` (216) Trailer director: scripted scenes recorded frame by frame with the offline recorder (tools/trailer/record.mjs). [FPS, LOOKS, Trailer, mv] ← 3
- `trailerMusic.js` (175) Procedural score for the trailer, rendered offline with Web Audio: drone, string pad, taiko / snare / hats, a brass motif, risers and big hits placed on the cuts. [renderMusic, wavBase64] ← 1
- `trailerScenes.js` (628) The scenes of the trailers (v0.0.1 and v0.1.0) (see js/trailer.js for the director and tools/trailer for the recorder). [H, P3, sail, quiet, unit, dist2, damp, chaseCam, followCam, … +2] ← 2
- `trailerScenes020.js` (200) The scenes added for the v0.2.0 trailer (see js/trailerScenes.js for the older ones and js/trailer.js for the director): islands and forests, shells on the hillside,… [SCENES_020] ← 1
- `viewer.js` (37) Entry point of viewer.html: a 3D viewer for every ship and aircraft of the game (orbit, zoom, pan, light, debug link, screenshot). ← 0
- `wiki.js` (116) Entry point of wiki.html: tech trees by nation, comparison table, aircraft, and the detail card with the embedded 3D viewer. ← 0

## js/game/

- `audio.js` (273) Game sound: positional playback of the procedurally synthesised sounds (see audio/synth.js). [GameAudio] ← 2
- `device.js` (14) What kind of device the game runs on. Shared by the engine (pixel density), the game (quality) and the touch interface. [isMobile, maxPixelRatio] ← 4
- `game.js` (425) Game orchestrator: ties the simulation world to the ocean engine (hooks), the ship / particle renderers, the camera rig and the UI. [Game] ← 1
- `math.js` (157) Small math helpers shared by the game code (no allocations in the hot helpers). [D2R, R2D, TAU, KN, G, clamp, lerp, sat, smoothstep, … +11] ← 56
- `preload.js` (17) What can be built before the player has done anything, while the first screen plays: the meshes of every ship class (5 s of work in all, one model after another with… [preloadModels] ← 2
- `scenarios.js` (47) Ready-made fleet compositions for the setup screen. [PRESETS] ← 6

## js/game/audio/

- `common.js` (4) Constants and small helpers shared by the audio modules. [C_SOUND, clamp01, clampR] ← 4
- `events.js` (176) Mapping of the simulation's battle events to sounds: which sound, how loud, how far it carries, how it is pitched. [eventMethods] ← 1
- `loops.js` (303) Continuous voices that follow their sources every frame (aircraft engines with Doppler shift, ship machinery, fires, flooding) and the one-shot announcements of… [loopMethods] ← 1
- `propagation.js` (69) How sound travels over the sea: absorption of the air (ISO 9613-1), which is what makes a far gun a dull thud, the delay, the reflection off the water and the shadow… [airAbsorption, airCutoff, seaEchoDelay, shadowed, enclosure] ← 3
- `synth.js` (125) Procedural sound effects (no sample files). [SOUND_NAMES, VARIANTS, makeLibrary, renderSound, makeReverbIR] ← 5
- `synthPool.js` (39) A small pool of web workers that build the sounds (audio/synthWorker.js). [makeSynthPool] ← 1
- `synthWorker.js` (12) Builds the sounds on another thread: the library (synth.js) asks for one buffer at a time and gets the samples back (transferred, not copied). ← 0

## js/game/audio/synth/

- `aircraft.js` (183) Aircraft engines, falling aircraft and deck landings. [AIRCRAFT] ← 1
- `ambience.js` (173) Ambience loops and damage creaks. [AMBIENCE] ← 1
- `core.js` (175) Shared building blocks of the procedural sounds: random generator, filter, envelopes, echoes, the reverb impulse response. [TAU, prng, SVF, lpa, env, mk, normalize, addEcho, friedlander, … +11] ← 10
- `engines.js` (133) Ship machinery: engine rooms, turbines, propellers, gun turrets and lifts. [ENGINES] ← 1
- `explosions.js` (155) Explosions and torpedoes. Built as a timed stack, as in published layered-explosion design: the crack at ignition, the pressure body, a low weight that swells under… [EXPLOSIONS] ← 1
- `guns.js` (183) Guns, anti-aircraft fire and shells in flight. [GUNS] ← 1
- `impacts.js` (209) Impacts on water and steel, structural damage. [IMPACTS] ← 1
- `levels.js` (28) Loudness calibration. Every builder used to peak-normalise its sound, so a bomb whistle (a pure mid-range tone: 9 dB louder to the ear than a gun report of the same… [TARGET_DBA] ← 2
- `water.js` (167) Water: what a flooding ship, a shore and a sinking hull sound like. [WATER] ← 1

## js/game/data/

- `balance.js` (87) Balance: multipliers of the damage done in the battle, so that it can be tuned without touching the code. [BALANCE_FIELDS, BALANCE_MIN, BALANCE, balanceNeutral, balanceOfFile, balanceNow, setBalance, setBalanceFile, balanceDiff, … +2] ← 7
- `protection.js` (72) Protection and survivability data that the spec sheets do not carry: how the armour is laid out (belt inclination, the thin weather deck above the armoured one), the… [NAVY, PROTECTION, protectionOf, navyOf] ← 1
- `ships.js` (30) Ship roster: the six nations' spec sheets (real-ship data) indexed by id / nation / type. [NATIONS, TYPES, ALL_SHIPS, BY_ID, typeName, nationName, shipsOf] ← 29

## js/game/data/specs/

- `france.js` (11) Real ship spec sheet — France. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1
- `germany.js` (12) Real ship spec sheet — Germany. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1
- `italy.js` (11) Real ship spec sheet — Italy. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1
- `japan.js` (11) Real ship spec sheet — Japan. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1
- `uk.js` (11) Real ship spec sheet — UK. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1
- `usa.js` (11) Real ship spec sheet — USA. Compiled from Wikipedia, NavWeaps and Navypedia (see "sources" in each entry). [NOTES, SHIPS] ← 1

## js/game/model/

- `ao.js` (110) Baked ambient occlusion for the procedural ship meshes. [bakeAO] ← 1
- `baseGuns.js` (94) The guns of the bases: the mount of each gun (the same meshes as on the ships, see mounts.js) and what it stands on - a concrete emplacement with a ring wall, an… [gunMountSpec, buildEmplacement] ← 1
- `baseKit.js` (210) Shared bits of the base models: the palette of each nation, and small drawing helpers (smooth lofts, rings, ragged ground patches, vehicles, drums...). [BASE_PAL, palOf, EARTH, earthOf, DIRT, dirtOf, C, DARK, CHAR, … +19] ← 4
- `baseMesh.js` (314) The look of a military base: buildBaseModel(layout, nation) turns the layout of sim/bases.js into the meshes that render/baseVisual.js draws. [orientPart, buildBaseModel, clearBaseCaches] ← 2
- `baseParts.js` (455) The buildings of the bases, each as a MeshBuilder with the groups body the intact building (always drawn) body_ruin what is left of it when it is destroyed (the walls… [buildPartMesh] ← 1
- `bomberdata.js` (168) Spec sheets of the land-based bombers (one per nation), read by heavy.js. [HEAVY] ← 2
- `cache.js` (10) Ship models are built once per class and shared by every ship of that class. [getModel] ← 3
- `clearance.js` (199) What each gun can bear on. A mount stands on a deck among towers, funnels, masts and other turrets, so the barrel cannot be trained or raised through them: for every… [CLR_STEP, CLR_N, inFoot, computeClearance, clearElev, clearMax, barrelBlocked, pathClear, inArcRel] ← 6
- `cockpit.js` (376) The cockpit seen from the pilot's seat: the instrument panel with working dials (airspeed, artificial horizon, altimeter, compass, climb, revolutions, clock and… [cockpitEye, canopyFrame, GAUGE, buildCockpit, getCockpit] ← 6
- `details.js` (183) Fine detail for the ship models: lifelines, boats on their davits, life rafts, ventilators, anchors and hawse pipes, rigging, searchlight platforms, depth charge… [lifelines, roofRail, launch, raft, vent, anchorAndHawse, stay, depthCharges, mooring, … +4] ← 3
- `glyphs.js` (59) 5x7 bitmap font for hull numbers (digits, capital letters, dash). [GLYPH_CHARS, GLYPH_BITS, glyphIndex] ← 3
- `heavy.js` (472) The multi-engine land-based bombers (B-17, G4M, Lancaster, He 111, SM.79, LeO 451): the generator for aircraft with `spec.engines`. [frameOf, bayPivot, propMounts, drawHeavy] ← 3
- `hull.js` (246) Parametric hull lofting. The hull is a parametric surface P(t, k): t runs from the bow (0) to the stern (1) along each horizontal "level" k (k < 0 below the… [pchip, buildHull] ← 1
- `islandMesh.js` (102) The mesh of an island: the height field of sim/terrain.js turned into triangles, coloured by height and slope (beach, grass or forest, bare rock, ash), with smooth… [groundColour, buildIslandMesh] ← 1
- `layout.js` (105) How the gun houses sit among the structures round them. [houseBox, houseRect, obstacles, buriedIn, clearHouses] ← 2
- `livery.js` (67) Ship liveries: camouflage patterns, palettes and the hull number / ensign data used by the ship shader. [CAMO, NATION_ID, PALETTES, LIVERY, MARKS, hullNumber, hex, paintOf] ← 3
- `meshbuilder.js` (471) Procedural mesh builder used to model the warships (no external assets). [MAT, VERTEX_STRIDE, DETAIL, rgb, shade, mix, MeshBuilder] ← 21
- `mounts.js` (438) Articulated gun mounts. Every mount produces two meshes that are drawn as separate instances so they can move independently: house : the rotating gun house / shield /… [mountDims, getMountModel] ← 10
- `parts.js` (514) Reusable ship parts. All functions draw into a MeshBuilder in model space (+x bow, +y up from the waterline, +z starboard). [OPT, barbette, funnel, funnelRuin, windowBand, tower, poleMast, tripod, cageMast, … +21] ← 2
- `planeGuns.js` (167) The defensive guns of an aircraft, one entry per gun position: where it pivots, what it can bear on, its calibre and its barrels. [GUN_DIMS, gunDims, GUN_RATE, GUN_DMG, planeGuns, inArc, muzzleOf, drawGunHead] ← 4
- `planes.js` (741) Procedural WWII carrier aircraft. One generator for monoplanes and biplanes driven by a spec sheet (dimensions of the real aircraft). [PAINT, PLANES, groundY, propsOf, floatplaneSpec, damageSites, planeTypeFor, upperWingY, cockpitHole, … +14] ← 25
- `screws.js` (25) The screws and the rudder of the ships whose underwater body was not measured on a plan (tweaks.props / tweaks.rudders): drawn from the number of shafts the class… [defaultScrews] ← 1
- `shipbuilder.js` (918) Spec-driven ship builder. Reads a real-ship spec sheet (dimensions, turret / funnel / mast positions as fractions of the overall length, class, paint) and builds the… [pagodaTiers, buildShipModel] ← 10
- `treeMeshes.js` (506) The plants as meshes: eight species (oak, fir, palm, tropical canopy tree, acacia, cypress, shrub, boulder), three variants each, at four levels of detail. [FAM, SHAPE, getTemplate, ROCK_TINT, stampPlants] ← 2
- `tweaks.js` (1076) Per-ship hand tuning of the generated models (see shipbuilder.js for the options). [TWEAKS] ← 10
- `vegetation.js` (143) Where the plants grow. Pure functions of an island (no GPU): the climate of the island, how much of the ground is covered at a point (used both to scatter trees and… [SP, SPECIES, VARIANTS, STEP, climateOf, cover, scatter] ← 5

## js/game/render/

- `aircraftVisual.js` (341) Draws aircraft (in flight, crashing, parked on a flight deck) and the ordnance in flight. [PlaneVisuals] ← 4
- `baseVisual.js` (184) What is drawn for the military bases of the islands (sim/bases.js): the flat work of the airfield, the buildings (intact or ruined, scorched when damaged), the radars… [BaseVisuals] ← 2
- `effects.js` (214) Visual effects driven by simulation events and ship state: muzzle flashes, shell splashes, impacts, fires, funnel smoke, sinking, anti-aircraft fire and wakes (foam… [Effects, addWakeStamps] ← 3
- `islandVisual.js` (36) What is drawn for the islands: one mesh each (built from the height field, model/islandMesh.js), drawn by the ship renderer like any other model. [IslandVisuals] ← 1
- `particles.js` (243) CPU-simulated particle pool drawn as camera-facing quads (see wgsl/particles.js). [DEFAULT_MAX, K, Particles] ← 9
- `shadows.js` (31) Sun shadow map light matrix (orthographic, camera-relative coordinates). [lightMatrix] ← 2
- `shipRenderer.js` (192) Instanced renderer for the procedurally built ship meshes. [ShipRenderer] ← 3
- `shipVisual.js` (250) Assembles everything that is drawn for a ship: the hull, the destroyable parts (intact or wrecked), the articulated gun mounts and light AA mounts, the battle scars… [spinAbout, ShipVisuals] ← 5
- `vegetationVisual.js` (213) What is drawn for the plants of the islands. [VegetationVisuals] ← 1

## js/game/render/fx/

- `air.js` (177) Aircraft effects: hits, crashes, ditching, the wake of a flying machine and the deck (touch-down, arrestor wire). [AirFx] ← 1
- `common.js` (5) Helpers shared by the effects. [rnd, rr, stoch] ← 6
- `fires.js` (80) Long-lived effects of wrecks: debris, fires on the sea, wrecks that burn and sink. [FireFx] ← 1
- `guns.js` (280) Gun effects: muzzle blast and flash, machine guns, anti-aircraft fire, flak, torpedo launch. [GunFx] ← 1
- `hits.js` (287) Hit effects: shell impacts on steel, sparks, explosions, killed modules and mounts, breaking up ships. [HitFx] ← 1
- `wake.js` (39) Foam stamps of the ships (bow wave, wake). [addWakeStamps] ← 1
- `water.js` (179) Water effects: shell splashes, rounds that fall in the sea, the rings of shock waves, shores and rock impacts. [WaterFx] ← 1

## js/game/sim/

- `aadata.js` (9) Anti-aircraft data shared by the guns (sim/aircraft.js) and the aircraft that plan their way past them (sim/routing.js). [AA, FLAK_RANGE] ← 4
- `aircraft.js` (785) Carrier aircraft. A wave of dive bombers and torpedo bombers takes off from the flight deck, flies to the enemy, attacks (bombs are dropped from a steep dive,… [planeId, bombId, updateAir, FIGHT_CTX] ← 2
- `airfield.js` (765) Air operations from the airfields of the islands. [initAirfield, killGroundPlane, stepBasePlane, stepAirfield] ← 3
- `airhit.js` (80) The hit volume of an aircraft. An aircraft is a body (an ellipsoid the size of its fuselage), the planes of its wings (a biplane has two) and its tail: what a gun… [airframe, axes, presentedArea, extentToward, roundHitChance, lightAAHitRate] ← 5
- `airperf.js` (94) How fast each aircraft flies. Speeds in m/s (airspeed), from the published performance of each type (CHANGELOG 0.1.2 has the table and the sources): vmax top speed… [PERF, perfOf, aeroOf, dragAcc, thrustAcc] ← 9
- `ballistics.js` (104) Exterior ballistics: point-mass shells with altitude-dependent air drag. [gunBallistics, solve, stepShell] ← 5
- `baseops.js` (384) What the bases do during a battle: the coastal batteries shell the enemy ships in range, the anti-aircraft guns fire at the aircraft, the shells and the bombs that… [coastalGunOf, BaseSim, damageBase, shellHitsBase, shellGround, bombHitsBase, buildBases, updateBases] ← 3
- `bases.js` (247) Military bases on the islands: an airfield (a runway, the apron, hangars, a control tower, fuel tanks, barracks, a radar, anti-aircraft guns and the places where the… [placeBases, BaseState] ← 4
- `damage.js` (551) Impact resolution against ships: shells, bombs, torpedoes and crashing aircraft. [insideHull, segmentNearShip, segmentHit, resolveShellHit, resolveBombHit, resolveNearMiss, resolveCrashHit, torpedoReach, resolveTorpedoHit] ← 7
- `debris.js` (95) Flying wreckage: funnels, masts, turrets and scrap torn off ships, pieces of broken aircraft. [spawnPartDebris, spawnMountDebris, spawnScrap, spawnPlaneDebris, stepDebris] ← 4
- `deck.js` (539) Flight-deck operations of an aircraft carrier. [TAKEOFF_RUN, DECK_PHASES, deckOf, launching, settleService, planLaunch, stepDeckShip, beginRecovery, clearToLand, … +5] ← 6
- `explosions.js` (112) Ship explosions and break-ups: the magazine detonation (primary blast, thrown turrets, secondary explosions running down the hull, the ship breaking in two), boiler… [explosionScale, magazineExplosion, secondaryBlast, breakInTwo, shipGone] ← 2
- `fighters.js` (263) Carrier fighters. A wave of bombers is escorted by a section of fighters; [FIGHT_PHASES, fighterSteer, fighterFields, bomberDefense, markHunted] ← 3
- `fleet.js` (132) The captain of a fleet. Before, every ship fought alone: it picked its own target, circled at its own range in a random direction and went where it liked. [stationPlan, FleetCommand] ← 3
- `flight.js` (89) The flight dynamics of an aircraft, one step: heading, flight-path angle and speed towards the commanded values, with the thrust, the drag, the lift, the stall and… [setVel, guide] ← 4
- `formation.js` (42) Fleet placement: the ships start in the order of battle of sim/fleet.js (destroyers screening ahead, the line in column behind the flagship, carriers at the back),… [spawnFleet, teamStart] ← 24
- `homeward.js` (77) The way home after the attack. An aircraft that has dropped its bomb or its torpedo does not fly straight home over the guns it has just run the gauntlet of: it looks… [safeHeading, homeLeader, formOn, straggle, homeCourse] ← 3
- `modules.js` (279) Ship damage model: every ship is a set of modules (engine rooms, magazines, steering gear, shafts, bridge, fire-control directors, radar, funnels, masts, torpedo… [AA_ROUNDS, AA_HP, createModules, createCompartments, blastRadius, blast, damageModule, damageMount] ← 4
- `penetration.js` (58) Armour penetration by armour-piercing shells: the muzzle figure of each gun from its shell and velocity, the way the plate resists an oblique hit, spaced plates, the… [V_EXP, muzzlePenetration, obliquityExponent, effectiveThickness, spacedPlates, fuzeThickness, residualSpeed] ← 5
- `planeaa.js` (172) The anti-aircraft fire of the ships at the aircraft in the sky: who can shoot at whom (the arc of each mount, the lead on a fast target, the flak guns' burst), the… [ATTACK_PHASES, updateAA] ← 1
- `planedamage.js` (199) What happens to an aircraft that is hit and dies: damage and the place it smokes or burns from, the loss of an engine, the death throes (the fall, the pieces that… [hitPlane, killPlane, stepDying, collideShips, ditch, crash, landCrash] ← 6
- `routing.js` (94) The way in to the target. A strike does not fly straight at the enemy: it looks at where his anti-aircraft guns are (the light mounts and the dual-purpose guns of… [aaSources, exposure, density, chooseApproach, refugeShip] ← 5
- `ship.js` (696) A ship in the simulation: kinematics, wave response, damage state and weapon mounts. [makeCommand, Ship] ← 1
- `shipdata.js` (108) Gameplay statistics derived from the real-ship spec sheets. [makeStats, cleanName, shipNames, pickName] ← 5
- `terrain.js` (363) The islands. A few procedural islands sit in the sea, of every size and height: a rock a hundred metres wide, a hilly island, a mountain range ten kilometres long, a… [padWeight, Island, Terrain] ← 11
- `weapons.js` (325) Gunnery (fire control, turret slewing, salvos) and torpedo launching. [recoilCurve, mountSolution, updateGunnery, shellChoice, interceptTime, updateTorpedoes] ← 3
- `world.js` (426) The simulation world: ships, shells, torpedoes, aircraft, teams, events, victory. [TEAM_COLORS, World] ← 32

## js/game/sim/controllers/

- `ai.js` (210) Autonomous captain. Writes a ShipCommand (see ship.js) every ~0.5 s: picks targets, chooses a fighting range and heading, launches torpedoes and air strikes, avoids… [AIController] ← 1
- `manual.js` (32) Manual controller (prepared, not wired into the UI yet). [ManualController] ← 2

## js/game/ui/

- `bench.js` (383) The performance test: a scripted battle filmed from fixed views, with a few settings switched off in turn (clouds, shadows, resolution, particles) to see what each… [PHASES, summarize, analyse, formatReport, Bench] ← 2
- `benchprobe.js` (106) What the performance test records beyond the frame times (read by bench.js): the CPU time of each part of the frame, the long tasks of the page, a histogram of the… [CpuProbe, LongTasks, HIST_EDGES, histogram, worstFrames, meanPasses, particleCensus, heapMB] ← 2
- `cameras.js` (975) Camera rig: free-fly, chase, orbit, tactical (top-down), bridge, shell-cam and an automatic "director" that cuts between the action. [CAMERA_MODES, flybyDue, flybyPlace, PLANE_VIEWS, CameraRig] ← 4
- `caption.js` (57) What the camera is showing, in words: the line under the picture ("Auto · Duel — USS Iowa contre IJN Yamato"), so that the viewer always knows what they are looking… [SHOT_NAMES, captionOf] ← 2
- `damageView.js` (72) Top-down damage plan of a ship drawn on a small canvas: hull outline, watertight compartments (water level), machinery, magazines, directors, funnels, masts, gun… [drawDamage] ← 1
- `director.js` (240) The automatic director: what is worth looking at, and from where. [Director, formations, attacks, dogfights] ← 2
- `minimap.js` (172) The map in the corner: the islands, the bases, every ship (an arrow in the colour of her team, pointing where she goes), the aircraft in the air, the selected ship… [niceLength, mapExtent, createMinimap] ← 2
- `mobile.js` (136) The touch interface: a compact top bar and a menu in place of the desktop buttons, panels that open on demand, a virtual stick for the free camera and the map, full… [joyKeys, initMobile] ← 2
- `mobileStyle.js` (78) Style of the touch interface (body.mobile). [MOBILE_CSS] ← 1
- `ui.js` (888) DOM user interface (French): fleet setup, HUD, labels, kill feed, results, settings. [createUI] ← 1

## js/viewer/

- `controls.js` (100) Mouse / touch / keyboard control of the viewer camera. [attachControls] ← 1
- `dom.js` (23) Tiny DOM helper shared by the viewer and the wiki: h('div', { class: 'x', onclick }, child, [children]...). [h, $] ← 6
- `panel.js` (216) The viewer's interface: subject menu, view / light / render / model options, and the action buttons (screenshot, debug link...). [createPanel] ← 1
- `scene.js` (220) The viewer's 3D scene: one subject (ship, aircraft or catapult floatplane) at the origin, an orbit camera around a target point, a sun that can follow the camera, and… [createScene] ← 1
- `state.js` (72) Viewer state and its short URL form (the "debug link": subject, camera, light and model options in the query string). [LIGHTS, DAMAGE, screen, defaults, toQuery, fromQuery] ← 4
- `subjects.js` (73) Everything the 3D viewer (and the wiki) can show: the 30 ships, the carrier aircraft and the catapult floatplanes. [ROLE_NAMES, SHIP_NAMES, shipName, kindOf, aircraftSpec, isSubject, labelOf, subjectGroups, ALL_KEYS, … +2] ← 5

## js/wgsl/

- `clouds.js` (491) Volumetric cumulus: a layer of real clouds with a flat base and heaped tops, that the camera can be under, in or over, that hides an aircraft flying behind or through… [CLOUD_NOISE, WEATHER_SIZE, WEATHER_KM, CSHADOW_SIZE, CSHADOW_KM, CLOUD_SHADOW_FN, NOISE_GEN, WEATHER, CLOUD_SHADOW, … +3] ← 3
- `common.js` (243) Shared constants and WGSL snippets. [N, LOGN, CASCADES, SKY_W, SKY_H, ENV_SIZE, ENV_MIPS, FRAME_WGSL, FLASH_WGSL, … +7] ← 7
- `ocean.js` (315) Ocean surface + sky background rendering. [SKY_BG, OCEAN, WATER_PROBE] ← 1
- `particles.js` (251) Camera-facing particle quads: smoke, fire, spray, tracers, flashes. [PARTICLES] ← 2
- `post.js` (130) Bloom (dual-filter chain) and final composite with AgX tonemapping. [BLOOM_DOWN, BLOOM_UP, COMPOSITE] ← 1
- `ship.js` (840) Warship surface shader. Lit with the same sky / sun / aerial-perspective model as the ocean so ships sit in the scene. [SHIP, SHIP_SHADOW] ← 1
- `sim.js` (444) FFT ocean simulation (Tessendorf) — 4 cascades of 256^2. [SIM_INIT, SIM_EVOLVE, FFT_ROWS, FFT_COLS, SIM_MIPS, FOAM_TEX, RGBA8_MIPS, FOAM_RES, FOAM_UPDATE, … +1] ← 1
- `sky.js` (503) Physically based atmosphere (Hillaire 2020 style LUTs) + procedural cloud deck. [TRANS_LUT, MS_LUT, SKYVIEW_LUT, SKY_RENDER_FUNCS, SKY_CLOUD_FUNCS, ENV_CUBE, CUBE_MIPS, SUN_VIS] ← 5

## js/wiki/

- `aircraft.js` (35) "Aviation": the carrier aircraft of every nation, the catapult floatplanes of cruisers and battleships and the land-based bombers of the island airfields. [renderAircraft] ← 1
- `card.js` (120) The detail card (drawer) of a ship or an aircraft: embedded 3D viewer, key figures as bars, the statistic sections from the spec sheet, the estimated values and the… [createCard] ← 1
- `compare.js` (54) "Comparatif": the 30 ships in one sortable, filterable table. [renderCompare] ← 1
- `data.js` (247) Data adapter of the wiki: reads the same spec sheets as the game (js/game/data, js/game/model/planes.js) and turns them into display records (French labels, number… [fr, SHIPS, SHIP, nationShips, nationInfo, nationBySlug, MAXIMA, bars, describeMounts, … +13] ← 7
- `flags.js` (21) Small national flags (simplified drawings, 3:2) and the accent colour of each nation's tree. [ACCENTS, flagSVG, slug] ← 5
- `layout.js` (68) Tech-tree layout of one nation (pure functions, no DOM): tiers in columns (left = oldest), the five ship types in rows (lanes), a ship in the cell of its tier and its… [G, layoutNation] ← 2
- `profile.js` (135) Little silhouettes drawn from the spec sheets: the side profile of a ship (hull length, funnels, masts, turrets, island, flight deck at their measured positions, in… [iconScale, shipProfile, aircraftTop, lighten, darken] ← 4
- `styles.js` (199) Styles of the wiki, injected by js/wiki.js (kept in a module so the page is a plain shell and the whole wiki lives in js/wiki/). [CSS, injectStyles] ← 1
- `tiers.js` (14) Tiers of the tech tree: six eras, cut by the year the class entered service. [TIERS, tierOf] ← 4
- `tree.js` (68) Renders the tech tree of one nation: columns = tiers, rows = ship types, nodes = ships, lines = successions. [shipNode, renderTree] ← 1

## Outils (node tools/<nom>.mjs)

- `airtrace.mjs` The take-off and the landing of the aircraft of an island airfield, step by step: node tools/airtrace.mjs [seed] [seconds] For one bomber and one fighter: every half…
- `audiolab.mjs` Offline look at the procedural sounds (nobody has to listen): renders each sound to a buffer and prints duration, peak, RMS, spectral centroid, the share of energy in…
- `arcs.mjs` Plan views of the firing arcs of every ship: node tools/audit/arcs.mjs [ship,...] > arcs.json, then python3 tools/audit/arcs.py arcs.json out/audit (each mount's arc…
- `check.mjs` Geometric audit of the mounts of every ship: node tools/audit/check.mjs [ship,...] Reports the mounts that are buried in a structure, that float (nothing under them),…
- `overlap.mjs` Volume audit of every gun house and light AA mount: node tools/audit/overlap.mjs [ship,...] [-v] Each house (the box of the mesh that is drawn, turned as it stands at…
- `baseshots.mjs` Pictures of the military bases in a running battle: node tools/baseshots.mjs "<url>" <outDir> <shots.json> [width] [height] [timeoutSec] GPU=hardware WSLENV=GPU…
- `benchrun.mjs` Runs the in-game performance test (ui/bench.js) in the browser of the tools and prints its report: node tools/benchrun.mjs [medium|large] [extra url parameters]…
- `browser.mjs` Chromium launch options shared by the tools (smoke test, shader check, trailer recorder, reference views).
- `cockpitshots.mjs` Pictures of every aircraft from the pilot's seat (ahead, to each side, behind over the shoulder, down at the floor) and from outside close to the cockpit:…
- `codemap.mjs` The map of the code, generated: docs/CODEMAP.md lists every file of js/ (what it is, how long, what it exports, how many files use it) and the scripts of tools/ and…
- `damagecheck.mjs` Balance check of the damage model: node tools/damagecheck.mjs [seconds] [seeds] [filter] Runs a set of duels and small fleet battles headless and reports, per…
- `decktrace.mjs` The take-off and the landing of carrier aircraft, step by step: node tools/decktrace.mjs [seed] [seconds] For the first aircraft of each kind: every quarter of a…
- `directorlog.mjs` Watches the automatic camera in a running battle and keeps a picture of each kind of shot: node tools/directorlog.mjs "<url>" <outDir> [seconds] GPU=hardware…
- `flockshots.mjs` Pictures of the automatic camera's shots of aircraft in groups (formations in the air, attacks by several aircraft on one ship, two aircraft fighting), every view of…
- `gunshots.mjs` Pictures of the defensive guns of every aircraft that has a gunner: the whole aircraft from the side, from above, from the rear quarter above and below, and the guns…
- `modelbench.mjs` The time it takes to build every ship model, and a fingerprint of the result (the same fingerprint = the same models): node tools/modelbench.mjs
- `perf.mjs` Where the time of a frame goes in a running battle: node tools/perf.mjs "<url>" [seconds] [profileSeconds] GPU=hardware WSLENV=GPU "/mnt/c/Program…
- `check.mjs` Render the matte views listed for a ship in tools/refs/plans.json (?matte=1: flat green background), for silhouette.py to compare with the plans.
- `planecheck.mjs` Render the matte top and side views of an aircraft model of the preview scene (nose to the right), for planecheck.py.
- `shots.mjs` Take screenshots of the 3D models in the preview scene, from camera positions given in a JSON file.
- `views.mjs` Standard camera set for comparing a procedural model with photographs: starboard profile, bow and stern three-quarter views and a close look at the forecastle, with…
- `runtests.mjs` Runs the tests of test/ in parallel (each is a script of its own: node test/<name>.mjs) and tells which failed: node tools/runtests.mjs every test of test/tests.json…
- `screenshots.mjs` Screenshots of the game for the README (docs/*.jpg): a real battle on the GPU, the page captured with its interface.
- `shellshots.mjs` Pictures from the cameras of the ships towards the enemy in a gun battle (the shells in flight, the hits): node tools/shellshots.mjs <outDir> [extra url parameters]…
- `simbench.mjs` The cost of the simulation alone (no browser): node tools/simbench.mjs [scenario] [seconds] [seed] [islands] [bases] Runs the battle as the game would at time scale 4…
- `site.mjs` Assemble the files of the published site into _site/: node tools/site.mjs this checkout, at the root of the site node tools/site.mjs --main <dir> --dev <dir> [--out…
- `skyshots.mjs` Pictures of the sky and the clouds: node tools/skyshots.mjs <outDir> [extra url parameters] GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe"…
- `smoke.mjs` Browser smoke test: start a battle in headless Chromium (software WebGPU when there is no GPU), switch through the cameras and the quality presets and fail on any…
- `assemble.mjs` Edit and encode the trailer from the frames written by record.mjs.
- `compare.mjs` Side-by-side comparison of a published trailer with the same edit re-recorded by the current game.
- `music.mjs` Render the trailer score to <out>/music.wav with the browser's OfflineAudioContext.
- `record.mjs` Offline recorder for the trailer: renders the scripted scenes of js/trailerScenes.js frame by frame with WebGPU in a headless Chromium (SwiftShader when there is no…
- `screens.mjs` Records the interfaces for the trailer (the wiki, the 3D viewer, the phone interface) as image sequences that tools/trailer/assemble.mjs reads like any other shot.
- `uishots.mjs` Pictures of the interface in a running battle, to judge it: node tools/uishots.mjs <outDir> [width] [height] GPU=hardware WSLENV=GPU "/mnt/c/Program…
- `unused.mjs` Exports that nothing imports: node tools/unused.mjs (the candidates for dead code: check each before removing it;
- `wgslcheck.mjs` Compile the WGSL shaders with a real WebGPU device (headless Chromium) and print the compiler messages.

## Tests (liste et durées : node tools/runtests.mjs --list)

- `air.mjs` Air operations check: carriers launch strike waves, aircraft attack, are shot down or land again.
- `airops.mjs` Strike formations and the light anti-aircraft magazines: node test/airops.mjs
- `audio.mjs` Audio engine smoke test with a stub Web Audio API: every sound is synthesised, every battle event is mapped, the continuous voices follow their sources.
- `balance.mjs` The damage multipliers: node test/balance.mjs — config/balance.json is complete and valid, the layers (neutral, file, browser) stack, and each multiplier changes the…
- `basemesh.mjs` The look of the bases: node test/basemesh.mjs — the models of the layouts of several seeds and nations build, every building has an intact and a ruined mesh, the…
- `bases.mjs` Military bases on the islands: node test/bases.mjs — where they are put, how the ground is levelled, who owns them, that a seed gives the same bases.
- `basesim.mjs` What the bases do: node test/basesim.mjs — the batteries fire, the ships and the bombs wreck what stands on the ground, the airfields send out their aircraft and take…
- `battle.mjs` Headless battle: node test/battle.mjs [seconds] [fleetA] [fleetB] [seed] fleet = comma list of id[:count], e.g.
- `bench.mjs` The performance test's report: node test/bench.mjs — the figures of a view, what the A/B views say, the text of the report.
- `bombers.mjs` The land-based bombers (B-17G, G4M1, Lancaster, He 111 H, SM.79, LeO 451): node test/bombers.mjs The sheets are checked against the published dimensions, the meshes…
- `cockpit.mjs` The cockpits seen from the pilot's seat: node test/cockpit.mjs
- `codemap.mjs` The map of the code (docs/CODEMAP.md) is up to date and every file of js/ says what it is: node test/codemap.mjs
- `damage.mjs` Location-based damage: node test/damage.mjs A hit damages what is at the point of impact: modules, flooding side, destroyed parts, bomb penetration, explosions.
- `damagesites.mjs` Where an aircraft smokes and burns: node test/damagesites.mjs — the sites lie on the aircraft, a hit engine of a multi-engine aircraft is one engine, smoke and fire…
- `deckops.mjs` Flight-deck operations: node test/deckops.mjs [carrier ids] A carrier launches a wave from the deck park and the lifts, the wave is called back and lands one aircraft…
- `director.mjs` The automatic camera director: node test/director.mjs — what warms a ship, which moments cut the shot, that shots do not repeat, that a hidden ship is noticed.
- `effects.mjs` The visual effects fed by a real battle (no GPU: the particle pool and the foam are stubs): node test/effects.mjs Every kind of event of a fleet fight with carriers…
- `fighters.mjs` Carrier fighters: node test/fighters.mjs Two carrier groups: the strikes leave with fighters as escort, a patrol goes up when enemy aircraft come near the fleet, the…
- `fleet.mjs` The order of battle of a fleet: node test/fleet.mjs
- `flight.mjs` The flight physics against the published figures: node test/flight.mjs — every aircraft flown alone, level at full power, climbing, in a sustained turn, rolling,…
- `flyby.mjs` The fly-by camera (the view "passage" of the aircraft cameras): node test/flyby.mjs — a camera placed ahead of an aircraft that flies by, with a long approach, clear…
- `fuzz.mjs` Random battles: node test/fuzz.mjs [count] — checks for exceptions, NaNs, runaway ships and stuck games.
- `gunners.mjs` The gunners of the bombers: node test/gunners.mjs — the fields of fire of each gun position, where the rounds leave from, the guns turning onto a fighter.
- `gunnery.mjs` Gunnery choices: node test/gunnery.mjs The shell chosen against the target, the magazines (rounds, kinds, changing over), and mounts that engage targets of their own.
- `hitbox.mjs` Hit volumes against the real geometry: node test/hitbox.mjs [ship ids] [rays per ship] [--dump] Shells are traced through the hit volumes of the simulation…
- `homeward.mjs` The way home: node test/homeward.mjs Aircraft that have attacked keep out of the reach of the enemy guns (ships' and bases') on the way back, and the aircraft of a…
- `islands.mjs` The islands: node test/islands.mjs — generation, line of sight, running aground, shells and torpedoes on the shore, the AI going round, battles with islands.
- `lint.mjs` ESLint over the code (no-undef and the like: names that do not exist in paths the tests do not run): node test/lint.mjs — skipped when eslint is not installed.
- `manual.mjs` Proves that a ship can be driven by a human-style controller through the same ShipCommand as the AI: node test/manual.mjs
- `mobile.mjs` The touch interface: node test/mobile.mjs — what counts as a phone, the pixel density cap, the keys a virtual stick holds down.
- `models.mjs` Sanity checks for all ship models: node test/models.mjs
- `mounts.mjs` Every gun of every ship: node test/mounts.mjs Geometry (no mount buried in a structure, none on top of another, every gun has an arc to train over, the casemates and…
- `overlap.mjs` No gun house is sunk in a structure, a funnel, a mast or another house: node test/overlap.mjs (the audit is tools/audit/overlap.mjs)
- `particles.mjs` The particle pool: node test/particles.mjs — when it is full, the flashes of a shot take the place of old smoke instead of being lost.
- `planehit.mjs` The hit volume of aircraft: node test/planehit.mjs An aircraft is hit by what its airframe presents to the line of fire (sim/airhit.js): the type, the aspect and…
- `preload.mjs` What is built while the first screen plays: node test/preload.mjs
- `preset.mjs` Run a preset scenario headless: node test/preset.mjs <presetId> [seconds] [seed]
- `realism.mjs` The historical behaviour of the damage model: node test/realism.mjs Penetration against the published tables, plates struck at an angle, fuzes (arming, delay, duds),…
- `spin.mjs` What turns on a ship: node test/spin.mjs — the screws and the rudders, the radars, the directors, and the matrix they are drawn with.
- `ui.mjs` Finding one's way in the interface: node test/ui.mjs — the line that says what the camera shows, the area and the scale bar of the map.
- `vegetation.mjs` The plants of the islands: node test/vegetation.mjs — where they grow, the meshes of each species at each level of detail, the stamping of a square of ground.
- `wiki.mjs` The wiki and the viewer without a browser: node test/wiki.mjs Every ship and aircraft has a record, a tier, statistic sections and silhouettes;
