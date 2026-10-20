// Helpers shared by the effects.
export const rnd = Math.random;
export const rr = (a, b) => a + (b - a) * rnd();
/** a count that is a whole number on average (the clouds of smoke are thinned out, down to nothing, when the pool of particles fills up) */
export const stoch = (x) => Math.floor(x + rnd());
