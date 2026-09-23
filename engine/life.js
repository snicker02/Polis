// engine/life.js — farms, ponds, flowers, furniture, workstations, villagers.
//
// Water rule (farms, ponds): a water source only ever sits at ground level
// with solid blocks on all four sides and underneath. Water never flows up,
// so crops and flowers above it are safe, and nothing around it at the same
// level is air or a plant — so it has nowhere to go. tools/validate.js checks
// every water block in every city against exactly that rule.
//
// Furniture rule: only along the inside of the outer walls, never within one
// cell of the stair core, never within two cells of the front door. After a
// building is furnished it is re-verified with the player flood fill; if any
// floor became unreachable, the furniture comes back out.

import { MAT, MATERIALS, FLOWERS, CARPETS, CROP_KINDS, cropId, bedId, furnaceId, BED_VEC, stairId, WEIRDO, wallSignId, signId, SIGN_FACING,
  gateId, chestId, lecternId, smokerId, stonecutterId, loomId, grindstoneId, bambooId } from './materials.js';
import { verifyBuilding } from './verify.js';
import { OUTWARD } from './building.js';
import { planRooms, buildRooms } from './rooms.js';
import { signTags } from './landmarks.js';
import { PAINTINGS } from './entities.js';
import { USE } from './plan.js';

export const USE_FARM = 6;
export const USE_RANCH = 7;
const BED_COLORS = [14, 11, 13, 1, 4, 3, 10, 0];   // red blue green orange yellow lblue purple white

const solidAt = (world, x, y, z) => {
  const id = world.get(x, y, z);
  return id !== -1 && !MATERIALS.isPassable(id);
};
const standable = (world, x, y, z, height = 2) => {
  if (!solidAt(world, x, y - 1, z)) return false;
  for (let h = 0; h < height; h++) if (solidAt(world, x, y + h, z)) return false;
  return true;
};

// ============================================================================
// farms
// ============================================================================
export function farm(world, lot, side, rng, G, plan) {
  const L = { x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1 };
  const I = { x0: L.x0 + 2, z0: L.z0 + 2, x1: L.x1 - 2, z1: L.z1 - 2 };
  if (I.x1 - I.x0 + 1 < 3 || I.z1 - I.z0 + 1 < 3) return null;

  // clear the lot above ground
  for (let z = L.z0; z <= L.z1; z++)
    for (let x = L.x0; x <= L.x1; x++)
      for (let y = G + 1; y <= G + 4; y++) world.clear(x, y, z);

  // entrance: two cells in the middle of the street side
  const gate = [];
  if (side === 'north' || side === 'south') {
    const gz = side === 'north' ? L.z0 : L.z1, mx = Math.floor((L.x0 + L.x1) / 2);
    gate.push([mx, gz], [mx + 1, gz]);
  } else {
    const gx = side === 'west' ? L.x0 : L.x1, mz = Math.floor((L.z0 + L.z1) / 2);
    gate.push([gx, mz], [gx, mz + 1]);
  }
  const isGate = (x, z) => gate.some((g) => g[0] === x && g[1] === z);

  // outer ring: hedge on grass; inner ring: dirt path
  for (let z = L.z0; z <= L.z1; z++) {
    for (let x = L.x0; x <= L.x1; x++) {
      const outer = x === L.x0 || x === L.x1 || z === L.z0 || z === L.z1;
      const inner = !outer && (x === L.x0 + 1 || x === L.x1 - 1 || z === L.z0 + 1 || z === L.z1 - 1);
      if (outer) {
        if (isGate(x, z)) { world.set(x, G, z, MAT.GRASS_PATH); }
        else { world.set(x, G, z, MAT.GRASS); world.set(x, G + 1, z, MAT.LEAVES); }
      } else if (inner) {
        world.set(x, G, z, MAT.GRASS_PATH);
      }
    }
  }

  // irrigation channels down the long axis; every farmland cell within 4 of water
  const alongX = (I.x1 - I.x0) >= (I.z1 - I.z0);
  const across = alongX ? I.z1 - I.z0 + 1 : I.x1 - I.x0 + 1;
  const n = Math.ceil(across / 9);
  const chan = new Set();
  for (let k = 0; k < n; k++) chan.add(Math.floor((k + 0.5) * across / n));

  let water = 0, crops = 0;
  const bandCrop = new Map();
  for (let z = I.z0; z <= I.z1; z++) {
    for (let x = I.x0; x <= I.x1; x++) {
      const a = alongX ? z - I.z0 : x - I.x0;
      const u = alongX ? x - I.x0 : z - I.z0;
      if (chan.has(a)) { world.set(x, G, z, MAT.WATER); water++; continue; }
      world.set(x, G, z, MAT.FARMLAND);
      // crop kind per strip (between channels) and per 6-cell run along it
      let band = 0; for (const c of chan) if (a > c) band++;
      const key = band * 1000 + Math.floor(u / 6);
      if (!bandCrop.has(key)) bandCrop.set(key, rng.pick(CROP_KINDS));
      world.set(x, G + 1, z, cropId(bandCrop.get(key), rng.int(3, 7)));
      crops++;
    }
  }

  // composter (farmer's workstation) on the path, in a corner by the entrance
  let comp;
  if (side === 'north') comp = [L.x0 + 1, L.z0 + 1];
  else if (side === 'south') comp = [L.x0 + 1, L.z1 - 1];
  else if (side === 'west') comp = [L.x0 + 1, L.z0 + 1];
  else comp = [L.x1 - 1, L.z0 + 1];
  world.set(comp[0], G + 1, comp[1], MAT.COMPOSTER);
  // hay bales stacked in the two inner corners on the far side
  const far = (side === 'north' || side === 'west')
    ? [[L.x1 - 1, L.z1 - 1], side === 'north' ? [L.x0 + 1, L.z1 - 1] : [L.x1 - 1, L.z0 + 1]]
    : [[L.x0 + 1, L.z0 + 1], side === 'south' ? [L.x1 - 1, L.z0 + 1] : [L.x0 + 1, L.z1 - 1]];
  for (const [hx, hz] of far) {
    if (hx === comp[0] && hz === comp[1]) continue;
    world.set(hx, G + 1, hz, MAT.HAY);
    if (rng.chance(0.6)) world.set(hx, G + 2, hz, MAT.HAY);
  }

  if (plan) {
    for (let z = L.z0; z <= L.z1; z++)
      for (let x = L.x0; x <= L.x1; x++)
        if (x >= 0 && z >= 0 && x < plan.W && z < plan.D) plan.use[z * plan.W + x] = USE_FARM;
  }
  return { ...L, side, water, crops, channels: n, composter: comp };
}

