// The bombs of the aircraft in the game, with what makes a bomb what it is: its mass, how much of it is explosive (the rest is the case), what the explosive is worth against TNT, the thickness
// of the case (how much of the blast is left once the case has taken its share), the delay of its fuze and the deck it can go through. Masses and fillers are those of the published
// ordnance tables (Wikipedia, the US Army bomb tables, NavWeaps, the Japanese ordnance lists); a figure marked `est` is a rounded guess where the source gives only the class.
//   kg       total mass                            filler    explosive in the bomb (kg)             fill   what the explosive is (FILL: its strength against TNT)
//   caseK    the share of the filler's energy that goes into blast and not into the case: thin case (general purpose, GP) 0.6, medium (MC, SD, SAP) 0.45, thick (AP, PC) 0.25
//   delay    fuze delay (s): 0 instantaneous, 0.025 short (a general purpose bomb through a deck), 0.04-0.05 for the armour-piercing ones
//   pen      mm of deck steel the bomb goes through at 220 m/s (a dive); scales with the square of the speed of impact
//   cls      GP general purpose / MC medium capacity / SD fragmentation / SAP semi-armour-piercing / AP armour-piercing / LAND thin-case blast for ground targets
// The bombs the aircraft carry are in data/loadouts.js; the torpedoes (their warheads) are in data/explosives.js (AIR_TORPEDO).
export const FILL = {
  tnt: 1.0, amatol: 0.93, shimose: 1.0, type91: 0.95, explosiveD: 0.85, trialen: 1.25, compB: 1.17, torpex: 1.3,
};

const lb = (x) => x * 0.4536;

