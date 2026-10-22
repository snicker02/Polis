// engine/link.js — a bridge between two bridges' far ends (0.75.1).
//
// Cities joined by bridges (joins.js) make a tree: each new city comes in by one bridge, so
// two free bridges ending near each other never meet. A link closes the loop: from one free
// bridge's end to another's, a deck five wide on piers, out straight from each landing, turning
// as it must to get from one to the other (as few turns as it can), rising or falling a block
// at a time (never more than one in three) where the two ends stand at different heights, kept
// clear of the cities and the bridges it knows of.
//
// It is planned in the first city's frame: x, z blocks from its build spot (east, south), y
// in the city's own heights (both cities' blocks load the same height under their spots). Its
// pack is loaded from the first city's marker (or, given that spot's coordinates, at them).

import { MAT, MATERIALS } from './materials.js';
import { VoxelWorld, writeMcStructure, buildMcPack } from './blockcore.js';

export const DIRV = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const HEAD = [[1, 0], [0, 1], [-1, 0], [0, -1]];                  // east, south, west, north
const headOf = (d) => HEAD.findIndex(([a, b]) => a === d[0] && b === d[1]);
export const LINK = { half: 2, turn: 8, slope: 3, margin: 48, pier: 10, depth: 12, clear: 5, lead: 3 };

// a: { x, y, z, dir } the first end (the cell just past its landing, the way its bridge
// points); b likewise. rects: { x0, z0, x1, z1, pad } to keep the deck off. Returns
// { path: [[x, z, y]...], turns, length, rise } or { missing }.
export function planLink(a, b, rects = []) {
  const dA = DIRV[a.dir], dB = DIRV[b.dir];
  if (!dA || !dB) return { missing: 'a bridge end with no direction' };
  const H = LINK.half, n = LINK.lead;
  // the leads: straight out from each landing, n cells, the deck square round each clear
  const leadA = [...Array(n)].map((_, k) => [a.x + dA[0] * k, a.z + dA[1] * k]);
  const leadB = [...Array(n)].map((_, k) => [b.x + dB[0] * k, b.z + dB[1] * k]);
  const S = [a.x + dA[0] * n, a.z + dA[1] * n], G = [b.x + dB[0] * n, b.z + dB[1] * n];
  const x0 = Math.min(S[0], G[0]) - LINK.margin, x1 = Math.max(S[0], G[0]) + LINK.margin;
  const z0 = Math.min(S[1], G[1]) - LINK.margin, z1 = Math.max(S[1], G[1]) + LINK.margin;
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  if (W * D > 1500 * 1500) return { missing: 'the two ends are too far apart to link (over a thousand blocks)' };
  const blocked = new Uint8Array(W * D);
  for (const r of rects) {
    const p = (r.pad || 0) + H;
    for (let x = Math.max(x0, r.x0 - p); x <= Math.min(x1, r.x1 + p); x++) for (let z = Math.max(z0, r.z0 - p); z <= Math.min(z1, r.z1 + p); z++) blocked[(z - z0) * W + (x - x0)] = 1;
  }
  const free = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && !blocked[(z - z0) * W + (x - x0)];
  if (!free(...S) || !free(...G)) return { missing: 'a bridge end has something in front of it (a city or a bridge) where the link would leave it' };
  // A*: state a cell and a heading; a step forward, or a quarter turn in place (dear: as few
  // turns as it can). It must leave S heading out of A and reach G heading in toward B.
  const hS = headOf(dA), hG = headOf([-dB[0], -dB[1]]);
  const N = W * D * 4, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const idx = (x, z, h) => (((z - z0) * W + (x - x0)) << 2) | h;
  const heap = [];
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const hEst = (x, z) => Math.abs(x - G[0]) + Math.abs(z - G[1]);
  const s0 = idx(S[0], S[1], hS);
  g[s0] = 0; push(hEst(...S), s0);
  const goal = idx(G[0], G[1], hG);
  let found = false, pops = 0;
  while (heap.length && pops < 6e6) {
    const [, i] = pop(); pops++;
    if (i === goal) { found = true; break; }
    const h = i & 3, cell = i >> 2, x = (cell % W) + x0, z = Math.floor(cell / W) + z0, gi = g[i];
    const moves = [[x + HEAD[h][0], z + HEAD[h][1], h, 1], [x, z, (h + 1) & 3, LINK.turn], [x, z, (h + 3) & 3, LINK.turn]];
    for (const [nx, nz, nh, c] of moves) {
      if (!free(nx, nz)) continue;
      const j = idx(nx, nz, nh), ng = gi + c;
      if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + hEst(nx, nz) + (nh === hG ? 0 : LINK.turn), j); }
    }
  }
  if (!found) return { missing: 'no way found between the two ends clear of the cities and bridges' };
  const mid = [];
  for (let i = goal; i !== -1; i = from[i]) { const cell = i >> 2; const p = [(cell % W) + x0, Math.floor(cell / W) + z0]; if (!mid.length || mid[mid.length - 1][0] !== p[0] || mid[mid.length - 1][1] !== p[1]) mid.push(p); }
  mid.reverse();
  const cells = [...leadA, ...mid, ...leadB.slice().reverse()];
  // the turns, counted along the way
  let turns = 0;
  for (let i = 2; i < cells.length; i++) { const d1 = [cells[i - 1][0] - cells[i - 2][0], cells[i - 1][1] - cells[i - 2][1]], d2 = [cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]]; if (d1[0] !== d2[0] || d1[1] !== d2[1]) turns++; }
  // heights: the rise spread evenly, a block at a time, never more than one in three
  const L = cells.length, rise = b.y - a.y;
  if (Math.abs(rise) * LINK.slope > L - 2 * n) return { missing: `the two ends stand ${Math.abs(rise)} apart in height, too steep for a link ${L} long` };
  const inner = L - 2 * n;
  const path = cells.map(([x, z], i) => {
    const t = i < n ? 0 : i >= L - n ? 1 : (i - n) / Math.max(1, inner - 1);
    return [x, z, a.y + Math.round(rise * t)];
  });
  return { path, turns, length: L, rise };
}