// ============================================================================
// ponds (in parks)
// ============================================================================
// Park paths cross at (cx, cz). The pond sits in the largest quadrant, with at
// least one ring of grass between it and both the path and the park edge.
export function pond(world, lot, cx, cz, rng, G) {
  const quads = [
    { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: cx - 2, z1: cz - 2 },
    { x0: cx + 2, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: cz - 2 },
    { x0: lot.x0 + 1, z0: cz + 2, x1: cx - 2, z1: lot.z1 - 1 },
    { x0: cx + 2, z0: cz + 2, x1: lot.x1 - 1, z1: lot.z1 - 1 },
  ].filter((q) => q.x1 - q.x0 + 1 >= 4 && q.z1 - q.z0 + 1 >= 4);
  if (!quads.length) return null;
  quads.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
  const q = quads[rng.int(0, Math.min(1, quads.length - 1))];
  const mx = (q.x0 + q.x1) / 2, mz = (q.z0 + q.z1) / 2;
  const rx = (q.x1 - q.x0) / 2 - 0.3, rz = (q.z1 - q.z0) / 2 - 0.3;
  let cells = 0;
  for (let z = q.z0 + 1; z <= q.z1 - 1; z++) {
    for (let x = q.x0 + 1; x <= q.x1 - 1; x++) {
      const dx = (x - mx) / rx, dz = (z - mz) / rz;
      if (dx * dx + dz * dz > 1) continue;
      world.set(x, G - 1, z, MAT.CLAY);
      world.set(x, G, z, MAT.WATER);
      for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z);
      cells++;
    }
  }
  if (!cells) return null;
  // flowers on the bank
  for (let z = q.z0; z <= q.z1; z++) {
    for (let x = q.x0; x <= q.x1; x++) {
      if (world.get(x, G, z) !== MAT.GRASS || world.has(x, G + 1, z)) continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => world.get(x + a, G, z + b) === MAT.WATER);
      if (nearWater && rng.chance(0.35)) world.set(x, G + 1, z, rng.pick(FLOWERS));
    }
  }
  return { ...q, cells };
}

// flowers scattered on open grass inside a rectangle
export function scatterFlowers(world, r, chance, rng, G) {
  for (let z = r.z0; z <= r.z1; z++)
    for (let x = r.x0; x <= r.x1; x++)
      if (world.get(x, G, z) === MAT.GRASS && !world.has(x, G + 1, z) && rng.chance(chance))
        world.set(x, G + 1, z, rng.pick(FLOWERS));
}

// ============================================================================
// interiors
// ============================================================================
const ROOMS = {
  kitchen:   ['craft', 'furnace', 'smoker', 'chest', 'plant', 'shelf', 'barrel', 'lamp', 'bed', 'plant'],
  bedroom:   ['bed', 'plant', 'chest', 'bed', 'shelf', 'lamp', 'bed', 'rug', 'plant'],
  apartment: ['bed', 'craft', 'furnace', 'plant', 'bed', 'chest', 'shelf', 'lamp', 'barrel', 'bed', 'plant'],
  shop:      ['station', 'plant', 'craft', 'station', 'chest', 'station', 'lamp', 'shelf', 'station', 'plant'],
  lobby:     ['plant', 'shelf', 'lamp', 'plant', 'plant', 'shelf'],
  office:    ['shelf', 'lectern', 'station', 'plant', 'craft', 'shelf', 'lamp', 'chest', 'plant'],
  library:   ['shelf', 'shelf', 'lectern', 'shelf', 'plant', 'shelf', 'lamp', 'shelf', 'rug'],
  hall:      ['plant', 'shelf', 'lamp', 'plant', 'chest', 'plant', 'shelf'],
  living:    ['plant', 'shelf', 'lamp', 'rug', 'chest', 'plant', 'shelf', 'lamp'],
  studio:    ['bed', 'craft', 'furnace', 'plant', 'chest', 'lamp', 'shelf'],
  classroom: ['lectern', 'shelf', 'plant', 'shelf', 'chest', 'lamp', 'shelf', 'plant'],
  chapel:    ['plant', 'lamp', 'plant', 'plant'],
};
// in rooms (0.3.0) kitchens cook and bedrooms sleep
ROOMS.kitchen = ['craft', 'furnace', 'smoker', 'barrel', 'chest', 'plant', 'lamp', 'shelf'];
ROOMS.bedroom = ['bed', 'chest', 'plant', 'bed', 'lamp', 'rug', 'shelf'];
// every villager profession's workstation appears somewhere
const STATIONS = ['cartography', 'fletching', 'blast', 'brewing', 'cauldron', 'barrel',
  'smoker', 'lectern', 'stonecutter', 'loom', 'grindstone', 'smithing'];

