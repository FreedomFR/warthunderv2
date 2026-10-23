// Other fits of a ship the game already has (same model, another date: other guns, other light mounts). A variant is a spec sheet derived from its base's; the model-side differences
// (tweaks, the mounts of the model that are left out, the light mounts added) are in model/variants.js. Sources are the notes of the base sheets.
const keep = (o) => o;

export const VARIANTS = [
  {
    id: 'tade_pb39', base: 'tade',
    spec: (b) => ({
      className: 'Momi class: Patrol Boat No. 39 (ex-Tade), 1939-40 conversion', refShip: 'Japanese patrol boat No. 39 (ex-Tade), 1940', classShips: ['Patrol Boat No. 39 (ex-Tade)'], commissioned: 1940,
      main: { ...b.main, gunsTotal: 2, mounts: b.main.mounts.filter((m) => m.label !== 'Y') },      // the aft gun was removed (Combinedfleet record; the class article says the amidships one: the sources disagree)
      torpedoes: null,      // both twin mounts were removed in the 1939 conversion
      notes: 'The 1939-40 conversion of the destroyer Tade: two 12 cm guns, the torpedo tubes landed, two triple 25 mm Type 96 added (six guns), depth-charge racks (not simulated).',
    }),
  },
  {
    id: 'kagero_1944', base: 'kagero',
    spec: (b) => ({
      className: 'Kagero class: Yukikaze, 1944-45 fit', refShip: 'Japanese destroyer Yukikaze (1945 fit)', classShips: ['Yukikaze'], commissioned: 1944,
      main: { ...b.main, gunsTotal: 4, mounts: b.main.mounts.filter((m) => m.label !== 'X') },      // X mount removed Aug-Sep 1943, replaced by two triple 25 mm
      notes: 'Yukikaze as in 1944-45: the X turret landed, 28 x 25 mm (4 triples, 1 twin, 14 singles), 16 torpedoes; the 13 mm machine guns and the depth charges are not simulated.',
    }),
  },
  {
    id: 'shokaku_1944', base: 'shokaku',
    spec: () => ({
      className: 'Shokaku class: June 1944 fit (Philippine Sea)', refShip: 'Japanese aircraft carrier Shokaku (June 1944)', classShips: ['Shokaku'], commissioned: 1944,
      notes: 'Shokaku before the Philippine Sea: 20 triple 25 mm and about 10 single mounts (about 70 barrels), against 18 triples (54 barrels) in the June-October 1942 fit of the base sheet.',
    }),
  },
  {
    id: 'gioberti_1940', base: 'gioberti',
    spec: () => ({
      className: 'Oriani class: Vincenzo Gioberti, 1940 fit', refShip: 'Vincenzo Gioberti (1939-41 fit)', classShips: ['Vincenzo Gioberti'], commissioned: 1940,
      notes: 'The 1939-40 modernisation: the four twin 13.2 mm Breda replaced by eight single 20/65 Breda (Italian Wikipedia, naval-encyclopedia; Navypedia has the 13.2 mm kept), the rest as built.',
    }),
  },
  {
    id: 'gioberti_1942', base: 'gioberti',
    spec: (b) => ({
      className: 'Oriani class: Vincenzo Gioberti, 1942-43 fit', refShip: 'Vincenzo Gioberti (1942-43 fit)', classShips: ['Vincenzo Gioberti'], commissioned: 1942,
      secondary: b.secondary.map((g) => ({ ...g, mounts: 1, positions: g.positions.slice(0, 1) })),      // one 120/15 landed (naval-encyclopedia and Navypedia keep one; Italian Wikipedia says both)
      torpedoes: { ...b.torpedoes, tubes: 3, fractionFromBow: b.torpedoes.fractionFromBow.slice(0, 1), mounts: 'one triple on the centreline (the after bank landed in 1941-42)' },
      notes: 'The 1941-42 refit: the after torpedo bank and one 120/15 landed, two twin 37/54 Breda and two twin 20/70 Scotti-Isotta Fraschini added to the eight single 20/65 (Navypedia, naval-encyclopedia; Italian Wikipedia has three twin 20/65), a German echo sounder, two more depth-charge throwers (not simulated).',
    }),
  },
  {
    // The Iowa rebuilt for the 1980s (the model of the ship is the 1944 one: no model of the 1991 fit was available; the launchers and the close-in guns are drawn by the game)
    id: 'missouri_1991', base: 'iowa',
    spec: (b) => ({
      className: 'Iowa class: USS Missouri (BB-63), Persian Gulf 1991', refShip: 'USS Missouri (BB-63), 1991 (Desert Storm)', classShips: ['USS Missouri (BB-63)'], commissioned: 1991,
      displacementStd: 48500, displacementFull: 57500, crew: 1500, speedKn: 32,
      secondary: b.secondary.map((g) => ({ ...g, mounts: 6, positions: g.positions.filter((p) => p.offsetM < 14), layout: '6 twin Mk 28 mounts, 3 each side: four of the ten were landed in 1984 to make room for the armoured box launchers (the two outer ones abreast the funnels, each side; which four is estimated)' })),
      aa: 'Four Mk 15 Phalanx close-in weapons (20 mm, 4 500 rounds a minute; the places are estimated): the 40 mm and 20 mm of 1945 were all landed in the 1984-86 reconstruction.',
      aircraft: null,
      missiles: [
        { id: 'tomahawk', model: 'tomahawk', kind: 'ssm', name: 'BGM-109 Tomahawk', launcher: '8 Mk 143 armoured box launchers (4 cells each), on the 01 level either side of the funnels', count: 32, salvo: 2, cycleS: 30, minRangeM: 10000, maxRangeM: 460000, speedMs: 245, ord: 'bgm109', targets: ['ship', 'base'], altM: 20, warheadKg: 454, explosive: 'tnt',
          note: 'TASM / TLAM: subsonic (Mach 0.72, 880 km/h) at 15-30 m, a 454 kg WDU-25/B warhead; 460 km against ships (TASM), more against land. In the game it is fired at any ship or base in the range of sight of the ship.' },
        { id: 'harpoon', model: 'harpoon', kind: 'ssm', name: 'RGM-84 Harpoon', launcher: '4 Mk 141 quadruple canisters, abaft the after funnel', count: 16, salvo: 2, cycleS: 20, minRangeM: 6000, maxRangeM: 124000, speedMs: 240, ord: 'rgm84', targets: ['ship'], altM: 15, warheadKg: 221, explosive: 'tnt',
          note: 'Active radar homing, Mach 0.71, sea-skimming (15 m, 5 m at the end), a 221 kg WDU-18/B penetrating warhead; 124 km. Fired at ships only.' },
      ],
      paint: { hull: '#8A969B', boot: '#2A2D30', deck: '#6B7378', superstructure: '#8A969B', notes: 'Overall haze gray (Measure 22, 1991)' },
      notes: 'The 1984-86 reconstruction (Reagan era): 32 Tomahawk, 16 Harpoon, 4 Phalanx; the 20 mm, the 40 mm and four of the ten 5-inch mounts landed; the catapults and the aircraft landed. The structures, the radars and the guns of the model are those of 1944 (a model of the 1991 fit is wanted).',
    }),
  },
];

/** The spec sheet of a variant: its base's with the differences, and the id of the base (`baseId`: the lookups by ship that the variant shares: livery, protection, screws, wiki picture). */
export function deriveSpec(base, v) { return { ...base, ...keep(v.spec(base)), id: v.id, baseId: base.id }; }
