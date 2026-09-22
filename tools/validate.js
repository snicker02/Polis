// tools/validate.js — headless checks. Run with:  node tools/validate.js
//
// Covers: plan/street legality, door access, per-floor reachability, block
// budget, chunk split coverage, .mcstructure NBT round-trip, .mcpack zip
// round-trip, palette well-formedness, greedy-mesher face-area conservation,
// and a structural lint of the WebGL shaders (no glslangValidator here, so
// the lint checks the things that actually break: stage interface mismatches,
// undeclared identifiers, unbalanced blocks, uniform lookup coverage).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { generateCity, generateSingle, DEFAULTS } from '../engine/city.js';
import { USE } from '../engine/plan.js';
import { verifyAll } from '../engine/verify.js';
import { MATERIALS, THEMES, DOOR_KINDS, doorId, MAT, BED_VEC, stairId, cropId, CROP_KINDS, bedId, furnaceId, railId, poweredRailId,
  gateId, chestId, lecternId, smokerId, stonecutterId, pumpkinId, loomId, grindstoneId, bambooId, FLOWERS } from '../engine/materials.js';
import { BLOCK_VERSION } from '../engine/blockcore.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK, exportPack, tileList, functionFiles, GROUND_DROP, cityId, exportSalt, POLIS_VERSION, SUMMON_IDS } from '../engine/export.js';
import { buildMesh, MAX_QUADS, STRIDE } from '../engine/mesher.js';
import { decodeNbt, readZip, localPayload } from './nbt-read.js';
import { decodeTyped } from './nbt-typed.js';
import { walkCity } from '../engine/terrain.js';
import { CLOCK_FACE, LANDMARK_NAMES } from '../engine/landmarks.js';
import { STYLES, remapTable } from '../engine/styles.js';
import { CAT_COATS, SHEEP_COATS } from '../engine/entity-templates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const deflateRaw = (b) => new Uint8Array(zlib.deflateRawSync(Buffer.from(b)));

let pass = 0, fail = 0;
// block names a player or mob can stand inside (doors, flowers, crops, rails,
// carpet): taken from the registry, so a new plant can never be missed
const WALK_THROUGH = new Set();
function refreshWalkThrough() {
  for (let i = 0; i < MATERIALS.length; i++) if (MATERIALS.def(i).passable) WALK_THROUGH.add(MATERIALS.def(i).block);
}
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; return true; }
  fail++; failures.push(name + (detail ? ' — ' + detail : ''));
  return false;
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }
function note(s) { console.log('   ' + s); }

// ===========================================================================
// 1. cities
// ===========================================================================
section('1. city generation');

const CITY_CASES = [
  { size: 96, seed: 1 },
  { size: 128, seed: 2, blockIrregularity: 0.2 },
  { size: 160, seed: 3, pitch: 4 },
  { size: 160, seed: 4, pitch: 7, maxFloors: 28 },
  { size: 192, seed: 5, minBlock: 22, lotDowntown: 26 },
  { size: 192, seed: 6, useStairs: false },
  { size: 224, seed: 7, downtownRadius: 0.6, parkChance: 0.25 },
  { size: 128, seed: 8, trees: false, lamps: false, markings: false, lights: false },
  { size: 128, seed: 9, roofAccess: false, setback: false },
  { size: 160, seed: 10, focal: [0.2, 0.8] },
];

let biggest = null;
for (const c of CITY_CASES) {
  const cfg = { ...DEFAULTS, ...c };
  const t0 = Date.now();
  const r = generateCity(cfg);
  const gen = Date.now() - t0;
  const tag = `size=${cfg.size} seed=${cfg.seed}`;

  check(`${tag}: buildings exist`, r.stats.buildings > 0, `got ${r.stats.buildings}`);
  check(`${tag}: windows exist`, r.stats.windows > 0, `got ${r.stats.windows}`);
  check(`${tag}: within block budget`, r.stats.overflow === 0, `${r.stats.overflow} dropped`);

  // bounds
  let outOfRange = 0;
  r.world.forEach((x, y, z) => { if (!r.world.inRange(x, y, z)) outOfRange++; });
  check(`${tag}: all cells in range`, outOfRange === 0, `${outOfRange} bad`);

  // buildings never sit on a street or pavement
  const at = (x, z) => z * r.plan.W + x;
  let onStreet = 0, offPlan = 0;
  for (const b of r.buildings) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (x < 0 || z < 0 || x >= r.plan.W || z >= r.plan.D) { offPlan++; continue; }
        const u = r.plan.use[at(x, z)];
        if (u === USE.ROAD || u === USE.SIDEWALK) onStreet++;
      }
    }
  }
  check(`${tag}: no building on a street`, onStreet === 0, `${onStreet} cells`);
  check(`${tag}: no building off the plan`, offPlan === 0, `${offPlan} cells`);

  // every door has somewhere to stand outside it
  let badDoor = 0;
  const solid = (x, y, z) => {
    const id = r.world.get(x, y, z);
    return id !== -1 && !MATERIALS.isPassable(id);
  };
  for (const b of r.buildings) {
    const [ox, oy, oz] = b.outside;
    const ok = !solid(ox, oy, oz) && !solid(ox, oy + 1, oz) && solid(ox, oy - 1, oz);
    if (!ok) badDoor++;
  }
  check(`${tag}: doors open onto standable ground`, badDoor === 0, `${badDoor} blocked`);

  // stairs: every floor reachable from the pavement
  const t1 = Date.now();
  const v = verifyAll(r.world, r.buildings);
  const ver = Date.now() - t1;
  check(`${tag}: every building enterable`, v.ok === v.total, `${v.ok}/${v.total}`);
  check(`${tag}: every floor reachable`, v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`);

  note(`${tag}: ${r.stats.blocks.toLocaleString()} blocks · ${r.stats.buildings} buildings ` +
    `(${r.stats.houses}h/${r.stats.mids}m/${r.stats.towers}t) · tallest ${r.stats.tallest}f · ` +
    `${v.floorsReached}/${v.floorsChecked} floors · gen ${gen}ms verify ${ver}ms`);

  if (!biggest || r.stats.blocks > biggest.stats.blocks) biggest = r;
}

// ===========================================================================
// 2. single buildings
// ===========================================================================
section('2. single buildings');

const SINGLE_CASES = [];
for (const style of ['tower', 'mid', 'house']) {
  for (const floors of [1, 2, 5, 12]) {
    for (const pitch of [4, 5, 7]) {
      SINGLE_CASES.push({ style, floors, pitch, bw: style === 'house' ? 11 : 17, bd: 13, seed: 100 + SINGLE_CASES.length });
    }
  }
}
let singleOk = 0, singleFloors = 0, singleFloorsOk = 0, minClear = 99;
for (const c of SINGLE_CASES) {
  const r = generateSingle({ ...DEFAULTS, ...c });
  const tag = `${c.style} ${c.floors}f pitch=${c.pitch}`;
  if (!check(`${tag}: built`, r.buildings.length === 1)) continue;
  const b = r.buildings[0];
  check(`${tag}: has windows`, b.windows > 0, `got ${b.windows}`);
  // interior clear height must leave room for a 2-block-tall player
  const clear = b.pitch - 1;
  minClear = Math.min(minClear, clear);
  check(`${tag}: interior >= 2 blocks tall`, clear >= 2, `clear=${clear}`);
  const v = verifyAll(r.world, r.buildings);
  singleFloors += v.floorsChecked; singleFloorsOk += v.floorsReached;
  if (check(`${tag}: all floors reachable`, v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`)) singleOk++;
}
note(`${singleOk}/${SINGLE_CASES.length} single builds fully reachable · ` +
  `${singleFloorsOk}/${singleFloors} floors · min interior clearance ${minClear}`);

// stairs disabled still has to be climbable (full blocks, 3 cells of headroom)
{
  const r = generateSingle({ ...DEFAULTS, style: 'mid', floors: 8, pitch: 5, bw: 15, bd: 13, seed: 4242, useStairs: false });
  const v = verifyAll(r.world, r.buildings);
  check('stair blocks off: still climbable', v.floorsReached === v.floorsChecked,
    `${v.floorsReached}/${v.floorsChecked}`);
}

