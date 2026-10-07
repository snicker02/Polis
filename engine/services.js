// engine/services.js — a hospital and a fire station.
//
// Both laid out in the lot's own frame (u across, v back from the street; zoo.js:
// lotFrame), set down by OUTWARD and turned sideways on a lot long beside its
// street.
//
// The hospital, fifteen by twenty-three, one storey five high, white concrete: a
// red cross over the doorway and a helipad on the roof. Inside, the entrance hall
// (a reception desk, waiting benches facing it); behind it the pharmacy (brewing
// stands, a cleric's job, and cauldrons) and the emergency room (two beds behind
// glass curtains); at the back the ward, beds down both walls, glass between them.
//
// The fire station, fifteen by nineteen, brick, two storeys: two engine bays,
// each with its doors open on the street and a fire engine in it (built of
// blocks: wheels, a red body, a glass windscreen, a ladder rack, a light on the
// cab); upstairs the bunk room. A pole from the bunk room down through the floor
// to the bays, a ladder beside it, and at the back the lookout tower, a ladder up
// it to a railed top. A bell between the bays (a meeting place).

import { MAT, signId, SIGN_FACING, stairId, WEIRDO, bedId, BED_VEC } from './materials.js';
import { lotFrame } from './zoo.js';

export const HOSPITAL_SIZE = [15, 23], FIRE_SIZE = [15, 20];   // (the fire station twelve across where the lot is narrower)

// the shared helpers: a frame's put/clear, a sign, a bed, names of directions
function helpers(world, fr, G, signTags) {
  const { at } = fr;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const nameOf = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
  const neg = (d) => [-d[0], -d[1]];
  const sign = (u, v, y, d, text) => { const [x, z] = at(u, v); world.set(x, y, z, signId(SIGN_FACING[nameOf(d)])); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); };
  // a bed: its foot at (u, v), its head a step the way d points
  const beds = [];
  const bed = (u, v, y, d, color) => {
    const [fx, fz] = at(u, v), hx = fx + d[0], hz = fz + d[1];
    const dir = BED_VEC.findIndex(([a, b]) => a === d[0] && b === d[1]);
    world.set(fx, y, fz, bedId(dir, false)); world.set(hx, y, hz, bedId(dir, true));
    world.setData(fx, y, fz, { id: 'Bed', bytes: { color } }); world.setData(hx, y, hz, { id: 'Bed', bytes: { color } });
    beds.push({ foot: [fx, y, fz], head: [hx, y, hz], dir });
  };
  // a ladder up the face of a wall: d is the way it faces (off the wall)
  const LADDER = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };
  const ladderId = (d) => LADDER[nameOf(d)];
  return { at, put, clear, nameOf, neg, sign, bed, beds, ladderId };
}

