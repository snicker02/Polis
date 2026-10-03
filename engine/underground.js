// engine/underground.js — rooms under buildings: cellars under houses, a crypt
// under the cathedral.
//
// A room is dug under the building's whole footprint, one storey deep (a crypt
// a little deeper): stone brick walls on the footprint's edge, a stone floor,
// the ground floor's own slab for a ceiling. A straight flight of stairs goes
// down from the ground floor, on a run of floor that is free (no furniture,
// clear of the door and the stair core), with a railing round the opening where
// it is open above. A cellar has barrels and chests along its walls; a crypt has
// columns and stone tombs. The lighting pass, which runs later, lights them.
//
// In the game the ground under a city is the world's own, not the city's: a
// room only stays a room if its air is written as air. So every room is listed
// on the world (world.airBoxes) and the exports write air through it.
//
// Dug after the lift (a terraced building's floor is where it ends up), and
// undone again if the building would not walk through with its new stairs.

import { MAT, MATERIALS, stairId, WEIRDO, chestId } from './materials.js';
import { verifyBuilding } from './verify.js';
import { roomsReachable } from './life.js';

const DIRS = [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']];
const OPP = { east: 'west', west: 'east', north: 'south', south: 'north' };

export function digUnder(world, rec, opts = {}) {
  const kind = opts.kind || 'cellar';
  const r = rec.rects[0], G = rec.groundY;
  const depth = opts.depth || rec.pitch || 5;               // the room's floor is this far under the ground floor
  const floorY = G - depth, topY = G - 1;                   // room air from floorY+1 to topY
  if (r.x1 - r.x0 < 5 || r.z1 - r.z0 < 5) return null;      // too small to dig under
  const core = rec.core;
  const nearCore = (x, z) => core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1;
  const nearDoor = (x, z) => (rec.doorCells || []).some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
  const inner = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const freeHere = (x, z) => inner(x, z) && !nearCore(x, z) && !nearDoor(x, z) &&
    world.has(x, G, z) && [1, 2, 3].every((h) => !world.has(x, G + h, z));
  // the room's volume must be free to dig: nothing built there already (a pond,
  // a canal, a cellar next door), only the soft fill the city stands on
  const SOFT = new Set([MAT.BASE, MAT.DIRT, MAT.RETAIN, MAT.CLAY, MAT.GRAVEL, MAT.CANAL_BED]);
  for (let z = r.z0; z <= r.z1; z++)
    for (let x = r.x0; x <= r.x1; x++)
      for (let y = floorY; y <= topY; y++) { const id = world.get(x, y, z); if (id !== -1 && !SOFT.has(id)) return null; }
  // the flight: an entry cell, then `depth` steps in a straight line, every one
  // free on the ground floor; the run reserved before the house was furnished
  // (reserveUnder) if it is still free, else the first that is
  let run = null;
  const R = rec.underRun;
  if (R && R.cells.length === depth + 1 && R.cells.every(([cx, cz]) => freeHere(cx, cz))) run = R;
  for (let z = r.z0 + 1; z < r.z1 && !run; z++)
    for (let x = r.x0 + 1; x < r.x1 && !run; x++)
      for (const [dx, dz, name] of DIRS) {
        const cells = [];
        for (let i = 0; i <= depth; i++) cells.push([x + dx * i, z + dz * i]);
        if (!cells.every(([cx, cz]) => freeHere(cx, cz))) continue;
        // the bottom of the flight lands in the room, a free cell beyond it
        const [ex, ez] = [x + dx * (depth + 1), z + dz * (depth + 1)];
        if (!inner(ex, ez)) continue;
        run = { cells, dx, dz, name };
        break;
      }
  if (!run) return null;
  const changes = [];
  const set = (x, y, z, id) => { changes.push([x, y, z, world.get(x, y, z)]); if (id === -1) world.clear(x, y, z); else world.set(x, y, z, id); };
  // the room: walls round the footprint, a floor, air inside
  for (let z = r.z0; z <= r.z1; z++)
    for (let x = r.x0; x <= r.x1; x++) {
      set(x, floorY, z, kind === 'crypt' ? MAT.STONEBRICK : MAT.SMOOTH);
      const edge = x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1;
      for (let y = floorY + 1; y <= topY; y++) set(x, y, z, edge ? MAT.STONEBRICK : -1);
    }
  // the flight: step i (from the entry, i = 1..depth) stands at G - i + 1, climbing back toward the entry
  const climb = WEIRDO[OPP[run.name]];
  const steps = [];
  for (let i = 1; i <= depth; i++) {
    const [x, z] = run.cells[i];
    const y = G - i + 1;
    set(x, y, z, stairId('stonebrick', climb));
    for (let yy = floorY + 1; yy < y; yy++) set(x, yy, z, MAT.STONEBRICK);    // filled under
    for (let yy = y + 1; yy <= Math.min(G + 3, y + 3); yy++) if (world.has(x, yy, z)) set(x, yy, z, -1);   // head room
    steps.push([x, y, z]);
  }
  // the opening: a railing on the ground floor round the cells open above, but at the entry
  // (open: where the ground floor's slab was taken out for head room)
  const open = new Set(steps.filter(([x, , z]) => !world.has(x, G, z)).map(([x, , z]) => x + ',' + z));
  const entry = run.cells[0].join(',');
  let rails = 0;
  for (const k of open) {
    const [x, z] = k.split(',').map(Number);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz, nk = nx + ',' + nz;
      if (open.has(nk) || nk === entry || !inner(nx, nz) || nk === run.cells[1].join(',')) continue;
      if (!world.has(nx, G, nz) || world.has(nx, G + 1, nz)) continue;
      set(nx, G + 1, nz, MAT.FENCE); rails++;
    }
  }
  // what is in the room
  const flight = new Set(run.cells.map(([x, z]) => x + ',' + z));
  const landing = run.cells[depth];
  const keep = (x, z) => flight.has(x + ',' + z) || (Math.abs(x - (landing[0] + run.dx)) <= 1 && Math.abs(z - (landing[1] + run.dz)) <= 1);
  let pieces = 0;
  const y = floorY + 1;
  if (kind === 'cellar') {
    // barrels and the odd chest along the walls
    let n = 0;
    for (let z = r.z0 + 1; z < r.z1; z++)
      for (let x = r.x0 + 1; x < r.x1; x++) {
        const byWall = x === r.x0 + 1 || x === r.x1 - 1 || z === r.z0 + 1 || z === r.z1 - 1;
        if (!byWall || keep(x, z) || world.has(x, y, z)) continue;
        if ((x + z) % 2) continue;
        n++;
        set(x, y, z, n % 4 === 0 ? chestId('north') : MAT.BARREL);
        pieces++;
      }
  } else {
    // a crypt: columns on a grid of three, tombs between them
    for (let z = r.z0 + 2; z < r.z1 - 1; z += 3)
      for (let x = r.x0 + 2; x < r.x1 - 1; x += 3) {
        if (keep(x, z)) continue;
        for (let yy = y; yy <= topY; yy++) set(x, yy, z, MAT.STONEBRICK);
        pieces++;
      }
    for (let z = r.z0 + 3; z < r.z1 - 2; z += 3)
      for (let x = r.x0 + 3; x < r.x1 - 3; x += 3) {
        if (keep(x, z) || keep(x + 1, z) || world.has(x, y, z) || world.has(x + 1, y, z)) continue;
        set(x, y, z, MAT.CHISELED_STONE); set(x + 1, y, z, MAT.CHISELED_STONE);
        pieces++;
      }
  }
  // torches on the walls at head height, about every four blocks round the room,
  // pointing in, where nothing stands in front of them; and one by the foot of
  // the stairs. (The lighting pass only makes sure nothing can spawn: a cellar
  // lit to that and no more still looks dark.)
  const TORCH = { east: MAT.TORCH_E, west: MAT.TORCH_W, north: MAT.TORCH_N, south: MAT.TORCH_S };
  const ty = floorY + 2;
  let torches = 0;
  const torchAt = (x, z, facing) => {
    if (world.has(x, ty, z) || keep(x, z)) return false;
    if (world.has(x, ty - 1, z) && MATERIALS.isPassable(world.get(x, ty - 1, z)) === false && world.get(x, ty - 1, z) !== MAT.BARREL) return false;
    set(x, ty, z, TORCH[facing]); torches++; return true;
  };
  for (let x = r.x0 + 2; x < r.x1 - 1; x += 4) { torchAt(x, r.z0 + 1, 'south'); torchAt(x, r.z1 - 1, 'north'); }
  for (let z = r.z0 + 2; z < r.z1 - 1; z += 4) { torchAt(r.x0 + 1, z, 'east'); torchAt(r.x1 - 1, z, 'west'); }
  {
    const [fx, fz] = [landing[0] + run.dx, landing[1] + run.dz];
    const walls = [[r.x0 + 1, fz, 'east'], [r.x1 - 1, fz, 'west'], [fx, r.z0 + 1, 'south'], [fx, r.z1 - 1, 'north']];
    walls.sort((a, b) => (Math.abs(a[0] - fx) + Math.abs(a[1] - fz)) - (Math.abs(b[0] - fx) + Math.abs(b[1] - fz)));
    for (const [x, z, f] of walls) {
      if (world.has(x, ty, z) || keep(x, z)) continue;      // (never on the flight or its landing)
      set(x, ty, z, TORCH[f]); torches++; break;
    }
  }
  // the building must still walk through with its stairs cut: otherwise, undone
  const plans = (rec.roomPlans || []).filter(Boolean).length ? rec.roomPlans : null;
  if (opts.verify !== false && (!verifyBuilding(world, rec).ok || (plans && !roomsReachable(world, rec, plans)))) {
    for (let i = changes.length - 1; i >= 0; i--) { const [x, yy, z, old] = changes[i]; if (old === -1) world.clear(x, yy, z); else world.set(x, yy, z, old); }
    return null;
  }
  const box = { x0: r.x0 + 1, y0: floorY + 1, z0: r.z0 + 1, x1: r.x1 - 1, y1: topY, z1: r.z1 - 1 };
  (world.airBoxes || (world.airBoxes = [])).push(box);
  return { kind, box, floorY, depth, entry: [run.cells[0][0], G + 1, run.cells[0][1]], steps, landing: [landing[0] + run.dx, floorY + 1, landing[1] + run.dz], rails, pieces, torches };
}

