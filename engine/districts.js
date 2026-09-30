// engine/districts.js — a city of several styles, one to a district.
//
// The ticked styles are shared out among districts: seed points spread evenly
// over the city (best-candidate sampling), and every place belongs to the
// nearest seed, measured through a gentle noise warp so the borders wander the
// way old quarters do instead of running ruler-straight. There are more
// districts in a bigger city (about one to every 72 x 72 blocks) and at least
// one for every ticked style, so every chosen style turns up. The district at
// the heart of the city takes the base style (the one in the Style menu) when
// it is ticked.
//
// A lot takes the style of the district its middle stands in, and the whole
// lot is painted with it: a building is never split between two styles, and
// the ground under it is restyled by its own style. Streets and open ground go
// by the district map.
//
// What a district decides is the look: palettes and themes, building dress
// (pointed windows, eave skirts, Art Deco fins and crowns, pagodas, cottages),
// the street and ground materials, landmark palettes, torii in parks, cacti,
// paintings or not, the light set into the floor. What shapes the whole city
// (canals for streets, a fortress wall, floor height, setbacks, a village's low
// buildings) stays with the base style.

import { makeRng, fbm2 } from './rng.js';

const AREA_PER_DISTRICT = 72 * 72;
const WARP = 16;

export function planStyleDistricts(plan, cfg, names, base) {
  const { W, D, lots } = plan;
  const n = names.length;
  const rng = makeRng((cfg.seed ^ 0xd157c7) >>> 0);
  const K = Math.max(n, Math.min(n * 3, Math.round((W * D) / AREA_PER_DISTRICT)));
  // seeds spread evenly: of a few candidates, the one furthest from those placed
  const seeds = [];
  for (let i = 0; i < K; i++) {
    let best = null, bestD = -1;
    for (let c = 0; c < 24; c++) {
      const x = rng() * W, z = rng() * D;
      const d = seeds.length ? Math.min(...seeds.map((s) => Math.hypot(s.x - x, s.z - z))) : Infinity;
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    seeds.push(best);
  }
  const s1 = (cfg.seed ^ 0x3a51) | 0, s2 = (cfg.seed ^ 0x77d1) | 0;
  const voronoi = (x, z) => {
    const qx = x + WARP * (fbm2(x, z, s1, 44) - 0.5) * 2, qz = z + WARP * (fbm2(x, z, s2, 44) - 0.5) * 2;
    let best = 0, bd = Infinity;
    for (let i = 0; i < seeds.length; i++) { const d = (seeds[i].x - qx) ** 2 + (seeds[i].z - qz) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  // Every ticked style gets buildings, not just ground: the districts with the
  // most lots are handed out first, one to each style (in a shuffled order),
  // and the rest go round again.
  const lotsIn = new Array(K).fill(0);
  for (const l of lots) lotsIn[voronoi((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)]++;
  const order = rng.shuffle(names.slice());
  const byLots = seeds.map((s, i) => i).sort((a, b) => lotsIn[b] - lotsIn[a] || a - b);
  byLots.forEach((si, k) => { seeds[si].style = order[k % n]; });
  // the heart of the city takes the base style, when it is one of them
  if (base && names.includes(base)) {
    const [fx, fz] = plan.focal;
    const heart = seeds.reduce((a, s) => (Math.hypot(s.x - fx, s.z - fz) < Math.hypot(a.x - fx, a.z - fz) ? s : a));
    if (heart.style !== base) {
      const other = seeds.find((s) => s.style === base);
      if (other) other.style = heart.style;
      heart.style = base;
    }
  }
  // the map over the plan, lots painted whole with their middle's style
  const grid = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) grid[z * W + x] = voronoi(x, z);
  const lotSeed = new Map();
  for (const l of lots) {
    const si = voronoi((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2);
    lotSeed.set(l, si);
    l.district = seeds[si].style;
    for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) if (x >= 0 && z >= 0 && x < W && z < D) grid[z * W + x] = si;
  }
  const at = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const si = xi >= 0 && zi >= 0 && xi < W && zi < D ? grid[zi * W + xi] : voronoi(xi, zi);
    return seeds[si].style;
  };
  const counts = {};
  for (const s of seeds) counts[s.style] = (counts[s.style] || 0) + 1;
  return { names, seeds, at, lotStyle: (l) => (lotSeed.has(l) ? seeds[lotSeed.get(l)].style : at((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)), counts };
}
