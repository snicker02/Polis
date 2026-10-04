// engine/railgraph.js — which rails a cart can actually run between.
//
// Two neighbouring rails are joined if each one's shape leads to the other. On
// the level that is all; a rail a block higher is reached only by climbing: the
// lower one must be the slope that rises toward it (a flat rail beside a higher
// one is a step a cart cannot take, however the two are shaped). Bedrock's
// rail_direction: 0 north-south, 1 east-west, 2..5 rising east, west, north,
// south, 6..9 the curves south-east, south-west, north-west, north-east.

export const OUT = {
  0: [[0, -1], [0, 1]], 1: [[1, 0], [-1, 0]], 2: [[1, 0], [-1, 0]], 3: [[1, 0], [-1, 0]], 4: [[0, -1], [0, 1]], 5: [[0, -1], [0, 1]],
  6: [[0, 1], [1, 0]], 7: [[0, 1], [-1, 0]], 8: [[0, -1], [-1, 0]], 9: [[0, -1], [1, 0]],
};
// the way a slope rises
export const RISE = { 2: [1, 0], 3: [-1, 0], 4: [0, -1], 5: [0, 1] };

// rails: Map "x,y,z" -> rail_direction. Returns the rails the one at k is joined to.
export function railLinks(rails, k) {
  const [x, y, z] = k.split(',').map(Number), d = rails.get(k), out = [];
  for (const [dx, dz] of OUT[d]) {
    for (const dy of [0, 1, -1]) {
      const m = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
      if (!rails.has(m)) continue;
      const e = rails.get(m);
      if (!OUT[e].some(([bx, bz]) => bx === -dx && bz === -dz)) continue;
      if (dy === 1) { const r = RISE[d]; if (!r || r[0] !== dx || r[1] !== dz) continue; }          // climbing: I rise toward it
      if (dy === -1) { const r = RISE[e]; if (!r || r[0] !== -dx || r[1] !== -dz) continue; }       // descending: it rises toward me
      out.push(m);
      break;
    }
  }
  return out;
}

// every rail of a world, as the map railLinks wants
export function railsOf(world, MATERIALS) {
  const rails = new Map();
  world.forEach((x, y, z, id) => {
    const d = MATERIALS.def(id);
    if (d.block !== 'minecraft:rail' && d.block !== 'minecraft:golden_rail') return;
    const st = d.states.rail_direction;
    rails.set(x + ',' + y + ',' + z, Number(st ? (st.value ?? st) : 0));
  });
  return rails;
}

// the track joined to the rail at start
export function trackFrom(rails, start) {
  const seen = new Set([start]), q = [start];
  while (q.length) for (const m of railLinks(rails, q.pop())) if (!seen.has(m)) { seen.add(m); q.push(m); }
  return seen;
}