export const BOMBS = {
  // ---- United States (AN series, 1943: half the weight is amatol or TNT) ----
  anm30: { name: '100 lb GP AN-M30', nation: 'USA', cls: 'GP', kg: lb(100), filler: 23, fill: 'amatol', caseK: 0.6, delay: 0.01, pen: 25 },
  anm57: { name: '250 lb GP AN-M57', nation: 'USA', cls: 'GP', kg: lb(250), filler: 54, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 30 },
  anm64: { name: '500 lb GP AN-M64', nation: 'USA', cls: 'GP', kg: lb(500), filler: 121, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 38 },
  anm65: { name: '1000 lb GP AN-M65', nation: 'USA', cls: 'GP', kg: lb(1000), filler: 252, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 45 },
  anm66: { name: '2000 lb GP AN-M66', nation: 'USA', cls: 'GP', kg: lb(2000), filler: 499, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 55 },
  anmk33: { name: '1000 lb AP AN-Mk 33', nation: 'USA', cls: 'AP', kg: lb(1000), filler: 63.5, fill: 'explosiveD', caseK: 0.25, delay: 0.04, pen: 100 },
  anmk1: { name: '1600 lb AP AN-Mk 1', nation: 'USA', cls: 'AP', kg: lb(1600), filler: 97.7, fill: 'explosiveD', caseK: 0.25, delay: 0.04, pen: 150 },
  // ---- the warheads of the cruise missiles (they strike as a bomb that goes through the plating and bursts inside; the fillers are estimates) ----
  rgm84: { name: 'RGM-84 Harpoon (WDU-18/B)', nation: 'USA', cls: 'SAP', kg: 221, filler: 100, fill: 'tnt', caseK: 0.45, delay: 0.012, pen: 45, est: true },
  bgm109: { name: 'BGM-109 Tomahawk (WDU-25/B)', nation: 'USA', cls: 'SAP', kg: 454, filler: 205, fill: 'tnt', caseK: 0.45, delay: 0.012, pen: 55, est: true },
  // ---- Soviet Union (FAB = fugasnaya aviabomba, the general-purpose bomb; the fillers are the published ones where the sources give them, an estimate of the share of the mass otherwise) ----
  fab50: { name: 'FAB-50', nation: 'USSR', cls: 'GP', kg: 50, filler: 21, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 25, est: true },
  fab100: { name: 'FAB-100', nation: 'USSR', cls: 'GP', kg: 100, filler: 40, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 28, est: true },
  fab250: { name: 'FAB-250', nation: 'USSR', cls: 'GP', kg: 250, filler: 100, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 38, est: true },
  // ---- Japan (Navy and Army bombs; the No. is the nominal mass in 10 kg) ----
  jn6: { name: 'Type 97 No.6 (60 kg)', nation: 'Japan', cls: 'GP', kg: 56, filler: 23, fill: 'type91', caseK: 0.6, delay: 0.01, pen: 25 },
  jn25: { name: 'Type 99 No.25 (250 kg)', nation: 'Japan', cls: 'MC', kg: 250, filler: 60, fill: 'type91', caseK: 0.45, delay: 0.025, pen: 50 },
  jn25l: { name: 'Type 98 No.25 land (250 kg)', nation: 'Japan', cls: 'LAND', kg: 241, filler: 96, fill: 'shimose', caseK: 0.6, delay: 0, pen: 20 },
  jn80l: { name: 'Type 98 No.80 land (800 kg)', nation: 'Japan', cls: 'LAND', kg: 800, filler: 382, fill: 'shimose', caseK: 0.6, delay: 0, pen: 30 },
  jn80ap: { name: 'Type 99 No.80 Mk 5 AP (800 kg)', nation: 'Japan', cls: 'AP', kg: 744, filler: 30, fill: 'type91', caseK: 0.2, delay: 0.05, pen: 150 },
  // ---- Britain ----
  uk30: { name: '30 lb bomb', nation: 'UK', cls: 'GP', kg: lb(30), filler: 3.5, fill: 'amatol', caseK: 0.5, delay: 0.01, pen: 15, est: true },
  uk250: { name: '250 lb MC', nation: 'UK', cls: 'MC', kg: lb(250), filler: 55, fill: 'amatol', caseK: 0.5, delay: 0.025, pen: 30 },
  uk500: { name: '500 lb MC', nation: 'UK', cls: 'MC', kg: lb(500), filler: 110, fill: 'amatol', caseK: 0.5, delay: 0.025, pen: 38 },
  uk500sap: { name: '500 lb SAP', nation: 'UK', cls: 'SAP', kg: lb(500), filler: 60, fill: 'tnt', caseK: 0.4, delay: 0.05, pen: 70 },
  uk1000: { name: '1000 lb MC', nation: 'UK', cls: 'MC', kg: lb(1000), filler: 230, fill: 'amatol', caseK: 0.5, delay: 0.025, pen: 45 },
  // ---- Germany ----
  sc50: { name: 'SC 50', nation: 'Germany', cls: 'GP', kg: 50, filler: 24, fill: 'amatol', caseK: 0.6, delay: 0.01, pen: 25 },
  sc250: { name: 'SC 250', nation: 'Germany', cls: 'GP', kg: 250, filler: 130, fill: 'amatol', caseK: 0.6, delay: 0.025, pen: 38 },
  sc500: { name: 'SC 500', nation: 'Germany', cls: 'GP', kg: 500, filler: 220, fill: 'amatol', caseK: 0.6, delay: 0.025, pen: 45 },
  sc1000: { name: 'SC 1000', nation: 'Germany', cls: 'GP', kg: 1000, filler: 600, fill: 'trialen', caseK: 0.6, delay: 0.025, pen: 55 },
  sd500: { name: 'SD 500', nation: 'Germany', cls: 'SD', kg: 535, filler: 200, fill: 'amatol', caseK: 0.45, delay: 0.025, pen: 55 },
  pc500: { name: 'PC 500 (armour-piercing)', nation: 'Germany', cls: 'AP', kg: 539, filler: 75, fill: 'amatol', caseK: 0.25, delay: 0.04, pen: 100 },
  // ---- Italy ----
  it50: { name: 'GP 50', nation: 'Italy', cls: 'GP', kg: 50, filler: 22, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 25, est: true },
  it100: { name: 'GP 100 T', nation: 'Italy', cls: 'GP', kg: 100, filler: 50.6, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 28 },
  it250: { name: 'GP 250', nation: 'Italy', cls: 'GP', kg: 250, filler: 125, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 36, est: true },
  it500: { name: 'GP 500', nation: 'Italy', cls: 'GP', kg: 500, filler: 250, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 44, est: true },
  it160ap: { name: 'Bomba 160 perforante', nation: 'Italy', cls: 'AP', kg: 160, filler: 32, fill: 'tnt', caseK: 0.3, delay: 0.04, pen: 70, est: true },
  // ---- France (the charges of the French bombs are estimates: 40-50 % of the mass) ----
  fr15: { name: 'bombe de 15 kg', nation: 'France', cls: 'GP', kg: 15, filler: 6.5, fill: 'tnt', caseK: 0.55, delay: 0.01, pen: 10, est: true },
  fr50: { name: 'bombe de 50 kg', nation: 'France', cls: 'GP', kg: 50, filler: 22, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 25, est: true },
  fr60: { name: 'bombe de 60 kg', nation: 'France', cls: 'GP', kg: 60, filler: 26, fill: 'tnt', caseK: 0.6, delay: 0.01, pen: 25, est: true },
  fr165: { name: 'bombe de 165 kg', nation: 'France', cls: 'GP', kg: 165, filler: 72, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 32, est: true },
  fr225: { name: 'bombe de 225 kg', nation: 'France', cls: 'GP', kg: 225, filler: 100, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 36, est: true },
};

