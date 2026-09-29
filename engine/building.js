// engine/building.js — one building, from lot rectangle to blocks.
//
// STAIRS (the part that has to actually work in game)
// ---------------------------------------------------
// Three stair layouts, all built from the same rule: a step is a stair block
// that rises exactly one block from the previous one, so every flight lands
// flush with the floor slab above it.
//
//   switchback  1-wide straight flights, alternating direction each storey,
//               with a landing at both ends. Core: (P+2) x 2.
//
//        u ->   0   1  ..   P   P+1        even storeys climb strip A toward +u,
//        A    [L] [ s  s  s  S ] [L]       odd storeys climb strip B toward -u;
//        B    [L] [ S  s  s  s ] [L]       the landings at u=0 and u=P+1 join them.
//
//               A flight has P steps, one per block of height. The top step
//               (S) sits in the plane of the floor above, so its top is level
//               with that floor and you walk straight off onto the landing.
//               (0.2.7 and earlier stopped one step short: a hop at the top.)
//
//   wide        the same with 2-wide flights. Core: (P+2) x 4. Towers.
//
//   spiral      the original 3x3 ring. Step t sits in RING[t % 8] at base+t.
//
// Head room is the same rule for all three: at a floor slab of height Y, the
// cells holding steps at Y-1, Y-2 and Y-3 are left open. Two is not enough —
// a step wants feet, head and one more cell clear above it, or the slab above
// catches the climber's head. The core keeps open floor at both ends (and all
// round when there is room), so the player can always step off at a landing.
//
// With stair blocks switched off every step becomes a full block, which the
// 3-cell head room keeps jumpable.
//
// tools/validate.js walks every building with a player-movement flood fill.

import { perimeter } from './blockcore.js';
import { makeRng } from './rng.js';
import { MAT, doorId, stairId, DIR, WEIRDO, STAIR_SOLID, FLOWERS } from './materials.js';

export const OUTWARD = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
export const STAIR_STYLES = ['mixed', 'switchback', 'wide', 'spiral'];

const RING = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
// direction of travel out of RING[t] -> RING[t+1], as Bedrock weirdo_direction
const RING_DIR = [WEIRDO.east, WEIRDO.east, WEIRDO.south, WEIRDO.south,
                  WEIRDO.west, WEIRDO.west, WEIRDO.north, WEIRDO.north];

// Preference order per building. Each kind falls back to the next if the
// footprint is too small for it.
function stairPreference(styleSetting, buildingStyle, rng) {
  switch (styleSetting) {
    case 'wide': return ['wide', 'switchback', 'spiral'];
    case 'switchback': return ['switchback', 'spiral'];
    case 'spiral': return ['spiral', 'switchback'];
    default:
      if (buildingStyle === 'tower') return ['wide', 'switchback', 'spiral'];
      if (buildingStyle === 'mid') return rng.chance(0.3) ? ['spiral', 'switchback'] : ['switchback', 'spiral'];
      return ['switchback', 'spiral'];
  }
}

// Core size in (u = flight direction, v = across) for each kind.
function coreSize(kind, P) {
  if (kind === 'spiral') return [3, 3];
  return [P + 2, kind === 'wide' ? 4 : 2];
}

/**
 * spec: {x0,z0,x1,z1, floors, pitch, groundY, style, facing, theme,
 *        roofAccess, useStairs, stairStyle, lights, setback, setbackEvery}
 * Returns a record describing what was built (or null if the lot is too small).
 */