// ===========================================================================
// 2b. stair layouts and doors
// ===========================================================================
section('2b. stair layouts and doors');
{
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

// ===========================================================================
// 2c. life: water, farms, beds, furniture, villagers, golems
// ===========================================================================
section('2c. life');
{
  const WATER = MAT.WATER;
  const tight = (w, x, y, z) => {
    const id = w.get(x, y, z);
    if (id === -1) return false;
    if (id === WATER) return true;
    const d = MATERIALS.def(id);
    return !d.flowable && !d.passable;
  };
  let waterCells = 0, leaks = 0, farmsTotal = 0, ponds = 0, badHydration = 0, badCrop = 0;
  let bedsTotal = 0, badBeds = 0, badBedData = 0, villagers = 0, golems = 0;
  let villagersOutside = 0, golemsInside = 0, badSpawn = 0, bells = 0, furnitureNearCore = 0;
  const leakList = [];
  for (const c of [
    { size: 160, seed: 12345 }, { size: 192, seed: 5, farmChance: 0.4 },
    { size: 128, seed: 21, pondChance: 1 }, { size: 224, seed: 7, farmChance: 0.5, pondChance: 1 },
    { size: 160, seed: 99, pitch: 4 }, { size: 160, seed: 98, pitch: 7, villagers: 200 },
  ]) {
    const r = generateCity({ ...DEFAULTS, ...c });
    const w = r.world;
    farmsTotal += r.farms.length;
    // every water block: solid or water on all four sides and underneath
    w.forEach((x, y, z, id) => {
      if (id !== WATER) return;
      waterCells++;
      const ok = tight(w, x + 1, y, z) && tight(w, x - 1, y, z) && tight(w, x, y, z + 1) &&
                 tight(w, x, y, z - 1) && tight(w, x, y - 1, z);
      if (!ok) { leaks++; if (leakList.length < 3) leakList.push(`${c.seed}@${x},${y},${z}`); }
    });
    // ponds show up as clay-bedded water
    w.forEach((x, y, z, id) => { if (id === MAT.CLAY) ponds++; });
    // farms: every farmland within 4 of water (same level), every crop on farmland
    for (const f of r.farms) {
      for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
        const id = w.get(x, 1, z);
        if (id === MAT.FARMLAND) {
          let wet = false;
          for (let dz = -4; dz <= 4 && !wet; dz++) for (let dx = -4; dx <= 4 && !wet; dx++)
            if (w.get(x + dx, 1, z + dz) === WATER) wet = true;
          if (!wet) badHydration++;
        }
        const top = w.get(x, 2, z);
        if (top !== -1 && /wheat|carrots|beetroot/.test(MATERIALS.def(top).block) && id !== MAT.FARMLAND) badCrop++;
      }
    }
    // beds: every foot has its head where its direction says, and both carry a colour
    const cellInfo = (x, y, z) => { const id = w.get(x, y, z); return id === -1 ? null : MATERIALS.def(id); };
    w.forEach((x, y, z, id) => {
      const d = MATERIALS.def(id);
      if (d.block !== 'minecraft:bed') return;
      const head = d.states.head_piece_bit.value === 1, dir = d.states.direction.value;
      const [vx, vz] = BED_VEC[dir];
      const px = head ? x - vx : x + vx, pz = head ? z - vz : z + vz;
      const p = cellInfo(px, y, pz);
      if (!p || p.block !== 'minecraft:bed' || p.states.direction.value !== dir ||
          p.states.head_piece_bit.value === (head ? 1 : 0)) badBeds++;
      const data = w.getData(x, y, z);
      if (!data || data.id !== 'Bed' || typeof data.bytes.color !== 'number') badBedData++;
      if (!head) bedsTotal++;
    });
    // furniture never inside the ring round a stair core
    for (const b of r.buildings) {
      if (!b.core) continue;
      for (let k = 0; k < b.floors; k++) {
        const y = b.floorYs[k] + 1;
        for (let z = b.core.z0 - 1; z <= b.core.z1 + 1; z++) for (let x = b.core.x0 - 1; x <= b.core.x1 + 1; x++) {
          const id = w.get(x, y, z);
          if (id === -1) continue;
          const n = MATERIALS.def(id).block;
          if (/bed|bookshelf|crafting|furnace|barrel|cartography|fletching|brewing|cauldron|azalea|carpet/.test(n)) furnitureNearCore++;
        }
      }
    }
    // spawns
    const inB = (x, z, pad) => r.buildings.some((b) => x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad);
    const solid = (x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
    for (const p of r.spawns) {
      if (p.type === 'minecart') continue;                       // checked with the railways
      if (p.type === 'boat') {                                    // on the water, open air above
        const n = w.get(p.x, p.y, p.z), a1 = w.get(p.x, p.y + 1, p.z);
        if (n < 0 || MATERIALS.def(n).block !== 'minecraft:water' || a1 !== -1) badSpawn++;
        continue;
      }
      const tall = p.type === 'golem' ? 3 : 2;
      let room = solid(p.x, p.y - 1, p.z);
      for (let h = 0; h < tall; h++) if (solid(p.x, p.y + h, p.z)) room = false;
      if (!room) badSpawn++;
      if (p.type === 'villager') { villagers++; if (!inB(p.x, p.z, 0)) villagersOutside++; }
      else if (inB(p.x, p.z, 0)) golemsInside++;                 // everything else lives outdoors
      if (p.type === 'golem') golems++;
    }
    if (r.villagers !== 0 && r.bell) bells++;
    check(`life ${c.size}/${c.seed}: villager cap respected`,
      r.spawns.filter((p) => p.type === 'villager').length <= (c.villagers || DEFAULTS.villagers));
    const vv = verifyAll(w, r.buildings);
    check(`life ${c.size}/${c.seed}: furnished buildings still fully reachable`,
      vv.floorsReached === vv.floorsChecked, `${vv.floorsReached}/${vv.floorsChecked}`);
  }
  check('water: no water block can flow anywhere', leaks === 0, `${leaks} leaking: ${leakList.join(' ')}`);
  check('water: farms and ponds actually contain water', waterCells > 100, String(waterCells));
  check('farms: generated', farmsTotal > 0, String(farmsTotal));
  check('ponds: generated', ponds > 0, String(ponds));
  check('farms: every farmland block is within 4 of water', badHydration === 0, `${badHydration} dry`);
  check('farms: every crop sits on farmland', badCrop === 0, `${badCrop} bad`);
  check('beds: generated', bedsTotal > 0, String(bedsTotal));
  check('beds: every half has its partner where its direction says', badBeds === 0, `${badBeds} broken`);
  check('beds: every half carries a colour block entity', badBedData === 0, `${badBedData} missing`);
  check('furniture: never in the ring round a stair core', furnitureNearCore === 0, `${furnitureNearCore} pieces`);
  check('villagers: summoned', villagers > 0, String(villagers));
  check('villagers: all inside buildings', villagersOutside === 0, `${villagersOutside} outside`);
  check('golems: summoned', golems > 0, String(golems));
  check('golems, cats, pandas and farm animals: never inside a building footprint', golemsInside === 0, `${golemsInside} inside`);
  check('spawns: every mob has floor under it and room to stand', badSpawn === 0, `${badSpawn} bad`);
  check('village: a bell in every city', bells === 6, `${bells}/6`);
  note(`${waterCells.toLocaleString()} water blocks, 0 leaks · ${farmsTotal} farms · ${bedsTotal} beds · ` +
    `${villagers} villagers · ${golems} golems`);

  // every block Polis can write, checked against Bedrock's own state list
  // for the version tag we write (tools/bedrock-states.json, 1.21.60)
  const REF = JSON.parse(readFileSync(join(ROOT, 'tools/bedrock-states.json'), 'utf8'))['1.21.60'];
  for (const k of DOOR_KINDS) for (let d = 0; d < 4; d++) for (const u of [0, 1]) for (const h of [0, 1]) doorId(k, d, !!u, h);
  for (const k of CROP_KINDS) for (let g = 0; g < 8; g++) cropId(k, g);
  for (let d = 0; d < 4; d++) { bedId(d, 0); bedId(d, 1); }
  for (const f of ['north', 'south', 'east', 'west']) { furnaceId('furnace', f); furnaceId('blast', f); }
  for (let d = 0; d < 10; d++) railId(d);
  for (let d = 0; d < 6; d++) poweredRailId(d);
  for (const f of ['north', 'south', 'east', 'west']) { gateId(f); chestId(f); lecternId(f); smokerId(f); stonecutterId(f); pumpkinId(f); loomId(f); grindstoneId(f); }
  for (const l of ['no_leaves', 'small_leaves', 'large_leaves']) bambooId(l);
  for (const t of Object.keys(THEMES)) for (const th of THEMES[t]) for (const [dir, up] of [[0, 0], [1, 0], [2, 1], [3, 1]]) stairId(th.stair, dir, !!up);
  generateCity({ ...DEFAULTS, size: 128, seed: 4, transit: 'rails' });
  const problems = [];
  for (let i = 0; i < MATERIALS.length; i++) {
    const d = MATERIALS.def(i);
    const name = d.block.replace(/^minecraft:/, '');
    const ref = REF[name];
    if (!ref) { problems.push(`${d.block}: no such block at 1.21.60`); continue; }
    const want = Object.keys(ref).sort().join(','), have = Object.keys(d.states).sort().join(',');
    if (want !== have) { problems.push(`${d.block}: states {${have}} but Bedrock has {${want}}`); continue; }
    for (const [k, st] of Object.entries(d.states)) {
      if (ref[k].t !== st.type) problems.push(`${d.block}.${k}: type ${st.type}, Bedrock ${ref[k].t}`);
      else if (!ref[k].v.includes(st.value)) problems.push(`${d.block}.${k}=${st.value} not in [${ref[k].v}]`);
    }
    if (d.version && d.version !== BLOCK_VERSION) problems.push(`${d.block}: unexpected version tag ${d.version}`);
  }
  check('blocks: every block and state is valid in Bedrock 1.21.60 (Bedrock\'s own state list)',
    problems.length === 0, problems.slice(0, 4).join(' | ') + (problems.length > 4 ? ` (+${problems.length - 4})` : ''));
  note(`${MATERIALS.length} block+state combinations checked against Bedrock 1.21.60 state data`);
}

// ===========================================================================
// 2d. railways
// ===========================================================================
section('2d. railways');
{
  // rail ends: [dx, dz, height of that end above the rail's own y]
  const ENDS = {
    0: [[0, -1, 0], [0, 1, 0]], 1: [[-1, 0, 0], [1, 0, 0]],
    2: [[1, 0, 1], [-1, 0, 0]], 3: [[-1, 0, 1], [1, 0, 0]],
    4: [[0, -1, 1], [0, 1, 0]], 5: [[0, 1, 1], [0, -1, 0]],
    6: [[0, 1, 0], [1, 0, 0]], 7: [[0, 1, 0], [-1, 0, 0]],        // curves: SE, SW
    8: [[0, -1, 0], [-1, 0, 0]], 9: [[0, -1, 0], [1, 0, 0]],      // NW, NE
  };
  const isRail = (w, x, y, z) => { const id = w.get(x, y, z); return id >= 0 && /rail$/.test(MATERIALS.def(id).block); };
  const dirOf = (w, x, y, z) => MATERIALS.def(w.get(x, y, z)).states.rail_direction.value;
  const blocking = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  let totals = { lines: 0, bridges: 0, rails: 0, carts: 0 };
  for (const [transit, c] of [['rails', { size: 160, seed: 12345 }], ['rails', { size: 224, seed: 7 }],
                              ['trams', { size: 192, seed: 5 }], ['rails', { size: 128, seed: 3, pitch: 7 }],
                              // regressions: tree canopies over the track (fixed by trimOverRails)
                              ['rails', { size: 256, seed: 11, blockIrregularity: 1 }], ['trams', { size: 192, seed: 22, blockIrregularity: 0.5 }]]) {
    const r = generateCity({ ...DEFAULTS, ...c, transit });
    const w = r.world;
    const tag = `${transit} ${c.size}/${c.seed}`;
    const rails = [];
    w.forEach((x, y, z, id) => { if (/rail$/.test(MATERIALS.def(id).block)) rails.push([x, y, z]); });
    let noSupport = 0, unpowered = 0, lowRoof = 0, badLink = 0, offRoad = 0, sideTouch = 0, noBuffer = 0;
    const key = (x, y, z) => `${x},${y},${z}`;
    const adj = new Map();
    for (const [x, y, z] of rails) {
      const id = w.get(x, y, z), d = MATERIALS.def(id);
      const below = w.get(x, y - 1, z);
      if (below === -1 || MATERIALS.def(below).flowable || MATERIALS.isPassable(below)) noSupport++;
      if (d.block === 'minecraft:golden_rail' && (below === -1 || MATERIALS.def(below).block !== 'minecraft:redstone_block')) unpowered++;
      if (blocking(w, x, y + 1, z) || blocking(w, x, y + 2, z)) lowRoof++;
      if (r.plan.use[z * r.plan.W + x] !== USE.ROAD) offRoad++;
      const links = [];
      for (const [dx, dz, h] of ENDS[dir = dirOf(w, x, y, z)]) {
        const endY = y + h;
        let found = null;
        for (const yb of [endY, endY - 1]) {
          if (!isRail(w, x + dx, yb, z + dz)) continue;
          const back = ENDS[dirOf(w, x + dx, yb, z + dz)].find(([ex, ez]) => ex === -dx && ez === -dz);
          if (back && yb + back[2] === endY) found = key(x + dx, yb, z + dz);
        }
        if (found) links.push(found);
        else if (!blocking(w, x + dx, y, z + dz)) noBuffer++;       // open end with no buffer
      }
      adj.set(key(x, y, z), links);
      // no rail may touch this one except at its two ends (Bedrock would
      // re-curve them on a block update)
      const endDirs = ENDS[dirOf(w, x, y, z)].map(([ex, ez]) => ex + ',' + ez);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (endDirs.includes(sx + ',' + sz)) continue;
        for (const yy of [y - 1, y, y + 1]) if (isRail(w, x + sx, yy, z + sz)) sideTouch++;
      }
    }
    var dir;
    // links must be mutual; each connected piece is a line with exactly two ends
    for (const [k, links] of adj) for (const l of links) if (!(adj.get(l) || []).includes(k)) badLink++;
    const seen = new Set(); let comps = 0, badComp = 0, cycles = 0, cycleLen = 0;
    for (const k of adj.keys()) {
      if (seen.has(k)) continue;
      comps++;
      const stack = [k]; let ends = 0, size = 0;
      while (stack.length) {
        const u = stack.pop(); if (seen.has(u)) continue; seen.add(u); size++;
        const ls = adj.get(u); if (ls.length < 2) ends++;
        for (const v of ls) if (!seen.has(v)) stack.push(v);
      }
      if (ends === 0) { cycles++; cycleLen = size; }      // the perimeter loop
      else if (ends !== 2) badComp++;
    }
    check(`${tag}: exactly one closed loop round the city, and only when planned`,
      cycles === (r.transit.stats.loop ? 1 : 0) && (!r.transit.stats.loop || cycleLen === r.transit.stats.loopLength),
      `${cycles} loops, ${cycleLen} vs ${r.transit.stats.loopLength} rails`);
    if (r.transit.stats.loop) {
      // any outline: the loop's curves are where it turns, and every straight
      // two steps from a curve is a powered booster
      const L = r.transit.lines.find((l) => l.loop);
      const n = L.cells.length;
      const isCurve = (i) => dirOf(w, L.cells[(i + n) % n][0], L.cells[(i + n) % n][1], L.cells[(i + n) % n][2]) >= 6;
      let curves = 0, badBoost = 0, onWall = 0;
      for (let i = 0; i < n; i++) {
        if (isCurve(i)) { curves++; continue; }
        let d = 0; while (d < n && !isCurve(i + d) && !isCurve(i - d)) d++;
        const [x, y, z] = L.cells[i];
        if (d === 2 && MATERIALS.def(w.get(x, y, z)).block !== 'minecraft:golden_rail') badBoost++;
        if (r.wall && r.wall.ring.some(([a, b]) => a === x && b === z)) onWall++;
      }
      check(`${tag}: the loop turns with curved rails (at least four corners)`, curves >= 4, `${curves}`);
      check(`${tag}: powered boosters two blocks either side of every curve`, badBoost === 0, `${badBoost} missing`);
      check(`${tag}: no loop rail under the wall`, onWall === 0);
    }
    const carts = r.spawns.filter((p) => p.type === 'minecart');
    const cartOnRail = carts.every((p) => isRail(w, p.x, p.y, p.z));
    check(`${tag}: every rail sits on a solid block`, noSupport === 0, `${noSupport}`);
    check(`${tag}: every powered rail sits on a redstone block`, unpowered === 0, `${unpowered}`);
    check(`${tag}: 2 clear blocks above every rail (cart + rider)`, lowRoof === 0, `${lowRoof}`);
    check(`${tag}: rails only on former road cells`, offRoad === 0, `${offRoad}`);
    check(`${tag}: every rail joins its neighbours end to end`, badLink === 0, `${badLink}`);
    check(`${tag}: no rail touches another from the side`, sideTouch === 0, `${sideTouch}`);
    check(`${tag}: every open end of track has a buffer block`, noBuffer === 0, `${noBuffer}`);
    check(`${tag}: every piece of track is one line with two ends (no junctions)`, badComp === 0 && comps === r.transit.stats.lines,
      `${badComp} bad, ${comps} pieces vs ${r.transit.stats.lines} lines`);
    check(`${tag}: one minecart per line, on the rails`, carts.length === r.transit.stats.lines && cartOnRail);
    const v = verifyAll(w, r.buildings);
    check(`${tag}: every building floor still reachable`, v.floorsReached === v.floorsChecked, `${v.floorsReached}/${v.floorsChecked}`);
    totals.lines += r.transit.stats.lines; totals.bridges += r.transit.stats.bridges; totals.rails += rails.length; totals.carts += carts.length;
  }
  check('railways: bridges built', totals.bridges > 0);
  const plain = generateCity({ ...DEFAULTS, size: 128, seed: 3 });
  let anyRail = false; plain.world.forEach((x, y, z, id) => { if (/rail$/.test(MATERIALS.def(id).block)) anyRail = true; });
  check('roads mode: no rails at all', !anyRail && !plain.transit);
  note(`${totals.lines} lines · ${totals.bridges} bridges · ${totals.rails.toLocaleString()} rails · ${totals.carts} carts, all topology checks clean`);
}

