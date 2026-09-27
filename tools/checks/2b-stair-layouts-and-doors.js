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

export const id = "2b";
export const label = "2b. stair layouts and doors";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  // every forced layout, every pitch, several footprints: all floors reachable
  let total = 0, ok = 0;
  const used = {};
  for (const stairStyle of ['switchback', 'wide', 'spiral', 'mixed']) {
    for (const pitch of [4, 5, 6, 7]) {
      for (const [bw, bd] of [[9, 9], [12, 8], [8, 14], [17, 13], [24, 20]]) {
        for (const style of ['house', 'mid', 'tower']) {
          const r = generateSingle({ ...DEFAULTS, style, floors: 5, pitch, bw, bd, seed: total + 11, stairStyle });
          total++;
          const b = r.buildings[0];
          if (!b) continue;
          if (b.stairKind) used[stairStyle + ':' + b.stairKind] = (used[stairStyle + ':' + b.stairKind] || 0) + 1;
          const v = verifyAll(r.world, r.buildings);
          if (v.ok && v.floorsReached === v.floorsChecked) ok++;
          else check(`${stairStyle} ${style} ${bw}x${bd} pitch ${pitch}: reachable`, false,
            `${v.floorsReached}/${v.floorsChecked} (${b.stairKind})`);
        }
      }
    }
  }
  check('stairs: every layout x pitch x footprint reachable', ok === total, `${ok}/${total}`);
  check('stairs: switchback actually used', (used['switchback:switchback'] || 0) > 0);
  check('stairs: wide switchback actually used', (used['wide:wide'] || 0) > 0);
  check('stairs: spiral actually used', (used['spiral:spiral'] || 0) > 0);
  check('stairs: mixed produces more than one layout',
    Object.keys(used).filter((k) => k.startsWith('mixed:')).length >= 2,
    Object.keys(used).filter((k) => k.startsWith('mixed:')).join(', '));
  note(`${ok}/${total} single builds reachable · ` +
    Object.entries(used).map(([k, n]) => `${k} ${n}`).join(' · '));

  // No hopping: with stair blocks on, every floor must be reachable from the
  // door stepping up ONLY onto stair blocks — the way walking up stairs works
  // in game. (0.2.7 switchbacks stopped one step short of each floor.)
  const noHop = (w, rec) => {
    const passable = (x, y, z) => { const id = w.get(x, y, z); return id === -1 || MATERIALS.isPassable(id); };
    const floorOk = (x, y, z) => { const id = w.get(x, y - 1, z); return id !== -1 && !MATERIALS.isPassable(id); };
    const stand = (x, y, z) => floorOk(x, y, z) && passable(x, y, z) && passable(x, y + 1, z);
    const r0 = rec.rects[0];
    const inB = (x, z) => x >= r0.x0 - 1 && x <= r0.x1 + 1 && z >= r0.z0 - 1 && z <= r0.z1 + 1;
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const start = rec.outside;
    const seen = new Set([key(...start)]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const [x, y, z] = q[h];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inB(nx, nz)) continue;
        for (const ny of [y + 1, y, y - 1, y - 2, y - 3]) {
          if (ny === y + 1) {
            if (!passable(x, y + 2, z)) continue;
            if (!/_stairs$/.test(MATERIALS.def(w.get(nx, y, nz) >= 0 ? w.get(nx, y, nz) : 0).block) || w.get(nx, y, nz) < 0) continue;
          }
          if (ny < y) { let clear = true; for (let yy = ny + 2; yy <= y + 1; yy++) if (!passable(nx, yy, nz)) clear = false; if (!clear) continue; }
          if (!stand(nx, ny, nz)) continue;
          const k = key(nx, ny, nz);
          if (!seen.has(k)) { seen.add(k); q.push([nx, ny, nz]); }
          break;
        }
      }
    }
    const c = rec.core;
    let reached = 0;
    for (let k = 0; k < rec.floors; k++) {
      const r = rec.rects[k], y = rec.floorYs[k] + 1;
      let ok = false;
      for (let z = r.z0 + 1; z <= r.z1 - 1 && !ok; z++) for (let x = r.x0 + 1; x <= r.x1 - 1 && !ok; x++) {
        if (c && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) continue;
        if (seen.has(key(x, y, z))) ok = true;
      }
      if (ok) reached++;
    }
    return { reached, floors: rec.floors };
  };
  {
    let checked = 0, hops = 0, first = '';
    for (const stairStyle of ['switchback', 'wide', 'spiral']) for (const pitch of [4, 5, 6, 7])
      for (const [bw, bd] of [[12, 9], [17, 13], [24, 20]]) {
        const r = generateSingle({ ...DEFAULTS, style: 'tower', floors: 5, pitch, bw, bd, seed: pitch * 7 + bw, stairStyle, roofAccess: true });
        const b = r.buildings[0]; if (!b || !b.core) continue;
        checked++;
        const nh = noHop(r.world, b);
        if (nh.reached !== nh.floors) { hops++; if (!first) first = `${stairStyle} pitch ${pitch} ${bw}x${bd} (${b.stairKind}): ${nh.reached}/${nh.floors}`; }
      }
    check('stairs: every floor reachable without a single hop (all layouts, all pitches)', hops === 0 && checked > 0, `${hops}/${checked}, e.g. ${first}`);
    let cityHops = 0, cityB = 0;
    for (const [size, seed] of [[160, 12345], [192, 1]]) {
      const r = generateCity({ ...DEFAULTS, size, seed });
      for (const b of r.buildings) { if (!b.core) continue; cityB++; const nh = noHop(r.world, b); if (nh.reached !== nh.floors) cityHops++; }
      // and from the streets to every door, up the terrace steps, without a hop
      const walked = walkCity(r.world, r.plan, 1, r.hills.H + 4, true);
      const miss = r.buildings.filter((b) => !walked.has(b.outside.join(','))).length;
      check(`city ${size}/${seed}: every door reachable from the streets without a hop`, miss === 0, `${miss} need a jump`);
    }
    check('stairs: every building in two cities climbable without a hop', cityHops === 0 && cityB > 0, `${cityHops}/${cityB}`);
    note(`${checked} single builds and ${cityB} city buildings climbed without jumping`);
  }

  // stair blocks off: straight flights of full blocks must still be climbable
  for (const stairStyle of ['switchback', 'wide']) {
    const r = generateSingle({ ...DEFAULTS, style: 'tower', floors: 7, pitch: 5, bw: 20, bd: 16, seed: 5, stairStyle, useStairs: false });
    const v = verifyAll(r.world, r.buildings);
    check(`${stairStyle} with stair blocks off: climbable`, v.floorsReached === v.floorsChecked,
      `${v.floorsReached}/${v.floorsChecked}`);
  }

  // doors: facing -> cardinal_direction exactly as Bedrock's own table says
  const DOORMAP = JSON.parse(readFileSync(join(ROOT, 'tools/bedrock-states.json'), 'utf8'))._doorFacingToCardinal.map;
  const FACE_DIR = { east: 0, south: 1, west: 2, north: 3 };
  const doorBad = Object.entries(DOORMAP).filter(([face, card]) =>
    MATERIALS.def(doorId('oak', FACE_DIR[face], false)).states['minecraft:cardinal_direction'].value !== card);
  check('doors: facing maps to cardinal_direction per Bedrock\'s Java->Bedrock table', doorBad.length === 0,
    doorBad.map(([f, c]) => `${f} should be ${c}`).join(', '));
  // double doors: same facing, opposite hinges, right hinge on the cell clockwise of the facing
  {
    const CW = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] };   // clockwise-of-facing offset
    let pairs = 0, badPairs = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = generateCity({ ...DEFAULTS, size: 192, seed });
      for (const b of r.buildings) {
        if (!b.doorCells || b.doorCells.length !== 2) continue;
        pairs++;
        const [[ax, az], [bx, bz]] = b.doorCells;
        const da = MATERIALS.def(r.world.get(ax, b.groundY + 1, az)), db = MATERIALS.def(r.world.get(bx, b.groundY + 1, bz));
        const ca = da.states['minecraft:cardinal_direction'].value, cb = db.states['minecraft:cardinal_direction'].value;
        const ha = da.states.door_hinge_bit.value, hb = db.states.door_hinge_bit.value;
        const [rx, rz] = CW[b.facing];
        const rightIsB = (bx - ax) === rx && (bz - az) === rz;
        const ok = ca === cb && ha !== hb && (rightIsB ? hb === 1 : ha === 1);
        if (!ok) badPairs++;
      }
    }
    check('double doors: same facing, hinges on the outer edges', pairs > 0 && badPairs === 0, `${badPairs}/${pairs} bad`);
  }

  // doors: only real Bedrock door ids, and only ones a player can open by hand
  const BEDROCK_WOOD_DOORS = new Set(['minecraft:wooden_door', 'minecraft:spruce_door',
    'minecraft:birch_door', 'minecraft:jungle_door', 'minecraft:acacia_door',
    'minecraft:dark_oak_door', 'minecraft:mangrove_door', 'minecraft:cherry_door',
    'minecraft:bamboo_door', 'minecraft:crimson_door', 'minecraft:warped_door']);
  const badKinds = DOOR_KINDS.filter((k) => !BEDROCK_WOOD_DOORS.has(MATERIALS.def(doorId(k, 0, false)).block));
  check('doors: every door kind is a hand-openable Bedrock door', badKinds.length === 0, badKinds.join(', '));
  check('doors: oak uses the Bedrock name wooden_door',
    MATERIALS.def(doorId('oak', 0, false)).block === 'minecraft:wooden_door');
  const themeDoors = [];
  for (const list of Object.values(THEMES)) for (const t of list) themeDoors.push(t.door);
  check('doors: no theme uses a door that needs redstone',
    themeDoors.every((k) => DOOR_KINDS.includes(k)), themeDoors.filter((k) => !DOOR_KINDS.includes(k)).join(', '));
  let placedBad = 0;
  const cityD = generateCity({ ...DEFAULTS, size: 192, seed: 77 });
  cityD.world.forEach((x, y, z, id) => {
    const n = MATERIALS.def(id).block;
    if (n.endsWith('_door') && !BEDROCK_WOOD_DOORS.has(n)) placedBad++;
  });
  check('doors: no invalid or iron door placed anywhere in a city', placedBad === 0, `${placedBad} bad`);
}
