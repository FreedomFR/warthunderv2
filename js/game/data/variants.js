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
];

/** The spec sheet of a variant: its base's with the differences, and the id of the base (`baseId`: the lookups by ship that the variant shares: livery, protection, screws, wiki picture). */
export function deriveSpec(base, v) { return { ...base, ...keep(v.spec(base)), id: v.id, baseId: base.id }; }
