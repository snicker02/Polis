// engine/mesher.js — greedy, face-culled mesher for the WebGL preview.
//
// The world is sparse, so we bucket cells into 32^3 chunks, expand each chunk
// into a padded dense array (so neighbouring chunks cull each other correctly),
// then run a standard greedy merge per axis/slab.
//
// Output is a list of batches. Every batch holds at most MAX_QUADS quads laid
// out as 4 sequential vertices each, so one shared index buffer serves them
// all — which keeps us inside WebGL1's 16-bit index limit without bookkeeping.
//
// Vertex layout, 20 bytes, interleaved:
//   0  vec3  float32   position (world space)
//   12 vec4  uint8n    colour + alpha
//   16 vec3  int8n     normal   (+1 byte pad)

import { MATERIALS } from './materials.js';

export const CS = 32;              // chunk edge
export const MAX_QUADS = 16384;    // 65536 vertices -> Uint16 indices
export const STRIDE = 20;

const PS = CS + 2;                 // padded edge
const PIDX = (x, y, z) => ((y + 1) * PS + (z + 1)) * PS + (x + 1);

class BatchBuilder {
  constructor(transparent) {
    this.transparent = transparent;
    this.batches = [];
    this._new();
  }
  _new() {
    this.buf = new ArrayBuffer(MAX_QUADS * 4 * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.i8 = new Int8Array(this.buf);
    this.quads = 0;
  }
  flush() {
    if (this.quads > 0) {
      this.batches.push({
        buffer: this.buf.slice(0, this.quads * 4 * STRIDE),
        quads: this.quads,
        transparent: this.transparent,
      });
    }
    this._new();
  }
  // corners: 4 × [x,y,z] in world space, already wound
  quad(corners, r, g, b, a, nx, ny, nz) {
    if (this.quads >= MAX_QUADS) this.flush();
    let byteBase = this.quads * 4 * STRIDE;
    for (let i = 0; i < 4; i++) {
      const fo = (byteBase >> 2);
      const c = corners[i];
      this.f32[fo] = c[0];
      this.f32[fo + 1] = c[1];
      this.f32[fo + 2] = c[2];
      this.u8[byteBase + 12] = r;
      this.u8[byteBase + 13] = g;
      this.u8[byteBase + 14] = b;
      this.u8[byteBase + 15] = a;
      this.i8[byteBase + 16] = nx;
      this.i8[byteBase + 17] = ny;
      this.i8[byteBase + 18] = nz;
      this.i8[byteBase + 19] = 0;
      byteBase += STRIDE;
    }
    this.quads++;
  }
}

// Cached per-material render info so we are not hitting the registry per face.
function materialTable() {
  const n = MATERIALS.length;
  const r = new Uint8Array(n), g = new Uint8Array(n), b = new Uint8Array(n);
  const a = new Uint8Array(n), tr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = MATERIALS.def(i);
    r[i] = Math.round(d.color[0] * 255);
    g[i] = Math.round(d.color[1] * 255);
    b[i] = Math.round(d.color[2] * 255);
    tr[i] = d.transparent ? 1 : 0;
    a[i] = d.transparent ? 150 : 255;
  }
  return { r, g, b, a, tr, n };
}

