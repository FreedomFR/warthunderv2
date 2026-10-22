// The gun houses and barrels read on the reference models of the ships drawn from baked meshes (tools/refs/bakemounts2.py), by ship id: { MOUNTS_BAKED, MOUNT_SCALE }.
import * as kagero from './ships/kagero_mounts_baked.js';
import * as tade from './ships/tade_mounts_baked.js';
import * as gioberti from './ships/gioberti_mounts_baked.js';
import * as adams from './ships/adams_mounts_baked.js';
import * as graf_spee from './ships/graf_spee_mounts_baked.js';
import * as shokaku from './ships/shokaku_mounts_baked.js';

export const BAKED_MOUNTS = { kagero, tade, gioberti, adams, graf_spee, shokaku };
