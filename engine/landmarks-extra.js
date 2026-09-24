// engine/landmarks-extra.js — five more landmarks.
//
// They follow the same shape as the rest: given a lot, which way it faces,
// and the city's style palette, they build and hand back a record. The main
// landmarks file registers them.
//
//   townsquare  a paved square: fountain, benches, market stalls, lamps
//   stadium     a pitch in a bowl of terraced seating, with floodlights
//   cemetery    walled ground, headstones in rows, a path and a lych gate
//   allotments  fenced plots with crops, water channels, sheds and compost
//   bandstand   a small raised stage with a roof, for a park or a small lot

import { MAT, FLOWERS, stairId, WEIRDO, DIR, cropId, CROP_KINDS, signId, SIGN_FACING, WOOLS } from './materials.js';
import { styleOf } from './styles.js';
import { OUTWARD } from './building.js';

const right = (face) => { const [fx, fz] = OUTWARD[face]; return [fz, -fx]; };

function pave(world, lot, G, pick) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) {
      world.set(x, G, z, pick(x, z));
      for (let y = G + 1; y <= G + 6; y++) world.clear(x, y, z);
    }
}

// ---- town square ---------------------------------------------------------
// A place to stand about in: a fountain in the middle, benches facing it,
// stalls down one side, lamps at the corners and flowers in the beds.
export function townSquare(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => ((x + z) & 1 ? LP.market[0] : LP.market[1]));
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const mx = Math.floor((I.x0 + I.x1) / 2), mz = Math.floor((I.z0 + I.z1) / 2);

  // the fountain: a raised basin of water with a spout in the middle
  const fountain = [mx, G, mz];
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = mx + dx, z = mz + dz, d = Math.abs(dx) + Math.abs(dz);
      if (d > 3) continue;
      if (d <= 1) {
        world.set(x, G, z, LP.wellRim);
        world.set(x, G + 1, z, MAT.WATER);
      } else {
        world.set(x, G + 1, z, LP.wellRim);
      }
    }
  // a spout of open water up here would run off the pillar, so it is a
  // lantern on a plinth instead
  world.set(mx, G + 2, mz, LP.wellRim);
  world.set(mx, G + 3, mz, MAT.LAMP);

  // benches facing the fountain, on all four sides
  const benches = [];
  for (const [dx, dz, dir] of [[0, -4, WEIRDO.south], [0, 4, WEIRDO.north], [-4, 0, WEIRDO.east], [4, 0, WEIRDO.west]]) {
    for (let k = -1; k <= 1; k++) {
      const x = mx + dx + (dz ? k : 0), z = mz + dz + (dx ? k : 0);
      if (x <= I.x0 || x >= I.x1 || z <= I.z0 || z >= I.z1) continue;
      if (world.has(x, G + 1, z)) continue;
      world.set(x, G + 1, z, stairId(LP.hallStair, dir));
      benches.push([x, G + 1, z]);
    }
  }

  // stalls along the edge away from the street, with cloth roofs
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const stalls = [];
  const backX = Math.round((I.x0 + I.x1) / 2 - Fx * (Math.min(I.x1 - I.x0, I.z1 - I.z0) / 2 - 1));
  const backZ = Math.round((I.z0 + I.z1) / 2 - Fz * (Math.min(I.x1 - I.x0, I.z1 - I.z0) / 2 - 1));
  for (let k = -3; k <= 3; k += 3) {
    const sx = backX + Rx * k, sz = backZ + Rz * k;
    if (sx <= I.x0 || sx >= I.x1 || sz <= I.z0 || sz >= I.z1) continue;
    const cloth = WOOLS[rng.int(0, WOOLS.length - 1)];
    for (const [ox, oz] of [[0, 0], [Rx, Rz]]) {
      const x = sx + ox, z = sz + oz;
      world.set(x, G + 1, z, MAT.FENCE);
      world.set(x, G + 2, z, MAT.FENCE);
      world.set(x, G + 3, z, cloth);
      world.set(x - Fx, G + 3, z - Fz, cloth);
    }
    world.set(sx - Fx, G + 1, sz - Fz, MAT.DESK);         // the counter
    stalls.push([sx, G + 1, sz]);
  }

  // lamps at the corners, flowers in the beds between them
  const lamps = [];
  for (const [cx, cz] of [[I.x0, I.z0], [I.x1, I.z0], [I.x0, I.z1], [I.x1, I.z1]]) {
    world.set(cx, G + 1, cz, MAT.FENCE);
    world.set(cx, G + 2, cz, MAT.FENCE);
    world.set(cx, G + 3, cz, MAT.LAMP);
    lamps.push([cx, G + 3, cz]);
  }
  for (let z = I.z0; z <= I.z1; z++)
    for (let x = I.x0; x <= I.x1; x++) {
      if (world.has(x, G + 1, z)) continue;
      if (Math.abs(x - mx) + Math.abs(z - mz) < 5) continue;
      if (rng.chance(0.06)) { world.set(x, G, z, MAT.GRASS); world.set(x, G + 1, z, rng.pick(FLOWERS)); }
    }
  return { kind: 'townsquare', lot, fountain, benches, stalls, lamps, rec: null, topY: G + 4 };
}

