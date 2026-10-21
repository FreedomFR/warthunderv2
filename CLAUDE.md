# Naval combat simulation (WWII) — guide for Claude Code

Autonomous WWII naval battle on the Noniv/web-ocean WebGPU engine: 30 real ships (6 nations × 5 types) built procedurally from
spec sheets, AI-only combat, many cameras, modular damage, procedural sound. No build step is needed to play.

**The owner speaks French: answer in French** (code, comments, commit messages and CHANGELOG are in English; README and TODO in French).
Read `TODO.md` for what is left to do and `CHANGELOG.md` for what changed. The owner asked to push to GitHub after every major change;
work on a feature branch and open the pull request into `dev` (not `main`); once the owner has validated what is in `dev` they ask for it to be put on `main` (a pull request `dev` -> `main`), and they tag the release themselves. Never push to `main` or `dev` directly unless asked to.

## Find your way

- `docs/CODEMAP.md`: **every file of `js/`, one line each** (what it is, size, exports, how many files import it), then the scripts of `tools/` and `test/`. Generated: `npm run map` (a test fails when it is stale, and when a file of `js/` lacks its header comment: the first comment of a file says what it is, keep it true).
- `node tools/codemap.mjs --find word`: the files whose name, purpose or exports contain the word. `node tools/unused.mjs`: exports nothing imports (dead code candidates).
- The table below says which files take part in a topic; `docs/ARCHITECTURE.md` (French) explains how the parts fit together; `TODO.md` what is left, `CHANGELOG.md` what changed (newest first: read the top).
- Lines of the source are long (up to 250 characters): read with `cut -c1-220` or by ranges.

## Run and check

```bash
npm install                 # playwright-core and esbuild: only the tools need them
node server.mjs 8080        # then open http://localhost:8080/ in a WebGPU browser (recent Chrome or Edge)
npm run test:fast           # the quick tests on several processes: about 25 s: run it after every change
npm test                    # every test (models, damage, audio, manual control, air ops, fuzz, battles: no GPU needed) on several processes: under 2 minutes
node tools/runtests.mjs --only audio,ui   # some tests; --list: the tests and their times; --serial: one at a time; --verbose: the output of the ones that pass
npm run check:shaders       # compiles the WGSL with a real WebGPU device (server must be running; from WSL with the Windows Node, see below)
npm run smoke               # browser smoke test, offscreen mode (server must be running)
npm run build               # js/ + index.html -> naval.html (single file); rebuild before committing changes under js/
```

A new test is a file `test/<name>.mjs` (a script that prints `PASS` / `FAIL` lines and exits non-zero on failure) **listed in `test/tests.json`** (the runner refuses a test that is not listed; `slow: true` keeps it out of `test:fast`).

The browser tools (`tools/browser.mjs`) render with software WebGPU (SwiftShader) unless `GPU=hardware`, and use `CHROME=/path/to/chrome`
(default: the installed Google Chrome). On a PC with a GPU run them with `GPU=hardware` (checked on an RTX 3080: about 60 fps, and the
on-screen canvas works too; in software rendering only `?offscreen=1` works, so the tools load the game with it).

**WSL2** (the owner's PC: Debian 12 under WSL2, RTX 3080): Linux Chrome cannot reach the GPU there (Debian's Mesa has no Vulkan-on-D3D12
driver) and silently falls back to SwiftShader. Keep `node server.mjs 8080` in WSL and run the browser tools with the Windows Node, which
drives the Windows Chrome (D3D12) and reaches the WSL server through localhost forwarding:
`GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/smoke.mjs`. `npm test` and `npm run build` stay on the Linux Node.
Software rendering is slow: 10–25 s per frame at 800×450 with the ocean on; add `?ocean=0` for model views (about 10 s per shot).

## Where things are

