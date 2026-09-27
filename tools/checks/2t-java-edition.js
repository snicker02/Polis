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

export const id = "2t";
export const label = "2t. Java edition";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const { loadJavaBlocks, checkJavaBlocks } = await import('../check-java-blocks.mjs');
  const { javaTiles, javaPackFiles } = await import('../../engine/export-java.js');

  // every block a city makes must exist in Java, with properties Java defines
  const javaBlocks = loadJavaBlocks();
  const r = checkJavaBlocks(javaBlocks, { configs: [
    { size: 128, seed: 12345, transit: 'rails', cityStyle: 'modern' },
    { size: 96, seed: 7, transit: 'trams', cityStyle: 'medieval' },
  ] });
  check('java: every block translates to a real Java block with valid properties',
    r.problems.length === 0, r.problems.slice(0, 3).join('; '));
  note(`${r.blocks} block states across ${r.names} Java blocks`);

  // the structures themselves: readable, within the 48-block limit, complete
  const city = generateCity({ ...DEFAULTS, size: 96, seed: 4242, transit: 'rails' });
  const tiles = javaTiles(city.world, { prefix: 'polis' });
  check('java: the city is cut into pieces a structure block can place', tiles.length > 0 &&
    tiles.every((t) => t.size.every((s) => s <= 48)), tiles.map((t) => t.size.join('x')).join(' '));
  const total = tiles.reduce((a, t) => a + t.blocks, 0);
  check('java: every block of the city is in a piece', total === city.stats.blocks, `${total} vs ${city.stats.blocks}`);

  // a big-endian reader, to check a finished structure the way the game reads it
  function readStructure(nbt) {
    const b2 = Buffer.from(nbt);
    const d2 = new DataView(b2.buffer, b2.byteOffset, b2.byteLength);
    let i = 0;
    const st = () => { const n = d2.getUint16(i, false); i += 2; const v = b2.subarray(i, i + n).toString('utf8'); i += n; return v; };
    const vl = (t) => {
      switch (t) {
        case 1: { const v = d2.getInt8(i); i += 1; return v; }
        case 3: { const v = d2.getInt32(i, false); i += 4; return v; }
        case 6: { const v = d2.getFloat64(i, false); i += 8; return v; }
        case 8: return st();
        case 9: { const et = b2[i]; i += 1; const n = d2.getInt32(i, false); i += 4; const o = []; for (let k = 0; k < n; k++) o.push(vl(et)); return o; }
        case 10: { const o = {}; for (;;) { const tt = b2[i]; i += 1; if (tt === 0) break; const k = st(); o[k] = vl(tt); } return o; }
        default: throw new Error('tag ' + t);
      }
    };
    const tag = b2[i]; i += 1; st();
    return vl(tag);
  }

  // read one back with a big-endian reader, as the game would
  const buf = Buffer.from(tiles[0].nbt);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const str = () => { const n = dv.getUint16(p, false); p += 2; const v = buf.subarray(p, p + n).toString('utf8'); p += n; return v; };
  const val = (t) => {
    switch (t) {
      case 1: { const v = dv.getInt8(p); p += 1; return v; }
      case 2: { const v = dv.getInt16(p, false); p += 2; return v; }
      case 3: { const v = dv.getInt32(p, false); p += 4; return v; }
      case 8: return str();
      case 9: { const et = buf[p]; p += 1; const n = dv.getInt32(p, false); p += 4; const o = []; for (let i = 0; i < n; i++) o.push(val(et)); return o; }
      case 10: { const o = {}; for (;;) { const tt = buf[p]; p += 1; if (tt === 0) break; const k = str(); o[k] = val(tt); } return o; }
      default: throw new Error('tag ' + t);
    }
  };
  const tag = buf[p]; p += 1; str();
  const root = val(tag);
  check('java: a structure reads back with its version, size, palette and blocks',
    root.DataVersion > 3000 && root.size.length === 3 && root.palette.length > 0 && root.blocks.length > 0,
    `version ${root.DataVersion}, ${root.palette.length} palette, ${root.blocks.length} blocks`);
  const everyPos = root.blocks.every((b) => b.pos.length === 3 && b.pos.every((v, i) => v >= 0 && v < root.size[i]));
  check('java: every block sits inside its own structure', everyPos);
  const signs = root.blocks.filter((b) => b.nbt && /sign/.test(b.nbt.id || ''));
  // from 1.20.5 a sign's lines are text components: plain words, not JSON
  check('java: sign lines are plain text, four to a side', signs.length > 0 &&
    signs.every((b) => b.nbt.front_text && b.nbt.front_text.messages.length === 4 &&
      b.nbt.front_text.messages.every((m) => typeof m === 'string' && !/^\s*[{"]/.test(m))),
    `${signs.length} signs, e.g. ${signs[0] ? JSON.stringify(signs[0].nbt.front_text.messages) : ''}`);

  // a Java structure only places what it lists, so the empty part of every
  // city column must be written as air or the old landscape stays standing
  const withAir = javaTiles(city.world, { prefix: 'polis', fillAir: true, clearAbove: 24 });
  const airEntries = withAir.reduce((a, t) => a + t.blocks, 0) - total;
  check('java: air is written over the city so the old landscape is cleared', airEntries > total,
    `${airEntries.toLocaleString()} filler blocks for ${total.toLocaleString()} city blocks`);
  // clearing must stop at the city's lowest block: below that the column is
  // filled, or the town stands over a cavern with holes into it
  {
    const withGround = javaTiles(city.world, { prefix: 'polis', fillAir: true, clearAbove: 16, foundation: 8 });
    const lowest = new Map();
    city.world.forEach((x, y, z) => {
      const k = x + ',' + z;
      const b = lowest.get(k);
      if (b === undefined || y < b) lowest.set(k, y);
    });
    let hollow = 0, filled = 0;
    for (const t of withGround) {
      const root = readStructure(t.nbt);
      const names = root.palette.map((e) => e.Name);
      for (const b of root.blocks) {
        const wx = t.offset[0] + b.pos[0] + city.world.box.x0;
        const wy = t.offset[1] + b.pos[1] + 2;
        const wz = t.offset[2] + b.pos[2] + city.world.box.z0;
        const floor = lowest.get(wx + ',' + wz);
        if (floor === undefined || wy >= floor) continue;
        if (names[b.state] === 'minecraft:air') hollow++; else filled++;
      }
    }
    check('java: the ground under the city is filled, not hollowed out', hollow === 0 && filled > 0,
      `${filled.toLocaleString()} filled, ${hollow} left as air`);
  }

  // a door in Java faces the way you walk in
  {
    const { toJava } = await import('../../engine/java-blocks.js');
    const VEC = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
    let wrong = 0;
    for (const b of city.buildings) {
      const def = MATERIALS.def(city.world.get(b.door.x, b.door.y, b.door.z));
      if (!def || !/door/.test(def.block)) continue;
      const { props } = toJava(def.block, def.states);
      const v = VEC[props.facing];
      if (!v || v[0] !== b.door.out[0] || v[1] !== b.door.out[1]) wrong++;
    }
    check('java: doors face the way you walk in (Bedrock stores them a quarter-turn round)', wrong === 0, `${wrong} wrong`);
  }

  // the city's living things
  {
    const pop = generateCity({ ...DEFAULTS, size: 128, seed: 12345, transit: 'rails' });
    const withMobs = javaTiles(pop.world, { prefix: 'polis', spawns: pop.spawns });
    const placed = withMobs.reduce((a, t) => a + t.entities, 0);
    check('java: every villager, animal, painting, cart and boat is in exactly one piece',
      placed === pop.spawns.length, `${placed} of ${pop.spawns.length}`);
    // read them back and check the ids and the details Java needs
    const piece = withMobs.find((t) => t.entities > 3);
    const buf = Buffer.from(piece.nbt);
    const dv2 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let q = 0;
    const rstr = () => { const n = dv2.getUint16(q, false); q += 2; const v = buf.subarray(q, q + n).toString('utf8'); q += n; return v; };
    const rval = (t) => {
      switch (t) {
        case 1: { const v = dv2.getInt8(q); q += 1; return v; }
        case 3: { const v = dv2.getInt32(q, false); q += 4; return v; }
        case 6: { const v = dv2.getFloat64(q, false); q += 8; return v; }
        case 8: return rstr();
        case 9: { const et = buf[q]; q += 1; const n = dv2.getInt32(q, false); q += 4; const o = []; for (let i = 0; i < n; i++) o.push(rval(et)); return o; }
        case 10: { const o = {}; for (;;) { const tt = buf[q]; q += 1; if (tt === 0) break; const k = rstr(); o[k] = rval(tt); } return o; }
        default: throw new Error('tag ' + t);
      }
    };
    const tg = buf[q]; q += 1; rstr();
    const rt = rval(tg);
    const ents = rt.entities;
    check('java: entities read back with an id, a position and a block position',
      ents.length > 0 && ents.every((e) => /^minecraft:/.test(e.nbt.id) && e.pos.length === 3 && e.blockPos.length === 3),
      `${ents.length} entities`);
    const all = withMobs.flatMap(() => []);
    // paintings need a variant Java knows, villagers a villager record
    const { javaEntity } = await import('../../engine/java-entities.js');
    const { J } = await import('../../engine/export-java.js');
    let badPainting = 0, badVillager = 0;
    for (const sp of pop.spawns) {
      const e = javaEntity(sp, J);
      if (!e) { if (sp.type !== 'painting') badVillager++; continue; }
      if (sp.type === 'painting' && !/^minecraft:[a-z_0-9]+$/.test(e.nbt.variant[1])) badPainting++;
      if (sp.type === 'villager' && !e.nbt.VillagerData) badVillager++;
    }
    // a boat given the block of water it sits in must be lifted to the surface
    {
      const { javaEntityPos } = await import('../../engine/java-entities.js');
      const box0 = { x0: 0, y0: 0, z0: 0 };
      const boat = pop.spawns.find((sp) => sp.type === 'boat');
      const cow = pop.spawns.find((sp) => sp.type === 'cow');
      const okBoat = !boat || javaEntityPos(boat, box0)[1] === boat.y + 1;
      const okCow = !cow || javaEntityPos(cow, box0)[1] === cow.y;
      check('java: boats sit on the water, everything else stands on its block', okBoat && okCow);
    }
    check('java: paintings carry a variant and villagers a villager record', badPainting === 0 && badVillager === 0,
      `${badPainting} paintings, ${badVillager} villagers`);
  }

  // the datapack itself
  const files = javaPackFiles(tiles, { namespace: 'polis' });
  const meta = JSON.parse(files.find((f) => f.name === 'pack.mcmeta').text);
  const fn = files.find((f) => /build\.mcfunction$/.test(f.name));
  check('java: the datapack has its pack.mcmeta, structures and a build function',
    meta.pack.pack_format > 0 &&
    files.filter((f) => /^data\/polis\/structure\/.*\.nbt$/.test(f.name)).length === tiles.length &&
    !!fn, `${files.length} files`);
  check('java: the build function places every piece', fn &&
    fn.text.split('\n').filter((l) => l.startsWith('place template ')).length === tiles.length);
  // a piece placed into an unloaded chunk is silently dropped, so the ground
  // is forceloaded first and released afterwards
  {
    const big = generateCity({ ...DEFAULTS, size: 352, seed: 897321763, transit: 'rails' });
    const bigTiles = javaTiles(big.world, { prefix: 'city', fillAir: true, clearAbove: 32, foundation: 8 });
    const bigFn = javaPackFiles(bigTiles, { namespace: 'polis' }).find((f) => /build[.]mcfunction$/.test(f.name)).text.split('\n');
    const adds = bigFn.filter((l) => l.startsWith('forceload add'));
    const removes = bigFn.filter((l) => l.startsWith('forceload remove'));
    let over = 0, covered = { x: 0, z: 0 };
    for (const l of adds) {
      const m = l.match(/~(-?\d+) ~(-?\d+) ~(-?\d+) ~(-?\d+)/).slice(1).map(Number);
      // worst case the player stands mid-chunk, so a span can touch one more chunk
      const cx = Math.floor(m[2] / 16) - Math.floor(m[0] / 16) + 2;
      const cz = Math.floor(m[3] / 16) - Math.floor(m[1] / 16) + 2;
      if (cx * cz > 256) over++;
      covered.x = Math.max(covered.x, m[2]);
      covered.z = Math.max(covered.z, m[3]);
    }
    const needX = Math.max(...bigTiles.map((t) => t.offset[0] + t.size[0]));
    const needZ = Math.max(...bigTiles.map((t) => t.offset[2] + t.size[2]));
    check('java: the ground is held loaded while the city is placed, and released after',
      adds.length > 0 && adds.length === removes.length && over === 0 &&
      covered.x >= needX - 1 && covered.z >= needZ - 1,
      `${adds.length} areas, ${over} over the chunk limit, covering ${covered.x}x${covered.z} of ${needX}x${needZ}`);
  }
  note(`datapack: ${files.length} files, ${tiles.length} structures, ${total.toLocaleString()} blocks`);
}