// The blocks of a link, in a world of their own (the first city's frame).
export function buildLink(plan) {
  // (its own world kept to small coordinates: every x, z less the corner of the link's ground)
  const ox = Math.min(...plan.path.map((p) => p[0])) - 8, oz = Math.min(...plan.path.map((p) => p[1])) - 8;
  const w = new VoxelWorld();
  const H = LINK.half, path = plan.path.map(([x, z, y]) => [x - ox, z - oz, y]), ends = [path[0], path[path.length - 1]];
  // each deck cell takes the height of the nearest cell of the way (the earlier on a tie)
  const deck = new Map();
  // (nothing behind either end: the landing is there; each end's way out from its landing)
  const outA = [path[1][0] - path[0][0], path[1][1] - path[0][1]], n = path.length;
  const outB = [path[n - 2][0] - path[n - 1][0], path[n - 2][1] - path[n - 1][1]];
  const behind = (x, z) => ((x - path[0][0]) * outA[0] + (z - path[0][1]) * outA[1] < 0 && Math.abs(x - path[0][0]) + Math.abs(z - path[0][1]) <= 2 * H)
    || ((x - path[n - 1][0]) * outB[0] + (z - path[n - 1][1]) * outB[1] < 0 && Math.abs(x - path[n - 1][0]) + Math.abs(z - path[n - 1][1]) <= 2 * H);
  path.forEach(([x, z, y], i) => {
    for (let dx = -H; dx <= H; dx++) for (let dz = -H; dz <= H; dz++) {
      if (behind(x + dx, z + dz)) continue;
      const k = (x + dx) + ',' + (z + dz), d = Math.max(Math.abs(dx), Math.abs(dz));
      const cur = deck.get(k);
      if (!cur || d < cur.d) deck.set(k, { x: x + dx, z: z + dz, y, d, i });
    }
  });
  const isDeck = (x, z) => deck.has(x + ',' + z);
  const nearEnd = (x, z) => ends.some(([ex, ez]) => Math.max(Math.abs(ex - x), Math.abs(ez - z)) <= H);
  const air = new Map();
  const out = { deck: 0, rail: 0, lamps: [], piers: 0 };
  for (const c of deck.values()) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !isDeck(c.x + a, c.z + b));
    const centre = c.d === 0;
    w.set(c.x, c.y, c.z, edge ? MAT.STONEBRICK : centre && c.i % 6 < 3 ? MAT.C_WHITE : MAT.SMOOTH);
    w.set(c.x, c.y - 1, c.z, MAT.STONEBRICK);
    out.deck++;
    for (let y = c.y + 1; y <= c.y + LINK.clear; y++) air.set(c.x + ',' + y + ',' + c.z, 1);
    // the railing on the edge (open where it meets each landing); a lamp on a post every eight
    if (edge && !nearEnd(c.x, c.z)) {
      if (((c.x + c.z) % 8 + 8) % 8 === 0) { w.set(c.x, c.y + 1, c.z, MAT.FENCE); w.set(c.x, c.y + 2, c.z, MAT.FENCE); w.set(c.x, c.y + 3, c.z, MAT.LAMP); out.lamps.push([c.x, c.y + 3, c.z]); }
      else w.set(c.x, c.y + 1, c.z, MAT.FENCE);
      out.rail++;
    }
  }
  // where the deck steps up a block from one cell to the next it is walked up (a jump: or a
  // step of stairs would stand in the way across): nothing to do; piers every ten down
  path.forEach(([x, z, y], i) => {
    if (i < LINK.lead + 2 || i > path.length - LINK.lead - 3 || i % LINK.pier) return;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let yy = y - LINK.depth; yy <= y - 2; yy++) w.set(x + dx, yy, z + dz, MAT.STONEBRICK);
    out.piers++;
  });
  for (const k of [...air.keys()]) { const [x, y, z] = k.split(',').map(Number); if (w.has(x, y, z)) air.delete(k); }
  return { world: w, origin: [ox, oz], air: (x, y, z) => air.has(x + ',' + y + ',' + z), info: out };
}

