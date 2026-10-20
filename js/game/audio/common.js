// Constants and small helpers shared by the audio modules.
export const C_SOUND = 343;          // speed of sound, m/s
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clampR = (v, a, b) => (v < a ? a : v > b ? b : v);
