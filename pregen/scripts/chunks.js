// A chunk is "loaded" (and therefore generated) when the server can return a block in it.
export function probeY(dim) {
  try {
    const h = dim.heightRange;
    return Math.max(h.min, Math.min(64, h.max - 1));
  } catch {
    return 64;
  }
}

export function isLoadedAt(dim, x, z, y) {
  try {
    return dim.getBlock({ x, y, z }) !== undefined;
  } catch {
    return false;
  }
}