function roomFor(style, k, floors, rng) {
  if (style === 'house') return (k === 0) ? (floors === 1 ? 'apartment' : 'kitchen') : 'bedroom';
  if (style === 'mid') return k === 0 ? 'shop' : 'apartment';
  if (k === 0) return 'lobby';
  const r = k % 4;
  return r === 1 ? 'apartment' : r === 2 ? 'office' : r === 3 ? 'apartment' : (rng.chance(0.5) ? 'library' : 'office');
}

const DIRNAME = (dx, dz) => (dx === 1 ? 'east' : dx === -1 ? 'west' : dz === 1 ? 'south' : 'north');

export function furnish(world, rec, rng, opts = {}) {
  const placed = [];
  const beds = [];
  let stations = 0, plants = 0, shelves = 0;
  const put = (x, y, z, id) => { world.set(x, y, z, id); placed.push([x, y, z]); };
  const core = rec.core;
  const nearCore = (x, z) => core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1;
  const doorCells = rec.doorCells || [[rec.door.x, rec.door.z]];
  const nearDoor = (x, z, k) => k === 0 && doorCells.some(([a, b]) => Math.abs(x - a) <= 2 && Math.abs(z - b) <= 2);

  // ---- rooms: inside walls and doors first (landmarks keep their open halls)
  const plans = [];
  const useRooms = opts.rooms !== false && !rec.rooms && rec.theme;
  if (useRooms) {
    for (let k = 0; k < rec.floors; k++) {
      const plan = planRooms(rec, k, rng);
      if (plan) { buildRooms(world, rec, k, plan, rec.theme, put); plans[k] = plan; }
    }
  }

  // ---- furniture along a ring of cells: [x, z, inwardX, inwardZ, side]
  const ringOf = (x0, z0, x1, z1) => {
    const ring = [];
    for (let x = x0; x <= x1; x++) ring.push([x, z0, 0, 1, 0]);
    for (let z = z0 + 1; z <= z1; z++) ring.push([x1, z, -1, 0, 1]);
    for (let x = x1 - 1; x >= x0; x--) ring.push([x, z1, 0, -1, 2]);
    for (let z = z1 - 1; z >= z0 + 1; z--) ring.push([x0, z, 1, 0, 3]);
    return ring;
  };
  const place = (ring, plan, free, sy, k, onlyOne = false) => {
    const y = sy + 1;
    let step = onlyOne ? 0 : rng.int(0, plan.length - 1);
    for (let i = 0; i < ring.length; i++) {
      const [x, z, nx, nz, side] = ring[i];
      if (!free(x, z)) continue;
      const item = plan[step % plan.length];
      if (item === 'bed') {
        const nb = ring[i + 1];
        if (!nb || nb[4] !== side || !free(nb[0], nb[1])) {
          if (onlyOne) continue;            // keep looking for a spot that fits
          // no room for a bed here: put the next piece in this cell instead
          step++;
          if (plan[step % plan.length] !== 'bed') i--;
          continue;
        }
        const vx = nb[0] - x, vz = nb[1] - z;
        const dir = BED_VEC.findIndex(([a, b]) => a === vx && b === vz);
        const color = rng.pick(BED_COLORS);
        put(x, y, z, bedId(dir, false));
        put(nb[0], y, nb[1], bedId(dir, true));
        world.setData(x, y, z, { id: 'Bed', bytes: { color } });
        world.setData(nb[0], y, nb[1], { id: 'Bed', bytes: { color } });
        beds.push({ foot: [x, y, z], head: [nb[0], y, nb[1]], dir, inward: [nx, nz], floor: k });
        if (onlyOne) return true;
        i += 2;                       // bed + one clear cell
      } else if (item === 'rug') {
        // a carpet one cell in from the wall: walkable, purely decoration
        const rx = x + nx, rz = z + nz;
        if (free(rx, rz, true) && !world.has(rx, y, rz)) put(rx, y, rz, rng.pick(CARPETS));
        i += 1;
      } else {
        if (item === 'craft') put(x, y, z, MAT.CRAFTING);
        else if (item === 'furnace') put(x, y, z, furnaceId('furnace', DIRNAME(nx, nz)));
        else if (item === 'barrel') put(x, y, z, MAT.BARREL);
        else if (item === 'shelf') {
          put(x, y, z, MAT.BOOKSHELF);
          if (rec.pitch >= 5 && !world.has(x, y + 1, z)) put(x, y + 1, z, MAT.BOOKSHELF);
          shelves++;
        } else if (item === 'plant') {
          put(x, y, z, MAT.PLANTER);                 // its own soil: stays grass in every city style
          put(x, y + 1, z, rng.chance(0.3) ? (rng.chance(0.5) ? MAT.AZALEA : MAT.AZALEA_FL) : rng.pick(FLOWERS));
          plants++;
        } else if (item === 'station') {
          const s = rng.pick(STATIONS), f = DIRNAME(nx, nz);
          const id = s === 'cartography' ? MAT.CARTOGRAPHY : s === 'fletching' ? MAT.FLETCHING
            : s === 'blast' ? furnaceId('blast', f) : s === 'brewing' ? MAT.BREWING
            : s === 'cauldron' ? MAT.CAULDRON : s === 'smoker' ? smokerId(f)
            : s === 'lectern' ? lecternId(f) : s === 'stonecutter' ? stonecutterId(f)
            : s === 'loom' ? loomId(f) : s === 'grindstone' ? grindstoneId(f)
            : s === 'smithing' ? MAT.SMITHING : MAT.BARREL;
          put(x, y, z, id);
          stations++;
        } else if (item === 'smoker') { put(x, y, z, smokerId(DIRNAME(nx, nz))); stations++; }
        else if (item === 'lectern') { put(x, y, z, lecternId(DIRNAME(nx, nz))); stations++; }
        else if (item === 'chest') put(x, y, z, chestId(DIRNAME(nx, nz)));
        else if (item === 'lamp') { put(x, y, z, MAT.BARREL); put(x, y + 1, z, MAT.LAMP); }
        i += 1;                       // leave a gap after every piece
      }
      if (onlyOne) return true;
      step++;
    }
    return false;
  };

  // Rows of desks and chairs facing the lectern: from the lectern's wall a
  // front aisle, then desk / chair / aisle, repeating; the end cells of every
  // row stay clear as side aisles. Chairs are stairs with their backs away
  // from the lectern; desks are top slabs.
  const desks = [];
  const classroomDesks = (rm, sy, free, allDoors) => {
    const y = sy + 1;
    let lec = null;
    for (let z = rm.z0; z <= rm.z1 && !lec; z++) for (let x = rm.x0; x <= rm.x1 && !lec; x++) {
      const id = world.get(x, y, z);
      if (id >= 0 && MATERIALS.def(id).block === 'minecraft:lectern') lec = [x, z];
    }
    if (!lec) return;
    // the lectern's wall: which side of the room it stands against
    const n = lec[1] === rm.z0 ? [0, 1] : lec[1] === rm.z1 ? [0, -1] : lec[0] === rm.x0 ? [1, 0] : [-1, 0];
    const alongX = n[0] === 0;                          // rows run along x when the lectern is on a north/south wall
    const depth = alongX ? rm.z1 - rm.z0 + 1 : rm.x1 - rm.x0 + 1;
    const span = alongX ? [rm.x0 + 1, rm.x1 - 1] : [rm.z0 + 1, rm.z1 - 1];
    const back = alongX ? (n[1] > 0 ? WEIRDO.south : WEIRDO.north) : (n[0] > 0 ? WEIRDO.east : WEIRDO.west);
    const wallC = alongX ? (n[1] > 0 ? rm.z0 : rm.z1) : (n[0] > 0 ? rm.x0 : rm.x1);
    const cellAt = (dist, u) => (alongX ? [u, wallC + n[1] * dist] : [wallC + n[0] * dist, u]);
    // a front aisle when the room is deep enough; the chair row never on the back wall
    for (let dist = depth >= 6 ? 2 : 1; dist + 1 <= depth - 2; dist += 3) {
      for (let u = span[0] + 1; u <= span[1] - 1; u++) {
        const [dx, dz] = cellAt(dist, u), [cx, cz] = cellAt(dist + 1, u);
        if (!free(dx, dz) || !free(cx, cz)) continue;
        if (allDoors.some(([a, b]) => Math.abs(a - dx) + Math.abs(b - dz) <= 2 || Math.abs(a - cx) + Math.abs(b - cz) <= 2)) continue;
        world.set(dx, y, dz, MAT.DESK); placed.push([dx, y, dz]); desks.push([dx, y, dz]);
        world.set(cx, y, cz, stairId('oak', back)); placed.push([cx, y, cz]); desks.push([cx, y, cz]);
      }
    }
  };

  // Paintings on the walls of a room: the biggest that fits a clear patch of
  // wall at eye level, with solid wall behind every block of it. A painting is
  // an entity, so it travels with the villagers in the mob structures; its
  // position is its centre, a whisker off the wall face.
  const paintings = [];
  const DIRS = [['south', 0, 0, 1], ['west', 1, -1, 0], ['north', 2, 0, -1], ['east', 3, 1, 0]];
  const PAINTINGS_PER_BUILDING = 8;
  const hangPaintings = (rm, sy, rng2) => {
    // a painting is an entity, so a city's worth of them adds up: one to a
    // room, two now and then, and only so many to a building
    if (paintings.length >= PAINTINGS_PER_BUILDING || rng2() > 0.6) return;
    const wanted = rng2() < 0.25 ? 2 : 1;
    let hung = 0;
    const y0 = sy + 2;                                     // eye level and up
    const top = sy + rec.pitch - 1;
    const solid = (x, y, z) => { const id = world.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
    const empty = (x, y, z) => world.get(x, y, z) === -1;
    const sizes = PAINTINGS.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h));
    for (const [side, dir, nx, nz] of rng2.shuffle ? rng2.shuffle(DIRS.slice()) : DIRS) {
      if (hung >= wanted) break;
      // the wall on this side of the room, and the cells inside it
      const alongX = nx === 0;
      const wallC = nx ? (nx > 0 ? rm.x1 + 1 : rm.x0 - 1) : (nz > 0 ? rm.z1 + 1 : rm.z0 - 1);
      const lo = alongX ? rm.x0 : rm.z0, hi = alongX ? rm.x1 : rm.z1;
      for (const { motif, w, h } of sizes) {
        if (rng2() > 0.45) continue;
        if (y0 + h - 1 > top - 1 || w > hi - lo + 1) continue;
        const start = lo + Math.floor(rng2() * (hi - lo + 2 - w));
        let ok = true;
        for (let i = 0; i < w && ok; i++)
          for (let j = 0; j < h && ok; j++) {
            const u = start + i, y = y0 + j;
            const [ix, iz] = alongX ? [u, wallC - nz] : [wallC - nx, u];      // the cell inside the room
            const [wx, wz] = alongX ? [u, wallC] : [wallC, u];                // the wall behind it
            if (!empty(ix, y, iz) || !solid(wx, y, wz)) ok = false;
            if (paintings.some((p) => p.cells.has(ix + ',' + y + ',' + iz))) ok = false;
          }
        if (!ok) continue;
        // the centre of the painting, 1/32 off the face of the wall
        const cells = new Set();
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
          const u = start + i, y = y0 + j;
          const [ix, iz] = alongX ? [u, wallC - nz] : [wallC - nx, u];
          cells.add(ix + ',' + y + ',' + iz);
        }
        // the wall's face on the room side, and the way the painting looks:
        // back into the room, the opposite of the way the wall lies
        const face = nx ? (nx > 0 ? wallC : wallC + 1) : (nz > 0 ? wallC : wallC + 1);
        const facing = (dir + 2) % 4;
        const fx = -nx, fz = -nz;
        const cu = start + w / 2, cy = y0 + h / 2;
        const pos = alongX ? [cu, cy, face + fz * 0.03125] : [face + fx * 0.03125, cy, cu];
        const anchor = alongX ? [start, y0, wallC - nz] : [wallC - nx, y0, start];
        paintings.push({ type: 'painting', motif, direction: facing, pos, h, face,
          x: anchor[0], y: anchor[1], z: anchor[2], cells });
        hung++;
        break;                                              // one painting per wall
      }
    }
  };

  // A shop at street level: a glass front between the piers, an awning over
  // the pavement, a counter inside, and a sign on the pier with its name.
  const SHOPS = ['Bakery', 'Butcher', 'Grocer', 'Florist', 'Tailor', 'Bookshop', 'Apothecary', 'Cobbler',
    'Tea House', 'Toy Shop', 'Fishmonger', 'Barber', 'Cafe', 'Hardware', 'Sweet Shop', 'Cheesemonger'];
  const shopFronts = [];
  const shopFront = (rm, sy, rng2) => {
    const face = rec.facing, [ox, oz] = OUTWARD[face];
    const r0 = rec.rects[0];
    // the room's cells along the street wall
    const cells = [];
    if (face === 'south' && rm.z1 === r0.z1 - 1) for (let x = rm.x0; x <= rm.x1; x++) cells.push([x, r0.z1]);
    else if (face === 'north' && rm.z0 === r0.z0 + 1) for (let x = rm.x0; x <= rm.x1; x++) cells.push([x, r0.z0]);
    else if (face === 'east' && rm.x1 === r0.x1 - 1) for (let z = rm.z0; z <= rm.z1; z++) cells.push([r0.x1, z]);
    else if (face === 'west' && rm.x0 === r0.x0 + 1) for (let z = rm.z0; z <= rm.z1; z++) cells.push([r0.x0, z]);
    if (cells.length < 3) return;
    const doorCells = rec.doorCells || [];
    const isDoor = (x, z) => doorCells.some(([a, b]) => a === x && b === z);
    const win = cells.filter(([x, z]) => !isDoor(x, z));
    if (win.length < 3) return;
    const glassCells = win.slice(1, -1).length >= 2 ? win.slice(1, -1) : win;
    for (const [x, z] of glassCells) {
      for (let y = sy + 1; y <= sy + 2; y++) world.set(x, y, z, rec.theme.glass);   // a proper shop window
      const ax = x + ox, az = z + oz;
      if (!world.has(ax, sy + 3, az)) put(ax, sy + 3, az, stairId(rec.theme.stair, DIRNAME(-ox, -oz) === 'north' ? WEIRDO.north
        : DIRNAME(-ox, -oz) === 'south' ? WEIRDO.south : DIRNAME(-ox, -oz) === 'east' ? WEIRDO.east : WEIRDO.west, true));  // awning
    }
    // counter just inside the window
    const mid = glassCells[Math.floor(glassCells.length / 2)];
    for (const d of [-1, 0, 1]) {
      const cxx = mid[0] - ox + (oz ? d : 0), czz = mid[1] - oz + (ox ? d : 0);
      if (cxx < rm.x0 || cxx > rm.x1 || czz < rm.z0 || czz > rm.z1) continue;
      if (!world.has(cxx, sy + 1, czz)) put(cxx, sy + 1, czz, MAT.DESK);
    }
    // the name, on a pier beside the window
    const name = rng2.pick(SHOPS);
    for (const [x, z] of [win[0], win[win.length - 1]]) {
      const ax = x + ox, az = z + oz;
      if (world.has(ax, sy + 2, az) || world.has(x, sy + 2, z) === false) {
        if (world.has(ax, sy + 2, az)) continue;
      }
      if (!world.has(x, sy + 2, z)) continue;                    // needs a solid pier behind it
      put(ax, sy + 2, az, wallSignId(face));
      world.setData(ax, sy + 2, az, { id: 'Sign', tags: signTags(name) });
      shopFronts.push({ name, at: [ax, sy + 2, az], room: rm.type });
      break;
    }
  };

  for (let k = 0; k < rec.floors; k++) {
    const r = rec.rects[k];
    const sy = rec.floorYs[k], y = sy + 1;
    const open = (x, z) => solidAt(world, x, sy, z) && !world.has(x, y, z) && !world.has(x, y + 1, z);
    if (plans[k]) {
      // each room against its own walls, clear of every doorway (inside or out)
      const allDoors = plans[k].doors.map((d) => [d.x, d.z]);
      for (const rm of plans[k].rooms) {
        const byDoor = (x, z) => allDoors.some(([a, b]) => Math.abs(a - x) <= 1 && Math.abs(b - z) <= 1);
        const free = (x, z) => x >= rm.x0 && x <= rm.x1 && z >= rm.z0 && z <= rm.z1 &&
          !byDoor(x, z) && !nearDoor(x, z, k) && !nearCore(x, z) && open(x, z);
        let ring = ringOf(rm.x0, rm.z0, rm.x1, rm.z1);
        // A narrow room (two deep) keeps the row by its entrance clear as an
        // aisle: furniture only along the other row.
        const thinX = rm.x1 - rm.x0 <= 1, thinZ = rm.z1 - rm.z0 <= 1;
        if (thinX || thinZ) {
          const [dx, dz] = rm.doors[0] || [rm.x0, rm.z0];
          const aisle = thinZ ? Math.max(rm.z0, Math.min(rm.z1, dz)) : Math.max(rm.x0, Math.min(rm.x1, dx));
          ring = ring.filter((c) => (thinZ ? c[1] : c[0]) !== aisle);
        }
        // the piece that makes the room what it is goes in first
        const must = rm.type === 'bedroom' || rm.type === 'studio' ? 'bed' : rm.type === 'kitchen' ? 'craft'
          : rm.type === 'classroom' ? 'lectern' : null;
        if (must && !place(ring, [must], free, sy, k, true) && must === 'bed') rm.type = 'living';   // too cramped for a bed: a sitting room
        if (rm.type === 'classroom') classroomDesks(rm, sy, free, allDoors);
        if (rm.type === 'shop' && k === 0) shopFront(rm, sy, rng);
        place(ring, ROOMS[rm.type] || ROOMS.office, free, sy, k);
        hangPaintings(rm, sy, rng);                         // last, so nothing is hung where a shelf goes
      }
    } else {
      const ix0 = r.x0 + 1, iz0 = r.z0 + 1, ix1 = r.x1 - 1, iz1 = r.z1 - 1;
      if (ix1 - ix0 < 2 || iz1 - iz0 < 2) continue;
      const free = (x, z) => !nearCore(x, z) && !nearDoor(x, z, k) && open(x, z);
      const plan = ROOMS[rec.rooms ? rec.rooms(k) : roomFor(rec.style, k, rec.floors, rng)];   // landmarks choose their own
      place(ringOf(ix0, iz0, ix1, iz1), plan, free, sy, k);
      if (plan === ROOMS.library) {
        // freestanding shelf rows in the middle: three-long stacks, two-wide aisles
        const inner = (x, z) => x >= ix0 + 2 && x <= ix1 - 2 && z >= iz0 + 2 && z <= iz1 - 2;
        // a stack keeps clear of the stairs' ring by a block, and nothing but
        // other shelves may stand next to it (so the aisles stay open)
        const nearStairs = (x, z) => core && x >= core.x0 - 2 && x <= core.x1 + 2 && z >= core.z0 - 2 && z <= core.z1 + 2;
        const clearAround = (x, z) => {
          if (nearStairs(x, z)) return false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const id = world.get(x + dx, y, z + dz);
            if (id !== -1 && !/bookshelf/.test(MATERIALS.def(id).block)) return false;
          }
          return true;
        };
        for (let z = iz0 + 2; z <= iz1 - 2; z += 3)
          for (let x = ix0 + 2; x <= ix1 - 2; x++) {
            if ((x - ix0 - 2) % 4 === 3) continue;                   // a gap every three shelves
            if (!inner(x, z) || !free(x, z) || !clearAround(x, z)) continue;
            put(x, y, z, MAT.BOOKSHELF); shelves++;
          }
      }
    }
  }

  // re-verify: rooms and furniture must never cost a floor, or a room
  let v = verifyBuilding(world, rec);
  let roomsOk = !plans.length || roomsReachable(world, rec, plans);
  if ((!v.ok || !roomsOk) && desks.length) {
    // desks first: take them out and look again before giving up on the rooms
    for (const [x, y, z] of desks) world.clear(x, y, z);
    const gone = new Set(desks.map((c) => c.join()));
    for (let i = placed.length - 1; i >= 0; i--) if (gone.has(placed[i].join())) placed.splice(i, 1);
    desks.length = 0;
    v = verifyBuilding(world, rec);
    roomsOk = !plans.length || roomsReachable(world, rec, plans);
  }
  if (!v.ok || !roomsOk) {
    paintings.length = 0;                                   // nothing hangs in a building that gets its rooms taken out
    for (const [x, y, z] of placed.reverse()) world.clear(x, y, z);
    if (useRooms && plans.some(Boolean)) return furnish(world, rec, rng, { ...opts, rooms: false });   // open plan instead
    return { ok: false, beds: [], placed: 0, stations: 0, plants: 0, shelves: 0, rooms: [] };
  }
  const rooms = [];
  plans.forEach((p, k) => { if (p) for (const rm of p.rooms) rooms.push({ ...rm, floor: k }); });
  rec.roomPlans = plans;
  return { ok: true, beds, placed: placed.length, stations, plants, shelves, rooms, desks: desks.length / 2, shops: shopFronts,
    paintings: paintings.map(({ cells, ...p }) => p) };
}

