// engine/export.js — world -> Bedrock structures, functions and placement guide.
//
// Bedrock structures are capped at 64 blocks per horizontal axis, so the city
// is cut into aligned 64x64 tiles. The pack also ships two functions that load
// every tile in one go, relative to wherever the player is standing:
//
//   /function polis/build            city corner at your feet
//   /function polis/build_centered   city centred on you
//
// Both put the city's ground layer where the block under your feet is.

import { splitWorld, writeMcStructure, buildMcPack, makeZip, crc32 } from './blockcore.js';
import { MATERIALS, MAT } from './materials.js';

// Must match main.js VERSION, package.json and index.html data-version;
// tools/validate.js fails if they drift. The app refuses to export when the
// browser has mixed cached copies of old and new files.
export const POLIS_VERSION = '0.1.7';

export const CHUNK = 64;          // Bedrock structure limit per horizontal axis
export const GROUND_DROP = 2;     // base layer y=0 sits 2 below feet; surface y=1 replaces the block you stand on

// ---- per-city identity ---------------------------------------------------------
// Every export gets its own namespace, e.g. polis_12345_a3f9, so two city packs
// active on the same world never hand each other's tiles to /structure load.
// The suffix is a content hash: same seed with different sliders -> different id;
// the same city regenerated later -> the same id. It hashes block names and
// states, not registry ids, because door/stair ids depend on session history.
export function cityId(world, seed, version = POLIS_VERSION) {
  const n = MATERIALS.length;
  const enc = new TextEncoder();
  const matHash = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const d = MATERIALS.def(i);
    const st = Object.keys(d.states).sort().map((k) => k + '=' + d.states[k].value).join(',');
    matHash[i] = crc32(enc.encode(d.block + '|' + st));
  }
  // The Polis version is part of the id: packs from different versions carry
  // different functions, so they must never share a namespace, even for an
  // identical city. (0.1.4 and 0.1.5 did, and Bedrock picked the older pack.)
  let a = crc32(enc.encode('polis ' + version)), b = 0;
  for (const [k, id] of world.cells) {
    // order-independent: sum two differently mixed per-cell hashes
    let h = (Math.imul(k, 0x9e3779b1) ^ matHash[id]) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    a = (a + h) >>> 0;
    b = (b + Math.imul(h, 0x27d4eb2f)) >>> 0;
  }
  const hex = ((a ^ (b >>> 7)) >>> 0).toString(16).padStart(8, '0').slice(0, 4);
  return `polis_${seed >>> 0}_${hex}`;
}

// Tile layout without encoding anything — cheap enough to call on every UI change.
export function tileList(world, opts = {}) {
  const size = opts.chunkSize || CHUNK;
  const prefix = opts.prefix || 'c';
  const chunks = splitWorld(world, size);
  const wb = world.box;
  return chunks.map((c) => {
    let box = { x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 };
    if (opts.fillAir) {
      // Full tile footprint, full city height: loading carves the whole volume.
      box = {
        x0: Math.max(wb.x0, c.cx * size), x1: Math.min(wb.x1, c.cx * size + size - 1),
        z0: Math.max(wb.z0, c.cz * size), z1: Math.min(wb.z1, c.cz * size + size - 1),
        y0: wb.y0, y1: wb.y1,
      };
    }
    return {
      name: `${prefix}_x${c.cx}_z${c.cz}`,
      chunk: c, box,
      offset: [box.x0, box.y0, box.z0],
      size: [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1],
      cells: c.keys.length,
    };
  });
}

export function buildStructures(world, opts = {}) {
  const airId = opts.fillAir ? MAT.AIR : undefined;
  return tileList(world, opts).map((t) => {
    const res = writeMcStructure(t.chunk.keys, t.chunk.ids, t.box, MATERIALS, { airId, blockData: world.data });
    return {
      name: t.name, data: res.data, box: t.box,
      size: res.size, cells: res.cells, paletteSize: res.paletteSize, entities: res.entities,
      offset: t.offset,
    };
  });
}

// ---- functions ----------------------------------------------------------------
function rel(v) { return v === 0 ? '~' : `~${v}`; }

