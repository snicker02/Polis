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

export const id = "2q";
export const label = "2q. paintings";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  let cities = 0, hung = 0, badWall = 0, badSpace = 0, badPos = 0, badDir = 0, sizes = new Set();
  const NORMAL = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };     // Direction: south, west, north, east
  for (const [size, seed, st] of [[160, 12345, 'modern'], [192, 1, 'medieval'], [224, 3, 'desert'], [256, 7, 'cherry']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st });
    const w = r.world;
    cities++;
    for (const p of r.spawns.filter((q) => q.type === 'painting')) {
      hung++;
      const m = PAINTING_MOTIFS.find((q) => q.motif === p.motif);
      if (!m) { badPos++; continue; }
      sizes.add(`${m.w}x${m.h}`);
      const [nx, nz] = NORMAL[p.direction];
      for (let i = 0; i < m.w; i++)
        for (let j = 0; j < m.h; j++) {
          const x = p.x + (nx ? 0 : i), y = p.y + j, z = p.z + (nx ? i : 0);
          if (w.has(x, y, z)) badSpace++;                              // the painting needs the space clear
          const bx = x - nx, bz = z - nz;
          const id = w.get(bx, y, bz);
          if (id < 0 || MATERIALS.isPassable(id)) badWall++;           // and solid wall behind every block of it
        }
      // its centre sits a whisker off the face of that wall, on the room side
      const along = nx ? p.pos[0] : p.pos[2];
      if (Math.abs(along - (p.face + (nx || nz) * 0.03125)) > 1e-6) badPos++;
      // and its centre matches its size: even sides land on a block boundary
      const evenW = Math.abs((nx ? p.pos[2] : p.pos[0]) % 1) < 1e-6;
      const evenH = Math.abs(p.pos[1] % 1) < 1e-6;
      if (evenW !== (m.w % 2 === 0) || evenH !== (m.h % 2 === 0)) badDir++;
    }
  }
  check('paintings: hung in every test city', hung > 0 && cities === 4, `${hung} paintings`);
  check('paintings: solid wall behind every block of each one', badWall === 0, `${badWall}`);
  check('paintings: the space they hang in is clear', badSpace === 0, `${badSpace}`);
  check('paintings: centred a whisker off the wall face', badPos === 0, `${badPos}`);
  check('paintings: centre matches the motif size', badDir === 0, `${badDir}`);
  note(`${hung} paintings across ${cities} cities · sizes ${[...sizes].sort().join(', ')}`);
}
