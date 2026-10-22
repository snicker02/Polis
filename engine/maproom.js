// engine/maproom.js — the Map Room (0.81.0): a hall with a map of the whole city laid out in
// blocks on its floor, and a gallery round it to look down on it from.
//
// (A filled map item hung in the town hall cannot be made: a map's picture is kept in the
// world's own save, apart from any structure, and a map item brought in by a structure shows
// nothing. So the map is built, in blocks.)
//
// - the hall filling its lot: walls of stone brick with quartz at the
//   corners and windows high up, a flat roof (lit), its doors in the middle of the front;
// - inside, round the walls, a walk on the floor two wide; over it a gallery four up, a rail on
//   its inner edge; a flight of four steps up to it beside the doors, along the front wall;
// - the map: the rest of the floor, the city drawn on it at as many blocks to the cell as it takes
//   to fit (city.js: paintMap, once the whole city stands), north to the north. Each cell the
//   colour of what most of its ground is: the streets grey, buildings by height (white the
//   towers, light grey the middling, terracotta the houses), parks lime, squares andesite, water
//   blue, the landmarks yellow, the town hall gold, and this hall red: you are here;
// - a key on signs along the gallery's back wall; lanterns hung under the roof.

import { MAT, MATERIALS, stairId, WEIRDO, wallSignId } from './materials.js';
import { OUTWARD } from './building.js';
import { USE } from './plan.js';
import { USE_CANAL } from './water.js';

export const MAPROOM = { H: 8, GALLERY: 4, MIN: 17 };
const mat = (b, c) => MATERIALS.add(null, 'minecraft:' + b, c, {});
export const MAP_KEY = {
  here: ['red_concrete', '#8e2121', 'red: you are here'], hall: ['gold_block', '#f4d44a', 'gold: the town hall'],
  landmark: ['yellow_concrete', '#f1af15', 'yellow: landmarks'], tower: ['white_concrete', '#cfd5d6', 'white: towers'],
  mid: ['light_gray_concrete', '#7d7d73', 'light grey: buildings'], house: ['hardened_clay', '#985e43', 'terracotta: houses'],
  water: ['blue_concrete', '#2d2f8f', 'blue: water'], road: ['gray_concrete', '#36393d', 'grey: streets'],
  park: ['lime_concrete', '#5ea918', 'lime: parks'], plaza: ['polished_andesite', '#848685', 'andesite: squares'],
  ground: ['moss_block', '#596e2d', 'moss: open ground'], outside: ['green_concrete', '#495b24', 'green: beyond the town'],
};
const WEIGHT = { here: 100, hall: 50, landmark: 4, tower: 3, mid: 2, house: 1.5, water: 1.5, road: 1, park: 1, plaza: 1, ground: 0.8, outside: 0.8 };