// Walk from the front door (up only onto stairs, down up to three, through
// doors) and check every room has a floor cell that can be reached.
function roomsReachable(world, rec, plans) {
  const passable = (x, y, z) => { const id = world.get(x, y, z); return id === -1 || MATERIALS.isPassable(id); };
  const stand = (x, y, z) => solidAt(world, x, y - 1, z) && passable(x, y, z) && passable(x, y + 1, z);
  const r0 = rec.rects[0];
  const inB = (x, z) => x >= r0.x0 - 1 && x <= r0.x1 + 1 && z >= r0.z0 - 1 && z <= r0.z1 + 1;
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const seen = new Set([key(...rec.outside)]), q = [rec.outside];
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = q[h];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inB(nx, nz)) continue;
      for (const ny of [y + 1, y, y - 1, y - 2, y - 3]) {
        // stepping up only onto a stair: no hopping over furniture
        if (ny === y + 1) {
          if (!passable(x, y + 2, z)) continue;
          const f = world.get(nx, y, nz);
          if (f < 0 || !/_stairs$/.test(MATERIALS.def(f).block)) continue;
        }
        if (ny < y) { let clear = true; for (let yy = ny + 2; yy <= y + 1; yy++) if (!passable(nx, yy, nz)) clear = false; if (!clear) continue; }
        if (!stand(nx, ny, nz)) continue;
        const k2 = key(nx, ny, nz);
        if (!seen.has(k2)) { seen.add(k2); q.push([nx, ny, nz]); }
        break;
      }
    }
  }
  for (let k = 0; k < plans.length; k++) {
    if (!plans[k]) continue;
    const y = rec.floorYs[k] + 1;
    for (const rm of plans[k].rooms) {
      let ok = false;
      for (let z = rm.z0; z <= rm.z1 && !ok; z++) for (let x = rm.x0; x <= rm.x1 && !ok; x++) if (seen.has(key(x, y, z))) ok = true;
      if (!ok) return false;
    }
  }
  return true;
}