// ---- the hospital ------------------------------------------------------------------------
export function hospital(world, lot, face, cfg, rng, G, signTags) {
  const W_ = 15, D_ = 23, H = 5;
  const fr = lotFrame(lot, face, W_, D_);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, bed } = h;
  const back = fr.back, across = fr.across, ROOF = G + H + 1;
  const WALL = MAT.C_WHITE;
  // the shell: white concrete, a light floor, a flat roof
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= ROOF + 1; y++) clear(u, v, y);
    put(u, v, G, MAT.C_LGRAY); put(u, v, ROOF, WALL);
    if (u === 0 || u === W_ - 1 || v === 0 || v === D_ - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, WALL);
  }
  // the doorway, three wide and two high, the red cross over it
  for (let u = 6; u <= 8; u++) for (let y = G + 1; y <= G + 2; y++) clear(u, 0, y);
  const cross = [[7, G + 3], [7, G + 4], [7, G + 5], [6, G + 4], [8, G + 4]];
  for (const [u, y] of cross) put(u, 0, y, MAT.C_RED);
  // the helipad: a yellow H on the roof, a ring round it
  const helipad = [];
  for (let v = 8; v <= 14; v++) for (let u = 4; u <= 10; u++) {
    const ring = v === 8 || v === 14 || u === 4 || u === 10;
    const H_ = (u === 5 || u === 9) && v >= 9 && v <= 13 || (v === 11 && u >= 5 && u <= 9);
    if (ring || H_) { put(u, v, ROOF, MAT.LINE); helipad.push(at(u, v)); }
  }
  // the rooms: a wall across behind the hall, one down the middle, one before the ward
  const HALL_END = 7, WARD = 14;
  for (let u = 1; u < W_ - 1; u++) for (let y = G + 1; y < ROOF; y++) { put(u, HALL_END, y, WALL); put(u, WARD, y, WALL); }
  for (let v = HALL_END; v <= WARD; v++) for (let y = G + 1; y < ROOF; y++) put(7, v, y, WALL);
  for (const [u0, v] of [[2, HALL_END], [10, HALL_END], [6, WARD]]) for (let u = u0; u < u0 + 3; u++) for (let y = G + 1; y <= G + 2; y++) clear(u, v, y);
  for (const [u, v] of [[4, 3], [10, 3], [3, 10], [11, 10], [4, 18], [10, 18]]) put(u, v, ROOF - 1, MAT.LAMP_HANG);

  // the entrance hall: the desk, and benches facing it (their backs to the street)
  for (let u = 5; u <= 9; u++) put(u, 5, G + 1, WALL);
  const bench = stairId('oak', WEIRDO[h.nameOf(neg(back))]);
  for (const u of [2, 3, 4, 10, 11, 12]) for (const v of [2, 3]) put(u, v, G + 1, bench);
  sign(7, 1, G + 1, neg(back), 'Reception');

  // the pharmacy: brewing stands and cauldrons down the outer wall
  // (called brewing, not stands: the city gathers every landmark's stands as
  // armour stands for populate, and these went in as three with no place)
  const brewing = [];
  for (const v of [9, 11, 13]) { put(1, v, G + 1, MAT.BREWING); brewing.push(at(1, v)); }
  for (const v of [8, 10, 12]) put(1, v, G + 1, MAT.CAULDRON_FULL);
  sign(3, HALL_END + 1, G + 1, neg(back), 'Pharmacy');

  // the emergency room: two beds, their heads to the outer wall, a glass curtain between
  for (const v of [9, 12]) bed(12, v, G + 1, across, 0);
  for (const u of [12, 13]) for (let y = G + 1; y <= G + 2; y++) put(u, 10, y, MAT.GLASS_WHITE);
  sign(10, HALL_END + 1, G + 1, neg(back), 'Emergency');

  // the ward: beds down both walls, heads to the wall, glass curtains between
  for (const v of [15, 17, 19, 21]) { bed(2, v, G + 1, neg(across), 0); bed(12, v, G + 1, across, 0); }
  for (const v of [16, 18, 20]) for (const u of [1, 2, 12, 13]) for (let y = G + 1; y <= G + 2; y++) put(u, v, y, MAT.GLASS_WHITE);
  sign(5, WARD + 1, G + 1, neg(back), 'Ward');

  const door = at(7, -1);
  return { kind: 'hospital', lot, beds: h.beds, brewing, cross: cross.map(([u, y]) => [...at(u, 0), y]), helipad, sideways: fr.sideways,
    door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_, H, HALL_END, WARD, ROOF } };
}

