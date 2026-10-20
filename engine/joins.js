// engine/joins.js — cities joined by bridges (0.75.0).
//
// A city can have a bridge out of it on any of its four sides (cfg.joinSides): from one of
// its streets out through the wall (offsite.js: edgeRoute, accessRoad) and on across the
// gap (cfg.joinGap blocks) to a landing at the far end, where the next city's road comes
// in. The bridge is a viaduct (cfg.joinKind 'viaduct': a deck on arches between stone piers
// going down into the ground) or a suspension bridge ('suspension': two towers, cables
// hung between them and down to the ends, hangers down to the deck).
//
// Each bridge's far end is recorded (world.joins) by where it lies from this city's
// build_centered spot. A city made to join one (cfg.joinTo: that end, the side it leaves
// from, the other city's marker tag) gets a short road out on the facing side, and
// world.joinFrom says where its own build spot is from the other city's: its pack's
// stand_here takes you there, and build_centered from there puts its road against the
// landing. Any number of cities can be joined this way, each to any free bridge of one
// already built: a chain, or a city in the middle with a bridge on every side.
//
// The bridge stands outside the city's square: its deck is written as the city's (the air
// over it cleared, world.bridgeAir), the ground under it left as the world has it.

import { MAT, MATERIALS, signId, SIGN_FACING, stairId, WEIRDO } from './materials.js';
import { edgeRoute, accessRoad, OUT, OPPOSITE, NAME } from './offsite.js';

export const JOIN = { gapMin: 24, gapMax: 192, width: 5, landing: 5, pier: 8, depth: 32, clear: 6 };
export const JOIN_KINDS = ['viaduct', 'suspension'];
export const JOIN_SIDES = ['north', 'east', 'south', 'west'];

// the frame's (u, v) on the ground beyond the edge, to world x, z, and a block there
function framer(world, acc) {
  const put = (u, v, y, id) => { const [x, z] = acc.at(u, v); world.set(x, y, z, id); };
  const pos = (u, v, y) => { const [x, z] = acc.at(u, v); return [x, y, z]; };
  return { put, pos };
}

