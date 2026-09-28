// engine/fish.js — fish in the city's water: park ponds, the canal and the
// harbour basin.
//
// Run last, once every block is in place (styles, bridges and the harbour can
// all change water). Bodies of water are found from the blocks themselves:
// the surface cells of the water, grouped four-way at the same height. A body
// has to be a real pool, not a one-wide irrigation channel or a fountain bowl,
// so it needs at least a 2x2 patch of open water. Small bodies are ponds and
// get mostly tropical fish; large ones are the canal and harbour and get cod
// and salmon. Fish are spaced apart and only placed in water two or more deep,
// in the layer under the surface (ponds are given a deep middle for them).
//
// Fish despawn like wild ones unless something marks them as kept: Java takes
// PersistenceRequired; Bedrock keeps a named mob, so they are summoned with a
// name (see export.js).
import { MAT } from './materials.js';

export const FISH_TYPES = ['cod', 'salmon', 'tropicalfish'];
export const FISH_NAMES = { cod: 'Cod', salmon: 'Salmon', tropicalfish: 'Koi' };

const DEFAULTS = {
  minCells: 6,        // smaller than this is a fountain or a puddle
  bigBody: 150,       // at least this many surface cells: the canal or harbour
  pondPer: 8,         // one fish per this many surface cells, in a pond
  riverPer: 30,       // and in the canal / harbour
  pondMax: 6,
  riverMax: 48,
  max: 120,           // for the whole city
  spacing: 2,         // no two fish closer than this (chessboard distance)
};

// Java's tropical fish Variant: size | pattern << 8 | body colour << 16 | pattern colour << 24
export function tropicalVariant(rng) {
  const size = rng.int(0, 1), pattern = rng.int(0, 5);
  const body = rng.int(0, 15);
  let spots = rng.int(0, 15);
  if (spots === body) spots = (spots + 7) % 16;
  return (size | (pattern << 8) | (body << 16) | (spots << 24)) >>> 0;
}

export function waterBodies(world, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const W = MAT.WATER;
  const isW = (x, y, z) => world.get(x, y, z) === W;
  const surface = new Map();                                // "x,y,z" -> depth
  world.forEach((x, y, z, id) => {
    if (id !== W || isW(x, y + 1, z)) return;
    let d = 1;
    while (d < 8 && isW(x, y - d, z)) d++;
    surface.set(`${x},${y},${z}`, d);
  });
  const seen = new Set(), bodies = [];
  for (const key of surface.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = [], queue = [key];
    while (queue.length) {
      const k = queue.pop();
      const [x, y, z] = k.split(',').map(Number);
      cells.push({ x, y, z, depth: surface.get(k) });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = `${x + dx},${y},${z + dz}`;
        if (surface.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    if (cells.length < o.minCells) continue;
    const at = new Set(cells.map((c) => c.x + ',' + c.z));
    const open = cells.some((c) => at.has(`${c.x + 1},${c.z}`) && at.has(`${c.x},${c.z + 1}`) && at.has(`${c.x + 1},${c.z + 1}`));
    if (!open) continue;                                     // a channel, not a pool
    bodies.push({ cells, kind: cells.length >= o.bigBody ? 'river' : 'pond' });
  }
  return bodies;
}

export function fishSpawns(world, rng, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const bodies = waterBodies(world, o);
  // biggest first, so the city-wide cap trims ponds before the canal
  bodies.sort((a, b) => b.cells.length - a.cells.length);
  const out = [];
  for (const body of bodies) {
    const n = body.cells.length;
    const want = body.kind === 'river'
      ? Math.max(2, Math.min(o.riverMax, Math.round(n / o.riverPer)))
      : Math.max(1, Math.min(o.pondMax, Math.round(n / o.pondPer)));
    // Only water at least two deep: a fish in the bottom layer has water over
    // it and cannot leap out onto the bank (in a one-deep pond fish beach
    // themselves). Deeper cells first, shuffled within depth.
    const cells = rng.shuffle(body.cells.filter((c) => c.depth >= 2)).sort((a, b) => Math.min(b.depth, 3) - Math.min(a.depth, 3));
    const placed = [];
    for (const c of cells) {
      if (placed.length >= want || out.length >= o.max) break;
      if (placed.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.z - c.z)) < o.spacing)) continue;
      const type = body.kind === 'river' ? (rng.chance(0.6) ? 'cod' : 'salmon') : (rng.chance(0.75) ? 'tropicalfish' : 'cod');
      const f = { type, x: c.x, y: c.y - 1, z: c.z, water: body.kind, name: FISH_NAMES[type] };
      if (type === 'tropicalfish') f.variant = tropicalVariant(rng);
      placed.push(f);
      out.push(f);
    }
    if (out.length >= o.max) break;
  }
  return out;
}
