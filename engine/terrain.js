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
  // On real ground the terraces follow the land: each block sits at the
  // median height of the ground under it, measured from the city's base
  // level, so the city steps up and down with the terrain.
  if (cfg.terrain) return terrainElevation(plan, cfg, elev);
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
  if (hills.rolling) {
    // the whole city rolls: every raised column is filled underneath, and the
    // side of any step shows the retaining material
    for (let z = 0; z < plan.D; z++)
      for (let x = 0; x < plan.W; x++) {
        const e = elev[z * plan.W + x];
        if (!e) continue;
        if (plan.mask && !plan.mask[z * plan.W + x]) continue;
        let step = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= plan.W || nz >= plan.D) { step = true; continue; }
          if (elev[nz * plan.W + nx] < e) step = true;
        }
        for (let y = 1; y <= e; y++) world.set(x, y, z, step ? MAT.RETAIN : MAT.BASE);
      }
    return;
  }
  for (const b of blocks) {
    if (!b.e) continue;
    for (let z = b.z0; z <= b.z1; z++)
      for (let x = b.x0; x <= b.x1; x++) {
        // cells held at street level (the waterfront) are not filled
        const e = elev[z * plan.W + x];
        if (!e) continue;
        const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
        for (let y = 1; y <= e; y++) world.set(x, y, z, edge ? MAT.RETAIN : MAT.BASE);
      }
  }
}

