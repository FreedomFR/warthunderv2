// The screws and the rudder of the ships whose underwater body was not measured on a plan (tweaks.props / tweaks.rudders): drawn from the number of shafts the class had,
// and the draught. They are only for the eye (and for the animation: the screws turn with the speed, the rudder follows the helm): the damage model keeps its own shaft layout.

/** Shafts of the classes that have no measured screws. */
const SHAFTS = {
  cleveland: 4, baltimore: 4, agano: 4, takao: 4, shokaku: 4, tribal: 2, belfast: 4, norfolk: 4, illustrious: 3, type1936a_mob: 2, koenigsberg: 2, admiral_hipper: 3,
  graf_zeppelin: 4, fantasque: 2, la_galissoniere: 2, algerie: 4, bearn: 4, montecuccoli: 2, zara: 2, littorio: 4, aquila: 4,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** { props, rudders } in the format of tweaks.js, or null when the class is not in the table. */
export function defaultScrews(spec) {
  const n = SHAFTS[spec.id];
  if (!n) return null;
  const B = spec.beam, draft = spec.draft, big = spec.type === 'BB' || spec.type === 'CV';
  const d = clamp(0.6 * draft + 0.6, 2.4, 5.4), depth = Math.max(d / 2 + 0.2, draft - d / 2 - 0.2), blades = big ? 4 : 3;
  const mk = (f, z, inner) => ({ f, ...(z ? { z } : {}), depth, d, blades, toF: f - 0.1, ...(inner ? { skeg: true } : { strutF: f - 0.012 }) });
  const props = [];
  if (n === 2) props.push(mk(0.93, B * 0.15, true));
  else if (n === 3) props.push(mk(0.93, 0, true), mk(0.905, B * 0.27, false));
  else props.push(mk(0.93, B * 0.11, true), mk(0.905, B * 0.27, false));
  const rudders = [{ f: 0.965, top: 1.5, bottom: draft * 0.97, chord: clamp(B * 0.17, 2.4, 6.5) }];
  return { props, rudders };
}
