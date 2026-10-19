# Changelog

## Unreleased — liveries

- **Paints checked against the sources** (US Navy measures: Munsell values and reflectances; Royal Navy 507A/B/C; Kriegsmarine RAL cards): the palettes and plain paints that disagreed were corrected.
  - US Measure 32 dazzle: the three tones are now Navy Blue 5-N, Ocean Gray 5-O and Light Gray 5-L (reflectances 9, 17 and 35 %); the middle tone was a navy-blue that made the dazzle too dark and too contrasted.
  - Kriegsmarine: Dunkelgrau 51 (RAL 7000) hull and Hellgrau 50 (RAL 7001) upperworks instead of one grey all over, the aluminium funnel cap of the *Bismarck* (RAL 9006).
  - *Norfolk*: Home Fleet grey 507A, a dark bluish grey (about 10 % reflectance), instead of a light grey; *Illustrious*: Mediterranean Fleet grey 507C (about 45 %).
  - *Aquila*: hull and upperworks in the same light matt grey (grigio cenerino chiaro) as the rest of the Regia Marina.
  - Flight decks take the colour of the spec sheet (US flight deck stain, IJN dark brown, RN dark grey, planking for the *Graf Zeppelin* and the *Béarn*) instead of one grey for all.
- **Italian recognition stripes (1940-42)**: red and white diagonal stripes on the forecastle and the quarterdeck, red and white bands on the roofs of the gun houses, for the *Soldati*, *Montecuccoli*, *Zara* and *Littorio* (painted after the air attack of Punta Stilo in July 1940). The stripes are flat cells that follow the sheer and the camber of the deck (`PT.deckStripes`); the roofs are painted by `markRoof` in `mounts.js` (per-ship marks in `MARKS`, `livery.js`).
- **Bismarck**: turret tops in Dunkelgrau (RAL 7024), as on 24 May 1941. **Yamato**: the wood deck is stained black, as it was from Leyte Gulf (October 1944) and for the last sortie.
- What could not be confirmed is listed in TODO.md (the pattern of the Yukikaze, the French greys and recognition marks, the German aircraft recognition marks on the decks, which are not drawn).

## Unreleased — fighters

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

## Unreleased — cameras

- **Bridge view**: the eye used to sit 5 m ahead of the centre of the tower, on the centre line, where the foremast, its stays or a wall were in the way on most ships (and inside a block on the King George V, the
  Bismarck, the Takao and the carriers, which have no tower and looked from over the flight deck). The model now carries an eye (`model.bridge`: x, y, z) found by a search over the front of every tier of the
  tower (on the wings, a little ahead of the face, at window level; on carriers out of the front of the island): not inside any block, and the view ahead (a fan of rays over the width and the height of the picture)
  as clear as possible. The camera of the aircraft seen from the victim ship uses it too. Checked on the 30 ships with the `cams` scene (bridge, chase and orbit, one frame each).
- **Cockpit view**: the eye is at the front of the canopy, high (the cowling stays at the bottom of the picture), above the upper wing on a biplane; the view **banks with the aircraft** (the engine camera has a
  `roll`); the propeller is not drawn from the pilot's seat (a frozen blade hid the view). The fly-past camera is narrower (30 degrees) and the victim camera's field of view follows the distance (8 to 50
  degrees) so that the aircraft is seen. Checked on the 12 types in the cruise and in the attack with the `planecams` scene.

## Unreleased — deck operations

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

## Unreleased — air operations

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

## Unreleased — gunnery

- **The shell is chosen against the target** (`shellChoice`): the expected damage per round of AP and of HE against where the target will be hit (belt, deck, upperworks), from the impact speed and fall angle at that range and
  the aspect of the target (beam-on or bow-on): AP where it gets through the plate and bursts inside, HE against destroyers (AP goes through without arming), against a bow-on battleship at long range (grazing angle, thick plate)
  and when the AP is gone. It used to depend on the class of the target alone (and a coin toss for cruisers).
- **Magazines**: every mount holds a number of rounds (about 100 a gun for 16 in, 150 for 8 in, 200 for 6 in, 280 for 5 in, 400-500 for the small ones), split between AP and HE for the guns that have both; a salvo spends
  one round a barrel; a mount with nothing left falls silent. Changing from one kind to the other means unloading the breech (a reload and a quarter) and is only done when the other shell is clearly better (a mount keeps
  what it has loaded when the loss is under 30 %). The ship panel shows the AP / HE left in the main battery.
- **Mounts with a target of their own**: a mount that cannot bear on its battery's target (out of its arc, out of range) picks an enemy it can engage (in its arc and range, valued by class, state and distance) and
  re-chooses every second or so, instead of staying idle; the secondary guns do the same.

## Unreleased — shells

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

## Unreleased — scoreboard

- **Tab** (held) or the "Tableau" button shows a live scoreboard: per team and per ship, ships sunk, aircraft shot down, shells fired, hits, accuracy, torpedoes (hits / launched), damage dealt, and state
  (hull % or how she was lost), sorted by kills, plus the last sinkings. Tab no longer selects the next ship (N / B / ] / [ still do). `Ship.torpFired` counts the torpedoes launched.

## Unreleased — ways of sinking

- A ship now goes down in one of several ways, chosen when she is lost (`Ship.chooseSinkMode`): **capsizing** (strongly one-sided flooding, a torpedo: the hull rolls over, floats keel up for a while, then
  goes down), **by the bow** or **by the stern** (the trim from the flooding: up to 65 degrees), **settling** on an even keel (even flooding), **burning out** (lost to fire: dead in the water for 30-100 s,
  cooking off ammunition with small explosions, then settling) and **blown apart** (magazine explosion: fast, wrecked). A long, battered ship whose neighbouring midships compartments are full
  can **break her back** by herself. The ship panel says how she was lost.
- Fixed: after a magazine explosion the two sections of a broken hull rose out of the water (up to 20 m): they now only hop a little, float on a buoyancy that falls with their leak, and go down.
- `sinktest` trailer scene (`--q ship=baltimore --q mode=roll|bow|stern|level|burn|blast|split`) to look at a way of sinking; tests in `test/damage.mjs`.

## Unreleased — finer meshes

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
