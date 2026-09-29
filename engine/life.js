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
  // A composter is a farmer's workstation, and only farmers harvest crops and
  // hand food to their neighbours — which is what villagers need before they
  // will breed. One to a farm left almost no farmers in a town, so the spare
  // corners take one too.
  for (const [ex, ez] of [[L.x1 - 1, L.z0 + 1], [L.x0 + 1, L.z1 - 1], [L.x1 - 1, L.z1 - 1]]) {
    if (ex === comp[0] && ez === comp[1]) continue;
    if (world.has(ex, G + 1, ez)) continue;
    world.set(ex, G + 1, ez, MAT.COMPOSTER);
  }
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
// A shop is fitted out for what its sign says (0.27): the list is walked round
// its walls like any room's
const SHOP_FIT = {
  'Bakery':       ['smoker', 'cake', 'furnace', 'hay', 'cake', 'barrel', 'hay'],
  'Butcher':      ['smoker', 'barrel', 'smoker', 'chest', 'barrel'],
  'Grocer':       ['barrel', 'composter', 'barrel', 'plant', 'chest', 'barrel'],
  'Florist':      ['plant', 'plant', 'composter', 'plant', 'plant', 'plant'],
  'Tailor':       ['loom', 'chest', 'loom', 'barrel', 'rug'],
  'Bookshop':     ['shelf', 'shelf', 'lectern', 'shelf', 'shelf'],
  'Apothecary':   ['brewing', 'cauldron', 'shelf', 'brewing', 'barrel'],
  'Cobbler':      ['craft', 'loom', 'chest', 'barrel'],
  'Tea House':    ['table', 'plant', 'table', 'barrel', 'table'],
  'Toy Shop':     ['chest', 'barrel', 'chest', 'plant', 'chest'],
  'Fishmonger':   ['barrel', 'smoker', 'barrel', 'cauldron', 'barrel'],
  'Barber':       ['cauldron', 'table', 'shelf', 'table'],
  'Cafe':         ['table', 'plant', 'table', 'barrel', 'table'],
  'Hardware':     ['grindstone', 'stonecutter', 'chest', 'anvil', 'barrel', 'chest'],
  'Sweet Shop':   ['cake', 'barrel', 'cake', 'chest', 'plant'],
  'Cheesemonger': ['barrel', 'barrel', 'chest', 'barrel'],
  'Smithy':       ['anvil', 'blast', 'smithing', 'grindstone', 'barrel', 'anvil'],
};
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
        // the trades (0.27)
        else if (item === 'hay') put(x, y, z, MAT.HAY);
        else if (item === 'cake') { put(x, y, z, MAT.DESK); if (!world.has(x, y + 1, z)) put(x, y + 1, z, MAT.CAKE); }   // on the counter
        else if (item === 'composter') put(x, y, z, MAT.COMPOSTER);
        else if (item === 'loom') { put(x, y, z, loomId(DIRNAME(nx, nz))); stations++; }
        else if (item === 'brewing') { put(x, y, z, MAT.BREWING); stations++; }
        else if (item === 'cauldron') { put(x, y, z, MAT.CAULDRON); stations++; }
        else if (item === 'grindstone') { put(x, y, z, grindstoneId(DIRNAME(nx, nz))); stations++; }
        else if (item === 'stonecutter') { put(x, y, z, stonecutterId(DIRNAME(nx, nz))); stations++; }
        else if (item === 'blast') { put(x, y, z, furnaceId('blast', DIRNAME(nx, nz))); stations++; }
        else if (item === 'smithing') { put(x, y, z, MAT.SMITHING); stations++; }
        else if (item === 'anvil') put(x, y, z, MAT.ANVIL);
        else if (item === 'table') {
          // a table against the wall, a chair drawn up to it on the room side
          put(x, y, z, MAT.DESK);
          const cx2 = x + nx, cz2 = z + nz;
          if (free(cx2, cz2, true) && !world.has(cx2, y, cz2)) put(cx2, y, cz2, stairId(rec.theme.stair, WEIRDO[DIRNAME(nx, nz)]));
        }
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

  // A school is one hall, not a warren of rooms: desks in rows down the
  // floor, facing a chalkboard across the front wall, the way a church faces
  // its altar. The upper floor is a gallery over the same hall.
  const schoolHall = (sy, k, allDoors, rows = 99) => {
    const r0 = rec.rects[k];
    // A hall is one room: the partitions that fence off the staircase come
    // down, shaft and all, so the whole floor sees the board. The steps
    // themselves stay — an open stair in the corner of the hall. With
    // ladders instead of stairs the shaft has to stand, since a ladder needs
    // a wall to hang on.
    const ladderInCore = (() => {
      const c0 = rec.core;
      if (!c0) return false;
      for (let y = sy; y <= sy + (rec.pitch || 5); y++)
        for (let z = c0.z0; z <= c0.z1; z++)
          for (let x = c0.x0; x <= c0.x1; x++) {
            const id = world.get(x, y, z);
            if (id >= 0 && /ladder/.test(MATERIALS.def(id).block)) return true;
          }
      return false;
    })();
    if (!ladderInCore && opts.useStairs !== false) {
      for (let y = sy + 1; y <= sy + (rec.pitch || 5) - 1; y++)
        for (let z = r0.z0 + 1; z <= r0.z1 - 1; z++)
          for (let x = r0.x0 + 1; x <= r0.x1 - 1; x++) {
            const id = world.get(x, y, z);
            if (id < 0) continue;
            const nm = MATERIALS.def(id).block;
            if (MATERIALS.isPassable(id) && !/_door$|ladder/.test(nm)) continue;
            // everything solid inside comes down except the steps themselves;
            // this runs before the hall is furnished, so nothing else is here
            if (/_stairs$/.test(MATERIALS.def(id).block)) continue;
            // a door in a wall that is coming down goes with it, both halves
            if (/_door$/.test(MATERIALS.def(id).block)) { world.clear(x, y, z); continue; }
            // a ladder hangs on a wall: take that wall away and the way
            // upstairs goes with it
            let holdsLadder = false;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nb = world.get(x + dx, y, z + dz);
              if (nb >= 0 && /ladder/.test(MATERIALS.def(nb).block)) { holdsLadder = true; break; }
            }
            if (holdsLadder) continue;
            world.clear(x, y, z);
          }
    }
    const face = rec.facing, [ox, oz] = OUTWARD[face];
    const inner = { x0: r0.x0 + 1, z0: r0.z0 + 1, x1: r0.x1 - 1, z1: r0.z1 - 1 };
    // The board goes on a side wall, not the wall facing the door: the stairs
    // stand against that one, and a flight across the board would hide it.
    // Of the two sides, the one clear of the staircase takes it, and the
    // class is turned a quarter to face it.
    const core = rec.core;
    const sideRuns = (wall) => {
      let free = 0;
      const [from, to] = oz !== 0 ? [inner.z0, inner.z1] : [inner.x0, inner.x1];
      for (let u = from; u <= to; u++) {
        const [x, z] = oz !== 0 ? [wall, u] : [u, wall];
        if (!world.has(x, sy + 2, z)) continue;
        if (core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1) continue;
        free++;
      }
      return free;
    };
    // the two walls at right angles to the front
    const sides = oz !== 0 ? [r0.x0, r0.x1] : [r0.z0, r0.z1];
    const wallC = sideRuns(sides[0]) >= sideRuns(sides[1]) ? sides[0] : sides[1];
    // the board's wall runs along z when the front runs along x, so the rows
    // of desks now run the other way
    const alongX = oz === 0;
    const lo = alongX ? inner.x0 : inner.z0, hi = alongX ? inner.x1 : inner.z1;
    const mid = Math.floor((lo + hi) / 2);
    const board = [];
    for (let u = mid - 2; u <= mid + 2; u++) {
      if (u < lo || u > hi) continue;
      for (let y = sy + 2; y <= sy + 3; y++) {
        const [bx, bz] = alongX ? [u, wallC] : [wallC, u];
        if (!world.has(bx, y, bz)) continue;                  // only onto a real wall
        if (allDoors && allDoors.has(bx + ',' + bz)) continue;
        world.set(bx, y, bz, MAT.DEEPSLATE);
        board.push([bx, y, bz]);
      }
    }
    // a lectern in front of the board, facing the desks
    const inward = alongX
      ? [0, wallC === r0.z0 ? 1 : -1]
      : [wallC === r0.x0 ? 1 : -1, 0];
    // the spot straight out from the middle of the board may be taken by the
    // stairs, so the lectern slides along until it finds a free one
    for (let off = 0; off <= 4; off++) {
      let placed = false;
      for (const u of off === 0 ? [mid] : [mid - off, mid + off]) {
        if (u < lo || u > hi) continue;
        const [lx, lz] = alongX ? [u, wallC + inward[1]] : [wallC + inward[0], u];
        if (world.has(lx, sy + 1, lz)) continue;
        world.set(lx, sy + 1, lz, lecternId(face));
        placed = true;
        break;
      }
      if (placed) break;
    }
    // the way to the stairs and the doors stays clear of furniture
    const blocked = (x, z) => {
      if (core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1) return true;
      return (rec.doorCells || []).some(([cx, cz]) => Math.abs(cx - x) + Math.abs(cz - z) <= 2);
    };
    // rows of desks, each with a seat behind it, all facing the board
    // a stair's facing is the way its back looks, so a pupil facing the board
    // sits with the stair turned away from it
    const seatDir = alongX
      ? (inward[1] > 0 ? WEIRDO.south : WEIRDO.north)
      : (inward[0] > 0 ? WEIRDO.east : WEIRDO.west);
    let desks = 0;
    const depthFrom = alongX ? inner.z0 : inner.x0, depthTo = alongX ? inner.z1 : inner.x1;
    const step = inward[0] + inward[1] > 0 ? 1 : -1;
    const start = step > 0 ? depthFrom + 2 : depthTo - 2;
    let row = 0;
    for (let d = start; d >= depthFrom && d <= depthTo && row < rows; d += step * 3, row++) {
      for (let u = lo + 1; u <= hi - 1; u += 2) {
        const [dx2, dz2] = alongX ? [u, d] : [d, u];
        if (world.has(dx2, sy + 1, dz2) || blocked(dx2, dz2)) continue;
        const [sx2, sz2] = alongX ? [u, d + step] : [d + step, u];
        if (blocked(sx2, sz2)) continue;
        world.set(dx2, sy + 1, dz2, MAT.DESK);
        if (!world.has(sx2, sy + 1, sz2)) world.set(sx2, sy + 1, sz2, stairId(rec.theme.stair, seatDir));
        desks++;
      }
    }
    return { board: board.length, desks, boardWall: wallC, alongX };
  };

  // A shop at street level: a glass front between the piers, an awning over
  // the pavement, a counter inside, and a sign on the pier with its name.
  const SHOPS = ['Bakery', 'Butcher', 'Grocer', 'Florist', 'Tailor', 'Bookshop', 'Apothecary', 'Cobbler',
    'Tea House', 'Toy Shop', 'Fishmonger', 'Barber', 'Cafe', 'Hardware', 'Sweet Shop', 'Cheesemonger', 'Smithy'];
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
    // an arcade is already the shop window: its piers and bays are left as built
    const arcaded = new Set((rec.arcade && rec.arcade.cells) || []);
    for (const [x, z] of glassCells) {
      if (!arcaded.has(x + ',' + z)) for (let y = sy + 1; y <= sy + 2; y++) world.set(x, y, z, rec.theme.glass);   // a proper shop window
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
    // the name, on a pier beside the window (chosen by the caller, so the
    // fit-out inside can follow it)
    const name = rm.shopName || rng2.pick(SHOPS);
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

  // ---- the hearth (houses): under the chimney, on the ground floor, a lit fire
  // in the corner with a brick jamb beside it and brick over it; then a brick
  // chimney breast up that corner through every floor to the stack on the roof.
  // Only into empty cells: never through a slab, a stair or a door.
  let fireplace = null;
  const buildHearth = () => {
    if (rec.style !== 'house' || !rec.chimney || !rec.floorYs) return;
    const [hx, hz] = rec.chimney;
    const r0 = rec.rects[0], sy0 = rec.floorYs[0], P = rec.pitch || 5;
    const inner = (x, z) => x > r0.x0 && x < r0.x1 && z > r0.z0 && z < r0.z1;
    if (!inner(hx, hz) || nearCore(hx, hz) || nearDoor(hx, hz, 0)) return;
    if (world.has(hx, sy0 + 1, hz) || world.has(hx, sy0 + 2, hz) || !solidAt(world, hx, sy0, hz)) return;
    // the jamb: the next cell along one of the two walls at this corner
    const along = [[hx === r0.x0 + 1 ? 1 : -1, 0], [0, hz === r0.z0 + 1 ? 1 : -1]];
    let jamb = null;
    for (const [dx, dz] of along) {
      const jx = hx + dx, jz = hz + dz;
      if (inner(jx, jz) && !nearCore(jx, jz) && !nearDoor(jx, jz, 0) && !world.has(jx, sy0 + 1, jz) && !world.has(jx, sy0 + 2, jz)) { jamb = [jx, jz]; break; }
    }
    if (!jamb) return;
    const facing = DIRNAME(jamb[0] - hx === 0 ? (hx === r0.x0 + 1 ? 1 : -1) : 0, jamb[1] - hz === 0 ? (hz === r0.z0 + 1 ? 1 : -1) : 0);
    put(hx, sy0 + 1, hz, MAT.HEARTH);
    put(jamb[0], sy0 + 1, jamb[1], MAT.BRICK);
    put(jamb[0], sy0 + 2, jamb[1], MAT.BRICK);
    let breast = 0;
    for (let k = 0; k < rec.floors; k++) {
      const sy = rec.floorYs[k];
      const top = k === rec.floors - 1 ? rec.roofY - 1 : sy + P - 1;
      for (let y = (k === 0 ? sy + 2 : sy + 1); y <= top; y++) if (!world.has(hx, y, hz)) { put(hx, y, hz, MAT.BRICK); breast++; }
    }
    fireplace = { at: [hx, sy0 + 1, hz], jamb: [jamb[0], sy0 + 1, jamb[1]], breast, facing };
  };

  // tables and counters stand out in the room: if they would cost a room its
  // way in, they come out before the rooms do
  const extras = [];
  // ---- a kitchen counter: an unbroken run along one wall of the room, stove,
  // worktop, sink, worktop, barrel, on the longest stretch of free wall
  let counters = 0;
  const kitchenCounter = (rm, sy, free, ring) => {
    const y = sy + 1;
    const pieces = ['smoker', 'desk', 'sink', 'desk', 'barrel'];
    // runs of consecutive free ring cells on one side
    let best = null, run = [];
    const flush = () => { if (run.length > (best ? best.length : 0)) best = run.slice(); run = []; };
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (free(c[0], c[1]) && (!run.length || run[run.length - 1][4] === c[4])) run.push(c);
      else { flush(); if (free(c[0], c[1])) run.push(c); }
    }
    flush();
    if (!best || best.length < 4) return;
    const n = Math.min(pieces.length, best.length - 1);        // leave the run's last cell clear
    for (let i = 0; i < n; i++) {
      const [x, z, nx, nz] = best[i], p = pieces[i];
      put(x, y, z, p === 'smoker' ? smokerId(DIRNAME(nx, nz)) : p === 'sink' ? MAT.CAULDRON : p === 'barrel' ? MAT.BARREL : MAT.DESK);
      extras.push([x, y, z]);
    }
    counters++;
  };

  // ---- a dining table where a room has space round one: two cells of table
  // (or one, in a small room) with a chair at each end facing it, and a clear
  // cell all round so nobody is walled in. Every spot in the room is tried,
  // nearest the middle first, both ways round.
  let tables = 0;
  const diningTable = (rm, sy, free) => {
    const y = sy + 1;
    const w = rm.x1 - rm.x0 + 1, d = rm.z1 - rm.z0 + 1;
    if (Math.min(w, d) < 3 || Math.max(w, d) < 5) return;
    const mx = (rm.x0 + rm.x1) / 2, mz = (rm.z0 + rm.z1) / 2;
    const spots = [];
    for (let z = rm.z0; z <= rm.z1; z++) for (let x = rm.x0; x <= rm.x1; x++) spots.push([x, z]);
    spots.sort((p, q) => Math.hypot(p[0] - mx, p[1] - mz) - Math.hypot(q[0] - mx, q[1] - mz));
    for (const len of [2, 1]) {
      for (const [ux, uz] of [[1, 0], [0, 1]]) {
        for (const [x0, z0] of spots) {
          const t = [];
          for (let i = 0; i < len; i++) t.push([x0 + ux * i, z0 + uz * i]);
          const chairs = [[x0 - ux, z0 - uz, ux, uz], [x0 + ux * len, z0 + uz * len, -ux, -uz]];
          const all = t.concat(chairs.map(([x, z]) => [x, z]));
          const bx0 = Math.min(...all.map((c) => c[0])) - 1, bx1 = Math.max(...all.map((c) => c[0])) + 1;
          const bz0 = Math.min(...all.map((c) => c[1])) - 1, bz1 = Math.max(...all.map((c) => c[1])) + 1;
          let clear = true;
          for (let z = bz0; z <= bz1 && clear; z++) for (let x = bx0; x <= bx1; x++) if (!free(x, z)) { clear = false; break; }
          if (!clear) continue;
          for (const [x, z] of t) { put(x, y, z, MAT.DESK); extras.push([x, y, z]); }
          // a chair's back faces away from the table
          for (const [x, z, tx, tz] of chairs) { put(x, y, z, stairId(rec.theme.stair, WEIRDO[DIRNAME(-tx, -tz)])); extras.push([x, y, z]); }
          tables++;
          return;
        }
      }
    }
  };

  // ---- banisters: on each upper floor, a rail along the edge of the stairwell
  // where the floor meets the opening, never in front of a step (the way on
  // and off the stairs stays open). A floor that would not walk through with
  // its rail loses it again.
  const railFence = () => {
    const d = rec.theme && rec.theme.door;
    return d === 'spruce' ? MAT.SPRUCE_FENCE : d === 'dark' ? MAT.DARK_FENCE : MAT.FENCE;
  };
  let banisters = 0;
  const stairAt = (x, y, z) => { const id = world.get(x, y, z); return id >= 0 && /_stairs$/.test(MATERIALS.def(id).block); };
  const ladderAt = (x, y, z) => { const id = world.get(x, y, z); return id >= 0 && /ladder/.test(MATERIALS.def(id).block); };
  const buildBanisters = () => {
    if (!core || rec.floors < 2 || !rec.floorYs) return;
    const fence = railFence();
    for (let k = 1; k < rec.floors; k++) {
      const sy = rec.floorYs[k], y = sy + 1;
      let ladder = false;
      for (let z = core.z0 - 1; z <= core.z1 + 1 && !ladder; z++) for (let x = core.x0 - 1; x <= core.x1 + 1; x++) if (ladderAt(x, y, z) || ladderAt(x, sy - 1, z)) { ladder = true; break; }
      if (ladder) continue;
      const hole = (x, z) => x >= core.x0 && x <= core.x1 && z >= core.z0 && z <= core.z1 && !solidAt(world, x, sy, z) && !world.has(x, y, z);
      const here = [];
      for (let z = core.z0 - 1; z <= core.z1 + 1; z++)
        for (let x = core.x0 - 1; x <= core.x1 + 1; x++) {
          if (!solidAt(world, x, sy, z) || world.has(x, y, z) || world.has(x, y + 1, z)) continue;
          if (stairAt(x, sy, z)) continue;                                   // a step, not floor
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          if (!nb.some(([dx, dz]) => hole(x + dx, z + dz))) continue;
          // never in front of a step: the arrival (a step level with the floor) or the way up
          if (nb.some(([dx, dz]) => stairAt(x + dx, sy, z + dz) || stairAt(x + dx, y, z + dz))) continue;
          if (rec.keepClear && rec.keepClear.has(x + ',' + z)) continue;
          put(x, y, z, fence);
          here.push([x, y, z]);
        }
      if (!here.length) continue;
      if (!verifyBuilding(world, rec).ok || (plans.length && !roomsReachable(world, rec, plans))) {
        for (const [x, yy, z] of here) world.clear(x, yy, z);
        const gone = new Set(here.map((c) => c.join()));
        for (let i = placed.length - 1; i >= 0; i--) if (gone.has(placed[i].join())) placed.splice(i, 1);
      } else banisters += here.length;
    }
  };

  // a school is furnished as one hall per floor
  if (rec.schoolHall) {
    const halls = [];
    for (let k = 0; k < rec.floors; k++) halls.push(schoolHall(rec.floorYs[k], k, null));
    let v0 = verifyBuilding(world, rec);
    if (!v0.ok) {                                     // clear the desks rather than shut a floor off
      for (let k = 0; k < rec.floors; k++) {
        const r0 = rec.rects[k], sy = rec.floorYs[k];
        for (let x = r0.x0 + 1; x <= r0.x1 - 1; x++)
          for (let z = r0.z0 + 1; z <= r0.z1 - 1; z++) {
            const id = world.get(x, sy + 1, z);
            if (id < 0) continue;
            const n = MATERIALS.def(id).block;
            if (/slab|stairs/.test(n)) world.clear(x, sy + 1, z);    // the lectern stays: it blocks nothing
          }
      }
      v0 = verifyBuilding(world, rec);
      // put back what a small hall can take: one row of desks by the board
      if (v0.ok) for (let k = 0; k < rec.floors; k++) {
        const again = schoolHall(rec.floorYs[k], k, null, 1);
        halls[k] = again;
        if (!verifyBuilding(world, rec).ok) {                        // still in the way: leave it open
          const r0 = rec.rects[k], sy = rec.floorYs[k];
          for (let x = r0.x0 + 1; x <= r0.x1 - 1; x++)
            for (let z = r0.z0 + 1; z <= r0.z1 - 1; z++) {
              const id = world.get(x, sy + 1, z);
              if (id >= 0 && /slab|stairs/.test(MATERIALS.def(id).block)) world.clear(x, sy + 1, z);
            }
          halls[k] = { board: again.board, desks: 0, boardWall: again.boardWall, alongX: again.alongX };
        }
      }
      v0 = verifyBuilding(world, rec);
    }
    // Lights and books. Lanterns hang from the ceiling on a three-block grid,
    // wherever there is solid ceiling to hang from and clear of the stair.
    // Bookshelves, two high, line the walls that are neither the front (the
    // doorway's) nor the board's, each keeping the cell in front of it clear as
    // an aisle; if a floor would not walk through with its shelves, they go.
    let lights = 0, shelves = 0;
    const face = rec.facing, [fox, foz] = OUTWARD[face];
    const core = rec.core;
    const nearC = (x, z) => core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1;
    const doorCellsS = rec.doorCells || [];
    for (let k = 0; k < rec.floors; k++) {
      const r0 = rec.rects[k], sy = rec.floorYs[k], P = rec.pitch || 5, cy = sy + P - 1, h = halls[k] || {};
      for (let x = r0.x0 + 2; x <= r0.x1 - 2; x += 3)
        for (let z = r0.z0 + 2; z <= r0.z1 - 2; z += 3) {
          if (nearC(x, z) || world.has(x, cy, z) || !solidAt(world, x, cy + 1, z)) continue;
          if (cy - 1 <= sy + 3) continue;                          // too low a ceiling to hang one clear of heads
          world.set(x, cy, z, MAT.LAMP_HANG);
          lights++;
        }
      // the walls: [inner row cell] with the wall's outward direction
      const rowCells = [];
      for (let x = r0.x0 + 1; x <= r0.x1 - 1; x++) { rowCells.push([x, r0.z0 + 1, 0, -1]); rowCells.push([x, r0.z1 - 1, 0, 1]); }
      for (let z = r0.z0 + 2; z <= r0.z1 - 2; z++) { rowCells.push([r0.x0 + 1, z, -1, 0]); rowCells.push([r0.x1 - 1, z, 1, 0]); }
      const placedHere = [];
      for (const [x, z, wx, wz] of rowCells) {
        if (wx === fox && wz === foz) continue;                                // the front wall
        const wallX = x + wx, wallZ = z + wz;
        if (h.boardWall !== undefined && (h.alongX ? (wz !== 0 && wallZ === h.boardWall) : (wx !== 0 && wallX === h.boardWall))) continue;
        if (nearC(x, z)) continue;
        if (k === 0 && doorCellsS.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 2)) continue;
        if (world.has(x, sy + 1, z) || world.has(x, sy + 2, z) || !solidAt(world, x, sy, z)) continue;
        const ax = x - wx, az = z - wz;                                       // the aisle in front
        if (world.has(ax, sy + 1, az) || world.has(ax, sy + 2, az)) continue;
        world.set(x, sy + 1, z, MAT.BOOKSHELF);
        world.set(x, sy + 2, z, MAT.BOOKSHELF);
        placedHere.push([x, z]);
      }
      if (placedHere.length && !verifyBuilding(world, rec).ok) {
        for (const [x, z] of placedHere) { world.clear(x, sy + 1, z); world.clear(x, sy + 2, z); }
      } else shelves += placedHere.length;
    }
    v0 = verifyBuilding(world, rec);
    return { ok: v0.ok, beds: [], placed: 0, stations: rec.floors, plants: 0, shelves, lights, rooms: 0,
      desks: halls.reduce((a, h) => a + h.desks, 0), shops: [], paintings: [], halls };
  }

  buildHearth();
  for (let k = 0; k < rec.floors; k++) {
    const r = rec.rects[k];
    const sy = rec.floorYs[k], y = sy + 1;
    // (a building may name cells to keep clear: the way through to the next
    // wing of a courtyard block, where the walls between them were opened)
    const keep = rec.keepClear;
    const open = (x, z) => solidAt(world, x, sy, z) && !world.has(x, y, z) && !world.has(x, y + 1, z) && !(keep && keep.has(x + ',' + z));
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
        let fit = ROOMS[rm.type] || ROOMS.office;
        if (rm.type === 'shop' && k === 0) {
          rm.shopName = rng.pick(SHOPS);
          shopFront(rm, sy, rng);
          fit = SHOP_FIT[rm.shopName] || ROOMS.shop;
        }
        if (rm.type === 'kitchen' || rm.type === 'apartment') kitchenCounter(rm, sy, free, ring);
        if (rm.type === 'kitchen' || rm.type === 'living' || rm.type === 'apartment') diningTable(rm, sy, free);
        place(ring, fit, free, sy, k);
        hangPaintings(rm, sy, rng);                         // last, so nothing is hung where a shelf goes
      }
    } else {
      // A building whose floors are not rectangles (a twisting tower) hands
      // over its own ring: the cells just inside each floor's walls, in order.
      const ownRing = rec.furnishRing ? rec.furnishRing(k) : null;
      const ix0 = r.x0 + 1, iz0 = r.z0 + 1, ix1 = r.x1 - 1, iz1 = r.z1 - 1;
      if (!ownRing && (ix1 - ix0 < 2 || iz1 - iz0 < 2)) continue;
      const free = (x, z) => !nearCore(x, z) && !nearDoor(x, z, k) && open(x, z);
      const plan = ROOMS[rec.rooms ? rec.rooms(k) : roomFor(rec.style, k, rec.floors, rng)];   // landmarks choose their own
      place(ownRing || ringOf(ix0, iz0, ix1, iz1), plan, free, sy, k);
      if (plan === ROOMS.library && !ownRing) {
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

  buildBanisters();
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
  if ((!v.ok || !roomsOk) && extras.length) {
    // then the tables and counters, before giving up on the rooms
    for (const [x, y, z] of extras) world.clear(x, y, z);
    const gone = new Set(extras.map((c) => c.join()));
    for (let i = placed.length - 1; i >= 0; i--) if (gone.has(placed[i].join())) placed.splice(i, 1);
    extras.length = 0;
    tables = 0; counters = 0;
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
    paintings: paintings.map(({ cells, ...p }) => p), fireplace, counters, tables, banisters };
}

// Walk from the front door (up only onto stairs, down up to three, through
// doors) and check every room has a floor cell that can be reached.
function roomsReachable(world, rec, plans) {
  const passable = (x, y, z) => { const id = world.get(x, y, z); return id === -1 || MATERIALS.isPassable(id); };
  const stand = (x, y, z) => solidAt(world, x, y - 1, z) && passable(x, y, z) && passable(x, y + 1, z);
  // (a wing sharing a stair is walked over its whole block, as verify does)
  const r0 = rec.verifyBox || rec.rects[0];
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

