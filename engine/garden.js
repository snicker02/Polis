// engine/garden.js — a botanical garden: a glass hall of plants from every biome,
// each on the soil it needs.
//
// Nineteen by twenty-three where the lot allows (ten beds), else fifteen by
// nineteen (eight). A hall of glass on a stone brick base, a glass roof on stone
// brick ribs, lanterns hung from the ribs over the path and every bed (the garden
// lights itself, and the city's lighting keeps out of it: a lantern set in a bed
// would take a plant's place, or a cactus's air). A path down the middle, the beds
// either side of it, each a biome, a sign at its path end:
//
//   desert       sand: cacti two high, each with air all round (a cactus beside
//                a solid block breaks), dead bushes between;
//   jungle       podzol: bamboo four high, leaves at its top, jungle saplings, a melon;
//   swamp        a pool down the bed's middle, lily pads on it; sugar cane on
//                the grass beside the water (cane needs water at its foot), blue orchids;
//   mushroom     mycelium: red and brown mushrooms (on mycelium they keep in any light);
//   the Nether   soul sand with nether wart; crimson nylium with crimson fungus
//                and roots; warped nylium with warped fungus and roots;
//   lush caves   moss: azaleas, flowering azaleas, moss carpet;
//   ocean        a basin two deep over sand: kelp, seagrass, sea pickles (each
//                stands in water: its second layer is water, wetAt, which
//                the city lifts with the ground and writes into world.wet);
//   taiga        podzol: sweet berry bushes, ferns, large ferns, spruce saplings;
//   meadow       grass: poppies, dandelions, cornflowers, daisies, alliums,
//                bluets, lilies of the valley, a torchflower, pink petals;
//   the End      end stone: chorus plants with a flower on top.
// The last two on the larger garden only. Every bed's water held in solid blocks
// laid here, and the soil under every plant the soil it needs.

import { MAT, MATERIALS, B, I, S, stairId, WEIRDO } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const GARDEN_SIZE = [19, 23];

const PLANT = { passable: true, flowable: true, transparent: true };
const soil = (name, color) => MATERIALS.add(null, 'minecraft:' + name, color, {});
const plant = (name, color, states = {}) => MATERIALS.add(null, 'minecraft:' + name, color, states, PLANT);
const SOIL = {
  sand: () => soil('sand', '#dbcf9a'), podzol: () => soil('podzol', '#6a4a2a'), grass: () => soil('grass_block', '#6a9a3a'),
  dirt: () => soil('dirt', '#7a5a3a'), mycelium: () => soil('mycelium', '#7a6a7a'), soul_sand: () => soil('soul_sand', '#5a4434'),
  crimson_nylium: () => soil('crimson_nylium', '#8a2a2a'), warped_nylium: () => soil('warped_nylium', '#2a7a6a'),
  moss: () => soil('moss_block', '#5a7a2a'), end_stone: () => soil('end_stone', '#dede9a'),
};
// each plant: what it is, and the soils it may stand on (the checks hold every plant to these)
export const PLANT_SOIL = {
  cactus: ['sand', 'cactus'], deadbush: ['sand'], bamboo: ['podzol', 'grass_block', 'dirt', 'sand', 'moss_block', 'bamboo'],
  jungle_sapling: ['podzol', 'grass_block', 'dirt', 'moss_block'], spruce_sapling: ['podzol', 'grass_block', 'dirt', 'moss_block'],
  melon_block: null, waterlily: ['water'], reeds: ['grass_block', 'dirt', 'sand', 'podzol', 'reeds'],
  blue_orchid: ['grass_block', 'dirt', 'podzol'], red_mushroom: ['mycelium', 'podzol'], brown_mushroom: ['mycelium', 'podzol'],
  nether_wart: ['soul_sand'], crimson_fungus: ['crimson_nylium'], crimson_roots: ['crimson_nylium'],
  warped_fungus: ['warped_nylium'], warped_roots: ['warped_nylium'],
  azalea: ['moss_block', 'grass_block', 'dirt'], flowering_azalea: ['moss_block', 'grass_block', 'dirt'], moss_carpet: ['moss_block'],
  kelp: ['sand', 'kelp', 'gravel', 'dirt'], seagrass: ['sand', 'gravel', 'dirt'], sea_pickle: ['sand', 'gravel', 'dirt'],
  sweet_berry_bush: ['podzol', 'grass_block', 'dirt'], fern: ['podzol', 'grass_block', 'dirt'], large_fern: ['podzol', 'grass_block', 'dirt', 'large_fern'],
  poppy: ['grass_block', 'dirt', 'podzol'], dandelion: ['grass_block', 'dirt', 'podzol'], cornflower: ['grass_block', 'dirt', 'podzol'],
  oxeye_daisy: ['grass_block', 'dirt', 'podzol'], allium: ['grass_block', 'dirt', 'podzol'], azure_bluet: ['grass_block', 'dirt', 'podzol'],
  lily_of_the_valley: ['grass_block', 'dirt', 'podzol'], torchflower: ['grass_block', 'dirt', 'podzol'], pink_petals: ['grass_block', 'dirt', 'podzol'],
  chorus_plant: ['end_stone', 'chorus_plant'], chorus_flower: ['chorus_plant', 'end_stone'],
};
const bamboo = (leaves) => plant('bamboo', '#5a8a2a', { age_bit: B(0), bamboo_leaf_size: S(leaves), bamboo_stalk_thickness: S('thick') });

