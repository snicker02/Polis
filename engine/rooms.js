// engine/rooms.js — dividing floors into real rooms.
//
// Each floor gets a corridor running its length, taking in the stair core and
// the open floor round it (so every landing opens onto the corridor). The
// strips either side become rooms, 4–6 blocks long, each behind an inside wall
// with a door onto the corridor:
//
//        ┌────┬────┬─────┬────┐
//        │    │    │     │    │      rooms
//        ├─D──┼──D─┴──D──┼─D──┤      corridor wall with doors
//        │   ░░core░░         │      corridor (core + the ring round it)
//        ├──D─┬────D──┬───D───┤
//        │    │       │       │      rooms
//        └────┴───────┴───────┘
//
// Apartments are a pair of rooms: a kitchen off the corridor, and a bedroom
// behind it through a door in the wall between them. A strip too shallow for
// rooms stays part of the corridor. Nothing here touches the stair core or
// the ring round it, and walls stop at the underside of the floor above.

import { MAT, doorId, DIR, glazedId, GLAZE_COLORS } from './materials.js';

// What each floor is for.
export function floorUse(style, k, floors) {
  if (style === 'house') return k === 0 ? (floors === 1 ? 'cottage' : 'home') : 'bedrooms';
  if (k === 0) return 'shops';
  if (style === 'mid') return 'apartments';
  return k % 2 === 1 ? 'apartments' : 'offices';
}

