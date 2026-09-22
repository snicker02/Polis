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

import { MAT, MATERIALS, FLOWERS, CARPETS, CROP_KINDS, cropId, bedId, furnaceId, BED_VEC,
  gateId, chestId, lecternId, smokerId, stonecutterId, loomId, grindstoneId, bambooId } from './materials.js';
import { verifyBuilding } from './verify.js';
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

export function furnish(world, rec, rng) {
  const placed = [];
  const beds = [];
  let stations = 0, plants = 0, shelves = 0;
  const put = (x, y, z, id) => { world.set(x, y, z, id); placed.push([x, y, z]); };
  const core = rec.core;
  const nearCore = (x, z) => core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1;
  const doorCells = rec.doorCells || [[rec.door.x, rec.door.z]];
  const nearDoor = (x, z, k) => k === 0 && doorCells.some(([a, b]) => Math.abs(x - a) <= 2 && Math.abs(z - b) <= 2);

  for (let k = 0; k < rec.floors; k++) {
    const r = rec.rects[k];
    const sy = rec.floorYs[k], y = sy + 1;
    const ix0 = r.x0 + 1, iz0 = r.z0 + 1, ix1 = r.x1 - 1, iz1 = r.z1 - 1;
    if (ix1 - ix0 < 2 || iz1 - iz0 < 2) continue;

    // walk the inside of the walls: [x, z, inwardX, inwardZ, side]
    const ring = [];
    for (let x = ix0; x <= ix1; x++) ring.push([x, iz0, 0, 1, 0]);
    for (let z = iz0 + 1; z <= iz1; z++) ring.push([ix1, z, -1, 0, 1]);
    for (let x = ix1 - 1; x >= ix0; x--) ring.push([x, iz1, 0, -1, 2]);
    for (let z = iz1 - 1; z >= iz0 + 1; z--) ring.push([ix0, z, 1, 0, 3]);

    const free = (x, z) => !nearCore(x, z) && !nearDoor(x, z, k) &&
      solidAt(world, x, sy, z) && !world.has(x, y, z) && !world.has(x, y + 1, z);

    const plan = ROOMS[rec.rooms ? rec.rooms(k) : roomFor(rec.style, k, rec.floors, rng)];   // landmarks choose their own
    let step = rng.int(0, plan.length - 1);
    for (let i = 0; i < ring.length; i++) {
      const [x, z, nx, nz, side] = ring[i];
      if (!free(x, z)) continue;
      const item = plan[step % plan.length];
      if (item === 'bed') {
        const nb = ring[i + 1];
        if (!nb || nb[4] !== side || !free(nb[0], nb[1])) {
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
        i += 2;                       // bed + one clear cell
      } else if (item === 'rug') {
        // a carpet one cell in from the wall: walkable, purely decoration
        const rx = x + nx, rz = z + nz;
        if (!nearCore(rx, rz) && !nearDoor(rx, rz, k) && solidAt(world, rx, sy, rz) && !world.has(rx, y, rz))
          put(rx, y, rz, rng.pick(CARPETS));
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
      step++;
    }
  }

  // re-verify: furniture must never cost a floor
  const v = verifyBuilding(world, rec);
  if (!v.ok) {
    for (const [x, y, z] of placed) world.clear(x, y, z);
    return { ok: false, beds: [], placed: 0, stations: 0, plants: 0, shelves: 0 };
  }
  return { ok: true, beds, placed: placed.length, stations, plants, shelves };
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
  const n = Math.min(cells.length, rng.int(3, 6) + (kind === 'chicken' ? 2 : 0));
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

