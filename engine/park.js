// engine/park.js — an amusement park: a roller coaster you can ride, a Ferris wheel,
// stalls.
//
// Twenty-three by twenty-seven where the lot allows, else nineteen by twenty-three,
// else fifteen by nineteen;
// fenced, a gate in the front. Laid out in the lot's own frame (zoo.js: lotFrame).
//
// The roller coaster: a loop round the park inside the fence, laid by the railway's
// own rules (a block of rise a rail, a curve only on the level: railgraph.js follows
// it as a cart does):
//   the station, on the front run: a hump, a powered rail climbing to a level rail
//     at its top and, on the far side, the station rail, a powered rail with
//     nothing powering it: it holds a cart (a brake). A button on a post beside it
//     powers it: the cart rolls off down the slope and away;
//   the lift hill up the next side, every rail of the climb powered (a block of
//     redstone under each);
//   the high run along the back, boosted every fourth rail;
//   the drop down the last side, and home along the front to the station.
// Every raised rail on its pillar, three clear above it for the rider. The rails
// and the blocks under them are kept as a list and laid again last: on a fitted
// city the transit's pass clears every rail and beds rails in gravel (gravel falls).
// Two minecarts: one at the station, one before the climb to it.
//
// The Ferris wheel: a ring in a vertical plane, spokes to an axle, eight cabins of
// coloured concrete round it, on legs either side. The stalls: four booths, a
// counter, a striped awning of wool, a sign each.

import { MAT, MATERIALS, B, I, railId, poweredRailId, RAIL } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const PARK_SIZE = [23, 27];

const WOOL_WHITE = () => MATERIALS.add(null, 'minecraft:white_wool', '#e8e8e8', {});
const brake = (dir) => MATERIALS.add(null, 'minecraft:golden_rail', '#d8b13a', { rail_data_bit: B(0), rail_direction: I(dir) }, { passable: true, flowable: true, flat: true });
const buttonUp = () => MATERIALS.add(null, 'minecraft:wooden_button', '#a08050', { button_pressed_bit: B(0), facing_direction: I(1) });

// a rail's shape from the cells either side of it (world x, y, z): straight, a slope
// rising toward the higher, or a curve on the level
function shapeOf(prev, cur, next) {
  const d = (a) => [Math.sign(a[0] - cur[0]), Math.sign(a[2] - cur[2])];
  const [p, n] = [d(prev), d(next)];
  const up = next[1] > cur[1] ? n : prev[1] > cur[1] ? p : null;
  if (up) return up[0] === 1 ? RAIL.UP_E : up[0] === -1 ? RAIL.UP_W : up[1] === -1 ? RAIL.UP_N : RAIL.UP_S;
  if (p[0] === -n[0] && p[1] === -n[1]) return p[0] !== 0 ? RAIL.EW : RAIL.NS;
  const has = (a, b) => (p[0] === a && p[1] === b) || (n[0] === a && n[1] === b);
  const S = has(0, 1), N = has(0, -1), E = has(1, 0), W = has(-1, 0);
  return S && E ? RAIL.SE : S && W ? RAIL.SW : N && W ? RAIL.NW : RAIL.NE;
}

