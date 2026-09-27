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

export const id = "5";
export const label = "5. block registry";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  let bad = 0, stateBad = 0;
  for (let i = 0; i < MATERIALS.length; i++) {
    const d = MATERIALS.def(i);
    if (!/^minecraft:[a-z0-9_]+$/.test(d.block)) { bad++; note('bad id: ' + d.block); }
    for (const k of Object.keys(d.states)) {
      const s = d.states[k];
      if (!s || !['byte', 'int', 'string'].includes(s.type)) stateBad++;
      if (!/^[a-z0-9_:]+$/.test(k)) stateBad++;
    }
    if (d.color.some((c) => !(c >= 0 && c <= 1))) bad++;
  }
  check('registry: all block ids are flattened minecraft ids', bad === 0, `${bad} bad`);
  check('registry: all block states well typed', stateBad === 0, `${stateBad} bad`);
  note(`${MATERIALS.length} distinct block+state combinations in use`);
}
