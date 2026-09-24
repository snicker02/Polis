// tools/check-java-blocks.mjs — does every block Polis makes exist in Java,
// with the properties Java actually defines for it?
//
// Run: node tools/check-java-blocks.mjs [path-to-java-blocks.json]
//
// Without a blocks.json it falls back to the copy in tools/ if present.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateCity, DEFAULTS } from '../engine/city.js';
import { MATERIALS } from '../engine/materials.js';
import { toJava } from '../engine/java-blocks.js';

const here = dirname(fileURLToPath(import.meta.url));

export function loadJavaBlocks(path) {
  const file = path || join(here, 'java-blocks.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const byName = new Map();
  for (const b of raw) {
    const props = new Map();
    for (const s of b.states || []) {
      const values = s.type === 'bool' ? ['true', 'false']
        : s.type === 'int' ? (s.values || []).map(String)
        : (s.values || []).map(String);
      props.set(s.name, new Set(values));
    }
    byName.set('minecraft:' + b.name, props);
  }
  return byName;
}

export function checkJavaBlocks(javaBlocks, opts = {}) {
  // every block and state a few different cities produce
  const used = new Map();
  for (const cfg of opts.configs || [
    { size: 160, seed: 12345, transit: 'rails', cityStyle: 'modern' },
    { size: 128, seed: 7, transit: 'trams', cityStyle: 'medieval' },
    { size: 128, seed: 3, transit: 'roads', cityStyle: 'desert' },
    { size: 128, seed: 9, transit: 'rails', cityStyle: 'snowy' },
    { size: 128, seed: 11, transit: 'rails', cityStyle: 'cherry' },
  ]) {
    const r = generateCity({ ...DEFAULTS, ...cfg });
    r.world.forEach((x, y, z, id) => {
      if (used.has(id)) return;
      const d = MATERIALS.def(id);
      used.set(id, { block: d.block, states: d.states, data: r.world.getData(x, y, z) });
    });
  }

  const problems = [];
  const seen = new Set();
  for (const { block, states, data } of used.values()) {
    const { name, props } = toJava(block, states, data && data.bytes ? data.bytes : {});
    seen.add(name);
    const def = javaBlocks.get(name);
    if (!def) { problems.push(`no such Java block: ${name} (from ${block})`); continue; }
    for (const [k, v] of Object.entries(props)) {
      const allowed = def.get(k);
      if (!allowed) { problems.push(`${name}: Java has no property "${k}" (from ${block})`); continue; }
      if (!allowed.has(String(v))) problems.push(`${name}: "${k}" cannot be "${v}" (allowed: ${[...allowed].slice(0, 6).join(', ')})`);
    }
  }
  return { blocks: used.size, names: seen.size, problems };
}

if (process.argv[1] && process.argv[1].endsWith('check-java-blocks.mjs')) {
  const javaBlocks = loadJavaBlocks(process.argv[2]);
  const r = checkJavaBlocks(javaBlocks);
  console.log(`checked ${r.blocks} block states across ${r.names} Java blocks`);
  if (!r.problems.length) console.log('all of them exist in Java with valid properties');
  else {
    console.log(`${r.problems.length} problems:`);
    for (const p of r.problems.slice(0, 40)) console.log('  ' + p);
  }
}