export function amusementPark(world, lot, face, cfg, rng, G, signTags) {
  // (and fifteen by nineteen: the coaster rising seven, the wheel smaller, two stalls;
  // a city of small blocks seldom has a lot nineteen by twenty-three)
  let W = 0, D = 0, fr = null;
  for (const [w, d] of [[23, 27], [19, 23], [15, 19]]) { fr = lotFrame(lot, face, w, d); if (fr) { W = w; D = d; break; } }
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign } = h;
  const back = fr.back, mid = (W - 1) / 2;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  // the ground, the fence, the gate
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= G + 18; y++) clear(u, v, y);
    put(u, v, G, MAT.GRASS);
    const edge = u === 0 || u === W - 1 || v === 0 || v === D - 1;
    if (edge && !(v === 0 && Math.abs(u - mid) <= 1)) { put(u, v, G + 1, MAT.FENCE); if ((u + v) % 6 === 0) put(u, v, G + 2, MAT.LAMP); }
  }
  for (let v = 0; v <= 5; v++) for (let u = mid - 1; u <= mid + 1; u++) put(u, v, G, MAT.GRAVEL);   // the path in

  // ---- the roller coaster: the loop of cells and the height of each -------------------
  const u0 = 2, u1 = W - 3, v0 = 2, v1 = D - 3;
  const sideLen = v1 - v0 - 1, R = Math.min(8, sideLen - 6);       // the lift's height
  const T = 1 + R;                                                  // the high run's height
  const cells = [];                                                 // [u, v, height, role]
  // the front run (the station's hump on it), corner to corner
  const s = u0 + 4;                                                 // the hump's top
  for (let u = u0; u < u1; u++) {
    const role = u === s - 1 ? 'hump-up' : u === s ? 'hump-top' : u === s + 1 ? 'station' : (u === s + 4 || u === s + 7) && u < u1 - 1 ? 'boost' : 'plain';
    cells.push([u, v0, u === s ? 2 : 1, role]);
  }
  // the lift hill: level, then the climb (every rail powered), then the high run's start
  for (let v = v0; v < v1; v++) {
    const j = v - v0;
    const ht = j <= 1 ? 1 : Math.min(T, 1 + (j - 1));
    const climbing = j >= 1 && j <= R;                              // its rail rises toward the next
    cells.push([u1, v, ht, climbing ? 'lift' : (j > R + 1 && j % 4 === 0 ? 'boost' : 'plain')]);
  }
  // the high run along the back
  for (let u = u1; u > u0; u--) cells.push([u, v1, T, (u1 - u) % 4 === 2 ? 'boost' : 'plain']);
  // the drop: level a rail, then down a block a rail, then level home
  for (let v = v1; v > v0; v--) {
    const j = v1 - v;
    const ht = j <= 1 ? T : Math.max(1, T - (j - 1));
    cells.push([u0, v, ht, j === sideLen - 2 ? 'boost' : 'plain']);
  }
  // the world cells, the rails' shapes
  const P = cells.map(([u, v, ht]) => pos(u, v, G + ht));
  const railBlocks = [], rails = [], supports = [];
  let stationAt = null;
  cells.forEach(([u, v, ht, role], i) => {
    const prev = P[(i - 1 + P.length) % P.length], cur = P[i], next = P[(i + 1) % P.length];
    const shape = shapeOf(prev, cur, next);
    const curve = shape >= 6;
    const powered = !curve && (role === 'lift' || role === 'boost' || role === 'hump-up');
    const id = role === 'station' ? brake(shape) : powered ? poweredRailId(shape) : railId(shape);
    // its support: a block of redstone under a powered rail, else stone brick; a pillar down to the ground
    const under = powered ? MAT.REDSTONE : ht === 1 ? null : MAT.STONEBRICK;
    for (let y = G + 1; y < G + ht - 1; y++) put(u, v, y, MAT.STONEBRICK);
    if (under !== null) { put(u, v, G + ht - 1, under); railBlocks.push([...pos(u, v, G + ht - 1), under]); }
    put(u, v, G + ht, id); railBlocks.push([...pos(u, v, G + ht), id]);
    rails.push({ at: pos(u, v, G + ht), role, shape });
    if (ht > 1) supports.push(pos(u, v, G + ht - 1));
    if (role === 'station') stationAt = { u, v, rail: pos(u, v, G + ht) };
  });
  // the station: a post beside the station rail, inside the loop, a button on top
  const post = pos(stationAt.u, v0 + 1, G + 1), button = pos(stationAt.u, v0 + 1, G + 2);
  put(stationAt.u, v0 + 1, G + 1, MAT.SMOOTH_QUARTZ); put(stationAt.u, v0 + 1, G + 2, buttonUp());
  sign(stationAt.u + 1, v0 + 1, G + 1, neg(back), 'Coaster: press to ride');
  // the carts: one in the station, one on the level before the hump
  // (copies: the city lifts the carts with the ground, and sharing the station rail's
  // own point, it lifted that record too)
  const carts = [[...stationAt.rail], pos(s - 2, v0, G + 1)];

  // ---- the Ferris wheel: a ring, spokes, an axle, eight cabins, legs ------------------
  // Every line of it joined block to block by a face (a ring picked block by block
  // near the circle met only at corners, and showed holes; iron bars join only
  // sideways, and a sloping spoke of them stood in posts): a closed ring of white
  // concrete, eight spokes of light grey concrete from the axle to it, eight cabins
  // two high just outside it, a straight leg either side down to the ground.
  const r = W === 23 ? 6 : W === 19 ? 5 : 3, cu = mid, cv = v1 - 5, cy = G + r + 3;
  const line4 = (a, b) => {                      // a line from a to b, each step a face away
    const out = [[a[0], a[1]]]; let [x, y] = a;
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 4 || 1;
    for (let t = 1; t <= n; t++) {
      const tx = Math.round(a[0] + ((b[0] - a[0]) * t) / n), ty = Math.round(a[1] + ((b[1] - a[1]) * t) / n);
      if (tx === x && ty === y) continue;
      if (tx !== x && ty !== y) out.push([tx, y]);   // (the corner filled: a face step, then the next)
      out.push([tx, ty]); x = tx; y = ty;
    }
    return out;
  };
  const wheel = { rim: [], spokes: [], cabins: [], axle: pos(cu, cv, cy), r, plane: { cu, cv, cy } };
  // the ring: the circle stepped round, every diagonal step filled to a face step
  const ring = [];
  for (let k = 0; k < 720; k++) {
    const a = (k * Math.PI) / 360, p = [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))];
    const last = ring[ring.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    if (last && last[0] !== p[0] && last[1] !== p[1]) ring.push([p[0], last[1]]);
    if (!(ring.length && ring[0][0] === p[0] && ring[0][1] === p[1])) ring.push(p);
  }
  const ringSet = new Set(ring.map(([a, b]) => a + ',' + b));
  for (const [dx, dy] of [...ringSet].map((k) => k.split(',').map(Number))) { put(cu + dx, cv, cy + dy, MAT.C_WHITE); wheel.rim.push(pos(cu + dx, cv, cy + dy)); }
  const COLOURS = [MAT.C_RED, MAT.C_BLUE, MAT.LINE, MAT.C_LBLUE || MAT.C_BLUE];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, ex = Math.cos(a), ey = Math.sin(a);
    const end = [Math.round(ex * r), Math.round(ey * r)];
    const spoke = line4([0, 0], end).filter(([a2, b2]) => !(a2 === 0 && b2 === 0) && !ringSet.has(a2 + ',' + b2));
    for (const [dx, dy] of spoke) put(cu + dx, cv, cy + dy, MAT.C_LGRAY);
    wheel.spokes.push(spoke.map(([dx, dy]) => pos(cu + dx, cv, cy + dy)));
    // its cabin, two high, hanging just outside the ring where the spoke meets it
    // (out past the ring until neither of its blocks is on it: one past the rim on a
    // diagonal rounds back on to the ring, and its colour took a piece of the white)
    let t = r + 1, cx = Math.round(ex * t), cyy = Math.round(ey * t);
    while (ringSet.has(cx + ',' + cyy) || ringSet.has(cx + ',' + (cyy - 1))) { t += 0.5; cx = Math.round(ex * t); cyy = Math.round(ey * t); }
    const [x, y] = [cu + cx, cy + cyy];
    put(x, cv, y, COLOURS[k % COLOURS.length]); put(x, cv, y - 1, COLOURS[k % COLOURS.length]);
    wheel.cabins.push([pos(x, cv, y), pos(x, cv, y - 1)]);
  }
  for (const dv of [-1, 0, 1]) put(cu, cv + dv, cy, MAT.IRON);                                     // the axle
  // the legs: straight, from the ground out to the axle's ends, either side of the wheel
  wheel.legs = [];
  for (const dv of [-1, 1]) for (const side of [-1, 1]) {
    const leg = line4([side * (r - 1), G + 1], [0, cy - 1]);
    for (const [dx, y] of leg) put(cu + dx, cv + dv, y, MAT.STONEBRICK);
    wheel.legs.push(leg.map(([dx, y]) => pos(cu + dx, cv + dv, y)));
  }
  sign(cu, cv - 3, G + 1, neg(back), 'Ferris wheel');

  // ---- the stalls: a counter, a striped awning, a sign ----------------------------------
  // (either side of the path in, a block apart)
  const names = W === 23 ? ['Popcorn', 'Candy floss', 'Lemonade', 'Prizes'] : ['Popcorn', 'Prizes'];
  const spots = W === 23 ? [3, 7, 13, 17] : W === 19 ? [3, 12] : [3, 9];
  const stalls = [];
  const sv = v0 + 4;
  names.forEach((name, k) => {
    const ua = spots[k];
    for (let du = 0; du < 3; du++) {
      put(ua + du, sv, G + 1, MAT.SMOOTH_QUARTZ);                    // the counter
      for (let dv = 0; dv < 3; dv++) put(ua + du, sv + dv, G + 3, (du + k) % 2 === 0 ? MAT.RED_WOOL : WOOL_WHITE());   // the awning
    }
    for (const [du, dv] of [[0, 2], [2, 2]]) put(ua + du, sv + dv, G + 1, MAT.FENCE), put(ua + du, sv + dv, G + 2, MAT.FENCE);
    sign(ua + 1, sv - 1, G + 1, neg(back), name);
    stalls.push({ name, counter: pos(ua + 1, sv, G + 1), sign: pos(ua + 1, sv - 1, G + 1) });
  });

  const gate = at(mid, -1);
  return { kind: 'park', lot, rails, railBlocks, supports, station: { rail: stationAt.rail, post, button }, carts, wheel, stalls,
    sideways: fr.sideways, wide: W, door: [gate[0], G + 1, gate[1]], frame: { at, W, D, mid, u0, u1, v0, v1, T, R } };
}
