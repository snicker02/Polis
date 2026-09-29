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

export const id = "2k";
export const label = "2k. rooms";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  let buildings = 0, withRooms = 0, rooms = 0, unreached = 0, gaps = 0, badDoor = 0, blocked = 0, nearCore = 0;
  let noBed = 0, noKitchen = 0, lit = 0, landmarkRooms = 0;
  const types = {};
  for (const [size, seed, st] of [[160, 12345, 'modern'], [192, 1, 'medieval'], [224, 3, 'desert'], [128, 2, 'snowy']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st });
    const w = r.world;
    for (const b of r.buildings) {
      if (b.landmark && b.landmark !== 'school' && b.landmark !== 'mansion') { if (b.roomPlans && b.roomPlans.some(Boolean)) landmarkRooms++; continue; }
      buildings++;
      if (!b.roomPlans || !b.roomPlans.some(Boolean)) continue;
      withRooms++;
      // walk from the front door, stepping up only onto stairs (no hops)
      const passable = (x, y, z) => { const id = w.get(x, y, z); return id === -1 || MATERIALS.isPassable(id); };
      const solid = (x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
      const stand = (x, y, z) => solid(x, y - 1, z) && passable(x, y, z) && passable(x, y + 1, z);
      // (a courtyard wing that shares the block's one stair is walked over the block)
      const r0 = b.verifyBox || b.rects[0];
      const inB = (x, z) => x >= r0.x0 - 1 && x <= r0.x1 + 1 && z >= r0.z0 - 1 && z <= r0.z1 + 1;
      const key = (x, y, z) => x + ',' + y + ',' + z;
      const seen = new Set([key(...b.outside)]), q = [b.outside];
      for (let h = 0; h < q.length; h++) {
        const [x, y, z] = q[h];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (!inB(nx, nz)) continue;
          for (const ny of [y + 1, y, y - 1, y - 2, y - 3]) {
            if (ny === y + 1 && (!passable(x, y + 2, z) || !/_stairs$/.test(name(w, nx, y, nz) || ''))) continue;
            if (ny < y) { let ok = true; for (let yy = ny + 2; yy <= y + 1; yy++) if (!passable(nx, yy, nz)) ok = false; if (!ok) continue; }
            if (!stand(nx, ny, nz)) continue;
            if (!seen.has(key(nx, ny, nz))) { seen.add(key(nx, ny, nz)); q.push([nx, ny, nz]); }
            break;
          }
        }
      }
      b.roomPlans.forEach((plan, k) => {
        if (!plan) return;
        const sy = b.floorYs[k], top = sy + b.pitch - 1, y = sy + 1;
        const doorSet = new Set(plan.doors.map((d) => d.x + ',' + d.z));
        // inside walls run floor to ceiling; every door is two high with wall above it
        for (const [x, z] of plan.walls) {
          if (doorSet.has(x + ',' + z)) continue;
          for (let yy = sy + 1; yy <= top; yy++) if (!solid(x, yy, z)) gaps++;
          if (b.core && x >= b.core.x0 - 1 && x <= b.core.x1 + 1 && z >= b.core.z0 - 1 && z <= b.core.z1 + 1) nearCore++;
        }
        for (const d of plan.doors) {
          if (!/_door$/.test(name(w, d.x, sy + 1, d.z) || '') || !/_door$/.test(name(w, d.x, sy + 2, d.z) || '')) badDoor++;
          for (let yy = sy + 3; yy <= top; yy++) if (!solid(d.x, yy, d.z)) badDoor++;
          // both sides of a door are walkable
          const onWallAlongX = plan.walls.some(([a, c2]) => c2 === d.z && Math.abs(a - d.x) === 1);
          const sides = onWallAlongX ? [[d.x, d.z - 1], [d.x, d.z + 1]] : [[d.x - 1, d.z], [d.x + 1, d.z]];
          for (const [sx, sz] of sides) if (!stand(sx, y, sz)) blocked++;
        }
        for (const rm of plan.rooms) {
          rooms++; types[rm.type] = (types[rm.type] || 0) + 1;
          let reached = false, bed = false, kit = false, light = false;
          for (let z = rm.z0; z <= rm.z1; z++) for (let x = rm.x0; x <= rm.x1; x++) {
            if (seen.has(key(x, y, z))) reached = true;
            const n = name(w, x, y, z) || '';
            if (n === 'minecraft:bed') bed = true;
            if (/crafting_table|furnace|smoker/.test(n)) kit = true;
            if (name(w, x, top, z) === 'minecraft:sea_lantern' || name(w, x, top, z) === 'minecraft:lantern') light = true;
          }
          if (!reached) unreached++;
          if ((rm.type === 'bedroom' || rm.type === 'studio') && !bed) noBed++;
          if (rm.type === 'kitchen' && !kit) noKitchen++;
          if (light) lit++;
        }
      });
    }
  }
  check('rooms: most houses, shops, flats and offices are divided into rooms', withRooms >= buildings * 0.6, `${withRooms}/${buildings}`);
  check('rooms: every room can be walked to from the front door, no hops', rooms > 0 && unreached === 0, `${unreached}/${rooms} unreachable`);
  check('rooms: inside walls run floor to ceiling', gaps === 0, `${gaps} gaps`);
  check('rooms: every door is two high with wall above it', badDoor === 0, `${badDoor} bad`);
  check('rooms: nothing blocks either side of a door', blocked === 0, `${blocked} blocked`);
  check('rooms: no inside wall in the ring round the stairs', nearCore === 0, `${nearCore}`);
  check('rooms: every bedroom and studio has a bed', noBed === 0, `${noBed} without`);
  check('rooms: every kitchen has a crafting table, furnace or smoker', noKitchen === 0, `${noKitchen} without`);
  check('rooms: every room has a ceiling light', lit === rooms, `${lit}/${rooms}`);
  check('rooms: landmarks keep their open halls (the school and mansion have rooms)', landmarkRooms === 0);
  note(`${withRooms}/${buildings} buildings divided · ${rooms} rooms: ` + Object.entries(types).map(([t, n]) => `${n} ${t}`).join(', '));
}