// ---- a bridge out of the city ---------------------------------------------------------------
export function buildJoinBridge(world, plan, side, cfg, ctx) {
  const gap = Math.max(JOIN.gapMin, Math.min(JOIN.gapMax, Math.round(cfg.joinGap || 64)));
  const kind = JOIN_KINDS.includes(cfg.joinKind) ? cfg.joinKind : 'viaduct';
  const { GROUND, elevAt, signTags } = ctx;
  const H = (JOIN.width - 1) / 2;                        // the deck: u from -H to H
  const route = edgeRoute(plan, world, GROUND, elevAt, { sides: [side], footprint: [-H - 4, H + 4, gap + JOIN.landing + 2], avoid: ctx.avoid || [] });
  if (!route) return { side, missing: `no street leads straight out to the ${side} edge across open ground for a bridge` };
  // the road out wears the street's own surface
  const [sx, sz] = route.street, sy = GROUND + elevAt(sx, sz);
  const surface = world.has(sx, sy, sz) ? world.get(sx, sy, sz) : MAT.ASPHALT;
  const acc = accessRoad(world, plan, route, ctx, cfg.joinNames && cfg.joinNames[side] ? `Bridge to\n${cfg.joinNames[side]}` : 'Bridge', surface);
  const YA = acc.YA;
  // (the piers and the towers' legs go down as deep as the city itself goes, no deeper: the
  // city's foundation is laid under its lowest block)
  const deep = Math.max(8, YA - (world.box.empty ? YA - JOIN.depth : world.box.y0));
  const { put, pos } = framer(world, acc);
  const DECK = MAT.SMOOTH, EDGE = MAT.STONEBRICK, PIER = MAT.STONEBRICK, LIGHT = MAT.LAMP;
  const L = gap + JOIN.landing;                         // the deck's rows, v = 0 .. L - 1 (the last five the landing)
  const out = { side, kind, gap, deck: [], lamps: [], piers: [], towers: [], cables: [], hangers: [], road: acc.road, gate: acc.gate, streetSign: acc.streetSign };
  // the deck: the road three wide down the middle, a kerb either side, a railing on it; the
  // landing at the far end wider, its own lamps
  for (let v = 0; v < L; v++) {
    const landing = v >= gap;
    const w = landing ? H + 1 : H;
    for (let u = -w; u <= w; u++) {
      const edge = Math.abs(u) === w;
      put(u, v, YA, edge ? EDGE : u === 0 && !landing && v % 6 < 3 ? MAT.C_WHITE : landing ? DECK : surface);
      out.deck.push(pos(u, v, YA));
      for (let y = YA + 1; y <= YA + JOIN.clear; y++) { const [x, z] = acc.at(u, v); world.clear(x, y, z); }
      put(u, v, YA - 1, EDGE);                          // the deck's underside
    }
    // the railing: on the kerbs, a lamp on a post every eight
    if (!landing) for (const u of [-H, H]) {
      if (v % 8 === 4) { put(u, v, YA + 1, MAT.FENCE); put(u, v, YA + 2, MAT.FENCE); put(u, v, YA + 3, LIGHT); out.lamps.push(pos(u, v, YA + 3)); }
      else put(u, v, YA + 1, MAT.FENCE);
    }
  }
  // the landing's corners: lamps; a sign facing back along the bridge
  for (const [u, v] of [[-(H + 1), gap], [H + 1, gap], [-(H + 1), L - 1], [H + 1, L - 1]]) { put(u, v, YA + 1, MAT.FENCE); put(u, v, YA + 2, LIGHT); out.lamps.push(pos(u, v, YA + 2)); }
  {
    const [x, , z] = pos(-(H - 1), gap + 1, YA + 1);
    const back = NAME([-acc.F[0], -acc.F[1]]);
    world.set(x, YA + 1, z, signId(SIGN_FACING[back]));
    world.setData(x, YA + 1, z, { id: 'Sign', tags: signTags(`${cfg.joinNames && cfg.joinNames[side] ? cfg.joinNames[side] : 'The next city'}\nthis way\n\nBridge from ${cfg.cityName || 'the city'}`) });
  }
  if (kind === 'viaduct') {
    // piers every eight down into the ground, a block thick and the deck's width; arches
    // between them, deepest by the piers, the deck alone at the middle of each span
    const piers = [];
    for (let v = JOIN.pier / 2; v < gap - 2; v += JOIN.pier) piers.push(v);
    for (const p of piers) {
      for (let u = -H; u <= H; u++) for (let y = YA - deep; y <= YA - 2; y++) put(u, p, y, PIER);
      out.piers.push(pos(0, p, YA - deep));
    }
    const near = (v) => Math.min(v + 1, ...piers.map((p) => Math.abs(v - p)));    // (the city's own edge holds the start)
    for (let v = 0; v < gap; v++) {
      const d = near(v), drop = d >= 4 ? 0 : 4 - d;    // three under by a pier, none at mid-span
      for (let k = 1; k <= drop; k++) for (let u = -H; u <= H; u++) put(u, v, YA - 1 - k, PIER);
    }
  } else {
    // two towers a quarter in from either end, each two legs outside the deck rising
    // eighteen over it, joined over the road by two beams; the main cables hung from the
    // tops, sagging between the towers and down to the deck at either end; hangers from
    // them down to the railing
    const T = [Math.round(gap * 0.2), Math.round(gap * 0.8)], top = YA + 18;
    for (const v of T) {
      for (const u of [-(H + 1), H + 1]) for (let y = YA - deep; y <= top; y++) put(u, v, y, MAT.C_RED);
      for (const by of [YA + 8, top]) for (let u = -H; u <= H; u++) put(u, v, by, MAT.C_RED);
      out.towers.push(pos(0, v, top));
    }
    // the cable's height at v: anchored on the deck at both ends, over the towers' tops,
    // sagging to eight over the deck between them
    const cableY = (v) => {
      if (v <= T[0]) return Math.round(YA + 1 + (top - YA - 1) * Math.pow(v / T[0], 1.6));
      if (v >= T[1]) return Math.round(YA + 1 + (top - YA - 1) * Math.pow((gap - 1 - v) / (gap - 1 - T[1]), 1.6));
      const m = (T[0] + T[1]) / 2, half = (T[1] - T[0]) / 2, t = (v - m) / half;
      return Math.round(YA + 6 + (top - YA - 6) * t * t);
    };
    for (const u of [-(H + 1), H + 1]) {
      let prev = null;
      for (let v = 0; v < gap; v++) {
        const y = cableY(v);
        // (each step joined to the last, so the cable runs unbroken)
        const lo = prev === null ? y : Math.min(prev, y), hi = prev === null ? y : Math.max(prev, y);
        for (let yy = lo; yy <= hi; yy++) if (!world.has(...pos(u, v, yy))) { put(u, v, yy, MAT.IRON); out.cables.push(pos(u, v, yy)); }
        prev = y;
        // a hanger every other row from the cable down to the railing, inside the deck's edge
        if (v % 2 === 0 && !T.includes(v) && y > YA + 3) for (let yy = YA + 2; yy < y; yy++) { const hu = u < 0 ? -H : H; put(hu, v, yy, MAT.BARS); out.hangers.push(pos(hu, v, yy)); }
      }
    }
    // the road under the cable at the ends: the cable comes down beside the deck
  }
  // the air over the deck written as air: the world's own ground or water there is
  // cleared out when the bridge is loaded; under it, the world is left as it is
  const cells = new Set();
  for (let v = 0; v < L; v++) for (let u = -(H + 1); u <= H + 1; u++) { const [x, z] = acc.at(u, v); cells.add(x + ',' + z); }
  const prevAir = world.bridgeAir;
  world.bridgeAir = (x, y, z) => (prevAir && prevAir(x, y, z)) || (y > YA && y <= YA + JOIN.clear && cells.has(x + ',' + z));
  // the far end: the row just past the landing, where the next city's road comes in
  const [ex, ez] = acc.at(0, L);
  out.end = { x: ex, y: YA, z: ez, dir: side };
  out.landing = { u0: -(H + 1), u1: H + 1, v0: gap, v1: L - 1, y: YA };
  out.frame = { at: acc.at, F: acc.F, across: acc.across, YA, H, L };
  return out;
}

