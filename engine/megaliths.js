// engine/megaliths.js — Celtic monuments for the parks.
//
// From the top of the "Tableau d'archéologie" plate, "Monuments celtiques et
// druidiques":
//
//   menhir     a single standing stone (peulvan), 3 to 5 blocks tall,
//              weathering from grey stone at the foot to mossy at the crown
//   dolmen     upright stones carrying a flat capstone: a small chamber you
//              can walk into, two blocks of head room under the slab
//   cromlech   a ring of standing stones round an open centre
//
// A monument takes one quadrant of the park, never the paths, the pond or the
// panda grove, and stands only on grass with open air above it.

import { MAT } from './materials.js';

export const MEGALITHS = ['menhir', 'dolmen', 'cromlech'];
const NEED = { cromlech: [7, 7], dolmen: [4, 3], menhir: [1, 1] };      // footprint, before a one-block margin

function overlaps(a, b) {
  return b && a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}

// Stone for height t of a stone h tall: grey at the foot, andesite, a mossy crown.
function stoneAt(t, h) {
  if (t === h - 1 && h >= 3) return MAT.MOSSY_COBBLE;
  return t < 2 ? MAT.BASE : MAT.ANDESITE;
}

/**
 * lot: the park; (cx, cz): its path crossing; avoid: rects already taken.
 * Returns { kind, x0, z0, x1, z1, stones: [[x, y, z]...], topY } or null.
 */
export function megalith(world, lot, cx, cz, rng, G, avoid = []) {
  const quads = [
    { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: cx - 2, z1: cz - 2 },
    { x0: cx + 2, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: cz - 2 },
    { x0: lot.x0 + 1, z0: cz + 2, x1: cx - 2, z1: lot.z1 - 1 },
    { x0: cx + 2, z0: cz + 2, x1: lot.x1 - 1, z1: lot.z1 - 1 },
  ].filter((q) => q.x1 >= q.x0 && q.z1 >= q.z0 && !avoid.some((a) => overlaps(q, a)));
  // every cell of the quadrant must be open grass
  const open = (q) => {
    for (let z = q.z0; z <= q.z1; z++)
      for (let x = q.x0; x <= q.x1; x++)
        if (world.get(x, G, z) !== MAT.GRASS || world.has(x, G + 1, z)) return false;
    return true;
  };
  const usable = rng.shuffle(quads.filter(open));
  if (!usable.length) return null;
  // the grandest kind that fits somewhere, with a little chance of a humbler one
  const kinds = ['cromlech', 'dolmen', 'menhir'].filter(() => true);
  const fits = (q, kind) => {
    const [a, b] = NEED[kind];
    const W = q.x1 - q.x0 + 1, D = q.z1 - q.z0 + 1;
    return (W >= a + 2 && D >= b + 2) || (W >= b + 2 && D >= a + 2);
  };
  let kind = null, q = null;
  for (const k of kinds) {
    if (k !== 'menhir' && rng.chance(0.25)) continue;         // sometimes settle for less
    q = usable.find((u) => fits(u, k));
    if (q) { kind = k; break; }
  }
  if (!kind) { q = usable.find((u) => fits(u, 'menhir')); kind = q ? 'menhir' : null; }
  if (!kind) return null;

  const mx = Math.floor((q.x0 + q.x1) / 2), mz = Math.floor((q.z0 + q.z1) / 2);
  const stones = [];
  const stand = (x, z, h) => {
    for (let t = 0; t < h; t++) { world.set(x, G + 1 + t, z, stoneAt(t, h)); stones.push([x, G + 1 + t, z]); }
  };
  let box, topY;
  if (kind === 'menhir') {
    const h = rng.int(3, 5);
    stand(mx, mz, h);
    box = { x0: mx, z0: mz, x1: mx, z1: mz };
    topY = G + h;
  } else if (kind === 'dolmen') {
    // 4 long by 3 wide, the long way along the quadrant's longer side
    const alongX = (q.x1 - q.x0) >= (q.z1 - q.z0);
    const L = 4, Wd = 3;
    const x0 = mx - (alongX ? 1 : 1), z0 = mz - (alongX ? 1 : 1);
    const x1 = x0 + (alongX ? L : Wd) - 1, z1 = z0 + (alongX ? Wd : L) - 1;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) stand(x, z, 2);
    // the closed end: a slab stone between the two back uprights
    const back = alongX ? [[x1, z0 + 1]] : [[x0 + 1, z1]];
    for (const [x, z] of back) stand(x, z, 2);
    // the capstone, one course over the uprights
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { world.set(x, G + 3, z, (x + z) % 3 ? MAT.BASE : MAT.ANDESITE); stones.push([x, G + 3, z]); }
    box = { x0, z0, x1, z1 };
    topY = G + 3;
  } else {
    // eight stones on a circle of radius 3, one taller: the king stone
    const king = rng.int(0, 7);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const x = mx + Math.round(3 * Math.cos(a)), z = mz + Math.round(3 * Math.sin(a));
      stand(x, z, k === king ? 3 : 2);
    }
    box = { x0: mx - 3, z0: mz - 3, x1: mx + 3, z1: mz + 3 };
    topY = G + 3;
  }
  return { kind, ...box, stones, topY, quad: q };
}
