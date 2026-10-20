# Changelog

## Unreleased — ships: no collisions, things that turn

- **Collision audit** (`tools/audit/overlap.mjs`, `model/layout.js`, `test/overlap.mjs` in `npm test`): every gun house and light AA mount is sampled in the volume of the mesh that is drawn and compared with the structures, funnels, masts and the other houses round it. The first run found **262 houses buried** (counting the pedestals): once the pedestal and the barbette of a mount are taken out, **53 pairs of light AA mounts stood in each other** (some at the very same spot), five secondary turrets of the Iowa, Yamato, Bismarck, Graf Zeppelin and Littorio were sunk in a deckhouse by up to 1.3 m, and the boats could stand in a turret.
- **Fixed in the builder**: a light AA mount is never put where another one (or a torpedo mount) already is (a measured one slides fore or aft up to 2.5 m, a random one is drawn again; 4 duplicate mounts of the Fantasque and the Soldati are gone); a gun house that is sunk in a structure slides along its deck (up to 0.7 m for a turret, 1.6 m for a lighter mount); a boat, a raft or a ventilator is kept off the real rectangle of a house, not off a circle round its pivot; a funnel whose base floated over a deckhouse that is not there (La Galissonière) now stands on the deck and keeps its top.
- **Things that turn**: the **screws** turn with the speed of the ship (`propAngle`), the **rudders** follow the helm, the **search radars** sweep round (6 to 18 turns a minute by kind), the **fire-control directors** follow the first main turret that can still train. 21 of the 30 ships had no screw or rudder at all (their underwater body was not measured): they now get the number of shafts their class had, drawn from the draught (for the eye only: the damage model keeps its own shafts and rudders). The screws show from a low angle, in the viewer with the sea off and on a wreck that rolls over; the rest is visible in play.
- **Ships that come apart**: a shell that bursts on a ship now **cuts a ragged hole in the plating** (the holes are spheres cut out of the meshes by the ship shader: the hull, the deckhouses, the funnels, and with them the boats, the rails and the fittings that stood there; the edge is charred and glows where the ship burns; through the hole one sees the dark back of the plating, or the sea). A high-explosive burst opens a bigger hole than an armour-piercing shell going in (radius up to 3.4 m), a damaged part (a funnel, a mast, a director) is riddled with three holes of its own, and every hole throws out pieces of scrap (a cosmetic stream of random numbers: the battle does not depend on it). A ship keeps up to 54 holes. None of it sinks the ship by itself.
- **Inside the holes**: one no longer sees through the hollow shell. The shader looks along the ray of the eye to the far side of the sphere that was cut out and draws a charred hollow with embers that glow in its cracks (`lcam`, the camera in the frame of the ship, is passed from the vertex stage). The **sun shadows** have the holes too (the shadow pass has a fragment stage that cuts the same spheres: light comes through a ragged funnel or a torn hull).
- **The hole and the sea**: a high-explosive burst that opens the hull at the waterline (up to 1.8 m above it) now lets the sea in, a little (`min(2.5, 0.005 kg)`, less the higher the hole): the compartments fill slowly and damage control pumps. In 3 seeds of each of the scenarios of `tools/damagecheck.mjs` the losses and their causes are as before (44 ships lost against 43, none by flooding alone).
- Tests: `test/holes.mjs`, `test/overlap.mjs`, `test/spin.mjs` (the screws and rudders of every ship, the sense and the pivot of the turning matrix, the screws that turn with the speed).

## 0.2.0 — islands, new effects, a damage model from the tables, wiki, viewer and phone (20 October 2026)

The headlines (the details are in the sections below):

- **Islands and forests**: rocks, hilly and mountainous islands drawn from the seed, procedural forests by climate, ships that run aground, shells that burst on slopes, a line of sight and arcs tested against the relief.
- **A new damage model**: De Marre penetration calibrated on published tables, armour obliquity, inclined belts, fuzes (delay, arming thickness, duds), magazine risk by powder, torpedo protection per ship, counter-flooding, capsizing.
- **Effects redone**: muzzle blast in three stages, sea splashes in stages, fires with tongues of flame, a particle pool that no longer drops the flashes of a shot (and a setting for its size).
- **Aircraft**: a hit volume for every type, redone cockpits with working dials, carrier operations (lifts, folding wings, wires), a take-off camera, aircraft that keep flying after the battle.
- **Ship shader and sound**: specular anti-aliasing, oil-canning, rust tears, salt; blast waves, ear shock, air absorption, variants, loudness calibration, binaural option.
- **Tools**: a wiki with a tech tree of the 30 ships, a 3D viewer to turn around every ship and aircraft, a touch interface for phones, the game, the wiki and the viewer online (`main` and `dev`) on GitHub Pages.
- **Videos**: a new trailer `docs/trailer-v0.2.0.mp4` and a side-by-side comparison with 0.1.0 `docs/comparatif-0.1.0-0.2.0.mp4`.

### v0.2.0 videos

- **Trailer 0.2.0**: `docs/trailer-v0.2.0.mp4` (87 s, 1920×1080, 60 frames per second, 31 MB), its animated preview and its poster. Recorded on the GPU, frame by frame, with the game's own sounds and a synthesised score
  (`tools/trailer/edit-0.2.0.json`, `score-0.2.0.json`, `record-0.2.0.sh`). Six acts: islands and forests, fire and splashes, the damage model, aircraft and cockpit, the wiki / the viewer / the phone interface (real captures), the finale.
  New scenes in `js/trailerScenes020.js` (`isles`, `isle_fire`, `shellcam`, `cockpit`, `capsize`, `split`); `tools/trailer/screens.mjs` records the interfaces with the browser's screencast; `assemble.mjs` keeps the shape of a picture that is not 16:9.
- **Comparison with 0.1.0**: `docs/comparatif-0.1.0-0.2.0.mp4` (89 s, 1920×540: two 960×540 pictures side by side, sound of the 0.1.0 trailer). The left half is the 0.1.0 trailer, the right half
  the same scenes, seeds and cuts (`tools/trailer/edit-0.1.0.json`) re-recorded with the current game (960×540, 60 frames per second, on the GPU: about 10 minutes for the 16 scenes), so the new damage model,
  fire, explosion, splash and muzzle effects, ship shader and islands can be compared shot by shot (the battles diverge since the damage model changed). New tool `tools/trailer/compare.mjs`
  (half-size edit with the titles scaled, then `hstack` and a label in each corner).

### phone: closing the panels

- **The settings panel could not be closed on a phone**: the desktop button that toggles it is hidden there, and the panel covered the menu. The top bar and the menu now sit above every panel, and the settings and the fleet setup have a cross to close them (the scoreboard and the help close from the menu or by a tap, as before).

### phone interface

- **Touch interface** for phones (`ui/mobile.js`, `ui/mobileStyle.js`, `device.js`): compact top bar and menu, camera row that scrolls, information panels opened on demand, full-screen fleet setup, a virtual stick and buttons for the free camera and the map, a landscape full-screen button, the screen kept awake in battle. The desktop interface is unchanged.
- **Phone performance**: pixel density capped at 1.5 (`createEngine` option `maxDpr`), start at the medium quality rung, 20000 particles by default.
- **Installable**: `manifest.webmanifest` and icons (full screen, landscape); `tools/site.mjs` publishes them.
- Fixed: the "Wiki" and "Visualiseur" links of the setup panel were drawn in the browser's default blue.
- Test: `test/mobile.mjs`.

### dev version online

- **The `dev` branch is published too**, in `/dev/` of the same GitHub Pages site (`main` stays at the root), with a "Version dev" badge. `tools/site.mjs --main <dir> --dev <dir>` assembles both; the workflow runs the tests of the pushed branch, then publishes both versions from their committed files (`naval.html` must be rebuilt before committing, as before).

### GitHub Pages

- **Publication**: `tools/site.mjs` assembles the files of the site (the game as the single minified page, the wiki, the viewer and `js/`: 2.2 MB, 114 files) and `.github/workflows/pages.yml` publishes them on GitHub Pages at every change of `main`, after `npm test` and `npm run build`. The log endpoint of the dev server is only called on `localhost`; the wiki links its credits to the repository.

### sound, second pass

