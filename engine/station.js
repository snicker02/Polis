// engine/station.js — a railway station on the line.
//
// Built on a lot whose street front a railway (or tram) line runs along, straight
// and at grade (landmarks.js: railFront chooses it, by a line's stop where it can),
// facing that line. Fifteen by thirteen where the lot allows, else eleven by eleven,
// brick on a stone brick plinth course:
//
// - the front on the platform: a doorway three wide, tall windows, and over the
//   door a clock tower, its face a ring of quartz round a dark centre, a real clock
//   in an item frame on it (it tells the game's time of day);
// - the platform canopy: from the front out over the pavement and the track to a
//   block past the rail, five over the ground (a cart's rider has room), lanterns
//   under it over the pavement, never over the track; laid only where the street
//   has nothing there already (a street lamp, a sign, a tree keep their place);
// - benches before the front under the canopy, facing the track;
// - inside, the booking hall: the ticket counter along the back, a departures
//   board, rows of benches facing the platform doors, lanterns.

import { MAT, stairId, WEIRDO } from './materials.js';
import { N } from './blockcore.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const STATION_SIZE = [15, 13];
const FACING = { north: 2, south: 3, west: 4, east: 5 };

// The largest station that fits square on to its street (never turned sideways:
// its front must face the line) and whose whole front the rail runs along. The lot
// chooser asks this too, so it picks only a lot the station can be built on.
export function stationFit(lot, rail) {
  if (!rail) return null;
  const railSet = new Set(rail.cells.map(([x, z]) => x + ',' + z));
  for (const [w, d] of [[15, 13], [11, 11]]) {
    const f = lotFrame(lot, rail.side, w, d);
    if (!f || f.sideways) continue;
    let rv = null;
    for (let v = -1; v >= -8 && rv === null; v--) { const [x, z] = f.at((w - 1) / 2, v); if (railSet.has(x + ',' + z)) rv = v; }
    if (rv === null) continue;
    const covered = [...Array(w).keys()].every((u) => { const [x, z] = f.at(u, rv); return railSet.has(x + ',' + z); });
    if (covered) return { W: w, D: d, fr: f, railV: rv, railSet };
  }
  return null;
}

