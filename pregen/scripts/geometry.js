// Pure chunk/tile/path math. No game API here so it can be tested headless.
export const CHUNK = 16;
export const toChunk = (v) => Math.floor(v / CHUNK);

export function normRect(x1, z1, x2, z2) {
  return {
    x0: Math.min(x1, x2), z0: Math.min(z1, z2),
    x1: Math.max(x1, x2), z1: Math.max(z1, z2),
  };
}

export function chunkRect(r) {
  return { cx0: toChunk(r.x0), cz0: toChunk(r.z0), cx1: toChunk(r.x1), cz1: toChunk(r.z1) };
}

export function chunkCount(c) {
  return (c.cx1 - c.cx0 + 1) * (c.cz1 - c.cz0 + 1);
}

// Tiles of up to tile x tile chunks (ticking areas are capped at 100 chunks).
export function tileGrid(c, tile) {
  const cols = Math.ceil((c.cx1 - c.cx0 + 1) / tile);
  const rows = Math.ceil((c.cz1 - c.cz0 + 1) / tile);
  return { cols, rows, total: cols * rows };
}

// Serpentine order, computed by index so huge regions never need a stored list.
export function tileAt(c, tile, i) {
  const { cols } = tileGrid(c, tile);
  const row = Math.floor(i / cols);
  let col = i % cols;
  if (row & 1) col = cols - 1 - col;
  const cx0 = c.cx0 + col * tile;
  const cz0 = c.cz0 + row * tile;
  return { cx0, cz0, cx1: Math.min(cx0 + tile - 1, c.cx1), cz1: Math.min(cz0 + tile - 1, c.cz1) };
}

export function tileChunkCount(t) {
  return (t.cx1 - t.cx0 + 1) * (t.cz1 - t.cz0 + 1);
}

// Walk path: one stop per step x step block cell, serpentine.
export function walkGrid(r, step) {
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0 + 1) / step));
  const nz = Math.max(1, Math.ceil((r.z1 - r.z0 + 1) / step));
  return { nx, nz, total: nx * nz };
}

export function walkPointAt(r, step, i) {
  const { nx } = walkGrid(r, step);
  const row = Math.floor(i / nx);
  let col = i % nx;
  if (row & 1) col = nx - 1 - col;
  return {
    x: Math.min(r.x0 + Math.floor(step * (col + 0.5)), r.x1),
    z: Math.min(r.z0 + Math.floor(step * (row + 0.5)), r.z1),
  };
}