// ===========================================================================
// 2e. perimeter wall
// ===========================================================================
section('2e. perimeter wall');
{
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
    const r = generateCity({ ...DEFAULTS, size, seed: size + aw, transit, avenueWidth: aw, streetWidth: sw, wallHeight: 4 });
    if (r.wall.gates.length !== 4) missing++;
  }
  check('wall: four gates at every city size and street width', missing === 0, `${missing}/${combos} cities short of gates`);
  note(`${cities} cities checked in full, ${combos} more for gates: continuous water-tight ring, a gate on every side`);
}

// ===========================================================================
// 2f. foundations and clearance (export time)
// ===========================================================================
section('2f. foundations');
{
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

// ===========================================================================
// 2g. animals and block variety
// ===========================================================================
section('2g. animals and variety');
{
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const def = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  let pens = 0, badPen = 0, grovesN = 0, badGrove = 0, badBamboo = 0, kinds = new Set(), stations = new Set(), crops = new Set();
  let hay = 0, lamps = 0, chests = 0, lecterns = 0;
  const STATION_BLOCKS = ['cartography_table', 'fletching_table', 'blast_furnace', 'brewing_stand', 'cauldron', 'barrel',
    'smoker', 'lectern', 'stonecutter_block', 'loom', 'grindstone', 'smithing_table', 'composter'];
  for (const seed of [12345, 2, 3, 7]) {
    const r = generateCity({ ...DEFAULTS, size: 192, seed, ranchChance: 0.2, pandaChance: 1 });
    const w = r.world, G = 1;
    for (const p of r.ranches) {
      pens++; kinds.add(p.kind);
      // fence all round except the gate, gate facing the street
      for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
        if (!(x === p.x0 || x === p.x1 || z === p.z0 || z === p.z1)) continue;
        const g = r.groundAt(x, z);
        const n = name(w, x, g + 1, z);
        if (x === p.gate[0] && z === p.gate[1]) {
          const d = def(w, x, g + 1, z);
          if (n !== 'minecraft:fence_gate' || d.states['minecraft:cardinal_direction'].value !== p.side) badPen++;
        } else if (n !== 'minecraft:oak_fence' || name(w, x, g + 2, z) !== 'minecraft:oak_fence') badPen++;   // two high
      }
      for (const a of p.animals) if (a.x <= p.x0 || a.x >= p.x1 || a.z <= p.z0 || a.z >= p.z1 || a.type !== p.kind) badPen++;
      if (!p.animals.length) badPen++;
    }
    // groves: pandas inside a fenced bamboo garden; every bamboo stands on grass or bamboo
    const pandas = r.spawns.filter((q) => q.type === 'panda');
    w.forEach((x, y, z, id) => {
      if (MATERIALS.def(id).block !== 'minecraft:bamboo') return;
      const below = name(w, x, y - 1, z);
      if (!['minecraft:bamboo', 'minecraft:grass_block', 'minecraft:sand'].includes(below)) badBamboo++;
    });
    for (const p of pandas) {
      grovesN++;
      // walk out from the panda until a fence or gate is hit in all four directions (it is enclosed)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let hit = false;
        for (let k = 1; k < 24 && !hit; k++) {
          const n = name(w, p.x + dx * k, p.y, p.z + dz * k);
          if (n === 'minecraft:oak_fence' || n === 'minecraft:fence_gate') hit = true;
        }
        if (!hit) badGrove++;
      }
    }
    w.forEach((x, y, z, id) => {
      const b = MATERIALS.def(id).block.replace('minecraft:', '');
      if (STATION_BLOCKS.includes(b)) stations.add(b);
      if (/^(wheat|carrots|beetroot|potatoes)$/.test(b)) crops.add(b);
      if (b === 'hay_block') hay++;
      if (b === 'lantern') lamps++;
      if (b === 'chest') chests++;
      if (b === 'lectern') lecterns++;
    });
    const v = verifyAll(w, r.buildings);
    check(`animals ${seed}: every building floor still reachable`, v.floorsReached === v.floorsChecked);
  }
  check('pens: fenced two high all round, one gate facing the street, animals inside', pens > 0 && badPen === 0, `${badPen} problems in ${pens} pens`);
  check('pens: all four kinds of farm animal appear', kinds.size === 4, [...kinds].join(','));
  check('groves: every panda is fenced in on all sides', grovesN > 0 && badGrove === 0, `${badGrove} open sides`);
  check('groves: every bamboo stalk stands on grass, sand or bamboo', badBamboo === 0, `${badBamboo}`);
  check('interiors: every villager workstation appears (all 13 professions)', stations.size === 13,
    STATION_BLOCKS.filter((b) => !stations.has(b)).join(','));
  check('farms: all four crops grow, including potatoes', crops.size === 4, [...crops].join(','));
  check('variety: hay, lanterns, chests and lecterns placed', hay > 0 && lamps > 0 && chests > 0 && lecterns > 0,
    `hay ${hay} lanterns ${lamps} chests ${chests} lecterns ${lecterns}`);
  note(`${pens} pens (${[...kinds].join(', ')}) · ${grovesN} pandas in groves · ${stations.size} workstation types · ` +
    `${hay} hay · ${lamps} lanterns · ${chests} chests · ${lecterns} lecterns`);
}

// ===========================================================================
// 2h. landmarks
// ===========================================================================
section('2h. landmarks');
{
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
    // each is among the lots nearest downtown
    for (const l of r.landmarks) {
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
  check('landmarks: all near downtown', farAway === 0, `${farAway} too far`);
  check('town hall: its bell is the village bell, standing in the forecourt; belfry bell hangs from the roof', badBell === 0, `${badBell}`);
  check('clock tower: all four faces read correctly from outside (hour hand at 3)', faces > 0 && badFace === 0, `${badFace} wrong cells`);
  check('market: every stall has four posts, a full canopy and goods', stalls > 0 && badStall === 0, `${badStall} problems in ${stalls}`);
  check('library: bookshelves on every floor', shelvesLow === 0, `${shelvesLow} bare floors`);
  const off = generateCity({ ...DEFAULTS, size: 160, seed: 12345, landmarks: false });
  check('landmarks: none when switched off', off.landmarks.length === 0);
  note(`${cities} cities, all four landmarks in ${complete} · ${faces} clock faces · ${stalls} market stalls`);
}

// ===========================================================================
// 2i. organic outline and hills
// ===========================================================================
section('2i. outline and hills');
{
  let cities = 0, irregular = 0, badPiece = 0, outside = 0, raisedNoStairs = 0, unreached = 0, total = 0;
  let raised = 0, stairs = 0, streetsNotLevel = 0, hollow = 0, maxE = 0;
  let badFacing = 0, straightRuns = 0, stairsAll = 0, badStraight = 0;
  const WD = { '1,0': 0, '-1,0': 1, '0,1': 2, '0,-1': 3 };      // weirdo_direction: east, west, south, north
  for (const [size, seed, transit] of [[160, 12345, 'roads'], [192, 1, 'rails'], [128, 2, 'trams'], [224, 3, 'rails'],
                                         [96, 4, 'roads'], [256, 5, 'rails'], [160, 6, 'trams'], [192, 7, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit, hills: 3 });
    const w = r.world, { W, D, mask, use } = r.plan;
    cities++;
    // outline: irregular (clearly not the full rectangle), one connected piece, nothing outside it
    let area = 0; for (let i = 0; i < W * D; i++) if (mask[i]) area++;
    if (area < W * D * 0.95) irregular++;
    const seen = new Uint8Array(W * D); let first = mask.indexOf(1), comps = 0;
    for (let i0 = 0; i0 < W * D; i0++) {
      if (!mask[i0] || seen[i0]) continue;
      comps++;
      const q = [i0]; seen[i0] = 1;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, z = (i - x) / W;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, j = nz * W + nx;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D || !mask[j] || seen[j]) continue;
          seen[j] = 1; q.push(j);
        }
      }
    }
    if (comps !== 1 || first < 0) badPiece++;
    w.forEach((x, y, z) => { if (x < 0 || z < 0 || x >= W || z >= D || !mask[z * W + x]) outside++; });
    // hills
    for (const b of r.hills.blocks) {
      if (!b.e) continue;
      raised++; maxE = Math.max(maxE, b.e);
      const n = r.stairRuns.filter((s2) => s2.block.x0 === b.x0 && s2.block.z0 === b.z0).length;
      stairs += n;
      if (!n) raisedNoStairs++;
      // the terrace is solid from the base up to its surface (staircase cells
      // are cut down on purpose; below each step they must still be solid)
      const stairAt = new Map();
      for (const s2 of r.stairRuns) s2.cells.forEach(([sx, sz], i) => stairAt.set(sx + ',' + sz, i));
      for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
        const i = stairAt.get(x + ',' + z);
        const topSolid = i === undefined ? 1 + b.e : 1 + i;       // step i sits on solid ground up to y = 1 + i
        for (let y = 0; y <= topSolid; y++) if (!w.has(x, y, z)) hollow++;
      }
    }
    // streets stay level: every road cell has its surface at the street level
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++)
      if (use[z * W + x] === USE.ROAD && r.groundAt(x, z) !== 1) streetsNotLevel++;
    total += r.reach.total; unreached += r.reach.unreached.length;
    for (const run of r.stairRuns) {
      stairsAll++;
      if (run.kind === 'straight') {
        straightRuns++;
        if (run.dir[0] !== -run.out[0] || run.dir[1] !== -run.out[1]) badStraight++;
      }
      run.cells.forEach(([x, z], i) => {
        const id = w.get(x, 2 + i, z);
        const d = id < 0 ? null : MATERIALS.def(id);
        if (!d || !/_stairs$/.test(d.block) || d.states.weirdo_direction.value !== WD[run.dir.join()]) badFacing++;
      });
    }
  }
  check('outline: every organic city is irregular, not the full rectangle', irregular === cities, `${irregular}/${cities}`);
  check('outline: every city is one connected piece', badPiece === 0, `${badPiece} split`);
  check('outline: nothing is placed outside the city outline', outside === 0, `${outside} blocks`);
  check('hills: blocks are raised, up to three', raised > 0 && maxE === 3, `${raised} raised, max ${maxE}`);
  check('hills: every raised block has a staircase from the street', raisedNoStairs === 0, `${raisedNoStairs} without`);
  check('hills: every building door can be walked to from the streets', unreached === 0, `${unreached}/${total} unreachable`);
  check('hills: streets stay level (railway untouched)', streetsNotLevel === 0, `${streetsNotLevel}`);
  check('hills: every step faces the way its staircase climbs', badFacing === 0, `${badFacing} wrong`);
  check('hills: most staircases climb straight in from the street, facing it', straightRuns >= stairsAll * 0.75 && badStraight === 0,
    `${straightRuns}/${stairsAll} straight, ${badStraight} not facing the street`);
  check('hills: terraces are solid underneath', hollow === 0, `${hollow} gaps`);
  note(`${cities} cities · ${raised} raised blocks · ${stairs} staircases · ${total - unreached}/${total} doors reachable from the streets`);

  // the other settings still work: square outline, no hills
  const sq = generateCity({ ...DEFAULTS, size: 160, seed: 12345, outline: 'square', transit: 'rails' });
  let sqArea = 0; for (const v of sq.plan.mask) if (v) sqArea++;
  check('square outline: fills the whole plan, loop and gates intact', sqArea === sq.plan.W * sq.plan.D && sq.transit.stats.loop && sq.wall.gates.length === 4);
  check('square outline: every door reachable', sq.reach.unreached.length === 0);
  const flat = generateCity({ ...DEFAULTS, size: 160, seed: 12345, hills: 0 });
  check('hills off: no raised blocks, no staircases', flat.hills.blocks.every((b) => !b.e) && flat.stairRuns.length === 0);
}

