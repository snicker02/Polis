// engine/twist.js — a twisting tower: square floor plates, each turned a
// little further than the one below, so the whole tower corkscrews.
//
// GEOMETRY
// --------
// The lot's square footprint has half-extent H (cell centres, from the
// middle). Floor k is a square of half-size h turned by θk = k·Δ about the
// middle, and a cell belongs to it when its centre (dx, dz) satisfies
//     |dx cosθ + dz sinθ| <= h   and   |-dx sinθ + dz cosθ| <= h.
// A square of half-size h turned by θ spans h(|cosθ| + |sinθ|) either way,
// which is largest (h√2) at 45°. The total turn Θ is 60..90°, so some floor
// passes 45° and h = H/√2 keeps every plate inside the lot.
//
// Walls are the plate cells with a four-way neighbour outside the plate: on a
// turned square that is a closed ring (neighbours meet at least corner to
// corner, and a player cannot squeeze between two blocks that touch only at
// a corner). The four corners of each plate are solid piers, so the corners
// trace four helices up the tower; the rest of each wall is glass between a
// sill and a band at the ceiling.
//
// STAIRS
// ------
// Every plate contains the circle of radius h, so a 3x3 spiral core in the
// middle with a clear ring round it lies inside every floor whatever its
// turn. The steps follow building.js exactly: step t sits in RING[t % 8] at
// base + t, rising one block each, and a slab at height Y leaves open the
// cells of the steps at Y-1, Y-2 and Y-3 (feet, head and one more), so the
// same player-movement check proves every floor is reached.
//
// The record it returns has the fields verify.js and furnish() read. Its
// rects are the axis-aligned square inside the inscribed circle, which lies
// inside every plate, so "inside the building" is always true there.

import { MAT, doorId, stairId, DIR, WEIRDO, STAIR_SOLID } from './materials.js';
import { OUTWARD } from './building.js';

const RING = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
const RING_DIR = [WEIRDO.east, WEIRDO.east, WEIRDO.south, WEIRDO.south,
                  WEIRDO.west, WEIRDO.west, WEIRDO.north, WEIRDO.north];

export const TWIST_MIN_SIDE = 13;       // a smaller square has no room round the core once turned
export const TWIST_MIN_FLOORS = 6;      // fewer floors barely show the turn

// Can this lot footprint take a twisting tower?
export function twistFits(x0, z0, x1, z1, floors) {
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  return Math.min(w, d) >= TWIST_MIN_SIDE && Math.max(w, d) <= Math.min(w, d) * 1.6 && floors >= TWIST_MIN_FLOORS;
}

// The cells of one plate, as a Set of "x,z", plus its corner points.
export function plateCells(cx, cz, h, theta, x0, z0, x1, z1) {
  const c = Math.cos(theta), s = Math.sin(theta), eps = 1e-6;
  const cells = new Set();
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dz = z - cz;
      const u = dx * c + dz * s, v = -dx * s + dz * c;
      if (Math.abs(u) <= h + eps && Math.abs(v) <= h + eps) cells.add(x + ',' + z);
    }
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) =>
    [cx + (a * h) * c - (b * h) * s, cz + (a * h) * s + (b * h) * c]);
  return { cells, corners };
}

/**
 * spec: {x0,z0,x1,z1, floors, pitch, groundY, facing, theme, useStairs, lights, twist?, turns?}
 *   twist: total turn in radians (default: 60..90°, either hand, from rng)
 * Returns a building record, or null when the footprint cannot take one.
 */
