// engine/building.js — one building, from lot rectangle to blocks.
//
// STAIRS (the part that has to actually work in game)
// ---------------------------------------------------
// Three stair layouts, all built from the same rule: a step is a stair block
// that rises exactly one block from the previous one, so every flight lands
// flush with the floor slab above it.
//
//   switchback  1-wide straight flights, alternating direction each storey,
//               with a landing at both ends. Core: (P+1) x 2.
//
//        u ->   0   1 .. P-1   P          even storeys climb strip A toward +u,
//        A    [L] [ s  s  s ] [L]          odd storeys climb strip B toward -u;
//        B    [L] [ s  s  s ] [L]          the landings at u=0 and u=P join them.
//
//   wide        the same with 2-wide flights. Core: (P+1) x 4. Towers.
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
import { MAT, doorId, stairId, DIR, WEIRDO, STAIR_SOLID } from './materials.js';

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
  return [P + 1, kind === 'wide' ? 4 : 2];
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
  if (floors > 1) {
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
        // 1) open floor on every side
        const fx = fit(top.x0, top.x1, cw, 2), fz = fit(top.z0, top.z1, cd, 2);
        if (fx && fz) {
          const cx = centre(fx, top.x0, top.x1, cw), cz = centre(fz, top.z0, top.z1, cd);
          core = { x0: cx, z0: cz, x1: cx + cw - 1, z1: cz + cd - 1, kind, alongX };
          break outer;
        }
        if (kind === 'spiral') continue;
        // 2) straight flights only need the two ends open: sit flush on a long side
        const endFit = alongX ? fit(top.x0, top.x1, cw, 2) : fit(top.z0, top.z1, cd, 2);
        const sideFit = alongX ? fit(top.z0, top.z1, cd, 1) : fit(top.x0, top.x1, cw, 1);
        if (endFit && sideFit) {
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
        for (let i = 0; i <= P - 2; i++) {
          const u = even ? 1 + i : P - 1 - i;
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

  return {
    x0, z0, x1, z1, w, d, floors, pitch: P, groundY: gy, style,
    themeName: theme.name, facing: face,
    rects: Array.from({ length: floors }, (_, k) => rect(k)),
    floorYs, roofY, topY: hut ? roofY + 4 : roofY + (style === 'house' ? Math.ceil(Math.min(w, d) / 2) + 1 : 2),
    core: core ? { x0: core.x0, z0: core.z0, x1: core.x1, z1: core.z1 } : null,
    stairKind: core ? core.kind : null,
    hut, hutDoor, windows: windowCount,
    door: { x: dx, y: gy + 1, z: dz, out: outv },
    doorCells: doorCells.map((c) => c.slice()),
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