export function makeBuilding(world, spec, rng) {
  const { x0, z0, x1, z1, groundY: gy, theme } = spec;
  const P = spec.pitch;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  if (w < 5 || d < 5) return null;

  let floors = Math.max(1, spec.floors | 0);
  if (Math.min(w, d) < 7) floors = 1;           // too narrow for any stair
  const style = spec.style;
  const face = spec.facing || 'south';

  // ---- stepped setbacks ----------------------------------------------------
  const insets = [0];
  for (let k = 1; k < floors; k++) {
    let ins = insets[k - 1];
    if (spec.setback && style === 'tower' && k % spec.setbackEvery === 0 &&
        Math.min(w, d) - 2 * (ins + 1) >= 9) ins++;
    insets.push(ins);
  }
  const rect = (k) => ({ x0: x0 + insets[k], z0: z0 + insets[k], x1: x1 - insets[k], z1: z1 - insets[k] });
  let top = rect(floors - 1);

  // ---- stair core placement -------------------------------------------------
  // Tries each kind in preference order, both orientations, first with open
  // floor all round, then (straight flights only) flush against the back wall.
  let core = null;   // {x0,z0,x1,z1, kind, alongX}
  // noStairs: a wing of a larger building that shares another wing's stair
  // (a courtyard block). All its floors are kept, its slabs are whole, it has
  // no stair and no roof hut; it is reached through the wing it opens into.
  if (floors > 1 && !spec.noStairs) {
    const prefs = stairPreference(spec.stairStyle || 'mixed', style, rng);
    const fit = (lo, hi, len, margin) => {
      const a = lo + margin, b = hi - margin - (len - 1);
      return b >= a ? [a, b] : null;
    };
    const centre = (range, lo, hi, len) => {
      const c = Math.round((lo + hi) / 2 - (len - 1) / 2);
      return Math.min(Math.max(c, range[0]), range[1]);
    };
    outer:
    for (const kind of prefs) {
      const [U, V] = coreSize(kind, P);
      for (const alongX of [w >= d, w < d]) {
        const cw = alongX ? U : V, cd = alongX ? V : U;
        // Straight flights only need their two ends open, so they sit flush
        // against the back wall when they can (0.3.0): that leaves one deep
        // strip at the front for rooms instead of two shallow ones either
        // side. Spirals need open floor all round, so they go in the middle.
        const fx = fit(top.x0, top.x1, cw, 2), fz = fit(top.z0, top.z1, cd, 2);
        const endFit = kind === 'spiral' ? null : (alongX ? fit(top.x0, top.x1, cw, 2) : fit(top.z0, top.z1, cd, 2));
        const sideFit = kind === 'spiral' ? null : (alongX ? fit(top.z0, top.z1, cd, 1) : fit(top.x0, top.x1, cw, 1));
        if (!(endFit && sideFit)) {
          if (fx && fz) {
            const cx = centre(fx, top.x0, top.x1, cw), cz = centre(fz, top.z0, top.z1, cd);
            core = { x0: cx, z0: cz, x1: cx + cw - 1, z1: cz + cd - 1, kind, alongX };
            break outer;
          }
          continue;
        }
        {
          // back wall = away from the street, so the front door never opens onto a flight
          const back = alongX ? (face === 'north' ? sideFit[1] : sideFit[0])
                              : (face === 'west' ? sideFit[1] : sideFit[0]);
          if (alongX) {
            const cx = centre(endFit, top.x0, top.x1, cw);
            core = { x0: cx, z0: back, x1: cx + cw - 1, z1: back + cd - 1, kind, alongX };
          } else {
            const cz = centre(endFit, top.z0, top.z1, cd);
            core = { x0: back, z0: cz, x1: back + cw - 1, z1: cz + cd - 1, kind, alongX };
          }
          break outer;
        }
      }
    }
    if (!core) floors = 1;
  }
  top = rect(floors - 1);

  const roofY = gy + floors * P;
  const topFloorY = gy + (floors - 1) * P;
  const inCore = (x, z) => core && x >= core.x0 && x <= core.x1 && z >= core.z0 && z <= core.z1;

  // roof hut: needs a clear ring round the core and room for its door (+z face)
  const hut = !!(core && spec.roofAccess &&
    core.x0 - 2 > top.x0 && core.x1 + 2 < top.x1 &&
    core.z0 - 2 > top.z0 && core.z1 + 3 < top.z1);

  // ---- steps: [{x, y, z, dir}] ---------------------------------------------
  const steps = [];
  if (core) {
    const stairBase = gy + 1;
    if (core.kind === 'spiral') {
      const topStepY = hut ? roofY : topFloorY;
      for (let y = stairBase; y <= topStepY; y++) {
        const t = y - stairBase;
        const c = RING[t % 8];
        steps.push({ x: core.x0 + c[0], y, z: core.z0 + c[1], dir: RING_DIR[t % 8] });
      }
    } else {
      const flights = floors - 1 + (hut ? 1 : 0);
      const across = core.kind === 'wide' ? [[0, 1], [2, 3]] : [[0], [1]];
      const plusU = core.alongX ? WEIRDO.east : WEIRDO.south;
      const minusU = core.alongX ? WEIRDO.west : WEIRDO.north;
      for (let f = 0; f < flights; f++) {
        const F = gy + f * P;
        const even = (f % 2) === 0;
        for (let i = 0; i <= P - 1; i++) {           // P steps: the last one is in the floor above
          const u = even ? 1 + i : P - i;
          for (const v of across[even ? 0 : 1]) {
            const x = core.x0 + (core.alongX ? u : v);
            const z = core.z0 + (core.alongX ? v : u);
            steps.push({ x, y: F + 1 + i, z, dir: even ? plusU : minusU });
          }
        }
      }
    }
  }
  const stepsAt = new Map();   // y -> Set of "x,z"
  for (const s of steps) {
    if (!stepsAt.has(s.y)) stepsAt.set(s.y, new Set());
    stepsAt.get(s.y).add(s.x + ',' + s.z);
  }

  // ---- helpers -------------------------------------------------------------
  function slab(r, y, mat) {
    // keep the head room of the three steps below this slab open
    const open = [stepsAt.get(y - 1), stepsAt.get(y - 2), stepsAt.get(y - 3)].filter(Boolean);
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (open.length && inCore(x, z)) {
          const k = x + ',' + z;
          if (open.some((s) => s.has(k))) continue;
        }
        world.set(x, y, z, mat);
      }
    }
  }

  const winLo = (sy) => sy + 2;
  const winHi = (sy) => Math.max(sy + 2, Math.min(sy + 3, sy + P - 2));

  function windowMask(i, len) {
    if (i === 0 || i === len - 1) return false;
    if (style === 'tower') return i % 4 !== 0;
    if (style === 'mid') return i % 5 === 2 || i % 5 === 3;
    return i % 4 === 1 || i % 4 === 2;
  }

  // ---- door position (ground floor, street side) ---------------------------
  const r0 = rect(0);
  const outv = OUTWARD[face];
  let dx, dz;
  if (face === 'south') { dz = r0.z1; dx = Math.round((r0.x0 + r0.x1) / 2); }
  else if (face === 'north') { dz = r0.z0; dx = Math.round((r0.x0 + r0.x1) / 2); }
  else if (face === 'east') { dx = r0.x1; dz = Math.round((r0.z0 + r0.z1) / 2); }
  else { dx = r0.x0; dz = Math.round((r0.z0 + r0.z1) / 2); }
  // keep off the corners
  if (face === 'south' || face === 'north') dx = Math.min(Math.max(dx, r0.x0 + 1), r0.x1 - 1);
  else dz = Math.min(Math.max(dz, r0.z0 + 1), r0.z1 - 1);

  const wallLen = (face === 'south' || face === 'north') ? w : d;
  const twin = style === 'tower' && wallLen >= 11;
  const doorCells = [[dx, dz]];
  if (twin) {
    if (face === 'south' || face === 'north') doorCells.push([dx + 1, dz]);
    else doorCells.push([dx, dz + 1]);
  }
  const isDoorCell = (x, z) => doorCells.some((c) => c[0] === x && c[1] === z);

  // ---- shell ---------------------------------------------------------------
  let windowCount = 0;
  const floorYs = [];
  for (let k = 0; k < floors; k++) {
    const r = rect(k);
    const below = k > 0 ? rect(k - 1) : r;
    const sy = gy + k * P;
    floorYs.push(sy);

    slab(below, sy, theme.floor);
    world.ring(r.x0, r.z0, r.x1, r.z1, sy + 1, sy + P - 1, theme.wall);
    if (style !== 'house' && P >= 4) world.ring(r.x0, r.z0, r.x1, r.z1, sy + P - 1, sy + P - 1, theme.trim);
    if (k > 0 && insets[k] > insets[k - 1]) world.ring(below.x0, below.z0, below.x1, below.z1, sy + 1, sy + 1, theme.trim);

    // windows
    const lo = winLo(sy), hi = winHi(sy);
    for (const [px, pz, side, i, len] of perimeter(r.x0, r.z0, r.x1, r.z1)) {
      if (!windowMask(i, len)) continue;
      for (let y = lo; y <= hi; y++) {
        if (k === 0 && isDoorCell(px, pz)) continue;
        world.set(px, y, pz, theme.glass);
        windowCount++;
      }
    }

    // ceiling lights (never over the stairs — they would eat the head room)
    if (spec.lights) {
      for (let z = r.z0 + 3; z <= r.z1 - 2; z += 6)
        for (let x = r.x0 + 3; x <= r.x1 - 2; x += 6)
          if (!inCore(x, z)) world.set(x, sy + P - 1, z, MAT.LANTERN);
    }
  }

  // ---- roof ----------------------------------------------------------------
  slab(top, roofY, theme.floor);

  if (style === 'house') {
    // a rustic roof hangs further out, the way a village cottage's does
    gableRoof(world, { x0: top.x0 - 1, z0: top.z0 - 1, x1: top.x1 + 1, z1: top.z1 + 1 },
      roofY + 1, theme, spec.useStairs, spec.rustic ? 1 : 0);
  } else {
    const ph = style === 'tower' ? 2 : 1;
    world.ring(top.x0, top.z0, top.x1, top.z1, roofY + 1, roofY + ph, theme.wall);
    if (ph === 2) world.ring(top.x0, top.z0, top.x1, top.z1, roofY + 2, roofY + 2, theme.trim);
    if (floors >= 10 && rng.chance(0.6)) {
      const ax = top.x0 + 1, az = top.z0 + 1;
      const h = rng.int(4, 10);
      world.column(ax, az, roofY + 1, roofY + h, MAT.BARS);
      world.set(ax, roofY + h + 1, az, MAT.GLOWSTONE);
    }
  }

  // ---- stairs --------------------------------------------------------------
  if (steps.length) {
    const solidStep = STAIR_SOLID[theme.stair] !== undefined ? STAIR_SOLID[theme.stair] : theme.trim;
    for (const s of steps) {
      world.set(s.x, s.y, s.z, spec.useStairs ? stairId(theme.stair, s.dir) : solidStep);
    }
  }

  // ---- roof access hut -----------------------------------------------------
  let hutDoor = null;
  if (hut) {
    const h = { x0: core.x0 - 2, z0: core.z0 - 2, x1: core.x1 + 2, z1: core.z1 + 2 };
    world.ring(h.x0, h.z0, h.x1, h.z1, roofY + 1, roofY + 3, theme.wall);
    slab(h, roofY + 4, theme.trim);
    const hx = Math.round((core.x0 + core.x1) / 2), hz = h.z1;   // door on the +z face
    world.set(hx, roofY + 1, hz, doorId(theme.door, DIR.south, false));
    world.set(hx, roofY + 2, hz, doorId(theme.door, DIR.south, true));
    world.set(hx, roofY + 3, core.z1 + 1, MAT.LANTERN);
    hutDoor = [hx, roofY + 1, hz];
  }

  // ---- doors ---------------------------------------------------------------
  // A double door is two doors with the same facing and opposite hinges, the
  // hinges on the OUTER edges. "Right" is the side clockwise from the facing,
  // so which of our two cells gets the right hinge depends on the street side.
  const dirVal = DIR[face];
  const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
  const secondSide = (face === 'south' || face === 'north') ? 'east' : 'south';
  const secondIsRight = CLOCKWISE[face] === secondSide;
  const hingeOf = (i) => (doorCells.length < 2 ? 0 : ((i === 1) === secondIsRight ? 1 : 0));
  doorCells.forEach(([cx, cz], i) => {
    world.set(cx, gy + 1, cz, doorId(theme.door, dirVal, false, hingeOf(i)));
    world.set(cx, gy + 2, cz, doorId(theme.door, dirVal, true, hingeOf(i)));
  });
  // lit entrance
  if (P >= 5) {
    for (const [cx, cz] of doorCells) world.set(cx, gy + 3, cz, MAT.GLOWSTONE);
  }

  let houseInfo = null, arcadeInfo = null, eavesInfo = null;
  if (spec.detail !== false) {
    const ctx = {
      rects: Array.from({ length: floors }, (_, k) => rect(k)), floorYs, roofY, top, theme, style, face, P,
      doorCells, outv, gy, floors, core, hut, hutDoor, rustic: spec.rustic, eaves: !!spec.eaves,
    };
    facadeDetail(world, ctx, rng);
    // its own random stream, seeded from where the house stands: the details
    // never shift the city's main stream, so every other choice in the city is
    // the same with them as without them
    if (style === 'house') houseInfo = houseDetail(world, ctx, makeRng(((x0 * 73856093) ^ (z0 * 19349663) ^ 0x40a5e) >>> 0));
    // only on an ordinary mid-rise lot (the city asks); a landmark dresses itself
    if (style === 'mid' && spec.arcade && !spec.eaves) arcadeInfo = romanesqueArcade(world, ctx);
    if (spec.eaves) eavesInfo = eaveSkirts(world, ctx);
  }

  return {
    x0, z0, x1, z1, w, d, floors, pitch: P, groundY: gy, style,
    themeName: theme.name, theme, facing: face,
    rects: Array.from({ length: floors }, (_, k) => rect(k)),
    floorYs, roofY, topY: hut ? roofY + 4 : roofY + (style === 'house' ? Math.ceil(Math.min(w, d) / 2) + 1 : 2),
    core: core ? { x0: core.x0, z0: core.z0, x1: core.x1, z1: core.z1 } : null,
    stairKind: core ? core.kind : null,
    hut, hutDoor, windows: windowCount,
    door: { x: dx, y: gy + 1, z: dz, out: outv },
    doorCells: doorCells.map((c) => c.slice()),
    outside: [dx + outv[0], gy + 1, dz + outv[1]],
    houseDetail: houseInfo,
    arcade: arcadeInfo,
    eaves: eavesInfo,
  };
}