- **Audio code split** (bit-identical at the time of the move): `audio/synth.js` (720 lines in one object) is now `synth/{core,guns,impacts,explosions,engines,aircraft,ambience}.js` merged by `synth.js` (same exports), and `audio.js` keeps the engine (bus, `play`, geometry) while the event mapping is `audio/events.js`, the continuous voices and the shell / bomb announcements `audio/loops.js`, the physics of propagation `audio/propagation.js`.
- **Variants**: every one-shot has 3 or 4 variants (different noise and different parameters: pitch of the boom, cut-offs, echo delays, the modes of the ringing plate, the number of secondary blasts), the library picks one at random and never the same one twice in a row, and builds them all in the background after the first click (no sound is synthesised in the middle of a fight). Guns are pitched by calibre ((reference / calibre)^0.3), the barrels of a turret go off a few hundredths of a second apart.
- **Loudness calibration** (`synth/levels.js`): the builders peak-normalised everything, so a bomb whistle (pure mid-range tone) was 9 dB louder to the ear than a gun report of the same peak, and the master compressor then squashed the rest. Each sound is now scaled to a target level (A-weighted RMS of its audible part plus a tenth of the raw power, so that the bass of a gun still counts), ordered like the sources: a salvo and a magazine at the top, about 4 to 5 dB per step of calibre, then machine guns and small splashes. The master bus is a gentler compressor followed by a soft clipper instead of a hard ceiling.
- **Propagation** (`audio/propagation.js`): the distance low-pass is the air absorption of ISO 9613-1 (sea air, 18 deg C and 80 %, eased to 30 % of its real strength so that a battle stays readable: a kilometre away the corner is at 2.3 kHz, three kilometres 640 Hz; it was 7.5 kHz and 3.4 kHz), second order plus a gentler second stage; the loud sounds get the second path off the sea (a delayed, low-passed copy, delay 2 hs hl / (d c)); the blast of a far gun is slightly deeper (the positive phase lengthens with distance); an island between the listener and the source takes its highs and 40 % of its level; the reverb is two spaces, the open sea (short wash, a few echoes) and rock and steel (denser, longer, slap-back echoes) mixed by the distance to the nearest island and to a big hull.
- **Shells passing close**: the rush is timed to peak at the closest point of the pass (computed from the shell's path) and a supersonic shell adds the **N-wave of its shock cone** (new sound `shell_crack`), whose length follows Whitham's law, T = 1.82 d M / (c (M^2 - 1)^(3/8)) (b / l)^(1/4): about 8 ms (a deep crack-thump) for a 406 mm shell at 100 m, under 1 ms (a snap) for a 20 mm one, longer with the miss distance.
- **Water**: splashes are built from bubbles (Minnaert resonance, 3.26 / radius Hz, with van den Doel's damping and pitch rise), the slap of the surface, the cavity roar, the collapse of the column and the patter of the drops; a torpedo adds the bubbles of its water column.
- **Explosions**: a Friedlander front on the medium ones, a variable number of secondary blasts, a shower of falling debris and a rolling echo on the big ones.
- **Machinery**: aircraft engines are built from the real frequencies (a four-stroke fires at rpm x cylinders / 120; propeller blade passing 3 x turning rate and its harmonics; a radial fires unevenly, a V-12 smoothly) and the cylinder count follows the engine's size (9, 14, 18; V-12); geared turbines whine with the shaft speed, propellers cavitate above 55 % of full speed, turret motors hum while a mount trains (pitch follows the speed) and a breech clunks when a mount has loaded; fire has ticks, pops and snaps; a long swell washes under everything.
- **Loops no longer dip where they wrap** (the builder's end fade was applied to loops too: a 20 ms dip every two seconds on the engines).
- `tools/audiolab.mjs`: renders every sound offline and prints duration, peak, RMS, A-weighted level, spectral centroid and band shares (`--variants`, `--json`), and draws a waveform + spectrogram PNG (`--png dir`) so that the sounds can be checked without listening.
- `test/audio.mjs`: levels against the targets and their order, variants that differ and never repeat, loops that wrap, firing notes of 9, 14 and 18 cylinders, N-wave length, ISO 9613-1 values, shell timing, turret and breech voices, the low-pass closing with distance.


### damage model

How ships take hits, resist them and are lost, rebuilt on published figures. It stays deterministic for a seed (the world's generator only). The events the renderer and the interface consume are unchanged;
what was added is backward compatible (`shellHit.result` may now be `dud`, `shellHit.stage`, `impact.delay`, the `counterFlood` event, `explosion.avgas`).

### armour and shells

- **Penetration comes from the shell** (`sim/penetration.js`): the muzzle figure of each gun is De Marre's rule (v^1.43, W^0.714, d^-1.07) calibrated on the 16 in / 2 700 lb Mk 8 (829 mm), which puts the 18.1 in Type 91 (849 mm against 864 in its table) and the 38 cm shell (729 mm against 742) within 2 %. It used to be a fixed multiple of the calibre (2.0 x for every big gun: 920 mm for the Yamato).
- **Oblique plates**: the effective thickness of a plate is T / cos^k, k = 0.8 at 45 degrees (a shell needs 22 % more speed) rising to 1.2 at 75 degrees (the deck case of the 16 in table, 3.9 in of deck at 20 000 yd, is reproduced within 3 %). Plunging fire therefore gets through decks only at long range, and the immune zones come out of the geometry (`node tools/damagecheck.mjs zones`; for instance 14 in shells against the Bismarck's belt: 2-19 km, 16 in shells against the Yamato's belt: 2-29 km).
- **Inclined belts** (`data/protection.js`): Iowa 19, Yamato 20, Richelieu 15.4, Littorio 13 degrees. A flat shell meets the Iowa's belt at 19 degrees and a falling one more squarely; the vertical belts of the Bismarck and King George V are struck square on.
- **Spaced plates**: a weather deck above the armoured deck (Iowa 38 + 152 mm, Bismarck 50 + 120, King George V 32 + 149) counts as De Marre's spaced plates; the carriers have a thin flight deck over the armoured hangar deck (Essex, Shokaku) or an armoured one (Illustrious). Turret roofs (0.42 of the face, as on the Iowa, Yamato and Bismarck), hull skins (a destroyer's is 10 mm), superstructure plating and the lower belt are in the stats; a shell that comes down on a turret meets its roof.
- **Fuzes** (`NAVY` table): a base fuze needs 0.07 calibres of plate square on and less at 60 degrees (published fuze tests); below that the shell goes through without arming. Delays by navy and calibre: US 0.010 s (6 in) to 0.033 s (16 in), British and German 0.035, **Japanese 0.4 s** from 8 in up (the Type 91 was built for underwater hits): the shell crosses a light ship without bursting and is stopped by the structure behind a thick plate. A share of the fuzes fail (`dud`, estimated: US 3 %, Japan 5 %, Britain, France and Italy 7 %, Germany 8 %). A shell that has crossed a thin superstructure comes down on the deck below and may burst there. Japanese shells break up on thick plate at moderate obliquity (the Type 91 in tests). The gunners' choice between AP and HE uses the same figures.
- **Destroyers are far more fragile** (a 6 in HE shell bursts among boilers and steam lines): about 15 hits of 8 in HE or 40 of 6 in HE sink a Fletcher, where about 100 of 6 in were needed; a battleship takes 300 hits of 5 in HE and keeps over 80 % of its strength.

### ammunition, fires, damage control

- **A fire on the weather deck no longer heats the magazines**, only a fire inside the citadel does (every fire anywhere above a magazine used to count, and half of the ships lost were blown up). The damage-control party floods a heating magazine in 8-22 s with a success rate by navy (`dc`: US 1.0, Britain and Germany 0.9, France 0.8, Italy 0.75, Japan 0.6); a flooded magazine silences the turret it fed.
- **Powder and anti-flash practice by navy** (`flash`): cordite in silk bags (Britain 1.5) against US single-base powder (0.75) and German brass cartridges (0.6). A hit that wrecks a turret sends a flash down the trunk with a chance that depends on the class, the navy and what is left in the turret. Magazine explosions were 39 of the 79 ships lost in the eleven check battles (four seeds); they are 9 of 77 now (destroyers 10 %, battleships 15-25 % of their losses, mostly after fires or a direct burst).
- Fires last longer with a poor damage-control party (Japan), spread, feed on a carrier's hangar, and hurt a big armoured ship less (x0.6 for a battleship, x0.85 for a heavy cruiser) than a destroyer or a carrier (x1.2).
- **Aviation fuel** (carriers): a holed fuel store lets vapour out. It is purged within 40-100 s or, if not, it explodes after 140-360 s when there is a fire (Taiho and Shokaku, 1944, were lost hours after a torpedo hit; the US lines were inert and foamed, `avgas: 'closed'`: purged in 75 % of cases against 25 % for the open Japanese system). Hangar bursts are less deadly on the American carriers. Bombs go through an unarmoured flight deck and burst in the hangar; the 76 mm flight deck of the Illustrious keeps 250 and 454 kg bombs out.

### torpedoes, flooding, loss

- **Torpedo protection by ship** (`torp.kg`, the design resistance): King George V 454 kg (1 000 lb), Iowa 320, Bismarck 250, Yamato 400 (but `flaw` 0.6: the joint between her belts), Littorio 350 (the Pugliese cylinder, flaw 0.75), cruisers 60-120 (estimated). A warhead smaller than the resistance is held better (a small aerial torpedo against the Iowa); a hit outside the length of the citadel (the shaft brackets of the Prince of Wales) meets only 30 % of it. Hits needed to sink with nothing else going on (`node tools/damagecheck.mjs torp`, 230 kg aerial / 490 kg Type 93): destroyer 1; Cleveland 5 / 3; Baltimore 6 / 3; Iowa 15 / 7; Yamato 13 / 6 (she took ten torpedoes and seven bombs); Essex 5 / 3. A destroyer lost to a torpedo breaks in two more often than not.
- **Counter-flooding**: with a list above 3 % the party floods the other side every 8-18 s (chance by navy, never on a destroyer, not when the ship is already half full); in the test a list of 0.18 comes down to 0.04. **Loss of stability**: a ship that stays past her limit (destroyer 15 degrees, battleship 19) for 12 s capsizes.
- Sinking times are longer (destroyer 40 s, light cruiser 75, heavy cruiser 100, battleship 200, carrier 180); the pumps work at the pace of the damage-control party.

### checks

- `test/realism.mjs` (in `npm test`): calibration on the published tables, obliquity, fuzes, immune zones, duds by navy, hits to sink by class, torpedo protection, magazines and fires, counter-flooding, capsizing, flight decks, fuel vapour. `test/damage.mjs`: a flat shell meets the Iowa's belt at 19 degrees. `test/fighters.mjs` runs a third seed and lets the air war go on after the last ship of a side is lost (the world stops updating aircraft then, and the carriers now die sooner, so the fighters had no time to come home).
- `tools/damagecheck.mjs`: eleven duels and fleet battles over several seeds (shots, hit rate, what sank each ship and when, fate of the hits), plus the `zones` and `torp` modes. Same four seeds before and after: ships lost to a magazine 39 of 79, now 9 of 77; a Fletcher lost to a Cleveland after about 100 hits, now 25-35; Iowa against Yamato lasted 146-444 s (one duel did not end in 1 800 s), now 246-538 s.

### sources

- navweaps, 16"/50 Mk 7 (https://www.navweaps.com/Weapons/WNUS_16-50_mk7.php): penetration of the Mk 8 shell by range (belt and deck), striking velocity, angle of fall, 0.033 s fuze delay.
- navweaps, 46 cm Type 94 (https://www.navweaps.com/Weapons/WNJAP_18-45_t94.php): Type 91 shell 1 458 kg at 780 m/s, 864 mm at the muzzle, 494 mm at 20 km; break-up at high obliquity.
- navweaps, 38 cm SK C/34 (https://www.navweaps.com/Weapons/WNGER_15-52_skc34.php): 800 kg at 820 m/s, 742 mm at the muzzle, brass cartridges.
- navweaps, 8"/55 Mk 12-15 (https://navweaps.com/Weapons/WNUS_8-55_mk12-15.php): Mk 21 shell, 10 in of side armour at 10 800 yd (our figure is about 20 % under it).
- navweaps, Nathan Okun, minimum plate thickness for base fuzes (https://navweaps.com/index_nathan/baseFuzePlateThicknessMinimums.php): 0.07 D square on, falling with obliquity. Okun's penetration tables (https://www.navweaps.com/index_nathan/Penetration_index.php): how the FACEHARD tables are built.
- Naval Gazing, Armor part 2 (https://www.navalgazing.net/Armor-Part-2): 22 % more velocity through a plate at 45 degrees, armour is not all or nothing. Fuzes part 3 (https://www.navalgazing.net/Fuzes-Part-3): US delays from 0.01 s for 6 in to 0.035 s, long-delay Japanese fuzes crossing the target. navweaps tech 041 (https://navweaps.com/index_tech/tech-041.php): Type 88 / 91 long delays, German duds.
- Naval Gazing, Powder part 4 (https://navalgazing.net/Powder-Part-4): cordite more readily ignited than US powder (a flash that lights one unit of US powder lights 75 of cordite, in a search excerpt), one capital ship lost to an accidental explosion (Mutsu), the Hood, Arizona and Roma cases.
- Wikipedia, HMS Hood (https://en.wikipedia.org/wiki/HMS_Hood): plunging fire through a thin deck, fire in the 4 in magazine reaching the 15 in magazines.
- Wikipedia, Taiho (https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Taih%C5%8D): one torpedo, aviation fuel vapour, ventilation, explosion 6.5 hours later, 75-80 mm flight deck. Shinano (https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Shinano): doors and bulkheads unfinished, counter-flooding, list to 30 degrees before capsizing. Musashi (https://en.wikipedia.org/wiki/Japanese_battleship_Musashi): 19 torpedoes and 17 bombs, counter-flooding bringing the list from 5.5 to 1 degree.
- Wikipedia, Iowa (https://en.wikipedia.org/wiki/Iowa-class_battleship), Yamato (https://en.wikipedia.org/wiki/Yamato-class_battleship), Bismarck (https://en.wikipedia.org/wiki/Bismarck-class_battleship), King George V (https://en.wikipedia.org/wiki/King_George_V-class_battleship_(1939)), Littorio (https://en.wikipedia.org/wiki/Littorio-class_battleship), Richelieu (https://en.wikipedia.org/wiki/Richelieu-class_battleship): belt inclination, deck layers, side protection depth and design resistance, the Yamato's joint, the Prince of Wales's shaft, the Pugliese cylinder, Roma and the Fritz X.
- Wikipedia, Last battle of Bismarck (https://en.wikipedia.org/wiki/Last_battle_of_Bismarck) and the USNI article "Who sank Bismarck" (https://www.usni.org/magazines/proceedings/1991/june/who-sank-bismarck): some 400 hits out of 2 876 shells, the citadel found intact. National WWII Museum on the Second Naval Battle of Guadalcanal (https://www.nationalww2museum.org/war/articles/second-naval-battle-guadalcanal): Kirishima with nine 16 in and forty 5 in hits, South Dakota with 26 hits.
- Naval History and Heritage Command, Battle off Samar (https://history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1944/samar.html) and the Air Force Times piece on the Johnston (https://www.airforcetimes.com/off-duty/military-culture/2019/11/13/david-without-a-slingshot-a-daring-dive-into-deep-depths-reminds-us-of-tin-can-heroism): armour-piercing shells through destroyers' 3/8 in skin without bursting, Hoel lost after more than forty hits.
- Damage control by navy and carrier fires: the Finescale forum thread on Japanese and US carrier damage control (https://forum.finescale.com/t/japanese-carriers-vs-u-s-carriers-damage-control/198914) and Tekeli's essay on carrier losses (https://www.tekeli.li/wwii/carrierloss.html), read as search excerpts only (a small Japanese damage-control division, US foam and inert-gas systems, Midway hangars full of unstowed ordnance): the `dc` figures are estimates in that spirit.
- Not found in a source and marked `estimated` in `data/protection.js`: the design resistance of the cruisers' and carriers' side protection, the share of fuzes that fail, the Japanese delay for 8 in shells.
### muzzle flames

- **Main guns showed no flame in a long battle** (only the foam on the water did): the particle pool (24000) was full after about a minute and every new particle was dropped, the muzzle fireballs included, while the sea foam (a separate clipmap) kept being stamped. The main load was the vapour trail of the shells in flight: one puff per simulated step and per shell, and hundreds of shells (secondary guns, AA) are in the air at once. The trail is now one puff every 22 to 60 m of flight (larger puffs), the pool holds 40000, and the peak in an 18-ship battle at normal speed falls from saturation to about 26000.
- **Particle pool** (`render/particles.js`): when full, fireballs, flames, flashes, tracers and fire take the place of one of the oldest-looking puffs of smoke or spray instead of being lost; the effects emit less smoke as the pool fills (`fill()`), and the muzzle smoke clouds are thinner.
- **Setting "Particules max"** (10 k to 200 k, 40 k by default, saved in the browser, `?particles=N` in the URL): the pool grows or shrinks at run time (`Particles.setMax`).
- **`render/effects.js` split by domain** (1046 lines -> about 200 + `render/fx/`: `guns`, `water`, `hits`, `air`, `fires`, `wake`, `common`): the methods moved unchanged and are mixed into `Effects`, so a change to the guns touches one small file.
- **Ship shader** (`wgsl/ship.js`), after published weathering and shading practice (the sources are in the README credits): specular anti-aliasing (the highlight is widened where the normal varies inside a pixel, so far plating no longer sparkles), oil-canning of the plating between the frames, rust tears under the scuttles, a pale salt crust in the splash zone, a thin green growth line at the waterline, grime where the baked occlusion is strong, sun-faded paint on the faces that look up. Kept light on purpose: a ship in service is repainted often.
- **Sound** (`audio.js`, `audio/synth.js`), after published work on blast waves and on layered explosion design: the click of a gun report is now the front of a blast wave (Friedlander shape: a sharp positive pulse then a short negative phase); a heavy gun fired within a few hundred metres of the listener **shocks the ears** (the whole mix ducks and goes dull, then recovers in about three seconds); the **cockpit canopy muffles** everything outside; a **bow wave** loop (hiss under a slow swell, slaps on the stem) follows the ships under way and grows with their speed; a **binaural option** ("Son binaural (casque)" in the settings: HRTF panner for the loud sounds, off by default).
- Tests: `test/particles.mjs` (a full pool, priority of the flashes of a shot, the capacity setting), `test/effects.mjs` (every event of a fifteen minute fleet battle goes through the effects without an exception or a NaN).

### take-off camera

- **Automatic camera at a take-off or a landing**: the director cuts to an aircraft that takes off (or lands) and picked at random one of the three views of an aircraft; the "victim" view looks from the bridge of the ship the aircraft will attack, which is 20 km away from a carrier deck: the screen showed an empty sea and sky and the aircraft was a dot. A take-off or a landing is now only seen in the chase or the fly-past views, and the victim view is kept for an aircraft that is within 7 km of its target and not on a deck or assembling. Measured in the browser: the camera was 21.8 km from the aircraft in that view, 27 m in the chase view.

### cameras, cockpit, end of battle, effects

- **Automatic camera**: it cut again at every frame while the ship it followed was going down: a ship that sinks is not `alive`, and the director took that for "gone" and picked a new ship, a new kind of shot and a new orbit at each frame (the sinking ship being the most interesting one, it picked her again). It now follows a ship down to the end of her sinking (16 s at most) and cuts when her time is up or she is gone.
- **Camera following an aircraft**: in the chase and fly-past views it followed the nose of the aircraft: a damaged aircraft that tumbles, spins or loops as it falls turned the camera round it in loops. It now follows the direction the aircraft is going, smoothed (more slowly for a falling one). The fighters that escort and patrol rocked from bank to bank at 70 degrees (58 degrees on average): station keeping is now flown at 42 degrees and the patrol at 32 degrees.
- **Cockpit view, redone** (`model/cockpit.js`): the pilot's seat of each of the 18 types, seen from the eye: an instrument panel with **working dials** drawn by the shader from the flight state (airspeed, artificial horizon that banks and pitches, altimeter with two hands, compass card that turns with the heading, rate of climb, revolutions, clock and engine gauges), the coaming and the glare shield, the windscreen and the hood rails (a centre pillar on the German, Italian and French types), the side walls and the floor, throttle quadrant and trim wheel, a reflector sight with its ring and dot, the stick that moves with the controls, and the blur of the propeller as a dithered disc streaked by the blades. The Swordfish and the PL.10 have open cockpits with a leather coaming and a small windscreen. The frames of the canopy and the pilot's head that were seen from outside only are no longer drawn from his seat. The head sinks under positive g and shakes with the engine and the air; the field of view is narrower (66 degrees).
- **End of the battle**: when one side had won, the ships went on sailing but the aircraft froze in the air (the air was only updated while the battle was running). The air is now updated after the victory: the guns are silent, the aircraft that were fighting or on their way to fight go home, the decks go on working and the aircraft land (or ditch if their carrier is gone).
- **Gunners' fields of fire** (`sim/fighters.js`): the rear gunner of a bomber fired at any fighter that was a little behind it. Each type now has its own field: from straight astern, 60 to 85 degrees to each side (the Swordfish's hemmed in by the lower wing, 86), above and below the plane of the aircraft (nothing under the belly of a Dauntless beyond 20 degrees, a gun in the tunnel under the tail of an Avenger for the lower rear and its turret for the whole upper hemisphere); the fin and the tailplane hide the sector right astern and above.
- **Effects** (after published recipes for sooty fires, pool fires and water impacts; the sources are in the README):
  - **Fire**: a new particle, the *tongue of flame* (upright, a teardrop that narrows to a flickering tip, eroded by noise that rises faster than the flame, yellow-white at the foot, orange, then dark red), a hotter core, a glow at the foot, **embers** carried off by the wind, a column of dense smoke inside a paler veil (it comes in over the first part of its life and is lit orange from below). The fire puffs at the rate of a pool fire of its size (1.5 / sqrt(D) Hz) with two faster flickers on top. The noise of the old fire sprites ran downwards (the time was added to the coordinate): it now climbs. Smoke, spray and fireballs are drawn before the particles that add light, so that the flames are seen in front of the smoke over them.
  - **Shell splash**: built in stages (the dark slick and core, a column thrown up over most of a second with streaks, a lobed crown, droplets on ballistic paths, the fall back and a low surge, a mist) with a height that follows the calibre (30 m for a 406 mm shell, 11 m for a 127 mm one, taller and narrower for an armour-piercing shell, lower and wider with a flash for a high-explosive one) and, on the sea, a disc, a ring of foam that spreads and a second patch where the column falls (about 200 particles for a big shell, 20 before).
  - **Rounds that fall into the sea**: the machine gun rounds that pass the target make small plumes along their line (spurt, drops, foam), and skip when they come in at under 15 degrees.
  - **Muzzle blast**: a ring of foam spreading from under the muzzle and a halo of condensation for the heavy guns. **Steel hits**: sparks fall less fast; a shell that bursts inside makes smoke and flame jet from the openings for two or three seconds.
- Tests: `test/cockpit.mjs` (the 18 cockpits), `test/airops.mjs` (the end of the battle, the gunners' fields), `test/fighters.mjs`. The camera fixes were measured in the browser (a pose trace through a sinking ship, planes followed through a landing).

### aircraft hit volumes

- **Aircraft had no hit volume at all**: a round of light AA, a burst of flak, a burst of a fighter's guns or of a rear gunner hit with a fixed chance, whatever the type, the aspect, the speed or where the rounds went. A Swordfish and a Zero were the same target, head-on or from above, crossing at 100 m/s or coming straight in; a gun that was late with its lead hit as often as one that was on.
- **Now** (`sim/airhit.js`): an aircraft is an ellipsoid the size of its fuselage, the planes of its wings (two for a biplane), its tail and fin, and what a gun sees of it is the **area it presents along the line of fire** (head-on 3-8 m2, from the side 8-22, from above 26-79; an Avenger shows 1.8 times the side of a Dauntless, a Swordfish 2.2 times the top of a Zero). The rounds land in a Gaussian pattern round the point they were laid on (dispersion and laying error grow with the range; the ship's roll adds to it), and the chance that a round hits is what the area covers of that pattern at the place where the aircraft is when the round gets there: **light AA** (the barrels' real direction against the aircraft's position after the time of flight, the rounds leaving with the ship's speed: a crosser that is not led is missed, a nearer aircraft is hit more), **fighters' guns** (fixed along the nose: the pilot lays them by flying; a target that breaks away is not where the line puts it) and **rear gunners** (laid by eye, with an imperfect lead). **Flak** judges a burst from the outline of the aircraft, not from its centre.
- Calibrated so that raids come out as before: over nine raids of fifteen minutes (three seeds, three pairs of carrier groups) 144 / 177 / 53 aircraft were shot down by AA / fighters / gunners against 146 / 179 / 59, and 65 % of the aircraft launched were lost in both. The fighters landed again a little more often (9 of the aircraft in three battles). `test/planehit.mjs` (areas, pattern, light AA on different types and courses) is part of `npm test`.

### hit volumes

- **Shells hit the air above and around the superstructure**: the whole superstructure was one box (the *Iowa*'s was 16 m long, 24 m wide and 27 m high, the *Fletcher*'s as wide as the hull), and the gun houses were discs of 1.3-2.4 m radius when the real turret is 8-11 m across: a shell burst, left its scar and did its damage in empty air beside a funnel, between two towers or above a low deckhouse, and the faces of the turrets were missed. A new audit (`test/hitbox.mjs`) traces random shell paths through the hit volumes and through the triangles that are drawn, for the 30 ships: **27 % of the hits were on nothing** and 32 % of them were more than 3.5 m from the surface that is drawn; and only 42 % of the scars of a battle lay on the surface.
- **Now**: the superstructure is the set of blocks, prisms and cylinders the model is built from (found through a grid of the plan; the struts of the masts are left out), each destroyable part (funnel, bridge, mast, director) is hit through its own solids, and the gun houses and light AA mounts are the box of the house that is drawn, turned with the mount (7 % of the margin). The shell is followed to the surface it went in by (bisection on the last step of 1.2 m) and the normal of the scar is that of the face it struck (the side of a round funnel), not a guess from one big box. The ship's heading, **pitch and roll** are taken into account (a ship that heels while she sinks was hit where her upright self would be: 0 of 5 shells at 23 degrees of roll found their place, 5 of 5 now). The deck is struck at its own height (the margin goes from 0.3 to 0.15 m).
- Measured on the 30 ships (5 000 paths): hits on nothing 27 % -> 2.2 %, hits more than 6 m off the drawn surface 14 % -> 2.3 %, the burst is 0.10 m (median) from the drawn surface along the path, scars on the drawn surface 42 % -> 90 %, paths through a drawn solid that the shell crossed unhindered 3 % (thin parts: rails, ladders, struts). Battles last as long as before (10.4 minutes on average in 8 random ones). `test/hitbox.mjs` is part of `npm test`.

### sinking and camera fixes

- **A ship that was listing, trimmed or sagging stood up and rose out of the water when a torpedo finished her**: the trim (up to 12 degrees by the bow or stern) and the sag of a flooded hull (2-3 m) were applied only while she was afloat, so both vanished in one frame at the moment she was lost, and the sinking then started from an upright ship. They now ease out (a few seconds for the trim, about ten for the sag) while the sinking motion takes over. Two related jumps are gone too: a hit on the other side no longer reverses the way she capsizes (`listSide` is kept once she is lost, and she goes over to the side she was already leaning to), and a hull that breaks in two while it sinks goes on from the depth it had instead of coming back to the surface. `test/damage.mjs` finishes three flooded ships with a torpedo from the other side and checks that the pose changes by no more than a few centimetres a tick and that the roll keeps its direction.
- **Camera swept through the hull when the ship under it was lost just after a cut to her bridge**: the automatic director cuts to the bridge of a ship and, a moment later, she blows up or capsizes; the bridge view then turned into the outside view without a cut and the camera flew from the bridge to 450 m out through the hull and the fireball, swinging round by 160 degrees. A change between the bridge view and any other, whatever the cause, is now a cut.

### carrier air operations

- **Take-off and assembly**: an aircraft used to turn towards the target as soon as its wheels left the deck, still a few metres over the flight deck. It now flies straight ahead and climbs until it is clear of the bow (150 m past it and 60 m above the deck), then flies a circle over the sea ahead of the carrier (on the side away from the landing circuit, a radius that follows the speed of the type, a different height for each section) until the last aircraft of the wave, escort included, has taken off and is in the circle; then the strike forms up behind its leaders and sets off. A patrol (CAP) climbs straight ahead and goes to its station. Assembly takes one to three minutes of a launch (real strikes took far longer: 15 minutes for the *Yorktown*'s group at Midway, an hour and a half for the *Enterprise* and *Hornet*).
- **Arrester wire**: the wire used to grab the aircraft with a constant deceleration from the first instant (a jolt, then about 10 m/s2) and the nose dipped sharply. The pull now builds up and fades again (half a sine: jerk under 15 m/s3), peaks at 0.7-1 g and pays out over 20-70 m, in 2.5-4 s; the nose dips less. `test/deckops.mjs` checks the peak deceleration, the duration and the jerk.
- **Camera on a landing aircraft**: from the turn into the groove (480 m astern) to the end of the roll-out the plane camera is on the deck, beside the wires, on the side away from the island, fixed to the ship and looking at the aircraft with a field of view that narrows with the distance. The chase view stays for the rest of the flight.
- **Speeds**: all aircraft used to share one cruise speed (84 m/s), one torpedo speed, one approach speed and one circuit. Each type now has its own (`sim/airperf.js`): top speed, strike cruise, torpedo release or dive speed, climb, circuit and approach speeds, lift-off speed, the steepest bank and how fast the nose moves, from the published performance (Wikipedia pages of each type and the sources they cite). The Swordfish and the PL.10 cruise at 42-46 m/s (about 165 km/h), the Dauntless and Avenger at 78, the Skua and the Val at 82-84, a Hellcat fights at 125 and a Folgore at 140. The circuit (radius of the turn, distance of the downwind leg and where the turn starts) follows the speed of each aircraft, and the aircraft leave the deck at their own lift-off speed (the Swordfish 26 m/s, the D.520 39 m/s). The landing speed relative to the deck, and so the wire, follows the approach speed of the type.

| id | top | cruise | torpedo / dive | climb | circuit | approach | lift-off |
|---|---|---|---|---|---|---|---|
| SBD-3 | 112 | 78 | - / 112 | 49 | 46 | 37.5 | 36 |
| TBF-1 | 124 | 78 | 57 / - | 50 | 47 | 41 | 37 |
| F6F | 170 | 90 | combat 125 | 60 | 52 | 38.6 | 36 |
| D3A1 | 108 | 82 | - / 103 | 47 | 43 | 36 | 31 |
| B5N2 | 105 | 72 | 90 / - | 46 | 42 | 35 | 31 |
| A6M | 148 | 92 | combat 110 | 56 | 50 | 37 | 31 |
| Skua | 100 | 84 | - / 118 | 46 | 45 | 36 | 33 |
| Swordfish | 64 | 46 | 48 / - | 33 | 36 | 29 | 26 |
| Fulmar | 122 | 105 | combat 105 | 50 | 52 | 37.5 | 32 |
| Ju 87 | 104 | 80 | - / 140 | 50 | 48 | 36 | 37 |
| Fi 167 | 90 | 69 | 45 / - | 40 | 38 | 28 | 26 |
| Bf 109 T | 156 | 110 | combat 125 | 62 | 56 | 41.5 | 38 |
| LN.401 | 105 | 83 | - / 125 | 48 | 44 | 35 | 33 |
| PL.10 | 61 | 42 | 38 / - | 33 | 34 | 28 | 27 |
| D.520 | 152 | 105 | combat 125 | 62 | 55 | 41.5 | 39 |
| Re.2001 | 150 | 115 | - / 125 | 56 | 52 | 41.5 | 41 |
| Re.2001 G | 125 | 105 | 75 / - | 55 | 52 | 43 | 43 |
| MC.202 | 167 | 117 | combat 140 | 66 | 57 | 40 | 39 |

  (m/s. Top and cruise speeds, stall and take-off figures are those published; the approach, climb and circuit speeds are about 1.2 times the stall speed or estimates; the 360-degree turn time is published for none of the types, so the turn comes from the speed and the steepest bank. No published figures were found for the Ju 87 C and the Bf 109 T (the Ju 87 B and a secondary source stand in), nor for the arrester gear of the time: its stopping distance comes from the 20-35 m quoted for the Ju 87 C.)
- Tests: `test/deckops.mjs` (straight climb, assembly, the wire), `test/airops.mjs` (speeds of the types, formation of Skuas and Swordfish) and the formation checks adapted to the assembly.

### islands

- **Islands of every size and height**: rocks (45-150 m of radius, 7-38 m high), small hilly islands (260-760 m, up to 120 m) and large mountainous ones (1.1-2.3 km, up to 560 m, some with a crater), lobed and stretched coasts, a shelf that falls 12 m for every 100 m. They are generated from the seed (`sim/terrain.js`: one analytic height field per island, sampled on a grid for the simulation) with the fleets' start and the axis between them kept clear; the menu has a selector (none / a few / archipelago) and `?islands=0|1|2`. Each island has a biome (green, arid, rock, volcanic).
- **Rendering**: one mesh per island built from the same field (`model/islandMesh.js`, `render/islandVisual.js`), a terrain material in the ship shader (grain, strata on steep ground, wet sand, no weathering), surf lines re-stamped on the foam map along the coast near the camera, a camera that cannot go under the ground, shell and torpedo impacts on the land (flash, dust, earth chunks, sound).
- **Simulation**: ships run aground where the water is shallower than 0.8 draught (pushed out along the slope, slowed, damaged by the speed of the impact); shells burst on the slopes and torpedoes explode on the shore; the line of sight and the ballistic arc of every gun are tested against the ground (a mount behind a hill is not feasible, a target behind an island is not picked); the AI keeps to water deeper than 32 m (fan of probes and a ring round the hull), goes round an island that is on its way (detour waypoint) and slows near the shallows; aircraft climb to clear mountains ahead (look-ahead at 300-2000 m) and crash into the ground.
- **Vegetation**: eight kinds of plant (oak, fir, coconut palm, tropical canopy tree, acacia, cypress, shrub, boulder; three variants of each) grow on the islands according to their climate (temperate with conifers up the slopes, tropical with palms on the beach, arid savannah, bare alpine, volcanic scrub), thinning with altitude and steep ground, leaving the beach bare and opening clearings; the ground is darker under the trees. About one plant for 50 m2 of forest, drawn from the seed square by square (`model/vegetation.js`), so that the same battle has the same forests.
  - Each plant is a procedural model (`model/treeMeshes.js`): a tapered trunk, recursive limbs and twigs bending with a tropism, the crown as lumps of foliage and cards of leaves with a cut-out (leaflets, needles, palm fronds), at four levels of detail that keep the silhouette (up to about 10 000 triangles near, 20 far).
  - The shader (`ship.js`, materials bark / leaf / card / rock) erodes the edge of the crowns into leaves, lights them from behind (translucency), furrows the bark, speckles the boulders and puts moss on them; a gust crosses the island and sways the foliage.
  - Drawing (`render/vegetationVisual.js`): within 105 m each plant is an instance (the cards do not cast shadows, the rest does), within 300 m and 1 km one mesh per square of 80 m, beyond one mesh per square of 640 m with a part of the plants; meshes are built when needed (7 ms a frame at most) and released when the camera goes away. 60 images/s on the RTX 3080 even inside a forest. `?trees=0` turns the plants off; the quality level shortens the distances.
  - `test/vegetation.mjs` (placement, climates, budgets of triangles, stamping) is part of `npm test`.
- `test/islands.mjs` (generation, line of sight, grounding, shells and torpedoes, the AI, six battles among islands) is part of `npm test`.
### wiki and viewer

### 3D viewer (`viewer.html`)

- A page to look at any of the 30 ships and the 24 aircraft (18 carrier types and 6 catapult floatplanes) in 3D, built on the game's engine and model builders (`js/viewer/`). Drag to orbit (with a little inertia, and from below when the sea is off), right-drag or shift-drag to pan, wheel to zoom, double click or `R` to frame the model again; one finger orbits and two fingers pinch and pan on a touch screen; arrow keys, `+` / `-`, `1`-`7` for the standard views, `[` / `]` for the previous / next model.
- Light presets (full day, morning, sunset, overcast, dusk) plus the sun's height and azimuth, the sun can follow the camera; the sea and the sun shadows can be switched off (`engine.showOcean` replaces the `?ocean=0` test, which still works); render resolution.
- Model options: intact / battle scars / wrecks / broken in two, turret train and gun elevation, aircraft parked on carriers; for aircraft: landing gear and hook, folded wings, ordnance, bank, pitch and altitude.
- **Debug link** button: copies an address that reopens exactly the same view (subject, camera, light and options in the query string, only what differs from the defaults), and the address bar follows the view; **screenshot** button (PNG of the rendered frame). `?embed=1` gives the reduced interface used by the wiki.
- Wireframe is not offered: WebGPU has no polygon mode, it would take a second line pipeline.

### Wiki (`wiki.html`)

- **Tech tree** by nation (tabs with the flags): the five ship types in rows, six eras in columns (cut by the year of service: up to 1931, 1932-36, 1937-39, 1940, 1941, 1942 and after), a silhouette of every ship drawn from its spec sheet at a common scale (hull, funnels, masts, turrets, island and flight deck at their measured positions, in the paint colours of the class), trunk and branch lines from the nation to each type, and "successor" links when a type has several ships. Empty eras can be hidden. On a phone the tree becomes a list by type.
- **Ship card**: embedded 3D viewer, six key figures as bars, then the statistics of the spec sheet in French (dimensions, propulsion, main and secondary guns, torpedoes, aircraft, armour, silhouette), values the sheet flags as estimated marked with `≈`, the English notes of the sheet in a folded block, the list of estimated values and the sources. Links by hash (`#/japan/yamato`), previous / next ship of the nation.
- **Comparison** table of the 30 ships (filters by nation and type, sortable) and **Aviation** page (top-view drawings and figures of the aircraft, which carriers fly them).
- Everything is read from the game's modules (`js/game/data`, `planes.js`), so the wiki follows the game; `test/wiki.mjs` checks the adapter, the layout of every nation (no overlap, one branch per type) and the link format.

### Other

- The main menu links to both pages; the README is rewritten around a one-minute start, and its long technical parts moved to `docs/ARCHITECTURE.md` and `docs/CREDITS.md` (every credit and licence line kept).

## 0.1.1 — air groups, gun audit, wakes and fleet tactics (19 October 2026)

What changed since 0.1.0, in the order of the sections below (the newest first):
**fleet tactics** (flagship, line in column, destroyer screen, carriers astern, common target); a **camera** that steps out when its ship is lost and a calmer automatic director;
**masts that no longer float** (Belfast, Norfolk, Algérie, Fantasque); **ship wakes** redone (bow wave, waterline foam, screw wash, long fading wake); a **gun audit** (field of fire of every gun from
the geometry of its ship, light AA arcs and elevation limits, mounts settled out of the superstructures, audit tools and tests); **liveries** checked against the published references (Italian recognition stripes,
Kriegsmarine, Royal Navy and US Navy greys); **fighters** (escort, patrol, dogfights, rear gunners, bigger air groups and raids, least-defended approach, shelter under friendly guns);
**carrier operations** (lifts, folding wings, take-off, landing circuit, arrestor wires, servicing); **cameras** for every bridge and aircraft; gunnery, shells, damage and sinking refinements.

### fleet tactics

- **The ships used to fight alone** (each picked its own target, circled the enemy at its own range in a random direction, and the carriers wandered off by themselves). A fleet now has an order of battle (`sim/fleet.js`): the flagship (heaviest of the line) leads, the line follows in column (battleships, heavy cruisers, light cruisers) at a gap that follows the lengths of the ships, the destroyers screen ahead and on both bows, the carriers sail behind the line on the side away from the enemy with two destroyers as escort. The whole fleet circles the enemy the same way (chosen when it is put on the water), at the range of the shortest-ranged ship of the line and at the speed of the slowest, and the line shoots at one target chosen for the fleet. A ship that is crippled (hull under 35 %, or short of power) leaves the formation and fights on her own; a destroyer on a torpedo run, a ship that is too close to the enemy and a carrier that is threatened break formation too. Ships of one fleet avoid each other only when really close (the old avoidance pushed them apart).
- `spawnFleet` puts the ships in that order (it used to lay them out in rows by class).
- In 18 simulated battles (six matches, three seeds) 17 finished against 17 before, in 1 293 s on average against 1 235 s; the fleets now sail in column (see `test/fleet.mjs`: the stations are held within a tenth of a tether, no hull touches another).

### camera on a lost ship

- **Bridge camera on a ship that blows up or goes down**: the eye stayed on the bridge, in the fireball (a brown screen for ten seconds) or, on a capsizing ship, swung round the rolling hull while the horizon stayed level. The view now steps out to the outside (orbit) camera as soon as the ship is no longer afloat or has exploded; it goes back to the bridge of the next ship when the camera moves on.
- **Automatic camera** (where it was seen, rarely): the cut to the deck of the ship an aircraft is attacking (the "victim" view) is no longer made from a ship that is going down, burning or smoking heavily (the screen was black or brown) nor when the aircraft is almost overhead (a blank sky); and the automatic director does not put the camera on the bridge of a ship that burns badly or is nearly lost. Measured on 480 frames of the automatic camera with ships blown up and sunk at random: 5 black or flat frames of 220 before, 1 of 260 after.
- **The white slab on the sea at a magazine explosion**: the foam of the blast (a disc and an expanding ring, both persistent) covered the whole window of the foam map with a hard edge; the disc is smaller and the ring thinner and shorter-lived.

### masts that floated

- **Masts in the air** (seen on the *Belfast*: the legs of the aft tripod stopped short above the boat deck): the foot of every mast and of each leg of a tripod now stands on the roof under it (`lowerBase`, `shipbuilder.js`; `PT.tripod` takes the height of each foot). The same bug was on the *Norfolk* (aft tripod) and the *Algerie*. The *Fantasque* had its bridge tower, director and foremast 7 m too high (the tweak gave the height above the waterline where the code reads a height above the deck): `towerY0` and the foremast base are now 9.2.
- `tools/audit/check.mjs` finds the clusters of structures that do not touch the deck or another structure (legs and struts of 0.15 m or more count as structures) and says how far they hang in the air.

### wakes

- **Ship wakes redone** (`addWakeStamps`, `render/effects.js`): they were hardly visible (a faint thin line behind a destroyer at 36 knots, nothing at the bow of a battleship) and the diverging arms were short bars. Now: a splash at the stem and a bank of foam along the first quarter of the hull (the bow wave), a line of foam at the waterline, white churned water behind the screws, the wake that breaks up over one to three lengths and a wide pale bed that stays on the sea, all scaled by the speed (a ship at a quarter of her speed marks the water little, at full speed she leaves a white road). The Kelvin arms are gone (they looked like detached hatched strips). Wakes last a little longer (decay 0.03 per second).
- New trailer scene `wakes` (ships of every size at their own speed, from the stern, the bow, above, and in a turn). The foam is only laid for the ships within 1.4 km of the camera and kept for 512 m round it, so a scene has to keep the camera near the ships while they sail (`T.camFn` during the wait); the recorder needs `--q prelite=1` for the foam to be laid on every frame.

### guns audit

- **Field of fire of every gun** (`model/clearance.js`): for each mount the model computes, bearing by bearing (3 degrees), the band of elevations at which the barrel clears the towers, funnels, masts, the house of the other mounts and the rising deck of the forecastle (`rec.clr`, `rec.clrHi`), and from it the arc the mount can be trained over (`arcMin` .. `arcMax`). The sim uses it: a gun does not train into a blind sector, does not fire through the superstructure, and a barrel that has to swing across a low obstacle rises over it, then comes back to the elevation of the shot. A mount whose centre is blocked rests in the middle of its widest free stretch. Casemates in the hull side are left out (they fire through their port).
- **Light AA**: the same arcs; the aircraft it picks must be in its arc and between the lowest and the highest elevation the barrel can reach there (a gun in a sponson under the flight deck cannot rise; the Type 96 reaches 80 degrees, so an aircraft right above is safe from it). A mount with a blind sector is stopped by it instead of swinging through the tower. The dual-purpose guns are held to the maximum elevation of their gun and to their arcs when they choose an aircraft. Turrets can now depress 4 degrees, so a battleship shoots at a destroyer that is close (they used to be unable to fire below -0.8 degrees).
- **Model bugs found by the audit**: the *Illustrious* had eight 4.5 in mounts on four spots (two on top of each other: the side came from the order of the list, now from the label); mounts that stood inside a deckhouse (*Cleveland*, *Takao*, *Yamato*, *Norfolk*, *La Galissonniere*, *Montecuccoli*, ...) now stand on its roof or beside it, and a mount that hung beside a wall has a pillar; the light AA that is not measured is placed last, away from boats, rafts, ventilators and walls, on something solid (a sponson of its own on a carrier, along the edge of the flight deck, instead of under it); boats slide along the deck away from guns; the two torpedo mounts that the sheet put at one station (*Norfolk*, *Algerie*) stand either side of the centre line and the tubes that were buried in a deckhouse take its roof; the 8.8 cm centre-line mount of the *Koln* no longer stands on turret B, the 120 mm star-shell mounts of the *Littorio* are outboard of the 90 mm line, a *Bearn* 75 mm no longer stands in the island, the *Graf Zeppelin* casemates are in pairs at the four corners (they were inside the island sponson).
- `tools/audit/check.mjs` (buried, floating, overlapping and blocked mounts), `tools/audit/arcs.mjs` + `arcs.py` (a plan of the arcs of every ship), `test/mounts.mjs` (the same checks, and eight bearings of fire for five ships: every main mount fires and none trains outside its arc) and a test of the light AA in `test/airops.mjs`.

### liveries

- **Paints checked against the sources** (US Navy measures: Munsell values and reflectances; Royal Navy 507A/B/C; Kriegsmarine RAL cards): the palettes and plain paints that disagreed were corrected.
  - US Measure 32 dazzle: the three tones are now Navy Blue 5-N, Ocean Gray 5-O and Light Gray 5-L (reflectances 9, 17 and 35 %); the middle tone was a navy-blue that made the dazzle too dark and too contrasted.
  - Kriegsmarine: Dunkelgrau 51 (RAL 7000) hull and Hellgrau 50 (RAL 7001) upperworks instead of one grey all over, the aluminium funnel cap of the *Bismarck* (RAL 9006).
  - *Norfolk*: Home Fleet grey 507A, a dark bluish grey (about 10 % reflectance), instead of a light grey; *Illustrious*: Mediterranean Fleet grey 507C (about 45 %).
  - *Aquila*: hull and upperworks in the same light matt grey (grigio cenerino chiaro) as the rest of the Regia Marina.
  - Flight decks take the colour of the spec sheet (US flight deck stain, IJN dark brown, RN dark grey, planking for the *Graf Zeppelin* and the *Béarn*) instead of one grey for all.
- **Italian recognition stripes (1940-42)**: red and white diagonal stripes on the forecastle and the quarterdeck, red and white bands on the roofs of the gun houses, for the *Soldati*, *Montecuccoli*, *Zara* and *Littorio* (painted after the air attack of Punta Stilo in July 1940). The stripes are flat cells that follow the sheer and the camber of the deck (`PT.deckStripes`); the roofs are painted by `markRoof` in `mounts.js` (per-ship marks in `MARKS`, `livery.js`).
- **Bismarck**: turret tops in Dunkelgrau (RAL 7024), as on 24 May 1941. **Yamato**: the wood deck is stained black, as it was from Leyte Gulf (October 1944) and for the last sortie.
- What could not be confirmed is listed in TODO.md (the pattern of the Yukikaze, the French greys and recognition marks, the German aircraft recognition marks on the decks, which are not drawn).

### fighters

- **Fighters** for each nation (F6F Hellcat, A6M Zero, Fulmar, Bf 109 T, D.520, MC.202: the dimensions of the real aircraft, the rest estimated): about a quarter of every air group (`air.fReady`; the
  bombers are `air.ready`). They come up on the lifts, never from the deck park.
- **Escort**: every strike leaves with two to four fighters (after the bombers; they are faster and catch up), flying above and ahead of the bombers and weaving. **Patrol**: when enemy aircraft come within 70 km
  of the carrier and the deck is free, two to four fighters go up and circle over the fleet at 1 400 m (a patrol goes home after 15 minutes or four minutes without an enemy).
- **Combat**: a fighter picks the enemy aircraft that threatens most (those about to drop their ordnance first, enemy fighters when escorting, two fighters on one target at most), closes on it by lead pursuit,
  fires short bursts (about 37 s of ammunition; hits are likelier near, on a bomber, on a target that does not break away) and breaks away when an enemy fighter sits on its tail. The **rear gunner** of the
  two-seat bombers shoots back at a fighter astern. A fighter that is hurt (under 30 %), out of ammunition or short of fuel goes home; it lands like the other aircraft (and counts as a fighter again).
- **Visible and heard**: tracers along the line of fire, a flash, the hits, the machine-gun burst (`mg_burst`); kill-feed lines for the fighters' and the gunners' kills; the camera director likes a fighter that fires.
  The ship panel shows the bombers and the fighters left. `dogfight` trailer scene; `test/fighters.mjs`.
- **Bigger air groups, slower tempo**: the capacities are the largest documented figures that fit the hangar and the deck park (Essex 91 -> 100, Shokaku 72 -> 84 with its 12 spares, Illustrious 36 -> 57 as in 1943,
  Béarn 32 -> 40, Aquila 51 -> 66 with the folding-wing Re.2001G, Graf Zeppelin 43 -> 50); the share of fighters depends on the navy (USN 38 %, Germany 40 %, UK 34 %, Italy 35 %, Japan and France 26 %). A landed aircraft is serviced
  (refuelled, rearmed) for about five minutes before it counts as ready again, the next strike needs 200-280 s instead of 120-180 s, fuel is 28-37 minutes instead of 15-18 (they were running dry while they
  waited their turn to land), and the fighters' guns are a little less deadly. The ship panel shows the aircraft being serviced.
- **Bigger strikes**: a wave is about an eighth to a quarter of the air group (Essex 13-23 bombers, Shokaku 11-19, Illustrious 7-13, Béarn 6-9, Aquila 9-15; it used to be 6-11 whatever the carrier), with an escort of a
  third of that (2-7 fighters), so that more of the strike gets through to its target; the AA is unchanged. The torpedo sections' approach bearings are spread over at most 2.4 rad, and a big wave that
  has lost more than 45 % of its aircraft before the attack closes up into one formation per kind (it was under five aircraft).
- **The way in**: a section picks, 24 km from its target, the bearing from which to come in with the least anti-aircraft fire along the way (`sim/routing.js`: the light mounts and the dual-purpose guns of every
  enemy ship that are still alive and have rounds, weighed by distance, where the ships will be when the strike gets there; the torpedo bombers meet the light guns all the way, the dive bombers in the last 4.5 km
  and the flak at any height). It flies by an entry point 9.8 km out on that bearing and then straight at the ship, and the sections of a wave keep 0.5 rad apart so that the defence is split. A lonely, weakly
  armed ship is also a better target than one in the middle of the screen. In twelve simulated battles 57 % of the bombers reach their release point against 45 % when they come in on the direct bearing.
- **The bombers defend themselves**: every bomber with a rear gunner (all the torpedo bombers, the two- and three-seat dive bombers) fires at the nearest enemy fighter within 520 m in the rear half-space, tracers
  and sound included; the aircraft of a tight section cover each other (the old rule only let the bomber that was being attacked fire back).
- **Closing up under attack**: when enemy fighters are on one aircraft of a section, the whole section tightens its formation to 55 % of the usual spacing (about 22 m abeam, 50 m astern), easing in over a few seconds, and
  its gunners' fields of fire overlap (hits 40 % likelier); it opens out again once the fighters have gone, and the attack run itself is unchanged. AA damage against aircraft is untouched.
- **Shelter under the guns of friendly ships**: a bomber that enemy fighters are hunting on its way home (egress or return, enough fuel) circles round the friendly ship with the most anti-aircraft guns within 28 km
  (a ring of 1.1 km, 350 m up, within reach of its light guns) until the fighters have given up or been shot down (15 s without a hunter), then goes on home. The ship's AA fires at the fighters that follow
  (they were already targets); and a fighter hesitates to follow its prey into the guns of the friends: the AA the prey would fly through counts against it when it picks its target. In my simulations few bombers
  are still alive and hunted on the way home (7 of about 500), so it is a small effect.
- **The escort protects**: an escort fighter goes first for the enemy fighters that are after the bombers it covers (a fighter whose prey is one of them, or already within 2.5 km of them), does not chase further
  than 7.5 km from them and goes back to its station (weaving over a narrower track). With the escort 57 % of the bombers reach their release point, without it 45 %.
- Circuit: the aircraft only turn in when they are on the downwind line, on the opposite course (they used to turn from any position and roll out far off the centre line, then go round again); the downwind
  leg damps its lateral correction; the hold circle is bigger and banked more; the next aircraft turns in when the one ahead is 3.6 km from its touchdown point; an aircraft that floats past the first wires
  is waved off sooner. Landings are about twice as frequent when many aircraft come back together.

### cameras

- **Bridge view**: the eye used to sit 5 m ahead of the centre of the tower, on the centre line, where the foremast, its stays or a wall were in the way on most ships (and inside a block on the King George V, the
  Bismarck, the Takao and the carriers, which have no tower and looked from over the flight deck). The model now carries an eye (`model.bridge`: x, y, z) found by a search over the front of every tier of the
  tower (on the wings, a little ahead of the face, at window level; on carriers out of the front of the island): not inside any block, and the view ahead (a fan of rays over the width and the height of the picture)
  as clear as possible. The camera of the aircraft seen from the victim ship uses it too. Checked on the 30 ships with the `cams` scene (bridge, chase and orbit, one frame each).
- **Cockpit view**: the eye is at the front of the canopy, high (the cowling stays at the bottom of the picture), above the upper wing on a biplane; the view **banks with the aircraft** (the engine camera has a
  `roll`); the propeller is not drawn from the pilot's seat (a frozen blade hid the view). The fly-past camera is narrower (30 degrees) and the victim camera's field of view follows the distance (8 to 50
  degrees) so that the aircraft is seen. Checked on the 12 types in the cruise and in the attack with the `planecams` scene.

### deck operations

- **Lifts**: a launching aircraft that is not in the deck park comes up on a **lift**: the platform goes down, the aircraft rides up out of an open shaft in the deck (the lifts are now in the ship model:
  position and size of the painted squares), wings folded, then spreads them (the wings fold back about a hinge on the rear spar; the Japanese ones more steeply) and starts its engine: dark smoke from the
  cowling, the propeller picks up speed, the starter and the coughs are heard. Aircraft taxi at 7 m/s to the head of the queue (14.5 m apart) and the lift is free again as soon as one has rolled clear.
- **Take-off run**: tail wheel and arrester hook drawn on every aircraft; the run is 100 m (the speed needed is reached after 54), the tail comes up at about 10 m/s, the nose later, the wheels leave the deck at the
  bow end or at 25 m/s.
- **The deck park**: aircraft are parked wings folded, in three staggered rows across the aft deck (they used to overlap, wings spread). A wave leaves the park first (highest slots, nearest the run first), the others
  come up from the hangar. Between two waves the deck crew **spot the park again** from the hangar (towed backwards, folded); before a recovery they **strike it below** one aircraft after another, the first
  aircraft of the recovery waiting in its circuit. The deck is never used by a launch and a recovery at the same time.
- **Circuit and approach**: an aircraft coming home joins a circuit on the side opposite the island (downwind on the reverse course 1.5 km out, a 180-degree turn at a steady 28 degrees of bank, the groove),
  hook and gear down, the nose held high. It **turns in only when the groove is free** (the aircraft ahead is within 2 km of its touchdown, or down) and holds in a circle in the ship's frame otherwise.
  It follows a 3.5-degree slope to a touchdown point just short of one of the first wires, steering for the centre line (within a metre or two at the touchdown on every carrier of the roster); the landing signal
  officer waves it off if the deck is not clear, the line-up is bad or it floats past the wires.
- **Touchdown and wire**: the wheels meet the deck (tyre smoke, a thump), the hook drags (sparks) and picks up a wire (one time in fourteen it skips them all: a bolter, full power off the bow and round again); the
  wire is drawn from its two sheaves to the hook, pays out 30-42 m and stops the aircraft in about 2.5 s (the nose dips); it is let go, the hook comes up, the wings fold while the aircraft taxis to a free lift
  (waiting its turn short of it), which takes it down; only then does it count as ready again.
- **Visible**: wings folded or spreading on every aircraft (`fold`), arrester hook (`hook`), tail wheel, nose-high attitude on the approach (`aoa`), propeller speed following the engine. The aircraft in flight now bank
  into their turns (the renderer read a roll that was never set; it is `bank` now). The camera in auto mode cuts to a touchdown or a take-off from time to time.
- **Sounds**: `engine_start`, `lift_motor`, `touchdown` (the wire keeps `arrest`). **Dev**: `deck` trailer scene (park, lift, queue and run, circuit, groove, trap, the way down, the park struck and spotted), `?fold=` and
  `?hook=` in the preview, `test/deckops.mjs` (every carrier: launch from the park and the lifts, recovery of the whole wave on the wires, park struck and spotted again).
- Aircraft models: the stray blade on every wing (an aileron quad that did not lie on the surface) is gone, the bars of the US insignia run along the span on the wings (they hung over the leading and trailing edges), the canopies are tapered and a lighter glass, the roundels no longer sink half into the sloping wing (or float above the gull wing of the LN.401 and Stuka).
- Aircraft that run out of fuel in the circuit now ditch near the ship instead of flipping between return and circuit; the fuel of a strike is 900-1100 s.

### air operations

- **Strike formations**: a wave leaves in sections of three or four aircraft of one kind (dive bombers off the deck first), and each section flies to the enemy in formation behind its leader (a vee, the fourth aircraft in
  the middle astern, the leader going easy until the section has joined). The torpedo sections come in on **approach bearings of their own** (about 40 degrees apart) and each section attacks **line abreast**; the dive
  bombers of a section **peel off one after the other** (3 s apart) and the sections come in from different sides. A wave of three sections or more splits its targets between the two best enemy ships.
  If a leader falls the next aircraft leads.
- **A weak strike**: once the wave is airborne, and 16 km from the target, it is looked over once: under three aircraft left (two for a wave of fewer than six, or under a third of the wave) the strike **turns back**
  (feed message); under five, the sections **close up** into one formation per kind, the survivors attacking on a single axis (in trail for the dive bombers).
- **Light AA magazines**: every mount holds rounds per barrel (3 600 for 20 mm, 2 700 for 25 mm, 1 400 for 40 mm); a gun spends them as it fires; an empty mount is silent; a ship down to 20 % keeps what is left for
  the aircraft that are after her. The flak of the heavy dual-purpose guns now spends HE from their own magazines. The ship panel shows the AA ammunition.
- **AA targeting**: the aircraft in their attack run or dive, and those going for the ship, come first; the dying ones last.
- `strike` trailer scene to film a wave in formation and the torpedo sections coming in; `test/airops.mjs`.

### gunnery

- **The shell is chosen against the target** (`shellChoice`): the expected damage per round of AP and of HE against where the target will be hit (belt, deck, upperworks), from the impact speed and fall angle at that range and
  the aspect of the target (beam-on or bow-on): AP where it gets through the plate and bursts inside, HE against destroyers (AP goes through without arming), against a bow-on battleship at long range (grazing angle, thick plate)
  and when the AP is gone. It used to depend on the class of the target alone (and a coin toss for cruisers).
- **Magazines**: every mount holds a number of rounds (about 100 a gun for 16 in, 150 for 8 in, 200 for 6 in, 280 for 5 in, 400-500 for the small ones), split between AP and HE for the guns that have both; a salvo spends
  one round a barrel; a mount with nothing left falls silent. Changing from one kind to the other means unloading the breech (a reload and a quarter) and is only done when the other shell is clearly better (a mount keeps
  what it has loaded when the loss is under 30 %). The ship panel shows the AP / HE left in the main battery.
- **Mounts with a target of their own**: a mount that cannot bear on its battery's target (out of its arc, out of range) picks an enemy it can engage (in its arc and range, valued by class, state and distance) and
  re-chooses every second or so, instead of staying idle; the secondary guns do the same.

### shells

- **In flight**: the body of the shell is drawn when the camera is within 700 m (AP: dark ogive with a pale ballistic cap and a copper band; HE: blunter, with a fuze and a yellow band, 3.8 calibres long); the tracer
  streak is red-orange for armour-piercing and yellow-white for high explosive, with a bright head, doubled for the first half second while the gases still surround the shell; a thin vapour trail hangs behind it.
  A ring of vapour is thrown out round the bore as the shell clears the muzzle.
- **At the impact**, by what the shell is and what became of it (the simulation now says which): armour-piercing **through the plate** = a pin-prick of light and hot metal at the entry, then (the fuze delay later) a dull
  burst inside with jets of flame and black smoke through the hole and the openings; **over-penetration** (plate too thin to arm the fuze) = a hole in and a hole out and a streak that flies on; **ricochet** = a
  scratch of sparks along the plate and the shell whining away on the reflected path; **plate holds** = orange flash, hail of sparks, a lump of the nose flung away; **high explosive** = an instant bright, wide
  burst (white shock flash, fragments, grey smoke), or, on thick plate, it only shatters. Water splashes differ too (AP: narrow and tall, HE: wide with a flash and smoke). Sounds: an AP hit rings at the plate and
  bursts a moment later.
- **Angle of attack**: the incidence on superstructures, modules and turrets is now computed from the real geometry (it was a constant), and an armour-piercing shell arriving at more than 68 degrees from the
  normal glances off (certain above 82) whatever its energy.
- **Hit report** (`shellHit` event, J or the "Impacts" button): a floating tag at the impact and a log of the last hits of the selected ship (given and received): shooter -> target, part struck, shell type and
  calibre, angle, plate and effective thickness against penetration, result (PERCE, TRAVERSE SANS ÉCLATER, RICOCHET, NE PERCE PAS, ÉCLATE, SE BRISE) and damage. `hittest` trailer scene to stage a hit
  (`--q type=AP|HE --q angle=0..85 --q part=hull|deck|super|mount --q ship=iowa --q gun=yamato`).

### scoreboard

- **Tab** (held) or the "Tableau" button shows a live scoreboard: per team and per ship, ships sunk, aircraft shot down, shells fired, hits, accuracy, torpedoes (hits / launched), damage dealt, and state
  (hull % or how she was lost), sorted by kills, plus the last sinkings. Tab no longer selects the next ship (N / B / ] / [ still do). `Ship.torpFired` counts the torpedoes launched.

### ways of sinking

- A ship now goes down in one of several ways, chosen when she is lost (`Ship.chooseSinkMode`): **capsizing** (strongly one-sided flooding, a torpedo: the hull rolls over, floats keel up for a while, then
  goes down), **by the bow** or **by the stern** (the trim from the flooding: up to 65 degrees), **settling** on an even keel (even flooding), **burning out** (lost to fire: dead in the water for 30-100 s,
  cooking off ammunition with small explosions, then settling) and **blown apart** (magazine explosion: fast, wrecked). A long, battered ship whose neighbouring midships compartments are full
  can **break her back** by herself. The ship panel says how she was lost.
- Fixed: after a magazine explosion the two sections of a broken hull rose out of the water (up to 20 m): they now only hop a little, float on a buoyancy that falls with their leak, and go down.
- `sinktest` trailer scene (`--q ship=baltimore --q mode=roll|bow|stern|level|burn|blast|split`) to look at a way of sinking; tests in `test/damage.mjs`.

### finer meshes

- Boxes of a metre or more (superstructure tiers, turret houses, deck blocks) have their vertical and roof edges chamfered (`DETAIL.bevel` in `meshbuilder.js`,
  10 % of the smallest dimension up to 0.5 m); big round parts (funnels, turret bases, barbettes, domes) have 1.75 times the segments (up to 40), gun barrels 1.6 times
  (up to 16); the hull has 150 stations (was 110) and 25 levels (was 15) for smoother flare and tumblehome. Triangles per ship: base 11 500 -> 16 700, close-up detail
  5 600 -> 6 600. Frame rate unchanged on an RTX 3080 (60 fps at 1080p, quality high, 12 ships); build time 60-155 ms per ship.

## 0.1.0 — every ship and aircraft measured on plans (19 October 2026)

All 30 ships and all the aircraft were compared with period drawings (ONI sheets, Commons drawings, plans shared by the project owner) in metres and corrected, in five
batches (below): positions of turrets, torpedo mounts, funnels and masts were often 10-40 m off in 0.0.1; hulls, decks, superstructures, funnels, masts, screws, rudders,
catapults and cranes follow the plans; new turret families measured per gun type; new muzzle blast and gunfire effects; aircraft tailplanes were half the real size. New tools:
`tools/refs` (`check.mjs`, `silhouette.py`, `hull.py`, `grid.py`, `fit_decks.py`). A new trailer, `docs/trailer-v0.1.0.mp4` (89 s, 1920×1080, 60 frames per second: `?fps=60` in the recorder, two fleet actions, a roster of 26 ships, gunfire scenes), and a side-by-side comparison with the 0.0.1 one,
`docs/comparatif-0.0.1-0.1.0.mp4` (the 0.0.1 scenes re-recorded with the 0.1.0 game, same seeds, side by side with the original trailer). The 0.0.1 trailer is kept. The pictures of the README (`docs/*.jpg`) were retaken with the 0.1.0 models (`tools/screenshots.mjs` for the interface views).

### Batch 5 (the destroyers: Fletcher, Kagero, Tribal, Type 1936A, Le Fantasque, Soldati)

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
- **Soldati**: a profile and plan of the Camicia Nera shared by the project owner (a small line drawing, source unknown, measurements only; scaled to the length, about +-0.6 m): forecastle 4.5 m at the
  stem down to a 1.4 m quarterdeck abaft f 0.88, the twin turrets at 0.218 / 0.83 (the spec had 0.14 / 0.84), the bridge block (to 13.8 m), a raked foremast (23 m), the big funnel at 0.445,
  the triple tubes at 0.62 / 0.73 round the star-shell gun at 0.677 (the spec had 0.56 / 0.70 and 0.63), the raked mainmast (17.5 m), screw and rudder; new `it120` family. Profile 1.4 m; the
  outline-only plan cannot be compared by silhouette, its half-breadths were read by hand.

### Batch 4 (the cruisers)

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

### Batch 3 (the remaining carriers, the aircraft)

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

### Batch 2 (King George V, Richelieu, Littorio, Shōkaku, Illustrious)

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

### Batch 1 (Iowa, Yamato, Bismarck, Essex)

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
