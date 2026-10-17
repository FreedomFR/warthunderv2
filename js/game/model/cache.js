// Ship models are built once per class and shared by every ship of that class.
import { buildShipModel } from './shipbuilder.js';
import { TWEAKS } from './tweaks.js';

const models = new Map();
export function getModel(spec) {
  let m = models.get(spec.id);
  if (!m) { m = buildShipModel(spec, TWEAKS[spec.id] || {}); models.set(spec.id, m); }
  return m;
}
