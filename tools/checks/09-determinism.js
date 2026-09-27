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

export const id = "9";
export const label = "9. determinism";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const a = generateCity({ ...DEFAULTS, size: 128, seed: 555 });
  const b = generateCity({ ...DEFAULTS, size: 128, seed: 555 });
  check('same seed gives the same block count', a.stats.blocks === b.stats.blocks,
    `${a.stats.blocks} vs ${b.stats.blocks}`);
  let diff = 0;
  a.world.forEach((x, y, z, id) => { if (b.world.get(x, y, z) !== id) diff++; });
  check('same seed gives an identical world', diff === 0, `${diff} cells differ`);
  const c = generateCity({ ...DEFAULTS, size: 128, seed: 556 });
  check('different seed gives a different world', c.stats.blocks !== a.stats.blocks ||
    c.stats.buildings !== a.stats.buildings);

  const tiny = generateCity({ ...DEFAULTS, size: 128, seed: 99, budget: 20000 });
  check('budget is enforced', tiny.world.size <= 20000, String(tiny.world.size));
  check('budget overflow is reported', tiny.stats.overflow > 0, String(tiny.stats.overflow));
}
