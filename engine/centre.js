// engine/centre.js — the city-centre monument.
//
// Taken from a structure saved in game: a block of diamond three wide and four
// deep with a person-sized alcove through the front of it, a sign above the
// entrance, and beacons on the roof whose beams shoot into the sky, so the
// spot you build from is impossible to miss.
//
//   looking down          from the front (the alcove runs back from here)
//   z0  . A .             the sign sits above the entrance
//   z1  D A D             A = the alcove, D = diamond
//   z2  D A D
//   z3  D D D
//
// /function <city>/build_centered puts you in the alcove: the city is centred
// on that block.

import { MAT, wallSignId, MATERIALS } from './materials.js';
import { N } from './blockcore.js';
import { signTags } from './landmarks.js';

// The template, exactly as saved (the structure block used to save it is left
// out). x runs 0..2, z runs 0..3 with the entrance on the z = 0 side, y 0..3
// from the ground up.
export const CENTRE = {
  sx: 3, sy: 4, sz: 4,
  stand: [1, 0, 1],                 // where you end up: one block inside the alcove
  entrance: [0, -1],                // the way the alcove (and the sign) faces
  sign: [1, 2, 0],
  diamond: [[0, 0, 1], [0, 0, 2], [0, 0, 3], [0, 1, 1], [0, 1, 2], [0, 1, 3], [0, 2, 1], [0, 2, 2], [0, 2, 3],
    [1, 0, 3], [1, 1, 3], [1, 2, 1], [1, 2, 2], [1, 2, 3],
    [2, 0, 1], [2, 0, 2], [2, 0, 3], [2, 1, 1], [2, 1, 2], [2, 1, 3], [2, 2, 1], [2, 2, 2], [2, 2, 3]],
  beacons: [[0, 3, 1], [1, 3, 2], [2, 3, 1]],
};
export const CENTRE_TEXT = 'Polis\ncity centre\nyou built\nfrom here';

// quarter turns clockwise about y, so the entrance can face any street
const FACE_OF = { '0,-1': 'north', '0,1': 'south', '1,0': 'east', '-1,0': 'west' };
export function rotateCell([x, y, z], r, sx, sz) {
  if (r === 0) return [x, y, z];
  if (r === 1) return [sz - 1 - z, y, x];
  if (r === 2) return [sx - 1 - x, y, sz - 1 - z];
  return [z, y, sx - 1 - x];
}
export const rotateVec = ([dx, dz], r) => (r === 0 ? [dx, dz] : r === 1 ? [-dz, dx] : r === 2 ? [-dx, -dz] : [dz, -dx]);
export const footprint = (r) => (r % 2 === 0 ? [CENTRE.sx, CENTRE.sz] : [CENTRE.sz, CENTRE.sx]);

// Build it with its (0,0,0) corner at (ox, G + 1, oz), turned r quarter turns.
// Returns where you will stand, the sign and the beacons.
export function buildCentre(world, ox, oz, gy, r) {
  const { sx, sz } = CENTRE;
  const put = (cell, id, data) => {
    const [cx, cy, cz] = rotateCell(cell, r, sx, sz);
    world.set(ox + cx, gy + cy, oz + cz, id);
    if (data) world.setData(ox + cx, gy + cy, oz + cz, data);
    return [ox + cx, gy + cy, oz + cz];
  };
  for (const cell of CENTRE.diamond) put(cell, MAT.DIAMOND);
  const beacons = CENTRE.beacons.map((cell) => put(cell, MAT.BEACON,
    { id: 'Beacon', tags: { primary: N.int(0), secondary: N.int(0) } }));
  const facing = FACE_OF[rotateVec(CENTRE.entrance, r).join(',')];
  const sign = put(CENTRE.sign, wallSignId(facing), { id: 'Sign', tags: signTags(CENTRE_TEXT) });
  const [stx, sty, stz] = rotateCell(CENTRE.stand, r, sx, sz);
  const stand = [ox + stx, gy + sty, oz + stz];
  return { stand, sign, beacons, facing, rotation: r };
}

// Every cell the monument needs, as offsets from its corner (for clearing and
// for checking the ground underneath).
export function centreCells(r) {
  const { sx, sz, sy } = CENTRE;
  const out = [];
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) {
    const [cx, , cz] = rotateCell([x, 0, z], r, sx, sz);
    out.push([cx, cz]);
  }
  return { cells: out, height: sy };
}
