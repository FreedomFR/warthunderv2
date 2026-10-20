# Trailer tools

The v0.0.1 and v0.1.0 trailers is rendered from the game itself, frame by frame, so it can be made on a machine without a GPU
(SwiftShader software WebGPU: about 10 s per 720p frame; a real GPU is orders of magnitude faster).

```
node server.mjs 8080 &                                          # serve the game
node tools/trailer/record.mjs open  out --audio 1               # scenes of js/trailerScenes.js -> out/<scene>/<shot>/00000.png (+ audio.wav)
node tools/trailer/music.mjs out tools/trailer/score.json        # the score -> out/music.wav
node tools/trailer/assemble.mjs tools/trailer/edit.json         # cut, grade, titles, sound mix -> docs/trailer-v0.0.1.mp4 (edit.json)
```

The side-by-side comparison of 0.1.0 with the current game: record the scenes of `edit-0.1.0.json` at 960×540 and 60 fps, then `node tools/trailer/compare.mjs tools/trailer/edit-0.1.0.json --left docs/trailer-v0.1.0.mp4 --frames out/frames --labels "VERSION 0.1.0,VERSION 0.2.0" --version 0.1.0,0.2.0 --out docs/comparatif-0.1.0-0.2.0.mp4`.

v0.1.0 (1920×1080, 60 fps, about 20 GB of frames, 35 min with a GPU): `node tools/trailer/record.mjs <scene> out/frames60 --w 1920 --h 1080 --fps 60 --audio 1` for each scene of `edit-0.1.0.json`, then `edit-0.1.0.json` + `score-0.1.0.json` (new scenes `roster2`, `roster3`, `fleets`, `med` and `fire_<ship>`: `SCENES.firetest(T, id)` registered for several ships), `music.mjs` into its own folder
(`node tools/trailer/music.mjs out/music_010 tools/trailer/score-0.1.0.json`). The side-by-side comparison with 0.0.1 is made with `edit.json` re-recorded on the same scenes
(same seeds) then `ffmpeg ... hstack` (see the CHANGELOG 0.1.0). With a GPU (`GPU=hardware`, Windows Node under WSL2: see CLAUDE.md) a scene takes 20-35 s.

* `js/trailer.js` — the director: builds a battle, pre-rolls the simulation until something happens (frames that only run
  physics and the wave read-back), then records shots with scripted cameras. Everything is seeded: a scene can be re-recorded identically.
* `js/trailerScenes.js` — the scenes (opening, ship roster, carrier, dive bombing, torpedo hit, battleship duel, magazine explosion, end plate).
* `js/trailerMusic.js` — the score (oscillators and filtered noise, rendered with an `OfflineAudioContext`).
* Engine switches used by the recorder: `?manual=1` (the page only renders when asked: `engine.step(dt)`), `?grid=8` and `?fft=128` (lighter ocean),
  `?stride=N` (render every Nth frame: contact sheets while developing a shot).

Notes on the v0.0.1 edit (`edit.json`):

* `musicEnv` / `sfxEnv`: gain curves in dB (`[[seconds, dB], ...]`) applied to the score and to the game sounds, so the mix has an arc
  (quiet intro, build-up, climax on the magazine explosion). `sfxDb` on a clip adjusts the game sound of that clip only.
* The loudness is measured on a first pass and applied as one static gain (`loudnorm ... linear=true`): the dynamic mode would flatten the arc.
* `--music file.wav` and `--frames dir` override the paths of the edit list; `--keep` keeps the intermediate clips.
* Recording takes about 10 s per 720p frame on 4 CPU cores (software rendering): the 48 s trailer is 1 150 frames, about 3 hours.
* Two shots are staged for the camera (the bomb of `dive_b`, the torpedo of `torp_b`): the weapon starts close to its target, the hit is the game's own model.

## v0.2.0

The trailer `docs/trailer-v0.2.0.mp4` (87 s, 1920×1080, 60 fps) and the comparison with 0.1.0:

```
node server.mjs 8080 &
tools/trailer/record-0.2.0.sh out/f60                                    # every scene, on the GPU (Windows Node under WSL2, see CLAUDE.md): about 45 min, 18 GB
GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/trailer/screens.mjs out/screens wiki viewer phone   # the interfaces (screencast), then move out/screens/screens/* to out/f60/screens/
GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/trailer/music.mjs out/music_020 tools/trailer/score-0.2.0.json
node tools/trailer/assemble.mjs tools/trailer/edit-0.2.0.json            # -> docs/trailer-v0.2.0.mp4
```

* `js/trailerScenes020.js` — the new scenes: `isles` (a column along a green island: from the air, from the water, over the canopy), `isle_fire` (the guns really fire, the bursts on the
  hillside are shells thrown there because the line-of-fire rule does not let a flat trajectory end on a slope), `shellcam` (an armour-piercing shell followed to its target), `cockpit`
  (the pilot's seat in the take-off run and in the dive), `capsize`, `split`.
* `tools/trailer/screens.mjs` — records the wiki, the viewer and the phone interface with the browser's screencast (JPEG frames, resampled to a constant frame rate): do not run it while a scene is recording, the GPU is shared.
* `assemble.mjs` keeps the shape of a picture that is not 16:9 (bars) and `compare.mjs` makes the side-by-side comparison.

