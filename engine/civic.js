// engine/civic.js — a police station, a theatre and a hotel.
//
// Each laid out in the lot's own frame (u across, v back from the street; zoo.js:
// lotFrame), set down by OUTWARD and turned sideways on a lot long beside its
// street; the frame, signs and beds are services.js's.
//
// The police station, thirteen by fifteen, light blue and white: a blue lamp over
// the door; a front desk; the office (desks, chairs, lockers of barrels); a holding
// cell behind iron bars at the back. Next to the jail where the city has one
// (landmarks.js chooses its lot).
//
// The theatre, seventeen by twenty-three, dark oak: a lobby with a ticket booth;
// the auditorium, rows of seats stepping down toward the stage; before the stage
// the orchestra pit, note blocks in it; the stage raised two, red wool curtains at
// its sides and across its back; chandeliers over the seats.
//
// The hotel, thirteen by nineteen, five storeys: the lobby (a reception desk,
// seats); a flight of stairs a floor up the front; on every floor above, a
// corridor and six rooms off it, each a bed, a window and a lantern.

import { MAT, stairId, WEIRDO, BED_VEC } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const POLICE_SIZE = [13, 15], THEATRE_SIZE = [17, 20], HOTEL_SIZE = [13, 19];

// a shell: floor, walls, roof, cleared inside
function shell(put, clear, W, D, G, top, wall, floor, roof) {
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= top + 2; y++) clear(u, v, y);
    put(u, v, G, floor); put(u, v, top, roof);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < top; y++) put(u, v, y, wall);
  }
}

// ---- the police station ------------------------------------------------------------------
export function policeStation(world, lot, face, cfg, rng, G, signTags) {
  const W = 13, D = 15, H = 5, TOP = G + H + 1;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign } = h;
  const back = fr.back, across = fr.across;
  shell(put, clear, W, D, G, TOP, MAT.C_WHITE, MAT.C_LGRAY, MAT.C_LBLUE);
  // a band of light blue round the walls, the doorway, the blue lamp over it
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) if (u === 0 || u === W - 1 || v === 0 || v === D - 1) put(u, v, G + 4, MAT.C_LBLUE);
  for (let u = 5; u <= 7; u++) for (let y = G + 1; y <= G + 2; y++) clear(u, 0, y);
  put(6, 0, G + 4, MAT.GLASS_BLUE); put(6, 1, G + 4, MAT.LAMP_HANG);
  for (const u of [2, 10]) for (let y = G + 2; y <= G + 3; y++) put(u, 0, y, MAT.GLASS);
  // the front desk across the hall
  for (let u = 2; u <= 10; u++) if (u < 5 || u > 7) put(u, 4, G + 1, MAT.SMOOTH_QUARTZ);
  sign(6, 1, G + 1, neg(back), 'Front desk');
  // the office: desks with chairs, lockers of barrels down the side
  const desks = [];
  for (const [u, v] of [[3, 7], [9, 7], [3, 9], [9, 9]]) {
    put(u, v, G + 1, MAT.DESK); desks.push(at(u, v));
    put(u, v + 1, G + 1, stairId('oak', WEIRDO[h.nameOf(back)]));
  }
  const lockers = [];
  for (let v = 6; v <= 10; v++) { put(1, v, G + 1, MAT.BARREL); put(1, v, G + 2, MAT.BARREL); lockers.push(at(1, v)); }
  // the holding cell at the back: iron bars across, a bed, a lantern
  const cellV = 11;
  for (let u = 1; u < W - 1; u++) for (let y = G + 1; y < TOP; y++) put(u, cellV, y, u >= 5 && u <= 7 && y <= G + 3 ? MAT.BARS : MAT.C_WHITE);
  h.bed(3, 13, G + 1, neg(across), 4);
  put(6, 13, TOP - 1, MAT.LAMP_HANG);
  for (const [u, v] of [[3, 2], [9, 2], [6, 8]]) put(u, v, TOP - 1, MAT.LAMP_HANG);
  sign(4, 10, G + 1, neg(back), 'Holding cell');
  const door = at(6, -1);
  return { kind: 'police', lot, desks, lockers, beds: h.beds, sideways: fr.sideways, door: [door[0], G + 1, door[1]],
    frame: { at, W, D, H, TOP, cellV } };
}

