// engine/gothic.js — the Gothic vocabulary, drawn in blocks.
//
// After the "Tableau d'archéologie" plates of French church architecture:
//
//   rose window   a circle of stained glass in the west front, a ring of stone
//                 tracery round it, spokes from a carved hub (four at R = 3,
//                 eight from R = 4), each sector its own colour
//   lancets       tall narrow pointed windows, a carved keystone for the head
//   buttresses    piers a block out from the side walls, each with a sloped
//                 weathering and a pinnacle standing above the eaves
//   corbel table  a row of small brackets under the eaves (modillons)
//   gargoyles     spouts at the corners of the roof
//   portal        a Flamboyant door: a pointed gable over it, a pinnacle either side
//   flèche        an octagonal stone spire with crockets climbing its edges,
//                 a pinnacle at each corner of the tower below it
//
// None of it touches a floor a player walks on: everything goes into walls,
// into the air outside them above head height, or above the roof. A church
// built with these still passes the same walk-through check.
//
// Geometry is written in facade terms and turned into world cells by a small
// frame: `face` is the side the entrance looks out of, `a` runs across the
// facade (left to right seen from outside), `d` runs back from the facade.

import { MAT, STAINED, stairId, WEIRDO } from './materials.js';

const OUT = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
// the stair direction that climbs toward (dx, dz)
const CLIMB = (dx, dz) => (dx === 1 ? WEIRDO.east : dx === -1 ? WEIRDO.west : dz === 1 ? WEIRDO.south : WEIRDO.north);

// A frame on a building rectangle r and its entrance side.
export function facadeFrame(r, face) {
  const [ox, oz] = OUT[face];
  const alongX = face === 'north' || face === 'south';
  const width = alongX ? r.x1 - r.x0 + 1 : r.z1 - r.z0 + 1;
  const depth = alongX ? r.z1 - r.z0 + 1 : r.x1 - r.x0 + 1;
  // (a, d) -> wall cell: a across as seen from outside, d back from the facade
  const at = (a, d) => {
    if (face === 'south') return [r.x1 - a, r.z1 - d];
    if (face === 'north') return [r.x0 + a, r.z0 + d];
    if (face === 'east') return [r.x1 - d, r.z0 + a];
    return [r.x0 + d, r.z1 - a];
  };
  // the side walls, as lists of [x, z, outX, outZ] for d = 0 .. depth-1
  const sideL = [], sideR = [], back = [];
  const [lx, lz] = at(0, 0), [rx, rz] = at(width - 1, 0);
  const leftOut = [Math.sign(lx - at(1, 0)[0]), Math.sign(lz - at(1, 0)[1])];
  const rightOut = [-leftOut[0], -leftOut[1]];
  for (let d = 0; d < depth; d++) {
    sideL.push([...at(0, d), ...leftOut]);
    sideR.push([...at(width - 1, d), ...rightOut]);
  }
  for (let a = 0; a < width; a++) back.push([...at(a, depth - 1), -ox, -oz]);
  return { out: [ox, oz], alongX, width, depth, at, sideL, sideR, back, corners: [at(0, 0), at(width - 1, 0), at(0, depth - 1), at(width - 1, depth - 1)], leftOut, rightOut, lx, lz, rx, rz };
}

