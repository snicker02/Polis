// engine/plan.js — street grid, city blocks, lots, zoning.
//
// Everything is axis aligned and integer: the plan lives on the lattice, so
// nothing ever lands off a block boundary.
//
// Lot subdivision guarantees FRONTAGE: a city block is cut by alleys until no
// piece is deeper than ~2.6 lots, then each piece becomes one or two rows of
// lots, and every lot in a row touches the piece's outer edge (sidewalk or
// alley). No lot is ever landlocked behind another.

import { fbm2, clamp, lerp } from './rng.js';

export const USE = { EMPTY: 0, ROAD: 1, SIDEWALK: 2, LOT: 3, PARK: 4, PLAZA: 5 };

export function generatePlan(cfg, rng) {
  const W = cfg.size, D = cfg.size;
  const use = new Uint8Array(W * D);
  const roadAxis = new Uint8Array(W * D); // 1 = runs along x, 2 = runs along z, 3 = junction
  const roadWidthAt = new Uint8Array(W * D);
  const corridors = [];
  const cityBlocks = [];
  const at = (x, z) => z * W + x;

  const paveRoad = (x0, z0, x1, z1, axis, width) => {
    const bit = axis === 'x' ? 1 : 2;
    for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        use[at(x, z)] = USE.ROAD;
        roadAxis[at(x, z)] |= bit;
        if (width > roadWidthAt[at(x, z)]) roadWidthAt[at(x, z)] = width;
      }
    corridors.push({ axis, x0, z0, x1, z1, w: width });
  };

  // ---- 1. street grid ------------------------------------------------------
  const minBlock = cfg.minBlock;
  const roadWidth = (depth) => (depth === 0 ? cfg.avenueWidth : depth <= 2 ? cfg.streetWidth : Math.max(3, cfg.streetWidth - 2));

  function split(x0, z0, x1, z1, depth) {
    const w = x1 - x0 + 1, d = z1 - z0 + 1;
    const rw = roadWidth(depth);
    const horiz = w >= d;
    const span = horiz ? w : d;
    const canSplit = span >= minBlock * 2 + rw && depth < cfg.maxDepth;
    const stopEarly = depth >= 4 && span < minBlock * 3 && rng.chance(cfg.blockIrregularity * 0.35);
    if (!canSplit || stopEarly) { cityBlocks.push({ x0, z0, x1, z1, depth }); return; }
    const lo = (horiz ? x0 : z0) + minBlock;
    const hi = (horiz ? x1 : z1) - minBlock - rw + 1;
    const mid = Math.round(((horiz ? x0 + x1 : z0 + z1) - rw) / 2);
    const cut = clamp(mid + Math.round((rng() - 0.5) * span * 0.34 * cfg.blockIrregularity), lo, hi);
    if (horiz) {
      paveRoad(cut, z0, cut + rw - 1, z1, 'z', rw);
      split(x0, z0, cut - 1, z1, depth + 1);
      split(cut + rw, z0, x1, z1, depth + 1);
    } else {
      paveRoad(x0, cut, x1, cut + rw - 1, 'x', rw);
      split(x0, z0, x1, cut - 1, depth + 1);
      split(x0, cut + rw, x1, z1, depth + 1);
    }
  }

  const border = cfg.streetWidth;
  split(border, border, W - 1 - border, D - 1 - border, 0);
  paveRoad(0, 0, W - 1, border - 1, 'x', border);
  paveRoad(0, D - border, W - 1, D - 1, 'x', border);
  paveRoad(0, 0, border - 1, D - 1, 'z', border);
  paveRoad(W - border, 0, W - 1, D - 1, 'z', border);

  // ---- 2. zoning field -----------------------------------------------------
  const fx = cfg.focal[0] * W, fz = cfg.focal[1] * D;
  const radius = Math.max(10, cfg.downtownRadius * cfg.size);
  const zoneAt = (x, z) => {
    const dx = (x - fx) / radius, dz = (z - fz) / radius;
    const core = Math.exp(-(dx * dx + dz * dz) * 1.15);
    const n = fbm2(x, z, cfg.seed ^ 0x51ed270b, 26) - 0.5;
    return clamp(core * (1 + n * 1.2 * cfg.zoneNoise) + n * 0.10 * cfg.zoneNoise, 0, 1);
  };

  // ---- 3. sidewalks, alleys, lots ------------------------------------------
  const sw = cfg.sidewalk;
  const rawLots = [];

  function row(x0, z0, x1, z1, target) {
    const w = x1 - x0 + 1, d = z1 - z0 + 1;
    if (w < 5 || d < 5) return;
    const horiz = w >= d;
    const long = horiz ? w : d;
    const n = Math.max(1, Math.ceil(long / (target * 1.35)));
    const cuts = [0];
    for (let i = 1; i < n; i++) cuts.push(clamp(Math.round((long * i) / n + (rng() - 0.5) * target * 0.4), 4, long - 4));
    cuts.push(long);
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      const a = cuts[i], b = cuts[i + 1] - 1;
      if (b - a + 1 < 5) continue;
      const r = horiz
        ? { x0: x0 + a, z0, x1: x0 + b, z1 }
        : { x0, z0: z0 + a, x1, z1: z0 + b };
      rawLots.push({ ...r, kind: USE.LOT, zone: zoneAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) });
    }
  }

  function carve(x0, z0, x1, z1, target, depth) {
    const w = x1 - x0 + 1, d = z1 - z0 + 1;
    if (w < 5 || d < 5) return;
    const horiz = w >= d;                 // long axis is x when horiz
    const short = horiz ? d : w;
    const aw = cfg.alleyWidth;

    if (short > target * 2.6 && short >= 2 * (target + aw) && depth < 3) {
      const pad = Math.max(5, Math.round(target * 0.85));
      const lo = (horiz ? z0 : x0) + pad;
      const hi = (horiz ? z1 : x1) - pad - aw + 1;
      if (hi > lo) {
        const cut = clamp(Math.round((lo + hi) / 2 + (rng() - 0.5) * (hi - lo) * 0.5), lo, hi);
        if (horiz) {
          paveRoad(x0, cut, x1, cut + aw - 1, 'x', aw);
          carve(x0, z0, x1, cut - 1, target, depth + 1);
          carve(x0, cut + aw, x1, z1, target, depth + 1);
        } else {
          paveRoad(cut, z0, cut + aw - 1, z1, 'z', aw);
          carve(x0, z0, cut - 1, z1, target, depth + 1);
          carve(cut + aw, z0, x1, z1, target, depth + 1);
        }
        return;
      }
    }

    if (short > target * 1.7) {
      if (horiz) {
        const cut = Math.floor((z0 + z1) / 2);
        row(x0, z0, x1, cut, target); row(x0, cut + 1, x1, z1, target);
      } else {
        const cut = Math.floor((x0 + x1) / 2);
        row(x0, z0, cut, z1, target); row(cut + 1, z0, x1, z1, target);
      }
    } else row(x0, z0, x1, z1, target);
  }

  for (const b of cityBlocks) {
    for (let z = b.z0; z <= b.z1; z++)
      for (let x = b.x0; x <= b.x1; x++) use[at(x, z)] = USE.SIDEWALK;

    const ix0 = b.x0 + sw, iz0 = b.z0 + sw, ix1 = b.x1 - sw, iz1 = b.z1 - sw;
    if (ix1 - ix0 + 1 < 6 || iz1 - iz0 + 1 < 6) continue; // whole block is paving

    const zc = zoneAt((ix0 + ix1) / 2, (iz0 + iz1) / 2);

    if (rng.chance(cfg.parkChance * (zc > 0.55 ? 0.5 : 1.4))) {
      const kind = zc > 0.55 ? USE.PLAZA : USE.PARK;
      for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) use[at(x, z)] = kind;
      rawLots.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1, kind, zone: zc });
      continue;
    }

    carve(ix0, iz0, ix1, iz1, Math.round(lerp(cfg.lotSuburb, cfg.lotDowntown, Math.pow(zc, 0.75))), 0);
  }

  // ---- 4. per-lot programme ------------------------------------------------
  const lots = [];
  for (const lot of rawLots) {
    const w = lot.x1 - lot.x0 + 1, d = lot.z1 - lot.z0 + 1;
    if (lot.kind !== USE.LOT) { lots.push({ ...lot, w, d }); continue; }
    for (let z = lot.z0; z <= lot.z1; z++)
      for (let x = lot.x0; x <= lot.x1; x++) use[at(x, z)] = USE.LOT;

    const zone = lot.zone;
    const small = Math.min(w, d);
    const t = Math.pow(zone, 1.7);
    const jitter = lerp(0.6, 1.4, fbm2(lot.x0 * 3.1, lot.z0 * 3.1, cfg.seed ^ 0x2545f491, 9));
    let floors = Math.round(lerp(1, cfg.maxFloors, t) * jitter);
    const byArea = small < 7 ? 1 : small < 9 ? 4 : small < 12 ? 10 : small < 16 ? 24 : cfg.maxFloors;
    floors = clamp(floors, 1, Math.min(cfg.maxFloors, byArea));
    if (zone < 0.10 && small >= 9) floors = Math.min(floors, 2);

    let style;
    if (floors <= 2 && zone < 0.36) style = 'house';
    else if (floors >= Math.max(7, cfg.maxFloors * 0.32)) style = 'tower';
    else style = 'mid';

    let margin = style === 'house' ? 2 : zone > 0.62 ? 0 : 1;
    while (small - margin * 2 < 5 && margin > 0) margin--;

    lots.push({ ...lot, w, d, floors, style, margin });
  }

  // ---- 5. organic outline ----------------------------------------------------
  let keptBlocks = cityBlocks, keptLots = lots;
  if (cfg.outline === 'organic') ({ keptBlocks, keptLots } = organicOutline(W, D, use, roadWidthAt, cityBlocks, lots, cfg, [fx, fz]));
  const mask = new Uint8Array(W * D);
  for (let i = 0; i < W * D; i++) mask[i] = use[i] !== USE.EMPTY ? 1 : 0;

  return { W, D, use, roadAxis, roadWidthAt, corridors, cityBlocks: keptBlocks, lots: keptLots, zoneAt, focal: [fx, fz], mask };
}

