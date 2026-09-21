// engine/export.js — world -> Bedrock structures + placement guide.

import { splitWorld, writeMcStructure, buildMcPack, makeZip } from './blockcore.js';
import { MATERIALS } from './materials.js';

export const CHUNK = 64;   // Bedrock structure blocks max out at 64 per horizontal axis

export function buildStructures(world, opts = {}) {
  const size = opts.chunkSize || CHUNK;
  const prefix = opts.prefix || 'c';
  const chunks = splitWorld(world, size);
  const structures = [];
  for (const c of chunks) {
    const box = { x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 };
    const res = writeMcStructure(c.keys, c.ids, box, MATERIALS);
    structures.push({
      name: `${prefix}_x${c.cx}_z${c.cz}`,
      data: res.data,
      box, size: res.size, cells: res.cells, paletteSize: res.paletteSize,
      offset: [box.x0, box.y0, box.z0],
    });
  }
  return structures;
}

export function placementGuide(structures, opts = {}) {
  const ns = opts.namespace || 'polis';
  const base = opts.base || [0, 64, 0];
  const L = [];
  L.push('POLIS — placement guide');
  L.push('=======================');
  L.push('');
  L.push(`${structures.length} structure${structures.length === 1 ? '' : 's'}, each at most ${CHUNK}x${CHUNK} blocks across.`);
  L.push('');
  L.push('HOW TO PLACE (Bedrock):');
  L.push('  1. Import the .mcpack (open it, or drop it into the game) and enable the');
  L.push('     behaviour pack on the world you want to build in.');
  L.push('  2. Turn on cheats, then run the commands below in order. They already');
  L.push(`     include the base corner ${base.join(' ')} — change the numbers if you want the`);
  L.push('     city somewhere else, keeping the offsets between them identical.');
  L.push('  3. Flat worlds work best. Each command places one chunk of the city;');
  L.push('     the chunks are aligned, so together they form the whole build.');
  L.push('');
  L.push('COMMANDS:');
  for (const s of structures) {
    const x = base[0] + s.offset[0], y = base[1] + s.offset[1], z = base[2] + s.offset[2];
    L.push(`  /structure load ${ns}:${s.name} ${x} ${y} ${z}`);
  }
  L.push('');
  L.push('OFFSETS (relative to the city corner):');
  for (const s of structures) {
    L.push(`  ${s.name}  ->  +${s.offset[0]} +${s.offset[1]} +${s.offset[2]}   size ${s.size.join('x')}   ${s.cells} blocks`);
  }
  L.push('');
  L.push('If a structure will not load, check that the pack is enabled on the world');
  L.push('and that the area is loaded (stand near where it is being placed).');
  return L.join('\n');
}

export async function exportPack(world, opts = {}) {
  const structures = buildStructures(world, opts);
  const guide = placementGuide(structures, opts);
  const data = await buildMcPack(structures, { ...opts, guide });
  return { data, structures, guide };
}

export async function exportStructuresZip(world, opts = {}) {
  const structures = buildStructures(world, opts);
  const guide = placementGuide(structures, opts);
  const files = structures.map((s) => ({ name: `${s.name}.mcstructure`, data: s.data }));
  files.push({ name: 'placement-guide.txt', data: new TextEncoder().encode(guide) });
  const data = await makeZip(files, opts);
  return { data, structures, guide };
}
