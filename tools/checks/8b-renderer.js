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

export const id = "8b";
export const label = "8b. renderer";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
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
    const { Renderer } = await import('../../engine/renderer.js');
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