for (const [id, b] of Object.entries(BOMBS)) { b.id = id; b.kg = Math.round(b.kg * 10) / 10; }

/** The energy of the burst as TNT (kg): the filler by its strength, less what goes into the case. */
export const blastTNT = (b) => b.filler * (FILL[b.fill] ?? 1) * b.caseK;
/** The whole filler as TNT (kg), with no allowance for the case (what a shock in water or a burst inside a compartment is worth). */
export const fillerTNT = (b) => b.filler * (FILL[b.fill] ?? 1);

/**
 * How far a burst of this bomb on the open ground wrecks an aircraft parked in the open (Hopkinson cube-root scaling on the blast of the filler, the 3 / 1.5 / 0.7 psi lines of the
 * damage criteria for parked aircraft): { dead, hurt, light } in metres: aircraft inside `dead` are destroyed, between `dead` and `hurt` destroyed or heavily damaged, between `hurt` and
 * `light` scorched by fragments and blast.
 */
export function aircraftRadii(b) {
  const w = Math.cbrt(Math.max(blastTNT(b), 0.5));
  return { dead: 7.4 * w, hurt: 11.9 * w, light: 22.3 * w };
}

/** The chance that an aircraft parked in the open at `d` metres from a burst is destroyed: 1 inside two thirds of the radius of destruction, 0.5 at it, falling to 0 at the radius of heavy damage. */
export function killChance(d, R) {
  if (d <= R.dead / 1.5) return 1;
  if (d <= R.dead) return 1 - 0.5 * (d - R.dead / 1.5) / (R.dead - R.dead / 1.5);
  if (d <= R.hurt) return 0.5 * (1 - (d - R.dead) / (R.hurt - R.dead));
  return 0;
}

/**
 * The shock of an explosion in the water at `r` metres (Cole's law for TNT: peak pressure in MPa for W kg of TNT): 20 MPa opens the seams of plating, 40 MPa holes it
 * (calibrated on the near misses of Indomitable, Prince of Wales and Gurkha).
 */
export const shockMPa = (wTNT, r) => 52.3 * Math.pow(Math.cbrt(Math.max(wTNT, 0.1)) / Math.max(r, 0.8), 1.13);

/** A bomb of the given mass with the figures of a general-purpose bomb (for the bombs that nothing says anything about: the aircraft made by a test or by the old specs). */
export function genericBomb(kg) {
  return { id: 'generic', name: `bombe de ${Math.round(kg)} kg`, nation: '', cls: 'GP', kg, filler: kg * 0.45, fill: 'tnt', caseK: 0.6, delay: 0.025, pen: 20 + 12 * Math.sqrt(kg / 100) };
}
