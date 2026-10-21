// Builds the sounds on another thread: the library (synth.js) asks for one buffer at a time and gets the samples back (transferred, not copied).
import { renderSound } from './synth.js';

self.onmessage = (e) => {
  const { id, name, sr, arg, variant } = e.data;
  try {
    const data = renderSound(name, sr, arg, variant);
    self.postMessage({ id, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
