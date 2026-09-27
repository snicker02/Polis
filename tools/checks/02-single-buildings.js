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

export const id = "2";
export const label = "2. single buildings";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
const SINGLE_CASES = [];
for (const style of ['tower', 'mid', 'house']) {
  for (const floors of [1, 2, 5, 12]) {
    for (const pitch of [4, 5, 7]) {
      SINGLE_CASES.push({ style, floors, pitch, bw: style === 'house' ? 11 : 17, bd: 13, seed: 100 + SINGLE_CASES.length });
    }
  }
}
let singleOk = 0, singleFloors = 0, singleFloorsOk = 0, minClear = 99;
for (const c of SINGLE_CASES) {
  const r = generateSingle({ ...DEFAULTS, ...c });
  const tag = `${c.style} ${c.floors}f pitch=${c.pitch}`;
  if (!check(`${tag}: built`, r.buildings.length === 1)) continue;
  const b = r.buildings[0];
  check(`${tag}: has windows`, b.windows > 0, `got ${b.windows}`);
  // interior clear height must leave room for a 2-block-tall player
  const clear = b.pitch - 1;
  minClear = Math.min(minClear, clear);
  check(`${tag}: interior >= 2 blocks tall`, clear >= 2, `clear=${clear}`);
  const v = verifyAll(r.world, r.buildings);
  singleFloors += v.floorsChecked; singleFloorsOk += v.floorsReached;
  if (check(`${tag}: all floors reachable`, v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`)) singleOk++;
}
note(`${singleOk}/${SINGLE_CASES.length} single builds fully reachable · ` +
  `${singleFloorsOk}/${singleFloors} floors · min interior clearance ${minClear}`);

// stairs disabled still has to be climbable (full blocks, 3 cells of headroom)
{
  const r = generateSingle({ ...DEFAULTS, style: 'mid', floors: 8, pitch: 5, bw: 15, bd: 13, seed: 4242, useStairs: false });
  const v = verifyAll(r.world, r.buildings);
  check('stair blocks off: still climbable', v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`);
}
}