// is (x, y, z) in a room that must be air (for the exports)
// (column by column: a metro adds dozens of rooms, and an export asks this of
// every cell of the city, so scanning the list each time was too slow)
export function inAirBox(world) {
  const boxes = world.airBoxes || [];
  if (!boxes.length) return null;
  const cols = new Map();
  for (const b of boxes) {
    if (b.y0 > b.y1) continue;
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
      const k = x * 4096 + z, list = cols.get(k);
      if (list) list.push(b.y0, b.y1); else cols.set(k, [b.y0, b.y1]);
    }
  }
  return (x, y, z) => {
    const list = cols.get(x * 4096 + z);
    if (!list) return false;
    for (let i = 0; i < list.length; i += 2) if (y >= list[i] && y <= list[i + 1]) return true;
    return false;
  };
}

// Before a building is furnished: choose the run its stairs down will take, on
// the bare ground floor, and keep it (and the cells round the opening) clear of
// furniture. Dug later (digUnder), after the lift.
export function reserveUnder(world, rec, depth) {
  const r = rec.rects[0], G = rec.groundY;
  if (r.x1 - r.x0 < 5 || r.z1 - r.z0 < 5) return null;
  const core = rec.core;
  const nearCore = (x, z) => core && x >= core.x0 - 1 && x <= core.x1 + 1 && z >= core.z0 - 1 && z <= core.z1 + 1;
  const nearDoor = (x, z) => (rec.doorCells || []).some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
  const inner = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const freeHere = (x, z) => inner(x, z) && !nearCore(x, z) && !nearDoor(x, z) && world.has(x, G, z) && [1, 2, 3].every((h) => !world.has(x, G + h, z));
  for (let z = r.z0 + 1; z < r.z1; z++)
    for (let x = r.x0 + 1; x < r.x1; x++)
      for (const [dx, dz, name] of DIRS) {
        const cells = [];
        for (let i = 0; i <= depth; i++) cells.push([x + dx * i, z + dz * i]);
        if (!cells.every(([cx, cz]) => freeHere(cx, cz)) || !inner(x + dx * (depth + 1), z + dz * (depth + 1))) continue;
        const keep = rec.keepClear || (rec.keepClear = new Set());
        for (const [cx, cz] of cells) keep.add(cx + ',' + cz);   // (the run alone: rails go only where there is room)
        rec.underRun = { cells, dx, dz, name };
        return rec.underRun;
      }
  return null;
}
