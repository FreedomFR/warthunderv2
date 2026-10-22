# Reference photographs and model comparison

Tools used for the "fidelity" batches (batch 1: Iowa, Yamato, Bismarck, Essex): fetch free photographs of a ship, measure what can be
measured on them, then compare the procedural model with the photographs from the same angles.

The photographs themselves are **not** in the repository (`refs/` is git-ignored): only measurements and observations taken from them go
into the code, and each source is listed in `sources.jsonl` (title, URL, licence, author) and credited in `README.md`.

| File | Use |
|---|---|
| `search.py` | searches Commons (photographs and plans) with size and licence: `python3 tools/refs/search.py "Yamato battleship drawing"` |
| `overlay.py` | draws a profile drawing over a far, narrow-angle side view of the model at the same scale (red lines, or `--stack`) |
| `plans.json`, `check.mjs`, `silhouette.py` | the measured check against the plans (see below) |
| `overlay_top.py`, `stack_top.py` | a plan view over / above a top view of the model |
| `list_images.py` | lists the images used by Wikipedia articles: `python3 tools/refs/list_images.py "USS Iowa (BB-61)"` |
| `fetch.py` | downloads photographs from Wikimedia Commons with licence and author: `python3 tools/refs/fetch.py iowa "File title.jpg" ...` → `refs/iowa/` |
| `views.mjs` | writes a standard set of cameras (profile, bow / stern three-quarter, forecastle) scaled to each ship's length |
| `shots.mjs` | takes the screenshots of the preview scene for such a list of cameras |
| `sheet.py` | contact sheet of a folder of screenshots (needs Pillow): `python3 tools/refs/sheet.py sheet.jpg folder 2` |
| `sources.jsonl` | the photographs and drawings consulted for batch 1 (Iowa, Yamato, Bismarck, Essex) |

## Workflow for a ship

```bash
node server.mjs 8080 &                                   # the game must be served
python3 tools/refs/list_images.py "German battleship Bismarck"
python3 tools/refs/fetch.py bismarck "Some photo.jpg"     # check the licence line it prints; public domain or CC BY(-SA) only
node tools/refs/views.mjs bismarck > views.json
node tools/refs/shots.mjs "http://localhost:8080/index.html?preview=bismarck&offscreen=1&w=1280&h=720&parked=6&fov=38&ocean=0" out views.json 1280 720 900
```

### Checking a model against its plans (in metres)

`plans.json` lists, per ship, the drawings (profile `side`, plan view `top`), their calibration (stern and stem x, waterline or centre
line y, crop, `vscale` when the drawing is not drawn to the same scale vertically, `erase` for legends and aircraft drawn on the sheet)
and the cameras. Then:

```bash
GPU=hardware node tools/refs/check.mjs yamato                 # (under WSL2: the Windows node, see CLAUDE.md) -> out/check/*_render.png
python3 tools/refs/silhouette.py yamato side out/check/yamato_side_render.png   # mean / worst error, stretches beyond the tolerance
python3 tools/refs/silhouette.py yamato top out/check/yamato_top_render.png
node tools/refs/check.mjs yamato out/check colour && python3 tools/refs/stack_top.py yamato out/check/yamato_top_colour.png out/y.jpg 0.3 0.8
```

Results after the second pass (October 2026), mean difference of the silhouette height / half-breadth: Iowa 1.5 m (profile) and 0.7 m
(plan), Yamato 2.0 m (profile, 0.55 m under water) and 1.0 m (plan), Bismarck 1.3 m (profile, 0.3 m under water). Most of what is left
is thin rigging, wireless aerials and booms that the model does not try to have.

`grid.py` zooms on a stretch of a drawing with a grid in fractions of the length and in metres (to read positions and heights),
`hull.py` prints `planDeck` / `fb` / `keel` tables off a drawing, `outline.py` the profile as plateaus (decks, houses, funnels), after
`silhouette.py` has run. Lot 2: Littorio, Richelieu, Shōkaku and Illustrious have drawings in `plans.json` (the cameras are computed from
the length when the entry has none); the King George V has none. Lot 4 (cruisers): `fit_decks.py <ship> --fb "f:m,..." --skip a-b,...` turns the
profile written by `silhouette.py` into `decks:` blocks (stepped superstructure) for the tweaks entry; `plans.json` gained `rulers` / `rulerRegion` (the
observer-height dotted lines of the ONI sheets are erased automatically) and `silhouette.py` defaults the camera when there is none; `hull.py --B <beam>`
normalises `planDeck` to the real beam. Drawings that are not at one scale in both views or are low resolution (Agano, La Galissonnière, Algérie: 2-5 px per
metre) are good to about +-1 m.

