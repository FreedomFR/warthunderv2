# Making a ship as faithful as possible to a reference model (measurement only)

The owner gives glTF models in `modelTmp/` (git-ignored). They are **measured, never copied**: no mesh, texture, vertex list or whole extracted outline goes into the repository. The ship is
**our own procedural model** (spec sheet + `js/game/model/ships/<id>.js` + the builder's parts), as close to the reference as the builder's vocabulary allows. The bar is high: every feature
that is visible on the reference at a normal viewing distance (and most of the ones seen close up) must exist in our model, at the right place, with the right shape and size (+-0.2 m on a
destroyer). "Approximate" is not acceptable when the reference is available.

## Coordinates and conventions

* Game ship frame: x along the ship (bow +), y up (0 = the waterline), z to starboard. Hull tables use fractions `f` of the overall length counted from the bow (f = 0 bow, 1 stern).
* Reference after `gltf.mjs` `upright`: x bow +, y up from the lowest point of the model, z starboard. `--loa=<spec loa>` scales it to the spec, `--draft=<h>` is the height of the waterline above the
  lowest point (so game y = reference y - draft).
* **Reading a grid** (`gridview.py` pictures): the label is the fraction at the LEFT edge and it DECREASES to the right (the bow is on the right). f = label - pixel / (px per metre * LOA).
  Reading it the other way round once put funnels 0.02 of the length off.
* `mount level` / `barbM` / `lift`: see `shipbuilder.js` "main battery": the pivot is `deck + barbM` (+ `lift * level` for a superfiring mount, and a `dp` kind ignores that); a `lift` is not
  added to a house you drew under it, the mount stands on the highest roof under it.

## Tools (tools/refs/README.md has the list)

```bash
# from the zip (python3 zipfile, there is no unzip) to refs/<id>/src  -- already done for the models of modelTmp/
node tools/refs/gltf.mjs survey refs/<id>/src                                  # size, parts
node tools/refs/gltf.mjs views|quarters|inside refs/<id>/src <out> --loa=.. --s=18   # side/top/front pictures; oblique ones; the hull cut open (compartments, machinery)
node tools/refs/gltf.mjs tables refs/<id>/src --loa=.. --draft=.. --B=<spec beamWaterline> --D=<spec draft> --n=40   # hull tables for the tweaks (check them: median-filtered, but a bridge wing can fool one station)
node tools/refs/gltf.mjs cut refs/<id>/src 1 --loa=.. --x=10,20 --hmax=20      # half-beam by height at stations; --y=h half-beam along the length at a height; --z=c sheer
node tools/refs/gltf.mjs slice refs/<id>/src out/slice/x.png --loa=.. --draft=.. --x0=10 --x1=24 --hz=6 --y=3,4.5,6,7.5,9 --s=40   # PLAN OUTLINES of everything at those heights above the waterline (exact; stack them with stack.py)
node tools/refs/gltf.mjs outline refs/<id>/src --loa=.. --draft=.. --y=7.5 --x0=10 --x1=24 --z0=-4 --z1=4 --tol=0.15 --minlen=3   # the same outlines as simplified [x,z] points to READ; redraw them by hand with few points
node tools/refs/gltf.mjs heightmap refs/<id>/src --loa=.. --draft=.. --cell=1 --from=-30 --to=30   # tops as characters (above the waterline)
tools/refs/pair.sh <ship> refs/<id>/src <loa> <draft> out/pair/<name>.png --az=135 --el=20 --cx=10 --cy=5 --cz=0 --w=30 --h=20 --s=30
        # THE MAIN COMPARISON: reference (left) and game (right) on the same window; az/el as the game's preview (az 180 = starboard beam, 0 port, 90 ahead, 270 astern, el = height angle);
        # cx/cy/cz = the window centre in GAME metres (cy above the waterline); w/h = window in metres
tools/refs/chk.sh <ship>                               # silhouettes (side/top) in metres against tools/refs/plans.json (the entry exists for your ship)
GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/refs/studio.mjs <ship> out/studio   # nine views on a plain background; then python3 tools/refs/sheet.py out/studio/<ship>.jpg out/studio/<ship> 3
```

The game must be served: `node server.mjs 8080` (it is already running in the owner's WSL). Browser tools run on the RTX through the Windows Node as above (never claim "to be tested on the GPU").
`Read` the PNGs to look at them. Look at **every region from several angles** (beam, bow quarter, stern quarter, from ahead, from astern, from above) before and after each change.

## Procedure

1. Spec sheet (JSON, `js/game/data/specs/<nation>.js`, edit through `python3 tools/refs/addspec.py <nation> file.json`): re-check the research (guns, shells, torpedoes, AA fit, displacement...) on the
   internet (NavWeaps, Wikipedia, Navypedia); positions in the sheet are the measured ones (fractions of the length). Keep `estimated` and `sources` honest.
2. Hull: `tables` -> tweaks `fb`, `planDeck`, `planWL`, `keel` (+ stem and stern shape options `bow`, `stern`, `bulb`...), checked with `chk.sh` and `pair.sh` (bow, stern, sections, flare, sheer,
   anchor recesses, hawse pipes, boot topping line, rails...). Props / shafts / struts / skegs / rudders from the underwater views.
3. Structures one by one: slice each structure at several heights (`slice` + `stack.py`) to get its real plan and heights, then draw it with `decks` (blocks, round blocks, prisms with
   `plan: [[f, hw], ...]`) or, for anything the generic vocabulary cannot do, in the ship's `extra(ctx)` with the MeshBuilder (`b.block`, `b.prism(poly, y0, y1, col, mat, {topScale})`, `b.cylinder`,
   `b.cyl`, `b.rod`, `b.rodZ`, `b.beam`, `b.sphere`, `b.box`; look at `ships/adams.js`, `tweaks.js` `s30Extras`, `parts.js` (`PT.*`: funnel, tower, tripod, poleMast, cageMast, radar, windowBand,
   torpedoTubes, propeller, rudder...), `mounts.js` (FAMILY + houses) for what exists). Parts that can be wrecked / are modules are made with `part(id, kind, label, drawFn, ruinFn, {fine, spin})`;
   keep the kinds the damage model expects (bridge, funnel, mast, tubes, director, radar...). Rails, ladders, davits, boats, vents, searchlights, lookout posts, flag lockers, ready-use
   lockers, life rafts, hawse pipes, bollards, windlass, anchor, depth-charge racks, mine rails, ... are all part of "visible features": do them.
4. Guns and launchers: shape and dimensions measured in situ (family in `mounts.js`), pivot height and position, barrel length, the shield / house, the director / radar on top.
5. Masts, yards, stays (`DT.stay`), rigging, radars, aerials, flags poles, ensign staff: heights and positions measured.
6. Every part you add must pass the overlap audit (`npm test` -> `overlap`): nothing floating, nothing interpenetrating without a reason.
7. Check in the game: `pair.sh` windows over the whole ship (at least 12 windows: bow, bridge, funnels, midships both sides, aft, stern; two angles each), the nine-view studio sheet, and the
   tests `node tools/runtests.mjs --only models,mounts,overlap,damage,wiki,realism,torpedoes,machinery,codemap,lint` (and `npm run map` after adding exports; `npm run build` when finishing).

## Rules

* Match the surrounding code: short English comments that say why, no model or tool names in repository files, no mention of any AI model.
* Do not paste extracted vertex lists or outlines; redraw with a few points (the reference is a measuring instrument).
* Other people work on other ships at the same time: edit only your files (`js/game/model/ships/<id>.js`, your ship's entry in `js/game/data/specs/<nation>.js` through `addspec.py`) and, when a
  new mount family or a builder option is needed, make a **small additive edit** to `mounts.js` / `shipbuilder.js` / `parts.js` (re-read the file just before, never reformat, never rename). Run
  `node --check` on a file after you edit it: a syntax error breaks everybody's previews. Do not run `git commit`, `git add`, `npm run build` or the whole `npm test`: the owner's main session does.

## Acceptance checklist (rules of the owner, for every new ship)

1. As faithful as possible to the reference (measured, +-0.2 m on a destroyer).
2. **Every weapon works in the game, whatever the era**: guns, AA, tubes, aircraft and also missiles / rockets / mortars. A launcher that is only drawn is a bug: simulate it (damage, range, arcs, stock, reload) and add a test.
3. The skin (livery, camouflage, boot topping, roof marks) checked on the render.
4. The firing arcs of every turret, mount and launcher checked (`node tools/audit/arcs.mjs <id> > a.json; python3 tools/audit/arcs.py a.json out/audit`, `test/arcs.mjs`) against the real traverse limits.
5. No visual bug: nine views on a plain background, pairs with the reference, the wiki picture.
