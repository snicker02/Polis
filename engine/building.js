// engine/building.js — one building, from lot rectangle to blocks.
//
// STAIRWELL DESIGN (the part that has to actually work in game)
// ------------------------------------------------------------
// Every multi-floor building gets a 3x3 spiral core. The eight cells around
// the core ring are, in order, orthogonally adjacent:
//
//     0 1 2        step t sits in RING[t % 8] at height  base + t
//     7 . 3        so the climb rises exactly 1 block per cell and
//     6 5 4        arrives FLUSH with every floor slab, whatever the pitch.
//
// Head room is free: the next block in the same ring cell is 8 above.
// At each floor slab height Y the shaft is floored in (a landing) EXCEPT the
// three ring cells holding the steps at Y-1, Y-2 and Y-3 — those must stay
// open. Two is not enough: standing on a step needs feet+head clear AND one
// more cell to jump into, so every step wants 3 free cells above it. The core
// is always placed with at least one cell of open floor on all four sides, so
// whichever ring cell the spiral happens to land on at a given floor, the
// player can step off it.
//
// The steps themselves are stair blocks facing along the direction of travel,
// which makes the climb a smooth walk rather than a jump per floor; with stair
// blocks switched off they become full blocks, which the 3-cell head room
// keeps jumpable.
//
// tools/validate.js walks this with a real player-movement flood fill.

import { perimeter } from './blockcore.js';
import { MAT, MATERIALS, doorId, stairId, DIR, WEIRDO, STAIR_SOLID } from './materials.js';

const RING = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
// direction of travel out of RING[t] -> RING[t+1], as Bedrock weirdo_direction
const RING_DIR = [WEIRDO.east, WEIRDO.east, WEIRDO.south, WEIRDO.south,
                  WEIRDO.west, WEIRDO.west, WEIRDO.north, WEIRDO.north];
export const OUTWARD = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

/**
 * spec: {x0,z0,x1,z1, floors, pitch, groundY, style, facing, theme,
 *        roofAccess, useStairs, lights, setback, setbackEvery}
 * Returns a record describing what was built (or null if the lot is too small).
 */
