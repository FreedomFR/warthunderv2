# Third-party code

The ocean renderer (FFT waves, CDLOD mesh, physically based sky, post-processing, WGSL shaders under
`js/wgsl/` and the original structure of `js/engine.js`) comes from
[Noniv/web-ocean](https://github.com/Noniv/web-ocean), released under the MIT license (see `LICENSE`).
It has been modified here to host a naval combat simulation (game hooks, ship rendering, wakes).

The volumetric clouds (`js/wgsl/clouds.js`) follow the method of Guerrilla Games' Nubis talks (Andrew Schneider, SIGGRAPH Advances
2015-2017) and take several formulas from [@takram/three-clouds](https://github.com/takram-design-engineering/three-geospatial)
(MIT, Copyright (c) 2024 Shota Matsuda): the coverage with a semicircle height profile and a soft edge, the erosion by the shape and
detail noises, the multiple-scattering octaves; and the shape noise of Sébastien Hillaire's
[TileableVolumeNoise](https://github.com/sebh/TileableVolumeNoise) (MIT, Copyright (c) 2017 Sébastien Hillaire). They are rewritten
in WGSL for this engine.