// ---- a house's own details ------------------------------------------------------
// Shutters beside every window in a wood that goes with the door, a lintel and
// a sill in the trim, window boxes of flowers under the upper windows and a
// flower bed under the ground-floor ones, and a little pitched hood over the
// front door. (The lanterns stand on the gate posts of the picket fence.) Shutters, lintels and sills are
// set into the wall itself; everything else goes into empty air, above head
// height or on the grass of the yard, never in the doorway or on the path.
const SHUTTER_WOOD = { oak: MAT.OAK, spruce: MAT.SPRUCE, dark: MAT.DARK_PLANKS, acacia: MAT.ACACIA,
  jungle: MAT.JUNGLE, cherry: MAT.CHERRY, bamboo: MAT.BAMBOO_PLANKS,
  // woods with no plank block of their own here: the nearest in tone
  birch: MAT.OAK, crimson: MAT.DARK_PLANKS, warped: MAT.DARK_PLANKS, mangrove: MAT.DARK_PLANKS };
const CLIMB = (dx, dz) => (dx === 1 ? WEIRDO.east : dx === -1 ? WEIRDO.west : dz === 1 ? WEIRDO.south : WEIRDO.north);
function houseDetail(world, c, rng) {
  const { rects, floorYs, theme, P, doorCells, outv, gy, floors } = c;
  const info = { shutters: 0, lintels: 0, sills: 0, boxes: 0, flowers: 0, hood: 0, beds: [] };
  // shutters stand out from both the wall and the trim round the window: the
  // door's wood if it does, else the roof's material, else a dark wood
  const shutter = [SHUTTER_WOOD[theme.door], theme.roof, MAT.DARK_PLANKS, MAT.SPRUCE]
    .find((m) => m !== undefined && m !== theme.wall && m !== theme.trim);
  const isDoor = (x, z) => doorCells.some(([a, b]) => a === x && b === z);
  const empty = (x, y, z) => !world.has(x, y, z);
  const isGlass = (x, y, z) => world.get(x, y, z) === theme.glass;
  for (let k = 0; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    const lo = sy + 2, hi = Math.max(sy + 2, Math.min(sy + 3, sy + P - 2));
    const outOf = (x, z) => (x === r.x0 ? [-1, 0] : x === r.x1 ? [1, 0] : z === r.z0 ? [0, -1] : [0, 1]);
    for (const [px, pz, , i, len] of perimeter(r.x0, r.z0, r.x1, r.z1)) {
      if (i === 0 || i === len - 1 || !isGlass(px, lo, pz)) continue;
      const [ox, oz] = outOf(px, pz);
      const along = ox === 0 ? [1, 0] : [0, 1];
      // shutters: the wall cells either side of a run of glass
      for (const sgn of [-1, 1]) {
        const sx = px + along[0] * sgn, sz = pz + along[1] * sgn;
        if (isGlass(sx, lo, sz) || isDoor(sx, sz)) continue;
        if (sx < r.x0 || sx > r.x1 || sz < r.z0 || sz > r.z1) continue;
        if ((sx === r.x0 || sx === r.x1) && (sz === r.z0 || sz === r.z1)) continue;      // the corner post stays
        for (let y = lo; y <= hi; y++) if (world.get(sx, y, sz) === theme.wall) { world.set(sx, y, sz, shutter); info.shutters++; }
      }
      // lintel over the window and sill under it, in the wall
      if (hi + 1 <= sy + P - 1 && world.get(px, hi + 1, pz) === theme.wall) { world.set(px, hi + 1, pz, theme.trim); info.lintels++; }
      if (lo - 1 > sy && world.get(px, lo - 1, pz) === theme.wall) { world.set(px, lo - 1, pz, theme.trim); info.sills++; }
      // flowers: a window box under an upper window, a bed under a ground-floor one
      const bx = px + ox, bz = pz + oz;
      if (k > 0) {
        if (empty(bx, lo - 1, bz) && empty(bx, lo, bz)) {
          world.set(bx, lo - 1, bz, MAT.PLANTER);
          world.set(bx, lo, bz, rng.pick(FLOWERS));
          info.boxes++;
        }
      } else {
        // a flower bed under a ground-floor window: recorded here, planted by
        // the city once the yard's own trees and flowers are in (plantBeds), so
        // the yard is laid out exactly as it would be without it
        info.beds.push([bx, bz]);
      }
    }
  }
  // the door hood: three stairs a block out over the doorway, sloping away from
  // the wall, over the door frame. It sits at gy + 4, not gy + 3: on sloping
  // ground the step out of the door can be a block up, and a step up needs the
  // cell above the head clear (a hood at gy + 3 shut a house in on real ground).
  const [dx, dz] = doorCells[0];
  const lat = outv[0] === 0 ? [1, 0] : [0, 1];
  const hy = gy + 4;
  if (hy < c.roofY) {
    for (const sgn of [-1, 0, 1]) {
      const x = dx + outv[0] + lat[0] * sgn, z = dz + outv[1] + lat[1] * sgn;
      if (!empty(x, hy, z)) continue;
      world.set(x, hy, z, stairId(theme.stair, CLIMB(-outv[0], -outv[1])));
      info.hood++;
    }
  }
  return info;
}

