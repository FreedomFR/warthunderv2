// What kind of device the game runs on. Shared by the engine (pixel density), the game (quality) and the touch interface.
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** A phone or a tablet: a touch screen as the main pointer (no mouse, usually no keyboard). `?mobile=1` / `?mobile=0` force the answer. */
export function isMobile() {
  const f = qs.get('mobile');
  if (f === '1') return true;
  if (f === '0') return false;
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches;
}

/** The highest pixel density the canvas is rendered at: a phone reports 3 to 4 device pixels per CSS pixel, which would be 8 to 14 times the pixels of a normal screen. */
export const maxPixelRatio = () => (isMobile() ? 1.5 : Infinity);
