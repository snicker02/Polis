// engine/sports.js — a sports centre: a hall of courts and a climbing wall, a pool lane,
// a parkour room over the pool, a running track on the roof.
//
// Twenty-one across by twenty-seven deep where the lot takes it, else seventeen by
// twenty-three (the same rooms, the court and the pool shorter), in the lot's own
// frame (zoo.js: lotFrame: u across, v back from the street). White concrete with a
// blue band, the hall thirteen high under the roof:
//
// - the lobby inside the doors: a reception counter, the way on into the hall;
// - the court down the left of the hall, marked in coloured concrete: blue, a white
//   boundary, a centre line and circle, an orange key at each end with its free-throw
//   line; a backboard and a hoop (a cauldron) over each end; some of the white lines
//   are sea lanterns, the court lit from its own markings;
// - the climbing wall across the back of the hall: holds of coloured concrete up the
//   wall, two ladders and two towers of scaffolding to a platform seven up, hay bales
//   to land on all along its foot; the platform leads through a doorway into the
//   parkour room;
// - the pool lane down the right: one lane two deep, its floor light blue with a
//   black line down the middle and a T at each end, sunk a block into the floor and
//   walled a block above it (the rim the walk round it), starting blocks at the back;
// - the parkour room over the pool, its floor seven up: "the floor is lava" (orange
//   and red), a course of blocks from the doorway at the back to a finishing platform
//   at the front, a block's gap or two between them, up a block at a time and down
//   again (two up at most, so a jump never meets the roof); a ladder down through the floor to the lobby at its front, and a ladder up
//   through the roof;
// - the running track on the roof: two lanes of red terracotta with a white line
//   between, round the edge inside a railing, a start line; a green field inside;
//   lamps on the railing and on posts in the field.

import { MAT, MATERIALS, B, I, S, stairId, WEIRDO, wallSignId } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const SPORTS_SIZES = [[21, 27], [17, 23]];
const mat = (block, color, states = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states);
const SCAFFOLD = () => MATERIALS.add(null, 'minecraft:scaffolding', '#c8a868', { stability: I(0), stability_check: B(1) }, { passable: false, transparent: true });
const SLAB = () => MATERIALS.add(null, 'minecraft:smooth_quartz_slab', '#ece7df', { 'minecraft:vertical_half': S('bottom') }, { transparent: true });

