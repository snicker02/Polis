// engine/townbits.js — a water tower, a petrol station, a skate park.
//
// Each in the lot's own frame (zoo.js: lotFrame: u across, v back from the street):
//
// - the water tower, nine by nine: four iron legs braced with bars, a tank of white
//   and light blue concrete seven across on them, full of water, a cone of a roof with
//   a lamp on top; a catwalk round the tank with a railing and lanterns, reached by a
//   ladder up from the ground; a second ladder up the tank's side to the roof, and a
//   hatch in it to drop into the tank for a swim;
// - the petrol station, fifteen by seventeen: a forecourt under a canopy on four
//   pillars, two pumps facing the lane between them (each a dropper full of coal, its
//   "petrol", and a button to fill up: the button powers the dropper, which hands out
//   a lump), a car at one of them, a price board on a pole by the street, and the shop
//   at the back: glass front, a counter, shelves of barrels with food in them;
// - the skate park, fifteen by nineteen: a half pipe of two quarter pipes facing each
//   other, a pyramid in the middle, a funbox with a ledge, a grind rail, walls of
//   graffiti down both sides, benches and lamps.

import { MAT, MATERIALS, B, I, S, stairId, WEIRDO, wallSignId, signId, SIGN_FACING, WOOLS } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';
import { N } from './blockcore.js';

const FACING_NUM = { north: 2, south: 3, west: 4, east: 5 };
const item = (name, count, slot) => N.comp({ Count: N.byte(count), Damage: N.short(0), Name: N.str(name), Slot: N.byte(slot), WasPickedUp: N.byte(0) });
const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
const LADDERS = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };

