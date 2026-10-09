// engine/waterpark.js — a water park.
//
// Nineteen by twenty-three where the lot allows, else fifteen by nineteen. All of
// it above the ground: a deck three high over the lot, white concrete on top, a
// railing round it, steps up from the gate; every pool carved down into the deck,
// so every drop of water is held by blocks laid here (on a fitted city, the ground
// under a lot may hide a cave). Laid out in the lot's own frame (zoo.js: lotFrame).
//
// - The big pool: three deep, its floor lit with sea lanterns.
// - The bubble lift: a glass tube from the big pool's back corner, soul sand under
//   it, a bubble column all the way up (swim into the corner, and up you go) to a
//   platform hanging over the deep pool: the high dive, and the boat slide's top.
// - The boat slide: blue ice two lanes wide in a channel walled with glass, winding round the park
//   a block down at a time (never at a corner), from the platform to the splash
//   pool, its last rail level with the water. A chest of boats on the platform.
// - The splash pool, two deep; the kids' pool, one deep, with a waterfall falling
//   inside a glass column.
// - Loungers and umbrellas on the deck, a snack stall, lanterns.

import { MAT, MATERIALS, B, I, stairId, WEIRDO, chestId } from './materials.js';
import { N } from './blockcore.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const WATERPARK_SIZE = [19, 23];

const SOUL_SAND = () => MATERIALS.add(null, 'minecraft:soul_sand', '#5a4434', {});
const BUBBLES = () => MATERIALS.add(null, 'minecraft:bubble_column', '#3a5ad0', { drag_down: B(0) }, { transparent: true });
const BLUE_ICE = () => MATERIALS.add(null, 'minecraft:blue_ice', '#74a8fc', {});
const FALLING = () => MATERIALS.add(null, 'minecraft:flowing_water', '#3a5ad0', { liquid_depth: I(8) }, { transparent: true });
const wool = (c) => MATERIALS.add(null, `minecraft:${c}_wool`, c === 'orange' ? '#e07a20' : c === 'yellow' ? '#e8d040' : '#e8e8e8', {});