// ---- rose window ---------------------------------------------------------------
// Centre (ca, cy) in facade coordinates: a across, y height. Only replaces
// cells that are wall, trim or glass of this building.
export function roseWindow(world, F, ca, cy, R, mats) {
  const { tracery, hub, glassList, replaceable } = mats;
  // a small rose carries a cross of four spokes; a big one eight (fewer and
  // the glass is lost among the stone)
  const spokes = R >= 4 ? 8 : R >= 3 ? 4 : 0;
  let glass = 0, stone = 0;
  for (let b = -R; b <= R; b++)
    for (let da = -R; da <= R; da++) {
      const r = Math.hypot(da, b);
      if (r > R + 0.5) continue;
      const [x, z] = F.at(ca + da, 0);
      const y = cy + b;
      if (!replaceable.has(world.get(x, y, z))) continue;
      let m;
      if (r > R - 0.5) m = tracery;                                        // the ring
      else if (r < 0.75) m = hub;                                          // the carved hub
      else {
        const ang = Math.atan2(b, da);
        let onSpoke = false;
        if (spokes && r > 1.2) {
          const k = Math.round(ang / (2 * Math.PI / spokes));
          const delta = ang - k * (2 * Math.PI / spokes);
          onSpoke = Math.abs(r * Math.sin(delta)) < 0.5;
        }
        if (onSpoke) m = tracery;
        else {
          const sector = Math.floor(((ang + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * (spokes || 8));
          m = glassList[sector % glassList.length];
        }
      }
      world.set(x, y, z, m);
      if (m === tracery || m === hub) stone++; else glass++;
    }
  const [hx, hz] = F.at(ca, 0);
  return { glass, stone, centre: [hx, cy, hz], R };            // [x, y, z], like every other recorded point
}

// ---- lancets -----------------------------------------------------------------
// A tall single light from y0 to y1 in wall cell (x, z), with a keystone head.
function lancet(world, x, z, y0, y1, glass, key) {
  for (let y = y0; y <= y1; y++) world.set(x, y, z, glass);
  world.set(x, y1 + 1, z, key);
}

/**
 * The whole Gothic dress for a church hall.
 *   rec   the building record (one tall floor)
 *   face  entrance side
 *   mats  { wall, trim, glass, carve, stair, finial }
 * Returns counts of what was placed, for the checks.
 */
export function gothicChurch(world, rec, face, mats, rng) {
  const r = rec.rects[0];
  const F = facadeFrame(r, face);
  const G = rec.groundY, P = rec.pitch, top = G + P - 1;          // top = the trim band under the roof slab
  const replaceable = new Set([mats.wall, mats.trim, mats.glass]);
  const put = (x, y, z, m) => { if (!world.has(x, y, z)) world.set(x, y, z, m); };
  const out = { lancets: 0, buttresses: 0, pinnacles: 0, corbels: 0, gargoyles: 0, rose: null };

  // clear the stock short windows off the side and back walls: lancets replace them
  for (const list of [F.sideL, F.sideR, F.back])
    for (const [x, z] of list)
      for (let y = G + 1; y < top; y++) if (world.get(x, y, z) === mats.glass) world.set(x, y, z, mats.wall);

  // ---- rose window in the facade, over the door ----------------------------------
  const R = Math.max(2, Math.min(4, Math.floor((P - 6) / 2)));
  const door = rec.doorCells[0];
  let ca = 0;
  for (let a = 0; a < F.width; a++) { const [x, z] = F.at(a, 0); if (x === door[0] && z === door[1]) ca = a; }
  if (ca - R >= 1 && ca + R <= F.width - 2 && P >= 6 + 2 * R) {
    const glassList = [mats.glass, ...STAINED.filter((g) => g !== mats.glass)].slice(0, 4);
    out.rose = roseWindow(world, F, ca, G + 4 + R, R, { tracery: mats.trim, hub: mats.carve, glassList, replaceable });
  }

  // ---- a Flamboyant portal: pinnacles either side of the door, a gable over it ----
  // All a block out from the facade. The gable's lowest course is four above
  // the ground (gy + 4), so the step out of the door keeps its head room even
  // where the way out is a block up; the doorstep itself is never touched.
  {
    const [ox, oz] = F.out;
    const cellAt = (a) => { const [x, z] = F.at(a, 0); return [x + ox, z + oz]; };
    const [ax, az] = F.at(ca, 0), [bx, bz] = F.at(ca + 1, 0);
    const along = [bx - ax, bz - az];
    const portal = { pinnacles: 0, gable: 0, finial: 0 };
    const clear = (x, z, y0, y1) => { for (let y = y0; y <= y1; y++) if (world.has(x, y, z)) return false; return true; };
    for (const a of [ca - 2, ca + 2]) {
      if (a < 0 || a >= F.width) continue;
      const [x, z] = cellAt(a);
      if (!clear(x, z, G + 1, G + 5)) continue;
      for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, mats.trim);
      world.set(x, G + 4, z, mats.carve);
      world.set(x, G + 5, z, mats.finial);
      portal.pinnacles++;
    }
    for (const [a, sgn] of [[ca - 1, 1], [ca + 1, -1]]) {
      const [x, z] = cellAt(a);
      if (!clear(x, z, G + 4, G + 4)) continue;
      world.set(x, G + 4, z, stairId(mats.stair, CLIMB(along[0] * sgn, along[1] * sgn)));
      portal.gable++;
    }
    {
      const [x, z] = cellAt(ca);
      if (clear(x, z, G + 4, G + 6)) {
        world.set(x, G + 4, z, mats.trim);
        world.set(x, G + 5, z, mats.carve);
        world.set(x, G + 6, z, mats.finial);
        portal.gable++; portal.finial = 1;
      }
    }
    out.portal = portal;
  }

  // ---- side walls: lancets and buttresses in turn --------------------------------
  // positions run back from the facade; the corners (d = 0, depth-1) keep their quoins
  const lancetTop = top - 3;
  for (const side of [F.sideL, F.sideR]) {
    for (let d = 1; d < F.depth - 1; d++) {
      const [x, z, ox, oz] = side[d];
      if (d % 3 === 2) {
        if (lancetTop >= G + 3) { lancet(world, x, z, G + 2, lancetTop, mats.glass, mats.carve); out.lancets++; }
      } else if (d % 3 === 0) {
        // the buttress: solid to under the eaves, a sloped weathering, a pinnacle above
        const bx = x + ox, bz = z + oz;
        let ok = true;
        for (let y = G + 1; y <= top + 3; y++) if (world.has(bx, y, bz) && y < top) ok = false;
        if (!ok) continue;
        for (let y = G + 1; y <= top - 2; y++) world.set(bx, y, bz, mats.trim);
        world.set(bx, top - 1, bz, stairId(mats.stair, CLIMB(-ox, -oz)));        // climbs toward the wall
        world.set(bx, top, bz, mats.carve);
        world.set(bx, top + 1, bz, mats.trim);                                   // the pinnacle (over the eave line)
        world.set(bx, top + 2, bz, mats.trim);
        world.set(bx, top + 3, bz, mats.finial);
        out.buttresses++; out.pinnacles++;
      }
    }
  }

  // ---- the east end: a triple lancet in the back wall ------------------------------
  {
    const mid = Math.floor(F.width / 2);
    for (const a of [mid - 2, mid, mid + 2]) {
      if (a < 1 || a > F.width - 2) continue;
      const [x, z] = F.back[a];
      const hi = a === mid ? lancetTop + 1 : lancetTop;
      if (hi >= G + 3) { lancet(world, x, z, G + 2, Math.min(hi, top - 2), mats.glass, mats.carve); out.lancets++; }
    }
  }

  // ---- corbel table: brackets under the eaves, every other cell --------------------
  for (const list of [F.sideL, F.sideR, F.back]) {
    list.forEach(([x, z, ox, oz], i) => {
      if (i % 2) return;
      const cx = x + ox, cz = z + oz;
      if (world.has(cx, top - 1, cz)) return;
      put(cx, top - 1, cz, stairId(mats.stair, CLIMB(-ox, -oz), true));
      out.corbels++;
    });
  }

  // ---- gargoyles: a spout at each corner, pointing out along the side walls ---------
  for (const [side, i] of [[F.sideL, 0], [F.sideR, 0], [F.sideL, F.depth - 1], [F.sideR, F.depth - 1]]) {
    const [x, z, ox, oz] = side[i];
    const gx = x + ox, gz = z + oz, gy = top - 2;
    if (world.has(gx, gy, gz)) continue;
    world.set(gx, gy, gz, stairId(mats.stair, CLIMB(-ox, -oz), true));
    out.gargoyles++;
  }
  return out;
}

// ---- flèche ----------------------------------------------------------------------
// An octagonal spire over a square tower top T (x0..x1, z0..z1, odd side),
// starting at y0 (the tower's capping course). The octagon shrinks linearly
// to a point; crockets (stairs climbing inward) stud its four edges every
// other course; a pinnacle stands at each corner of the tower top.
export function fleche(world, T, y0, mats, height = 9) {
  const cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2;
  const half = (T.x1 - T.x0) / 2;                                  // 2 for a 5x5 tower
  let cells = 0, crockets = 0;
  for (let z = T.z0; z <= T.z1; z++) for (let x = T.x0; x <= T.x1; x++) world.set(x, y0, z, mats.spire);
  for (let j = 1; j <= height; j++) {
    const r = (half + 0.5) * (1 - j / (height + 1));
    const y = y0 + j;
    let any = false;
    for (let z = T.z0; z <= T.z1; z++)
      for (let x = T.x0; x <= T.x1; x++) {
        const a = Math.abs(x - cx), b = Math.abs(z - cz);
        if (a <= r + 1e-6 && b <= r + 1e-6 && a + b <= r * 1.42 + 1e-6) { world.set(x, y, z, mats.spire); cells++; any = true; }
      }
    if (!any) world.set(Math.round(cx), y, Math.round(cz), mats.spire);
    // crockets on the four faces, every other course, while there is an edge to hang on
    if (j % 2 === 0 && r >= 0.9) {
      const e = Math.floor(r + 1e-6) + 1;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = Math.round(cx) + dx * e, z = Math.round(cz) + dz * e;
        if (world.has(x, y, z)) continue;
        world.set(x, y, z, stairId(mats.stair, CLIMB(-dx, -dz)));
        crockets++;
      }
    }
  }
  const tipY = y0 + height + 1;
  world.set(Math.round(cx), tipY, Math.round(cz), mats.finial);
  // corner pinnacles
  let pinnacles = 0;
  for (const [x, z] of [[T.x0, T.z0], [T.x1, T.z0], [T.x0, T.z1], [T.x1, T.z1]]) {
    world.set(x, y0 + 1, z, mats.trim);
    world.set(x, y0 + 2, z, mats.trim);
    world.set(x, y0 + 3, z, mats.pinTop || mats.finial);
    pinnacles++;
  }
  return { tipY, cells, crockets, pinnacles };
}
