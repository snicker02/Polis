// engine/courtyard.js — L- and U-shaped courtyard buildings.
//
// A courtyard building is made of wings, each a whole Polis building: its own
// stair core, rooms, furniture and walk-through, all the guarantees of any
// other building. The wings share one theme, one floor count and one floor
// height, and stand side by side, so from outside they read as one block
// wrapped round a court. The court always opens onto the street, so every
// door is reached from the street:
//
//        street                     street
//   +----+......+----+         +----+............
//   |    : court:    |         |    :  court    :
//   |side:      :side|         |side:           :
//   |    +------+    |         |    +-----------+
//   |    | back |    |         |    |   back    |
//   +----+------+----+         +----+-----------+
//            U                          L
//
// Side wings run the full depth with their door on the street end; the back
// wing has its door on its face to the court. The court is laid as a lawn
// with a path from the street to the back wing's door, flowers along its
// edges, and a lantern post.
//
// Geometry works in street terms, as the school does: d runs back from the
// street edge, a runs across (left to right seen from the street).

import { MAT, FLOWERS } from './materials.js';

export const WING_MIN = 7, WING_MAX = 10, COURT_MIN = 5;
// the back wing is as wide as the court; narrower than this and a building
// cannot carry its stair core up more than one floor
export const BACK_MIN = 7;

function frame(fx0, fz0, fx1, fz1, face) {
  const alongX = face === 'north' || face === 'south';
  const W = alongX ? fx1 - fx0 + 1 : fz1 - fz0 + 1;      // across the street face
  const D = alongX ? fz1 - fz0 + 1 : fx1 - fx0 + 1;      // back from it
  const at = (d, a) => {
    if (face === 'south') return [fx0 + a, fz1 - d];
    if (face === 'north') return [fx1 - a, fz0 + d];
    if (face === 'east') return [fx1 - d, fz1 - a];
    return [fx0 + d, fz0 + a];
  };
  const rect = (d0, d1, a0, a1) => {
    const [x0, z0] = at(d0, a0), [x1, z1] = at(d1, a1);
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  };
  return { W, D, at, rect };
}

// The wing thickness for a footprint, and which kinds fit it.
export function courtyardPlan(fx0, fz0, fx1, fz1, face) {
  const { W, D } = frame(fx0, fz0, fx1, fz1, face);
  const t = Math.max(WING_MIN, Math.min(WING_MAX, Math.floor(Math.min(W, D) * 0.38)));
  // a U takes the thickest wings that still leave its back wing BACK_MIN across
  const tU = Math.max(WING_MIN, Math.min(t, Math.floor((W - BACK_MIN) / 2)));
  const kinds = [];
  if (D >= t + COURT_MIN && W >= t + BACK_MIN) kinds.push('L');
  if (D >= tU + COURT_MIN && W >= 2 * tU + BACK_MIN) kinds.push('U');
  return { W, D, t, tU, kinds, thickness: { L: t, U: tU } };
}

/**
 * spec: { x0,z0,x1,z1 (the footprint inside the lot's margin), face, kind: 'L'|'U',
 *         mirror (L: the side wing on the right), building (a function spec -> rec),
 *         G (ground), flowers }
 * Returns { kind, wings: [rec...], court: { x0,z0,x1,z1 }, path: [[x,z]...] } or null.
 */
