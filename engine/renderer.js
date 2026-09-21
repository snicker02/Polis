// engine/renderer.js — WebGL1 preview for the meshed city.
//
// One program, one shared index buffer, N vertex batches. Orbit camera:
// drag to rotate, wheel to zoom, shift-drag or right-drag to pan.
// uClipY slices the build open horizontally so you can look inside.

import { STRIDE, MAX_QUADS, quadIndices } from './mesher.js';

const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec4 aColor;
attribute vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
varying vec4 vColor;
varying vec3 vNormal;
varying float vDist;
varying float vY;
void main() {
  vColor = aColor;
  vNormal = aNormal;
  vY = aPos.y;
  vec4 eye = uView * vec4(aPos, 1.0);
  vDist = length(eye.xyz);
  gl_Position = uProj * eye;
}
`;

const FS = `
precision highp float;
varying vec4 vColor;
varying vec3 vNormal;
varying float vDist;
varying float vY;
uniform vec3 uLight;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uClipY;
uniform float uAmbient;
void main() {
  if (vY > uClipY) discard;
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uLight)), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  vec3 amb = mix(uGround, uSky, hemi) * uAmbient;
  vec3 col = vColor.rgb * (amb + diff * 0.72);
  // interior faces (the cut surface side) read a touch cooler so the
  // cutaway does not turn into a flat silhouette
  if (!gl_FrontFacing) col *= 0.78;
  float f = clamp((vDist - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
  col = mix(col, uFog, f * 0.85);
  gl_FragColor = vec4(col, vColor.a);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
  }
  return s;
}

// ---- tiny matrix helpers ----------------------------------------------------
function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
  return out;
}
function lookAt(out, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL1 is not available in this browser.');
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.attr = {
      pos: gl.getAttribLocation(prog, 'aPos'),
      color: gl.getAttribLocation(prog, 'aColor'),
      normal: gl.getAttribLocation(prog, 'aNormal'),
    };
    this.uni = {};
    for (const n of ['uProj', 'uView', 'uLight', 'uSky', 'uGround', 'uFog',
      'uFogNear', 'uFogFar', 'uClipY', 'uAmbient']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }

    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(MAX_QUADS), gl.STATIC_DRAW);

    this.batches = [];
    this.center = [0, 0, 0];
    this.radius = 100;
    this.yaw = -0.7;
    this.pitch = 0.62;
    this.dist = 220;
    this.pan = [0, 0, 0];
    this.clipY = 1e9;
    this.bg = [0.055, 0.06, 0.075];
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this._dirty = true;
    this._attach(canvas);
  }

  // ---- data ----------------------------------------------------------------
  setMesh(mesh) {
    const gl = this.gl;
    for (const b of this.batches) gl.deleteBuffer(b.vbo);
    this.batches = mesh.batches.map((b) => {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, b.buffer, gl.STATIC_DRAW);
      return { vbo, quads: b.quads, transparent: b.transparent };
    });
    const bb = mesh.bounds;
    if (!bb.empty) {
      this.center = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2];
      this.radius = Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0, bb.y1 - bb.y0) / 2 + 4;
      this.top = bb.y1;
      this.bottom = bb.y0;
    }
    this._dirty = true;
  }

  frameAll() {
    this.dist = this.radius * 2.4;
    this.pan = [0, 0, 0];
    this.yaw = -0.7;
    this.pitch = 0.62;
    this._dirty = true;
  }

  setClip(y) { this.clipY = y; this._dirty = true; }
  invalidate() { this._dirty = true; }

  // ---- interaction ---------------------------------------------------------
  _attach(c) {
    let dragging = 0, lx = 0, ly = 0;
    const down = (e) => {
      dragging = (e.button === 2 || e.shiftKey) ? 2 : 1;
      lx = e.clientX; ly = e.clientY;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragging === 1) {
        this.yaw -= dx * 0.006;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.006));
      } else {
        const s = this.dist * 0.0016;
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        this.pan[0] -= (-cy * dx) * s;
        this.pan[2] -= (sy * dx) * s;
        this.pan[1] += dy * s;
      }
      this._dirty = true;
    };
    const up = (e) => { dragging = 0; c.releasePointerCapture && c.releasePointerCapture(e.pointerId); };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      this.dist *= Math.exp(e.deltaY * 0.0012);
      this.dist = Math.max(6, Math.min(this.radius * 14 + 64, this.dist));
      this._dirty = true;
      e.preventDefault();
    }, { passive: false });
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._dirty = true; }
  }

  render(force) {
    this.resize();
    if (!this._dirty && !force) return false;
    this._dirty = false;
    const gl = this.gl, c = this.canvas;
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);              // cutaway needs both sides
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.batches.length) return true;

    const aspect = c.width / Math.max(1, c.height);
    const far = Math.max(600, this.radius * 10);
    perspective(this.proj, 55 * Math.PI / 180, aspect, 0.6, far);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const tgt = [this.center[0] + this.pan[0], this.center[1] + this.pan[1], this.center[2] + this.pan[2]];
    const eye = [
      tgt[0] + this.dist * cp * Math.sin(this.yaw),
      tgt[1] + this.dist * sp,
      tgt[2] + this.dist * cp * Math.cos(this.yaw),
    ];
    lookAt(this.view, eye, tgt, [0, 1, 0]);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uni.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.uni.uView, false, this.view);
    gl.uniform3f(this.uni.uLight, 0.45, 0.82, 0.32);
    gl.uniform3f(this.uni.uSky, 0.62, 0.70, 0.86);
    gl.uniform3f(this.uni.uGround, 0.26, 0.24, 0.22);
    gl.uniform3f(this.uni.uFog, this.bg[0], this.bg[1], this.bg[2]);
    gl.uniform1f(this.uni.uFogNear, this.dist * 0.6);
    gl.uniform1f(this.uni.uFogFar, this.dist * 2.3 + this.radius);
    gl.uniform1f(this.uni.uClipY, this.clipY);
    gl.uniform1f(this.uni.uAmbient, 0.55);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const a = this.attr;
    gl.enableVertexAttribArray(a.pos);
    gl.enableVertexAttribArray(a.color);
    gl.enableVertexAttribArray(a.normal);

    const draw = (b) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      gl.vertexAttribPointer(a.pos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.vertexAttribPointer(a.color, 4, gl.UNSIGNED_BYTE, true, STRIDE, 12);
      gl.vertexAttribPointer(a.normal, 3, gl.BYTE, true, STRIDE, 16);
      gl.drawElements(gl.TRIANGLES, b.quads * 6, gl.UNSIGNED_SHORT, 0);
    };

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const b of this.batches) if (!b.transparent) draw(b);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const b of this.batches) if (b.transparent) draw(b);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return true;
  }
}
