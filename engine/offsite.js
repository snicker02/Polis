// engine/offsite.js — ground of the city's own outside its square: the airport's
// airfield and the theme park, each beside the city at the end of a road out.
//
// edgeRoute finds the way out: for each side asked for, every street the edge can be
// reached from in a straight line across open ground (no lot, farm, canal or water),
// three wide; the shortest, nearest the middle of its side. A street the city's wall
// stands on (where the outline runs along its end) is gone through to the open street
// beyond. accessRoad lays that road from the street out through the wall (the wall cut,
// a tram's rails kept, a quartz post with a lamp where the wall goes on, a sign on the
// street), and gives the frame of the ground beyond: u along the city's edge (the road
// arrives at u = 0), v out from the city (v = 0 the first row outside it), at the
// height the road leaves the city.

import { MAT, MATERIALS, signId, SIGN_FACING } from './materials.js';
import { USE } from './plan.js';

export const OUT = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
export const OPPOSITE = { north: 'south', south: 'north', west: 'east', east: 'west' };
export const NAME = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
const ALLOWED = new Set([USE.EMPTY, USE.ROAD, USE.SIDEWALK, USE.PARK, USE.PLAZA]);

// the frame of the ground beyond the edge, for a side and a place along it
export function edgeFrame(side, t, W, D) {
  const F = OUT[side], across = F[0] ? [0, 1] : [1, 0];
  const base = side === 'north' ? [t, -1] : side === 'south' ? [t, D] : side === 'west' ? [-1, t] : [W, t];
  const at = (u, v) => [base[0] + across[0] * u + F[0] * v, base[1] + across[1] * u + F[1] * v];
  return { F, across, base, at };
}
// the rectangle of ground u0..u1 by 0..depth-1 beyond the edge, in world x, z
export function edgeRect(side, t, W, D, u0, u1, depth) {
  const { at } = edgeFrame(side, t, W, D);
  const a = at(u0, 0), b = at(u1, depth - 1);
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
}
const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

// opts: sides (the sides to look on, in order of preference: a side earlier in the
// list wins over a later one), footprint [u0, u1, depth] with avoid (rectangles the
// ground must keep clear of: another off-site ground)
export function edgeRoute(plan, world, GROUND, elevAt, opts = {}) {
  const { W, D, use } = plan;
  const at = (x, z) => use[z * W + x];
  const water = (x, z) => { const y = GROUND + elevAt(x, z); const i = world.get(x, y, z); return i >= 0 && /water/.test(MATERIALS.def(i).block); };
  // something standing on the street a player could not walk through (the wall); a rail is walked over
  const blocked = (x, z) => { const y = GROUND + elevAt(x, z); return [1, 2].some((d) => { const i = world.get(x, y + d, z); return i >= 0 && !/rail/.test(MATERIALS.def(i).block); }); };
  const sides = opts.sides || ['north', 'south', 'west', 'east'];
  let best = null;
  sides.forEach((side, rank) => {
    const [fx, fz] = OUT[side];
    const along = fx ? D : W;
    for (let t = 6; t < along - 6; t++) {
      if (opts.footprint && opts.avoid && opts.avoid.length) {
        const [u0, u1, depth] = opts.footprint, r = edgeRect(side, t, W, D, u0 - 2, u1 + 2, depth + 2);
        if (opts.avoid.some((a) => overlaps(a, r))) continue;
      }
      // (from the edge in: x, z of the k-th cell in, s across)
      const cellOf = (k, s) => fx ? [fx > 0 ? W - 1 - k : k, t + s] : [t + s, fz > 0 ? D - 1 - k : k];
      let k = 0, ok = false;
      for (; k < Math.min(W, D) / 3; k++) {
        const row = [-1, 0, 1].map((s) => cellOf(k, s));
        if (row.some(([x, z]) => !ALLOWED.has(at(x, z)) || water(x, z))) break;
        if (at(...row[1]) === USE.ROAD && !blocked(...row[1])) { ok = true; break; }
      }
      if (!ok) continue;
      // (a street on the edge itself, open, as a square city's ring road with its wall
      // beside it: the way out its one row)
      const n = Math.max(1, k);
      const score = rank * 1000 + k + 0.04 * Math.abs(t - along / 2);
      if (!best || score < best.score) best = { side, t, k, score, street: cellOf(k, 0), cells: [...Array(n).keys()].map((j) => [-1, 0, 1].map((s) => cellOf(n - 1 - j, s))) };
    }
  });
  return best;          // cells: rows from the street outward, each three across
}

