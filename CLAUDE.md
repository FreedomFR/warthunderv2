# Naval combat simulation (WWII) — guide for Claude Code

Autonomous WWII naval battle on the Noniv/web-ocean WebGPU engine: 30 real ships (6 nations × 5 types) built procedurally from
spec sheets, AI-only combat, many cameras, modular damage, procedural sound. No build step is needed to play.

**The owner speaks French: answer in French** (code, comments, commit messages and CHANGELOG are in English; README and TODO in French).
Read `TODO.md` for what is left to do and `CHANGELOG.md` for what changed. The owner asked to push to GitHub after every major change;
work on a branch and open a pull request into `main`, and never push to `main` unless asked to.

## Run and check

```bash
npm install                 # playwright-core and esbuild: only the tools need them
node server.mjs 8080        # then open http://localhost:8080/ in a WebGPU browser (recent Chrome or Edge)
npm test                    # models, damage, audio, manual control, air ops, fuzz, battles: no GPU needed (about a minute)
npm run check:shaders       # compiles the WGSL with a real WebGPU device (server must be running)
npm run smoke               # browser smoke test, offscreen mode (server must be running)
npm run build               # js/ + index.html -> naval.html (single file); rebuild before committing changes under js/
```

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
| Gun turrets | `js/game/model/mounts.js`: `FAMILY` (measured dimensions per turret type), `mountDims()`, house builders |
| Firing | `js/game/sim/weapons.js` (muzzle position of each barrel, `recoilCurve`, `muzzle` event), `js/game/render/effects.js` (`muzzle`, `blast`), `render/particles.js` + `js/wgsl/particles.js` (particle kinds incl. `FIREBALL`) |
| Simulation | `js/game/sim/` (world, ship, ai, aircraft, modules/damage, explosions); `test/` |
| Trailer | `js/trailer*.js`, `tools/trailer/` (`record.mjs`, `assemble.mjs`, `edit.json`; needs ffmpeg), scene `firetest` films a salvo |
| Reference photographs | `tools/refs/` (see its README) |

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
