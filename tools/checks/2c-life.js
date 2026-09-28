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

export const id = "2c";
export const label = "2c. life";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
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
      if (p.type === 'painting') continue;                        // hung on a wall: checked in 2q
      if (p.type === 'cod' || p.type === 'salmon' || p.type === 'tropicalfish') {   // in water, with water beside it
        const isW = (x, y, z) => { const n = w.get(x, y, z); return n >= 0 && MATERIALS.def(n).block === 'minecraft:water'; };
        if (!isW(p.x, p.y, p.z) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => isW(p.x + a, p.y, p.z + b))) badSpawn++;
        continue;
      }
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
