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

export const id = "8";
export const label = "8. shader lint";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
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