// ===========================================================================
// 2j. city styles
// ===========================================================================
section('2j. city styles');
{
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const SOIL = { flower: ['minecraft:grass_block', 'minecraft:dirt'],
    dead: ['minecraft:sand', 'minecraft:hardened_clay', 'minecraft:grass_block', 'minecraft:dirt'] };
  const FLOWER_NAMES = new Set(['dandelion', 'cornflower', 'allium', 'azure_bluet', 'blue_orchid', 'poppy', 'oxeye_daisy',
    'lily_of_the_valley', 'pink_tulip', 'red_tulip', 'pink_petals'].map((n) => 'minecraft:' + n));
  const summary = [];
  for (const st of Object.keys(STYLES)) {
    for (const [size, seed, transit] of [[160, 12345, 'rails'], [128, 3, 'roads']]) {
      const r = generateCity({ ...DEFAULTS, size, seed, transit, cityStyle: st });
      const w = r.world;
      const tag = `${st} ${size}/${seed}`;
      const v = verifyAll(w, r.buildings);
      check(`${tag}: every floor reachable`, v.ok === v.total && v.floorsReached === v.floorsChecked, `${v.floorsReached}/${v.floorsChecked}`);
      check(`${tag}: every door reachable from the streets`, r.reach.unreached.length === 0, `${r.reach.unreached.length} not`);
      // no role material the style restyles is left behind
      const table = remapTable(STYLES[st], [...FLOWERS]);
      let leftover = 0;
      w.forEach((x, y, z, id) => { if (table.has(id)) leftover++; });
      check(`${tag}: every restyled material replaced`, leftover === 0, `${leftover} left`);
      // plants on proper ground, cacti with four open sides, snow on solid ground
      let badPlant = 0, badCactus = 0, badSnow = 0, snow = 0, cacti = 0, petals = 0, dead = 0;
      w.forEach((x, y, z, id) => {
        const b = MATERIALS.def(id).block;
        const below = name(w, x, y - 1, z);
        if (FLOWER_NAMES.has(b)) { if (!SOIL.flower.includes(below)) badPlant++; if (b === 'minecraft:pink_petals') petals++; }
        else if (b === 'minecraft:deadbush') { dead++; if (!SOIL.dead.includes(below)) badPlant++; }
        else if (b === 'minecraft:cactus') {
          cacti++;
          if (below !== 'minecraft:sand' && below !== 'minecraft:cactus') badCactus++;
          // only something solid beside it breaks a cactus (a flower or dead bush does not)
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = w.get(x + dx, y, z + dz);
            if (n !== -1 && !MATERIALS.isPassable(n)) badCactus++;
          }
        } else if (b === 'minecraft:snow_layer') {
          snow++;
          const bid = w.get(x, y - 1, z);
          if (bid < 0 || MATERIALS.isPassable(bid)) badSnow++;
        }
      });
      check(`${tag}: flowers and bushes stand on soil they can grow on`, badPlant === 0, `${badPlant}`);
      check(`${tag}: every cactus on sand with nothing solid beside it`, badCactus === 0, `${badCactus}`);
      check(`${tag}: snow only on solid ground`, badSnow === 0, `${badSnow}`);
      if (st === 'snowy') check(`${tag}: snow covers open ground`, snow > 500, String(snow));
      if (st === 'desert') check(`${tag}: cacti and dead bushes in the desert`, cacti > 0 && dead > 0, `${cacti} cacti, ${dead} bushes`);
      if (st === 'cherry') check(`${tag}: pink petals among the flowers`, petals > 0, String(petals));
      if (size === 160) summary.push(`${st}: ${cacti ? cacti + ' cacti · ' : ''}${snow ? snow + ' snow · ' : ''}${petals ? petals + ' petals · ' : ''}${r.buildings.length} buildings`);
    }
  }
  // every style, default settings: at least four pens, one of each farm animal, well stocked
  {
    let short = [];
    for (const st of Object.keys(STYLES)) for (const [size, seed] of [[160, 12345], [128, 3], [224, 4]]) {
      const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st });
      const kinds = new Set(r.ranches.map((x) => x.kind));
      if (r.ranches.length < 4 || kinds.size < 4 || r.ranches.some((x) => x.animals.length < 4)) short.push(`${st} ${size}/${seed}: ${r.ranches.length} pens`);
    }
    check('pens: every city, every style, has at least four pens with all four farm animals', short.length === 0, short.join('; '));
  }
  // golems scale with the slider
  const g0 = generateCity({ ...DEFAULTS, size: 160, seed: 12345, golemsPer10: 0 }).spawns.filter((p) => p.type === 'golem').length;
  const g5 = generateCity({ ...DEFAULTS, size: 160, seed: 12345, golemsPer10: 5 }).spawns.filter((p) => p.type === 'golem').length;
  check('golems: none at 0 per 10 villagers, more at 5', g0 === 0 && g5 >= 20, `${g0} / ${g5}`);
  note(summary.join('\n   '));
}