// The pack: the link's tiles, a function to load them from the first city's marker (by its
// tag), another at the first city's spot's coordinates when they are known.
export async function linkPack(plan, opts) {
  const { ns, ctag, drop, spot, nameA, nameB, deflateRaw } = opts;
  const L = buildLink(plan), w = L.world, size = 64;
  const groups = new Map();
  w.forEach((x, y, z, id) => {
    const k = Math.floor(x / size) + ',' + Math.floor(z / size);
    if (!groups.has(k)) groups.set(k, { keys: [], ids: [], x0: x, x1: x, y0: y, y1: y, z0: z, z1: z });
    const g = groups.get(k);
    g.keys.push(VoxelWorld.key(x, y, z)); g.ids.push(id);
    g.x0 = Math.min(g.x0, x); g.x1 = Math.max(g.x1, x); g.y0 = Math.min(g.y0, y); g.y1 = Math.max(g.y1, y + LINK.clear); g.z0 = Math.min(g.z0, z); g.z1 = Math.max(g.z1, z);
  });
  const structures = [];
  let t = 0;
  for (const g of groups.values()) {
    const box = { x0: g.x0, y0: g.y0, z0: g.z0, x1: g.x1, y1: g.y1, z1: g.z1 };
    const res = writeMcStructure(g.keys, g.ids, box, MATERIALS, { airAt: L.air, domeAirId: MAT.AIR, deflateRaw });
    structures.push({ name: `l${t++}`, data: res.data, offset: [box.x0 + L.origin[0], box.y0, box.z0 + L.origin[1]] });
  }
  const rel = (v) => (v === 0 ? '~' : `~${v}`);
  const loads = structures.map((s) => `execute at @e[type=armor_stand,tag=${ctag},c=1] run structure load ${ns}:${s.name} ${rel(s.offset[0])} ${rel(s.offset[1] - drop)} ${rel(s.offset[2])}`);
  // (failing the tag, the marker by its name: a marker made by another export of the city)
  if (opts.anchor) for (const s of structures) loads.push(`execute unless entity @e[type=armor_stand,tag=${ctag}] at @e[type=armor_stand,name=${opts.anchor},c=1] run structure load ${ns}:${s.name} ${rel(s.offset[0])} ${rel(s.offset[1] - drop)} ${rel(s.offset[2])}`);
  const files = [{ name: `functions/${ns}/build.mcfunction`, data: [
    `# Polis: the link from ${nameA}'s bridge to ${nameB}'s, loaded from ${nameA}'s build_centered marker (its armor stand).`,
    '# Stand near the middle of the link with a good render distance: only loaded chunks are filled.',
    `say Polis: linking ${nameA}'s bridge to ${nameB}'s...`,
    ...loads,
    `execute unless entity @e[type=armor_stand,tag=${ctag}]${opts.anchor ? ` unless entity @e[type=armor_stand,name=${opts.anchor}]` : ''} run say Polis: ${nameA}'s centre marker was not found (too far away to be loaded, or the city was built from an older pack). Go nearer to it and try again${spot ? `, or run /function ${ns}/build_at` : ''}.`,
    `execute if entity @e[type=armor_stand,tag=${ctag}] run say Polis: the link is in (${plan.length} long, ${plan.turns} turns).`,
    ...(opts.anchor ? [`execute unless entity @e[type=armor_stand,tag=${ctag}] if entity @e[type=armor_stand,name=${opts.anchor}] run say Polis: the link is in (${plan.length} long, ${plan.turns} turns; ${nameA}'s marker found by its name).`] : []),
  ].join('\n') + '\n' }];
  if (spot) files.push({ name: `functions/${ns}/build_at.mcfunction`, data: [
    `# Polis: the link, at its own coordinates (${nameA}'s build spot at ${spot.join(' ')}). Run from anywhere near it.`,
    ...structures.map((s) => `structure load ${ns}:${s.name} ${spot[0] + s.offset[0]} ${spot[1] + s.offset[1] - drop} ${spot[2] + s.offset[2]}`),
    `say Polis: the link is in (${plan.length} long, ${plan.turns} turns).`,
  ].join('\n') + '\n' });
  const guide = [
    'POLIS — a link between two bridges', '',
    `From ${nameA}'s bridge to ${nameB}'s: ${plan.length} blocks of deck, ${plan.turns} turns, ${Math.abs(plan.rise)} blocks ${plan.rise >= 0 ? 'up' : 'down'} along the way.`, '',
    `Stand on ${nameA}'s build spot (its armor stand marker), or anywhere near enough for it to be loaded, and run:`, '',
    `    /function ${ns}/build`, '',
    ...(spot ? [`Or, from anywhere near the link: /function ${ns}/build_at (it loads at ${nameA}'s spot ${spot.join(' ')}).`, ''] : []),
    'Only loaded chunks are filled: stand near the middle of the link and raise your render distance.',
  ].join('\n');
  const data = await buildMcPack(structures, { namespace: ns, packName: `Polis link ${nameA} - ${nameB}`, description: `/function ${ns}/build from ${nameA}'s marker`, guide, files, deflateRaw });
  return { data, structures, functions: files, guide, info: L.info };
}