export function mapRoom(world, lot, face, cfg, rng, G, signTags) {
  const [Fx, Fz] = OUTWARD[face];
  const Wr = { x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1 };                          // the walls, on the lot's edge
  const I = { x0: Wr.x0 + 1, z0: Wr.z0 + 1, x1: Wr.x1 - 1, z1: Wr.z1 - 1 };               // inside
  if (I.x1 - I.x0 < 10 || I.z1 - I.z0 < 10) return null;
  const M = { x0: I.x0 + 2, z0: I.z0 + 2, x1: I.x1 - 2, z1: I.z1 - 2 };                   // the map
  const H = MAPROOM.H, Y = G + MAPROOM.GALLERY;
  const ringOf = (R, x, z) => x === R.x0 || x === R.x1 || z === R.z0 || z === R.z1;
  const inR = (R, x, z) => x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;
  // the lot paved, cleared
  for (let x = lot.x0; x <= lot.x1; x++) for (let z = lot.z0; z <= lot.z1; z++) {
    world.set(x, G, z, MAT.SMOOTH);
    for (let y = G + 1; y <= G + H + 4; y++) world.clear(x, y, z);
  }
  // the walls, the roof
  const corner = (x, z) => (x === Wr.x0 || x === Wr.x1) && (z === Wr.z0 || z === Wr.z1);
  for (let x = Wr.x0; x <= Wr.x1; x++) for (let z = Wr.z0; z <= Wr.z1; z++) {
    if (ringOf(Wr, x, z)) {
      const along = x === Wr.x0 || x === Wr.x1 ? z - Wr.z0 : x - Wr.x0;
      for (let y = G + 1; y <= G + H; y++) world.set(x, y, z, corner(x, z) ? MAT.QUARTZ_PILLAR : (y >= Y + 2 && y <= G + H - 1 && along % 3 === 1 ? MAT.GLASS : MAT.STONEBRICK));
      world.set(x, G + H + 2, z, corner(x, z) ? MAT.CHISELED_QUARTZ : MAT.STONEBRICK);         // the parapet
    } else world.set(x, G, z, MAT.POL_BLACKSTONE || MAT.STONEBRICK);
    world.set(x, G + H + 1, z, MAT.SMOOTH_QUARTZ);
  }
  const lights = [];
  for (let x = Wr.x0 + 3; x <= Wr.x1 - 2; x += 6) for (let z = Wr.z0 + 3; z <= Wr.z1 - 2; z += 6) { world.set(x, G + H + 1, z, MAT.SEA_LANTERN); lights.push([x, G + H + 1, z]); }
  // the doors: three wide in the middle of the front wall
  const mx = Math.floor((Wr.x0 + Wr.x1) / 2), mz = Math.floor((Wr.z0 + Wr.z1) / 2);
  const front = (k) => (Fx ? [Fx > 0 ? Wr.x1 : Wr.x0, mz + k] : [mx + k, Fz > 0 ? Wr.z1 : Wr.z0]);
  const R = Fx ? [0, 1] : [1, 0];                                                         // along the front wall
  const door = [];
  for (let k = -1; k <= 1; k++) { const [x, z] = front(k); for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z); world.set(x, G, z, MAT.SMOOTH); door.push([x, G + 1, z]); }
  const nm = (v) => (v[0] > 0 ? 'east' : v[0] < 0 ? 'west' : v[1] > 0 ? 'south' : 'north');
  { const [x, z] = front(0); if (!world.has(x + Fx, G + 5, z + Fz)) world.set(x + Fx, G + 5, z + Fz, wallSignId(nm([Fx, Fz]))); world.setData(x + Fx, G + 5, z + Fz, { id: 'Sign', tags: signTags('Map Room\nthe whole city\nlaid out inside') }); }
  for (const k of [-2, 2]) { const [x, z] = front(k); world.set(x, G + 3, z, MAT.SEA_LANTERN); lights.push([x, G + 3, z]); }
  // the gallery: two wide over the walk round the walls, a rail on its inner edge
  const I2 = { x0: I.x0 + 1, z0: I.z0 + 1, x1: I.x1 - 1, z1: I.z1 - 1 };
  for (let x = I.x0; x <= I.x1; x++) for (let z = I.z0; z <= I.z1; z++) {
    if (inR(M, x, z)) continue;
    world.set(x, Y, z, MAT.DARK_PLANKS || MAT.OAK);
    if (inR(I2, x, z) && ringOf(I2, x, z)) world.set(x, Y + 1, z, MAT.FENCE);
  }
  // the steps up, along the front wall from beside the doors (inside the walls, the walk's outer row)
  const inner = (k) => { const [x, z] = front(k); return [x - Fx, z - Fz]; };
  const steps = [];
  for (let i = 1; i <= MAPROOM.GALLERY; i++) {
    const [x, z] = inner(2 + i);
    const up = nm(R);
    for (let y = G + 1; y < G + i; y++) world.set(x, y, z, MAT.STONEBRICK);
    world.set(x, G + i, z, stairId('stonebrick', WEIRDO[up]));
    for (let y = G + i + 1; y <= G + i + 3; y++) world.clear(x, y, z);              // (three over each step: room to climb to the next)
    steps.push([x, G + i, z]);
  }
  // (the rail beside the top of the flight opened, so the gallery is stepped onto)
  { const [x, z] = inner(2 + MAPROOM.GALLERY + 1); world.clear(x, Y + 1, z); }
  // the lanterns hung under the roof, every four
  for (let x = I.x0 + 1; x <= I.x1 - 1; x += 4) for (let z = I.z0 + 1; z <= I.z1 - 1; z += 4) {
    if (world.has(x, G + H, z)) continue;
    world.set(x, G + H, z, MAT.LAMP_HANG); lights.push([x, G + H, z]);
  }
  // the key: signs along the back wall at the gallery, and which way is north
  const back = (k) => (Fx ? [Fx > 0 ? Wr.x0 + 1 : Wr.x1 - 1, mz + k] : [mx + k, Fz > 0 ? Wr.z0 + 1 : Wr.z1 - 1]);
  const keys = Object.values(MAP_KEY).map((q) => q[2]);
  const key = [];
  const per = 3, n = Math.ceil(keys.length / per);
  for (let j = 0; j < n; j++) {
    const [x, z] = back(j - Math.floor(n / 2));
    const y = Y + 2;
    if (world.has(x, y, z)) continue;
    world.set(x, y, z, wallSignId(nm([Fx, Fz])));
    world.setData(x, y, z, { id: 'Sign', tags: signTags(keys.slice(j * per, j * per + per).join('\n')) });
    key.push([x, y, z]);
  }
  { const [x, z] = back(Math.ceil(n / 2) + 1); if (!world.has(x, Y + 2, z)) { world.set(x, Y + 2, z, wallSignId(nm([Fx, Fz]))); world.setData(x, Y + 2, z, { id: 'Sign', tags: signTags('The city map\nnorth is ' + (Fz < 0 ? 'ahead of you' : Fz > 0 ? 'behind you' : Fx > 0 ? 'to your left' : 'to your right') + '\nas the city lies') }); key.push([x, Y + 2, z]); } }
  const [vx, vz] = front(0);
  return { kind: 'maproom', lot, rec: null, face, map: M, floorY: G, gallery: Y, steps, door, key, lights, visit: [vx + Fx * 2, G + 1, vz + Fz * 2], visitLook: [mx, G + 2, mz] };
}