// villager spawn next to each bed (the cell in front of its foot)
export function bedSpawns(world, beds) {
  const out = [];
  for (const b of beds) {
    const [x, y, z] = b.foot;
    const sx = x + b.inward[0], sz = z + b.inward[1];
    if (standable(world, sx, y, sz)) out.push({ type: 'villager', x: sx, y, z: sz });
  }
  return out;
}

// ============================================================================
// the village: a bell to gather at, golems on the street
// ============================================================================
export function placeBell(world, plan, G0, elevAt = () => 0) {
  // prefer a plaza, then a park crossing
  for (const kind of [USE.PLAZA, USE.PARK]) {
    for (const lot of plan.lots) {
      if (lot.kind !== kind) continue;
      const cx = Math.round((lot.x0 + lot.x1) / 2), cz = Math.round((lot.z0 + lot.z1) / 2);
      for (const [dx, dz] of [[3, 3], [-3, 3], [3, -3], [-3, -3], [2, 2], [1, 1]]) {
        const x = cx + dx, z = cz + dz;
        if (x <= lot.x0 || x >= lot.x1 || z <= lot.z0 || z >= lot.z1) continue;
        const G = G0 + elevAt(x, z);
        if (world.has(x, G + 1, z) || !solidAt(world, x, G, z) || world.get(x, G, z) === MAT.WATER) continue;
        world.set(x, G + 1, z, MAT.BELL);
        return [x, G + 1, z];
      }
    }
  }
  return null;
}