function framed(world, lot, face, W, D, G, signTags) {
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const pos = (u, v, y) => { const [x, z] = fr.at(u, v); return [x, y, z]; };
  const wallSign = (u, v, y, faceName, text) => { const [x, z] = fr.at(u, v); world.set(x, y, z, wallSignId(faceName)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const dirs = { BACK: h.nameOf(fr.back), FRONT: h.nameOf(h.neg(fr.back)), RIGHT: h.nameOf(fr.across), LEFT: h.nameOf(h.neg(fr.across)) };
  return { fr, ...h, pos, wallSign, ...dirs };
}

// ---- the water tower ------------------------------------------------------------------------
export const WATER_TOWER_SIZE = [9, 9];
export function waterTower(world, lot, face, cfg, rng, G, signTags) {
  const F = framed(world, lot, face, 9, 9, G, signTags);
  if (!F) return null;
  const { put, clear, pos, sign, FRONT, BACK } = F;
  const c = 4, TF = G + 14, TT = G + 21, ROOF = G + 22;    // the middle; the tank's floor, top, roof
  const LBLUE = MAT.C_LBLUE;
  for (let u = 0; u < 9; u++) for (let v = 0; v < 9; v++) for (let y = G + 1; y <= ROOF + 4; y++) clear(u, v, y);
  // the legs: iron, from the ground to the tank, braced with bars between them every four up
  const legs = [[c - 2, c - 2], [c + 2, c - 2], [c - 2, c + 2], [c + 2, c + 2]];
  for (const [u, v] of legs) for (let y = G + 1; y < TF; y++) put(u, v, y, MAT.IRON);
  for (let y = G + 4; y < TF; y += 4) for (let k = -1; k <= 1; k++) { put(c + k, c - 2, y, MAT.BARS); put(c + k, c + 2, y, MAT.BARS); put(c - 2, c + k, y, MAT.BARS); put(c + 2, c + k, y, MAT.BARS); }
  // the tank: five across with its corners cut, on a floor nine by nine that is also the
  // catwalk round it, a railing on the outer ring. (Round on the grid, a catwalk a block
  // wide came out in pieces that met only at their corners: square, it goes all the way round.)
  const water = [], catwalk = [], rail = [], lanterns = [];
  const inTank = (du, dv) => Math.abs(du) <= 2 && Math.abs(dv) <= 2 && !(Math.abs(du) === 2 && Math.abs(dv) === 2);
  for (let u = 0; u < 9; u++) for (let v = 0; v < 9; v++) {
    const du = u - c, dv = v - c, ring = Math.max(Math.abs(du), Math.abs(dv));
    put(u, v, TF, inTank(du, dv) ? MAT.IRON : MAT.SMOOTH);
    if (ring === 4) { put(u, v, TF + 1, MAT.FENCE); rail.push(pos(u, v, TF + 1)); continue; }
    if (!inTank(du, dv)) { catwalk.push(pos(u, v, TF + 1)); continue; }
    const inner = Math.abs(du) <= 1 && Math.abs(dv) <= 1;
    for (let y = TF + 1; y <= TT; y++) {
      if (inner && y < TT) { put(u, v, y, MAT.WATER); water.push(pos(u, v, y)); }
      else if (!inner) put(u, v, y, y === TF + 3 || y === TF + 4 ? LBLUE : MAT.C_WHITE);
    }
    put(u, v, ROOF, MAT.C_WHITE);
    if (Math.abs(du) <= 1 && Math.abs(dv) <= 1) put(u, v, ROOF + 1, LBLUE);
  }
  put(c, c, ROOF + 2, LBLUE);
  put(c, c, ROOF + 3, MAT.LAMP);
  const top = pos(c, c, ROOF + 3);
  // lanterns on the railing's posts, the middle of each side
  for (const [u, v] of [[c, c - 4], [c, c + 4], [c - 4, c], [c + 4, c]]) { put(u, v, TF + 2, MAT.LAMP); lanterns.push(pos(u, v, TF + 2)); }
  // the ladder up from the ground, on the front leg's outer face, through the catwalk's floor
  // (stepped off at its top on to the catwalk)
  const lu = c - 2, lv = c - 3, ladder = [];
  for (let y = G + 1; y <= TF; y++) { put(lu, lv, y, LADDERS[FRONT]); ladder.push(pos(lu, lv, y)); }
  // the ladder up the tank's front to its roof, and the hatch over the water behind it
  const hu = c, hv = c - 3, roofLadder = [];
  for (let y = TF + 1; y <= ROOF; y++) { put(hu, hv, y, LADDERS[FRONT]); roofLadder.push(pos(hu, hv, y)); }
  clear(c, c - 1, ROOF); clear(c, c - 1, ROOF + 1);         // the hatch, over the water
  const hatch = pos(c, c - 1, ROOF);
  sign(c + 2, 0, G + 1, F.neg(F.fr.back), 'Water tower\nladder up the leg\nhatch on the roof');
  return { kind: 'watertower', lot, legs: legs.map(([u, v]) => pos(u, v, G + 1)), water, catwalk, rail, lanterns, ladder, roofLadder, hatch, top,
    sideways: F.fr.sideways, door: pos(c, -1, G + 1), frame: { at: F.fr.at, c, TF, TT, ROOF } };
}

// ---- the petrol station ------------------------------------------------------------------------
export const PETROL_SIZE = [15, 17];
export function petrolStation(world, lot, face, cfg, rng, G, signTags) {
  const W = 15, D = 17;
  const F = framed(world, lot, face, W, D, G, signTags);
  if (!F) return null;
  const { put, clear, pos, sign, wallSign, FRONT, BACK, RIGHT, LEFT } = F;
  const CY = G + 6;                                          // the canopy
  const RED = MAT.C_RED, YELLOW = mat('yellow_concrete', '#d5b31f');
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
    for (let y = G + 1; y <= CY + 3; y++) clear(u, v, y);
    put(u, v, G, v <= 9 ? MAT.C_GRAY : MAT.SMOOTH);
  }
  // the canopy on four pillars, a red and yellow band round its edge, lights in its ceiling
  const canopy = [], lights = [];
  for (let u = 1; u <= 13; u++) for (let v = 2; v <= 8; v++) {
    const edge = u === 1 || u === 13 || v === 2 || v === 8;
    put(u, v, CY, edge ? ((u + v) % 2 ? RED : YELLOW) : MAT.C_WHITE);
    canopy.push(pos(u, v, CY));
    if (!edge && (u % 3 === 0) && (v === 4 || v === 6)) { put(u, v, CY, MAT.SEA_LANTERN); lights.push(pos(u, v, CY)); }
  }
  for (const [u, v] of [[2, 3], [12, 3], [2, 7], [12, 7]]) for (let y = G + 1; y < CY; y++) put(u, v, y, MAT.C_WHITE);
  // the pumps: a dropper of coal facing the lane, a button on it, a pump head over it, the price on a sign
  const pumps = [];
  for (const [u, faceTo] of [[5, RIGHT], [9, LEFT]]) {
    for (let v = 4; v <= 6; v++) put(u, v, G, MAT.SMOOTH);           // the island
    const dropper = mat('dropper', '#6a6a6a', { facing_direction: I(FACING_NUM[faceTo]), triggered_bit: B(0) });
    put(u, 5, G + 1, dropper);
    const [x, z] = F.fr.at(u, 5);
    world.setData(x, G + 1, z, { id: 'Dropper', tags: { Items: N.list(10, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => item('minecraft:coal', 64, s))) } });
    put(u, 5, G + 2, MAT.IRON); put(u, 5, G + 3, RED);
    const btn = MATERIALS.add(null, 'minecraft:stone_button', '#8a8a8a', { button_pressed_bit: B(0), facing_direction: I(FACING_NUM[FRONT]) });
    put(u, 4, G + 1, btn);
    wallSign(u, 4, G + 2, FRONT, u === 5 ? 'Pump 1\npress the button\nto fill up' : 'Pump 2\npress the button\nto fill up');
    pumps.push({ dropper: pos(u, 5, G + 1), button: pos(u, 4, G + 1), faceTo, out: pos(u + (faceTo === RIGHT ? 1 : -1) * 1, 5, G + 1) });
  }
  // a car pulled in between the pumps, behind the nozzles (where the coal comes out stays clear)
  const car = [];
  for (let v = 6; v <= 9; v++) for (let u = 6; u <= 8; u++) {
    const wheel = (v === 7 || v === 9) && (u === 6 || u === 8);
    const lamp = v === 6 && u !== 7;
    put(u, v, G + 1, wheel ? MAT.C_BLACK : lamp ? MAT.SEA_LANTERN : RED); car.push(pos(u, v, G + 1));
    if (v >= 7 && v <= 8) { put(u, v, G + 2, MAT.GLASS); put(u, v, G + 3, RED); }
  }
  // the price board on a pole by the street
  for (let y = G + 1; y <= G + 5; y++) put(13, 1, y, MAT.FENCE);
  for (const y of [G + 6, G + 7]) for (const u of [12, 13, 14]) put(u, 1, y, y === G + 7 ? RED : YELLOW);
  const price = wallSign(13, 0, G + 6, FRONT, 'POLIS PETROL\nunleaded 1.79\ndiesel 1.85\ncoal: free');
  // the shop at the back: brick, a glass front with a door, a counter, shelves, a sign
  const shop = { shelves: [], door: null };
  for (let u = 2; u <= 12; u++) for (let v = 10; v <= 15; v++) {
    const edge = u === 2 || u === 12 || v === 10 || v === 15;
    if (edge) for (let y = G + 1; y <= G + 4; y++) put(u, v, y, v === 10 && y >= G + 2 && y <= G + 3 && u > 3 && u < 11 ? MAT.GLASS : MAT.BRICK);
    put(u, v, G + 5, MAT.SMOOTH);
  }
  for (let u = 2; u <= 12; u++) for (let v = 10; v <= 15; v++) if (!(u === 2 || u === 12 || v === 10 || v === 15)) for (let y = G + 1; y <= G + 4; y++) clear(u, v, y);
  for (const y of [G + 1, G + 2]) clear(7, 10, y);
  shop.door = pos(7, 10, G + 1);
  for (let u = 3; u <= 6; u++) put(u, 12, G + 1, MAT.SMOOTH_QUARTZ);                // the counter
  const SHELF = [['minecraft:bread', 16], ['minecraft:cookie', 32], ['minecraft:apple', 16], ['minecraft:cooked_beef', 8]];
  SHELF.forEach(([name, count], k) => {
    const u = 8 + k, v = 14;
    const barrel = mat('barrel', '#7d5a34', { facing_direction: I(FACING_NUM[FRONT]), open_bit: B(0) });
    put(u, v, G + 1, barrel);
    const [x, z] = F.fr.at(u, v);
    world.setData(x, G + 1, z, { id: 'Barrel', tags: { Items: N.list(10, [item(name, count, 0)]) } });
    shop.shelves.push(pos(u, v, G + 1));
  });
  for (const [u, v] of [[4, 11], [7, 13], [10, 11], [4, 14], [10, 13]]) { put(u, v, G + 5, MAT.SEA_LANTERN); lights.push(pos(u, v, G + 5)); }   // (lights in its ceiling)
  wallSign(9, 9, G + 4, FRONT, 'Shop\nopen');
  return { kind: 'petrol', lot, canopy, pumps, car, price, shop, lights, sideways: F.fr.sideways, door: pos(7, -1, G + 1),
    frame: { at: F.fr.at, W, D, CY } };
}