// ---- the theatre ---------------------------------------------------------------------------
// The stage at the lobby's end, its back curtain on the lobby wall; the pit before
// it; the seats rising away from it, a block a row, to a gallery at the back. In
// from the lobby by two doors at the sides, onto aisles that climb with the rows
// (a block a step: every seat walked to).
export function theatre(world, lot, face, cfg, rng, G, signTags) {
  const W = 17, D = 20, H = 9, TOP = G + H + 1;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign } = h;
  const back = fr.back;
  shell(put, clear, W, D, G, TOP, MAT.DARK_PLANKS, MAT.DARK_PLANKS, MAT.DARK_PLANKS);
  // the doorway, three wide; red trim over it
  for (let u = 7; u <= 9; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  for (let u = 5; u <= 11; u++) put(u, 0, G + 5, MAT.RED_WOOL);
  // the lobby: a ticket booth; a wall behind it, its doors at the sides
  const LOBBY_END = 5;
  for (let u = 2; u <= 4; u++) put(u, 3, G + 1, MAT.SMOOTH_QUARTZ);
  sign(8, 1, G + 1, neg(back), 'Tickets');
  for (let u = 1; u < W - 1; u++) for (let y = G + 1; y < TOP; y++) put(u, LOBBY_END, y, MAT.DARK_PLANKS);
  for (const u of [1, 2, W - 3, W - 2]) for (let y = G + 1; y <= G + 3; y++) clear(u, LOBBY_END, y);
  // the stage: against the lobby wall, raised two, curtains at its sides and across its back
  const S0 = LOBBY_END + 1, S1 = S0 + 3, curtains = [];
  for (let v = S0; v <= S1; v++) for (let u = 3; u <= W - 4; u++) { put(u, v, G + 1, MAT.SPRUCE); put(u, v, G + 2, MAT.SPRUCE); }
  for (let y = G + 3; y < TOP; y++) {
    for (let u = 3; u <= W - 4; u++) { put(u, S0, y, MAT.RED_WOOL); curtains.push([...at(u, S0), y]); }      // across its back
    for (const u of [3, W - 4]) for (let v = S0 + 1; v <= S1; v++) { put(u, v, y, MAT.RED_WOOL); curtains.push([...at(u, v), y]); }   // its sides
  }
  // the orchestra pit before it, note blocks along it
  const PIT = S1 + 1, pit = [];
  for (let u = 4; u <= W - 5; u += 2) { put(u, PIT, G + 1, MAT.NOTEBLOCK); pit.push([...at(u, PIT), G + 1]); }
  // the seats: six rows, a block higher each row back; the aisles at the sides climb with them
  const ROW0 = PIT + 2, ROWS = 6, seats = [];
  const facing = stairId('oak', WEIRDO[h.nameOf(back)]);              // facing the stage (their backs away from it)
  for (let k = 0; k < ROWS; k++) {
    const v = ROW0 + k;
    for (let u = 1; u < W - 1; u++) {
      for (let y = G + 1; y <= G + k; y++) put(u, v, y, MAT.DARK_PLANKS);                  // the tier under it
      if (u >= 3 && u <= W - 4) { put(u, v, G + k + 1, facing); seats.push([...at(u, v), G + k + 1]); }
    }
  }
  // the gallery at the back, level with the top row's floor
  for (let v = ROW0 + ROWS; v < D - 1; v++) for (let u = 1; u < W - 1; u++) for (let y = G + 1; y <= G + ROWS - 1; y++) put(u, v, y, MAT.DARK_PLANKS);
  // chandeliers over the seats and the stage, a lamp in the lobby
  for (const [u, v] of [[5, ROW0 + 2], [11, ROW0 + 2], [8, S1], [8, 2]]) put(u, v, TOP - 1, MAT.LAMP_HANG);
  sign(1, LOBBY_END + 1, G + 1, back, 'Stage');
  const door = at(8, -1);
  return { kind: 'theatre', lot, seats, pit, curtains, sideways: fr.sideways, door: [door[0], G + 1, door[1]],
    frame: { at, W, D, H, TOP, ROW0, ROWS, PIT, S0, S1, LOBBY_END } };
}