export function buildMesh(world, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const M = materialTable();
  const opaque = new BatchBuilder(false);
  const glassy = new BatchBuilder(true);

  // ---- bucket cells into chunks -------------------------------------------
  const chunks = new Map(); // key -> {cx,cy,cz, keys:[], ids:[]}
  world.forEach((x, y, z, id) => {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    const k = (cy + 8) * 4096 + cz * 64 + cx;
    let c = chunks.get(k);
    if (!c) { c = { cx, cy, cz, xs: [], ys: [], zs: [], ids: [] }; chunks.set(k, c); }
    c.xs.push(x - cx * CS); c.ys.push(y - cy * CS); c.zs.push(z - cz * CS);
    c.ids.push(id);
  });

  const dense = new Int32Array(PS * PS * PS);
  const maskP = new Int32Array(CS * CS);
  const maskN = new Int32Array(CS * CS);

  for (const c of chunks.values()) {
    const ox = c.cx * CS, oy = c.cy * CS, oz = c.cz * CS;
    dense.fill(-1);
    for (let i = 0; i < c.ids.length; i++) {
      dense[PIDX(c.xs[i], c.ys[i], c.zs[i])] = c.ids[i];
    }
    // padded shell from the world (neighbouring chunks)
    for (let u = -1; u <= CS; u++) {
      for (let v = -1; v <= CS; v++) {
        dense[PIDX(-1, u, v)] = world.get(ox - 1, oy + u, oz + v);
        dense[PIDX(CS, u, v)] = world.get(ox + CS, oy + u, oz + v);
        dense[PIDX(u, -1, v)] = world.get(ox + u, oy - 1, oz + v);
        dense[PIDX(u, CS, v)] = world.get(ox + u, oy + CS, oz + v);
        dense[PIDX(u, v, -1)] = world.get(ox + u, oy + v, oz - 1);
        dense[PIDX(u, v, CS)] = world.get(ox + u, oy + v, oz + CS);
      }
    }

    const origin = [ox, oy, oz];
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      const p = [0, 0, 0];
      for (let s = 0; s <= CS; s++) {
        const ownA = (s - 1) >= 0 && (s - 1) < CS;   // cell on the minus side
        const ownB = s >= 0 && s < CS;               // cell on the plus side
        if (!ownA && !ownB) continue;
        maskP.fill(0); maskN.fill(0);
        for (let vv = 0; vv < CS; vv++) {
          for (let uu = 0; uu < CS; uu++) {
            p[d] = s - 1; p[u] = uu; p[v] = vv;
            const A = dense[PIDX(p[0], p[1], p[2])];
            p[d] = s;
            const Bc = dense[PIDX(p[0], p[1], p[2])];
            const n = vv * CS + uu;
            if (ownA && A >= 0 && (Bc < 0 || (M.tr[Bc] && Bc !== A))) maskP[n] = A + 1;
            if (ownB && Bc >= 0 && (A < 0 || (M.tr[A] && A !== Bc))) maskN[n] = Bc + 1;
          }
        }
        const emit = (mask, positive) => {
          for (let vv = 0; vv < CS; vv++) {
            for (let uu = 0; uu < CS;) {
              const m = mask[vv * CS + uu];
              if (!m) { uu++; continue; }
              // grow along u
              let w = 1;
              while (uu + w < CS && mask[vv * CS + uu + w] === m) w++;
              // grow along v
              let h = 1;
              grow: while (vv + h < CS) {
                for (let i = 0; i < w; i++) {
                  if (mask[(vv + h) * CS + uu + i] !== m) break grow;
                }
                h++;
              }
              for (let dv = 0; dv < h; dv++)
                for (let du = 0; du < w; du++) mask[(vv + dv) * CS + uu + du] = 0;

              const id = m - 1;
              const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0], c3 = [0, 0, 0];
              const u0 = uu, u1 = uu + w, v0 = vv, v1 = vv + h;
              const setC = (c, au, av) => {
                c[d] = origin[d] + s; c[u] = origin[u] + au; c[v] = origin[v] + av;
              };
              if (positive) {
                setC(c0, u0, v0); setC(c1, u1, v0); setC(c2, u1, v1); setC(c3, u0, v1);
              } else {
                setC(c0, u0, v0); setC(c1, u0, v1); setC(c2, u1, v1); setC(c3, u1, v0);
              }
              const nrm = [0, 0, 0];
              nrm[d] = positive ? 127 : -127;
              const target = M.tr[id] ? glassy : opaque;
              target.quad([c0, c1, c2, c3], M.r[id], M.g[id], M.b[id], M.a[id],
                nrm[0], nrm[1], nrm[2]);
              uu += w;
            }
          }
        };
        emit(maskP, true);
        emit(maskN, false);
      }
    }
  }

  opaque.flush();
  glassy.flush();
  const batches = opaque.batches.concat(glassy.batches);
  let quads = 0;
  for (const b of batches) quads += b.quads;
  const bb = world.box;
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    batches, quads,
    bounds: bb,
    ms: t1 - t0,
    chunks: chunks.size,
  };
}

// Shared index buffer contents for MAX_QUADS quads.
export function quadIndices(maxQuads = MAX_QUADS) {
  const idx = new Uint16Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) {
    const b = q * 4, o = q * 6;
    idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
    idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
  }
  return idx;
}