export const BIOMES = ['Desert', 'Jungle', 'Swamp', 'Mushroom fields', 'Nether', 'Lush caves', 'Ocean', 'Taiga', 'Meadow', 'The End'];

export function botanicalGarden(world, lot, face, cfg, rng, G0, signTags) {
  // The hall stands on a plinth two high, its floor at G: everything of it, the
  // ocean basin's sand and the swamp pool's bed too, at or over the ground, so on a
  // fitted city it is lifted whole. (Dug below the ground, the basin's floor stayed
  // where the ground lift left it and its top went up a block: the kelp came apart.)
  const G = G0 + 2;
  let W = 0, D = 0, fr = null;
  for (const [w, d] of [[19, 23], [15, 19]]) { fr = lotFrame(lot, face, w, d); if (fr) { W = w; D = d; break; } }
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, across = fr.across, mid = (W - 1) / 2, H = 6, ROOF = G + H + 1;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const wetAt = [];                                          // (the city lifts these on fitted ground, then fills world.wet)
  // ---- the hall: a stone brick base, glass walls, a glass roof on ribs ------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G0 + 1; y <= ROOF + 2; y++) clear(u, v, y);
    if (v === 0) { put(u, v, G0, MAT.GRAVEL); continue; }
    for (let y = G0 + 1; y < G; y++) put(u, v, y, MAT.STONEBRICK);            // the plinth
    put(u, v, G, MAT.SMOOTH);
    const edge = u === 0 || u === W - 1 || v === 1 || v === D - 1;
    if (edge) { put(u, v, G + 1, MAT.STONEBRICK); for (let y = G + 2; y < ROOF; y++) put(u, v, y, (u + v) % 4 === 0 ? MAT.STONEBRICK : MAT.GLASS); }
    put(u, v, ROOF, (v - 1) % 4 === 0 || edge ? MAT.STONEBRICK : MAT.GLASS);
  }
  // the doorway, and two steps up to it: one before the hall, one in its doorway
  const up = stairId('stonebrick', WEIRDO[nameOf(back)]);
  for (let u = mid - 1; u <= mid + 1; u++) {
    for (let y = G + 1; y <= G + 3; y++) clear(u, 1, y);
    put(u, 0, G0 + 1, up);
    put(u, 1, G0 + 1, MAT.STONEBRICK); put(u, 1, G, up);
  }
  // lanterns: from the ribs over the path, and over every bed (below)
  const lanterns = [];
  const hangOn = (u, v) => { put(u, v, ROOF - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, ROOF - 1)); };
  for (let v = 5; v < D - 1; v += 4) hangOn(mid, v);

  // ---- the beds ---------------------------------------------------------------------------
  const bw = mid - 2;                                        // a bed's width, wall to path
  const rows = []; for (let v0 = 3; v0 + 2 <= D - 2; v0 += 4) rows.push(v0);
  const slots = [];
  for (const v0 of rows) for (const side of [0, 1]) slots.push({ v0, side });
  const biomes = BIOMES.slice(0, slots.length);
  const plants = [], beds = [], water = [];
  // a bed's cell: i from the wall (0) toward the path, j its row (0..2)
  const cell = (bed, i, j) => [bed.side === 0 ? 1 + i : W - 2 - i, bed.v0 + j];
  const setSoil = (bed, i, j, id) => { const [u, v] = cell(bed, i, j); put(u, v, G, id); };
  const grow = (bed, i, j, ids, opts = {}) => {
    const [u, v] = cell(bed, i, j);
    ids.forEach((id, k) => {
      const y = (opts.y0 ?? G + 1) + k;
      put(u, v, y, id);
      if (opts.wet) wetAt.push(pos(u, v, y));
      plants.push({ at: pos(u, v, y), name: MATERIALS.def(id).block.replace('minecraft:', ''), bed: beds.length, wet: !!opts.wet });
    });
  };
  const pool = (bed, cells, depth, floor) => {                // water held in: a solid ring and bottom laid here
    const inPool = new Set(cells.map(([i, j]) => i + ',' + j));
    for (const [i, j] of cells) {
      const [u, v] = cell(bed, i, j);
      for (let d = 0; d < depth; d++) { put(u, v, G - d, MAT.WATER); water.push(pos(u, v, G - d)); }
      put(u, v, G - depth, floor); put(u, v, G - depth - 1, MAT.SMOOTH);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inPool.has((i + di) + ',' + (j + dj))) continue;
        const [nu, nv] = [u + (bed.side === 0 ? di : -di), v + dj];
        for (let d = 1; d < depth; d++) put(nu, nv, G - d, MAT.STONEBRICK);   // (at G the floor or the bed's own soil holds it)
      }
    }
  };
  const all = (bed) => { const c = []; for (let i = 0; i < bw; i++) for (let j = 0; j < 3; j++) c.push([i, j]); return c; };
  slots.forEach((bed, n) => {
    const biome = biomes[n];
    bed.biome = biome;
    const fillSoil = (s) => { for (const [i, j] of all(bed)) setSoil(bed, i, j, s()); };
    switch (biome) {
      case 'Desert': {
        fillSoil(SOIL.sand);
        for (let i = 1; i < bw - 1; i += 2) grow(bed, i, 1, [plant('cactus', '#3a7a2a', { age: I(0) }), plant('cactus', '#3a7a2a', { age: I(0) })]);
        for (let i = 0; i < bw; i += 2) grow(bed, i, (i / 2) % 2 === 0 ? 0 : 2, [plant('deadbush', '#8a6a3a')]);
        break;
      }
      case 'Jungle': {
        fillSoil(SOIL.podzol);
        for (const i of [1, bw - 2]) grow(bed, i, 1, [bamboo('no_leaves'), bamboo('no_leaves'), bamboo('small_leaves'), bamboo('large_leaves')]);
        grow(bed, 0, 0, [plant('jungle_sapling', '#4a8a2a', { age_bit: B(0) })]);
        grow(bed, bw - 1, 2, [plant('jungle_sapling', '#4a8a2a', { age_bit: B(0) })]);
        grow(bed, Math.floor(bw / 2), 0, [soil('melon_block', '#6a9a2a')]);
        break;
      }
      case 'Swamp': {
        fillSoil(SOIL.grass);
        const pc = []; for (let i = 0; i < bw; i++) pc.push([i, 1]);
        pool(bed, pc, 1, SOIL.dirt());
        for (let i = 0; i < bw; i += 2) grow(bed, i, 1, [plant('waterlily', '#2a7a2a')]);
        for (let i = 0; i < bw; i += 3) grow(bed, i, 0, [plant('reeds', '#8aba5a', { age: I(0) }), plant('reeds', '#8aba5a', { age: I(0) }), plant('reeds', '#8aba5a', { age: I(0) })]);
        for (let i = 1; i < bw; i += 2) grow(bed, i, 2, [plant('blue_orchid', '#3a9ad0')]);
        break;
      }
      case 'Mushroom fields': {
        fillSoil(SOIL.mycelium);
        for (const [i, j] of all(bed)) if ((i + j) % 2 === 0) grow(bed, i, j, [plant((i + j) % 4 === 0 ? 'red_mushroom' : 'brown_mushroom', '#a03030')]);
        break;
      }
      case 'Nether': {
        for (let i = 0; i < bw; i++) { setSoil(bed, i, 0, SOIL.soul_sand()); setSoil(bed, i, 1, SOIL.crimson_nylium()); setSoil(bed, i, 2, SOIL.warped_nylium()); }
        for (let i = 0; i < bw; i++) grow(bed, i, 0, [plant('nether_wart', '#8a2a2a', { age: I(3) })]);
        for (let i = 0; i < bw; i++) grow(bed, i, 1, [plant(i % 2 ? 'crimson_roots' : 'crimson_fungus', '#a02a2a')]);
        for (let i = 0; i < bw; i++) grow(bed, i, 2, [plant(i % 2 ? 'warped_roots' : 'warped_fungus', '#2a8a7a')]);
        break;
      }
      case 'Lush caves': {
        fillSoil(SOIL.moss);
        for (const [i, j] of all(bed)) grow(bed, i, j, [plant((i + j) % 3 === 0 ? 'flowering_azalea' : (i + j) % 3 === 1 ? 'azalea' : 'moss_carpet', '#5a8a3a')]);
        break;
      }
      case 'Ocean': {
        fillSoil(SOIL.sand);
        pool(bed, all(bed), 2, SOIL.sand());
        for (const [i, j] of all(bed)) {
          const k = (i + j * 2) % 3;
          if (k === 0) grow(bed, i, j, [plant('kelp', '#2a6a3a', { kelp_age: I(0) }), plant('kelp', '#2a6a3a', { kelp_age: I(25) })], { y0: G - 1, wet: true });
          else if (k === 1) grow(bed, i, j, [plant('seagrass', '#2a8a4a', { sea_grass_type: S('default') })], { y0: G - 1, wet: true });
          else grow(bed, i, j, [plant('sea_pickle', '#6a9a2a', { cluster_count: I(3), dead_bit: B(0) })], { y0: G - 1, wet: true });
        }
        break;
      }
      case 'Taiga': {
        fillSoil(SOIL.podzol);
        for (let i = 0; i < bw; i++) {
          const k = i % 4;
          if (k === 0) grow(bed, i, 1, [plant('sweet_berry_bush', '#3a6a2a', { growth: I(3) })]);
          if (k === 1) grow(bed, i, 0, [plant('fern', '#3a7a2a')]);
          if (k === 2) grow(bed, i, 2, [plant('large_fern', '#3a7a2a', { upper_block_bit: B(0) }), plant('large_fern', '#3a7a2a', { upper_block_bit: B(1) })]);
          if (k === 3) grow(bed, i, 1, [plant('spruce_sapling', '#2a5a2a', { age_bit: B(0) })]);
        }
        break;
      }
      case 'Meadow': {
        fillSoil(SOIL.grass);
        const F = ['poppy', 'dandelion', 'cornflower', 'oxeye_daisy', 'allium', 'azure_bluet', 'lily_of_the_valley', 'torchflower'];
        let k = 0;
        for (const [i, j] of all(bed)) {
          if ((i + j) % 2) continue;
          grow(bed, i, j, [k === F.length ? plant('pink_petals', '#e0a0c0', { growth: I(3), 'minecraft:cardinal_direction': S('north') }) : plant(F[k % F.length], '#c8302a')]);
          k = (k + 1) % (F.length + 1);
        }
        break;
      }
      case 'The End': {
        fillSoil(SOIL.end_stone);
        for (let i = 1; i < bw - 1; i += 2) grow(bed, i, 1, [plant('chorus_plant', '#7a5a8a'), plant('chorus_plant', '#7a5a8a'), plant('chorus_flower', '#9a7aaa', { age: I(5) })]);
        break;
      }
    }
    // its lantern, over its middle; its sign on the path, at its middle row
    const [lu, lv] = cell(bed, Math.floor(bw / 2), 1); hangOn(lu, lv);
    const su = bed.side === 0 ? mid - 1 : mid + 1, sv = bed.v0 + 1;
    sign(su, sv, G + 1, bed.side === 0 ? neg(across) : across, biome);
    beds.push({ biome, side: bed.side, v0: bed.v0, cells: all(bed).map(([i, j]) => { const [u, v] = cell(bed, i, j); return pos(u, v, G); }) });
  });
  sign(mid, 2, G + 1, neg(back), 'Botanical garden');
  const door = at(mid, -1);
  return { kind: 'garden', ground: G0, lot, beds, plants, water, lanterns, wetAt, wide: W, noLighting: true, sideways: fr.sideways,
    door: [door[0], G0 + 1, door[1]], frame: { at, W, D, mid, ROOF, H, G } };
}
