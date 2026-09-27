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

export const id = "2h";
export const label = "2h. landmarks";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const OUT = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  let cities = 0, complete = 0, badFace = 0, faces = 0, badBell = 0, badStall = 0, stalls = 0, shelvesLow = 0, dup = 0, farAway = 0;
  for (const [size, seed, transit] of [[160, 12345, 'roads'], [192, 1, 'rails'], [128, 2, 'trams'], [224, 3, 'roads'], [96, 4, 'rails'], [256, 5, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit });
    const w = r.world, G = 1;
    cities++;
    const kinds = r.landmarks.map((l) => l.kind);
    if (['townhall', 'clocktower', 'library', 'market'].every((k) => kinds.includes(k))) complete++;
    if (new Set(kinds).size !== kinds.length) dup++;
    // the civic ones belong among the shops and offices; the school, castle,
    // lighthouse, mansion, stadium, cemetery and allotments are meant to sit
    // further out
    const CENTRAL = new Set(['townhall', 'clocktower', 'library', 'market', 'church', 'townsquare']);
    for (const l of r.landmarks) {
      if (!CENTRAL.has(l.kind)) continue;
      const d = Math.hypot((l.lot.x0 + l.lot.x1) / 2 - r.plan.focal[0], (l.lot.z0 + l.lot.z1) / 2 - r.plan.focal[1]);
      if (d > Math.max(r.plan.W, r.plan.D) * 0.45) farAway++;
    }
    // town hall bell is the village bell, standing on the forecourt
    const hall = r.landmarks.find((l) => l.kind === 'townhall');
    if (hall) {
      const [bx, by, bz] = hall.bell || [];
      if (!hall.bell || name(w, bx, by, bz) !== 'minecraft:bell' || !r.bell || r.bell.join() !== hall.bell.join() ||
          !w.has(bx, by - 1, bz) || bx < hall.lot.x0 || bx > hall.lot.x1 || bz < hall.lot.z0 || bz > hall.lot.z1) badBell++;
    }
    // clock faces read correctly from outside on all four sides
    const tower = r.landmarks.find((l) => l.kind === 'clocktower');
    if (tower) {
      for (const f of tower.faces) {
        faces++;
        const [sx, cy, sz] = f.centre, [ox, oz] = OUT[f.side], R = [oz, -ox];
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          const n = name(w, sx + (j - 2) * R[0], cy + 2 - i, sz + (j - 2) * R[1]);
          const want = { B: 'minecraft:black_concrete', G: 'minecraft:gold_block', Q: 'minecraft:smooth_quartz' }[CLOCK_FACE[i][j]];
          if (n !== want) badFace++;
        }
      }
      const [hx, hy, hz] = tower.belfryBell;
      if (name(w, hx, hy, hz) !== 'minecraft:bell' || !w.has(hx, hy + 1, hz)) badBell++;   // hangs from the roof
    }
    // market: every stall has four posts and a full wool canopy; goods in the middle
    const mkt = r.landmarks.find((l) => l.kind === 'market');
    if (mkt) for (const st of mkt.stalls) {
      stalls++;
      const G = r.groundAt(st.x0, st.z0);
      for (const [x, z] of [[st.x0, st.z0], [st.x1, st.z0], [st.x0, st.z1], [st.x1, st.z1]])
        if (name(w, x, G + 1, z) !== 'minecraft:oak_fence' || name(w, x, G + 2, z) !== 'minecraft:oak_fence') badStall++;
      for (let z = st.z0; z <= st.z1; z++) for (let x = st.x0; x <= st.x1; x++) if (!/_wool$/.test(name(w, x, G + 3, z) || '')) badStall++;
      if (!name(w, st.x0 + 1, G + 1, st.z0 + 1)) badStall++;
    }
    // library: bookshelves on every floor
    const lib = r.landmarks.find((l) => l.kind === 'library');
    if (lib) for (let k = 0; k < lib.rec.floors; k++) {
      const y = lib.rec.floorYs[k] + 1, rr = lib.rec.rects[k]; let n = 0;
      for (let z = rr.z0; z <= rr.z1; z++) for (let x = rr.x0; x <= rr.x1; x++) if (name(w, x, y, z) === 'minecraft:bookshelf') n++;
      if (n < 4) shelvesLow++;
    }
    const v = verifyAll(w, r.buildings.filter((b) => b.landmark));
    check(`landmarks ${size}/${seed}: every landmark floor reachable from its door`, v.ok === v.total && v.floorsReached === v.floorsChecked,
      `${v.floorsReached}/${v.floorsChecked}`);
  }
  check('landmarks: town hall, clock tower, library and market in every test city', complete === cities, `${complete}/${cities}`);
  check('landmarks: each appears at most once', dup === 0);
  check('landmarks: the civic ones are near downtown', farAway === 0, `${farAway} too far`);
  check('town hall: its bell is the village bell, standing in the forecourt; belfry bell hangs from the roof', badBell === 0, `${badBell}`);
  check('clock tower: all four faces read correctly from outside (hour hand at 3)', faces > 0 && badFace === 0, `${badFace} wrong cells`);
  check('market: every stall has four posts, a full canopy and goods', stalls > 0 && badStall === 0, `${badStall} problems in ${stalls}`);
  check('library: bookshelves on every floor', shelvesLow === 0, `${shelvesLow} bare floors`);
  const off = generateCity({ ...DEFAULTS, size: 160, seed: 12345, landmarks: false });
  check('landmarks: none when switched off', off.landmarks.length === 0);
  note(`${cities} cities, all four landmarks in ${complete} · ${faces} clock faces · ${stalls} market stalls`);
}