export function makeBuilding(world, spec, rng) {
  const { x0, z0, x1, z1, groundY: gy, theme } = spec;
  const P = spec.pitch;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  if (w < 5 || d < 5) return null;

  let floors = Math.max(1, spec.floors | 0);
  if (Math.min(w, d) < 7) floors = 1;           // no room for a stair core
  const style = spec.style;

  // ---- stepped setbacks ----------------------------------------------------
  const insets = [0];
  for (let k = 1; k < floors; k++) {
    let ins = insets[k - 1];
    if (spec.setback && style === 'tower' && k % spec.setbackEvery === 0 &&
        Math.min(w, d) - 2 * (ins + 1) >= 9) ins++;
    insets.push(ins);
  }
  const rect = (k) => ({ x0: x0 + insets[k], z0: z0 + insets[k], x1: x1 - insets[k], z1: z1 - insets[k] });
  const top = rect(floors - 1);

  // ---- stair core ----------------------------------------------------------
  let shaft = null;
  if (floors > 1) {
    const sxLo = top.x0 + 2, sxHi = top.x1 - 4;
    const szLo = top.z0 + 2, szHi = top.z1 - 4;
    if (sxHi >= sxLo && szHi >= szLo) {
      shaft = {
        x: Math.min(Math.max(Math.round((top.x0 + top.x1) / 2) - 1, sxLo), sxHi),
        z: Math.min(Math.max(Math.round((top.z0 + top.z1) / 2) - 1, szLo), szHi),
      };
    } else {
      floors = 1;
    }
  }

  const roofY = gy + floors * P;
  const topFloorY = gy + (floors - 1) * P;
  const inShaft = (x, z) => shaft && x >= shaft.x && x <= shaft.x + 2 && z >= shaft.z && z <= shaft.z + 2;

  const hut = !!(shaft && spec.roofAccess &&
    shaft.x - 2 > top.x0 && shaft.x + 4 < top.x1 &&
    shaft.z - 2 > top.z0 && shaft.z + 4 < top.z1);

  const stairBase = gy + 1;
  const topStepY = shaft ? (hut ? roofY : topFloorY) : gy;
  const stepCellAt = (y) => {
    if (!shaft) return null;
    const t = y - stairBase;
    if (t < 0 || y > topStepY) return null;
    return RING[t % 8];
  };

  // ---- helpers -------------------------------------------------------------
  function slab(r, y, mat) {
    // keep the head room of the three steps below this slab open
    const open = [stepCellAt(y - 1), stepCellAt(y - 2), stepCellAt(y - 3)];
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (shaft && inShaft(x, z)) {
          const lx = x - shaft.x, lz = z - shaft.z;
          let skip = false;
          for (const c of open) if (c && c[0] === lx && c[1] === lz) { skip = true; break; }
          if (skip) continue;
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
  const face = spec.facing || 'south';
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

    // ceiling lights
    if (spec.lights) {
      for (let z = r.z0 + 3; z <= r.z1 - 2; z += 6)
        for (let x = r.x0 + 3; x <= r.x1 - 2; x += 6)
          if (!inShaft(x, z)) world.set(x, sy + P - 1, z, MAT.LANTERN);
    }
  }

  // ---- roof ----------------------------------------------------------------
  slab(top, roofY, theme.floor);

  if (style === 'house') {
    gableRoof(world, { x0: top.x0 - 1, z0: top.z0 - 1, x1: top.x1 + 1, z1: top.z1 + 1 },
      roofY + 1, theme, spec.useStairs);
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

  // ---- stair core ----------------------------------------------------------
  if (shaft) {
    const solidStep = STAIR_SOLID[theme.stair] !== undefined ? STAIR_SOLID[theme.stair] : theme.trim;
    for (let y = stairBase; y <= topStepY; y++) {
      const t = y - stairBase;
      const c = RING[t % 8];
      const mat = spec.useStairs ? stairId(theme.stair, RING_DIR[t % 8]) : solidStep;
      world.set(shaft.x + c[0], y, shaft.z + c[1], mat);
    }
  }

  // ---- roof access hut -----------------------------------------------------
  let hutDoor = null;
  if (hut) {
    const h = { x0: shaft.x - 2, z0: shaft.z - 2, x1: shaft.x + 4, z1: shaft.z + 4 };
    world.ring(h.x0, h.z0, h.x1, h.z1, roofY + 1, roofY + 3, theme.wall);
    slab(h, roofY + 4, theme.trim);
    const hx = shaft.x + 1, hz = h.z1;           // door on the +z face, centred
    world.set(hx, roofY + 1, hz, doorId(theme.door, DIR.south, false));
    world.set(hx, roofY + 2, hz, doorId(theme.door, DIR.south, true));
    world.set(shaft.x + 1, roofY + 3, shaft.z + 1, MAT.LANTERN);
    hutDoor = [hx, roofY + 1, hz];
  }

  // ---- doors ---------------------------------------------------------------
  const dirVal = DIR[face];
  doorCells.forEach(([cx, cz], i) => {
    world.set(cx, gy + 1, cz, doorId(theme.door, dirVal, false, i));
    world.set(cx, gy + 2, cz, doorId(theme.door, dirVal, true, i));
  });
  // lit entrance
  if (P >= 5) {
    for (const [cx, cz] of doorCells) world.set(cx, gy + 3, cz, MAT.GLOWSTONE);
  }

  return {
    x0, z0, x1, z1, w, d, floors, pitch: P, groundY: gy, style,
    themeName: theme.name, facing: face,
    rects: Array.from({ length: floors }, (_, k) => rect(k)),
    floorYs, roofY, topY: hut ? roofY + 4 : roofY + (style === 'house' ? Math.ceil(Math.min(w, d) / 2) + 1 : 2),
    shaft, hut, hutDoor, windows: windowCount,
    door: { x: dx, y: gy + 1, z: dz, out: outv },
    outside: [dx + outv[0], gy + 1, dz + outv[1]],
  };
}

// ---- pitched roof ----------------------------------------------------------
function gableRoof(world, r, y0, theme, useStairs) {
  const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
  const alongZ = w >= d;                       // slope down the short axis
  const lo0 = alongZ ? r.z0 : r.x0;
  const hi0 = alongZ ? r.z1 : r.x1;
  const solid = theme.roof !== undefined ? theme.roof : theme.trim;
  const kind = theme.stair;

  const fillRow = (coord, y, mat) => {
    if (alongZ) for (let x = r.x0; x <= r.x1; x++) world.set(x, y, coord, mat);
    else for (let z = r.z0; z <= r.z1; z++) world.set(coord, y, z, mat);
  };
  const fillGableEnds = (a, b, y) => {
    if (alongZ) {
      for (let c = a + 1; c <= b - 1; c++) { world.set(r.x0, y, c, theme.wall); world.set(r.x1, y, c, theme.wall); }
    } else {
      for (let c = a + 1; c <= b - 1; c++) { world.set(c, y, r.z0, theme.wall); world.set(c, y, r.z1, theme.wall); }
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