// ---- the skate park ---------------------------------------------------------------------------------
export const SKATE_SIZE = [15, 19];
export function skatePark(world, lot, face, cfg, rng, G, signTags) {
  const W = 15, D = 19;
  const F = framed(world, lot, face, W, D, G, signTags);
  if (!F) return null;
  const { put, clear, pos, sign, wallSign, FRONT, BACK, RIGHT, LEFT } = F;
  const CON = MAT.C_LGRAY, stair = (dir) => stairId('quartz', WEIRDO[dir]);
  const SMOOTH_STAIR = (dir) => stairId('cobble', WEIRDO[dir]);
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) { for (let y = G + 1; y <= G + 8; y++) clear(u, v, y); put(u, v, G, CON); }
  const ramps = [], features = {};
  // the half pipe across the back: a quarter pipe rising to the back (v 14..16), a flat
  // bottom (v 12..13), a quarter pipe rising to the front (v 9..11); decks on top
  const QP = (vv, dir, rise) => {
    // rise: the way it rises, +1 back, -1 front; three steps up to a deck four up
    for (let k = 0; k < 3; k++) {
      const v = vv + rise * k;
      for (let u = 2; u <= 12; u++) {
        for (let y = G + 1; y <= G + k; y++) put(u, v, y, CON);
        put(u, v, G + 1 + k, stair(dir));
        ramps.push(pos(u, v, G + 1 + k));
      }
    }
    // its deck, two deep where there is room, a railing along its far edge
    const deck = vv + rise * 3, far = deck + rise;
    for (let u = 2; u <= 12; u++) for (const v of [deck, far]) if (v > 0 && v < D - 1) for (let y = G + 1; y <= G + 3; y++) put(u, v, y, CON);
    if (far > 0 && far < D - 1) for (let u = 2; u <= 12; u++) put(u, far, G + 4, MAT.FENCE);
    return deck;
  };
  const backDeck = QP(14, BACK, 1);
  features.halfPipe = { back: backDeck };
  // (the front of the half pipe: a quarter pipe rising to the front, from v 11 down to v 9, its deck at v 8)
  const frontDeck = QP(11, FRONT, -1);
  features.halfPipe.front = frontDeck;
  // (a gap at each end of the decks: walk round onto them)
  // the pyramid, in the front half: a top three by three two up, stairs up every side
  const pu = 7, pv = 4;
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    const ring = Math.max(Math.abs(du), Math.abs(dv));
    if (ring <= 1) { put(pu + du, pv + dv, G + 1, CON); put(pu + du, pv + dv, G + 2, ring === 0 ? CON : CON); }
    if (ring === 2) {
      const dir = Math.abs(du) === 2 && Math.abs(dv) < 2 ? (du < 0 ? RIGHT : LEFT) : Math.abs(dv) === 2 && Math.abs(du) < 2 ? (dv < 0 ? BACK : FRONT) : null;
      if (dir) { put(pu + du, pv + dv, G + 1, stair(dir)); ramps.push(pos(pu + du, pv + dv, G + 1)); }
      else put(pu + du, pv + dv, G + 1, CON);
    }
    if (ring === 1) { const dir = Math.abs(du) === 1 && dv === 0 ? (du < 0 ? RIGHT : LEFT) : du === 0 && Math.abs(dv) === 1 ? (dv < 0 ? BACK : FRONT) : null; if (dir) { put(pu + du, pv + dv, G + 2, stair(dir)); ramps.push(pos(pu + du, pv + dv, G + 2)); } }
  }
  features.pyramid = pos(pu, pv, G + 3);
  // a grind rail down the left side, a ledge (a funbox with a slab top) down the right
  const rail = [];
  for (let v = 1; v <= 5; v++) { put(2, v, G + 1, MAT.BARS); rail.push(pos(2, v, G + 1)); }
  const SLAB = mat('smooth_stone_slab', '#a8a8a8', { 'minecraft:vertical_half': S('bottom') }, { transparent: true });
  for (let v = 1; v <= 5; v++) { put(12, v, G + 1, SLAB); }
  features.rail = rail; features.ledge = pos(12, 2, G + 1);
  // graffiti on walls down both sides: concrete in colours, a pattern of the seed's
  const COLS = [MAT.C_RED, MAT.C_BLUE, mat('yellow_concrete', '#d5b31f'), mat('lime_concrete', '#5ea918'), MAT.C_ORANGE, mat('magenta_concrete', '#a9309f'), MAT.C_CYAN, MAT.C_BLACK];
  const graffiti = [];
  let s = (cfg.seed || 1) * 97 + 13;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (const u of [0, W - 1]) for (let v = 1; v <= D - 2; v++) for (let y = G + 1; y <= G + 3; y++) {
    const id = rnd() < 0.55 ? COLS[Math.floor(rnd() * COLS.length)] : MAT.C_WHITE;
    put(u, v, y, id); graffiti.push(pos(u, v, y));
  }
  for (let u = 0; u < W; u++) for (let y = G + 1; y <= G + 3; y++) put(u, D - 1, y, COLS[(u + y) % COLS.length]);
  // benches at the front, lamps at the corners
  const lights = [];
  for (const u of [4, 10]) put(u, 0, G + 1, stairId('oak', WEIRDO[FRONT]));
  for (const [u, v] of [[1, 1], [13, 1]]) { for (let y = G + 1; y <= G + 4; y++) put(u, v, y, MAT.FENCE); put(u, v, G + 5, MAT.LAMP); lights.push(pos(u, v, G + 5)); }
  // (down the sides on the walls' tops, out of the walk round the half pipe)
  for (const v of [5, 9, 13, D - 3]) for (const u of [0, W - 1]) { put(u, v, G + 4, MAT.LAMP); lights.push(pos(u, v, G + 4)); }
  sign(7, 0, G + 1, F.neg(F.fr.back), 'Skate park\nhalf pipe, pyramid\nrail and ledge');
  return { kind: 'skatepark', lot, ramps, features, graffiti, lights, sideways: F.fr.sideways, door: pos(7, -1, G + 1),
    frame: { at: F.fr.at, W, D } };
}
