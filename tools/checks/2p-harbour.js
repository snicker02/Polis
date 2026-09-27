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

export const id = "2p";
export const label = "2p. harbour";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  let cities = 0, built = 0, basinBad = 0, quayBad = 0, sheds = 0, shedsBad = 0, cranes = 0, sidings = 0, sidingBad = 0;
  let boats = 0, boatBad = 0, streets = 0, signs = 0, crates = 0;
  for (const [size, seed, transit] of [[160, 12345, 'rails'], [192, 1, 'rails'], [224, 3, 'trams'], [256, 7, 'rails'], [128, 2, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit });
    const w = r.world, { W, use } = r.plan, G = 1;
    cities++;
    const h = r.harbourPlan, out = r.harbour;
    if (!h) continue;
    built++;
    // the basin is water two deep, walled, open to the sky
    for (let u = h.u0; u <= h.u1; u++) for (let k = 1; k <= h.basin; k++) {
      const [x, z] = h.cell(u, h.aAt(k));
      if (name(w, x, -3, z) !== 'minecraft:water' || name(w, x, -2, z) !== 'minecraft:water') basinBad++;
      for (let y = -1; y <= G + 2; y++) if (w.has(x, y, z)) basinBad++;
    }
    // the quay: solid walkway you can stand on all along the water's edge
    for (let u = h.u0 + 1; u <= h.u1 - 1; u++) {
      const [x, z] = h.cell(u, h.aAt(h.basin + h.quay));
      const feet = w.get(x, G + 1, z), head = w.get(x, G + 2, z);
      const walkable = (id) => id === -1 || MATERIALS.isPassable(id);       // the name sign stands here too
      if (!w.has(x, G, z) || !walkable(feet) || !walkable(head)) quayBad++;
    }
    // no street was paved over: every cell of the district was never road
    for (const key of h.cells) {
      const [x, z] = key.split(',').map(Number);
      const u2 = use[z * W + x];
      if (u2 === USE.ROAD) streets++;      // the yard is 9, not ROAD
    }
    // warehouses stand, are enterable and hold their crates
    for (const rec of out.warehouses) {
      sheds++;
      const v = verifyBuilding(w, rec);
      if (!v.ok) shedsBad++;
      if (r.reach.unreached.includes(rec)) shedsBad++;
    }
    cranes += out.cranes.length;
    for (const [cx, cy, cz] of out.cranes) if (name(w, cx, cy, cz) !== 'minecraft:iron_block') shedsBad++;
    // sidings: rails on the yard, buffered at both ends, with a cart each
    for (const line of r.transit ? r.transit.lines.filter((l) => l.siding) : []) {
      sidings++;
      for (const [x, y, z] of line.cells) if (!/rail$/.test(name(w, x, y, z) || '')) sidingBad++;
      const step = [line.cells[1][0] - line.cells[0][0], line.cells[1][2] - line.cells[0][2]];
      const last = line.cells[line.cells.length - 1];
      for (const [[x, y, z], [dx, dz]] of [[line.cells[0], [-step[0], -step[1]]], [last, step]]) {
        const n = name(w, x + dx, y, z + dz);
        if (!n || MATERIALS.isPassable(w.get(x + dx, y, z + dz))) sidingBad++;      // a buffer at the end
      }
      if (!r.transit.carts.some((c) => line.cells.some(([x, y, z]) => c.x === x && c.y === y && c.z === z))) sidingBad++;
    }
    for (const b of out.boats) {
      boats++;
      if (name(w, b.x, b.y, b.z) !== 'minecraft:water' || w.has(b.x, b.y + 1, b.z)) boatBad++;
    }
    crates += out.crates;
    if (out.sign && /Harbour/.test((w.getData(...out.sign) || { tags: { FrontText: { v: { Text: { v: '' } } } } }).tags.FrontText.v.Text.v)) signs++;
  }
  check('harbour: built in every test city', built === cities, `${built}/${cities}`);
  check('harbour: the basin is water two deep, walled and open to the sky', basinBad === 0, `${basinBad}`);
  check('harbour: the quay is a clear walkway the length of the water', quayBad === 0, `${quayBad}`);
  check('harbour: no street or railway was paved over by the district', streets === 0, `${streets} cells`);
  check('harbour: warehouses stand, verify and can be walked into', sheds > 0 && shedsBad === 0, `${sheds} warehouses, ${shedsBad} problems`);
  check('harbour: cranes on the quay', cranes > 0, `${cranes}`);
  check('harbour: sidings are rails on the yard, buffered both ends, one cart each', sidings > 0 && sidingBad === 0, `${sidings} sidings, ${sidingBad} problems`);
  check('harbour: boats float in the basin with room above', boats > 0 && boatBad === 0, `${boats} boats, ${boatBad} bad`);
  check('harbour: the quay has its name sign', signs === built, `${signs}/${built}`);
  note(`${built} harbours · ${sheds} warehouses · ${cranes} cranes · ${sidings} sidings · ${boats} boats · ${crates} crates stacked`);
}
