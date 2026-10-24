// Keeps the screen awake while the game is on the screen (a battle is watched, not played: no key is pressed for minutes, and the system would dim the screen and lock the
// phone). The Screen Wake Lock API gives the lock; the browser drops it when the page is hidden, so it is asked again when the page comes back, and after the first touch or key
// (some browsers only grant it after a gesture).
let lock = null, wanted = false;

async function acquire() {
  if (!wanted || lock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch (e) { /* refused here (battery saver, an iframe, no gesture yet): tried again later */ }
}

/** Ask for the screen to stay awake from now on (safe to call more than once). */
export function keepAwake() {
  if (wanted) { acquire(); return; }
  wanted = true;
  document.addEventListener('visibilitychange', acquire);
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, acquire, { passive: true });
  acquire();
}

/** Let the screen sleep again. */
export function allowSleep() {
  wanted = false;
  if (lock) { lock.release().catch(() => {}); lock = null; }
}
