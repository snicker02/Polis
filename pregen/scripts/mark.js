// Bedrock only writes a chunk to disk if it changed since generation; an
// untouched chunk is thrown away and regenerated from the seed next time.
// To make a pre-generated chunk persist, flip one block and put it back:
// the chunk is now "modified" and gets saved, and the world is unchanged.
//
// The block used is at the top of the world, above anything natural:
// air at the build limit in the Overworld and End (flipped via structure_void),
// bedrock roof in the Nether (flipped via barrier; both are indestructible).
export function markY(dim) {
  try { return dim.heightRange.max - 1; } catch { return 319; }
}

const FLIP = {
  "minecraft:air": "minecraft:structure_void",
  "minecraft:bedrock": "minecraft:barrier",
};

// returns "ok" | "unloaded" | "occupied" | "error"
export function markChunk(dim, cx, cz, y) {
  let b;
  try { b = dim.getBlock({ x: cx * 16 + 8, y, z: cz * 16 + 8 }); } catch { return "unloaded"; }
  if (!b) return "unloaded";
  try {
    const id = b.typeId;
    const tmp = FLIP[id];
    if (!tmp) return "occupied";            // something built at the top: the chunk is modified anyway
    b.setType(tmp);
    b.setType(id);
    return "ok";
  } catch {
    return "error";
  }
}

// mark every chunk in a chunk rectangle; returns { ok, missed }
export function markRect(dim, cx0, cz0, cx1, cz1, y) {
  let ok = 0, missed = 0;
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const r = markChunk(dim, cx, cz, y);
      if (r === "ok" || r === "occupied") ok++; else missed++;
    }
  return { ok, missed };
}