export function makeCourtyard(world, spec, rng) {
  const { x0, z0, x1, z1, face, kind, G } = spec;
  const F = frame(x0, z0, x1, z1, face);
  const plan = courtyardPlan(x0, z0, x1, z1, face);
  if (!plan.kinds.includes(kind)) return null;
  const { W, D } = plan;
  const t = plan.thickness[kind];
  const wings = [];
  const parts = [];
  if (kind === 'U') {
    parts.push({ role: 'side', r: F.rect(0, D - 1, 0, t - 1) });
    parts.push({ role: 'side', r: F.rect(0, D - 1, W - t, W - 1) });
    parts.push({ role: 'back', r: F.rect(D - t, D - 1, t, W - t - 1) });
  } else if (!spec.mirror) {
    parts.push({ role: 'side', r: F.rect(0, D - 1, 0, t - 1) });
    parts.push({ role: 'back', r: F.rect(D - t, D - 1, t, W - 1) });
  } else {
    parts.push({ role: 'side', r: F.rect(0, D - 1, W - t, W - 1) });
    parts.push({ role: 'back', r: F.rect(D - t, D - 1, 0, W - t - 1) });
  }
  const courtRect = kind === 'U' ? F.rect(0, D - t - 1, t, W - t - 1)
    : !spec.mirror ? F.rect(0, D - t - 1, t, W - 1) : F.rect(0, D - t - 1, 0, W - t - 1);
  const court = courtRect;
  for (const p of parts) {
    const rec = spec.building({ ...p.r, facing: face, role: p.role });
    if (!rec) return null;                            // all wings or none
    rec.courtyard = { kind, role: p.role };
    wings.push(rec);
  }
  // one block, one height: a wing that came out lower (too narrow for its
  // floors) means this is not a courtyard lot after all
  if (new Set(wings.map((w) => w.roofY)).size !== 1 || new Set(wings.map((w) => w.floors)).size !== 1) return null;

  // ---- the court: a lawn, a path to the back wing's door, flowers, a lantern post
  for (let z = court.z0; z <= court.z1; z++)
    for (let x = court.x0; x <= court.x1; x++) {
      world.set(x, G, z, MAT.GRASS);
      for (let y = G + 1; y <= G + 3; y++) if (world.has(x, y, z) && !isWingCell(wings, x, z)) world.clear(x, y, z);
    }
  const back = wings.find((w) => w.courtyard.role === 'back');
  const path = [];
  if (back) {
    // from the door straight out toward the street, to the court's street edge and one beyond
    const [ox, oz] = back.door.out;
    let px = back.door.x + ox, pz = back.door.z + oz;
    for (let i = 0; i < 60; i++) {
      const inCourt = px >= court.x0 && px <= court.x1 && pz >= court.z0 && pz <= court.z1;
      if (!inCourt) break;
      world.set(px, G, pz, MAT.PATH);
      path.push([px, pz]);
      px += ox; pz += oz;
    }
  }
  const onPath = new Set(path.map((p) => p.join(',')));
  // flowers along the court's edges (not on the path, not in front of a door)
  const doorsOut = wings.map((w) => w.outside);
  const nearDoor = (x, z) => doorsOut.some(([dx, , dz]) => Math.abs(dx - x) + Math.abs(dz - z) <= 1);
  let flowers = 0;
  for (let z = court.z0; z <= court.z1; z++)
    for (let x = court.x0; x <= court.x1; x++) {
      const edge = x === court.x0 || x === court.x1 || z === court.z0 || z === court.z1;
      if (!edge || onPath.has(x + ',' + z) || nearDoor(x, z) || world.has(x, G + 1, z)) continue;
      if (spec.flowers !== false && rng.chance(0.45)) { world.set(x, G + 1, z, rng.pick(FLOWERS)); flowers++; }
    }
  // a lantern post in the court, off the path and clear of the doors
  let lamp = null;
  const cx = Math.floor((court.x0 + court.x1) / 2), cz = Math.floor((court.z0 + court.z1) / 2);
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [1, 1], [-1, -1], [1, -1], [-1, 1], [1, 2], [-1, -2], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = cx + dx, z = cz + dz;
    if (x <= court.x0 || x >= court.x1 || z <= court.z0 || z >= court.z1) continue;
    if (onPath.has(x + ',' + z) || nearDoor(x, z) || world.has(x, G + 1, z)) continue;
    world.set(x, G + 1, z, MAT.FENCE);
    world.set(x, G + 2, z, MAT.FENCE);
    world.set(x, G + 3, z, MAT.LAMP);
    lamp = [x, G + 3, z];
    break;
  }
  return { kind, wings, court, path, flowers, lamp, t };
}

function isWingCell(wings, x, z) {
  return wings.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1);
}
