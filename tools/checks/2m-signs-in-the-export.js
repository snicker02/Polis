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

export const id = "2m";
export const label = "2m. signs in the export";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const r = generateCity({ ...DEFAULTS, size: 160, seed: 12345 });
  const structs = buildStructures(r.world, { prefix: 'c', fillAir: true });
  const found = new Map();
  let typedOk = true;
  for (const st of structs) {
    const t = decodeTyped(st.data);
    const pal = t.v.structure.v.palette.v.default.v;
    for (const [, cell] of Object.entries((pal.block_position_data || { v: {} }).v)) {
      const be = cell.v.block_entity_data;
      if (!be || be.v.id.v !== 'Sign') continue;
      const ft = be.v.FrontText.v;
      found.set(ft.Text.v, be);
      // the field types, exactly as in a sign saved in game
      const want = { FilteredText: 8, HideGlowOutline: 1, IgnoreLighting: 1, PersistFormatting: 1, SignTextColor: 3, Text: 8, TextOwner: 8 };
      for (const [k, tt] of Object.entries(want)) if (!ft[k] || ft[k].t !== tt) typedOk = false;
      if (be.v.IsWaxed.t !== 1 || be.v.BlockEntityVersion.t !== 3 || be.v.x.t !== 3) typedOk = false;
    }
  }
  const names = r.landmarks.map((l) => LANDMARK_NAMES[l.kind]);
  check('export: every landmark\'s sign reaches the structure file with its text', names.every((n) => found.has(n)), [...found.keys()].join(', '));
  check('export: sign fields typed exactly as a sign saved in game', typedOk && found.size > 0);
  note(`${found.size} signs in the structure files: ${[...found.keys()].join(', ')}`);
}