// ---- following real ground ---------------------------------------------------
// Every cell of the city sits at its own height, so the streets roll with the
// land instead of standing on one flat plane. Two rules keep it walkable:
// neighbouring cells never differ by more than one block, and each lot is
// levelled to a single height so buildings have flat ground to stand on.
function terrainElevation(plan, cfg, elev) {
  const { W, D } = plan;
  const t = cfg.terrain;
  const H = Math.max(3, Math.min(24, (cfg.terrainFill | 0) || 10));
  const want = new Int16Array(W * D);
  // start from the ground, measured from the city's base level
  for (let i = 0; i < W * D; i++) {
    const g = t.ground[i];
    want[i] = g < -900 ? 0 : Math.max(0, Math.min(H, Math.round(g - t.baseY)));
  }
  // Two rules have to hold at once: each lot is flat (a building needs level
  // ground) and no two neighbouring cells differ by more than a block (so
  // everywhere stays walkable). Levelling a lot can break the second rule and
  // smoothing can break the first, so they are settled together, always by
  // raising, until nothing moves.
  // Anything that has to be dead level — a lot, the canal, the harbour basin
  // — is levelled as a unit. Water cannot slope, and a building needs flat
  // ground under it.
  const groups = (plan.flatGroups || []).map((cells) => cells.filter((i) => i >= 0 && i < W * D));
  // Levelling by the median keeps the city close to the real ground; by the
  // maximum it would creep upward every round and end up a plateau. The last
  // round levels by the maximum so the flatness is exact.
  const levelBy = (pick) => {
    const apply = (cells) => {
      if (!cells.length) return;
      const ys = cells.map((i) => want[i]).sort((a, b) => a - b);
      const level = pick === 'max' ? ys[ys.length - 1] : pick === 'min' ? ys[0] : ys[Math.floor(ys.length / 2)];
      for (const i of cells) want[i] = level;
    };
    for (const cells of groups) apply(cells);
    for (const lot of plan.lots) {
      const cells = [];
      for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) cells.push(z * W + x);
      apply(cells);
    }
  };
  const levelLots = () => levelBy('median');
  // Limit the slope to one block per cell without dragging the whole city
  // upward. Two slope-limited envelopes are built from the ground: a lower
  // one that shaves the peaks and an upper one that fills the hollows. The
  // city takes the middle of the two, which is slope-limited as well and
  // stays as near the real ground as a walkable surface can.
  const inMask = (i) => !plan.mask || plan.mask[i];
  const smooth = () => {
    const L = Int16Array.from(want), U = Int16Array.from(want);
    const sweep = (arr, cmp, adj) => {
      for (const forward of [true, false]) {
        for (let k = 0; k < W * D; k++) {
          const i = forward ? k : W * D - 1 - k;
          const x = i % W, z = (i - x) / W;
          if (!inMask(i)) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            const j = nz * W + nx;
            if (!inMask(j)) continue;
            const v = arr[j] + adj;
            if (cmp(v, arr[i])) arr[i] = v;
          }
        }
      }
    };
    sweep(L, (v, cur) => v < cur, 1);          // peaks come down
    sweep(U, (v, cur) => v > cur, -1);         // hollows come up
    let changed = 0;
    for (let i = 0; i < W * D; i++) {
      if (!inMask(i)) continue;
      const v = Math.round((L[i] + U[i]) / 2);
      if (v !== want[i]) { want[i] = v; changed++; }
    }
    // rounding can leave the odd one-block-too-tall step: shave those
    for (let pass = 0; pass < 4; pass++) {
      let fixed = 0;
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++) {
          const i = z * W + x;
          if (!inMask(i)) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            const j = nz * W + nx;
            if (!inMask(j)) continue;
            if (want[i] - want[j] > 1) { want[i] = want[j] + 1; fixed++; }
          }
        }
      changed += fixed;
      if (!fixed) break;
    }
    return changed;
  };
  // each flat region starts at the median of its own ground
  for (const cells of groups) {
    if (!cells.length) continue;
    const ys = cells.map((i) => want[i]).sort((a, b) => a - b);
    const level = ys[Math.floor(ys.length / 2)];
    for (const i of cells) want[i] = level;
  }
  // a lot starts at the median of its ground, then only ever rises
  for (const lot of plan.lots) {
    const ys = [];
    for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) ys.push(want[z * W + x]);
    ys.sort((a, b) => a - b);
    const level = ys[Math.floor(ys.length / 2)];
    for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) want[z * W + x] = level;
  }
  // a height has to be able to travel right across the city, so the passes
  // are generous; it settles long before the cap on ordinary ground
  for (let round = 0; round < 12; round++) {
    let moved = 0;
    for (let pass = 0; pass < W + D; pass++) { const c = smooth(); moved += c; if (!c) break; }
    const before = want.slice();
    levelLots();
    for (let i = 0; i < want.length; i++) if (want[i] !== before[i]) moved++;
    if (!moved) break;
  }
  // Settle it for good. The lots are flat at their own median and stay put;
  // the streets around them take up the difference, ramping a block at a
  // time. Only where two lots sit side by side (inside a block, with no
  // street between) does a lot itself give way.
  const fixed = new Uint8Array(W * D);
  for (const lot of plan.lots)
    for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) fixed[z * W + x] = 1;
  for (const cells of groups) for (const i of cells) fixed[i] = 1;
  levelBy('median');
  for (let round = 0; round < 24; round++) {
    let moved = 0;
    // streets ramp to meet whatever they run alongside
    for (let pass = 0; pass < W + D; pass++) {
      let fixes = 0;
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++) {
          const i = z * W + x;
          if (!inMask(i) || fixed[i]) continue;
          let lo = -99, hi = 99;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            const j = nz * W + nx;
            if (!inMask(j)) continue;
            lo = Math.max(lo, want[j] - 1);
            hi = Math.min(hi, want[j] + 1);
          }
          const v = Math.max(lo, Math.min(hi, want[i]));
          if (v !== want[i] && lo <= hi) { want[i] = v; fixes++; }
        }
      moved += fixes;
      if (!fixes) break;
    }
    // neighbouring lots that still disagree: the higher one comes down
    let lotFixes = 0;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (!inMask(i) || !fixed[i]) continue;
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx >= W || nz >= D) continue;
          const j = nz * W + nx;
          if (!inMask(j) || !fixed[j]) continue;
          if (Math.abs(want[i] - want[j]) <= 1) continue;
          const lower = want[i] < want[j] ? want[i] : want[j];
          for (const lot of plan.lots) {
            const holds = (cx, cz) => cx >= lot.x0 && cx <= lot.x1 && cz >= lot.z0 && cz <= lot.z1;
            if (!holds(x, z) && !holds(nx, nz)) continue;
            const level = Math.max(lower + 1, Math.min(want[lot.z0 * W + lot.x0], lower + 1));
            for (let lz = lot.z0; lz <= lot.z1; lz++) for (let lx = lot.x0; lx <= lot.x1; lx++) want[lz * W + lx] = level;
            lotFixes++;
          }
        }
      }
    moved += lotFixes;
    levelBy('median');
    if (!moved) break;
  }
  // Final settling, in strict order so nothing can re-open a tall step:
  // lots are flattened, then the streets are free to ramp, and any lot that
  // still disagrees with what is beside it comes down a block. Repeat until
  // the whole city is walkable.
  // every cell belongs to at most one thing that must move as a whole: a lot,
  // or a flat region such as the canal or the harbour basin
  const unitOf = new Int32Array(W * D).fill(-1);
  const units = [];
  plan.lots.forEach((lot) => {
    const cells = [];
    for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) cells.push(z * W + x);
    units.push(cells);
  });
  for (const cells of groups) units.push(cells.slice());
  units.forEach((cells, ui) => { for (const i of cells) unitOf[i] = ui; });
  const setLot = (ui, level) => { for (const i of units[ui]) want[i] = level; };
  const lotOf = unitOf;
  levelBy('min');
  for (let round = 0; round < 40; round++) {
    // streets take whatever level keeps them within a block of their neighbours
    for (let pass = 0; pass < W + D; pass++) {
      let fixes = 0;
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++) {
          const i = z * W + x;
          if (!inMask(i) || fixed[i]) continue;
          let lo = -999, hi = 999;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            const j = nz * W + nx;
            if (!inMask(j)) continue;
            lo = Math.max(lo, want[j] - 1);
            hi = Math.min(hi, want[j] + 1);
          }
          if (lo > hi) continue;                       // pulled both ways: leave it to the lots
          const v = Math.max(lo, Math.min(hi, want[i]));
          if (v !== want[i]) { want[i] = v; fixes++; }
        }
      if (!fixes) break;
    }
    // whatever still disagrees: the higher side comes down a block
    let left = 0;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (!inMask(i)) continue;
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx >= W || nz >= D) continue;
          const j = nz * W + nx;
          if (!inMask(j) || Math.abs(want[i] - want[j]) <= 1) continue;
          const [hiI, loI] = want[i] > want[j] ? [i, j] : [j, i];
          left++;
          if (lotOf[hiI] >= 0) setLot(lotOf[hiI], want[loI] + 1);
          else want[hiI] = want[loI] + 1;
        }
      }
    if (!left) break;
  }
  for (let i = 0; i < W * D; i++) elev[i] = Math.max(0, Math.min(127, want[i]));
  // the blocks are still listed (other code asks what a block's level is), but
  // every cell now carries its own height, so there are no terraces to cut
  const blocks = plan.cityBlocks.map((b) => {
    let e = 0;
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) e = Math.max(e, elev[z * W + x]);
    return { ...b, e, rolling: true };
  });
  return { elev, blocks, H, rolling: true };
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
      // A flight is only worth building if the ground it leaves and the
      // ground it reaches are at different heights. Where the street outside
      // has settled to the same level as the block, the steps climb nothing
      // and stand in the road looking like an ornament.
      {
        const foot = [steps[steps.length - 1][0] + out[0], steps[steps.length - 1][1] + out[1]];
        const fx = Math.max(0, Math.min(W - 1, foot[0])), fz = Math.max(0, Math.min(D - 1, foot[1]));
        const outside = hills.elev ? hills.elev[fz * W + fx] : 0;
        if (outside === e) return false;   // cut() reports that it built nothing
      }
      const landing = [last[0] + dir[0], last[1] + dir[1]];
      for (const [x, z] of steps.concat([landing]))
        for (const [ax, az] of [[0, 0], [dir[1], dir[0]], [-dir[1], -dir[0]]]) claimed.add((x + ax) + ',' + (z + az));
      steps.forEach(([x, z], i) => {
        for (let y = G + 1 + i; y <= G + e + 3; y++) world.clear(x, y, z);
        for (let y = 1; y <= G + i; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.BASE);
        world.set(x, G + 1 + i, z, stairId('stonebrick', UP(dir[0], dir[1])));
      });
      runs.push({ block: b, cells: steps, dir, e, kind, out });
      return true;
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
        // Every step stays on the pavement that rings the block; the landing
        // may be the pavement or the open edge of a lot. A flight that cuts
        // deeper ends in somebody's back yard, walled in by the houses.
        const onPavement = ([x, z]) => use[z * W + x] === USE.SIDEWALK;
        if (!steps.every(onPavement)) return false;
        if (!onPavement(landing) && use[landing[1] * W + landing[0]] !== USE.LOT) return false;
        // the landing must be terrace you can stand on
        if (!blocked(landing[0], G + e, landing[1])) return false;
        return cut(steps, inward, 'straight', sd.out);
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
        return cut(Array.from({ length: e }, (_, i) => sd.cells(i0 + i)), sd.along, 'along', sd.out);
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