// ===========================================================================
// 2k. real rooms
// ===========================================================================
section('2k. rooms');
{
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
      const r0 = b.rects[0];
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

// ===========================================================================
// 2l. canal, dock, art, new landmarks
// ===========================================================================
section('2l. canal, art, new landmarks');
{
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const { edgeDistance } = await import('../engine/transit.js');
  let canals = 0, badOpen = 0, badBridge = 0, nearWall = 0, bridges = 0, rails = 0, docks = 0, dockUnreached = 0, badDock = 0;
  let panels = 0, badPanel = 0, complete = 0, cities = 0;
  let pews = 0, spires = 0, bells = 0, classrooms = 0, lecterns = 0, bands = 0, lanterns = 0, lhFar = 0, castles = 0, notHighest = 0, merlons = 0, turrets = 0;
  let schools = 0, porchBad = 0, signs = 0, signBad = 0, signable = 0, cupolas = 0, fields = 0, fieldBad = 0, desksN = 0, chairBad = 0;
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
        // chairs: every oak stair in a classroom has a desk in front of it, on the lectern's side
        L.rec.roomPlans.forEach((plan, k) => {
          if (!plan) return;
          const y = L.rec.floorYs[k] + 1;
          for (const rm of plan.rooms) if (rm.type === 'classroom')
            for (let z = rm.z0; z <= rm.z1; z++) for (let x = rm.x0; x <= rm.x1; x++) {
              const id = w.get(x, y, z);
              if (id < 0 || MATERIALS.def(id).block !== 'minecraft:oak_stairs') continue;
              desksN++;
              const [bx, bz] = WDIR[MATERIALS.def(id).states.weirdo_direction.value];   // the chair back points this way
              if (name(w, x - bx, y, z - bz) !== 'minecraft:oak_slab') chairBad++;          // the desk is in front
            }
        });
        for (const plan of L.rec.roomPlans || []) if (plan) for (const rm of plan.rooms) if (rm.type === 'classroom') {
          classrooms++;
          const y = L.rec.floorYs[L.rec.roomPlans.indexOf(plan)] + 1;
          let lec = false;
          for (let z = rm.z0; z <= rm.z1; z++) for (let x = rm.x0; x <= rm.x1; x++) if (name(w, x, y, z) === 'minecraft:lectern') lec = true;
          if (lec) lecterns++;
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
  check('school: classrooms, each with a lectern', classrooms > 0 && lecterns === classrooms, `${lecterns}/${classrooms}`);
  check('school: a covered porch (two columns and a roof) over the entrance', porchBad === 0 && schools === cities, `${porchBad} problems`);
  check('landmarks: every one has a standing sign with its name, beside the way to its door, facing the street',
    signs === signable && signBad === 0, `${signs}/${signable} signs, ${signBad} problems`);
  check('school: a bell hung in a cupola on the roof', cupolas === cities, `${cupolas}/${cities}`);
  check('school: where there is room, a fenced sports field with a gate and two goals, reached from the street', fields > 0 && fieldBad === 0, `${fields} fields, ${fieldBad} problems`);
  check('school: desks and chairs in rows, every chair behind a desk and facing the lectern', desksN > 0 && chairBad === 0, `${desksN} chairs, ${chairBad} facing wrong`);
  check('lighthouse: red bands, a glass lantern room with a light, beside the canal', bands === cities && lanterns === cities && lhFar === 0, `${bands} banded, ${lanterns} lit, ${lhFar} far from the water`);
  check('castle: on the highest hill, crenellated, four turrets', castles === cities && notHighest === 0 && merlons > 0 && turrets === castles * 4, `${notHighest} not on the highest hill`);
  note(`${canals} canals · ${bridges} bridges · ${docks} docks · ${panels} art panels · ${pews} pews · ${classrooms} classrooms`);
}

// ===========================================================================
// 2m. sign block entities in the export
// ===========================================================================
section('2m. signs in the export');
{
  const r = generateCity({ ...DEFAULTS, size: 160, seed: 12345 });
  const structs = buildStructures(r.world, { prefix: 'c', fillAir: true });
  const found = new Map();
  let typedOk = true;
  for (const st of structs) {
    const t = decodeTyped(st.data);
    const pal = t.v.structure.v.palette.v.default.v;
    for (const [, cell] of Object.entries((pal.block_position_data || { v: {} }).v)) {
      const be = cell.v.block_entity_data;
      if (!be || be.v.id.v !== 'Sign') continue;
      const ft = be.v.FrontText.v;
      found.set(ft.Text.v, be);
      // the field types, exactly as in a sign saved in game
      const want = { FilteredText: 8, HideGlowOutline: 1, IgnoreLighting: 1, PersistFormatting: 1, SignTextColor: 3, Text: 8, TextOwner: 8 };
      for (const [k, tt] of Object.entries(want)) if (!ft[k] || ft[k].t !== tt) typedOk = false;
      if (be.v.IsWaxed.t !== 1 || be.v.BlockEntityVersion.t !== 3 || be.v.x.t !== 3) typedOk = false;
    }
  }
  const names = r.landmarks.map((l) => LANDMARK_NAMES[l.kind]);
  check('export: every landmark\'s sign reaches the structure file with its text', names.every((n) => found.has(n)), [...found.keys()].join(', '));
  check('export: sign fields typed exactly as a sign saved in game', typedOk && found.size > 0);
  note(`${found.size} signs in the structure files: ${[...found.keys()].join(', ')}`);
}

// ===========================================================================
// 2n. the centre marker
// ===========================================================================
section('2n. centre marker');
{
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  let cities = 0, marked = 0, bad = 0, landedWrong = 0, maxDrift = 0;
  for (const [size, seed, transit] of [[160, 12345, 'roads'], [192, 1, 'rails'], [224, 3, 'trams'], [128, 2, 'rails'], [96, 4, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit });
    const w = r.world;
    cities++;
    if (!r.centre) continue;
    marked++;
    const [mx, my, mz] = r.centre.block;
    maxDrift = Math.max(maxDrift, r.centre.drift);
    if (name(w, mx, my, mz) !== 'minecraft:gold_block') bad++;
    for (let k = 1; k <= 3; k++) if (w.has(mx, my + k, mz)) bad++;               // room to stand
    const [sx, sy, sz] = r.centre.sign;
    const sd = w.getData(sx, sy, sz);
    if (name(w, sx, sy, sz) !== 'minecraft:standing_sign' || !sd || !/city centre/.test(sd.tags.FrontText.v.Text.v)) bad++;
    if (Math.abs(sx - mx) + Math.abs(sz - mz) !== 1) bad++;                      // right beside it
    // the sign faces the marker, so it reads from the gold block
    const FACE = { 0: [0, 1], 4: [-1, 0], 8: [0, -1], 12: [1, 0] };              // sign direction -> way it faces
    const f = FACE[MATERIALS.def(w.get(sx, sy, sz)).states.ground_sign_direction.value];
    if (sx + f[0] !== mx || sz + f[1] !== mz) bad++;
    // build_centered must drop the marker right under the player's feet
    const tiles = tileList(w, { prefix: 'c', fillAir: true });
    const cx = w.centre[0], cz = w.centre[1];
    const rel = tiles.map((t) => [t.box.x0 - cx, t.box.y0 - GROUND_DROP, t.box.z0 - cz]);
    const host = tiles.findIndex((t) => mx >= t.box.x0 && mx <= t.box.x1 && mz >= t.box.z0 && mz <= t.box.z1);
    const [rx, ry, rz] = rel[host];
    const landed = [rx + (mx - tiles[host].box.x0), ry + (my - tiles[host].box.y0), rz + (mz - tiles[host].box.z0)];
    if (landed.join() !== '0,-1,0') landedWrong++;
  }
  check('centre marker: in every city, a gold block with room to stand', marked === cities && bad === 0, `${marked}/${cities}, ${bad} problems`);
  check('centre marker: build_centered puts it directly under the player', landedWrong === 0, `${landedWrong} wrong`);
  const off = generateCity({ ...DEFAULTS, size: 160, seed: 12345, centreMark: false });
  check('centre marker: none when switched off, and the export falls back to the middle', !off.centre && !off.world.centre);
  note(`${marked} markers, at most ${maxDrift} blocks from the exact middle (it must stand outdoors, level and off the railway)`);
}

// ===========================================================================
// 2o. facade detail, shopfronts, street names, the mansion
// ===========================================================================
section('2o. detail, shops, street names, mansion');
{
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
  check('mansion: in every test city, with its portico, an open gate and sound wings', mansions === cities && mansionBad === 0,
    `${mansions}/${cities}, ${mansionBad} problems`);
  note(`${shops} shopfronts (${[...shopNames].slice(0, 6).join(', ')}...) · ${junctions} street signs · ${mansions} mansions (${gardens} with formal gardens)`);
}

// ===========================================================================
// 3. chunk split coverage
// ===========================================================================
section('3. chunk split');
{
  const w = biggest.world;
  const chunks = splitWorld(w, CHUNK);
  const seen = new Set();
  let dup = 0, wide = 0, mismatched = 0;
  for (const c of chunks) {
    if (c.x1 - c.x0 + 1 > CHUNK || c.z1 - c.z0 + 1 > CHUNK) wide++;
    for (let i = 0; i < c.keys.length; i++) {
      const k = c.keys[i];
      if (seen.has(k)) dup++;
      seen.add(k);
      if (w.cells.get(k) !== c.ids[i]) mismatched++;
    }
  }
  check('split: every cell appears exactly once', seen.size === w.size && dup === 0,
    `${seen.size} vs ${w.size}, ${dup} duplicated`);
  check('split: no chunk exceeds 64 across', wide === 0, `${wide} oversized`);
  check('split: ids preserved', mismatched === 0, `${mismatched} wrong`);
  note(`${chunks.length} chunks covering ${w.size.toLocaleString()} blocks`);
}

// ===========================================================================
// 4. .mcstructure NBT round-trip
// ===========================================================================
section('4. mcstructure round-trip');
{
  const structures = buildStructures(biggest.world, { prefix: 'c' });
  check('structures produced', structures.length > 0);
  const s = structures.reduce((a, b) => (b.cells > a.cells ? b : a));
  const { root } = decodeNbt(s.data);
  const size = root.size;
  check('nbt: format_version present', root.format_version === 1, String(root.format_version));
  check('nbt: size matches box', size && size.length === 3 &&
    size[0] === s.size[0] && size[1] === s.size[1] && size[2] === s.size[2],
    [...(size || [])].join(',') + ' vs ' + s.size.join(','));
  check('nbt: world origin present', root.structure_world_origin && root.structure_world_origin.length === 3);
  const st = root.structure;
  const layers = st.block_indices;
  check('nbt: two block index layers', layers.length === 2, String(layers.length));
  const n = size[0] * size[1] * size[2];
  check('nbt: layer 0 length', layers[0].length === n, `${layers[0].length} vs ${n}`);
  check('nbt: layer 1 length', layers[1].length === n, `${layers[1].length} vs ${n}`);
  let l1bad = 0;
  for (let i = 0; i < layers[1].length; i++) if (layers[1][i] !== -1) l1bad++;
  check('nbt: layer 1 is all empty', l1bad === 0, `${l1bad} set`);

  const pal = st.palette.default.block_palette;
  check('nbt: palette size matches', pal.length === s.paletteSize, `${pal.length} vs ${s.paletteSize}`);
  let idxBad = 0, filled = 0;
  for (let i = 0; i < layers[0].length; i++) {
    const v = layers[0][i];
    if (v === -1) continue;
    filled++;
    if (v < 0 || v >= pal.length) idxBad++;
  }
  check('nbt: indices inside palette', idxBad === 0, `${idxBad} out of range`);
  check('nbt: filled cell count matches', filled === s.cells, `${filled} vs ${s.cells}`);

  // spot-check the mapping: decode a handful of cells back to material ids
  const [sx, sy, sz] = size;
  let spotBad = 0, spots = 0;
  for (let i = 0; i < layers[0].length && spots < 400; i += 37) {
    const v = layers[0][i];
    if (v === -1) continue;
    spots++;
    const z = i % sz, rest = (i - z) / sz;
    const y = rest % sy, x = (rest - y) / sy;
    const id = biggest.world.get(s.box.x0 + x, s.box.y0 + y, s.box.z0 + z);
    if (id === -1) { spotBad++; continue; }
    if (pal[v].name !== MATERIALS.def(id).block) spotBad++;
  }
  check('nbt: index order maps back to the right block', spotBad === 0, `${spotBad}/${spots} wrong`);

  let palBad = 0;
  for (const p of pal) {
    if (typeof p.name !== 'string' || !/^minecraft:[a-z0-9_]+$/.test(p.name)) palBad++;
    if (typeof p.version !== 'number' || p.version <= 0) palBad++;
    if (typeof p.states !== 'object') palBad++;
  }
  check('nbt: palette entries well formed', palBad === 0, `${palBad} problems`);
  note(`largest chunk ${s.size.join('×')} · ${s.cells.toLocaleString()} cells · ` +
    `${s.paletteSize} palette entries · ${(s.data.length / 1024).toFixed(0)} KiB`);
}

// ===========================================================================
// 5. palette / block id sanity across the whole registry
// ===========================================================================
section('5. block registry');
{
  let bad = 0, stateBad = 0;
  for (let i = 0; i < MATERIALS.length; i++) {
    const d = MATERIALS.def(i);
    if (!/^minecraft:[a-z0-9_]+$/.test(d.block)) { bad++; note('bad id: ' + d.block); }
    for (const k of Object.keys(d.states)) {
      const s = d.states[k];
      if (!s || !['byte', 'int', 'string'].includes(s.type)) stateBad++;
      if (!/^[a-z0-9_:]+$/.test(k)) stateBad++;
    }
    if (d.color.some((c) => !(c >= 0 && c <= 1))) bad++;
  }
  check('registry: all block ids are flattened minecraft ids', bad === 0, `${bad} bad`);
  check('registry: all block states well typed', stateBad === 0, `${stateBad} bad`);
  note(`${MATERIALS.length} distinct block+state combinations in use`);
}

// ===========================================================================
// 6. .mcpack zip round-trip
// ===========================================================================
section('6. mcpack zip');
{
  const small = generateCity({ ...DEFAULTS, size: 96, seed: 31 });
  const structures = buildStructures(small.world, { prefix: 'c' });
  const guide = placementGuide(structures, { base: [10, 64, -20] });
  const zipBytes = await buildMcPack(structures, { guide, deflateRaw, rand: () => 0.5 });
  const z = readZip(zipBytes);
  check('zip: entry count matches directory', z.entries.length === z.count, `${z.entries.length}/${z.count}`);
  const names = z.entries.map((e) => e.name);
  check('zip: manifest present', names.includes('manifest.json'));
  check('zip: guide present', names.includes('placement-guide.txt'));
  check('zip: one structure file per chunk',
    names.filter((n) => n.endsWith('.mcstructure')).length === structures.length,
    `${names.filter((n) => n.endsWith('.mcstructure')).length} vs ${structures.length}`);
  check('zip: structures live under structures/polis/',
    names.filter((n) => n.endsWith('.mcstructure')).every((n) => n.startsWith('structures/polis/')));

  const inflate = (e) => {
    const p = localPayload(zipBytes, e);
    return e.method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(p))) : p;
  };
  const man = z.entries.find((e) => e.name === 'manifest.json');
  let manifest = null;
  try { manifest = JSON.parse(new TextDecoder().decode(inflate(man))); } catch (e) { /* caught below */ }
  check('zip: manifest.json parses', !!manifest);
  if (manifest) {
    check('manifest: format_version 2', manifest.format_version === 2);
    check('manifest: header uuid looks like a uuid',
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(manifest.header.uuid),
      manifest.header.uuid);
    check('manifest: has a data module', manifest.modules.some((m) => m.type === 'data'));
    check('manifest: module uuid differs from header uuid',
      manifest.modules[0].uuid !== manifest.header.uuid);
    check('manifest: min_engine_version set', Array.isArray(manifest.header.min_engine_version));
  }

  // payload fidelity for every structure entry
  let byteBad = 0, crcBad = 0;
  for (const e of z.entries.filter((x) => x.name.endsWith('.mcstructure'))) {
    const src = structures.find((s) => e.name.endsWith(`/${s.name}.mcstructure`));
    const got = inflate(e);
    if (!src || got.length !== src.data.length) { byteBad++; continue; }
    for (let i = 0; i < got.length; i++) if (got[i] !== src.data[i]) { byteBad++; break; }
    if (e.raw !== src.data.length) crcBad++;
  }
  check('zip: structure payloads survive the round trip', byteBad === 0, `${byteBad} corrupted`);
  check('zip: uncompressed sizes recorded correctly', crcBad === 0, `${crcBad} wrong`);

  // guide has one load command per structure and correct offsets
  const cmds = guide.split('\n').filter((l) => l.includes('/structure load'));
  check('guide: one command per structure', cmds.length === structures.length,
    `${cmds.length} vs ${structures.length}`);
  let cmdBad = 0;
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    const want = `/structure load polis:${s.name} ${10 + s.offset[0]} ${64 + s.offset[1]} ${-20 + s.offset[2]}`;
    if (cmds[i].trim() !== want) { cmdBad++; if (cmdBad === 1) note('got: ' + cmds[i].trim() + '\n   want: ' + want); }
  }
  check('guide: commands carry the right base offsets', cmdBad === 0, `${cmdBad} wrong`);
  note(`${structures.length} structures · zip ${(zipBytes.length / 1024).toFixed(0)} KiB ` +
    `(deflated from ${(structures.reduce((a, s) => a + s.data.length, 0) / 1024).toFixed(0)} KiB)`);
}

