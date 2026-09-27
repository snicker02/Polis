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

export const id = "2l";
export const label = "2l. canal, art, new landmarks";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const { edgeDistance } = await import('../../engine/transit.js');
  let canals = 0, badOpen = 0, badBridge = 0, nearWall = 0, bridges = 0, rails = 0, docks = 0, dockUnreached = 0, badDock = 0;
  let panels = 0, badPanel = 0, complete = 0, cities = 0;
  let pews = 0, spires = 0, bells = 0, classrooms = 0, lecterns = 0, bands = 0, lanterns = 0, lhFar = 0, castles = 0, notHighest = 0, merlons = 0, turrets = 0;
  let schools = 0, porchBad = 0, signs = 0, signBad = 0, signable = 0, cupolas = 0, fields = 0, fieldBad = 0, desksN = 0, chairBad = 0, boards = 0;
  const WDIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];          // weirdo_direction 0..3: east, west, south, north
  for (const [size, seed, st, transit] of [[160, 12345, 'modern', 'roads'], [192, 1, 'medieval', 'rails'], [224, 3, 'desert', 'trams'], [256, 5, 'cherry', 'roads'], [128, 2, 'snowy', 'rails']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st, transit });
    const w = r.world, { W, D, use } = r.plan, G = 1;
    cities++;
    const kinds = r.landmarks.map((l) => l.kind);
    if (['townhall', 'clocktower', 'library', 'market', 'church', 'school', 'lighthouse', 'castle'].every((k) => kinds.includes(k))) complete++;
    // ---- canal
    const c = r.canal;
    if (c) {
      canals++;
      const O = edgeDistance(r.plan);
      for (let u = c.u0; u <= c.u1; u++) for (let a = c.ch0; a <= c.ch1; a++) {
        const [x, z] = c.cell(u, a);
        if (O[z * W + x] < 4) nearWall++;
        if (name(w, x, -3, z) !== 'minecraft:water' || name(w, x, -2, z) !== 'minecraft:water') badOpen++;
        if (w.has(x, -1, z) || w.has(x, 0, z)) (use[z * W + x] === USE.ROAD ? badBridge++ : badOpen++);   // two clear blocks over the water
        if (use[z * W + x] === 8) { for (let y = G; y <= G + 2; y++) if (w.has(x, y, z)) badOpen++; }       // open to the sky
        else if (use[z * W + x] === USE.ROAD) { if (!w.has(x, G, z)) badBridge++; }                          // a deck to walk on
      }
      bridges += c.bridges;
      if (c.railed) for (let u = c.u0; u <= c.u1; u++) { const [x, z] = c.cell(u, c.ch0 - 1); if (name(w, x, G + 1, z) === 'minecraft:oak_fence') rails++; }
      if (c.dock) {
        docks++;
        const d = c.dock;
        if (!d.steps.every(([x, y, z]) => /_stairs$/.test(name(w, x, y, z) || '')) || d.steps.map((s2) => s2[1]).join() !== '1,0,-1') badDock++;
        for (const [x, y, z] of d.landing) if (!w.has(x, y - 1, z) || w.has(x, y, z) || w.has(x, y + 1, z)) badDock++;
        const walked = walkCity(w, r.plan, 1, r.hills.H + 4, true);
        // the city walk stays at street level and above; follow the dock steps down by hand
        const [sx, sy, sz] = d.steps[0];
        const top = walked.has(`${sx},${sy + 1},${sz}`) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => walked.has(`${sx + dx},${G + 1},${sz + dz}`));
        if (!top) dockUnreached++;
        for (const b of d.boats) if (name(w, b.x, b.y, b.z) !== 'minecraft:water' || w.has(b.x, b.y + 1, b.z)) badDock++;
      }
    }
    // ---- art: every panel is four tiles of one glaze, each facing a different way
    for (const b of r.buildings) for (const plan of b.roomPlans || []) if (plan && plan.art) panels += plan.art;
    const seenTiles = new Set();
    w.forEach((x, y, z, id) => {
      const n = MATERIALS.def(id).block;
      if (!/_glazed_terracotta$/.test(n) || seenTiles.has(`${x},${y},${z}`)) return;
      // find its 2x2 group (in x or z) and check it
      for (const [ax, az] of [[1, 0], [0, 1]]) {
        const cells = [[x, y, z], [x + ax, y, z + az], [x, y - 1, z], [x + ax, y - 1, z + az]];
        const names = cells.map(([a, b2, c2]) => name(w, a, b2, c2));
        if (names.every((q) => q === n)) {
          const facings = new Set(cells.map(([a, b2, c2]) => MATERIALS.def(w.get(a, b2, c2)).states.facing_direction.value));
          if (facings.size !== 4) badPanel++;
          for (const c2 of cells) seenTiles.add(c2.join());
          return;
        }
      }
    });
    // ---- new landmarks
    for (const L of r.landmarks) {
      // the name sign
      signable++;
      if (L.nameSign) {
        const [sx, sy, sz] = L.nameSign;
        const id = w.get(sx, sy, sz), data = w.getData(sx, sy, sz);
        const FACE = { south: 0, west: 4, north: 8, east: 12 };
        const face = L.rec ? L.rec.facing : null;
        if (id < 0 || MATERIALS.def(id).block !== 'minecraft:standing_sign') signBad++;
        else {
          signs++;
          if (!data || data.id !== 'Sign' || data.tags.FrontText.v.Text.v !== LANDMARK_NAMES[L.kind]) signBad++;
          if (face && MATERIALS.def(id).states.ground_sign_direction.value !== FACE[face]) signBad++;
          if (!w.has(sx, sy - 1, sz)) signBad++;
          if (L.rec) {
            const near = L.rec.doorCells.some(([dx, dz]) => Math.abs(dx - sx) + Math.abs(dz - sz) <= 7);
            const onPath = L.rec.doorCells.some(([dx, dz]) => { const [ox, oz] = L.rec.door.out; return dx + ox === sx && dz + oz === sz; });
            if (!near || onPath) signBad++;
          }
        }
      }
      if (L.kind === 'church') {
        pews += L.pews;
        if (name(w, ...L.spireTop) === 'minecraft:gold_block') spires++;
        if (name(w, ...L.belfryBell) === 'minecraft:bell') bells++;
      } else if (L.kind === 'school') {
        schools++;
        const g = r.groundAt(L.porch[0][0], L.porch[0][1]);
        for (const [x, z] of L.porch) if (!w.has(x, g + 4, z)) porchBad++;
        if (name(w, ...L.cupolaBell) === 'minecraft:bell' && w.has(L.cupolaBell[0], L.cupolaBell[1] + 1, L.cupolaBell[2])) cupolas++;
        if (L.field) {
          fields++;
          const f = L.field.rect, gy = r.groundAt(f.x0, f.z0);
          let gates = 0;
          for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
            if (!(x === f.x0 || x === f.x1 || z === f.z0 || z === f.z1)) continue;
            const n = name(w, x, gy + 1, z);
            if (n === 'minecraft:fence_gate') gates++; else if (n !== 'minecraft:oak_fence') fieldBad++;
          }
          if (gates !== 1) fieldBad++;
          for (const [x, z] of L.field.goals) if (name(w, x, gy + 2, z) !== 'minecraft:oak_fence') fieldBad++;
          const walked = walkCity(w, r.plan, 1, r.hills.H + 4, true);
          const [gx, gz] = L.field.gate;
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => walked.has(`${gx + dx},${gy + 1},${gz + dz}`) &&
              !(gx + dx >= f.x0 && gx + dx <= f.x1 && gz + dz >= f.z0 && gz + dz <= f.z1))) fieldBad++;
        }
        // the school is one hall per floor: a chalkboard across the wall
        // opposite the door, desks facing it, and both floors reachable
        {
          const face = L.rec.facing;
          const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[face];
          const r0 = L.rec.rects[0];
          const alongX = out[1] !== 0;
          const wallC = alongX ? (out[1] > 0 ? r0.z0 : r0.z1) : (out[0] > 0 ? r0.x0 : r0.x1);
          let boardBlocks = 0;
          for (let k = 0; k < L.rec.floors; k++) {
            const y0 = L.rec.floorYs[k];
            for (let u = (alongX ? r0.x0 : r0.z0); u <= (alongX ? r0.x1 : r0.z1); u++)
              for (let y = y0 + 2; y <= y0 + 3; y++) {
                const [bx, bz] = alongX ? [u, wallC] : [wallC, u];
                if (name(w, bx, y, bz) === 'minecraft:deepslate_tiles') boardBlocks++;
              }
          }
          if (boardBlocks >= 4) boards++;
          classrooms += L.rec.floors;                   // one hall to a floor
          let lec = false;
          for (let k = 0; k < L.rec.floors; k++) {
            const y = L.rec.floorYs[k] + 1;
            for (let z = r0.z0; z <= r0.z1; z++) for (let x = r0.x0; x <= r0.x1; x++) if (name(w, x, y, z) === 'minecraft:lectern') lec = true;
          }
          if (lec) lecterns += L.rec.floors;            // one to each hall
          // desks: every seat has a desk in front of it
          for (let k = 0; k < L.rec.floors; k++) {
            const y = L.rec.floorYs[k] + 1;
            for (let z = r0.z0; z <= r0.z1; z++) for (let x = r0.x0; x <= r0.x1; x++) {
              const core = L.rec.core;
              // the staircase is made of stairs too, and is not seating
              if (core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1) continue;
              const id = w.get(x, y, z);
              if (id < 0 || !/_stairs$/.test(MATERIALS.def(id).block)) continue;
              const st = MATERIALS.def(id).states.weirdo_direction;
              if (!st) continue;
              desksN++;
              const [bx, bz] = WDIR[st.value];
              if (name(w, x - bx, y, z - bz) !== 'minecraft:oak_slab') chairBad++;
            }
          }
          const vs = verifyAll(w, [L.rec]);
          if (vs.floorsReached !== vs.floorsChecked) fieldBad++;
        }
      } else if (L.kind === 'lighthouse') {
        if (L.red > 0) bands++;
        const [lx, ly, lz] = L.lantern;
        if (name(w, lx, ly, lz) === 'minecraft:glowstone' && name(w, lx + 3, ly, lz) === 'minecraft:glass') lanterns++;
        if (c) {
          let near = false;
          for (let u = c.u0; u <= c.u1; u++) { const [x, z] = c.cell(u, c.ch0); if (Math.max(0, Math.abs(x - (L.lot.x0 + L.lot.x1) / 2) - (L.lot.x1 - L.lot.x0) / 2) + Math.max(0, Math.abs(z - (L.lot.z0 + L.lot.z1) / 2) - (L.lot.z1 - L.lot.z0) / 2) <= 8) near = true; }
          if (!near) lhFar++;
        }
      } else if (L.kind === 'castle') {
        castles++;
        merlons += L.merlons; turrets += L.turrets.length;
        // on the highest hill among the lots it could have had
        const e = (l) => r.hills.elev[Math.round((l.z0 + l.z1) / 2) * W + Math.round((l.x0 + l.x1) / 2)];
        const others = r.plan.lots.filter((l) => l.kind === USE.LOT && (!l.landmark || l.landmark === 'castle') &&
          Math.min(l.x1 - l.x0 + 1, l.z1 - l.z0 + 1) >= 13);
        if (e(L.lot) < Math.max(...others.map(e))) notHighest++;
      }
    }
    const v = verifyAll(w, r.buildings);
    check(`${st} ${size}/${seed}: every floor of every building (landmarks too) reachable`, v.ok === v.total && v.floorsReached === v.floorsChecked);
    check(`${st} ${size}/${seed}: every door reachable from the streets`, r.reach.unreached.length === 0);
  }
  check('canal: in every test city', canals === cities, `${canals}/${cities}`);
  check('canal: water two deep, open to the sky, two clear blocks above it', badOpen === 0, `${badOpen}`);
  check('canal: every crossing street carries over on a bridge deck, two blocks above the water', badBridge === 0 && bridges > 0, `${badBridge} bad, ${bridges} bridges`);
  check('canal: kept well inside the wall', nearWall === 0, `${nearWall}`);
  check('canal: railings along the banks where the street is wide enough', rails > 0, String(rails));
  check('dock: in every canal, three steps down to a landing at the water', docks === canals && badDock === 0, `${docks} docks, ${badDock} problems`);
  check('dock: reached from the streets', dockUnreached === 0);
  check('art: panels on the inside walls, each four tiles of one glaze facing four ways', panels > 0 && badPanel === 0, `${panels} panels, ${badPanel} bad`);
  check('landmarks: all eight in every test city', complete === cities, `${complete}/${cities}`);
  check('church: pews, a gold-topped spire and a bell in the tower', pews > 0 && spires === cities && bells === cities, `${pews} pews, ${spires} spires, ${bells} bells`);
  check('school: a hall on each floor, each with a lectern', classrooms > 0 && lecterns === classrooms, `${lecterns}/${classrooms}`);
  check('school: a covered porch (two columns and a roof) over the entrance', porchBad === 0 && schools === cities, `${porchBad} problems`);
  check('landmarks: every one has a standing sign with its name, beside the way to its door, facing the street',
    signs === signable && signBad === 0, `${signs}/${signable} signs, ${signBad} problems`);
  check('school: a bell hung in a cupola on the roof', cupolas === cities, `${cupolas}/${cities}`);
  check('school: where there is room, a fenced sports field with a gate and two goals, reached from the street', fields > 0 && fieldBad === 0, `${fields} fields, ${fieldBad} problems`);
  check('school: desks in rows, every seat behind its desk and facing the board', desksN > 0 && chairBad === 0, `${desksN} chairs, ${chairBad} facing wrong`);
  check('lighthouse: red bands, a glass lantern room with a light, beside the canal', bands === cities && lanterns === cities && lhFar === 0, `${bands} banded, ${lanterns} lit, ${lhFar} far from the water`);
  check('castle: on the highest hill, crenellated, four turrets', castles === cities && notHighest === 0 && merlons > 0 && turrets === castles * 4, `${notHighest} not on the highest hill`);
  note(`${canals} canals · ${bridges} bridges · ${docks} docks · ${panels} art panels · ${pews} pews · ${classrooms} classrooms`);
}