// ---- the road in from a bridge -------------------------------------------------------------------
// A city joining another's bridge: a road from one of its streets out to its edge on the side
// that faces the bridge, two rows past it, at the street's height. Where its build spot must be
// for that road to meet the landing: from the other city's spot, the bridge's end, less where
// this road's first row past the edge lies from this city's spot.
export function joinRoad(world, plan, joinTo, ctx) {
  const { GROUND, elevAt } = ctx;
  const side = OPPOSITE[joinTo.side];
  const route = edgeRoute(plan, world, GROUND, elevAt, { sides: [side], footprint: [-3, 3, 3], avoid: ctx.avoid || [] });
  if (!route) return { side, missing: `no street leads straight out to the ${side} edge across open ground to meet ${joinTo.name || 'the other city'}'s bridge` };
  const [sx, sz] = route.street, sy = GROUND + elevAt(sx, sz);
  const surface = world.has(sx, sy, sz) ? world.get(sx, sy, sz) : MAT.ASPHALT;
  const acc = accessRoad(world, plan, route, ctx, `Bridge to\n${joinTo.name || 'the next city'}`, surface);
  const { put, pos } = framer(world, acc);
  const road = acc.road.slice();
  for (let v = 0; v < 2; v++) for (let u = -1; u <= 1; u++) {
    put(u, v, acc.YA, surface); road.push(pos(u, v, acc.YA));
    for (let y = acc.YA + 1; y <= acc.YA + JOIN.clear; y++) { const [x, z] = acc.at(u, v); world.clear(x, y, z); }
    for (let y = acc.YA - 3; y < acc.YA; y++) put(u, v, y, MAT.STONEBRICK);
  }
  // its far end: the second row past the edge; the landing's last row is the row before
  // the bridge's end, so this row stands on the bridge's end
  const [qx, qz] = acc.at(0, 1);
  return { side, road, gate: acc.gate, streetSign: acc.streetSign, start: { x: qx, y: acc.YA, z: qz }, frame: { at: acc.at, F: acc.F, YA: acc.YA } };
}

// Where this city's build spot is from the other's: the other's bridge end (from its spot)
// less this road's start (from this spot). x, z on the world's grid; y the same way, both
// cities' blocks loaded the same height under their spots.
export function joinOffset(joinTo, road, centre) {
  const [cx, cz] = centre;
  const [ex, ey, ez] = joinTo.end;                     // the bridge's end, from the other city's spot
  return [ex - (road.start.x - cx), ey - road.start.y, ez - (road.start.z - cz)];
}
// The ground a city covers, from its build spot (x east, z south): its own square and the
// grounds of its own beside it (the airport, the theme park); not its bridges (each known by
// its end). What a link between two bridges keeps off (link.js).
export function cityFootprint(world, plan) {
  const c = world.centre || [Math.floor(plan.W / 2), Math.floor(plan.D / 2)];
  const rel = (r) => [r.x0 - c[0], r.z0 - c[1], r.x1 - c[0], r.z1 - c[1]];
  return [rel({ x0: 0, z0: 0, x1: plan.W - 1, z1: plan.D - 1 }), ...(world.extraInside || []).map(rel)];
}
void MATERIALS; void stairId; void WEIRDO; void OUT;