// ---- the hotel -----------------------------------------------------------------------------
export function hotel(world, lot, face, cfg, rng, G, signTags) {
  const W = 13, D = 19, FLOORS = 5, STOREY = 4;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, bed } = h;
  const back = fr.back, across = fr.across;
  const floorY = (f) => G + STOREY * f, TOP = floorY(FLOORS);
  shell(put, clear, W, D, G, TOP, MAT.BRICK, MAT.SMOOTH, MAT.SMOOTH);
  for (let f = 1; f < FLOORS; f++) for (let v = 1; v < D - 1; v++) for (let u = 1; u < W - 1; u++) put(u, v, floorY(f), MAT.SMOOTH);
  // the doorway; the lobby: a reception desk, seats facing it
  for (let u = 5; u <= 7; u++) for (let y = G + 1; y <= G + 2; y++) clear(u, 0, y);
  for (let u = 4; u <= 8; u++) put(u, 8, G + 1, MAT.SMOOTH_QUARTZ);
  for (const u of [2, 3, 9, 10]) put(u, 5, G + 1, stairId('oak', WEIRDO[h.nameOf(neg(back))]));
  sign(6, 1, G + 1, neg(back), 'Reception');
  for (const [u, v] of [[3, 4], [9, 4], [6, 12]]) put(u, v, floorY(1) - 1, MAT.LAMP_HANG);
  // the stairs: a flight a floor on the front row, sides in turn, the floor above opened
  const upA = stairId('stonebrick', WEIRDO[h.nameOf(across)]), upB = stairId('stonebrick', WEIRDO[h.nameOf(neg(across))]);
  for (let f = 0; f < FLOORS - 1; f++) {
    const A = f % 2 === 0, base = floorY(f);
    for (let i = 0; i < STOREY; i++) {
      const u = A ? 1 + i : W - 2 - i;
      for (let y = base + 1; y < base + 1 + i; y++) put(u, 1, y, MAT.BRICK);
      put(u, 1, base + 1 + i, A ? upA : upB);
    }
    for (let i = 1; i < STOREY - 1; i++) clear(A ? 1 + i : W - 2 - i, 1, floorY(f + 1));
  }
  // the floors above: a hall at the front, a corridor down the middle, six rooms off it
  const rooms = [];
  for (let f = 1; f < FLOORS; f++) {
    const y0 = floorY(f) + 1, y1 = floorY(f) + 3;
    // the wall behind the hall, the corridor's walls, the walls between the rooms
    for (let u = 1; u < W - 1; u++) if (u < 5 || u > 7) for (let y = y0; y <= y1; y++) put(u, 3, y, MAT.BRICK);
    for (let v = 3; v < D - 1; v++) for (let y = y0; y <= y1; y++) { put(4, v, y, MAT.BRICK); put(8, v, y, MAT.BRICK); }
    for (const v of [8, 13]) for (let y = y0; y <= y1; y++) for (const u of [1, 2, 3, 9, 10, 11]) put(u, v, y, MAT.BRICK);
    put(6, 2, y1, MAT.LAMP_HANG); put(6, 10, y1, MAT.LAMP_HANG);
    for (const [va, vb] of [[4, 7], [9, 12], [14, 17]]) for (const side of [0, 1]) {
      const wallU = side === 0 ? 4 : 8, ua = side === 0 ? 1 : 9, ub = side === 0 ? 3 : 11, outer = side === 0 ? 0 : W - 1;
      // its door from the corridor, its window in the outer wall, a bed, a lantern
      for (let y = y0; y <= y0 + 1; y++) clear(wallU, va + 1, y);
      for (let y = y0 + 1; y <= y0 + 2; y++) put(outer, va + 2, y, MAT.GLASS);
      bed(side === 0 ? 2 : 10, vb - 1, y0, back, side === 0 ? 11 : 14);
      put(side === 0 ? 2 : 10, va + 1, y1, MAT.LAMP_HANG);
      rooms.push({ floor: f, side, u: [ua, ub], v: [va, vb], door: [...at(wallU, va + 1), y0] });
    }
  }
  const door = at(6, -1);
  return { kind: 'hotel', lot, rooms, beds: h.beds, sideways: fr.sideways, door: [door[0], G + 1, door[1]],
    frame: { at, W, D, FLOORS, STOREY, floorY } };
}