// ---- stadium -------------------------------------------------------------
// A pitch in a bowl: three rows of terraced seating round a grass field, with
// floodlights at the corners and a gap for the players to come out.
export function stadium(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.hallFloor);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const rows = 3;
  // the terracing: each ring one block higher than the last
  for (let r = 0; r < rows; r++) {
    const R = { x0: I.x0 + r, z0: I.z0 + r, x1: I.x1 - r, z1: I.z1 - r };
    for (let z = R.z0; z <= R.z1; z++)
      for (let x = R.x0; x <= R.x1; x++) {
        if (x !== R.x0 && x !== R.x1 && z !== R.z0 && z !== R.z1) continue;
        for (let y = G + 1; y <= G + (rows - r); y++) world.set(x, y, z, LP.hallWall);
        // seats: a step of stairs facing in
        const dir = x === R.x0 ? WEIRDO.east : x === R.x1 ? WEIRDO.west : z === R.z0 ? WEIRDO.south : WEIRDO.north;
        world.set(x, G + (rows - r) + 1, z, stairId(LP.hallStair, dir));
      }
  }
  // the pitch
  const P = { x0: I.x0 + rows, z0: I.z0 + rows, x1: I.x1 - rows, z1: I.z1 - rows };
  for (let z = P.z0; z <= P.z1; z++)
    for (let x = P.x0; x <= P.x1; x++) {
      world.set(x, G, z, MAT.GRASS);
      for (let y = G + 1; y <= G + 6; y++) world.clear(x, y, z);
    }
  // the halfway line and the goals
  const mz = Math.floor((P.z0 + P.z1) / 2);
  for (let x = P.x0; x <= P.x1; x++) world.set(x, G, mz, MAT.C_WHITE);
  const goals = [];
  for (const z of [P.z0, P.z1]) {
    const gx = Math.floor((P.x0 + P.x1) / 2);
    for (let dx = -1; dx <= 1; dx++) {
      world.set(gx + dx, G + 1, z, MAT.FENCE);
      world.set(gx + dx, G + 2, z, MAT.FENCE);
    }
    goals.push([gx, G + 2, z]);
  }
  // floodlights at the corners
  const lights = [];
  for (const [cx, cz] of [[I.x0, I.z0], [I.x1, I.z0], [I.x0, I.z1], [I.x1, I.z1]]) {
    for (let y = G + 1; y <= G + 7; y++) world.set(cx, y, cz, LP.hallColumn);
    world.set(cx, G + 8, cz, MAT.GLOWSTONE);
    lights.push([cx, G + 8, cz]);
  }
  // the way in, through the terracing on the street side
  const [Fx, Fz] = OUTWARD[face];
  const ex = Math.floor((I.x0 + I.x1) / 2) + Fx * Math.floor((I.x1 - I.x0) / 2);
  const ez = Math.floor((I.z0 + I.z1) / 2) + Fz * Math.floor((I.z1 - I.z0) / 2);
  const tunnel = [];
  for (let k = 0; k <= rows; k++) {
    const x = ex - Fx * k, z = ez - Fz * k;
    for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z);
    world.set(x, G, z, LP.hallFloor);
    tunnel.push([x, G + 1, z]);
  }
  return { kind: 'stadium', lot, pitch: P, goals, lights, tunnel, rec: null, topY: G + 9 };
}