export function sportsCentre(world, lot, face, cfg, rng, G, signTags) {
  let fr = null, W = 0, D = 0;
  // (the bigger centre where the lot takes it either way round, square on to the street
  // if it can be; the smaller only where the bigger will not go)
  for (const [w, d] of SPORTS_SIZES) {
    for (const turned of [false, true]) { const f = lotFrame(lot, face, w, d); if (f && f.sideways === turned) { fr = f; W = w; D = d; break; } }
    if (fr) break;
  }
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, nameOf, ladderId } = h;
  const back = fr.back, across = fr.across;
  const BACK = nameOf(back), FRONT = nameOf(neg(back)), RIGHT = nameOf(across), LEFT = nameOf(neg(across));
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const has = (u, v, y) => { const [x, z] = at(u, v); return world.has(x, y, z); };
  const signs = [];
  const wallSign = (u, v, y, faceName, text) => { const [x, z] = at(u, v); world.set(x, y, z, wallSignId(faceName)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); signs.push([x, y, z]); };
  const TOP = G + 14, UP = G + 7;                  // the roof; the parkour room's floor (and the climbing platform)
  const PU0 = W - 6;                               // the pool's left deck, the parkour room's glass wall
  const CU1 = PU0 - 4, CV1 = D - 6;                // the court: u 1..CU1, v 5..CV1
  const RV = Math.floor(D / 2);                    // the roof ladder's row
  const door = Math.floor(W / 2);
  const C = {
    blue: MAT.C_BLUE, white: MAT.C_WHITE, orange: MAT.C_ORANGE, red: MAT.C_RED, black: MAT.C_BLACK, lblue: MAT.C_LBLUE, green: MAT.C_GREEN,
    yellow: mat('yellow_concrete', '#d5b31f'), lime: mat('lime_concrete', '#5ea918'), purple: mat('purple_concrete', '#64209c'), track: mat('red_terracotta', '#8e3c2e'),
  };

  // ---- the shell -----------------------------------------------------------------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 3; y++) clear(u, v, y);
    put(u, v, G - 1, MAT.STONEBRICK); put(u, v, G, MAT.OAK); put(u, v, TOP, MAT.SMOOTH);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < TOP; y++) put(u, v, y, y === G + 6 ? C.blue : MAT.C_WHITE);
  }
  // windows high in the hall's walls, and in the parkour room's
  for (let v = 2; v < D - 2; v += 3) for (let y = G + 9; y <= G + 10; y++) { put(0, v, y, MAT.GLASS); put(W - 1, v, y, MAT.GLASS); }
  for (let u = 2; u < W - 2; u += 3) if (Math.abs(u - door) > 1) for (let y = G + 9; y <= G + 10; y++) put(u, 0, y, MAT.GLASS);
  for (let u = door - 1; u <= door + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  // lights set in the walls, a row three up and a row eight up (the hall is too high for lanterns to light its floor)
  const lights = [];
  const wallLight = (u, v, y) => { put(u, v, y, MAT.SEA_LANTERN); lights.push(pos(u, v, y)); };
  for (let v = 3; v < D - 1; v += 3) { wallLight(0, v, G + 3); if (v < D - 4) wallLight(0, v, G + 8); }
  for (let u = 3; u < PU0; u += 4) if (Math.abs(u - door) > 1) { wallLight(u, 0, G + 3); wallLight(u, 0, G + 8); }
  for (let u = 3; u < PU0; u += 4) wallLight(u, D - 1, G + 10);

  // ---- the lobby ----------------------------------------------------------------------------------
  for (let u = 2; u <= 5; u++) put(u, 2, G + 1, MAT.SMOOTH_QUARTZ);                  // the reception counter
  wallSign(1, 2, G + 2, RIGHT, 'Sports Centre\ncourt, climbing wall\npool, parkour room\ntrack on the roof');

  // ---- the court -------------------------------------------------------------------------------
  // (u 1..CU1, v 5..CV1, both odd lengths: a middle row and column)
  const cu = (1 + CU1) / 2, cv = (5 + CV1) / 2, KEY = W > 17 ? 2 : 1, KD = W > 17 ? 4 : 3, R = W > 17 ? 2 : 1.5;
  const court = { cells: [], lines: 0, keys: 0, hoops: [] };
  for (let v = 5; v <= CV1; v++) for (let u = 1; u <= CU1; u++) {
    const edge = u === 1 || u === CU1 || v === 5 || v === CV1;
    const centre = v === cv;
    const ring = Math.abs(Math.hypot(u - cu, v - cv) - R) < 0.5;
    const inKey = Math.abs(u - cu) <= KEY && (v - 5 < KD || CV1 - v < KD);
    const freeThrow = Math.abs(u - cu) <= KEY && (v - 5 === KD || CV1 - v === KD);
    const line = edge || centre || ring || freeThrow;
    // (every fourth cell of the boundary a sea lantern: the court lit from its own lines)
    const lit = edge && (u + v) % 4 === 0;
    const id = line ? (lit ? MAT.SEA_LANTERN : C.white) : inKey ? C.orange : C.blue;
    put(u, v, G, id); court.cells.push(pos(u, v, G));
    if (line) court.lines++; else if (inKey) court.keys++;
    if (lit) lights.push(pos(u, v, G));
  }
  // a hoop at each end: a post, a backboard over it, the hoop (a cauldron) out over the court
  for (const [pv, hv] of [[4, 5], [CV1 + 1, CV1]]) {
    for (let y = G + 1; y <= G + 3; y++) put(cu, pv, y, MAT.FENCE);
    for (let u = cu - 1; u <= cu + 1; u++) for (let y = G + 4; y <= G + 5; y++) put(u, pv, y, C.white);
    put(cu, pv, G + 5, C.red); put(cu, pv, G + 4, MAT.SEA_LANTERN); lights.push(pos(cu, pv, G + 4));   // (the square on the board lit)
    put(cu, hv, G + 4, MAT.CAULDRON); court.hoops.push(pos(cu, hv, G + 4));
  }
  // benches along the walk beside it, facing the court
  const benches = [];
  for (let v = 7; v <= CV1 - 1; v += 4) { put(PU0 - 3, v, G + 1, stairId('oak', WEIRDO[RIGHT])); benches.push(pos(PU0 - 3, v, G + 1)); }

  // ---- the pool lane ------------------------------------------------------------------------------
  const P0 = PU0 + 1, P1 = PU0 + 3, PV0 = 5, PV1 = D - 4, PM = PU0 + 2;
  const pool = { water: [], starts: [], rim: [] };
  // (sunk a block into the floor and walled a block above it: a city on hills is lifted
  // onto its terraces and filled under, and a pool sunk any deeper came out a block
  // shallower, filled with stone)
  for (let v = PV0 - 1; v <= PV1 + 1; v++) for (let u = PU0; u <= P1 + 1; u++) {
    const inside = u >= P0 && u <= P1 && v >= PV0 && v <= PV1;
    if (!inside) { put(u, v, G, MAT.SMOOTH_QUARTZ); put(u, v, G + 1, MAT.SMOOTH_QUARTZ); pool.rim.push(pos(u, v, G + 1)); continue; }
    const mark = u === PM && v > PV0 && v < PV1 || ((v === PV0 + 1 || v === PV1 - 1) && u >= P0 && u <= P1);
    put(u, v, G - 1, mark ? C.black : C.lblue);
    for (const y of [G, G + 1]) { put(u, v, y, MAT.WATER); pool.water.push(pos(u, v, y)); }
  }
  for (let u = P0; u <= P1; u++) { put(u, PV1 + 1, G + 2, SLAB()); pool.starts.push(pos(u, PV1 + 1, G + 2)); }
  wallSign(W - 2, PV1 + 2, G + 2, LEFT, 'Pool lane\ntwo deep\nswim a length');

  // ---- the parkour room's floor over the pool, and its glass wall ------------------------------------
  for (let v = 1; v <= D - 2; v++) for (let u = PU0; u <= W - 2; u++) {
    put(u, v, UP, u === PU0 ? MAT.SMOOTH : ((u + v) % 2 ? C.orange : C.red));     // the floor is lava
  }
  for (let v = 1; v <= D - 2; v++) for (let y = UP + 1; y < TOP; y++) put(PU0, v, y, MAT.GLASS);
  for (let y = UP + 1; y < TOP; y++) put(PU0, RV, y, MAT.STONEBRICK);              // a pillar for the roof ladder
  for (let y = UP + 1; y <= UP + 2; y++) clear(PU0, D - 3, y);                      // the doorway from the climbing platform

  // ---- the climbing wall --------------------------------------------------------------------------
  const CW = D - 2;                                   // the row against the back wall
  const climb = { ladders: [], scaffolds: [], holds: [], hay: [], platform: [] };
  for (let u = 1; u < PU0; u++) for (const v of [D - 4, D - 3, D - 2]) { put(u, v, G, MAT.HAY); climb.hay.push(pos(u, v, G)); }
  const LADDER_U = [2, PU0 - 2], SCAF_U = [4, PU0 - 4];
  for (const u of LADDER_U) { const col = []; for (let y = G + 1; y <= UP + 1; y++) { put(u, CW, y, ladderId(neg(back))); col.push(pos(u, CW, y)); } climb.ladders.push(col); }
  for (const u of SCAF_U) { const col = []; for (let y = G + 1; y <= UP; y++) { put(u, CW, y, SCAFFOLD()); col.push(pos(u, CW, y)); } climb.scaffolds.push(col); }
  const HOLDS = [C.red, C.yellow, C.lime, C.orange, C.purple, C.lblue];
  for (let u = 1; u < PU0; u++) {
    if (LADDER_U.includes(u) || SCAF_U.includes(u)) continue;
    // (every third hold a sea lantern: the wall lit from its own holds)
    for (let y = G + 2; y <= UP; y++) if ((u * 3 + y * 2) % 3 === 0) { const glow = climb.holds.length % 3 === 1; put(u, CW, y, glow ? MAT.SEA_LANTERN : HOLDS[(u + y) % HOLDS.length]); climb.holds.push(pos(u, CW, y)); if (glow) lights.push(pos(u, CW, y)); }
  }
  // the platform along the top, a railing on its open side, on to the parkour room's doorway
  for (let u = 1; u < PU0; u++) { put(u, D - 3, UP, MAT.OAK); climb.platform.push(pos(u, D - 3, UP)); put(u, D - 4, UP + 1, MAT.FENCE); }
  wallSign(1, D - 5, G + 2, RIGHT, 'Climbing wall\nladders, scaffolding\nhay to land on\nparkour at the top');

  // ---- the parkour course ----------------------------------------------------------------------------
  // From the doorway at the back to a platform at the front: a block at a time, a gap
  // of one going up (a block higher), of two level or going down; across the room and
  // back. (Never in the roof ladder's column, or the cell before it.)
  const A0 = PU0 + 1, A1 = W - 2;                     // the room's columns
  const stones = [];
  // (two up at most: off a block three up a jump would knock your head on the roof)
  const HS = [1, 1, 2, 2, 1, 2, 2, 1];
  const DU = [1, 2, 3, 2, 1, 2, 3, 2];
  let v = D - 5, k = 0, prevH = 0;
  while (v > 5) {
    const hgt = HS[k % HS.length];
    let du = DU[k % DU.length];
    if (A0 + du === A0 && Math.abs(v - RV) <= 1) du = 2;
    stones.push({ u: A0 + du, v, h: hgt });
    const next = HS[(k + 1) % HS.length];
    v -= next > hgt ? 2 : 3;                        // (a gap of one going up, two otherwise)
    prevH = hgt; k++;
  }
  void prevH;
  for (const s of stones) { for (let y = UP + 1; y <= UP + s.h; y++) put(s.u, s.v, y, y === UP + s.h ? HOLDS[(s.v + s.h) % HOLDS.length] : MAT.STONEBRICK); s.top = pos(s.u, s.v, UP + s.h); }
  // the finishing platform across the room, one up, its front edge two back from the ladder down
  const finish = [];
  const FV = [4, 5].filter((fv) => fv < stones[stones.length - 1].v - 1);
  for (const fv of FV) for (let u = A0; u <= A1; u++) { put(u, fv, UP + 1, MAT.SMOOTH_QUARTZ); finish.push(pos(u, fv, UP + 1)); }
  wallSign(A0 + 1, D - 2, UP + 3, FRONT, 'Parkour\nthe floor is lava\nblock to block\nto the front');
  // the ladder down to the lobby at the front, through the floor
  const down = [];
  clear(A1, 2, UP);
  for (let y = G + 1; y <= UP; y++) { put(A1, 2, y, ladderId(neg(across))); down.push(pos(A1, 2, y)); }
  // the ladder up through the roof, on the pillar
  const up = [];
  for (let y = UP + 1; y <= TOP; y++) { put(A0, RV, y, ladderId(across)); up.push(pos(A0, RV, y)); }
  wallSign(A1, RV, UP + 3, LEFT, 'Running track\nup the ladder\nto the roof');

  // ---- the running track on the roof ------------------------------------------------------------------
  const track = { lanes: [[], []], line: [], field: [], rail: [], start: [] };
  const dist = (u, vv) => Math.min(u, vv, W - 1 - u, D - 1 - vv);
  for (let vv = 0; vv < D; vv++) for (let u = 0; u < W; u++) {
    const d = dist(u, vv);
    if (u === A0 && vv === RV) continue;                                 // the hatch
    if (d === 0) { put(u, vv, TOP, MAT.C_WHITE); put(u, vv, TOP + 1, MAT.FENCE); track.rail.push(pos(u, vv, TOP + 1)); continue; }
    if (d === 1 || d === 3) { put(u, vv, TOP, C.track); track.lanes[d === 1 ? 0 : 1].push(pos(u, vv, TOP)); continue; }
    if (d === 2) { put(u, vv, TOP, C.white); track.line.push(pos(u, vv, TOP)); continue; }
    put(u, vv, TOP, C.green); track.field.push(pos(u, vv, TOP));
  }
  // the start line across the lanes on the left straight
  for (let u = 1; u <= 3; u++) { put(u, RV, TOP, u === 2 ? C.black : C.white); track.start.push(pos(u, RV, TOP)); }
  // lamps on the railing's corners and every fourth post, and on posts in the field
  for (let vv = 0; vv < D; vv++) for (let u = 0; u < W; u++) if (dist(u, vv) === 0 && ((u + vv) % 4 === 0 || (u === 0 || u === W - 1) && (vv === 0 || vv === D - 1))) { put(u, vv, TOP + 2, MAT.LAMP); lights.push(pos(u, vv, TOP + 2)); }
  for (let vv = 6; vv < D - 5; vv += 6) for (const u of [Math.floor(W / 2) - 3, Math.floor(W / 2) + 1]) {
    if (u === A0 || dist(u, vv) < 4) continue;
    put(u, vv, TOP + 1, MAT.FENCE); put(u, vv, TOP + 2, MAT.FENCE); put(u, vv, TOP + 3, MAT.LAMP); lights.push(pos(u, vv, TOP + 3));
  }
  // a railing either side of the hatch (one falling in down the ladder is caught by it, as on any ladder)
  for (const dv of [1, -1]) put(A0, RV + dv, TOP + 1, MAT.FENCE);

  // ---- lights inside: lanterns hung in the parkour room and over the pool's decks -----------------------
  const hang = (u, vv, y) => { if ([1, 2, 3].some((d) => has(u, vv, y - d)) || has(u, vv, y)) return; put(u, vv, y, MAT.LAMP_HANG); lights.push(pos(u, vv, y)); };
  for (let vv = 1; vv <= D - 2; vv += 3) for (const u of [A0 + 1, A1 - 1]) hang(u, vv, TOP - 1);
  for (let vv = 1; vv <= D - 2; vv += 3) for (const u of [PU0, PU0 + 2, W - 2]) hang(u, vv, UP - 1);
  hang(A1, D - 2, TOP - 1); hang(PU0 + 2, D - 2, UP - 1);
  // (and set in the hall's floor along the walk, where the walls' lights do not reach)
  for (let vv = 6; vv <= CV1; vv += 4) { put(PU0 - 2, vv, G, MAT.SEA_LANTERN); lights.push(pos(PU0 - 2, vv, G)); }

  const doorAt = at(door, -1);
  return { kind: 'sports', lot, wide: W, deep: D, sideways: fr.sideways, court, pool, climb, stones, finish, down, up, track, benches, signs, lights,
    door: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, TOP, UP, PU0, CU1, CV1, RV, A0, A1, cu, cv } };
}
