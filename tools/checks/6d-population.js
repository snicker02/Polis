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

export const id = "6d";
export const label = "6d. population";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
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
  check('functions: only minecarts and boats are summoned (every mob travels in structures)',
    !/summon minecraft:(villager|iron_golem|cat|panda|cow|sheep|pig|chicken)/.test(build + popul));
  check('functions: build summons nothing and loads no mob structures',
    !build.includes('summon') && !lines(build).some((l) => / \S+:m_x/.test(l)));
  const mobLoads = lines(popul).filter((l) => /^structure load \S+:m_x-?\d+_z-?\d+ /.test(l));
  check('populate: one structure load per mob structure', mobLoads.length === out.mobStructures.length && mobLoads.length > 0,
    `${mobLoads.length} vs ${out.mobStructures.length}`);
  check('populate: one summon per minecart', lines(popul).filter((l) => l.startsWith('summon minecraft:minecart ')).length === wantC);
  // boats are summoned in populate too, while its ticking areas still hold the
  // city loaded: from their own function afterwards, distant ones failed
  const wantB = r.spawns.filter((p) => p.type === 'boat').length;
  check('populate: one summon per boat, while the city is still held loaded', wantB > 0 &&
    lines(popul).filter((l) => l.startsWith('summon minecraft:boat ')).length === wantB, `${wantB} boats`);
  check('functions: the boats fallback is still there for any that miss', !!text(`functions/${ns}/boats_centered.mcfunction`));
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
  const tiersSeen = new Set(); let unskilledN = 0, tierBad = 0, ptCount = 0;
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
      else if (id === 'minecraft:painting') { ptCount++; if (!PAINTING_MOTIFS.some((m) => m.motif === v.Motif.v)) badEnt++; }
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
  const wantPt = r.spawns.filter((p) => p.type === 'painting').length;
  check('mob structures: the paintings travel too, each with a real motif', ptCount === wantPt && wantPt > 0, `${ptCount}/${wantPt}`);
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
        if (e.v.identifier.v === 'minecraft:painting') continue;            // hangs on a wall, stands on nothing
        const tall = e.v.identifier.v === 'minecraft:iron_golem' ? 3 : 2;   // villagers, cats, pandas: 2
        let ok = blocking(`${bx},${by - 1},${bz}`);
        for (let h = 0; h < tall; h++) if (blocking(`${bx},${by + h},${bz}`)) ok = false;
        if (!ok) { bad++; if (!first) first = `${e.v.identifier.v} at ${bx},${by},${bz}`; }
      }
    }
    check(`simulated load from ${player.join(',')}: every mob (villagers, golems, cats, pandas, farm animals) lands on a floor with room to stand`,
      bad === 0 && total === wantV + wantG + wantCat + wantPanda + wantA + wantPt, `${bad}/${total} bad, e.g. ${first}`);
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
      if (be.id.v === 'Beacon') { if (block !== 'minecraft:beacon') badBE++; continue; }          // the centre monument's beacons
      entities++;
      if (be.id.v !== 'Bed' || be.color.t !== 1 || block !== 'minecraft:bed') badBE++;
    }
  }
  check('nbt: one bed entity per bed half, each on a bed with a colour (signs sit on sign blocks)', entities === bedHalves && bedHalves > 0 && badBE === 0,
    `${entities} vs ${bedHalves}, ${badBE} bad`);
  note(`${wantV} villagers + ${wantG} golems in ${out.mobStructures.length} mob structures · ${wantC} minecart summons · ${adds.length} ticking areas`);
}
}
