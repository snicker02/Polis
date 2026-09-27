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

export const id = "2u";
export const label = "2u. nothing falls";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  // Gravel and sand fall when there is nothing under them, which on a bridge
  // means the deck drops into the water and takes the track with it. Rails
  // need something under them too.
  let falling = 0, floatingRail = 0, cities = 0, madeSafe = 0;
  for (const [size, seed, transit] of [[128, 12345, 'rails'], [160, 7, 'rails'], [192, 1, 'trams'], [224, 3, 'rails']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit });
    cities++;
    const w = r.world;
    const loose = (id) => id === -1 || MATERIALS.isPassable(id);
    w.forEach((x, y, z, id) => {
      const def = MATERIALS.def(id);
      if (!def) { falling++; return; }                       // an undefined block is a hole
      if (!/gravel|sand$/.test(def.block)) return;
      if (loose(w.get(x, y - 1, z))) falling++;
    });
    for (const line of r.transit ? r.transit.lines : [])
      for (const [x, y, z] of line.cells) {
        const id = w.get(x, y, z);
        if (id < 0 || !/rail/.test(MATERIALS.def(id).block)) continue;
        if (loose(w.get(x, y - 1, z))) floatingRail++;
      }
    madeSafe += Number((r.stats.propped || '0').split(' ')[0]) || 0;
  }
  check('nothing falls: no gravel or sand with empty space under it', falling === 0, `${falling}`);
  check('nothing falls: every rail has something under it', floatingRail === 0, `${floatingRail}`);
  // a rail needs a whole block beneath it: a dirt path, farmland, a slab or
  // snow will not hold one, and a village's streets are dirt paths
  {
    const NO_HOLD = /(grass_path|dirt_path|farmland|snow_layer|_slab|slab$|soul_sand|_fence|fence$)/;
    let weak = 0, checked = 0;
    for (const style of ['village', 'modern', 'snowy', 'medieval', 'desert', 'cherry'])
      for (const transit of ['rails', 'trams']) {
        const r = generateCity({ ...DEFAULTS, size: 128, seed: 7, cityStyle: style, transit });
        for (const line of r.transit ? r.transit.lines : [])
          for (const [x, y, z] of line.cells) {
            const id = r.world.get(x, y, z);
            if (id < 0 || !/rail/.test(MATERIALS.def(id).block)) continue;
            checked++;
            const below = r.world.get(x, y - 1, z);
            if (below < 0 || MATERIALS.isPassable(below) || NO_HOLD.test(MATERIALS.def(below).block)) weak++;
          }
      }
    check('nothing falls: every rail sits on a block that can hold it, in every style', weak === 0,
      `${weak} of ${checked} rails on ground that cannot hold track`);
  }
  note(`${madeSafe} blocks made safe across ${cities} cities`);
}
