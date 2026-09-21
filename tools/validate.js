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
import { MATERIALS, THEMES, DOOR_KINDS, doorId, MAT, BED_VEC, stairId, cropId, CROP_KINDS, bedId, furnaceId, railId, poweredRailId } from '../engine/materials.js';
import { BLOCK_VERSION } from '../engine/blockcore.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK, exportPack, tileList, functionFiles, GROUND_DROP, cityId, POLIS_VERSION, SUMMON_IDS } from '../engine/export.js';
import { buildMesh, MAX_QUADS, STRIDE } from '../engine/mesher.js';
import { decodeNbt, readZip, localPayload } from './nbt-read.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const deflateRaw = (b) => new Uint8Array(zlib.deflateRawSync(Buffer.from(b)));

let pass = 0, fail = 0;
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

  // stair blocks off: straight flights of full blocks must still be climbable
  for (const stairStyle of ['switchback', 'wide']) {
    const r = generateSingle({ ...DEFAULTS, style: 'tower', floors: 7, pitch: 5, bw: 20, bd: 16, seed: 5, stairStyle, useStairs: false });
    const v = verifyAll(r.world, r.buildings);
    check(`${stairStyle} with stair blocks off: climbable`, v.floorsReached === v.floorsChecked,
      `${v.floorsReached}/${v.floorsChecked}`);
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
      if (p.type === 'villager') {
        villagers++;
        if (!inB(p.x, p.z, 0)) villagersOutside++;
        if (!solid(p.x, p.y - 1, p.z) || solid(p.x, p.y, p.z) || solid(p.x, p.y + 1, p.z)) badSpawn++;
      } else {
        golems++;
        if (inB(p.x, p.z, 0)) golemsInside++;
        if (!solid(p.x, p.y - 1, p.z) || solid(p.x, p.y, p.z) || solid(p.x, p.y + 1, p.z) || solid(p.x, p.y + 2, p.z)) badSpawn++;
      }
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
  check('golems: never inside a building footprint', golemsInside === 0, `${golemsInside} inside`);
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
  for (let d = 0; d < 6; d++) { railId(d); poweredRailId(d); }
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
      // no rail may touch this one from the side (Bedrock would re-curve them on a block update)
      const axisX = ENDS[dirOf(w, x, y, z)][0][0] !== 0;
      for (const [sx, sz] of axisX ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]])
        for (const yy of [y - 1, y, y + 1]) if (isRail(w, x + sx, yy, z + sz)) sideTouch++;
    }
    var dir;
    // links must be mutual; each connected piece is a line with exactly two ends
    for (const [k, links] of adj) for (const l of links) if (!(adj.get(l) || []).includes(k)) badLink++;
    const seen = new Set(); let comps = 0, badComp = 0;
    for (const k of adj.keys()) {
      if (seen.has(k)) continue;
      comps++;
      const stack = [k]; let ends = 0;
      while (stack.length) {
        const u = stack.pop(); if (seen.has(u)) continue; seen.add(u);
        const ls = adj.get(u); if (ls.length < 2) ends++;
        for (const v of ls) if (!seen.has(v)) stack.push(v);
      }
      if (ends !== 2) badComp++;
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
    const lines = new TextDecoder().decode(inflate(e)).split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('say '));
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
  let voids = 0, notAir0 = 0, heightBad = 0, footprint = 0, wideBad = 0;
  for (const st of out.structures) {
    const e = byName.get(`structures/polis/${st.name}.mcstructure`);
    const { root } = decodeNbt(inflate(e));
    const pal = root.structure.palette.default.block_palette;
    const l0 = root.structure.block_indices[0];
    for (let i = 0; i < l0.length; i++) if (l0[i] === -1) voids++;
    if (pal[0].name !== 'minecraft:air') notAir0++;
    if (root.size[1] !== wb.y1 - wb.y0 + 1) heightBad++;
    if (root.size[0] > 64 || root.size[2] > 64) wideBad++;
    footprint += root.size[0] * root.size[2];
    tiles.set(st.name, { size: [...root.size], pal, l0 });
  }
  check('air fill: no structure-void cells remain', voids === 0, `${voids} void`);
  check('air fill: air is in every palette', notAir0 === 0, `${notAir0} tiles without`);
  check('air fill: every tile spans the full city height', heightBad === 0, `${heightBad} short`);
  check('air fill: tiles stay within 64 across', wideBad === 0);
  check('air fill: tiles cover the footprint exactly',
    footprint === (wb.x1 - wb.x0 + 1) * (wb.z1 - wb.z0 + 1), `${footprint} vs ${(wb.x1 - wb.x0 + 1) * (wb.z1 - wb.z0 + 1)}`);

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
        placed.set(`${ox + x},${oy + y},${oz + zz}`, t.pal[v].name);
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
    const vol = (wb.x1 - wb.x0 + 1) * (wb.y1 - wb.y0 + 1) * (wb.z1 - wb.z0 + 1);
    extra = placed.size - vol;
    check(`${label}: every block lands in the right place`, wrong === 0 && missing === 0, `${wrong} wrong, ${missing} missing`);
    check(`${label}: whole volume written, nothing outside it`, extra === 0, `${extra} extra`);
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
// 6d. villagers in functions, bed colours in the structure file
// ===========================================================================
section('6d. summons and block entities');
{
  const r = generateCity({ ...DEFAULTS, size: 128, seed: 12345 });
  const ns = cityId(r.world, 12345);
  const out = await exportPack(r.world, { namespace: ns, fillAir: true, spawns: r.spawns, deflateRaw });
  const z = readZip(out.data);
  const get = (name) => {
    const e = z.entries.find((x) => x.name === name);
    if (!e) return null;
    const p = localPayload(out.data, e);
    return new TextDecoder().decode(e.method === 8 ? zlib.inflateRawSync(Buffer.from(p)) : p);
  };
  const build = get(`functions/${ns}/build_centered.mcfunction`);
  const popul = get(`functions/${ns}/populate_centered.mcfunction`);
  check('functions: build, build_centered, populate, populate_centered present',
    !!build && !!popul && !!get(`functions/${ns}/build.mcfunction`) && !!get(`functions/${ns}/populate.mcfunction`));
  const sv = (popul || '').split('\n').filter((l) => l.startsWith('summon minecraft:villager '));
  const sc = (popul || '').split('\n').filter((l) => l.startsWith('summon minecraft:minecart '));
  const sg = (popul || '').split('\n').filter((l) => l.startsWith('summon minecraft:iron_golem '));
  const want = r.spawns.filter((p) => p.type === 'villager').length;
  check('functions: one summon per villager', sv.length === want, `${sv.length} vs ${want}`);
  check('functions: one summon per golem', sg.length === r.spawns.filter((p) => p.type === 'golem').length);
  check('functions: build summons nothing (mobs must not arrive before their floors)', !(build || '').includes('summon'));
  check('functions: populate loads no structures', !(popul || '').includes('structure load'));
  const SUM = /^summon minecraft:(villager|iron_golem|minecart) (~-?\d*) (~-?\d*) (~-?\d*)$/;
  check('functions: summons use whole-block offsets', sv.concat(sg).every((l) => SUM.test(l)),
    sv.concat(sg).find((l) => !SUM.test(l)));
  check('functions: both tell the player what happened in chat',
    (build || '').includes('\nsay ') && (popul || '').includes('\nsay '));

  // --- simulate the game: player off-centre in a block, load, then summon --------
  const tiles = new Map();
  for (const st of out.structures) {
    const e = z.entries.find((x) => x.name === `structures/${ns}/${st.name}.mcstructure`);
    const p = localPayload(out.data, e);
    const { root } = decodeNbt(new Uint8Array(zlib.inflateRawSync(Buffer.from(p))));
    tiles.set(st.name, { size: [...root.size], pal: root.structure.palette.default.block_palette, l0: root.structure.block_indices[0] });
  }
  const num = (t) => (t === '~' ? 0 : Number(t.slice(1)));
  for (const player of [[1000.3, 70, -500.2], [1000.8, 70, -500.9], [-37.5, 64, 12.99]]) {
    const placed = new Map();
    for (const ln of (build || '').split('\n')) {
      const m = ln.match(/^structure load \S+:(\S+) (~-?\d*) (~-?\d*) (~-?\d*)$/);
      if (!m) continue;
      const t = tiles.get(m[1]);
      const ox = Math.floor(player[0] + num(m[2])), oy = Math.floor(player[1] + num(m[3])), oz = Math.floor(player[2] + num(m[4]));
      const [sx, sy, sz] = t.size;
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let zz = 0; zz < sz; zz++) {
        const v = t.l0[(x * sy + y) * sz + zz];
        if (v >= 0) placed.set(`${ox + x},${oy + y},${oz + zz}`, t.pal[v].name);
      }
    }
    const blocking = (k) => {
      const n = placed.get(k);
      return !!n && n !== 'minecraft:air' && !/_door$|carpet|dandelion|cornflower|allium|bluet|orchid|wheat|carrots|beetroot/.test(n);
    };
    let bad = 0, first = '';
    for (const ln of sv.concat(sg)) {
      const m = ln.match(SUM);
      const bx = Math.floor(player[0] + num(m[2])), by = Math.floor(player[1] + num(m[3])), bz = Math.floor(player[2] + num(m[4]));
      const tall = m[1] === 'iron_golem' ? 3 : 2;
      let ok = blocking(`${bx},${by - 1},${bz}`);
      for (let h = 0; h < tall; h++) if (blocking(`${bx},${by + h},${bz}`)) ok = false;
      if (!ok) { bad++; if (!first) first = `${m[1]} at ${bx},${by},${bz}`; }
    }
    check(`simulated load from ${player.join(',')}: every mob stands on a floor with clear space`, bad === 0, `${bad} bad, e.g. ${first}`);
  }

  // entity names: exactly the ones Bedrock's /summon parser accepts. villager_v2
  // looked right but made Bedrock reject the whole populate file in game.
  const ACCEPTED = new Set(['minecraft:villager', 'minecraft:iron_golem', 'minecraft:minecart']);
  check('summon: only entity names the /summon command accepts (not internal ids like villager_v2)',
    Object.values(SUMMON_IDS).every((n) => ACCEPTED.has(n)) && !(popul || '').includes('villager_v2'));
  const kinds = ['villagers', 'golems'].filter((k) => z.entries.some((e) => e.name === `functions/${ns}/${k}_centered.mcfunction`));
  check('functions: a separate file per mob kind as a fallback', kinds.length === 2, kinds.join(','));
  const vOnly = get(`functions/${ns}/villagers_centered.mcfunction`) || '';
  check('functions: villagers_centered has exactly the villager summons',
    vOnly.split('\n').filter((l) => l.startsWith('summon minecraft:villager ')).length === want && !vOnly.includes('iron_golem'));

  // bed colours land in block_position_data, one per bed half, at the right index
  let entities = 0, bedHalves = 0, badEnt = 0;
  for (const st of out.structures) {
    const e = z.entries.find((x) => x.name === `structures/${ns}/${st.name}.mcstructure`);
    const p = localPayload(out.data, e);
    const { root } = decodeNbt(new Uint8Array(zlib.inflateRawSync(Buffer.from(p))));
    const pal = root.structure.palette.default.block_palette;
    const l0 = root.structure.block_indices[0];
    const pd = root.structure.palette.default.block_position_data;
    for (let i = 0; i < l0.length; i++) if (pal[l0[i]] && pal[l0[i]].name === 'minecraft:bed') bedHalves++;
    for (const [idx, v] of Object.entries(pd)) {
      entities++;
      const be = v.block_entity_data;
      if (!be || be.id !== 'Bed' || typeof be.color !== 'number' || pal[l0[Number(idx)]].name !== 'minecraft:bed') badEnt++;
    }
  }
  check('nbt: one bed entity per bed half', entities === bedHalves && bedHalves > 0, `${entities} vs ${bedHalves}`);
  check('nbt: every bed entity sits on a bed block with a colour', badEnt === 0, `${badEnt} bad`);
  note(`${sv.length} villager + ${sg.length} golem summons · ${bedHalves / 2} beds with colours in NBT`);
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
    /^summon minecraft:(villager|iron_golem|minecart) ~-?\d* ~-?\d* ~-?\d*$/, /^say [^\n]+$/];
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