// ---- cemetery ------------------------------------------------------------
// Walled ground with rows of headstones, a path up the middle and a gate.
export function cemetery(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => MAT.GRASS);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  // the wall, with a gap for the gate on the street side
  const [Fx, Fz] = OUTWARD[face];
  const gateX = Math.floor((I.x0 + I.x1) / 2) + Fx * Math.floor((I.x1 - I.x0) / 2);
  const gateZ = Math.floor((I.z0 + I.z1) / 2) + Fz * Math.floor((I.z1 - I.z0) / 2);
  for (let z = I.z0; z <= I.z1; z++)
    for (let x = I.x0; x <= I.x1; x++) {
      if (x !== I.x0 && x !== I.x1 && z !== I.z0 && z !== I.z1) continue;
      if (Math.abs(x - gateX) + Math.abs(z - gateZ) <= 1) continue;      // the gateway
      world.set(x, G + 1, z, LP.hallWall);
      world.set(x, G + 2, z, LP.hallColumn);
    }
  // the lych gate: two posts and a roof over the gap
  const gate = [gateX, G + 1, gateZ];
  const [Rx, Rz] = right(face);
  for (const s of [-2, 2]) {
    const x = gateX + Rx * s, z = gateZ + Rz * s;
    for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, LP.hallColumn);
  }
  for (let s = -2; s <= 2; s++) world.set(gateX + Rx * s, G + 4, gateZ + Rz * s, LP.hallWall);

  // a path from the gate, and headstones in rows either side
  const path = [];
  const steps = Math.max(Math.abs(I.x1 - I.x0), Math.abs(I.z1 - I.z0)) - 2;
  for (let k = 0; k <= steps; k++) {
    const x = gateX - Fx * k, z = gateZ - Fz * k;
    if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) break;
    world.set(x, G, z, MAT.PATH);
    path.push([x, G, z]);
  }
  const graves = [];
  for (let z = I.z0 + 2; z <= I.z1 - 1; z += 2)
    for (let x = I.x0 + 2; x <= I.x1 - 1; x += 2) {
      if (world.has(x, G + 1, z) || world.get(x, G, z) === MAT.PATH) continue;
      const onPath = path.some(([px, , pz]) => Math.abs(px - x) + Math.abs(pz - z) <= 1);
      if (onPath) continue;
      world.set(x, G + 1, z, rng.chance(0.25) ? LP.hallColumn : LP.hallWall);   // a stone, or a taller marker
      if (rng.chance(0.25)) world.set(x, G + 2, z, LP.hallWall);
      if (rng.chance(0.3)) world.set(x + 1 <= I.x1 ? x + 1 : x - 1, G + 1, z, rng.pick(FLOWERS));
      graves.push([x, G + 1, z]);
    }
  return { kind: 'cemetery', lot, gate, graves, path, rec: null, topY: G + 5 };
}