// ===========================================================================
// 6b. air fill + one-command functions, end to end
// ===========================================================================
section('6b. air fill and /function build');
refreshWalkThrough();
{
  const city = generateCity({ ...DEFAULTS, size: 160, seed: 41 });
  const w = city.world, wb = w.box;
  const out = await exportPack(w, { fillAir: true, deflateRaw, rand: Math.random });
  const z = readZip(out.data);
  const inflate = (e) => {
    const p = localPayload(out.data, e);
    return e.method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(p))) : p;
  };
  const byName = new Map(z.entries.map((e) => [e.name, e]));
  const fnBuild = byName.get('functions/polis/build.mcfunction');
  const fnCent = byName.get('functions/polis/build_centered.mcfunction');
  check('pack: functions/polis/build.mcfunction present', !!fnBuild);
  check('pack: functions/polis/build_centered.mcfunction present', !!fnCent);

  // parse a function into [name, dx, dy, dz]
  const parseFn = (e) => {
    const lines = new TextDecoder().decode(inflate(e)).split('\n')
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('say ') && !l.startsWith('tickingarea '));
    return lines.map((l) => {
      const m = l.match(/^structure load polis:(\S+) (~-?\d*) (~-?\d*) (~-?\d*)$/);
      if (!m) return { bad: l };
      const n = (t) => (t === '~' ? 0 : Number(t.slice(1)));
      return { name: m[1], d: [n(m[2]), n(m[3]), n(m[4])] };
    });
  };
  const build = fnBuild ? parseFn(fnBuild) : [];
  const cent = fnCent ? parseFn(fnCent) : [];
  check('function: every command is a valid relative structure load or say (no leading slash)',
    build.every((l) => !l.bad) && cent.every((l) => !l.bad),
    (build.concat(cent).find((l) => l.bad) || {}).bad);
  check('function: one line per structure', build.length === out.structures.length && cent.length === out.structures.length,
    `${build.length}/${cent.length} vs ${out.structures.length}`);

  // decode every tile and check the air fill
  const tiles = new Map();
  let voidsInside = 0, voidsOutside = 0, notAir0 = 0, heightBad = 0, footprint = 0, wideBad = 0;
  const cityMask = w.cityMask;
  const insideCity = (x, z) => !cityMask || (x >= 0 && z >= 0 && x < cityMask.W && z < cityMask.D && cityMask.data[z * cityMask.W + x] === 1);
  for (const st of out.structures) {
    const e = byName.get(`structures/polis/${st.name}.mcstructure`);
    const { root } = decodeNbt(inflate(e));
    const pal = root.structure.palette.default.block_palette;
    const l0 = root.structure.block_indices[0];
    const [ox, oy, oz] = root.structure_world_origin, [ssx, ssy, ssz] = root.size;
    for (let i = 0; i < l0.length; i++) {
      if (l0[i] !== -1) continue;
      const zz = i % ssz, rr = (i - zz) / ssz, x = (rr - (rr % ssy)) / ssy;
      if (insideCity(ox + x, oz + zz)) voidsInside++; else voidsOutside++;
    }
    if (pal[0].name !== 'minecraft:air') notAir0++;
    if (root.size[1] !== wb.y1 - wb.y0 + 1) heightBad++;
    if (root.size[0] > 64 || root.size[2] > 64) wideBad++;
    footprint += root.size[0] * root.size[2];
    tiles.set(st.name, { size: [...root.size], pal, l0 });
  }
  check('air fill: no structure-void cells inside the outline (void only outside it)', voidsInside === 0, `${voidsInside} void inside`);
  check('air fill: land outside an organic outline is left untouched', !cityMask || voidsOutside > 0);
  check('air fill: air is in every palette', notAir0 === 0, `${notAir0} tiles without`);
  check('air fill: every tile spans the full city height', heightBad === 0, `${heightBad} short`);
  check('air fill: tiles stay within 64 across', wideBad === 0);
  // every column of the city lies in exactly one tile (tiles outside an
  // organic outline, where there is nothing, are simply not written)
  {
    const covered = new Map();
    for (const st of out.structures) for (let x = st.box.x0; x <= st.box.x1; x++) for (let z = st.box.z0; z <= st.box.z1; z++)
      covered.set(x + ',' + z, (covered.get(x + ',' + z) || 0) + 1);
    let missingCols = 0, doubled = 0;
    for (let z = wb.z0; z <= wb.z1; z++) for (let x = wb.x0; x <= wb.x1; x++) {
      const n = covered.get(x + ',' + z) || 0;
      if (insideCity(x, z) && n === 0) missingCols++;
      if (n > 1) doubled++;
    }
    check('air fill: every city column lies in exactly one tile', missingCols === 0 && doubled === 0, `${missingCols} missing, ${doubled} doubled`);
  }

  // simulate running each function from a player position into a world that
  // already contains junk, then compare cell-for-cell with the source city
  const simulate = (lines, player) => {
    const placed = new Map();   // "x,y,z" -> block name
    for (const ln of lines) {
      const t = tiles.get(ln.name);
      const [sx, sy, sz] = t.size;
      const ox = player[0] + ln.d[0], oy = player[1] + ln.d[1], oz = player[2] + ln.d[2];
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let zz = 0; zz < sz; zz++) {
        const v = t.l0[(x * sy + y) * sz + zz];
        if (v >= 0) placed.set(`${ox + x},${oy + y},${oz + zz}`, t.pal[v].name);
      }
    }
    return placed;
  };
  const player = [1000, 70, -500];
  const verifyPlacement = (placed, cornerX, cornerZ, label) => {
    let wrong = 0, missing = 0, extra = 0;
    const ground = player[1] - 1;            // block under the player's feet
    const oy = ground - 1;                   // city y=1 (surface) lands there, so y=0 at ground-1
    w.forEach((x, y, zz, id) => {
      const k = `${cornerX + (x - wb.x0)},${oy + y},${cornerZ + (zz - wb.z0)}`;
      const got = placed.get(k);
      if (got === undefined) missing++;
      else if (got !== MATERIALS.def(id).block) wrong++;
    });
    let airCount = 0;
    for (const v of placed.values()) if (v === 'minecraft:air') airCount++;
    let area = 0;
    for (let z = wb.z0; z <= wb.z1; z++) for (let x = wb.x0; x <= wb.x1; x++) if (insideCity(x, z)) area++;
    const vol = area * (wb.y1 - wb.y0 + 1);          // the city's columns, full height
    extra = placed.size - vol;
    check(`${label}: every block lands in the right place`, wrong === 0 && missing === 0, `${wrong} wrong, ${missing} missing`);
    check(`${label}: every column inside the outline written, nothing outside it`, extra === 0, `${extra} extra`);
    check(`${label}: every empty cell is air`, airCount === vol - w.size, `${airCount} vs ${vol - w.size}`);
  };
  verifyPlacement(simulate(build, player), player[0], player[2], 'build');
  const cx = Math.floor((wb.x0 + wb.x1 + 1) / 2), cz = Math.floor((wb.z0 + wb.z1 + 1) / 2);
  verifyPlacement(simulate(cent, player), player[0] - (cx - wb.x0), player[2] - (cz - wb.z0), 'build_centered');
  check('build: surface layer replaces the block under your feet', GROUND_DROP === 2);

  // with air fill off, empty cells stay as structure void
  const plain = buildStructures(w, { fillAir: false });
  let plainVoids = 0, plainAir = 0;
  for (const st of plain.slice(0, 2)) {
    const { root } = decodeNbt(st.data);
    const l0 = root.structure.block_indices[0];
    for (let i = 0; i < l0.length; i++) if (l0[i] === -1) plainVoids++;
    if (root.structure.palette.default.block_palette.some((p) => p.name === 'minecraft:air')) plainAir++;
  }
  check('air off: empty cells remain structure void', plainVoids > 0);
  check('air off: no air in palettes', plainAir === 0);
  note(`${out.structures.length} tiles · ${(out.data.length / 1024).toFixed(0)} KiB pack · ` +
    `simulated both functions cell-for-cell against the source world`);
}

// ===========================================================================
// 6c. per-city namespaces: packs must not collide
// ===========================================================================
section('6c. city ids');
{
  const A1 = generateCity({ ...DEFAULTS, size: 128, seed: 12345 });
  const idA1 = cityId(A1.world, 12345);
  // churn the material registry with other generations, then regenerate
  generateCity({ ...DEFAULTS, size: 96, seed: 7, useStairs: false });
  generateSingle({ ...DEFAULTS, style: 'house', floors: 3, pitch: 6, bw: 11, bd: 11, seed: 3 });
  const A2 = generateCity({ ...DEFAULTS, size: 128, seed: 12345 });
  const idA2 = cityId(A2.world, 12345);
  const B = generateCity({ ...DEFAULTS, size: 128, seed: 12345, maxFloors: 9 });
  const idB = cityId(B.world, 12345);
  const C = generateCity({ ...DEFAULTS, size: 128, seed: 12346 });
  const idC = cityId(C.world, 12346);

  check('city id: valid Bedrock namespace', /^[a-z0-9_]+$/.test(idA1), idA1);
  check('city id: starts with polis_ and carries the seed', idA1.startsWith('polis_12345_'), idA1);
  check('city id: same city -> same id, even after other generations', idA1 === idA2, `${idA1} vs ${idA2}`);
  check('city id: same seed, different settings -> different id', idA1 !== idB, `${idA1} vs ${idB}`);
  check('city id: different seed -> different id', idA1 !== idC);
  check('city id: negative seeds still valid', /^polis_\d+_[0-9a-f]{4}$/.test(cityId(A1.world, -5)));

  // two packs exported together share no structure or function paths
  const pa = await exportPack(A1.world, { namespace: idA1, seed: 12345, deflateRaw });
  const pb = await exportPack(B.world, { namespace: idB, seed: 12345, deflateRaw });
  const na = new Set(readZip(pa.data).entries.map((e) => e.name).filter((n) => n !== 'manifest.json' && n !== 'placement-guide.txt'));
  const nb = readZip(pb.data).entries.map((e) => e.name).filter((n) => n !== 'manifest.json' && n !== 'placement-guide.txt');
  const clash = nb.filter((n) => na.has(n));
  check('two cities: no shared structure/function paths', clash.length === 0, clash.slice(0, 3).join(', '));

  // functions reference their own namespace, and the files live under it
  const za = readZip(pa.data);
  const fe = za.entries.find((e) => e.name === `functions/${idA1}/build_centered.mcfunction`);
  check('pack: function lives under the city namespace', !!fe);
  if (fe) {
    const p = localPayload(pa.data, fe);
    const txt = new TextDecoder().decode(fe.method === 8 ? zlib.inflateRawSync(Buffer.from(p)) : p);
    const loads = txt.split('\n').filter((l) => l.startsWith('structure load '));
    check('function: every load uses the city namespace', loads.length > 0 && loads.every((l) => l.startsWith(`structure load ${idA1}:`)));
    const paths = new Set(za.entries.map((e) => e.name));
    check('function: every referenced structure exists in the pack',
      loads.every((l) => paths.has(`structures/${idA1}/${l.split(' ')[2].split(':')[1]}.mcstructure`)));
  }
  // the guide leads with the exact command and names the seed
  const first = pa.guide.split('\n').slice(0, 8).join('\n');
  check('guide: the build command is in the first lines', first.includes(`/function ${idA1}/build_centered`));
  check('guide: names the seed and city id', pa.guide.includes('seed 12345') && pa.guide.includes(`City id  ${idA1}`));
  note(`${idA1} · ${idB} · ${idC}`);
}

