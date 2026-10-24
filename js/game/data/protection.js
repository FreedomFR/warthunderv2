// Protection and survivability data that the spec sheets do not carry: how the armour is laid out (belt inclination, the thin
// weather deck above the armoured one), the underwater protection of each ship, and what her navy did about fire and flooding.
// Figures marked `estimated` are guesses by analogy with the sister classes. Sources are listed in CHANGELOG.md.

/**
 * Per navy.
 *   fuze      - delay of the base fuze of armour-piercing shells (s) by calibre class: [limit in mm, delay], first match.
 *   dud       - share of armour-piercing shells whose fuze fails (estimated, the British and German ones had real trouble early on).
 *   breakup   - Japanese-style shells that break up at high obliquity (see navweaps: Type 91 tests): incidence above which they start to.
 *   flash     - how readily a hit on a turret / handling room sends a flash down to the magazine, 1 = the average of the navies:
 *               cordite (British) is far easier to ignite than the US single-base powder, the German brass cartridges isolate the charge.
 *   dc        - damage control: fire fighting, pumping, flooding magazines in time, counter-flooding (1 = the US Navy).
 */
export const NAVY = {
  USA: { fuze: [[160, 0.010], [210, 0.020], [999, 0.033]], dud: 0.03, breakup: 90, flash: 0.75, dc: 1.0 },
  UK: { fuze: [[160, 0.025], [999, 0.035]], dud: 0.07, breakup: 90, flash: 1.5, dc: 0.9 },
  Germany: { fuze: [[160, 0.020], [999, 0.035]], dud: 0.08, breakup: 90, flash: 0.6, dc: 0.9 },
  Japan: { fuze: [[160, 0.020], [999, 0.40]], dud: 0.05, breakup: 55, flash: 1.0, dc: 0.6 },
  France: { fuze: [[160, 0.020], [999, 0.030]], dud: 0.07, breakup: 90, flash: 1.0, dc: 0.8 },
  Italy: { fuze: [[160, 0.020], [999, 0.030]], dud: 0.07, breakup: 90, flash: 1.0, dc: 0.75 },
};

/**
 * Per ship (all optional).
 *   beltIncl     - inclination of the belt from the vertical (degrees, top inboard): the plate then faces a falling shell more squarely.
 *   weather      - the thin deck above the armoured one (mm): a plunging shell has to cross both (spaced plates).
 *   lower        - thickness (mm) of the lower belt under the waterline, when it is known.
 *   torp         - underwater protection: design resistance (kg of TNT) and `flaw` (0..1, the share of that resistance the system really
 *                  gave: Yamato's joint between the belts, Pugliese's cylinder that did not collapse).
 *   avgas        - (carriers) the fuel system: 'closed' (inerted lines, CO2-filled piping, foam) or 'open' (vapour reached the hangars).
 */
export const PROTECTION = {
  // ---- USA
  fletcher: { torp: { kg: 0 } },
  cleveland: { torp: { kg: 90 } },                              // estimated
  baltimore: { torp: { kg: 110 } },                             // estimated
  iowa: { beltIncl: 19, weather: 38, lower: 80, torp: { kg: 320, flaw: 0.85 } },    // 5.5 m system; the liquid loading had to be modified to work
  essex: { beltIncl: 0, torp: { kg: 150 }, avgas: 'closed' },   // estimated
  enterprise: { beltIncl: 0, torp: { kg: 90 }, avgas: 'closed' },   // estimated: no bulges, a weaker side system than the Essex (the Yorktown sank of two torpedo hits); the fuel lines were inerted with CO2 after the Coral Sea
  hawaii: { beltIncl: 10, torp: { kg: 200 } },                  // Alaska class: belt sloped 10 degrees; the resistance of the side system is estimated
  // ---- Japan
  kagero: { torp: { kg: 0 } },
  agano: { torp: { kg: 80 } },                                  // estimated
  takao: { torp: { kg: 120 } },                                 // estimated
  yamato: { beltIncl: 20, weather: 35, lower: 200, torp: { kg: 400, flaw: 0.6 } },     // joint between the upper and lower belt failed under light torpedo hits
  shokaku: { torp: { kg: 150 }, avgas: 'open' },                // estimated; liquid-loaded belt
  // ---- UK
  tribal: { torp: { kg: 0 } },
  belfast: { torp: { kg: 100 } },                               // estimated
  norfolk: { torp: { kg: 60 } },                                // estimated
  kgv: { weather: 32, lower: 150, torp: { kg: 454 } },          // designed against a 1000 lb warhead, tested at full scale
  illustrious: { torp: { kg: 150 }, avgas: 'closed' },          // estimated
  // ---- Germany
  type1936a_mob: { torp: { kg: 0 } },
  koenigsberg: { torp: { kg: 80 } },                            // estimated; 15 mm torpedo bulkhead
  admiral_hipper: { torp: { kg: 100 } },                        // estimated; 20 mm torpedo bulkhead
  bismarck: { weather: 50, lower: 170, torp: { kg: 250 } },     // 5.5 m system with a 45-53 mm bulkhead, 250 kg TNT
  tirpitz: { weather: 50, lower: 170, torp: { kg: 250 } },      // as the Bismarck (same class and belts)
  graf_zeppelin: { torp: { kg: 150 }, avgas: 'closed' },        // estimated
  // ---- France
  fantasque: { torp: { kg: 0 } },
  la_galissoniere: { torp: { kg: 90 } },                        // estimated
  algerie: { torp: { kg: 120 } },                               // 40 mm torpedo bulkhead
  richelieu: { beltIncl: 15.4, weather: 40, torp: { kg: 300, flaw: 0.9 } },           // estimated resistance
  bearn: { torp: { kg: 100 }, avgas: 'closed' },                // estimated
  // ---- Italy
  soldati: { torp: { kg: 0 } },
  montecuccoli: { torp: { kg: 90 } },                           // estimated
  zara: { torp: { kg: 110 } },                                  // estimated
  littorio: { beltIncl: 13, weather: 20, torp: { kg: 350, flaw: 0.75 } },            // Pugliese: 350 kg; the cylinder did not collapse as planned
  aquila: { torp: { kg: 200 }, avgas: 'closed' },               // estimated; deep bulges
};

export function protectionOf(spec) { return PROTECTION[spec.id] || PROTECTION[spec.baseId] || {}; }
export function navyOf(nation) { return NAVY[nation] || NAVY.USA; }
