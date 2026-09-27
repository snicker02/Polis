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

export const id = "7";
export const label = "7. greedy mesher";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const biggest = fx.biggestCity();
  // Face-area conservation: greedy merging must not change the total exposed
  // surface area, so brute-force face count == sum of merged quad areas.
  const r = generateSingle({ ...DEFAULTS, style: 'mid', floors: 4, pitch: 5, bw: 13, bd: 11, seed: 777 });
  const w = r.world;
  const tr = (id) => id >= 0 && MATERIALS.def(id).transparent;
  let brute = 0;
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const flat = (id) => id >= 0 && MATERIALS.def(id).flat;
  w.forEach((x, y, z, id) => {
    if (flat(id)) { brute++; return; }            // drawn as one top plate
    for (const [dx, dy, dz] of DIRS) {
      let nb = w.get(x + dx, y + dy, z + dz);
      if (flat(nb)) nb = -1;
      if (nb === -1 || (tr(nb) && nb !== id)) brute++;
    }
  });
  const mesh = buildMesh(w);
  let area = 0, sizeBad = 0, overfull = 0;
  for (const b of mesh.batches) {
    if (b.quads > MAX_QUADS) overfull++;
    if (b.buffer.byteLength !== b.quads * 4 * STRIDE) sizeBad++;
    const f = new Float32Array(b.buffer);
    for (let q = 0; q < b.quads; q++) {
      const o = q * 4 * (STRIDE / 4);
      const p0 = [f[o], f[o + 1], f[o + 2]];
      const p1 = [f[o + 5], f[o + 6], f[o + 7]];
      const p3 = [f[o + 15], f[o + 16], f[o + 17]];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1];
      const cy = e1[2] * e2[0] - e1[0] * e2[2];
      const cz = e1[0] * e2[1] - e1[1] * e2[0];
      area += Math.hypot(cx, cy, cz);
    }
  }
  check('mesher: batches respect the 16-bit index limit', overfull === 0, `${overfull} oversized`);
  check('mesher: buffer sizes match quad counts', sizeBad === 0, `${sizeBad} wrong`);
  check('mesher: merged area equals brute-force face count',
    Math.abs(area - brute) < 0.5, `${area} vs ${brute}`);
  check('mesher: merging actually merges', mesh.quads < brute, `${mesh.quads} quads vs ${brute} faces`);
  check('mesher: transparent batches sort last',
    mesh.batches.every((b, i, a) => !(b.transparent && a.slice(i).some((c) => !c.transparent))));
  note(`${brute.toLocaleString()} exposed faces → ${mesh.quads.toLocaleString()} quads ` +
    `(${(100 - mesh.quads / brute * 100).toFixed(1)}% fewer) in ${mesh.batches.length} batches`);

  // and it must survive a full-size city
  const big = buildMesh(biggest.world);
  check('mesher: city meshes without error', big.quads > 0);
  check('mesher: city batches sized correctly',
    big.batches.every((b) => b.buffer.byteLength === b.quads * 4 * STRIDE));
  note(`city: ${big.quads.toLocaleString()} quads, ${big.batches.length} batches, ` +
    `${(big.batches.reduce((a, b) => a + b.buffer.byteLength, 0) / 1048576).toFixed(1)} MiB, ${big.ms.toFixed(0)}ms`);
}