export function trainStation(world, lot, face, cfg, rng, G, signTags) {
  const rail = lot.rail;
  const fit = stationFit(lot, rail);
  if (!fit) return null;
  const { W, D, fr, railV, railSet } = fit;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, out = neg(back), mid = (W - 1) / 2, H = 6, ROOF = G + H + 1;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const empty = (u, v, y) => { const [x, z] = at(u, v); return !world.has(x, y, z); };

  // ---- the hall ------------------------------------------------------------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= ROOF + 5; y++) clear(u, v, y);
    put(u, v, G, MAT.SMOOTH); put(u, v, ROOF, MAT.STONEBRICK);
    const edge = u === 0 || u === W - 1 || v === 0 || v === D - 1;
    if (edge) for (let y = G + 1; y < ROOF; y++) put(u, v, y, y === G + 1 ? MAT.STONEBRICK : MAT.BRICK);
  }
  // tall windows down the sides and along the front
  for (let v = 2; v < D - 1; v += 3) for (let y = G + 2; y <= G + 4; y++) { put(0, v, y, MAT.GLASS); put(W - 1, v, y, MAT.GLASS); }
  for (const u of [2, W - 3]) for (let y = G + 2; y <= G + 4; y++) put(u, 0, y, MAT.GLASS);
  // the doorway on the platform, three wide and three high
  for (let u = mid - 1; u <= mid + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);

  // ---- the clock tower over the door: a quartz ring round a dark centre, a clock on it --
  const TOWER = ROOF + 5;
  for (let u = mid - 1; u <= mid + 1; u++) for (let v = 0; v <= 2; v++) for (let y = ROOF; y <= TOWER; y++) {
    const shell = u !== mid || v !== 1;
    if (shell) put(u, v, y, MAT.BRICK);
  }
  for (let u = mid - 1; u <= mid + 1; u++) for (let v = 0; v <= 2; v++) put(u, v, TOWER + 1, MAT.STONEBRICK);
  const cy = ROOF + 3;                                      // the clock's height
  for (let du = -1; du <= 1; du++) for (let dy = -1; dy <= 1; dy++) put(mid + du, 0, cy + dy, du || dy ? MAT.QUARTZ : MAT.C_BLACK);
  const [fx, fz] = at(mid, -1);
  world.set(fx, cy, fz, MAT['FRAME_' + FACING[nameOf(out)]]);
  world.setData(fx, cy, fz, { id: 'ItemFrame', tags: {
    Item: N.comp({ Count: N.byte(1), Damage: N.short(0), Name: N.str('minecraft:clock'), WasPickedUp: N.byte(0) }),
    ItemDropChance: N.float(1), ItemRotation: N.float(0) } });
  const clock = { frame: [fx, cy, fz], face: pos(mid, 0, cy) };

  // ---- the platform canopy: over the pavement and the track, a block past the rail ------
  const CAN = G + 5;
  const canopy = [], lanterns = [], benches = [];
  for (let v = -1; v >= railV - 1; v--) for (let u = 0; u < W; u++) {
    if (!empty(u, v, CAN)) continue;
    put(u, v, CAN, MAT.SMOOTH_QUARTZ); canopy.push(pos(u, v, CAN));
  }
  // lanterns under it over the pavement, never over the track (or a rider's head)
  for (let u = 1; u < W - 1; u += 3) for (let v = -1; v > railV; v--) {
    const [x, z] = at(u, v);
    if (railSet.has(x + ',' + z) || !empty(u, v, CAN - 1) || !canopy.some((c) => c[0] === x && c[2] === z)) continue;
    put(u, v, CAN - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, CAN - 1)); break;
  }
  // benches before the front, facing the track (the doorway kept clear)
  const seat = stairId('oak', WEIRDO[nameOf(back)]);
  for (let u = 1; u < W - 1; u++) {
    if (Math.abs(u - mid) <= 2 || u % 2 === 0) continue;
    const [x, z] = at(u, -1);
    if (!empty(u, -1, G + 1) || !empty(u, -1, G + 2) || !world.has(x, G, z) || railSet.has(x + ',' + z)) continue;
    put(u, -1, G + 1, seat); benches.push(pos(u, -1, G + 1));
  }

  // ---- the booking hall ----------------------------------------------------------------
  for (let u = 2; u <= W - 3; u++) put(u, D - 3, G + 1, MAT.SMOOTH_QUARTZ);          // the ticket counter
  sign(mid, D - 4, G + 1, out, 'Tickets');
  sign(mid - 2, D - 4, G + 1, out, 'Departures');
  sign(mid + 2, D - 4, G + 1, out, 'Platform 1');
  const inSeat = stairId('oak', WEIRDO[nameOf(back)]);
  for (let v = 3; v <= D - 6; v += 2) for (let u = 1; u < W - 1; u++) {
    if (Math.abs(u - mid) <= 1) continue;                  // the way through to the counter
    put(u, v, G + 1, inSeat); benches.push(pos(u, v, G + 1));
  }
  for (const [u, v] of [[2, 2], [W - 3, 2], [mid, Math.floor(D / 2)], [2, D - 3], [W - 3, D - 3]]) { put(u, v, ROOF - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, ROOF - 1)); }
  if (empty(mid + 2, -1, G + 1)) sign(mid + 2, -1, G + 1, out, 'Station');        // (by the door, on the platform)

  const door = at(mid, -1);
  return { kind: 'station', lot, canopy, lanterns, benches, clock, stop: rail.stop, railV, wide: W,
    rails: rail.cells.map(([x, z]) => [x, z]), sideways: false, door: [door[0], G + 1, door[1]],
    frame: { at, W, D, mid, ROOF, railV, CAN } };
}
