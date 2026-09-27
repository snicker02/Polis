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

export const id = "2o";
export const label = "2o. detail, shops, street names, mansion";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  let cities = 0, blockedStreet = 0, eaves = 0, balconies = 0, roofClutter = 0;
  let shops = 0, shopBad = 0, junctions = 0, signBad = 0, mansions = 0, mansionBad = 0, gardens = 0;
  const shopNames = new Set();
  for (const [size, seed, st] of [[160, 12345, 'modern'], [192, 1, 'medieval'], [224, 3, 'desert'], [256, 7, 'cherry']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st });
    const w = r.world, { W, D, use } = r.plan;
    cities++;
    // Nothing a building sticks out with may block the pavement beside it at
    // head height. Street furniture that belongs there is allowed.
    const STREET_FURNITURE = /(_fence|iron_bars|lantern|sea_lantern|standing_sign|wall_sign|bell)$/;
    for (const b of r.buildings) {
      const rr = b.rects[0];
      for (let x = rr.x0 - 1; x <= rr.x1 + 1; x++)
        for (let z = rr.z0 - 1; z <= rr.z1 + 1; z++) {
          if (x > rr.x0 - 1 && x < rr.x1 + 1 && z > rr.z0 - 1 && z < rr.z1 + 1) continue;   // the ring only
          if (x < 0 || z < 0 || x >= W || z >= D || use[z * W + x] !== USE.SIDEWALK) continue;
          if (r.harbourPlan && r.harbourPlan.cells.has(x + ',' + z)) continue;   // the wharf has crates on it by design
          const g = r.groundAt(x, z);
          for (const y of [g + 1, g + 2]) {
            const id = w.get(x, y, z);
            if (id >= 0 && !MATERIALS.isPassable(id) && !STREET_FURNITURE.test(MATERIALS.def(id).block)) blockedStreet++;
          }
        }
    }
    // the details themselves
    for (const b of r.buildings) {
      const top = b.rects[b.floors - 1];
      for (let x = top.x0 - 1; x <= top.x1 + 1; x++) {
        if (/_stairs$/.test(name(w, x, b.roofY, top.z0 - 1) || '')) eaves++;
        if (/_stairs$/.test(name(w, x, b.roofY, top.z1 + 1) || '')) eaves++;
      }
      for (let y = b.roofY + 1; y <= b.roofY + 3; y++)
        for (let x = top.x0; x <= top.x1; x++) for (let z = top.z0; z <= top.z1; z++) if (w.has(x, y, z)) roofClutter++;
      for (let k = 1; k < b.floors; k++) {
        const rr = b.rects[k], sy = b.floorYs[k];
        for (let x = rr.x0 - 1; x <= rr.x1 + 1; x++) for (const z of [rr.z0 - 1, rr.z1 + 1])
          if (name(w, x, sy + 1, z) === 'minecraft:oak_fence') balconies++;
      }
    }
    // shopfronts
    for (const b of r.buildings) for (const sf of (b.furniture && b.furniture.shops) || []) {
      shops++; shopNames.add(sf.name);
      const [sx, sy, sz] = sf.at;
      const d = w.getData(sx, sy, sz);
      if (name(w, sx, sy, sz) !== 'minecraft:wall_sign' || !d || d.tags.FrontText.v.Text.v !== sf.name) shopBad++;
    }
    // street names
    for (const sg of r.streets.signs) {
      junctions++;
      const [x, y, z] = sg.at;
      const d = w.getData(x, y, z);
      if (name(w, x, y, z) !== 'minecraft:standing_sign' || !d) { signBad++; continue; }
      const text = d.tags.FrontText.v.Text.v.split('\n');
      if (text.length !== 2 || !/(Ave|St)$/.test(text[0]) || !/(Ave|St)$/.test(text[1])) signBad++;
      if (use[z * W + x] !== USE.SIDEWALK) signBad++;
    }
    // the mansion
    const m = r.landmarks.find((l) => l.kind === 'mansion');
    if (m) {
      mansions++;
      if (m.garden) gardens++;
      const g = r.groundAt(m.portico[0][0], m.portico[0][1]);
      for (const [x, z] of m.portico) if (!w.has(x, g + 4, z)) mansionBad++;       // the portico roof
      const [gx, gz] = m.gate;
      if (w.has(gx, g + 1, gz)) mansionBad++;                                       // the way in through the hedge
      const v2 = verifyAll(w, [m.rec, ...m.wings]);
      if (v2.ok !== v2.total || v2.floorsReached !== v2.floorsChecked) mansionBad++;
    }
    const v = verifyAll(w, r.buildings);
    check(`${st} ${size}/${seed}: every floor and door still reachable with the detail on`,
      v.ok === v.total && v.floorsReached === v.floorsChecked && r.reach.unreached.length === 0);
  }
  check('facade detail: nothing sticking out blocks the pavement at head height', blockedStreet === 0, `${blockedStreet} blocked`);
  check('facade detail: eaves, balconies and roof clutter present', eaves > 0 && balconies > 0 && roofClutter > 0,
    `${eaves} eave blocks, ${balconies} balcony rails, ${roofClutter} roof blocks`);
  check('shopfronts: each has a wall sign with its name', shops > 0 && shopBad === 0, `${shops} shops, ${shopBad} bad`);
  check('street names: signs at junctions, two street names each, on the pavement', junctions > 0 && signBad === 0, `${junctions} signs, ${signBad} bad`);
  // narrowest streets still get named and signed (they did not before 0.4.2), and names never repeat
  {
    let worst = Infinity, dups = 0, alleysNamed = 0;
    for (const [aw, sw] of [[5, 3], [7, 5], [11, 9], [5, 5]]) for (const [size, seed] of [[160, 12345], [256, 7]]) {
      const r = generateCity({ ...DEFAULTS, size, seed, avenueWidth: aw, streetWidth: sw });
      worst = Math.min(worst, r.streets.signs.length);
      dups += r.streets.names.length - new Set(r.streets.names).size;
      alleysNamed += r.plan.corridors.filter((c) => c.kind === 'alley' && r.streets.names.includes(c.name)).length;
    }
    check('street names: signs at every street width, all names different, alleys unnamed',
      worst >= 8 && dups === 0 && alleysNamed === 0, `fewest ${worst} signs, ${dups} repeated names`);
  }
  check('mansion: in every test city, with its portico, an open gate and sound wings', mansions === cities && mansionBad === 0,
    `${mansions}/${cities}, ${mansionBad} problems`);
  note(`${shops} shopfronts (${[...shopNames].slice(0, 6).join(', ')}...) · ${junctions} street signs · ${mansions} mansions (${gardens} with formal gardens)`);
}
