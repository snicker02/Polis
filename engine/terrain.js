// engine/terrain.js — gentle hills.
//
// Each city block (the land between streets: sidewalk ring, lots, alleys)
// sits on a terrace 0..hills blocks above the streets, following a smooth
// hill pattern, so neighbouring blocks rise and fall gently. Streets stay
// level, which keeps the railway, its bridges and the perimeter loop exactly
// as they are.
//
// The city is generated flat and then each block is lifted whole — buildings,
// their stairs, furniture, trees, lamps — so everything already verified on
// flat ground stays verified. The terrace is solid underneath, faced with
// stone bricks where it meets the street.
//
// Staircases are cut into every side of a raised block, climbing straight in
// from the street and facing it (0.3.1; before that they ran along the kerb,
// side-on to anyone arriving). One step per block of height, cut into the
// sidewalk, so they never stick out into the street or the railway. Where a
// straight flight will not fit, the steps run along the kerb instead. verifyCity then walks from the streets and checks that every
// door, gate and landmark can be reached.

import { MAT, MATERIALS, stairId, WEIRDO } from './materials.js';
import { fbm2, clamp } from './rng.js';
import { USE } from './plan.js';

// ---- the hill pattern ------------------------------------------------------
export function planHills(plan, cfg) {
  const { W, D } = plan;
  const elev = new Int8Array(W * D);
  const H = Math.max(0, Math.min(3, cfg.hills | 0));
  const blocks = [];
  if (!H) return { elev, blocks, H };
  for (const b of plan.cityBlocks) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const t = clamp((fbm2(cx, cz, cfg.seed ^ 0x4111c5, Math.max(40, W * 0.45)) - 0.32) / 0.42, 0, 1);
    const e = Math.round(t * H);
    blocks.push({ ...b, e });
    if (!e) continue;
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) elev[z * W + x] = e;
  }
  return { elev, blocks, H };
}

// ---- lifting ---------------------------------------------------------------
// Move every block above the stone base up by the column's elevation, fill
// the gap with stone (stone bricks on the block's outer ring), and carry
// block-entity data (bed colours) along.
export function liftBlocks(world, plan, hills, G) {
  const { W } = plan, { elev, blocks } = hills;
  const moves = [];
  world.forEach((x, y, z, id) => {
    if (y < 1 || x < 0 || z < 0 || x >= plan.W || z >= plan.D) return;
    const e = elev[z * W + x];
    if (e) moves.push([x, y, z, id, world.getData(x, y, z), e]);
  });
  for (const [x, y, z] of moves) world.clear(x, y, z);
  for (const [x, y, z, id, data, e] of moves) {
    world.set(x, y + e, z, id);
    if (data) world.setData(x, y + e, z, data);
  }
  for (const b of blocks) {
    if (!b.e) continue;
    for (let z = b.z0; z <= b.z1; z++)
      for (let x = b.x0; x <= b.x1; x++) {
        const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
        for (let y = 1; y <= b.e; y++) world.set(x, y, z, edge ? MAT.RETAIN : MAT.BASE);
      }
  }
}

