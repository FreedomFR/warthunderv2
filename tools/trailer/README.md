# Trailer tools

The v0.0.1 trailer is rendered from the game itself, frame by frame, so it can be made on a machine without a GPU
(SwiftShader software WebGPU: about 10 s per 720p frame; a real GPU is orders of magnitude faster).

```
node server.mjs 8080 &                                          # serve the game
node tools/trailer/record.mjs open  out --audio 1               # scenes of js/trailerScenes.js -> out/<scene>/<shot>/00000.png (+ audio.wav)
node tools/trailer/music.mjs out tools/trailer/score.json        # the score -> out/music.wav
node tools/trailer/assemble.mjs tools/trailer/edit.json         # cut, grade, titles, sound mix -> docs/trailer-v0.0.1.mp4
```

* `js/trailer.js` — the director: builds a battle, pre-rolls the simulation until something happens (frames that only run
  physics and the wave read-back), then records shots with scripted cameras. Everything is seeded: a scene can be re-recorded identically.
* `js/trailerScenes.js` — the scenes (opening, ship roster, carrier, dive bombing, torpedo hit, battleship duel, magazine explosion, end plate).
* `js/trailerMusic.js` — the score (oscillators and filtered noise, rendered with an `OfflineAudioContext`).
* Engine switches used by the recorder: `?manual=1` (the page only renders when asked: `engine.step(dt)`), `?grid=8` and `?fft=128` (lighter ocean),
  `?stride=N` (render every Nth frame: contact sheets while developing a shot).