// ===========================================================================
// 6d. population: mob structures, minecart summons, ticking areas, bed colours
// ===========================================================================
section('6d. population');
refreshWalkThrough();
{
  const r = generateCity({ ...DEFAULTS, size: 192, seed: 12345, transit: 'rails' });
  const ns = cityId(r.world, 12345);
  const out = await exportPack(r.world, { namespace: ns, fillAir: true, foundation: 8, clearAbove: 32, spawns: r.spawns, seed: 12345, deflateRaw });
  const z = readZip(out.data);
  const raw = (name) => {
    const e = z.entries.find((x) => x.name === name);
    if (!e) return null;
    const p = localPayload(out.data, e);
    return e.method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(p))) : p;
  };
  const text = (name) => { const b = raw(name); return b ? new TextDecoder().decode(b) : null; };
  const build = text(`functions/${ns}/build_centered.mcfunction`);
  const popul = text(`functions/${ns}/populate_centered.mcfunction`);
  check('functions: build, build_centered, populate, populate_centered present',
    !!build && !!popul && !!text(`functions/${ns}/build.mcfunction`) && !!text(`functions/${ns}/populate.mcfunction`));
  const lines = (t) => (t || '').split('\n').filter((l) => l && !l.startsWith('#'));
  const wantV = r.spawns.filter((p) => p.type === 'villager').length;
  const wantG = r.spawns.filter((p) => p.type === 'golem').length;
  const wantC = r.spawns.filter((p) => p.type === 'minecart').length;
  check('population: this city has villagers, golems and carts to place', wantV > 0 && wantG > 0 && wantC > 0);
  check('functions: nothing but minecarts is summoned (every mob travels in structures)',
    !/summon minecraft:(villager|iron_golem|cat|panda|cow|sheep|pig|chicken)/.test(build + popul));
  check('functions: build summons nothing and loads no mob structures',
    !build.includes('summon') && !lines(build).some((l) => / \S+:m_x/.test(l)));
  const mobLoads = lines(popul).filter((l) => /^structure load \S+:m_x-?\d+_z-?\d+ /.test(l));
  check('populate: one structure load per mob structure', mobLoads.length === out.mobStructures.length && mobLoads.length > 0,
    `${mobLoads.length} vs ${out.mobStructures.length}`);
  check('populate: one summon per minecart', lines(popul).filter((l) => l.startsWith('summon minecraft:minecart ')).length === wantC);
  const wantA = r.spawns.filter((p) => ['cow', 'sheep', 'pig', 'chicken'].includes(p.type)).length;
  check('populate: farm animals are no longer summoned (they travel in structures)', wantA > 0 &&
    !lines(popul).some((l) => /^summon minecraft:(cow|sheep|pig|chicken) /.test(l)));
  const adds = lines(build).filter((l) => l.startsWith('tickingarea add '));
  const removes = lines(popul).filter((l) => l.startsWith('tickingarea remove '));
  check('ticking areas: build adds them, populate removes the same ones', adds.length > 0 && adds.length <= 10 &&
    removes.length === adds.length && adds.every((l) => removes.includes('tickingarea remove ' + l.split(' ').pop())));
  const areaOk = adds.every((l) => {
    const m = l.match(/^tickingarea add (~-?\d*) (~-?\d*) (~-?\d*) (~-?\d*) (~-?\d*) (~-?\d*) [a-z0-9_]+$/);
    if (!m) return false;
    const n = (t) => (t === '~' ? 0 : Number(t.slice(1)));
    const w = n(m[4]) - n(m[1]) + 1, d = n(m[6]) - n(m[3]) + 1;
    return w > 0 && d > 0 && w <= 144 && d <= 144;   // 144 blocks can never span more than 10 chunks
  });
  check('ticking areas: well formed and each within the 100-chunk limit', areaOk);
  let covered = 0; const wb = r.world.box;
  for (const l of adds) {
    const m = l.match(/^tickingarea add (~-?\d*) \S+ (~-?\d*) (~-?\d*) \S+ (~-?\d*) /);
    const n = (t) => (t === '~' ? 0 : Number(t.slice(1)));
    covered += (n(m[3]) - n(m[1]) + 1) * (n(m[4]) - n(m[2]) + 1);
  }
  check('ticking areas: together they cover the whole city exactly', covered === (wb.x1 - wb.x0 + 1) * (wb.z1 - wb.z0 + 1));

  // decode every tile and mob structure, then place them all from an
  // off-centre player position the way the game would, and check each mob
  const typed = {};
  for (const st of out.structures.concat(out.mobStructures)) typed[st.name] = decodeTyped(raw(`structures/${ns}/${st.name}.mcstructure`));
  let entCount = 0, badEnt = 0, uids = new Set(), dupUid = 0, vCount = 0, gCount = 0, cCount = 0, pCount = 0, aCount = 0, blocksInMob = 0;
  const sheepCoats = new Set();
  const tiersSeen = new Set(); let unskilledN = 0, tierBad = 0;
  for (const st of out.mobStructures) {
    const t = typed[st.name].v;
    const l0 = t.structure.v.block_indices.v[0].v;
    for (const c of l0) if (c.v !== -1) blocksInMob++;
    for (const e of t.structure.v.entities.v) {
      entCount++;
      const v = e.v, id = v.identifier.v;
      const d = v.definitions.v.map((x) => x.v);
      if ('DwellingUniqueID' in v) badEnt++;                     // never tied to the village it was copied from
      if (id === 'minecraft:villager_v2') {
        vCount++;
        if (!d.includes('+adult') || d.includes('+nitwit')) badEnt++;
        if (d.includes('+unskilled')) { unskilledN++; if ('Offers' in v) badEnt++; }
        else {
          const tier = v.TradeTier.v, exp = v.TradeExperience.v, TE = [0, 10, 70, 150, 250];
          tiersSeen.add(tier);
          if (tier < 0 || tier > 4 || exp < TE[tier] || (tier < 4 && exp >= TE[tier + 1]) || (tier === 0 && exp < 1)) tierBad++;
          if (!v.Offers || v.Offers.v.Recipes.v.length < 5) tierBad++;
        }
      } else if (id === 'minecraft:iron_golem') gCount++;
      else if (id === 'minecraft:cat') {
        cCount++;
        const coat = CAT_COATS.find((c) => d.includes(c.def));
        if (!coat || coat.variant !== v.Variant.v || v.IsTamed.v !== 0 || v.OwnerNew.v !== -1n || !d.includes('+minecraft:cat_wild')) badEnt++;
      } else if (id === 'minecraft:panda') pCount++;
      else if (/^minecraft:(cow|pig|chicken|sheep)$/.test(id)) {
        aCount++;
        if (v.IsBaby.v !== 0 || v.LeasherID.v !== -1n || !d.some((x) => /_adult$/.test(x))) badEnt++;
        if (id === 'minecraft:sheep') {
          const coat = SHEEP_COATS.find((c) => d.includes(c.def));
          if (!coat || coat.color !== v.Color.v) badEnt++;
          sheepCoats.add(coat && coat.def);
        }
      }
      else badEnt++;
      if (v.Pos.et !== 5 || v.Pos.v.length !== 3 || v.UniqueID.t !== 4) badEnt++;
      const k = v.UniqueID.v.toString(); if (uids.has(k)) dupUid++; uids.add(k);
    }
  }
  check('mob structures: exactly the planned villagers and golems', vCount === wantV && gCount === wantG, `${vCount}/${wantV} villagers, ${gCount}/${wantG} golems`);
  const wantCat = r.spawns.filter((p) => p.type === 'cat').length, wantPanda = r.spawns.filter((p) => p.type === 'panda').length;
  check('mob structures: exactly the planned cats and pandas', cCount === wantCat && pCount === wantPanda && wantCat > 0,
    `${cCount}/${wantCat} cats, ${pCount}/${wantPanda} pandas`);
  check('mob structures: villagers adults (unemployed or with a trade); cats wild with a real coat; farm animals adult and unleashed; sheep coats match their colour; nobody tied to a village',
    badEnt === 0, `${badEnt} bad`);
  check('mob structures: exactly the planned farm animals', aCount === wantA, `${aCount}/${wantA}`);
  check('villagers: every level from novice to master among them, and some still unemployed', tiersSeen.size === 5 && unskilledN > 0,
    `levels ${[...tiersSeen].sort().join(',')}, ${unskilledN} unemployed`);
  check('villagers: each one\'s experience sits inside its level, with its whole trade table', tierBad === 0, `${tierBad} wrong`);
  check('mob structures: every entity has a unique id', dupUid === 0);
  check('mob structures: contain no blocks at all (never overwrite the city)', blocksInMob === 0, `${blocksInMob} blocks`);
  check('mob structures: palette holds one unused entry, like game-saved structures',
    out.mobStructures.every((st) => typed[st.name].v.structure.v.palette.v.default.v.block_palette.v.length === 1));

  for (const player of [[1000.3, 70, -500.2], [-37.7, 64, 12.99]]) {
    const placed = new Map();
    const loadAt = (ln) => {
      const m = ln.match(/^structure load \S+:(\S+) (~-?\d*) (~-?\d*) (~-?\d*)$/);
      if (!m) return null;
      const n = (t) => (t === '~' ? 0 : Number(t.slice(1)));
      return { name: m[1], at: [Math.floor(player[0] + n(m[2])), Math.floor(player[1] + n(m[3])), Math.floor(player[2] + n(m[4]))] };
    };
    for (const ln of lines(build)) {
      const L = loadAt(ln); if (!L) continue;
      const t = typed[L.name].v; const [sx, sy, sz] = t.size.v.map((q) => q.v);
      const pal = t.structure.v.palette.v.default.v.block_palette.v, l0 = t.structure.v.block_indices.v[0].v;
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let zz = 0; zz < sz; zz++) {
        const iv = l0[(x * sy + y) * sz + zz].v;
        if (iv >= 0) placed.set(`${L.at[0] + x},${L.at[1] + y},${L.at[2] + zz}`, pal[iv].v.name.v);
      }
    }
    const blocking = (k) => { const nm = placed.get(k); return !!nm && nm !== 'minecraft:air' && !WALK_THROUGH.has(nm); };
    let bad = 0, total = 0, first = '';
    for (const ln of mobLoads) {
      const L = loadAt(ln); const t = typed[L.name].v;
      const origin = t.structure_world_origin.v.map((q) => q.v);
      for (const e of t.structure.v.entities.v) {
        total++;
        const [px, py, pz] = e.v.Pos.v.map((q) => q.v);
        const bx = Math.floor(L.at[0] + (px - origin[0])), by = Math.floor(L.at[1] + (py - origin[1])), bz = Math.floor(L.at[2] + (pz - origin[2]));
        const tall = e.v.identifier.v === 'minecraft:iron_golem' ? 3 : 2;   // villagers, cats, pandas: 2
        let ok = blocking(`${bx},${by - 1},${bz}`);
        for (let h = 0; h < tall; h++) if (blocking(`${bx},${by + h},${bz}`)) ok = false;
        if (!ok) { bad++; if (!first) first = `${e.v.identifier.v} at ${bx},${by},${bz}`; }
      }
    }
    check(`simulated load from ${player.join(',')}: every mob (villagers, golems, cats, pandas, farm animals) lands on a floor with room to stand`,
      bad === 0 && total === wantV + wantG + wantCat + wantPanda + wantA, `${bad}/${total} bad, e.g. ${first}`);
  }

  // bed colours still land in block_position_data at the right index
  let entities = 0, bedHalves = 0, badBE = 0;
  for (const st of out.structures) {
    const t = typed[st.name].v;
    const pal = t.structure.v.palette.v.default.v.block_palette.v, l0 = t.structure.v.block_indices.v[0].v;
    const pd = t.structure.v.palette.v.default.v.block_position_data.v;
    for (const c of l0) if (c.v >= 0 && pal[c.v].v.name.v === 'minecraft:bed') bedHalves++;
    for (const [idx, v] of Object.entries(pd)) {
      const be = v.v.block_entity_data.v;
      const block = pal[l0[Number(idx)].v].v.name.v;
      if (be.id.v === 'Sign') { if (!/(standing|wall)_sign$/.test(block)) badBE++; continue; }   // name, street and shop signs: checked in 2m
      entities++;
      if (be.id.v !== 'Bed' || be.color.t !== 1 || block !== 'minecraft:bed') badBE++;
    }
  }
  check('nbt: one bed entity per bed half, each on a bed with a colour (signs sit on sign blocks)', entities === bedHalves && bedHalves > 0 && badBE === 0,
    `${entities} vs ${bedHalves}, ${badBE} bad`);
  note(`${wantV} villagers + ${wantG} golems in ${out.mobStructures.length} mob structures · ${wantC} minecart summons · ${adds.length} ticking areas`);
}