// Two steps, on purpose. /structure load does not finish placing blocks
// before the next command runs, so mobs summoned in the same function arrive
// before their floors do: upper-floor villagers fall, others get buried.
// build places blocks (safe to rerun); populate summons the mobs (run once,
// after the city is standing).
//
// Summons use whole-block offsets from the same execution point as the
// structure loads. Both floor the player's position the same way, so each mob
// lands in exactly its intended block wherever in a block the player stands.
// (Half-block offsets put mobs one block off whenever the player stood past
// the middle of a block.)
export function functionFiles(tiles, world, opts = {}) {
  const ns = opts.namespace || 'polis';
  const spawns = opts.spawns || [];
  const wb = world.box;
  const cx = Math.floor((wb.x0 + wb.x1 + 1) / 2);
  const cz = Math.floor((wb.z0 + wb.z1 + 1) / 2);
  const villagers = spawns.filter((p) => p.type === 'villager').length;
  const golems = spawns.filter((p) => p.type === 'golem').length;
  const carts = spawns.filter((p) => p.type === 'minecart').length;
  const ENTITY = { villager: 'minecraft:villager_v2', golem: 'minecraft:iron_golem', minecart: 'minecraft:minecart' };
  const loads = (dx, dz) => tiles.map((t) =>
    `structure load ${ns}:${t.name} ${rel(t.offset[0] - dx)} ${rel(t.offset[1] - GROUND_DROP)} ${rel(t.offset[2] - dz)}`);
  const summons = (dx, dz) => spawns.map((p) => {
    const id = ENTITY[p.type];
    return `summon ${id} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)}`;
  });
  const build = (dx, dz, title, pop) => [
    `# ${title}`,
    `# ${tiles.length} structure${tiles.length === 1 ? '' : 's'}. Safe to run again: blocks only.`,
    '# Only loaded chunks are filled: stand near the middle and raise render distance.',
    `# When the whole city is standing, run /function ${ns}/${pop} from the SAME spot.`,
    ...loads(dx, dz),
    `say Polis: city placed. When it has finished appearing, run /function ${ns}/${pop} from this same spot.`,
  ].join('\n') + '\n';
  const populate = (dx, dz, title) => [
    `# ${title}`,
    `# ${villagers} villagers next to their beds, ${golems} iron golems on the streets` +
      (carts ? `, ${carts} minecarts on the railway.` : '.'),
    '# Run ONCE, from the same spot you ran build from, after the city has appeared.',
    `say Polis: summoning ${villagers} villagers, ${golems} iron golems` + (carts ? ` and ${carts} minecarts...` : '...'),
    ...summons(dx, dz),
    'say Polis: done. Mobs only appear in loaded chunks; walk closer to any that are missing.',
  ].join('\n') + '\n';
  return [
    { name: `functions/${ns}/build.mcfunction`, fn: `${ns}/build`,
      text: build(wb.x0, wb.z0, 'Polis: city corner at your feet', 'populate') },
    { name: `functions/${ns}/build_centered.mcfunction`, fn: `${ns}/build_centered`,
      text: build(cx, cz, 'Polis: city centred on you', 'populate_centered') },
    { name: `functions/${ns}/populate.mcfunction`, fn: `${ns}/populate`,
      text: populate(wb.x0, wb.z0, 'Polis: villagers and golems (pairs with build)') },
    { name: `functions/${ns}/populate_centered.mcfunction`, fn: `${ns}/populate_centered`,
      text: populate(cx, cz, 'Polis: villagers and golems (pairs with build_centered)') },
  ];
}