// Plan one floor. Returns { walls, doors, rooms } in world x/z, or null when
// the floor is too small to divide.
export function planRooms(rec, k, rng) {
  const r = rec.rects[k];
  const I = { x0: r.x0 + 1, x1: r.x1 - 1, z0: r.z0 + 1, z1: r.z1 - 1 };
  if (Math.max(I.x1 - I.x0, I.z1 - I.z0) < 5 || Math.min(I.x1 - I.x0, I.z1 - I.z0) < 2) return null;
  const alongX = (I.x1 - I.x0) >= (I.z1 - I.z0);
  const uLo = alongX ? I.x0 : I.z0, uHi = alongX ? I.x1 : I.z1;
  const vLo = alongX ? I.z0 : I.x0, vHi = alongX ? I.z1 : I.x1;
  const xz = (u, v) => (alongX ? [u, v] : [v, u]);
  const use = rec.useOverride ? rec.useOverride(k) : floorUse(rec.style, k, rec.floors);

  // corridor band across v
  let bLo, bHi;
  const c = rec.core;
  if (c) {
    const cv0 = alongX ? c.z0 : c.x0, cv1 = alongX ? c.z1 : c.x1;
    bLo = Math.max(vLo, cv0 - 1); bHi = Math.min(vHi, cv1 + 1);
  } else {
    const vm = Math.floor((vLo + vHi) / 2);
    bLo = vm; bHi = Math.min(vHi, vm + 1);
  }
  // the entrance must open into a room or the corridor, never into a wall
  const entranceInside = k === 0 ? (rec.doorCells || []).map(([x, z]) => {
    const [ox, oz] = rec.door.out;
    return [x - ox, z - oz];
  }) : [];

  const walls = [], doors = [], rooms = [];
  const sides = [];
  if (bLo - vLo >= 3) sides.push({ wallV: bLo - 1, v0: vLo, v1: bLo - 2, toCorr: +1 });
  if (vHi - bHi >= 3) sides.push({ wallV: bHi + 1, v0: bHi + 2, v1: vHi, toCorr: -1 });

  // facing names: a door in a wall that runs along u faces across v
  const vFacing = (sign) => (alongX ? (sign > 0 ? 'south' : 'north') : (sign > 0 ? 'east' : 'west'));
  const uFacing = (sign) => (alongX ? (sign > 0 ? 'east' : 'west') : (sign > 0 ? 'south' : 'north'));

  for (const sd of sides) {
    // split the strip along u into rooms with one-block walls between them
    const L = uHi - uLo + 1;
    const target = rng.int(4, 6);
    const n = Math.max(1, Math.floor((L + 1) / (target + 1)));
    const cuts = [];                          // u positions of partition walls
    for (let i = 1; i < n; i++) cuts.push(uLo + Math.round((L * i) / n) - 1);
    const spans = [];
    let a = uLo;
    for (const cu of cuts) { if (cu - a >= 3) { spans.push([a, cu - 1]); a = cu + 1; } }
    spans.push([a, uHi]);
    if (spans.some(([s0, s1]) => s1 - s0 + 1 < 3)) continue;

    // skip this side on the ground floor if the entrance would open into one of its walls
    const isWall = (u, v) => v === sd.wallV || (v >= sd.v0 && v <= sd.v1 && cuts.includes(u));
    if (entranceInside.some(([x, z]) => { const u = alongX ? x : z, v = alongX ? z : x; return isWall(u, v); })) continue;

    // walls
    for (let u = uLo; u <= uHi; u++) walls.push(xz(u, sd.wallV));
    for (const cu of cuts) if (cu > uLo && cu < uHi) for (let v = sd.v0; v <= sd.v1; v++) walls.push(xz(cu, v));

    // room types and doors
    const types = spans.map((_, i) => {
      if (use === 'apartments') return (i % 2 === 0 ? (i + 1 < spans.length ? 'kitchen' : 'studio') : 'bedroom');
      if (use === 'shops') return 'shop';
      if (use === 'classrooms') return 'classroom';
      if (use === 'offices') return 'office';
      if (use === 'bedrooms') return 'bedroom';
      if (use === 'home') return i === 0 ? 'kitchen' : 'living';
      return i === 0 ? 'kitchen' : 'bedroom';            // cottage
    });
    spans.forEach(([s0, s1], i) => {
      const room = { type: types[i], doors: [] };
      const [x0, z0] = xz(s0, sd.v0), [x1, z1] = xz(s1, sd.v1);
      room.x0 = Math.min(x0, x1); room.x1 = Math.max(x0, x1);
      room.z0 = Math.min(z0, z1); room.z1 = Math.max(z0, z1);
      // a bedroom in an apartment opens off its kitchen, not the corridor
      const apartmentBedroom = use === 'apartments' && types[i] === 'bedroom';
      if (!apartmentBedroom) {
        const du = Math.floor((s0 + s1) / 2);
        const [dx, dz] = xz(du, sd.wallV);
        doors.push({ x: dx, z: dz, facing: vFacing(sd.toCorr) });
        room.doors.push([dx, dz]);
      } else {
        const cu = s0 - 1;                               // the wall shared with the kitchen before it
        const dv = Math.floor((sd.v0 + sd.v1) / 2);
        const [dx, dz] = xz(cu, dv);
        doors.push({ x: dx, z: dz, facing: uFacing(+1) });
        room.doors.push([dx, dz]);
        rooms[rooms.length - 1].doors.push([dx, dz]);     // the kitchen shares that door
      }
      rooms.push(room);
    });
  }
  // No rooms beside the corridor (a small floor, or stairs in the middle):
  // try rooms across the ends instead, each behind a cross wall with a door.
  if (!rooms.length) {
    let ends;
    if (c) {
      const cu0 = alongX ? c.x0 : c.z0, cu1 = alongX ? c.x1 : c.z1;
      ends = [
        { wallU: cu0 - 2, u0: uLo, u1: cu0 - 3, toCorr: +1 },
        { wallU: cu1 + 2, u0: cu1 + 3, u1: uHi, toCorr: -1 },
      ];
    } else {
      const mid = Math.floor((uLo + uHi) / 2);          // one storey, no stairs: two rooms
      ends = [{ wallU: mid, u0: uLo, u1: mid - 1, toCorr: +1, second: { u0: mid + 1, u1: uHi } }];
    }
    for (const e of ends) {
      if (e.u1 - e.u0 + 1 < 2 || (e.second && e.second.u1 - e.second.u0 + 1 < 2)) continue;
      if (entranceInside.some(([x, z]) => (alongX ? x : z) === e.wallU)) continue;
      for (let v = vLo; v <= vHi; v++) walls.push(xz(e.wallU, v));
      const dv = Math.floor((vLo + vHi) / 2);
      const [dx, dz] = xz(e.wallU, dv);
      doors.push({ x: dx, z: dz, facing: uFacing(e.toCorr) });
      const mk = (u0, u1, type) => {
        const [x0, z0] = xz(u0, vLo), [x1, z1] = xz(u1, vHi);
        return { type, doors: [[dx, dz]], x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
      };
      const t1 = use === 'shops' ? 'shop' : use === 'classrooms' ? 'classroom' : use === 'offices' ? 'office' : use === 'bedrooms' ? 'bedroom' : use === 'apartments' ? 'studio' : 'kitchen';
      rooms.push(mk(e.u0, e.u1, t1));
      if (e.second) rooms.push(mk(e.second.u0, e.second.u1, use === 'shops' ? 'shop' : 'bedroom'));
    }
  }
  if (!rooms.length) return null;
  return { walls, doors, rooms, use };
}

// Build a planned floor: walls from floor to ceiling, doors (with wall above
// them up to the ceiling), a light in the middle of each room.
export function buildRooms(world, rec, k, plan, theme, put) {
  const sy = rec.floorYs[k], top = sy + rec.pitch - 1;
  const doorAt = new Set(plan.doors.map((d) => d.x + ',' + d.z));
  for (const [x, z] of plan.walls) {
    if (doorAt.has(x + ',' + z)) continue;
    for (let y = sy + 1; y <= top; y++) put(x, y, z, MAT.INTERIOR_WALL);
  }
  for (const d of plan.doors) {
    put(d.x, sy + 1, d.z, doorId(theme.door, DIR[d.facing], false, 0));
    put(d.x, sy + 2, d.z, doorId(theme.door, DIR[d.facing], true, 0));
    for (let y = sy + 3; y <= top; y++) put(d.x, y, d.z, MAT.INTERIOR_WALL);
  }
  for (const rm of plan.rooms) {
    const cx = Math.floor((rm.x0 + rm.x1) / 2), cz = Math.floor((rm.z0 + rm.z1) / 2);
    if (!world.has(cx, top, cz)) put(cx, top, cz, MAT.LANTERN);
  }
  plan.art = hangArt(world, rec, k, plan, put);
}

// Art on the inside walls: 2x2 panels of glazed terracotta at eye level, four
// tiles of one colour each turned a quarter from the last, so they make a
// motif. Inside walls are one block thick, so both rooms see the panel.
// One panel per straight run of wall at least four long, clear of doors.
function hangArt(world, rec, k, plan, put) {
  const sy = rec.floorYs[k], top = sy + rec.pitch - 1;
  if (top < sy + 3) return 0;
  const lo = sy + 2, hi = sy + 3;
  const wallSet = new Set(plan.walls.map(([x, z]) => x + ',' + z));
  const doorSet = new Set(plan.doors.map((d) => d.x + ',' + d.z));
  const nearDoor = (x, z) => plan.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.z - z) <= 1);
  const used = new Set();
  let n = 0, pick = (rec.x0 * 7 + rec.z0 * 13 + k * 5) >>> 0;
  for (const [x, z] of plan.walls) {
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      // four wall cells in a line starting here, none a door or next to one
      const run = [0, 1, 2, 3].map((i) => [x + ax * i, z + az * i]);
      if (!run.every(([a, b]) => wallSet.has(a + ',' + b) && !doorSet.has(a + ',' + b) && !nearDoor(a, b) && !used.has(a + ',' + b))) continue;
      const [p1, p2] = [run[1], run[2]];
      const color = GLAZE_COLORS[pick++ % GLAZE_COLORS.length];
      // clockwise round the 2x2: top-left, top-right, bottom-right, bottom-left
      const faces = [2, 5, 3, 4];
      put(p1[0], hi, p1[1], glazedId(color, faces[0]));
      put(p2[0], hi, p2[1], glazedId(color, faces[1]));
      put(p2[0], lo, p2[1], glazedId(color, faces[2]));
      put(p1[0], lo, p1[1], glazedId(color, faces[3]));
      for (const c of run) used.add(c[0] + ',' + c[1]);
      // leave the next few cells bare so panels do not run into each other
      for (let i = 4; i < 7; i++) used.add((x + ax * i) + ',' + (z + az * i));
      n++;
    }
  }
  return n;
}
