import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { generateCity, generateSingle, DEFAULTS } from '../../engine/city.js';
import { LIGHT } from './harness.js';
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

export const id = "2e";
export const label = "2e. perimeter wall";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const G = 1;
  let cities = 0;
  for (const [c, h] of [[{ size: 160, seed: 12345 }, 3], [{ size: 192, seed: 5, transit: 'rails' }, 3],
                        [{ size: 128, seed: 21, transit: 'trams' }, 5], [{ size: 160, seed: 8 }, 2], [{ size: 128, seed: 9 }, 0],
                        // regression: a 3-wide ring road puts the loop right behind the wall (0.2.2 lost every gate)
                        [{ size: 128, seed: 1, transit: 'rails', avenueWidth: 5, streetWidth: 3 }, 3],
                        [{ size: 96, seed: 7, transit: 'rails', avenueWidth: 5, streetWidth: 3 }, 6]]) {
    const r = generateCity({ ...DEFAULTS, ...c, wallHeight: h });
    const w = r.world, { W, D } = r.plan;
    const tag = `wall ${h} ${c.size}/${c.seed}${c.transit ? ' ' + c.transit : ''}`;
    cities++;
    // the city's actual edge: every city cell with a non-city neighbour (diagonals too)
    const inC = (x, z) => x >= 0 && z >= 0 && x < W && z < D && r.plan.mask[z * W + x] === 1;
    const ring = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!inC(x, z)) continue;
      let e = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inC(x + dx, z + dz)) e = true;
      if (e) ring.push([x, z]);
    }
    const isDoor = (id) => id >= 0 && /_door$/.test(MATERIALS.def(id).block);
    let gaps = 0, doors = 0;
    for (const [x, z] of ring) {
      for (let y = G; y <= G + h; y++) {
        const id = w.get(x, y, z);
        if (isDoor(id)) { doors++; continue; }
        if (id === -1 || MATERIALS.isPassable(id) || MATERIALS.def(id).flowable) gaps++;
      }
    }
    if (h === 0) {
      check(`${tag}: no wall when switched off`, !r.wall);
      continue;
    }
    check(`${tag}: wall is continuous from ground to top (water-tight)`, gaps === 0, `${gaps} gaps`);
    check(`${tag}: top course is solid all the way round`,
      ring.every(([x, z]) => { const id = w.get(x, G + h, z); return id >= 0 && !MATERIALS.isPassable(id); }));
    if (h >= 3) {
      check(`${tag}: a double-door gate on every side`, r.wall.gates.length === 4 && doors === 16, `${r.wall.gates.length} gates, ${doors} door halves`);
      let badGate = 0;
      for (const g of r.wall.gates) {
        const [[ax, az], [bx, bz]] = g.cells;
        const da = MATERIALS.def(w.get(ax, G + 1, az)), db = MATERIALS.def(w.get(bx, G + 1, bz));
        if (da.states['minecraft:cardinal_direction'].value !== db.states['minecraft:cardinal_direction'].value) badGate++;
        if (da.states.door_hinge_bit.value === db.states.door_hinge_bit.value) badGate++;
        for (const [ix, iz] of g.inside) {
          const floor = w.get(ix, G, iz), f1 = w.get(ix, G + 1, iz), f2 = w.get(ix, G + 2, iz);
          if (floor === -1 || (f1 !== -1 && !MATERIALS.isPassable(f1)) || f2 !== -1) badGate++;
        }
      }
      check(`${tag}: gates are proper double doors with a clear way in`, badGate === 0, `${badGate} problems`);
    } else {
      check(`${tag}: walls under 3 high have no gates (step over)`, r.wall.gates.length === 0);
    }
    const v = verifyAll(w, r.buildings);
    check(`${tag}: every building floor still reachable`, v.floorsReached === v.floorsChecked);
    const onRing = new Set(ring.map(([x, z]) => x + ',' + z));
    check(`${tag}: golems never stand on the wall`, r.spawns.filter((p) => p.type === 'golem').every((p) => !onRing.has(p.x + ',' + p.z)));
    // water-tightness in the sense that matters: no city cell inside the wall
    // touches the outside, even diagonally
    let leak = 0;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!inC(x, z) || onRing.has(x + ',' + z)) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inC(x + dx, z + dz)) leak++;
    }
    check(`${tag}: every cell inside the wall is enclosed by it`, leak === 0, `${leak}`);
  }
  // gates across every size and street width
  let combos = 0, missing = 0;
  for (const size of [64, 96, 128, 160, 192, 256]) for (const [aw, sw] of [[7, 5], [5, 3], [9, 7], [3, 3]]) for (const transit of ['roads', 'rails']) {
    combos++;
    const r = generateCity({ ...DEFAULTS, ...LIGHT, size, seed: size + aw, transit, avenueWidth: aw, streetWidth: sw, wallHeight: 4 });   // (gates: the plan and the wall)
    if (r.wall.gates.length !== 4) missing++;
  }
  check('wall: four gates at every city size and street width', missing === 0, `${missing}/${combos} cities short of gates`);
  note(`${cities} cities checked in full, ${combos} more for gates: continuous water-tight ring, a gate on every side`);
}
