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
import { MATERIALS } from '../engine/materials.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK } from '../engine/export.js';
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
  w.forEach((x, y, z, id) => {
    for (const [dx, dy, dz] of DIRS) {
      const nb = w.get(x + dx, y + dy, z + dz);
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