| Topic | Files |
|---|---|
| Ship data (spec sheets) | `js/game/data/specs/<nation>.js` (fields marked `estimated` are guesses), `ships.js` |
| Ship meshes | `js/game/model/shipbuilder.js` (`buildShipModel(spec, tweaks)`), per-ship hand tuning in `tweaks.js`, paint in `livery.js` |
| Collisions, what turns | `model/layout.js` (how a house sits among the structures: `buriedIn`, `clearHouses`), `tools/audit/overlap.mjs` (the audit; `npm test` runs it), `model/screws.js` (screws and rudders of the classes without measured ones), `render/shipVisual.js` (`spinAbout`: screws, rudders, radars, directors) |
| Gun turrets | `js/game/model/mounts.js`: `FAMILY` (measured dimensions per turret type), `mountDims()`, house builders |
| Firing | `js/game/sim/weapons.js` (muzzle position of each barrel, `recoilCurve`, `muzzle` event), `js/game/render/effects.js` (`muzzle`, `blast` in `render/fx/guns.js`; `flashLight`: the light of a flash on the ship, the sea and the smoke, `FLASH_WGSL`, `engine.setFlash`), `render/particles.js` + `js/wgsl/particles.js` (particle kinds incl. `FIREBALL`) |
| Military bases | `sim/bases.js` (layouts: where the airfields and batteries go, the levelled pads, who owns them), `sim/baseops.js` (live state `BaseSim`: coastal guns, base AA, damage to buildings / guns / parked aircraft, `world.bases`), `sim/airfield.js` (taxi, take-off, level bombing, landing, patrols of the aircraft of a base), `model/base*.js` + `render/baseVisual.js` (how they look), `tools/baseshots.mjs` (pictures in a running battle), tests `test/bases.mjs`, `basesim.mjs`, `basemesh.mjs`; URL `bases=0|1|2` |
| Interface | `ui/ui.js` (setup panel, top bar, camera bar, ship and aircraft panels, hit log, scoreboard, settings, help, keys incl. Esc and K), `ui/minimap.js` (the map), `ui/caption.js` (the line saying what the camera shows), `ui/mobile.js` + `mobileStyle.js` (touch: it presses the desktop buttons by their label), styles in `index.html`; pictures `tools/uishots.mjs`; test `test/ui.mjs` |
| Automatic camera | `ui/director.js` (what is worth watching: heat of the ships, big moments, choice and pacing of the shots, `formations()`, `attacks()` and `dogfights()` for the aircraft in groups), `ui/cameras.js` (the shots themselves: `computeVersus`, `computeWide`, `computeBase`, `computeFormation`, `computeAttack`, `computeDogfight`...), `test/director.mjs`, `tools/directorlog.mjs`, `tools/flockshots.mjs` |
| Sky and clouds | `wgsl/sky.js` (atmosphere LUTs, the flat cloud layers: the high one always, the low one for reflections and at low quality), `wgsl/clouds.js` (volumetric cumulus after Nubis / three-clouds: noise, coverage cells, shadows on the sea, the march, the temporal resolve, the composite), `engine.js` (`clouds`, `setClouds`, the main pass split round the clouds); pictures `tools/skyshots.mjs`, URL `vclouds=0`, `clouds=0..1`, `sunElev=` |
| Cockpits | `model/cockpit.js` (`cockpitEye`, `canopyFrame`, `buildClosedTub` for a single-engine aircraft under a canopy, the open cockpits, `buildHeavyCockpit`), `model/planes.js` (part `cabin`, `cockpitHole`, `upperWingY`), `render/aircraftVisual.js` (`addCockpit`; the propeller blur goes to `particles.propDisc`); pictures `tools/cockpitshots.mjs`, preview `?preview=plane:<type>&cockpit=1&look=yaw,pitch`; test `test/cockpit.mjs` |
| Damage balance | `config/balance.json` (multipliers of the damage taken, by cause; built into naval.html by `build.mjs`), `data/balance.js` (`BALANCE`, the layers neutral / file / browser), applied in `Ship.applyDamage`, `modules.js` (`damageModule`, `damageMount`), `hitPlane`, `damageBase`; panel Réglages -> Dégâts in `ui/ui.js`; test `test/balance.mjs`. Tests run with the neutral values (all 1) |
| Bomber gunners | `model/planeGuns.js` (every gun position: pivot, field of fire, calibre, rest; `drawGunHead`), `sim/fighters.js` (`bomberDefense`: each position aims, slews and fires; `p.gun[i]` = yaw, pitch), `render/aircraftVisual.js` (`addGuns`), housings in `model/heavy.js` (`drawGuns`); pictures `tools/gunshots.mjs`, preview `gunaim=yaw,pitch` |
| Flight physics | `sim/airperf.js` (`PERF`: the published figures of each type, roc / roll / nmax / brakes; `aeroOf`: power and drag fitted to the top speed and the climb, stall speed, induced drag; `dragAcc`, `thrustAcc`), `sim/flight.js` (`guide`: forces, the lift as one pull tilted by the bank, roll rate, stall and g limits, push overs; `setVel`); test `test/flight.mjs` (prints the table against the published figures) |
| Aircraft: who does what | `sim/aircraft.js` (the carrier air wing: launches, strike formations, phases `cruise` ... `egress` / `return` / `pattern`, bombs), `sim/planeaa.js` (the ships' anti-aircraft fire at aircraft), `sim/planedamage.js` (`hitPlane`, `killPlane`, the death throes, ditching, crash), `sim/flight.js`, `sim/fighters.js` (dogfights, bomber gunners), `sim/homeward.js` (the way home), `sim/routing.js` (where the guns are, the approach), `sim/airfield.js` (the aircraft of a base) |
| Take-off and landing | `sim/deck.js` (carrier deck: run, wires), `sim/aircraft.js` (`assemble` climb, carrier circuit `pattern` / `final`), `sim/airfield.js` (runway run, `climb`, the left-hand circuit `return` legs `down` / `base`, `lfinal` with the flare, `lroll`); traces `tools/decktrace.mjs`, `tools/airtrace.mjs`; the way home after the attack (course round the enemy guns, closing up behind a leader): `sim/homeward.js`, test `test/homeward.mjs` |
| Sound | `audio.js` (the bus, `play`, geometry), `audio/events.js` (battle events -> sounds), `audio/loops.js` (continuous voices that follow their sources: engines, ship machinery, water in the hull, steam, fires, bases, torpedoes, the shore), `audio/propagation.js`, `audio/synth/*.js` (builders by family: guns, impacts, explosions, engines, aircraft, ambience, `water.js` = bubbles and flows), `synth/levels.js` (target loudness of every sound: add one for each new sound), `synth.js` (`LOOPS` / `LONG` sets); look at a sound without listening: `node tools/audiolab.mjs <name> --png dir`; test `test/audio.mjs` |
| First screen and preloading | `index.html` (`#splash`: the trailer clip `docs/loading.mp4` over a bar, `window.__splash.set(label, 0..1)` / `hide()`; `?splash=0` skips it), `js/main.js` (the order of the start and what is awaited), `js/game/preload.js` (models of every ship and aircraft), `audio.js` `early()` + `audio/synthPool.js` (sounds on workers); test `test/preload.mjs` |
| Performance test on a device | `ui/bench.js` (a scripted battle filmed from fixed views with settings switched off in turn, a warm-up first; ends with a report to copy / share), `ui/benchprobe.js` (CPU by part, long tasks, histogram, particle census), `engine.js` `stats.passMs` (GPU time by pass), button in the setup panel and the settings, `?bench=1`, `tools/benchrun.mjs`; test `test/bench.mjs` |
| Performance | `tools/perf.mjs` (a running battle on the GPU: CPU time per part of the frame, frame-time percentiles, worst frames, CPU profile), `tools/simbench.mjs` (the simulation alone + a fingerprint of the outcome: an optimisation must keep it), `tools/modelbench.mjs` (ship model build time + a fingerprint of the meshes) |
| Simulation | `js/game/sim/` (world, ship, ai, aircraft, modules/damage, explosions); `test/` |
| 3D viewer, wiki | `viewer.html` + `js/viewer.js`, `js/viewer/` (scene, controls, panel, state = the debug link, subjects); `wiki.html` + `js/wiki.js`, `js/wiki/` (data adapter, tiers, layout, tree, card, profile = silhouettes drawn from the specs); test `test/wiki.mjs` |
| Damage model | `sim/penetration.js` (De Marre, obliquity, fuzes), `sim/damage.js` (hit resolution), `data/protection.js` (belt inclination, torpedo protection, navy powder / fuzes / damage control; `estimated` marks guesses), `tools/damagecheck.mjs` (balance: duels, `zones`, `torp`), `test/realism.mjs` |
| Trailer | `js/trailer*.js`, `tools/trailer/` (`record.mjs`, `assemble.mjs`, `edit.json`; needs ffmpeg), scene `firetest` films a salvo |
| Island bases (look) | `js/game/model/baseMesh.js` (`buildBaseModel(layout, nation, { biome })`: ground work, decoration, one entry per part and gun), `baseParts.js` (hangar, tower, tank, barracks, radar, magazine, post: intact / ruin / fine / spin groups), `baseGuns.js` (emplacements, mount specs), `baseKit.js` (paints by nation, helpers); `js/game/render/baseVisual.js` (`BaseVisuals`, drawn from `BaseState`); `test/basemesh.mjs`; layout and state in `sim/bases.js` |
| Reference photographs | `tools/refs/` (see its README) |
| README pictures | `docs/*.jpg`: the interface ones from `tools/screenshots.mjs` (GPU), the others from the trailer scenes' frames and the preview scene (see CHANGELOG 0.1.0) |

Useful URLs: `?scenario=duel&start=1&seed=3`, `?preview=iowa,yamato&offscreen=1&w=1280&h=720&parked=6&fov=38&ocean=0` with
`window.__preview.set({ target, heading, dist, az, el, lookY, lookX })` (heading 90 = bow towards +x, az 180 = starboard profile), `?quality=low|medium|high`.

## Adding fidelity to a ship (the "lot" workflow)

1. Collect free photographs and, above all, a profile / plan drawing (`tools/refs/search.py`, `fetch.py`), note licences, credit them in
   `README.md` and `tools/refs/sources.jsonl`; do not commit the images. The spec positions marked `estimated` were often 10-40 m off.
2. Measure on the drawing (overlay it on the model with `tools/refs/overlay.py`): positions go in the spec sheet (`fractionFromBow`,
   secondary `offsetM` / `heightM` / `baseM`, funnel and mast heights, a `measured` note), shapes in `tweaks.js` (`fb` freeboards,
   `planDeck` / `planWL`, `house.plan`, `decks`, tower `tiers` with `towerF` / `towerY0`, `dir0`, `foremast`, `funnels`, `directors`, `cat`).
3. Gun turrets: add or adjust a family in `mounts.js` (house height and length, trunnion height, barrel spacing, muzzle distance, port,
   barbette height `barb` and superfiring `lift`), then set `mainVariant` / `secVariant`. Real gun houses are low (3-4.5 m).
4. **Check it in metres, not by eye**: `node tools/refs/check.mjs <ship>` renders matte silhouettes (side and plan view) with the cameras
   of `tools/refs/plans.json`, then `python3 tools/refs/silhouette.py <ship> side out/check/<ship>_side_render.png` (and `top`) prints
   the mean / worst difference with the drawing station by station, above and under water, and writes a picture (red: only on the
   plan, blue: only on the model). Check each drawing's scale against known depths first (the Yamato profile is drawn 10 % flat:
   `vscale` in plans.json). `stack_top.py` puts the plan view above a top view of the model (AA, boats, turrets).
   Light AA (`aa`), boats (`boats`), screws / rudders / keel / bulb, conning tower, bridge wings and rails come from the plan too; only
   the machinery rooms (spec `machinery`) are from published descriptions.
