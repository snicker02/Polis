import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { generateCity, generateSingle, DEFAULTS } from '../../engine/city.js';
import { USE } from '../../engine/plan.js';
import { verifyAll, verifyBuilding } from '../../engine/verify.js';
import { MATERIALS, THEMES, DOOR_KINDS, doorId, MAT, BED_VEC, stairId, cropId, CROP_KINDS, bedId, furnaceId, railId, poweredRailId,
  gateId, chestId, lecternId, smokerId, stonecutterId, pumpkinId, loomId, grindstoneId, bambooId, FLOWERS } from '../../engine/materials.js';
import { BLOCK_VERSION } from '../../engine/blockcore.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK, exportPack, tileList, functionFiles, GROUND_DROP, cityId, exportSalt, POLIS_VERSION, SUMMON_IDS } from '../../engine/export.js';
import { buildMesh, MAX_QUADS, STRIDE } from '../../engine/mesher.js';
import { decodeNbt, readZip, localPayload } from '../nbt-read.js';
import { decodeTyped } from '../nbt-typed.js';
import { walkCity } from '../../engine/terrain.js';
import { CLOCK_FACE, LANDMARK_NAMES } from '../../engine/landmarks.js';
import { STYLES, remapTable } from '../../engine/styles.js';
import { CAT_COATS, SHEEP_COATS, PAINTING_MOTIFS } from '../../engine/entity-templates.js';

export const id = "2x";
export const label = "2x. village style";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  let tall = 0, towers = 0, cities = 0, farms = 0, houses = 0, all = 0, oaky = 0;
  for (const [size, seed] of [[192, 7], [160, 3], [256, 12]]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: 'village' });
    cities++;
    farms += r.stats.farms;
    for (const b of r.buildings) {
      if (b.landmark) continue;                       // a church tower or lighthouse may rise
      all++;
      if (b.style === 'house') houses++;
      if (b.style === 'tower') towers++;
      if (b.floors > 3) tall++;
    }
    // it should read as a village: oak, cobble, hay, dirt paths
    const counts = new Map();
    r.world.forEach((x, y, z, id) => {
      const n = MATERIALS.def(id).block;
      counts.set(n, (counts.get(n) || 0) + 1);
    });
    const village = ['minecraft:oak_planks', 'minecraft:cobblestone', 'minecraft:grass_path', 'minecraft:oak_log', 'minecraft:white_concrete'];
    if (village.filter((n) => (counts.get(n) || 0) > 100).length >= 3) oaky++;
  }
  check('village: nothing above three storeys but the landmarks', tall === 0 && towers === 0, `${tall} too tall, ${towers} towers`);
  check('village: mostly cottages', houses > all * 0.4, `${houses} of ${all} are houses`);
  check('village: more ground is worked than in a town', farms >= cities * 3, `${farms} farms across ${cities} villages`);
  check('village: built of the materials a village is built of', oaky === cities, `${oaky}/${cities}`);
  {
    const r = generateCity({ ...DEFAULTS, size: 192, seed: 7, cityStyle: 'village' });
    const w = r.world;
    let footings = 0, posts = 0, eaves = 0, cottages = 0;
    for (const b of r.buildings) {
      if (b.style !== 'house' || b.landmark) continue;
      cottages++;
      // the footing course all round: every cell of plain wall has become stone
      // (a doorway is skipped, and a timber-framed theme keeps its posts and logs)
      let stone = 0, plainLeft = 0;
      for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
        if (x !== b.x0 && x !== b.x1 && z !== b.z0 && z !== b.z1) continue;
        const id = w.get(x, b.groundY + 1, z);
        if (id >= 0 && MATERIALS.def(id).block === 'minecraft:cobblestone') stone++;
        if (b.theme && id === b.theme.wall && MATERIALS.def(id).block !== 'minecraft:cobblestone') plainLeft++;
      }
      if (stone > 0 && plainLeft === 0) footings++;
      const post = w.get(b.x0, b.groundY + 2, b.z0);
      if (post >= 0 && /log|frame|planks/.test(MATERIALS.def(post).block)) posts++;
      let over = 0;
      for (let x = b.x0 - 2; x <= b.x1 + 2; x++)
        for (let z = b.z0 - 2; z <= b.z1 + 2; z++) {
          if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) continue;
          for (let y = b.roofY; y <= b.roofY + 4; y++) if (w.has(x, y, z)) { over++; break; }
        }
      if (over > 10) eaves++;
    }
    check('village: cottages have stone footings, corner posts and eaves that hang over',
      cottages > 0 && footings > cottages * 0.7 && posts > cottages * 0.7 && eaves > cottages * 0.7,
      `${cottages} cottages · ${footings} footed · ${posts} posted · ${eaves} with eaves`);
    check('village: the ground rolls', r.stats.hillBlocks >= 15, `${r.stats.hillBlocks} raised blocks`);
  }
  const set = generateCity({ ...DEFAULTS, size: 160, seed: 3, cityStyle: 'village', farmChance: 0 });
  check('village: a deliberate setting still wins', set.stats.farms === 0);
  note(`${cities} villages · ${houses}/${all} cottages · ${farms} farms`);
}
