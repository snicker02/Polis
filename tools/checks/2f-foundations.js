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

export const id = "2f";
export const label = "2f. foundations";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const r = generateCity({ ...DEFAULTS, size: 128, seed: 12345, transit: 'rails' });
  const w = r.world, wb = w.box;
  for (const [F, C, air] of [[8, 32, true], [16, 64, true], [4, 0, false]]) {
    const opts = { prefix: 'c', fillAir: air, foundation: F, clearAbove: C };
    const tiles = tileList(w, opts);
    const structs = buildStructures(w, opts);
    const tag = `foundation ${F}, clear ${air ? C : '-'}`;
    let bottomOk = true, topOk = true, holes = 0, ringBad = 0, worldBad = 0, over = 0, spanned = 0, outsideTouched = 0;
    const cm = w.cityMask;
    const inCityF = (x, z) => !cm || (x >= 0 && z >= 0 && x < cm.W && z < cm.D && cm.data[z * cm.W + x] === 1);
    for (const st of structs) {
      const { root } = decodeNbt(st.data);
      const [sx, sy, sz] = root.size, [ox, oy, oz] = root.structure_world_origin;
      const pal = root.structure.palette.default.block_palette, l0 = root.structure.block_indices[0];
      if (oy !== wb.y0 - F) bottomOk = false;
      if (air && oy + sy - 1 < Math.max(wb.y1, wb.y0 + 1 + C)) topOk = false;
      spanned += sx * sz;
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
        const v = l0[(x * sy + y) * sz + z];
        const wx = ox + x, wy = oy + y, wz = oz + z;
        const inside = inCityF(wx, wz);
        if (!inside) { if (v >= 0) outsideTouched++; continue; }     // land outside the outline is left alone
        if (wy < wb.y0) {
          if (v < 0 || pal[v].name === 'minecraft:air') { holes++; continue; }
          let edge = false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inCityF(wx + dx, wz + dz)) edge = true;
          if (pal[v].name !== (edge ? 'minecraft:stone_bricks' : 'minecraft:stone')) ringBad++;
        } else {
          const id = w.get(wx, wy, wz);
          const want = id === -1 ? (air ? 'minecraft:air' : null) : MATERIALS.def(id).block;
          const got = v < 0 ? null : pal[v].name;
          if (want !== got) worldBad++;
          if (wy > wb.y1 && got !== 'minecraft:air') over++;
        }
      }
    }
    check(`${tag}: structures start ${F} blocks below the city base`, bottomOk);
    check(`${tag}: the foundation is solid, no gaps`, holes === 0, `${holes} holes`);
    check(`${tag}: stone-brick retaining face at the edge, stone inside`, ringBad === 0, `${ringBad} wrong`);
    check(`${tag}: nothing written outside the city outline`, outsideTouched === 0, `${outsideTouched} cells`);
    check(`${tag}: the city itself is unchanged above the foundation`, worldBad === 0, `${worldBad} cells differ`);
    check(`${tag}: tiles cover the whole footprint`, spanned === (wb.x1 - wb.x0 + 1) * (wb.z1 - wb.z0 + 1));
    if (air) {
      check(`${tag}: cleared to ${C} above ground (or the tallest roof)`, topOk);
      check(`${tag}: only air above the tallest roof`, over === 0, `${over} non-air`);
    }
  }
  // the id changes with the export settings, so differently-built packs never collide
  const ids = new Set([
    cityId(w, 12345, POLIS_VERSION, exportSalt({ fillAir: true, foundation: 8, clearAbove: 32 })),
    cityId(w, 12345, POLIS_VERSION, exportSalt({ fillAir: true, foundation: 0, clearAbove: 32 })),
    cityId(w, 12345, POLIS_VERSION, exportSalt({ fillAir: true, foundation: 8, clearAbove: 64 })),
    cityId(w, 12345, POLIS_VERSION, exportSalt({ fillAir: false, foundation: 8, clearAbove: 32 })),
  ]);
  check('city id: changes with air fill, foundation and clearance', ids.size === 4, [...ids].join(' '));
  check('city id: clearance ignored when air fill is off (it changes nothing)',
    exportSalt({ fillAir: false, foundation: 8, clearAbove: 32 }) === exportSalt({ fillAir: false, foundation: 8, clearAbove: 64 }));
}
