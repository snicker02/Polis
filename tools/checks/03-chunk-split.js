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

export const id = "3";
export const label = "3. chunk split";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const biggest = fx.biggestCity();
  const w = biggest.world;
  const chunks = splitWorld(w, CHUNK);
  const seen = new Set();
  let dup = 0, wide = 0, mismatched = 0;
  for (const c of chunks) {
    if (c.x1 - c.x0 + 1 > CHUNK || c.z1 - c.z0 + 1 > CHUNK) wide++;
    for (let i = 0; i < c.keys.length; i++) {
      const k = c.keys[i];
      if (seen.has(k)) dup++;
      seen.add(k);
      if (w.cells.get(k) !== c.ids[i]) mismatched++;
    }
  }
  check('split: every cell appears exactly once', seen.size === w.size && dup === 0,
    `${seen.size} vs ${w.size}, ${dup} duplicated`);
  check('split: no chunk exceeds 64 across', wide === 0, `${wide} oversized`);
  check('split: ids preserved', mismatched === 0, `${mismatched} wrong`);
  note(`${chunks.length} chunks covering ${w.size.toLocaleString()} blocks`);
}
