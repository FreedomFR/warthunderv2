// Tiers of the tech tree: six eras, cut by the year the class entered service. The cuts follow how the 30 classes are spread over time
// (a lot of them are from 1940, hence a one-year tier for 1940 and for 1941), not a fixed number of years.
export const TIERS = [
  { n: 1, roman: 'I', from: -Infinity, to: 1931, years: 'jusqu\'en 1931', name: 'Entre-deux-guerres' },
  { n: 2, roman: 'II', from: 1932, to: 1936, years: '1932 – 1936', name: 'Le réarmement' },
  { n: 3, roman: 'III', from: 1937, to: 1939, years: '1937 – 1939', name: 'Veille de la guerre' },
  { n: 4, roman: 'IV', from: 1940, to: 1940, years: '1940', name: 'La guerre en Europe' },
  { n: 5, roman: 'V', from: 1941, to: 1941, years: '1941', name: 'Le Pacifique s\'embrase' },
  { n: 6, roman: 'VI', from: 1942, to: Infinity, years: '1942 et après', name: 'Guerre totale' },
];

export function tierOf(year) {
  return TIERS.find((t) => year >= t.from && year <= t.to) || TIERS[TIERS.length - 1];
}