export function waterPark(world, lot, face, cfg, rng, G, signTags) {
  let W = 0, D = 0, fr = null;
  for (const [w, d] of [[19, 23], [15, 19]]) { fr = lotFrame(lot, face, w, d); if (fr) { W = w; D = d; break; } }
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, mid = (W - 1) / 2;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const DECK = G + 3, H = W >= 19 ? 7 : 5, TOP = DECK + H;
  const lv = D - 5;                                                   // the lift's row
  // ---- the ground, the deck, the railing, the steps up ---------------------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 4; y++) clear(u, v, y);
    put(u, v, G, MAT.GRASS);
    if (v < 3) continue;
    for (let y = G + 1; y < DECK; y++) put(u, v, y, MAT.SMOOTH);
    put(u, v, DECK, MAT.C_WHITE);
    const edge = u === 0 || u === W - 1 || v === 3 || v === D - 1;
    if (edge && !(v === 3 && Math.abs(u - mid) <= 1)) { put(u, v, DECK + 1, MAT.FENCE); if ((u + v) % 5 === 0) put(u, v, DECK + 2, MAT.LAMP); }
  }
  const up = stairId('quartz', WEIRDO[nameOf(back)]);
  for (let u = mid - 1; u <= mid + 1; u++) {
    put(u, 0, G + 1, up);
    put(u, 1, G + 1, MAT.SMOOTH); put(u, 1, G + 2, up);
    put(u, 2, G + 1, MAT.SMOOTH); put(u, 2, G + 2, MAT.SMOOTH); put(u, 2, G + 3, up);
  }

  // ---- the pools: carved down into the deck, lit from their floors ----------------------
  const water = [];
  const pool = (ua, ub, va, vb, depth) => {
    const cells = [];
    for (let v = va; v <= vb; v++) for (let u = ua; u <= ub; u++) {
      put(u, v, DECK - depth, (u + v) % 3 === 0 ? MAT.SEA_LANTERN : MAT.SMOOTH_QUARTZ);
      for (let y = DECK - depth + 1; y <= DECK; y++) { put(u, v, y, MAT.WATER); water.push(pos(u, v, y)); }
      cells.push([u, v]);
    }
    return { u: [ua, ub], v: [va, vb], depth, cells };
  };
  const big = pool(2, mid - 2, 5, lv, 3);
  const splash = pool(mid + 2, W - 2, 5, 8, 2);      // (out to the slide's outer lane)
  const kids = W >= 19 ? pool(mid + 2, W - 4, 11, 14, 1) : pool(mid + 2, W - 4, 10, 12, 1);

  // ---- the bubble lift: soul sand under the big pool's back corner, a column up a glass tube
  const lift = { column: [], sand: pos(2, lv, DECK - 3) };
  put(2, lv, DECK - 3, SOUL_SAND());
  for (let y = DECK - 2; y <= TOP; y++) { put(2, lv, y, BUBBLES()); lift.column.push(pos(2, lv, y)); }
  for (let y = DECK + 1; y <= TOP; y++) for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (du === 1 && y === TOP) continue;                             // (the platform beside it at the top)
    put(2 + du, lv + dv, y, MAT.GLASS);
  }
  // the platform, over the deep end: the high dive and the boat slide's top
  const platform = [];
  for (let u = 3; u <= 5; u++) for (let v = lv - 1; v <= lv + 1; v++) { put(u, v, TOP, MAT.SMOOTH_QUARTZ); platform.push(pos(u, v, TOP)); }
  for (let u = 3; u <= 5; u++) if (u !== 4) put(u, lv + 1, TOP + 1, MAT.FENCE);
  // a chest of boats on it
  const chestAt = pos(4, lv + 1, TOP + 1);
  put(4, lv + 1, TOP + 1, chestId(nameOf(neg(back))));
  world.setData(chestAt[0], chestAt[1], chestAt[2], { id: 'Chest', tags: {
    Items: N.list(10, [0, 1, 2, 3].map((slot) => N.comp({ Count: N.byte(1), Damage: N.short(0), Name: N.str('minecraft:oak_boat'), Slot: N.byte(slot), WasPickedUp: N.byte(0) }))),
  } });
  sign(3, lv + 1, DECK + 1, neg(back), 'Lift: swim into the corner');

  // ---- the boat slide: from the platform round to the splash pool -------------------------
  // Two lanes wide (a boat is a block and a half across: in one, between glass, it
  // stuck): each step of the route is a pair of blocks side by side, both at the
  // same height, the glass walls outside the pair; a square two by two at the turn.
  const route = [];
  for (let u = 6; u <= W - 2; u++) route.push([[u, lv - 1], [u, lv]]);
  for (let v = lv - 2; v >= 9; v--) route.push([[W - 3, v], [W - 2, v]]);
  const lenA = W - 2 - 6 + 1;
  const turn = new Set([lenA - 2, lenA - 1, lenA, lenA + 1]);      // (the turn's square, and two steps out of it, straight, before any drop)
  const can = []; for (let i = 1; i < route.length; i++) if (!turn.has(i)) can.push(i);
  const drops = new Set(); for (let k = 0; k < H; k++) drops.add(can[Math.floor(((k + 0.5) * can.length) / H)]);
  const slide = [];
  let y = TOP;
  route.forEach((pair, i) => {
    if (drops.has(i)) y--;
    const floors = pair.map(([u, v]) => {
      for (let yy = DECK + 1; yy < y; yy++) put(u, v, yy, MAT.SMOOTH_QUARTZ);     // its pillar
      put(u, v, y, BLUE_ICE());
      return pos(u, v, y);
    });
    slide.push({ floors, floor: floors[0] });
  });
  // its walls: glass a block high round the outside of the two lanes
  const onRoute = new Set(route.flat().map(([u, v]) => u + ',' + v));
  route.forEach((pair, i) => pair.forEach(([u, v]) => {
    const fy = slide[i].floors[0][1];
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nu = u + du, nv = v + dv;
      if (onRoute.has(nu + ',' + nv)) continue;
      if (i === 0 && nu === 5) continue;                              // the platform it starts from
      if (i === route.length - 1 && nv === 8) continue;               // the splash pool it ends in
      put(nu, nv, fy + 1, MAT.GLASS);
    }
  }));
  sign(mid + 1, 9, DECK + 1, neg(back), 'Boat slide splash pool');

  // ---- the kids' pool's waterfall: falling inside a glass column -------------------------
  // (at the kids' pool's front corner: at its back one, on the smaller park, its
  // glass fell on the slide's back run)
  const [wu, wv] = [kids.u[0], kids.v[0]];
  const falls = [];
  for (let yy = DECK + 1; yy <= DECK + 3; yy++) {
    put(wu, wv, yy, yy === DECK + 3 ? MAT.WATER : FALLING()); falls.push(pos(wu, wv, yy));
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(wu + du, wv + dv, yy, MAT.GLASS);
  }

  // ---- the deck: loungers, umbrellas, a snack stall --------------------------------------
  const lounger = stairId('oak', WEIRDO[nameOf(neg(back))]);
  const umbrellas = [];
  for (const [uu, colour] of [[3, 'orange'], [mid + 3, 'yellow']]) {
    put(uu - 1, 4, DECK + 1, lounger); put(uu + 1, 4, DECK + 1, lounger);
    put(uu, 4, DECK + 1, MAT.FENCE); put(uu, 4, DECK + 2, MAT.FENCE);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) put(uu + du, 4 + dv, DECK + 3, wool(colour));
    umbrellas.push(pos(uu, 4, DECK + 3));
  }
  const stallU = mid, stallV = D - 3;
  for (let du = -1; du <= 1; du++) { put(stallU + du, stallV, DECK + 1, MAT.SMOOTH_QUARTZ); put(stallU + du, stallV, DECK + 3, wool('orange')); put(stallU + du, stallV + 1, DECK + 3, wool('white')); }
  sign(stallU, stallV - 1, DECK + 1, neg(back), 'Snacks');
  for (const [u, v] of [[mid, 10], [mid, 16]]) if (v < D - 4) put(u, v, DECK + 1, MAT.LAMP);

  const gate = at(mid, -1);
  return { kind: 'waterpark', lot, water, pools: { big, splash, kids }, lift, platform, chest: chestAt, slide, falls, umbrellas,
    sideways: fr.sideways, wide: W, door: [gate[0], G + 1, gate[1]], frame: { at, W, D, mid, DECK, TOP, H, lv } };
}

