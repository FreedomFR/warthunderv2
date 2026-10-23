// What is inside a naval shell: the explosive as a share of the mass of the shell, by nation and calibre (NavWeaps' pages of every gun; the figures are the weight of the filler
// divided by the weight of the shell). The thick-walled armour-piercing shells hold 1.2 to 3 % of their mass (the US ones the least: 18.55 kg in a 1 225 kg 16-inch shell), the
// high-capacity and common shells 5 to 13 %. A shell does damage by its mass (the fragments of its case, the shock of its arrival) and by its explosive (the burst); the simulation's
// burst terms were calibrated on a shell with the filler of the reference below, and move with the real filler of each nation's shell, damped, within a third of it.
//   AP: [nation] -> by calibre [mm up to, share]           HE: the same for the common / high-capacity shells
const AP = {
  USA: [[999, 0.015]],
  Japan: [[160, 0.021], [250, 0.025], [999, 0.023]],
  UK: [[160, 0.033], [999, 0.025]],
  Germany: [[999, 0.026]],
  France: [[140, 0.05], [210, 0.04], [999, 0.025]],
  Italy: [[140, 0.045], [160, 0.017], [250, 0.025], [999, 0.0115]],
};
const HE = {
  USA: [[160, 0.12], [999, 0.082]],
  Japan: [[140, 0.08], [160, 0.055], [250, 0.065], [999, 0.06]],
  UK: [[160, 0.071], [999, 0.086]],
  Germany: [[999, 0.08]],
  France: [[140, 0.108], [999, 0.066]],
  Italy: [[160, 0.055], [999, 0.065]],
};
const REF = { AP: 0.02, HE: 0.08 };        // the filler of the shells the burst terms of sim/damage.js were calibrated on

/** The explosive share of a shell of the given nation, calibre (mm) and type ('AP' or 'HE'). */
function fillerShare(nation, cal, type) {
  const t = (type === 'AP' ? AP : HE)[nation] || (type === 'AP' ? AP.USA : HE.USA);
  for (const [upTo, share] of t) if (cal <= upTo) return share;
  return t[t.length - 1][1];
}

/** The factor on the burst of a shell: its filler against the reference, damped (a shell with twice the filler bursts 1.35 times as hard), between 0.75 and 1.4. */
export function burstFactor(nation, cal, type) {
  const r = fillerShare(nation, cal, type) / (type === 'AP' ? REF.AP : REF.HE);
  return Math.min(1.4, Math.max(0.75, Math.pow(r, 0.43)));
}