// Golems: outdoors only — on pavement or plaza, three clear cells tall, never
// inside any building footprint, spread out across the city.
export function golemSpawns(world, plan, buildings, count, rng, G, elevAt = () => 0) {
  if (count <= 0) return [];
  const { W, D, use } = plan;
  const inside = (x, z) => buildings.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1);
  const cand = [];
  for (let z = 1; z < D - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      const u = use[z * W + x];
      if (u !== USE.SIDEWALK && u !== USE.PLAZA) continue;
      if (inside(x, z)) continue;
      if (!standable(world, x, G + elevAt(x, z) + 1, z, 3)) continue;
      cand.push([x, z]);
    }
  }
  rng.shuffle(cand);
  const out = [];
  const minGap = Math.max(8, Math.floor(Math.sqrt((W * D) / Math.max(1, count)) * 0.6));
  for (const [x, z] of cand) {
    if (out.length >= count) break;
    if (out.some((g) => Math.abs(g.x - x) + Math.abs(g.z - z) < minGap)) continue;
    out.push({ type: 'golem', x, y: G + elevAt(x, z) + 1, z });
  }
  return out;
}

// ============================================================================
// animal pens: a fenced paddock with a gate on the street side, hay, a water
// trough, and a few cows, sheep, pigs or chickens
// ============================================================================
export const RANCH_ANIMALS = ['cow', 'sheep', 'pig', 'chicken'];
export function ranch(world, lot, side, rng, G, plan, kind = null) {
  const L = { x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1 };
  if (L.x1 - L.x0 + 1 < 7 || L.z1 - L.z0 + 1 < 7) return null;
  for (let z = L.z0; z <= L.z1; z++)
    for (let x = L.x0; x <= L.x1; x++) {
      for (let y = G + 1; y <= G + 4; y++) world.clear(x, y, z);
      world.set(x, G, z, MAT.GRASS);
    }
  let gate;
  if (side === 'north') gate = [Math.floor((L.x0 + L.x1) / 2), L.z0];
  else if (side === 'south') gate = [Math.floor((L.x0 + L.x1) / 2), L.z1];
  else if (side === 'west') gate = [L.x0, Math.floor((L.z0 + L.z1) / 2)];
  else gate = [L.x1, Math.floor((L.z0 + L.z1) / 2)];
  for (let z = L.z0; z <= L.z1; z++)
    for (let x = L.x0; x <= L.x1; x++) {
      if (!(x === L.x0 || x === L.x1 || z === L.z0 || z === L.z1)) continue;
      // two blocks high: animals cannot jump it even from on top of something
      if (x === gate[0] && z === gate[1]) world.set(x, G + 1, z, gateId(side));
      else { world.set(x, G + 1, z, MAT.FENCE); world.set(x, G + 2, z, MAT.FENCE); }
    }
  // hay and a water trough, kept a block clear of the fence so nothing can
  // use them as a step to get out
  const farX = (side === 'east') ? L.x0 + 2 : L.x1 - 2, farZ = (side === 'south') ? L.z0 + 2 : L.z1 - 2;
  world.set(farX, G + 1, farZ, MAT.HAY);
  if (rng.chance(0.5)) world.set(farX, G + 2, farZ, MAT.HAY);
  const tx = farX === L.x1 - 2 ? L.x0 + 2 : L.x1 - 2;
  world.set(tx, G + 1, farZ, MAT.CAULDRON_FULL);
  kind = kind || rng.pick(RANCH_ANIMALS);
  const cells = [];
  for (let z = L.z0 + 1; z <= L.z1 - 1; z++)
    for (let x = L.x0 + 1; x <= L.x1 - 1; x++)
      if (!world.has(x, G + 1, z) && !world.has(x, G + 2, z)) cells.push([x, z]);
  rng.shuffle(cells);
  // four to ten, by the size of the pen (chickens get a couple extra)
  const n = Math.min(cells.length, Math.max(4, Math.min(10, Math.floor(cells.length / 5))) + (kind === 'chicken' ? 2 : 0));
  const animals = cells.slice(0, n).map(([x, z]) => ({ type: kind, x, y: G + 1, z }));
  if (plan) {
    for (let z = L.z0; z <= L.z1; z++)
      for (let x = L.x0; x <= L.x1; x++)
        if (x >= 0 && z >= 0 && x < plan.W && z < plan.D) plan.use[z * plan.W + x] = USE_RANCH;
  }
  return { ...L, side, gate, kind, animals };
}

