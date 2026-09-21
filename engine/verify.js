// engine/verify.js — does a player actually get in, and up?
//
// Flood fills *standing positions* (feet cell) with Minecraft-ish movement
// rules: a position needs air at feet and head and a solid block underfoot;
// you may step up one block (with head room) or down one. Doors count as
// passable. If every floor is reached from the pavement outside the front
// door, the building works.

import { MATERIALS } from './materials.js';

export function verifyBuilding(world, rec, opts = {}) {
  const pad = 2;
  const bx0 = rec.x0 - pad, bx1 = rec.x1 + pad;
  const bz0 = rec.z0 - pad, bz1 = rec.z1 + pad;
  const by0 = rec.groundY - 1, by1 = (rec.topY || rec.roofY) + 5;
  const limit = opts.limit || 400000;

  const solid = (x, y, z) => {
    const id = world.get(x, y, z);
    return id !== -1 && !MATERIALS.isPassable(id);
  };
  const clear = (x, y, z) => !solid(x, y, z);
  const stands = (x, y, z) =>
    x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1 && y >= by0 && y <= by1 &&
    clear(x, y, z) && clear(x, y + 1, z) && solid(x, y - 1, z);

  // ---- start: the pavement outside the front door -------------------------
  const [sx, sy, sz] = rec.outside;
  let start = null;
  for (const dy of [0, 1, -1, 2]) {
    if (stands(sx, sy + dy, sz)) { start = [sx, sy + dy, sz]; break; }
  }
  if (!start) {
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) {
        if (stands(sx + ox, sy + dy, sz + oz)) { start = [sx + ox, sy + dy, sz + oz]; break; }
      }
      if (start) break;
    }
  }
  if (!start) {
    return { ok: false, reason: 'no standable ground outside the door', floors: rec.floors, reached: 0, missing: [...Array(rec.floors).keys()], visited: 0 };
  }

  // ---- flood fill ----------------------------------------------------------
  const seen = new Set();
  const key = (x, y, z) => ((y + 64) * 1024 + z) * 1024 + x;
  const queue = [start];
  seen.add(key(...start));
  const perLevel = new Map();   // feet-y -> count of cells inside the building

  const c = rec.core;
  const inShaft = (x, z) => c && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;

  let head = 0;
  while (head < queue.length) {
    const [x, y, z] = queue[head++];
    if (seen.size > limit) break;
    perLevel.set(y, (perLevel.get(y) || 0) + (insideAny(rec, x, z) && !inShaft(x, z) ? 1 : 0));

    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) {
        const nx = x + ox, ny = y + dy, nz = z + oz;
        if (dy === 1 && !clear(x, y + 2, z)) continue;   // no room to step up
        if (!stands(nx, ny, nz)) continue;
        const k = key(nx, ny, nz);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([nx, ny, nz]);
      }
    }
  }

  // ---- targets -------------------------------------------------------------
  const missing = [];
  const counts = [];
  for (let k = 0; k < rec.floors; k++) {
    const y = rec.floorYs[k] + 1;
    const n = perLevel.get(y) || 0;
    counts.push(n);
    if (n < 1) missing.push(k);
  }
  let roofOk = true;
  if (rec.hut) {
    const y = rec.roofY + 1;
    roofOk = (perLevel.get(y) || 0) > 0 || seen.has(key(rec.hutDoor[0], y, rec.hutDoor[2] + 1));
  }

  return {
    ok: missing.length === 0 && roofOk,
    floors: rec.floors,
    reached: rec.floors - missing.length,
    missing,
    counts,
    roofOk,
    visited: seen.size,
  };
}

function insideAny(rec, x, z) {
  for (const r of rec.rects) {
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  }
  return false;
}

export function verifyAll(world, records, opts = {}) {
  const out = { total: 0, ok: 0, fails: [], floorsChecked: 0, floorsReached: 0 };
  for (const rec of records) {
    const r = verifyBuilding(world, rec, opts);
    out.total++;
    out.floorsChecked += r.floors;
    out.floorsReached += r.reached;
    if (r.ok) out.ok++;
    else out.fails.push({ rec, result: r });
  }
  return out;
}