// The city keeps only the blocks inside a lobed shape and the streets that
// border them, so its edge follows the street grid in an irregular outline
// instead of filling the square. Holes are filled and stray islands dropped,
// so the city is one piece with a single outer edge (the wall and the rail
// loop run round it).
function organicOutline(W, D, use, roadWidthAt, blocks, lots, cfg, focal) {
  const at = (x, z) => z * W + x;
  const cx = W / 2, cz = D / 2;
  const radius = (theta) => {
    const n = fbm2(Math.cos(theta) * 60 + 500, Math.sin(theta) * 60 + 500, cfg.seed ^ 0x0a11ce, 40);
    return 0.62 + 0.42 * n;                 // 0.62 .. 1.04 of the half-size: lobes and bays
  };
  const inside = (x, z) => {
    const dx = (x - cx) / (W / 2), dz = (z - cz) / (D / 2);
    return Math.hypot(dx, dz) < radius(Math.atan2(dz, dx));
  };
  const blockOf = new Int32Array(W * D).fill(-1);
  blocks.forEach((b, i) => { for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) blockOf[at(x, z)] = i; });
  let keep = blocks.map((b) => inside((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));
  const fb = blockOf[at(Math.max(0, Math.min(W - 1, Math.round(focal[0]))), Math.max(0, Math.min(D - 1, Math.round(focal[1]))))];
  if (fb >= 0) keep[fb] = true;

  // kept area = kept blocks + every road cell within its own street width of one
  const build = () => {
    const dist = new Int16Array(W * D).fill(32767);
    const q = [];
    for (let i = 0; i < W * D; i++) if (blockOf[i] >= 0 && keep[blockOf[i]]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, z = (i - x) / W, d = dist[i] + 1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const j = at(nx, nz);
        if (dist[j] <= d || use[j] !== 1 /* ROAD */) continue;
        dist[j] = d; q.push(j);
      }
    }
    return dist;
  };
  for (let pass = 0; pass < 3; pass++) {
    const dist = build();
    const inCity = (i) => (blockOf[i] >= 0 ? keep[blockOf[i]] : use[i] === 1 && dist[i] <= Math.max(1, roadWidthAt[i]));
    // fill holes: unkept blocks not connected to the outside through non-city cells
    const outside = new Uint8Array(W * D);
    const q = [];
    for (let x = 0; x < W; x++) for (const z of [0, D - 1]) q.push(at(x, z));
    for (let z = 0; z < D; z++) for (const x of [0, W - 1]) q.push(at(x, z));
    for (const i of q) if (!inCity(i)) outside[i] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; if (!outside[i]) continue;
      const x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const j = at(nx, nz);
        if (outside[j] || inCity(j)) continue;
        outside[j] = 1; q.push(j);
      }
    }
    let changed = false;
    blocks.forEach((b, i) => {
      if (keep[i]) return;
      const c = at(Math.round((b.x0 + b.x1) / 2), Math.round((b.z0 + b.z1) / 2));
      if (!outside[c]) { keep[i] = true; changed = true; }
    });
    // keep only the kept blocks connected to the focal block through kept roads
    const comp = new Int8Array(blocks.length);
    const start = fb >= 0 ? fb : keep.findIndex(Boolean);
    const seen = new Uint8Array(W * D), bq = [];
    if (start >= 0) {
      const b = blocks[start];
      bq.push(at(b.x0, b.z0)); seen[at(b.x0, b.z0)] = 1;
      for (let h = 0; h < bq.length; h++) {
        const i = bq[h], x = i % W, z = (i - x) / W;
        if (blockOf[i] >= 0) comp[blockOf[i]] = 1;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const j = at(nx, nz);
          if (seen[j] || !inCity(j)) continue;
          seen[j] = 1; bq.push(j);
        }
      }
    }
    blocks.forEach((b, i) => { if (keep[i] && !comp[i]) { keep[i] = false; changed = true; } });
    if (!changed) break;
  }

  // clear everything that is not city
  const dist = build();
  for (let i = 0; i < W * D; i++) {
    const kb = blockOf[i] >= 0 ? keep[blockOf[i]] : (use[i] === 1 && dist[i] <= Math.max(1, roadWidthAt[i]));
    if (!kb) use[i] = 0;                    // EMPTY: natural ground, nothing placed
  }
  // a road cell only stays if it is within its own street's width of a kept block
  // (so a street bordering the city is kept whole, one beyond it is not)
  const keptBlocks = blocks.filter((b, i) => keep[i]);
  const keptLots = lots.filter((l) => {
    const i = blockOf[at(Math.round((l.x0 + l.x1) / 2), Math.round((l.z0 + l.z1) / 2))];
    return i >= 0 && keep[i];
  });
  return { keptBlocks, keptLots };
}

// Which side of a lot faces public space? Returns {side, score}.
export function frontage(plan, lot) {
  const { W, D, use } = plan;
  const open = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= D) return 0;
    const u = use[z * W + x];
    return (u === USE.ROAD || u === USE.SIDEWALK) ? 3 : (u === USE.PARK || u === USE.PLAZA) ? 2 : 0;
  };
  let north = 0, south = 0, east = 0, west = 0;
  for (let x = lot.x0; x <= lot.x1; x++) { north += open(x, lot.z0 - 1); south += open(x, lot.z1 + 1); }
  for (let z = lot.z0; z <= lot.z1; z++) { west += open(lot.x0 - 1, z); east += open(lot.x1 + 1, z); }
  const lenX = lot.x1 - lot.x0 + 1, lenZ = lot.z1 - lot.z0 + 1;
  const norm = { north: north / lenX, south: south / lenX, west: west / lenZ, east: east / lenZ };
  let best = 'south', bv = -1;
  for (const k of ['south', 'north', 'east', 'west']) if (norm[k] > bv) { bv = norm[k]; best = k; }
  return { side: best, score: bv };
}