// ---- guide --------------------------------------------------------------------
export function placementGuide(tiles, opts = {}) {
  const ns = opts.namespace || 'polis';
  const base = opts.base || [0, 64, 0];
  const L = [];
  L.push('POLIS — placement guide');
  L.push('=======================');
  L.push('');
  L.push('TO BUILD THIS CITY, stand where you want it and type in chat:');
  L.push('');
  L.push(`    /function ${ns}/build_centered`);
  L.push('');
  L.push('then, once the city has finished appearing, from the same spot:');
  L.push('');
  L.push(`    /function ${ns}/populate_centered`);
  L.push('');
  L.push(`This pack contains four functions: ${ns}/build, build_centered, populate, populate_centered.`);
  L.push(`Made with Polis v${POLIS_VERSION}. If /function says one is "not found", an older`);
  L.push('Polis pack is probably still active on this world: remove old Polis packs.');
  L.push('');
  L.push(`City id  ${ns}` + (opts.seed !== undefined ? `      seed ${opts.seed}` : ''));
  if (opts.summary) L.push(opts.summary);
  L.push('The seed only matters in the Polis app; the city itself is inside this pack.');
  L.push('Every exported city has its own id, so several packs can be active at once.');
  L.push('');
  L.push(`${tiles.length} structure${tiles.length === 1 ? '' : 's'}, each at most ${CHUNK}x${CHUNK} blocks across.`);
  L.push(opts.fillAir
    ? 'Air fill is ON: loading clears terrain, trees and water out of the whole city volume.'
    : 'Air fill is OFF: empty cells keep whatever was already there (best on a flat world).');
  L.push('');
  L.push('HOW TO BUILD IT:');
  L.push('  1. Import the .mcpack and enable the behaviour pack on your world. Cheats on.');
  L.push('  2. Stand on the ground where you want the city and run:');
  L.push(`       /function ${ns}/build_centered`);
  L.push('     The city ground replaces the block you are standing on.');
  L.push('  3. Wait until the whole city has finished appearing, then - WITHOUT MOVING - run:');
  L.push(`       /function ${ns}/populate_centered`);
  L.push('     This summons the villagers and iron golems. Run it once.');
  L.push('');
  L.push(`  (${ns}/build and ${ns}/populate do the same with the city corner at your feet.)`);
  L.push('');
  L.push('  Only loaded chunks get filled. For a big city stand near the middle and raise');
  L.push('  render distance. build is safe to rerun if tiles were missed; populate is not.');
  L.push('');
  L.push(`EXACT COORDINATES (base corner ${base.join(' ')}):`);
  for (const t of tiles) {
    const x = base[0] + t.offset[0], y = base[1] + t.offset[1], z = base[2] + t.offset[2];
    L.push(`  /structure load ${ns}:${t.name} ${x} ${y} ${z}`);
  }
  L.push('');
  L.push('OFFSETS (relative to the city corner):');
  for (const t of tiles) {
    L.push(`  ${t.name}  ->  +${t.offset[0]} +${t.offset[1]} +${t.offset[2]}   size ${t.size.join('x')}   ${t.cells} blocks`);
  }
  L.push('');
  L.push('If nothing loads: check the pack is enabled on this world and cheats are on.');
  L.push('If only part loads: those tiles were outside loaded chunks — move and rerun.');
  return L.join('\n');
}

export function commandList(tiles, opts = {}) {
  const ns = opts.namespace || 'polis';
  const base = opts.base || [0, 64, 0];
  return tiles.map((t) =>
    `/structure load ${ns}:${t.name} ${base[0] + t.offset[0]} ${base[1] + t.offset[1]} ${base[2] + t.offset[2]}`);
}

// ---- packages -----------------------------------------------------------------
export async function exportPack(world, opts = {}) {
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts);
  const guide = placementGuide(tiles, opts);
  const fns = functionFiles(tiles, world, opts);
  const data = await buildMcPack(structures, {
    ...opts, guide,
    files: fns.map((f) => ({ name: f.name, data: f.text })),
  });
  return { data, structures, guide, functions: fns };
}

export async function exportStructuresZip(world, opts = {}) {
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts);
  const guide = placementGuide(tiles, opts);
  const fns = functionFiles(tiles, world, opts);
  const files = structures.map((s) => ({ name: `${s.name}.mcstructure`, data: s.data }));
  for (const f of fns) files.push({ name: f.name, data: new TextEncoder().encode(f.text) });
  files.push({ name: 'placement-guide.txt', data: new TextEncoder().encode(guide) });
  const data = await makeZip(files, opts);
  return { data, structures, guide, functions: fns };
}