// ---- the lazy river: beside the water park ----------------------------------------------
// Fourteen by fifteen: a deck four high, steps up from the street, and in it a ring
// of river ten by ten round an island. Water in Minecraft runs seven blocks from a
// source and pushes both ways from it, so a flat loop with sources along it would
// fight itself: the river is four straight runs, each a step lower than the one
// before, a source at each run's head with the step behind it (so it runs only on)
// and water flowing a level more each block down the run, over the step into the
// next; and at the fourth run's end a lift, a bubble column two by two over soul
// sand, carries swimmers the three blocks back up to the first run's head. Round
// and round. Two wide, a block deep, every block of it held in the deck.
export const LAZYRIVER_SIZE = [14, 15];
const FLOW = (d) => MATERIALS.add(null, d === 0 ? 'minecraft:water' : 'minecraft:flowing_water', '#3a5ad0', { liquid_depth: I(d) }, { transparent: true });

export function lazyRiver(world, lot, face, cfg, rng, G, signTags) {
  const W = 14, D = 15, fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, mid = 6;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const DECK = G + 4;
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= DECK + 6; y++) clear(u, v, y);
    put(u, v, G, MAT.GRASS);
    if (v < 3) continue;
    for (let y = G + 1; y < DECK; y++) put(u, v, y, MAT.SMOOTH);
    put(u, v, DECK, MAT.C_WHITE);
    const edge = u === 0 || u === W - 1 || v === 3 || v === D - 1;
    if (edge && !(v === 3 && Math.abs(u - mid) <= 1)) { put(u, v, DECK + 1, MAT.FENCE); if ((u + v) % 4 === 0) put(u, v, DECK + 2, MAT.LAMP); }
  }
  const up = stairId('quartz', WEIRDO[nameOf(back)]);
  for (let u = mid - 1; u <= mid + 1; u++) for (let s = 0; s < 3; s++) { for (let y = G + 1; y < G + 1 + s; y++) put(u, s, y, MAT.SMOOTH); put(u, s, G + 1 + s, up); }
  // the ring, in its own frame: i across (0..9), j back (0..9), at u = 2 + i, v = 4 + j
  const R = (i, j) => [2 + i, 4 + j];
  const runs = [];      // each run: its water level and its pairs of blocks, head first
  const pairs = (list) => list.map((p) => p.map(([i, j]) => R(i, j)));
  runs.push({ level: DECK, cells: pairs([...Array(8).keys()].map((s) => [[2 + s, 0], [2 + s, 1]])) });            // along the front
  runs.push({ level: DECK - 1, cells: pairs([...Array(8).keys()].map((s) => [[8, 2 + s], [9, 2 + s]])) });        // down the right
  runs.push({ level: DECK - 2, cells: pairs([...Array(8).keys()].map((s) => [[7 - s, 8], [7 - s, 9]])) });        // along the back
  runs.push({ level: DECK - 3, cells: pairs([...Array(6).keys()].map((s) => [[0, 7 - s], [1, 7 - s]])) });        // up the left
  const water = [];
  runs.forEach((run) => run.cells.forEach((pair, s) => pair.forEach(([u, v]) => {
    for (let y = run.level + 1; y <= DECK; y++) clear(u, v, y);              // open above it
    put(u, v, run.level - 1, (u + v) % 4 === 0 ? MAT.SEA_LANTERN : MAT.SMOOTH_QUARTZ);   // its bed
    put(u, v, run.level, FLOW(s)); water.push({ at: pos(u, v, run.level), run: runs.indexOf(run), s });
  })));
  // the lift: soul sand under the corner, a bubble column from the last run's level up to the first's
  const lift = { sand: [], column: [] };
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const [u, v] = R(i, j);
    for (let y = DECK - 3; y <= DECK; y++) { put(u, v, y, BUBBLES()); lift.column.push(pos(u, v, y)); }
    put(u, v, DECK - 4, SOUL_SAND()); lift.sand.push(pos(u, v, DECK - 4));
  }
  // the island: an umbrella, a lantern, a sign
  const [iu, iv] = R(4, 4);
  put(iu, iv, DECK + 1, MAT.FENCE); put(iu, iv, DECK + 2, MAT.FENCE);
  for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) put(iu + du, iv + dv, DECK + 3, wool((du + dv) % 2 === 0 ? 'orange' : 'yellow'));
  put(iu + 1, iv + 1, DECK + 1, MAT.LAMP);
  sign(mid, 3 + 0, DECK + 1, neg(back), 'Lazy river: jump in at the front');
  const gate = at(mid, -1);
  return { kind: 'lazyriver', lot, runs: runs.map((r) => ({ level: r.level, cells: r.cells.map((p) => p.map(([u, v]) => pos(u, v, r.level))) })), water, lift,
    sideways: fr.sideways, door: [gate[0], G + 1, gate[1]], frame: { at, W, D, DECK, mid } };
}
