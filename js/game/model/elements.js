// Elements copied from the reference models, by ship id (tools/refs/groupmounts.py wrote ships/<id>_elements.js): { MOUNT_SCALE, KINDS: { id: { house, guns, trunnion, muzzle, type } }, PLACEMENTS: [{ kind, type, x, y, z, yaw }] }.
// A ship is listed here only once its elements have been checked against its model, from several angles and at several elevations.
import * as yamato from './ships/yamato_elements.js';

export const ELEMENTS = { yamato };