// ---- staircases ------------------------------------------------------------
// Along each side of a raised block, runs of e stair blocks climb parallel
// to the kerb from street level to the terrace. A run needs: sidewalk cells,
// a clear walkable street cell outside its bottom step, open space above,
// and to stay clear of doorways. Tries every ~10 blocks; if a side gets none
// on the first pass, any position that fits will do.
export function cutStairs(world, plan, hills, G, avoid) {
  const { W, D, use } = plan;
  const blocked = (x, y, z) => { const id = world.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const nearAvoid = (x, z) => avoid.some(([ax, az]) => Math.abs(ax - x) <= 2 && Math.abs(az - z) <= 2);
  const UP = (dx, dz) => (dx === 1 ? WEIRDO.east : dx === -1 ? WEIRDO.west : dz === 1 ? WEIRDO.south : WEIRDO.north);
  const runs = [];
  for (const b of hills.blocks) {
    const e = b.e;
    if (!e) continue;
    const inBlock = (x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
    const claimed = new Set();                    // steps and landings already used on this block
    // each side: the cells along it, the direction along it, the way out to the street
    const sides = [
      { cells: (i) => [b.x0 + i, b.z0], len: b.x1 - b.x0 + 1, along: [1, 0], out: [0, -1] },
      { cells: (i) => [b.x0 + i, b.z1], len: b.x1 - b.x0 + 1, along: [1, 0], out: [0, 1] },
      { cells: (i) => [b.x0, b.z0 + i], len: b.z1 - b.z0 + 1, along: [0, 1], out: [-1, 0] },
      { cells: (i) => [b.x1, b.z0 + i], len: b.z1 - b.z0 + 1, along: [0, 1], out: [1, 0] },
    ];
    // the street cell a staircase starts from: solid ground, room to stand
    const streetOk = (x, z) => x >= 0 && z >= 0 && x < W && z < D && use[z * W + x] === 1 /* ROAD */ &&
      blocked(x, G, z) && !blocked(x, G + 1, z) && !blocked(x, G + 2, z) && !blocked(x, G + 3, z);
    // a cell a step (or the landing) can take: in the block, not road, clear above the terrace, away from doors
    const cellOk = (x, z) => inBlock(x, z) && use[z * W + x] !== 1 && !nearAvoid(x, z) && !claimed.has(x + ',' + z) &&
      [1, 2, 3].every((h) => !world.has(x, G + e + h, z));
    // steps: [[x, z], ...] from the street up; dir: the way they climb
    const cut = (steps, dir, kind, out) => {
      // reserve the steps, the landing above them, and a block either side of the
      // flight, so no other staircase is cut across this one
      const last = steps[steps.length - 1];
      const landing = [last[0] + dir[0], last[1] + dir[1]];
      for (const [x, z] of steps.concat([landing]))
        for (const [ax, az] of [[0, 0], [dir[1], dir[0]], [-dir[1], -dir[0]]]) claimed.add((x + ax) + ',' + (z + az));
      steps.forEach(([x, z], i) => {
        for (let y = G + 1 + i; y <= G + e + 3; y++) world.clear(x, y, z);
        for (let y = 1; y <= G + i; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.BASE);
        world.set(x, G + 1 + i, z, stairId('stonebrick', UP(dir[0], dir[1])));
      });
      runs.push({ block: b, cells: steps, dir, e, kind, out });
    };
    for (const sd of sides) {
      const inward = [-sd.out[0], -sd.out[1]];
      // 1) straight in from the street, facing it: one step per block of height,
      //    cut into the sidewalk (and the yard behind it for a 3-high terrace)
      const straight = (i0) => {
        if (i0 < 2 || i0 > sd.len - 3) return false;
        const [x0, z0] = sd.cells(i0);
        if (!streetOk(x0 + sd.out[0], z0 + sd.out[1])) return false;
        const steps = [], landing = [x0 + inward[0] * e, z0 + inward[1] * e];
        for (let i = 0; i < e; i++) steps.push([x0 + inward[0] * i, z0 + inward[1] * i]);
        if (!steps.every(([x, z]) => cellOk(x, z)) || !cellOk(...landing)) return false;
        // the landing must be terrace you can stand on
        if (!blocked(landing[0], G + e, landing[1])) return false;
        cut(steps, inward, 'straight', sd.out);
        return true;
      };
      // 2) along the kerb, where a straight flight will not fit
      const along = (i0) => {
        if (i0 < 2 || i0 + e + 1 > sd.len - 3) return false;
        for (let i = -1; i <= e; i++) {
          const [x, z] = sd.cells(i0 + i);
          if (use[z * W + x] !== USE.SIDEWALK || !cellOk(x, z)) return false;
        }
        const [x0, z0] = sd.cells(i0);
        if (!streetOk(x0 + sd.out[0], z0 + sd.out[1])) return false;
        cut(Array.from({ length: e }, (_, i) => sd.cells(i0 + i)), sd.along, 'along', sd.out);
        return true;
      };
      let placed = 0;
      for (let i0 = 3; i0 < sd.len; i0 += 10) if (straight(i0) || along(i0)) placed++;
      if (!placed) for (let i0 = 2; i0 < sd.len; i0++) if (straight(i0) || along(i0)) break;
    }
  }
  return runs;
}

// ---- records ---------------------------------------------------------------
export function shiftBuilding(rec, e) {
  if (!e) return;
  rec.groundY += e;
  rec.floorYs = rec.floorYs.map((y) => y + e);
  rec.roofY += e;
  rec.topY += e;
  rec.door.y += e;
  rec.outside[1] += e;
  if (rec.hutDoor) rec.hutDoor[1] += e;
  for (const b of rec.beds || []) { b.foot[1] += e; b.head[1] += e; }
}

// ---- city-wide reachability -------------------------------------------------
// Walk from the streets over standing positions: step up one block (with
// head room), step down up to three, doors and gates are passable. Returns
// the set of standing positions reached, keyed "x,y,z".
// noHop: stepping up is only allowed onto a stair block (walking up stairs in
// the game needs no jump; stepping up onto a full block does).
export function walkCity(world, plan, G, maxUp = 6, noHop = false) {
  const { W, D, use, mask } = plan;
  const passable = (x, y, z) => { const id = world.get(x, y, z); return id === -1 || MATERIALS.isPassable(id); };
  const TALL = new Set(['minecraft:oak_fence', 'minecraft:fence_gate', 'minecraft:iron_bars', 'minecraft:lantern']);
  const floorOk = (x, y, z) => {
    const id = world.get(x, y - 1, z);
    if (id === -1 || MATERIALS.isPassable(id)) return false;
    const d = MATERIALS.def(id);
    return !d.flowable && !TALL.has(d.block) && d.block !== 'minecraft:water';
  };
  const stand = (x, y, z) => floorOk(x, y, z) && passable(x, y, z) && passable(x, y + 1, z);
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x] === 1);
  const key = (x, y, z) => `${x},${y},${z}`;
  const seen = new Set(), q = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      if (use[z * W + x] === USE.ROAD && inCity(x, z) && stand(x, G + 1, z)) { const k = key(x, G + 1, z); seen.add(k); q.push([x, G + 1, z]); }
  const top = G + maxUp;
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = q[h];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inCity(nx, nz)) continue;
      for (const ny of [y + 1, y, y - 1, y - 2, y - 3]) {
        if (ny < G + 1 || ny > top) continue;
        if (ny === y + 1 && !passable(x, y + 2, z)) continue;          // head room to step up
        if (noHop && ny === y + 1 && !/_stairs$/.test((MATERIALS.def(world.get(nx, y, nz)) || {}).block || '')) continue;
        if (ny < y) { let clear = true; for (let yy = ny + 2; yy <= y + 1; yy++) if (!passable(nx, yy, nz)) clear = false; if (!clear) continue; }
        if (!stand(nx, ny, nz)) continue;
        const k = key(nx, ny, nz);
        if (seen.has(k)) break;
        seen.add(k); q.push([nx, ny, nz]);
        break;
      }
    }
  }
  return seen;
}