// The road from the street out through the wall, three wide, and the frame beyond.
export function accessRoad(world, plan, route, ctx, label, surface) {
  const { GROUND, elevAt, signTags } = ctx;
  const { W, D } = plan;
  const road = [];
  let y = null;
  const inCity = (x, z) => !plan.mask || plan.mask[z * W + x] === 1;
  const isRail = (x, yy, z) => { const i = world.get(x, yy, z); return i >= 0 && /rail/.test(MATERIALS.def(i).block); };
  let gateRow = null;
  for (const row of route.cells) {
    const [cx, cz] = row[1];
    if (inCity(cx, cz) || y === null) y = GROUND + elevAt(cx, cz);
    for (const [x, z] of row) {
      if (world.has(x, y + 1, z) && !isRail(x, y + 1, z)) gateRow = row;      // (the wall, cut here)
      for (let yy = y + 1; yy <= y + 16; yy++) if (!isRail(x, yy, z)) world.clear(x, yy, z);   // (a tram's rails kept)
      for (let yy = GROUND - 2; yy < y; yy++) if (!world.has(x, yy, z)) world.set(x, yy, z, MAT.BASE);
      world.set(x, y, z, surface);
      road.push([x, y, z]);
    }
  }
  // the gateway: a quartz post each side where the wall goes on, a lamp on each
  const gate = [];
  if (gateRow) {
    const [a, b] = [gateRow[0], gateRow[2]];
    for (const [x, z] of [[2 * a[0] - gateRow[1][0], 2 * a[1] - gateRow[1][1]], [2 * b[0] - gateRow[1][0], 2 * b[1] - gateRow[1][1]]]) {
      const gy = GROUND + elevAt(x, z);
      if (!world.has(x, gy + 1, z) || isRail(x, gy + 1, z)) continue;          // (no wall there to stand a post in)
      for (let yy = gy + 1; yy <= gy + 4; yy++) world.set(x, yy, z, MAT.QUARTZ_PILLAR);
      world.set(x, gy + 5, z, MAT.LAMP);
      gate.push([x, gy + 1, z]);
    }
  }
  // a sign on the street pointing the way
  const fr = edgeFrame(route.side, route.t, W, D);
  const [stx, stz] = route.street;
  let streetSign = null;
  for (const d of [2, -2, 3, -3]) {
    const x = stx + d * fr.across[0], z = stz + d * fr.across[1];
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const sy = GROUND + elevAt(x, z);
    if (!world.has(x, sy, z) || world.has(x, sy + 1, z) || world.has(x, sy + 2, z)) continue;
    world.set(x, sy + 1, z, signId(SIGN_FACING[NAME([-fr.F[0], -fr.F[1]])]));
    world.setData(x, sy + 1, z, { id: 'Sign', tags: signTags(label + '\nthis way') });
    streetSign = [x, sy + 1, z];
    break;
  }
  return { road, YA: y, gate, streetSign, street: [stx, GROUND + elevAt(stx, stz), stz], ...fr };
}

// lamps wherever ground out of reach of a light: on a post on open ground, set flush in
// a hard surface. cells: every [u, v] to light; ground(u, v) its kind ('soft' | 'hard' |
// null to leave); lit: the lights there already ([x, y, z])
export function lightGround(world, frame, YA, cells, ground, lit, posts, flushId) {
  const near = (x, yy, z) => lit.some(([a, b, c]) => Math.abs(a - x) + Math.abs(b - yy) + Math.abs(c - z) <= 11);
  const added = [];
  for (const [u, v] of cells) {
    const [x, z] = frame.at(u, v), kind = ground(u, v, x, z);
    if (!kind || near(x, YA + 1, z)) continue;
    if (kind === 'hard') { world.set(x, YA, z, flushId); lit.push([x, YA, z]); added.push([x, YA, z]); continue; }
    if ([0, 1, 2, 3, 4].some((d) => world.has(x, YA + 1 + d, z))) continue;
    for (let yy = YA + 1; yy <= YA + 3; yy++) world.set(x, yy, z, posts);
    world.set(x, YA + 4, z, MAT.LAMP);
    lit.push([x, YA + 4, z]); added.push([x, YA + 4, z]);
  }
  return added;
}
