# Trailer tools

The v0.0.1 and v0.1.0 trailers is rendered from the game itself, frame by frame, so it can be made on a machine without a GPU
(SwiftShader software WebGPU: about 10 s per 720p frame; a real GPU is orders of magnitude faster).

```
node server.mjs 8080 &                                          # serve the game
node tools/trailer/record.mjs open  out --audio 1               # scenes of js/trailerScenes.js -> out/<scene>/<shot>/00000.png (+ audio.wav)
node tools/trailer/music.mjs out tools/trailer/score.json        # the score -> out/music.wav
node tools/trailer/assemble.mjs tools/trailer/edit.json         # cut, grade, titles, sound mix -> docs/trailer-v0.0.1.mp4 (edit.json)
```

v0.1.0: `edit-0.1.0.json` + `score-0.1.0.json` (new scenes `roster2` and `fire_<ship>`: `SCENES.firetest(T, id)` registered for several ships), `music.mjs` into its own folder
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