### Aircraft

`node tools/refs/planecheck.mjs sbd` renders the matte top and side views of `plane:sbd` (nose to the right), then
`python3 tools/refs/planecheck.py sbd` compares them with the 3-view drawing of `plans.json` -> `planes.sbd` (real length and span, crop of
each view on the sheet, `flip` because the drawings have the nose to the left, `rotate` / `preErase` / `erase` / `invert` / `open` / `scaleBy: span` for sheets that are not clean 3-views): the width along the length every 0.1 m, the model's own length
and span against the real ones, a picture (red: only on the drawing). Set `PLANE_TABLE=1` for the width table. Wires and wheels drawn on the
sheet distort the side view's bounding box: trust the planform.

### Comparing with a plan

A profile drawing is the best reference: positions along the length and heights can be read to a fraction of a metre. Take a far,
narrow-angle starboard view of the model (heading 90, az 180, el 0, fov 4, w 2400 x h 1000, dist = 1.11 x L / (2.4 x 0.0698)), then

```bash
python3 tools/refs/overlay.py out/prof/iowa_prof.png refs/iowa/Iowa_classe_battleships_drawing.jpg out/iowa.jpg --loa 270.4 \
  --dist 1792 --fov 4 --look-y 15 --stern-x 30 --bow-x 1867 --wl-y 346 --crop-y0 0 --crop-y1 352     # add --stack to put them one above the other
```

(x of the stern and of the stem at deck level and y of the waterline, in drawing pixels). Measured values go in the spec sheet
(`fractionFromBow`, `offsetM` / `heightM` of the secondary mounts, funnel and mast heights; list them in `measured`) and in `tweaks.js`
(`fb` freeboards, `planDeck` / `planWL` half-breadths, `house.plan`, `decks`, tower `tiers`, `funnels`, `directors`, `cat`).

Preview scene: `?preview=id1,id2` lines the ships up, `ocean=0` skips the ocean (about 10 s per shot in software rendering instead of
minutes), `window.__preview.set({ target, heading, dist, az, el, lookY, lookX })` moves the camera (heading 90 = bow towards +x,
az 180 = starboard profile with the bow to the right). Add custom entries to the JSON for turrets and superstructure close-ups.

To check the muzzle blast of a ship: `node tools/trailer/record.mjs firetest out --w 800 --h 450 --stride 5 --q ship=<id>`
(the frames land in `out/firetest/fire_air` and `out/firetest/fire_deck`; a few minutes in software rendering).

## Notes

- Wikimedia Commons rate-limits (HTTP 429): the scripts wait and retry. `navsource.org` and `history.navy.mil` were not reachable from the
  cloud environment used for batch 1; from a normal PC they may be, and they have many more photographs and plans of US ships.
- The browser tools read `CHROME=/path/to/chrome` and `GPU=hardware` (see `tools/browser.mjs`); without `GPU=hardware` they render with
  the software WebGPU adapter, which works everywhere and is slow.

## 3D reference models (measurement only)

Models given as glTF (`modelTmp/*.zip`, git-ignored) are measured, never copied (see CLAUDE.md and `docs/CREDITS.md`):

| File | Use |
|---|---|
| `gltf.mjs` | `survey` (size, parts), `views` / `quarters` (orthographic pictures on white), `plan` (side / top silhouettes + the plans.json entry), `tables` (hull tables for tweaks.js from exact cuts), `cut` (half-beams at heights, sheer, sections), `heightmap`, `profile`; `--loa=` scales to the spec's length Reads a Wavefront OBJ the same way when `refs/<id>/src/` holds one instead of `scene.gltf` (one part per group and material, named after its object: `loadObj`). |
| `addplan.py`, `addspec.py` | add a plans.json entry / a spec sheet from JSON (keeps the layout of the files) |
| `chk.sh` | the measured check of a ship (renders on the GPU, prints the silhouette differences); `kagero@ref` = a second plans.json entry of the same ship |
| `gridview.py`, `crop.py` | read positions on a gridded side view / enlarge a part of a picture |
| `studio.mjs` | 9 views of a model on a plain background, lit from behind the camera (`?matte=1&bg=` in the engine) |