export function makeTwistedTower(world, spec, rng) {
  const { x0, z0, x1, z1, groundY: gy, theme } = spec;
  const P = spec.pitch;
  const floors = spec.floors | 0;
  if (!twistFits(x0, z0, x1, z1, floors) || P < 4) return null;
  const face = spec.facing || 'south';

  // the square part of the lot, centred on its long side
  const w = x1 - x0 + 1, d = z1 - z0 + 1, S = Math.min(w, d);
  const sx0 = x0 + Math.floor((w - S) / 2), sz0 = z0 + Math.floor((d - S) / 2);
  const sx1 = sx0 + S - 1, sz1 = sz0 + S - 1;
  const cx = (sx0 + sx1) / 2, cz = (sz0 + sz1) / 2;
  const H = (S - 1) / 2;
  const h = H / Math.SQRT2;

  const hand = rng.chance(0.5) ? 1 : -1;
  const total = spec.twist !== undefined ? spec.twist : hand * (Math.PI / 3 + rng() * Math.PI / 6);
  const step = floors > 1 ? total / (floors - 1) : 0;
  const plates = [];
  for (let k = 0; k < floors; k++) plates.push(plateCells(cx, cz, h, k * step, sx0, sz0, sx1, sz1));

  const roofY = gy + floors * P;
  const topFloorY = gy + (floors - 1) * P;

  // ---- the core: 3x3 spiral in the middle ------------------------------------
  const mx = Math.round(cx), mz = Math.round(cz);
  const core = { x0: mx - 1, z0: mz - 1, x1: mx + 1, z1: mz + 1 };
  const inCore = (x, z) => x >= core.x0 && x <= core.x1 && z >= core.z0 && z <= core.z1;
  const steps = [];
  for (let y = gy + 1; y <= topFloorY; y++) {
    const t = y - (gy + 1);
    const c = RING[t % 8];
    steps.push({ x: core.x0 + c[0], y, z: core.z0 + c[1], dir: RING_DIR[t % 8] });
  }
  const stepsAt = new Map();
  for (const st of steps) {
    if (!stepsAt.has(st.y)) stepsAt.set(st.y, new Set());
    stepsAt.get(st.y).add(st.x + ',' + st.z);
  }
  const slab = (cells, y, mat) => {
    const open = [stepsAt.get(y - 1), stepsAt.get(y - 2), stepsAt.get(y - 3)].filter(Boolean);
    for (const key of cells) {
      const [x, z] = key.split(',').map(Number);
      if (open.length && inCore(x, z) && open.some((o) => o.has(key))) continue;
      world.set(x, y, z, mat);
    }
  };

  // ---- the door, on the street face of the ground plate (turned 0°) ----------
  const p0 = plates[0].cells;
  const out = OUTWARD[face];
  let door = null;
  {
    // the plate cell furthest out along the street direction, nearest the middle
    let best = -Infinity;
    for (const key of p0) {
      const [x, z] = key.split(',').map(Number);
      const reach = x * out[0] + z * out[1] - 0.01 * (Math.abs(x - mx) + Math.abs(z - mz));
      if (reach > best) { best = reach; door = [x, z]; }
    }
  }
  const [dx, dz] = door;

  // ---- floors ------------------------------------------------------------------
  const isWall = (cells, x, z) => cells.has(x + ',' + z) &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !cells.has((x + a) + ',' + (z + b)));
  const floorYs = [];
  let windows = 0;
  const pierR = 1.05;                                          // how close to a corner is still the pier
  for (let k = 0; k < floors; k++) {
    const sy = gy + k * P;
    floorYs.push(sy);
    const { cells, corners } = plates[k];
    // the slab carries this floor and caps the one below where they differ
    const under = k > 0 ? new Set([...cells, ...plates[k - 1].cells]) : cells;
    slab(under, sy, theme.floor);
    const lo = sy + 2, hi = Math.max(sy + 2, Math.min(sy + 3, sy + P - 2));
    for (const key of cells) {
      const [x, z] = key.split(',').map(Number);
      if (!isWall(cells, x, z)) continue;
      const pier = corners.some(([ax, az]) => Math.hypot(x - ax, z - az) <= pierR + 0.5);
      for (let y = sy + 1; y <= sy + P - 1; y++) {
        if (k === 0 && x === dx && z === dz && y <= sy + 3) continue;           // the doorway
        let m = theme.wall;
        if (pier || y === sy + P - 1) m = theme.trim;
        else if (y >= lo && y <= hi) { m = theme.glass; windows++; }
        world.set(x, y, z, m);
      }
    }
    if (spec.lights) {
      for (const key of cells) {
        const [x, z] = key.split(',').map(Number);
        if ((x - mx) % 5 !== 0 || (z - mz) % 5 !== 0 || (x === mx && z === mz)) continue;
        if (inCore(x, z) || Math.abs(x - mx) <= 2 && Math.abs(z - mz) <= 2) continue;
        if (isWall(cells, x, z)) continue;
        world.set(x, sy + P - 1, z, MAT.LANTERN);
      }
    }
  }

  // ---- roof: slab, a parapet, and a crown over the core ------------------------
  const top = plates[floors - 1];
  slab(top.cells, roofY, theme.floor);
  for (const key of top.cells) {
    const [x, z] = key.split(',').map(Number);
    if (isWall(top.cells, x, z)) world.set(x, roofY + 1, z, theme.trim);
  }
  // the crown: a stepped trim pyramid over the core, capped with a mast
  for (let lvl = 0; lvl < 3; lvl++) {
    const r = 2 - lvl;
    for (let z = mz - r; z <= mz + r; z++) for (let x = mx - r; x <= mx + r; x++) world.set(x, roofY + 1 + lvl, z, theme.trim);
  }
  const mastTop = roofY + 4 + Math.min(8, Math.floor(floors / 2));
  for (let y = roofY + 4; y < mastTop; y++) world.set(mx, y, mz, MAT.BARS);
  world.set(mx, mastTop, mz, MAT.GLOWSTONE);

  // ---- stairs (after the slabs, so a step replaces the slab cell it sits in) ---
  const solidStep = STAIR_SOLID[theme.stair] !== undefined ? STAIR_SOLID[theme.stair] : theme.trim;
  for (const st of steps) world.set(st.x, st.y, st.z, spec.useStairs ? stairId(theme.stair, st.dir) : solidStep);

  // ---- door ----------------------------------------------------------------
  world.set(dx, gy + 1, dz, doorId(theme.door, DIR[face], false, 0));
  world.set(dx, gy + 2, dz, doorId(theme.door, DIR[face], true, 0));
  world.set(dx, gy + 3, dz, P >= 5 ? MAT.GLOWSTONE : theme.trim);

  // ---- furnishing ring: the cells just inside each floor's walls --------------
  // In order round the tower, each with the way into the room (its furniture
  // faces that way) and a side number that changes wherever the wall turns or
  // the run breaks, so furniture.js pairs a bed's two halves only side by side
  // along one straight stretch of wall.
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const furnishRing = (k) => {
    const cells = plates[k].cells;
    const wallAt = (x, z) => isWall(cells, x, z);
    const ring = [];
    for (const key of cells) {
      const [x, z] = key.split(',').map(Number);
      if (wallAt(x, z)) continue;
      const w = DIRS4.find(([a, b]) => wallAt(x + a, z + b));
      if (!w) continue;
      ring.push({ x, z, nx: -w[0], nz: -w[1], ang: Math.atan2(z - cz, x - cx) });
    }
    ring.sort((a, b) => a.ang - b.ang);
    let side = 0;
    return ring.map((c, i) => {
      const p = ring[i - 1];
      if (p && (p.nx !== c.nx || p.nz !== c.nz || Math.abs(p.x - c.x) + Math.abs(p.z - c.z) !== 1)) side++;
      return [c.x, c.z, c.nx, c.nz, side];
    });
  };

  // the rects: the axis-aligned square inside the inscribed circle, in every plate
  // (h/√2 is exactly 3 on the smallest lot; the epsilon keeps rounding from
  // making it 2, whose interior would be nothing but the stair shaft)
  const ri = Math.max(3, Math.floor(h / Math.SQRT2 + 1e-9));
  const inner = { x0: mx - ri, z0: mz - ri, x1: mx + ri, z1: mz + ri };
  return {
    x0: sx0, z0: sz0, x1: sx1, z1: sz1, w: S, d: S, floors, pitch: P, groundY: gy, style: 'tower',
    themeName: theme.name, theme, facing: face,
    rects: Array.from({ length: floors }, () => ({ ...inner })),
    floorYs, roofY, topY: mastTop,
    core: { ...core }, stairKind: 'spiral',
    hut: false, hutDoor: null, windows,
    door: { x: dx, y: gy + 1, z: dz, out },
    doorCells: [[dx, dz]],
    outside: [dx + out[0], gy + 1, dz + out[1]],
    twist: { total, step, h, centre: [cx, cz], hand: Math.sign(total) },
    plates: plates.map((p) => p.cells),
    furnishRing: (k) => furnishRing(k).map((c) => c),
    rooms: (k) => (k === 0 ? 'hall' : k % 2 ? 'office' : 'bedroom'),   // open plans: no partition walls on a turning floor
  };
}