// ---- eave skirts (the East Asian style) -----------------------------------------------
// At every floor above the ground (and at the roofline of a flat-roofed
// building) a skirt of tile eaves runs one block out all round, the stairs
// sloping down and away from the wall; at each corner the skirt turns up: the
// corner cell sits one block higher with its stair rising outward. Every
// skirt is at least a storey above the ground, so it never takes head room.
// Only empty cells are used. No random draws.
function eaveSkirts(world, c) {
  const { rects, floorYs, roofY, theme, style, floors } = c;
  const levels = [];
  for (let k = 1; k < floors; k++) levels.push([floorYs[k], rects[k - 1]]);
  if (style !== 'house') levels.push([roofY, rects[floors - 1]]);
  const info = { skirts: 0, cells: 0, corners: 0, levels: levels.map(([y]) => y) };
  const put = (x, y, z, id) => { if (world.has(x, y, z)) return false; world.set(x, y, z, id); return true; };
  for (const [y, r] of levels) {
    let n = 0;
    for (let x = r.x0; x <= r.x1; x++) {
      if (put(x, y, r.z0 - 1, stairId(theme.stair, CLIMB(0, 1)))) n++;
      if (put(x, y, r.z1 + 1, stairId(theme.stair, CLIMB(0, -1)))) n++;
    }
    for (let z = r.z0; z <= r.z1; z++) {
      if (put(r.x0 - 1, y, z, stairId(theme.stair, CLIMB(1, 0)))) n++;
      if (put(r.x1 + 1, y, z, stairId(theme.stair, CLIMB(-1, 0)))) n++;
    }
    // upturned corners: a block higher, rising outward along x
    for (const [x, z, ox] of [[r.x0 - 1, r.z0 - 1, -1], [r.x1 + 1, r.z0 - 1, 1], [r.x0 - 1, r.z1 + 1, -1], [r.x1 + 1, r.z1 + 1, 1]])
      if (put(x, y + 1, z, stairId(theme.stair, CLIMB(ox, 0)))) info.corners++;
    if (n) { info.skirts++; info.cells += n; }
  }
  return info;
}