// ===========================================================================
// 6e. versions agree everywhere; packs from different versions never collide
// ===========================================================================
section('6e. versions');
{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const mainV = (readFileSync(join(ROOT, 'main.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const pageV = (html.match(/data-version="([^"]+)"/) || [])[1];
  const scriptV = (html.match(/main\.js\?v=([\w.]+)/) || [])[1];
  const readmeV = (readFileSync(join(ROOT, 'README.md'), 'utf8').match(/^# Polis v([\w.]+)/m) || [])[1];
  check('versions: package, main.js, engine, page, script tag and README agree',
    [mainV, POLIS_VERSION, pageV, scriptV, readmeV].every((v) => v === pkg),
    `package ${pkg} · main ${mainV} · engine ${POLIS_VERSION} · page ${pageV} · script ${scriptV} · readme ${readmeV}`);
  const r = generateCity({ ...DEFAULTS, size: 96, seed: 12345 });
  check('city id: the same city from two Polis versions gets two ids',
    cityId(r.world, 12345, '0.1.5') !== cityId(r.world, 12345, '0.1.6'));
  check('city id: stable within a version', cityId(r.world, 12345) === cityId(r.world, 12345));
  const out = await exportPack(r.world, { namespace: cityId(r.world, 12345), spawns: r.spawns, deflateRaw });
  check('guide: names all four functions and the Polis version',
    /build_centered/.test(out.guide) && /populate_centered/.test(out.guide) && out.guide.includes(`Polis v${POLIS_VERSION}`));

  // every command in every function is one of the three forms we emit
  const FORMS = [/^structure load [a-z0-9_]+:[a-z0-9_]+ ~-?\d* ~-?\d* ~-?\d*$/,
    /^summon minecraft:(minecart|boat) ~-?\d* ~-?\d* ~-?\d*$/, /^say [^\n]+$/,
    /^tickingarea add ~-?\d* ~-?\d* ~-?\d* ~-?\d* ~-?\d* ~-?\d* [a-z0-9_]+$/, /^tickingarea remove [a-z0-9_]+$/];
  let badCmd = null;
  for (const f of out.functions) for (const l of f.text.split('\n')) {
    if (!l || l.startsWith('#')) continue;
    if (!FORMS.some((re) => re.test(l))) badCmd = badCmd || `${f.name}: ${l}`;
  }
  check('functions: every command is a known-good form (a bad line makes Bedrock drop the whole function)', !badCmd, badCmd);

  // the no-cache dev server really sends no-store
  const { spawn } = await import('node:child_process');
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(port)], { stdio: 'ignore' });
  let hdr = null, body = '';
  for (let i = 0; i < 40 && !hdr; i++) {
    await new Promise((res) => setTimeout(res, 100));
    try { const r2 = await fetch(`http://localhost:${port}/`); hdr = r2.headers.get('cache-control'); body = await r2.text(); } catch { /* not up yet */ }
  }
  srv.kill();
  check('serve.js: serves index.html with caching off', hdr === 'no-store' && body.includes('data-version'), String(hdr));
}

// ===========================================================================
// 7. mesher
// ===========================================================================
section('7. greedy mesher');
{
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

// ===========================================================================
// 8. shader lint
// ===========================================================================
section('8. shader lint');
{
  const src = readFileSync(join(ROOT, 'engine/renderer.js'), 'utf8');
  const grab = (tag) => {
    const m = src.match(new RegExp('const ' + tag + ' = `([\\s\\S]*?)`'));
    return m ? m[1] : null;
  };
  const vs = grab('VS'), fs = grab('FS');
  check('shaders: both stages found', !!vs && !!fs);

  const decls = (s, kw) => {
    const out = {};
    const re = new RegExp('^\\s*' + kw + '\\s+(\\w+)\\s+(\\w+)\\s*;', 'gm');
    let m;
    while ((m = re.exec(s))) out[m[2]] = m[1];
    return out;
  };
  const vVary = decls(vs, 'varying'), fVary = decls(fs, 'varying');
  const vUni = decls(vs, 'uniform'), fUni = decls(fs, 'uniform');
  const attrs = decls(vs, 'attribute');

  let varyBad = [];
  for (const k of Object.keys(fVary)) {
    if (vVary[k] !== fVary[k]) varyBad.push(`${k}: vs=${vVary[k] || 'missing'} fs=${fVary[k]}`);
  }
  check('shaders: varyings agree across stages', varyBad.length === 0, varyBad.join('; '));

  for (const s of [vs, fs]) {
    check('shaders: braces balanced',
      (s.match(/{/g) || []).length === (s.match(/}/g) || []).length);
    check('shaders: parens balanced',
      (s.match(/\(/g) || []).length === (s.match(/\)/g) || []).length);
    check('shaders: precision declared', /precision\s+(low|medium|high)p\s+float\s*;/.test(s));
    check('shaders: has main()', /void\s+main\s*\(\s*\)/.test(s));
  }

  // everything the shader declares must be looked up by the renderer, and
  // everything looked up must exist in a shader — this is the mismatch that
  // silently draws nothing.
  const uniList = (src.match(/for \(const n of \[([^\]]*)\]/) || [])[1] || '';
  const looked = uniList.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const declared = new Set([...Object.keys(vUni), ...Object.keys(fUni)]);
  const missing = [...declared].filter((u) => !looked.includes(u));
  const extra = looked.filter((u) => !declared.has(u));
  check('shaders: every uniform is looked up', missing.length === 0, missing.join(', '));
  check('shaders: no stale uniform lookups', extra.length === 0, extra.join(', '));

  const attrLookups = (src.match(/getAttribLocation\(prog, '(\w+)'\)/g) || [])
    .map((s) => s.match(/'(\w+)'/)[1]);
  const attrMissing = Object.keys(attrs).filter((a) => !attrLookups.includes(a));
  const attrExtra = attrLookups.filter((a) => !(a in attrs));
  check('shaders: every attribute is looked up', attrMissing.length === 0, attrMissing.join(', '));
  check('shaders: no stale attribute lookups', attrExtra.length === 0, attrExtra.join(', '));

  // identifiers used in the FS must be declared somewhere in it
  const builtins = new Set(['gl_FragColor', 'gl_FrontFacing', 'gl_Position', 'gl_PointSize',
    'gl_FragCoord', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4', 'float', 'int', 'bool',
    'void', 'if', 'else', 'for', 'while', 'return', 'discard', 'const', 'struct',
    'normalize', 'max', 'min', 'dot', 'cross', 'mix', 'clamp', 'length', 'distance',
    'abs', 'sign', 'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
    'floor', 'ceil', 'fract', 'mod', 'step', 'smoothstep', 'sin', 'cos', 'tan',
    'reflect', 'refract', 'faceforward', 'texture2D', 'main',
    'uniform', 'varying', 'attribute', 'precision', 'highp', 'mediump', 'lowp']);
  // strip comments and swizzles/members before scanning for identifiers
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\.[A-Za-z_]\w*/g, ' ');
  const fsClean = strip(fs);
  const locals = new Set();
  const TYPES = 'float|int|bool|vec2|vec3|vec4|mat2|mat3|mat4';
  let lm;
  const localRe = new RegExp('\\b(?:' + TYPES + ')\\s+(\\w+)', 'g');
  const bodyOnly = fsClean.replace(/^\s*(uniform|varying|attribute|precision)[^;]*;/gm, '');
  while ((lm = localRe.exec(bodyOnly))) locals.add(lm[1]);
  const known = new Set([...Object.keys(fVary), ...Object.keys(fUni), ...locals, ...builtins]);
  const used = new Set((bodyOnly.match(/\b[A-Za-z_]\w*\b/g) || []));
  const undeclared = [...used].filter((u) => !known.has(u) && !/^\d/.test(u));
  check('shaders: fragment stage has no undeclared identifiers', undeclared.length === 0,
    undeclared.join(', '));
  note(`fs locals: ${[...locals].join(', ')}`);
  note(`vs: ${Object.keys(attrs).length} attributes, ${Object.keys(vUni).length} uniforms · ` +
    `fs: ${Object.keys(fUni).length} uniforms · ${Object.keys(fVary).length} varyings`);
}

// ===========================================================================
// 8b. renderer: API-name check plus a mock-GL dry run
// ===========================================================================
section('8b. renderer');
{
  const src = readFileSync(join(ROOT, 'engine/renderer.js'), 'utf8');

  const GL_METHODS = new Set(['createShader', 'shaderSource', 'compileShader',
    'getShaderParameter', 'getShaderInfoLog', 'createProgram', 'attachShader',
    'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'getAttribLocation',
    'getUniformLocation', 'createBuffer', 'bindBuffer', 'bufferData', 'deleteBuffer',
    'viewport', 'clearColor', 'clearDepth', 'enable', 'disable', 'clear', 'useProgram',
    'uniformMatrix4fv', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1i',
    'enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer',
    'drawElements', 'drawArrays', 'blendFunc', 'blendFuncSeparate', 'depthMask',
    'depthFunc', 'cullFace', 'frontFace', 'getExtension', 'getParameter', 'finish', 'flush']);
  const GL_CONSTS = new Set(['ELEMENT_ARRAY_BUFFER', 'ARRAY_BUFFER', 'STATIC_DRAW',
    'DYNAMIC_DRAW', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
    'DEPTH_TEST', 'CULL_FACE', 'BLEND', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT',
    'FLOAT', 'UNSIGNED_BYTE', 'BYTE', 'SHORT', 'UNSIGNED_SHORT', 'TRIANGLES',
    'TRIANGLE_STRIP', 'LINES', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE', 'ZERO',
    'BACK', 'FRONT', 'CCW', 'CW', 'LEQUAL', 'LESS']);
  const methods = [...new Set((src.match(/\bgl\.([a-z]\w*)\s*\(/g) || [])
    .map((m) => m.slice(3, -1).trim()))];
  const consts = [...new Set((src.match(/\bgl\.([A-Z][A-Z0-9_]*)\b/g) || [])
    .map((m) => m.slice(3)))];
  const badM = methods.filter((m) => !GL_METHODS.has(m));
  const badC = consts.filter((c) => !GL_CONSTS.has(c));
  check('renderer: only real WebGL1 methods are called', badM.length === 0, badM.join(', '));
  check('renderer: only real WebGL1 constants are used', badC.length === 0, badC.join(', '));

  // --- mock GL dry run ------------------------------------------------------
  const calls = [];
  const gl = new Proxy({}, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (GL_CONSTS.has(k)) return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
      if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer') {
        return () => ({ mock: true });
      }
      if (k === 'getAttribLocation') return (p, n) => ['aPos', 'aColor', 'aNormal'].indexOf(n);
      if (k === 'getUniformLocation') return (p, n) => ({ uniform: n });
      return (...a) => { calls.push(k + '(' + a.length + ')'); };
    },
  });
  const listeners = {};
  const canvas = {
    clientWidth: 800, clientHeight: 600, width: 0, height: 0,
    getContext: () => gl,
    addEventListener: (n, f) => { listeners[n] = f; },
    setPointerCapture() {}, releasePointerCapture() {},
  };
  const prevWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };

  let renderer = null, err = null;
  try {
    const { Renderer } = await import('../engine/renderer.js');
    renderer = new Renderer(canvas);
  } catch (e) { err = e; }
  check('renderer: constructs against a mock context', !!renderer, err && err.message);

  if (renderer) {
    const r = generateSingle({ ...DEFAULTS, style: 'tower', floors: 6, pitch: 5, bw: 15, bd: 13, seed: 9 });
    const mesh = buildMesh(r.world);
    let e2 = null;
    try {
      renderer.setMesh(mesh);
      renderer.frameAll();
      renderer.setClip(10);
      renderer.render(true);
      renderer.render(true);
    } catch (e) { e2 = e; }
    check('renderer: uploads a mesh and draws', !e2, e2 && e2.message);
    const draws = calls.filter((c) => c.startsWith('drawElements')).length;
    check('renderer: issues one draw per batch',
      draws === mesh.batches.length * 2, `${draws} draws for ${mesh.batches.length} batches x2 frames`);
    check('renderer: canvas sized from client size and dpr',
      canvas.width === 800 && canvas.height === 600, `${canvas.width}x${canvas.height}`);
    check('renderer: camera framed the build', renderer.dist > 0 && isFinite(renderer.dist));

    // interaction handlers must be wired and must move the camera
    const before = renderer.yaw;
    check('renderer: pointer handlers attached', !!listeners.pointerdown && !!listeners.pointermove);
    if (listeners.pointerdown) {
      listeners.pointerdown({ button: 0, shiftKey: false, clientX: 0, clientY: 0, pointerId: 1, preventDefault() {} });
      listeners.pointermove({ clientX: 40, clientY: 0, pointerId: 1 });
      listeners.pointerup({ pointerId: 1 });
      check('renderer: dragging rotates the camera', renderer.yaw !== before);
    }
    if (listeners.wheel) {
      const d0 = renderer.dist;
      listeners.wheel({ deltaY: 200, preventDefault() {} });
      check('renderer: wheel zooms', renderer.dist !== d0);
    }
    note(`${calls.length} gl calls over two frames, ${mesh.batches.length} batches`);
  }
  globalThis.window = prevWindow;
}

// ===========================================================================
// 9. determinism & budget
// ===========================================================================
section('9. determinism');
{
  const a = generateCity({ ...DEFAULTS, size: 128, seed: 555 });
  const b = generateCity({ ...DEFAULTS, size: 128, seed: 555 });
  check('same seed gives the same block count', a.stats.blocks === b.stats.blocks,
    `${a.stats.blocks} vs ${b.stats.blocks}`);
  let diff = 0;
  a.world.forEach((x, y, z, id) => { if (b.world.get(x, y, z) !== id) diff++; });
  check('same seed gives an identical world', diff === 0, `${diff} cells differ`);
  const c = generateCity({ ...DEFAULTS, size: 128, seed: 556 });
  check('different seed gives a different world', c.stats.blocks !== a.stats.blocks ||
    c.stats.buildings !== a.stats.buildings);

  const tiny = generateCity({ ...DEFAULTS, size: 128, seed: 99, budget: 20000 });
  check('budget is enforced', tiny.world.size <= 20000, String(tiny.world.size));
  check('budget overflow is reported', tiny.stats.overflow > 0, String(tiny.stats.overflow));
}

// ===========================================================================
section('result');
console.log(`   ${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of failures) console.log('   \x1b[31m✗\x1b[0m ' + f);
  process.exit(1);
} else {
  console.log('   \x1b[32mall checks passed\x1b[0m');
}
