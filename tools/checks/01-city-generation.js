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

export const id = "1";
export const label = "1. city generation";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
for (const { cfg, r, gen } of fx.cityCases()) {
  const tag = `size=${cfg.size} seed=${cfg.seed}`;

  check(`${tag}: buildings exist`, r.stats.buildings > 0, `got ${r.stats.buildings}`);
  check(`${tag}: windows exist`, r.stats.windows > 0, `got ${r.stats.windows}`);
  check(`${tag}: within block budget`, r.stats.overflow === 0, `${r.stats.overflow} dropped`);

  // bounds
  let outOfRange = 0;
  r.world.forEach((x, y, z) => { if (!r.world.inRange(x, y, z)) outOfRange++; });
  check(`${tag}: all cells in range`, outOfRange === 0, `${outOfRange} bad`);

  // buildings never sit on a street or pavement
  const at = (x, z) => z * r.plan.W + x;
  let onStreet = 0, offPlan = 0;
  for (const b of r.buildings) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (x < 0 || z < 0 || x >= r.plan.W || z >= r.plan.D) { offPlan++; continue; }
        const u = r.plan.use[at(x, z)];
        if (u === USE.ROAD || u === USE.SIDEWALK) onStreet++;
      }
    }
  }
  check(`${tag}: no building on a street`, onStreet === 0, `${onStreet} cells`);
  check(`${tag}: no building off the plan`, offPlan === 0, `${offPlan} cells`);

  // every door has somewhere to stand outside it
  let badDoor = 0;
  const solid = (x, y, z) => {
    const id = r.world.get(x, y, z);
    return id !== -1 && !MATERIALS.isPassable(id);
  };
  for (const b of r.buildings) {
    const [ox, oy, oz] = b.outside;
    const ok = !solid(ox, oy, oz) && !solid(ox, oy + 1, oz) && solid(ox, oy - 1, oz);
    if (!ok) badDoor++;
  }
  check(`${tag}: doors open onto standable ground`, badDoor === 0, `${badDoor} blocked`);

  // stairs: every floor reachable from the pavement
  const t1 = Date.now();
  const v = verifyAll(r.world, r.buildings);
  const ver = Date.now() - t1;
  check(`${tag}: every building enterable`, v.ok === v.total, `${v.ok}/${v.total}`);
  check(`${tag}: every floor reachable`, v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`);

  note(`${tag}: ${r.stats.blocks.toLocaleString()} blocks · ${r.stats.buildings} buildings ` +
    `(${r.stats.houses}h/${r.stats.mids}m/${r.stats.towers}t) · tallest ${r.stats.tallest}f · ` +
    `${v.floorsReached}/${v.floorsChecked} floors · gen ${gen}ms verify ${ver}ms`);
}
}