// ============================================================================
// panda grove: a fenced bamboo garden in one quarter of a park
// ============================================================================
export function pandaGrove(world, lot, cx, cz, rng, G, avoid) {
  const quads = [
    { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: cx - 2, z1: cz - 2, gate: 'east' },
    { x0: cx + 2, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: cz - 2, gate: 'west' },
    { x0: lot.x0 + 1, z0: cz + 2, x1: cx - 2, z1: lot.z1 - 1, gate: 'east' },
    { x0: cx + 2, z0: cz + 2, x1: lot.x1 - 1, z1: lot.z1 - 1, gate: 'west' },
  ].filter((q) => q.x1 - q.x0 + 1 >= 6 && q.z1 - q.z0 + 1 >= 6)
   .filter((q) => !avoid || q.x1 < avoid.x0 || q.x0 > avoid.x1 || q.z1 < avoid.z0 || q.z0 > avoid.z1);
  if (!quads.length) return null;
  const q = rng.pick(quads);
  // gate in the middle of the side facing the park's north-south path
  const gx = q.gate === 'east' ? q.x1 : q.x0, gz = Math.floor((q.z0 + q.z1) / 2);
  for (let z = q.z0; z <= q.z1; z++)
    for (let x = q.x0; x <= q.x1; x++) {
      for (let y = G + 1; y <= G + 6; y++) world.clear(x, y, z);
      world.set(x, G, z, MAT.GRASS);
      const edge = x === q.x0 || x === q.x1 || z === q.z0 || z === q.z1;
      if (edge) {
        if (x === gx && z === gz) world.set(x, G + 1, z, gateId(q.gate));
        else { world.set(x, G + 1, z, MAT.FENCE); world.set(x, G + 2, z, MAT.FENCE); }
      }
    }
  // bamboo stalks, leaving open ground for the pandas and a clear cell inside the gate
  const inX = q.gate === 'east' ? gx - 1 : gx + 1;
  const open = [];
  for (let z = q.z0 + 1; z <= q.z1 - 1; z++)
    for (let x = q.x0 + 1; x <= q.x1 - 1; x++) {
      if ((x === inX && z === gz) || !rng.chance(0.35)) { open.push([x, z]); continue; }
      const h = rng.int(3, 5);
      for (let i = 0; i < h; i++) {
        const leaves = i === h - 1 ? 'large_leaves' : i === h - 2 ? 'small_leaves' : 'no_leaves';
        world.set(x, G + 1 + i, z, bambooId(leaves));
      }
    }
  rng.shuffle(open);
  const pandas = open.filter(([x, z]) => !(x === inX && z === gz)).slice(0, rng.int(1, 2))
    .map(([x, z]) => ({ type: 'panda', x, y: G + 1, z }));
  return { ...q, pandas };
}

// cats: outdoors on pavement, plazas and park paths, spread out
export function catSpawns(world, plan, buildings, count, rng, G, elevAt = () => 0) {
  if (count <= 0) return [];
  const { W, D, use } = plan;
  const inside = (x, z) => buildings.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1);
  const cand = [];
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      const u = use[z * W + x];
      if (u !== USE.SIDEWALK && u !== USE.PLAZA) continue;
      if (inside(x, z) || !standable(world, x, G + elevAt(x, z) + 1, z)) continue;
      cand.push([x, z]);
    }
  rng.shuffle(cand);
  const out = [];
  for (const [x, z] of cand) {
    if (out.length >= count) break;
    if (out.some((c) => Math.abs(c.x - x) + Math.abs(c.z - z) < 10)) continue;
    out.push({ type: 'cat', x, y: G + elevAt(x, z) + 1, z });
  }
  return out;
}