// ---- allotments ----------------------------------------------------------
// Fenced plots of vegetables with water channels between them, a shed or two
// and a compost heap.
export function allotments(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => MAT.GRASS);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const plots = [];
  const PLOT = 5;
  for (let z = I.z0; z + PLOT - 1 <= I.z1; z += PLOT + 1)
    for (let x = I.x0; x + PLOT - 1 <= I.x1; x += PLOT + 1) {
      const P = { x0: x, z0: z, x1: x + PLOT - 1, z1: z + PLOT - 1 };
      const crop = CROP_KINDS[rng.int(0, CROP_KINDS.length - 1)];
      // a channel of water down the middle keeps the soil watered
      const wz = P.z0 + Math.floor(PLOT / 2);
      for (let px = P.x0; px <= P.x1; px++)
        for (let pz = P.z0; pz <= P.z1; pz++) {
          if (pz === wz) { world.set(px, G, pz, MAT.WATER); continue; }
          world.set(px, G, pz, MAT.FARMLAND);
          world.set(px, G + 1, pz, cropId(crop, rng.int(4, 7)));
        }
      // a low fence round the plot, open at one corner
      for (let px = P.x0 - 1; px <= P.x1 + 1; px++)
        for (let pz = P.z0 - 1; pz <= P.z1 + 1; pz++) {
          if (px !== P.x0 - 1 && px !== P.x1 + 1 && pz !== P.z0 - 1 && pz !== P.z1 + 1) continue;
          if (px < I.x0 || px > I.x1 || pz < I.z0 || pz > I.z1) continue;
          if (px === P.x0 && pz === P.z0 - 1) continue;                 // the way in
          if (!world.has(px, G + 1, pz)) world.set(px, G + 1, pz, MAT.FENCE);
        }
      plots.push(P);
    }
  // a shed and a compost heap on the spare ground
  const sheds = [];
  const sx = I.x1 - 2, sz = I.z1 - 2;
  if (sx > I.x0 && sz > I.z0) {
    for (let dz = 0; dz <= 1; dz++)
      for (let dx = 0; dx <= 1; dx++) {
        for (let y = G + 1; y <= G + 2; y++) world.set(sx + dx, y, sz + dz, LP.hallWall);
        world.set(sx + dx, G + 3, sz + dz, stairId(LP.hallStair, dx ? WEIRDO.west : WEIRDO.east));
      }
    world.clear(sx, G + 1, sz);                                          // a doorway
    sheds.push([sx, G + 1, sz]);
  }
  const heap = [I.x0 + 1, G + 1, I.z1 - 1];
  if (!world.has(heap[0], heap[1], heap[2])) world.set(heap[0], heap[1], heap[2], MAT.COMPOSTER);
  return { kind: 'allotments', lot, plots, sheds, heap, rec: null, topY: G + 4 };
}

// ---- bandstand -----------------------------------------------------------
// A small raised stage with a roof on posts, in the middle of its lot.
export function bandstand(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => ((x + z) & 1 ? MAT.GRASS : MAT.PATH));
  const mx = Math.floor((lot.x0 + lot.x1) / 2), mz = Math.floor((lot.z0 + lot.z1) / 2);
  const R = 3;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > R + 1) continue;
      world.set(mx + dx, G + 1, mz + dz, LP.hallFloor);
    }
  const posts = [];
  for (const [dx, dz] of [[-R, 0], [R, 0], [0, -R], [0, R], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    for (let y = G + 2; y <= G + 4; y++) world.set(mx + dx, y, mz + dz, LP.hallColumn);
    posts.push([mx + dx, G + 4, mz + dz]);
  }
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > R + 1) continue;
      world.set(mx + dx, G + 5, mz + dz, LP.hallWall);
    }
  world.set(mx, G + 6, mz, LP.hallColumn);
  world.set(mx, G + 7, mz, MAT.LAMP);
  // steps up on the street side
  const [Fx, Fz] = OUTWARD[face];
  const step = [mx + Fx * (R + 1), G + 1, mz + Fz * (R + 1)];
  world.set(step[0], step[1], step[2], stairId(LP.hallStair, Fx === 1 ? WEIRDO.west : Fx === -1 ? WEIRDO.east : Fz === 1 ? WEIRDO.north : WEIRDO.south));
  return { kind: 'bandstand', lot, posts, step, rec: null, topY: G + 8 };
}