5. Compare with the photographs from the same angles (`views.mjs` + `shots.mjs`), then film the salvo with the `firetest` scene
   (`--q mount=A`, `--q group=sec`). Add a livery in `livery.js` if needed.
6. Run `npm test` and `npm run check:shaders`, rebuild `naval.html`, update CHANGELOG / README credits, commit.

## Conventions

- Match the surrounding code: short English comments that say why, no model or tool names in repository files.
- Particles are premultiplied-alpha billboards (CPU pool in `render/particles.js`); fire, flashes and tracers write alpha 0 so that they add light.
- Rendering is camera-relative with reverse-Z; keep the NaN/Inf guard of the HDR output.
- Keep `npm test` green; the visual work is judged on rendered frames, so look at them (contact sheets) before claiming a result.
- Do not mention model identifiers in commits, PR text or code.

## Known pitfalls (learnt the hard way)

- **WGSL**: `patch`, `macro` and other reserved words cannot be variable names; `let a = 1, b = 2;` does not exist (one declaration per `let`); variants of a shader are `override` constants set in the pipeline (see `SMOKE_DETAIL` in `wgsl/particles.js`). `tools/wgslcheck.mjs` must run on the real GPU (Windows Node) to catch these.
- **A new material** = a constant in `model/meshbuilder.js` `MAT` + a `case` in the fragment shader of `wgsl/ship.js` (the vertex carries the id in its alpha byte; ids up to 255; `mat <= 5u` tests in the shader mean the ship paints). Check the other tests of `mat ==` before reusing an id.
- **Shell**: a heredoc with backticks needs a quoted delimiter (`<<'EOF'`), or the shell runs what is between them; `pkill -f name` also matches the shell that runs the command; a command over 2 minutes is moved to the background by the tool (poll its output, do not `sleep`).
- **Pictures**: judge them from frames on the RTX (`tools/baseshots.mjs` with the Windows Node), never from the code alone; the sound cannot be heard here: `tools/audiolab.mjs --png` shows a sound's spectrogram.
- **Git**: after a pull request is merged, restart the branch from `origin/dev` (`git checkout -B <branch> origin/dev`) and push with `--force-with-lease`; the PR body is updated with `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@file`.
