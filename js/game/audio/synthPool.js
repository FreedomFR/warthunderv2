// A small pool of web workers that build the sounds (audio/synthWorker.js). The page opened from a single file (naval.html) carries the worker's
// code as text (window.__SYNTH_WORKER, put there by build.mjs) and starts it from a blob; the page served as files starts the module.

/** { size, run(name, sr, arg, variant) -> Promise<Float32Array>, close() }, or null when workers cannot be used here. */
export function makeSynthPool(max = 3) {
  if (typeof Worker === 'undefined') return null;
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const size = Math.max(1, Math.min(max, cores - 1));
  let workers = [], url = null;
  try {
    const code = typeof window !== 'undefined' ? window.__SYNTH_WORKER : null;
    if (code) { url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); for (let i = 0; i < size; i++) workers.push(new Worker(url)); }
    else for (let i = 0; i < size; i++) workers.push(new Worker(new URL('./synthWorker.js', import.meta.url), { type: 'module' }));
  } catch (e) { for (const w of workers) w.terminate(); return null; }
  const pending = new Map();
  let nextId = 1, turn = 0, dead = false;
  const fail = (why) => { dead = true; for (const [, p] of pending) p.reject(why); pending.clear(); };
  for (const w of workers) {
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(e.data.error); else p.resolve(e.data.data);
    };
    w.onerror = () => fail('worker error');
  }
  return {
    size,
    run(name, sr, arg, variant) {
      if (dead) return Promise.reject('no workers');
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        workers[turn++ % workers.length].postMessage({ id, name, sr, arg, variant });
      });
    },
    close() { for (const w of workers) w.terminate(); if (url) URL.revokeObjectURL(url); },
  };
}