// ---- the fire station --------------------------------------------------------------------
export function fireStation(world, lot, face, cfg, rng, G, signTags) {
  // fifteen across where the lot allows, else twelve (the bays three wide)
  const D_ = 20, BUILT = 16;                            // the building sixteen deep, the tower behind it
  let W_ = 15, fr = lotFrame(lot, face, 15, D_);
  if (!fr) { W_ = 12; fr = lotFrame(lot, face, 12, D_); }
  if (!fr) return null;
  const c = Math.floor((W_ - 1) / 2), R = W_ - 1;       // the middle, the far wall
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, bed, ladderId } = h;
  const back = fr.back, across = fr.across;
  const UP = G + 6, ROOF = G + 11, TOP = G + 16;        // the upper floor, the roof, the tower's top
  const WALL = MAT.BRICK;
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) for (let y = G + 1; y <= TOP + 2; y++) clear(u, v, y);
  // the shell: brick, two storeys
  for (let v = 0; v < BUILT; v++) for (let u = 0; u < W_; u++) {
    put(u, v, G, MAT.C_LGRAY); put(u, v, UP, MAT.SMOOTH); put(u, v, ROOF, MAT.SMOOTH);
    if (u === 0 || u === W_ - 1 || v === 0 || v === BUILT - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, WALL);
  }
  // the engine bays: two doorways four wide and four high on the street
  const bays = W_ === 15 ? [[2, 5], [9, 12]] : [[2, 4], [7, 9]];
  for (const [ua, ub] of bays) for (let u = ua; u <= ub; u++) for (let y = G + 1; y <= G + 4; y++) clear(u, 0, y);
  // windows upstairs, front and sides
  for (const u of [3, c, R - 3]) for (let y = UP + 2; y <= UP + 3; y++) put(u, 0, y, MAT.GLASS);
  for (const v of [4, 8, 12]) for (let y = UP + 2; y <= UP + 3; y++) { put(0, v, y, MAT.GLASS); put(W_ - 1, v, y, MAT.GLASS); }

  // the fire engines: three across, seven long, the cab to the street
  const engines = [];
  for (const [ua] of bays) {
    const u0 = ua, u1 = ua + 2, v0 = 3, v1 = 9;
    const blocks = [];
    const set = (u, v, y, id) => { put(u, v, y, id); blocks.push([...at(u, v), y]); };
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
      const wheel = (u === u0 || u === u1) && (v === v0 + 1 || v === v1 - 1);
      set(u, v, G + 1, wheel ? MAT.COAL : MAT.C_RED);
      set(u, v, G + 2, v === v0 ? MAT.GLASS : MAT.C_RED);      // the windscreen at the front
    }
    for (let u = u0; u <= u1; u++) set(u, v0 + 1, G + 3, MAT.C_RED);   // the cab's roof
    set(u0 + 1, v0, G + 3, MAT.GLASS_RED);                              // the light on the cab
    for (let v = v0 + 2; v <= v1; v++) set(u0 + 1, v, G + 3, MAT.BARS); // the ladder rack
    engines.push(blocks);
  }
  sign(c, 2, G + 1, neg(back), 'Engine bays');
  put(c, 1, G + 1, MAT.BELL);                                           // the bell, between the bays

  // the pole: from the bunk room down through the floor to the bays
  const pole = [];
  for (let y = G + 1; y <= UP + 3; y++) { put(c, 13, y, MAT.POLE); pole.push([...at(c, 13), y]); }
  // a ladder beside it up the back wall, the floor open over both
  const ladders = [];
  for (let y = G + 1; y <= UP; y++) { put(c - 2, BUILT - 2, y, ladderId(neg(back))); ladders.push([...at(c - 2, BUILT - 2), y]); }
  clear(c - 2, BUILT - 2, UP); put(c - 2, BUILT - 2, UP, ladderId(neg(back)));
  clear(c, 13, UP); put(c, 13, UP, MAT.POLE);
  // upstairs: the bunk room, beds down both walls, lanterns
  for (const v of [3, 6, 9]) { bed(2, v, UP + 1, neg(across), 14); bed(R - 2, v, UP + 1, across, 14); }
  for (const [u, v] of [[4, 4], [R - 4, 4], [c, 9], [4, 11], [R - 4, 11]]) put(u, v, ROOF - 1, MAT.LAMP_HANG);
  for (const [u, v] of [[4, 7], [R - 4, 7]]) put(u, v, UP - 1, MAT.LAMP_HANG);
  sign(4, 13, UP + 1, neg(back), 'Bunk room');

  // the lookout tower at the back: three by three, a door through the back wall,
  // a ladder up inside it to a railed top
  const tu = R - 2, tv = BUILT + 1;                      // its middle
  for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
    for (let y = G + 1; y <= TOP - 1; y++) if (du || dv) put(tu + du, tv + dv, y, WALL);
    put(tu + du, tv + dv, G, MAT.C_LGRAY);
  }
  // its top: a platform five by five over it, a railing round the edge, the inner
  // ring to stand on (a railing on the tower's own ring left nowhere to step off)
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    if (!du && !dv) continue;
    put(tu + du, tv + dv, TOP, MAT.SMOOTH);
    if (Math.abs(du) === 2 || Math.abs(dv) === 2) put(tu + du, tv + dv, TOP + 1, MAT.FENCE);
  }
  for (let y = G + 1; y <= G + 2; y++) { clear(tu, BUILT - 1, y); clear(tu, tv - 1, y); }   // the way in, from the bays
  const towerLadder = [];
  for (let y = G + 1; y <= TOP; y++) { put(tu, tv, y, ladderId(neg(back))); towerLadder.push([...at(tu, tv), y]); }
  // (the ladder on the tower's back wall, facing the way in)

  const door = at(3, -1);
  return { kind: 'firestation', lot, beds: h.beds, engines, pole, ladders, towerLadder, bell: [...at(c, 1), G + 1], sideways: fr.sideways, wide: W_,
    door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_, BUILT, UP, ROOF, TOP, bays, tower: [tu, tv], c } };
}