// ---- a Romanesque arcade on a mid-rise ground floor ---------------------------------
// After the arcades of the plate's "Architecture romane": along the street face
// of the ground floor, a pier every fourth cell and between each pair a round-
// headed opening three wide: a bulkhead, glass, and an arch head of upside-down
// stairs curving in from both piers, glass at the crown, the trim band over it
// for the keystone course. A bay that touches the doorway is left as it was.
// Over the arcade, a block out at the height of the first floor's slab (well
// above anyone's head), a billet course: blocks and upside-down stairs in turn.
// No random draws: the same building always gets the same arcade.
function romanesqueArcade(world, c) {
  const { rects, theme, P, doorCells, gy, face, outv } = c;
  if (P < 5) return null;
  const r = rects[0];
  const cells = perimeter(r.x0, r.z0, r.x1, r.z1).filter((p) => p[2] === face).sort((a, b) => a[3] - b[3]);
  const len = cells.length;
  if (len < 9) return null;
  const along = outv[0] === 0 ? [1, 0] : [0, 1];
  const nearDoor = (x, z) => doorCells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 1);
  const ours = new Set([theme.wall, theme.glass, theme.trim]);
  const info = { piers: 0, arches: 0, billets: 0, bays: [] };
  const archRow = gy + P - 2;
  for (let b = 0; 4 * b + 4 <= len - 1; b++) {
    const bay = [1, 2, 3].map((j) => cells[4 * b + j]);
    const piers = [cells[4 * b], cells[4 * b + 4]];
    if (bay.some(([x, z]) => nearDoor(x, z)) || piers.some(([x, z]) => nearDoor(x, z))) continue;
    if (![...bay, ...piers].every(([x, z]) => {
      for (let y = gy + 1; y <= archRow; y++) if (!ours.has(world.get(x, y, z))) return false;
      return true;
    })) continue;
    for (const [x, z] of piers) for (let y = gy + 1; y <= archRow; y++) world.set(x, y, z, theme.trim);
    bay.forEach(([x, z], j) => {
      world.set(x, gy + 1, z, theme.wall);                                    // the bulkhead
      for (let y = gy + 2; y < archRow; y++) world.set(x, y, z, theme.glass);
      if (j === 1) world.set(x, archRow, z, theme.glass);                     // the crown of the arch
      else world.set(x, archRow, z, stairId(theme.stair, CLIMB(along[0] * (j === 0 ? -1 : 1), along[1] * (j === 0 ? -1 : 1)), true));
    });
    info.arches++;
    info.bays.push(bay.map(([x, z]) => [x, z]));
  }
  if (!info.arches) return null;
  const piersSeen = new Set();
  for (const bay of info.bays) for (const [x, z] of [[bay[0][0] - along[0], bay[0][1] - along[1]], [bay[2][0] + along[0], bay[2][1] + along[1]]]) piersSeen.add(x + ',' + z);
  info.piers = piersSeen.size;
  // every cell of the arcade (bays and piers), so a shop window leaves it be
  info.cells = [...piersSeen, ...info.bays.flat().map(([x, z]) => x + ',' + z)];
  // the billet course, over the whole facade between its corners
  const by = gy + P;
  cells.forEach(([x, z, , i]) => {
    if (i === 0 || i === len - 1) return;
    const bx = x + outv[0], bz = z + outv[1];
    if (world.has(bx, by, bz)) return;
    world.set(bx, by, bz, i % 2 ? stairId(theme.stair, CLIMB(-outv[0], -outv[1]), true) : theme.trim);
    info.billets++;
  });
  return info;
}