// The map itself, once the whole city stands: each cell the colour of most of its ground.
export function paintMap(world, L, plan, buildings, landmarks, GROUND, elevAt) {
  const { W, D, use, mask } = plan, M = L.map;
  const mw = M.x1 - M.x0 + 1, md = M.z1 - M.z0 + 1;
  const s = Math.max(Math.ceil(W / mw), Math.ceil(D / md));
  const cw = Math.ceil(W / s), cd = Math.ceil(D / s);
  const ox = M.x0 + Math.floor((mw - cw) / 2), oz = M.z0 + Math.floor((md - cd) / 2);
  const y = GROUND + elevAt(Math.floor((M.x0 + M.x1) / 2), Math.floor((M.z0 + M.z1) / 2));
  // what each column of the city is
  const NAMES = Object.keys(MAP_KEY), idx = Object.fromEntries(NAMES.map((k, i) => [k, i]));
  const cat = new Uint8Array(W * D);
  const water = (x, z) => { const i = world.get(x, GROUND + elevAt(x, z), z); return i >= 0 && /water/.test(MATERIALS.def(i).block); };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, u = use[i];
    let c = mask && !mask[i] ? 'outside' : u === USE.ROAD || u === USE.SIDEWALK ? 'road' : u === USE.PARK ? 'park' : u === USE.PLAZA ? 'plaza' : u === USE_CANAL ? 'water' : 'ground';
    if (c !== 'outside' && c !== 'road' && water(x, z)) c = 'water';
    cat[i] = idx[c];
  }
  const fill = (r, c) => { for (let z = Math.max(0, r.z0); z <= Math.min(D - 1, r.z1); z++) for (let x = Math.max(0, r.x0); x <= Math.min(W - 1, r.x1); x++) cat[z * W + x] = idx[c]; };
  for (const b of buildings) fill(b, b.floors >= 10 ? 'tower' : b.floors >= 4 ? 'mid' : 'house');
  for (const q of landmarks) if (q.lot && q.lot.x1 < W && q.lot.z1 < D && q.lot.x0 >= 0 && q.lot.z0 >= 0) fill(q.lot, q === L ? 'here' : q.kind === 'townhall' ? 'hall' : 'landmark');
  // each cell of the map: the weightiest of what lies under it
  const ids = NAMES.map((k) => mat(MAP_KEY[k][0], MAP_KEY[k][1]));
  const W8 = NAMES.map((k) => WEIGHT[k]);
  const cells = [];
  const counts = new Float64Array(NAMES.length), raw = new Float64Array(NAMES.length);
  for (let j = 0; j < cd; j++) for (let i = 0; i < cw; i++) {
    counts.fill(0); raw.fill(0);
    let n = 0;
    for (let z = j * s; z < Math.min(D, (j + 1) * s); z++) for (let x = i * s; x < Math.min(W, (i + 1) * s); x++) { const c = cat[z * W + x]; counts[c] += W8[c]; raw[c]++; n++; }
    let best = 0; for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
    // (a canal is narrow beside the blocks it runs between: a sixth of a cell's ground water and
    // the cell is water, unless a landmark has more of it)
    if (raw[idx.water] >= n / 6 && !['here', 'hall', 'landmark'].includes(NAMES[best])) best = idx.water;
    const x = ox + i, z = oz + j;
    world.set(x, y, z, ids[best]);
    cells.push({ x, z, kind: NAMES[best] });
  }
  return { scale: s, cells, origin: [ox, y, oz], size: [cw, cd] };
}