// Plant a house's flower beds (after the yard is done): only on open grass,
// from the house's own random stream.
export function plantBeds(world, rec) {
  const hd = rec.houseDetail;
  if (!hd || !hd.beds) return 0;
  const rng = makeRng(((rec.x0 * 83492791) ^ (rec.z0 * 2654435761) ^ 0xbed5) >>> 0);
  const gy = rec.groundY;
  for (const [x, z] of hd.beds) {
    if (world.get(x, gy, z) !== MAT.GRASS || world.has(x, gy + 1, z) || world.has(x, gy + 2, z)) continue;
    world.set(x, gy + 1, z, rng.pick(FLOWERS));
    hd.flowers++;
  }
  return hd.flowers;
}

// ---- facade detail ----------------------------------------------------------
// Relief on the outside so a building is not a flat box: quoins at the
// corners, pilasters between the windows, an eave at the roofline, balconies
// and a bay window on the street front, a framed doorway, and clutter on the
// roof. Everything that sticks out is only placed into empty space and always
// above head height, so it can never block a street, a doorway or a lamp.
function facadeDetail(world, c, rng) {
  const { rects, floorYs, roofY, top, theme, style, face, P, doorCells, outv, gy, floors, core, hut, hutDoor, rustic } = c;
  // the way out onto the roof stays clear: the hut and the space round its door
  const roofBusy = (x, z) => {
    if (hut && core && x >= core.x0 - 2 && x <= core.x1 + 2 && z >= core.z0 - 2 && z <= core.z1 + 2) return true;
    if (hutDoor && Math.abs(x - hutDoor[0]) <= 2 && Math.abs(z - hutDoor[2]) <= 2) return true;
    return false;
  };
  const put = (x, y, z, m) => { if (!world.has(x, y, z)) world.set(x, y, z, m); };
  const isDoor = (x, z) => doorCells.some(([a, b]) => a === x && b === z);

  // corners: alternating quoins on a town building, solid posts on a rustic
  // one, where the frame is the structure and shows it
  for (let k = 0; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]])
      for (let y = sy + 1; y <= sy + P - 1; y += (rustic ? 1 : 2)) world.set(cx, y, cz, theme.trim);
  }
  // a rustic building stands on a footing of stone, a course high
  if (rustic) {
    const r0 = rects[0];
    for (const [px, pz] of perimeter(r0.x0, r0.z0, r0.x1, r0.z1)) {
      if (isDoor(px, pz)) continue;
      const id = world.get(px, gy + 1, pz);
      if (id === theme.wall) world.set(px, gy + 1, pz, MAT.COBBLE);
    }
  }

  // pilasters: the blank columns between window runs, in the trim material
  if (style !== 'house' && !rustic) {
    for (let k = 0; k < floors; k++) {
      const r = rects[k], sy = floorYs[k];
      for (const [px, pz, , i, len] of perimeter(r.x0, r.z0, r.x1, r.z1)) {
        if (i === 0 || i === len - 1) continue;
        if (style === 'tower' ? i % 4 !== 0 : i % 5 !== 0) continue;
        for (let y = sy + 1; y <= sy + P - 2; y++) {
          if (k === 0 && isDoor(px, pz)) continue;
          const id = world.get(px, y, pz);
          if (id === theme.wall) world.set(px, y, pz, theme.trim);
        }
      }
    }
  }

  // eave: upside-down stairs one block out all round the roofline (a style
  // with eave skirts gets those instead: eaveSkirts below)
  if (!c.eaves) {
    const r = top, y = roofY;
    // the way out is read from the cell itself, not the side index (corners get both)
    for (const [px, pz] of perimeter(r.x0, r.z0, r.x1, r.z1)) {
      const outs = [];
      if (px === r.x0) outs.push([-1, 0]);
      if (px === r.x1) outs.push([1, 0]);
      if (pz === r.z0) outs.push([0, -1]);
      if (pz === r.z1) outs.push([0, 1]);
      for (const [ox, oz] of outs) {
        const dir = ox === 1 ? WEIRDO.west : ox === -1 ? WEIRDO.east : oz === 1 ? WEIRDO.north : WEIRDO.south;
        put(px + ox, y, pz + oz, stairId(theme.stair, dir, true));
      }
    }
  }

  // balconies and a bay window on the street front
  const front = (k) => {
    const r = rects[k];
    const cells = [];
    if (face === 'south') for (let x = r.x0 + 1; x <= r.x1 - 1; x++) cells.push([x, r.z1]);
    else if (face === 'north') for (let x = r.x0 + 1; x <= r.x1 - 1; x++) cells.push([x, r.z0]);
    else if (face === 'east') for (let z = r.z0 + 1; z <= r.z1 - 1; z++) cells.push([r.x1, z]);
    else for (let z = r.z0 + 1; z <= r.z1 - 1; z++) cells.push([r.x0, z]);
    return cells;
  };
  if (style !== 'house' && !rustic) {
    for (let k = 1; k < floors; k++) {
      if (k % 2 === 0 || !rng.chance(0.7)) continue;
      const cells = front(k);
      if (cells.length < 5) continue;
      const start = 1 + Math.floor(rng() * Math.max(1, cells.length - 4));
      const sy = floorYs[k];
      for (let i = start; i < start + 3 && i < cells.length; i++) {
        const [x, z] = cells[i];
        put(x + outv[0], sy, z + outv[1], theme.trim);            // the ledge, at floor level
        put(x + outv[0], sy + 1, z + outv[1], MAT.FENCE);         // its railing
      }
    }
  }
  if (style === 'mid' && !rustic && floors >= 2 && rng.chance(0.5)) {
    const cells = front(1);
    if (cells.length >= 5) {
      const start = 1 + Math.floor(rng() * Math.max(1, cells.length - 4));
      const sy = floorYs[1], hi = sy + P - 1;
      for (let i = start; i < start + 3 && i < cells.length; i++) {
        const [x, z] = cells[i];
        const bx = x + outv[0], bz = z + outv[1];
        put(bx, sy, bz, theme.trim);                              // floor of the bay
        put(bx, hi, bz, theme.trim);                              // and its little roof
        for (let y = sy + 1; y < hi; y++) put(bx, y, bz, i === start || i === start + 2 ? theme.trim : theme.glass);
      }
    }
  }

  // a framed doorway
  for (const [x, z] of doorCells) {
    const alongX = outv[1] !== 0;
    for (const s of [-1, 1]) {
      const fx = x + (alongX ? s : 0), fz = z + (alongX ? 0 : s);
      if (isDoor(fx, fz)) continue;
      for (let y = gy + 1; y <= gy + 3; y++) world.set(fx, y, fz, theme.trim);
    }
    world.set(x, gy + 3, z, theme.trim);
  }

  // roof clutter
  const r = top, cx = Math.floor((r.x0 + r.x1) / 2), cz = Math.floor((r.z0 + r.z1) / 2);
  if (style === 'house') {
    const chx = rng.chance(0.5) ? r.x0 + 1 : r.x1 - 1, chz = rng.chance(0.5) ? r.z0 + 1 : r.z1 - 1;
    if (!roofBusy(chx, chz))
      for (let y = roofY; y <= roofY + Math.ceil(Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2) + 2; y++) world.set(chx, y, chz, MAT.BRICK);
  } else if (r.x1 - r.x0 >= 6 && r.z1 - r.z0 >= 6) {
    const tx = r.x0 + 2, tz = r.z0 + 2;
    let free = true;
    for (let dz = 0; dz <= 2 && free; dz++) for (let dx = 0; dx <= 2 && free; dx++) if (roofBusy(tx + dx, tz + dz)) free = false;
    if (free && rng.chance(0.6)) {                                // water tank on legs
      for (const [ox, oz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) put(tx + ox, roofY + 1, tz + oz, MAT.FENCE);
      for (let dz = 0; dz <= 2; dz++) for (let dx = 0; dx <= 2; dx++)
        for (let y = roofY + 2; y <= roofY + 3; y++) put(tx + dx, y, tz + dz, theme.trim);
    }
    if (rng.chance(0.7)) {                                        // vents
      for (const [ox, oz] of [[1, -1], [-1, 1]]) {
        if (roofBusy(cx + ox, cz + oz)) continue;
        put(cx + ox, roofY + 1, cz + oz, MAT.SMOOTH);
        put(cx + ox, roofY + 2, cz + oz, MAT.IRON);
      }
    }
  }
}

// ---- pitched roof ----------------------------------------------------------
function gableRoof(world, r, y0, theme, useStairs, overhang = 0) {
  const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
  const alongZ = w >= d;                       // slope down the short axis
  // a rustic roof starts a course wider than the walls and hangs over them
  const R = overhang
    ? { x0: r.x0 - overhang, x1: r.x1 + overhang, z0: r.z0 - overhang, z1: r.z1 + overhang }
    : r;
  const lo0 = alongZ ? R.z0 : R.x0;
  const hi0 = alongZ ? R.z1 : R.x1;
  const solid = theme.roof !== undefined ? theme.roof : theme.trim;
  const kind = theme.stair;

  const fillRow = (coord, y, mat) => {
    if (alongZ) for (let x = R.x0; x <= R.x1; x++) world.set(x, y, coord, mat);
    else for (let z = R.z0; z <= R.z1; z++) world.set(coord, y, z, mat);
  };
  const fillGableEnds = (a, b, y) => {
    // the gable itself follows the walls; the overhang is roof, not wall
    if (alongZ) {
      for (let c = Math.max(a + 1, r.z0); c <= Math.min(b - 1, r.z1); c++) { world.set(r.x0, y, c, theme.wall); world.set(r.x1, y, c, theme.wall); }
    } else {
      for (let c = Math.max(a + 1, r.x0); c <= Math.min(b - 1, r.x1); c++) { world.set(c, y, r.z0, theme.wall); world.set(c, y, r.z1, theme.wall); }
    }
  };

  const lowDir = alongZ ? WEIRDO.south : WEIRDO.east;   // ascending toward +axis
  const highDir = alongZ ? WEIRDO.north : WEIRDO.west;

  for (let j = 0; ; j++) {
    const a = lo0 + j, b = hi0 - j, y = y0 + j;
    if (a > b) break;
    if (b - a <= 1) { fillRow(a, y, solid); if (b !== a) fillRow(b, y, solid); break; }
    fillRow(a, y, useStairs ? stairId(kind, lowDir) : solid);
    fillRow(b, y, useStairs ? stairId(kind, highDir) : solid);
    fillGableEnds(a, b, y);
  }
}

// ---- a free-standing single building (used by "one building" mode) ---------
export function pickTheme(THEMES, style, rng) {
  const list = THEMES[style] || THEMES.mid;
  return list[Math.floor(rng() * list.length)];
}

export { OPPOSITE };
