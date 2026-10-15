// engine/stylebits.js — the dress of three styles, laid on a building once its shell
// is up (building.js calls these as it does the Art Deco fins and the East Asian eaves).
//
// Steampunk: a chimney stack or two on every roof, a campfire smoking on each (and on
// a house's own chimney); copper pipes (lightning rods end to end) down the side walls
// from the roof to above head height; lightning rods on the roof's corners.
// Santorini: a blue dome on the roof (a small chapel's, with a lantern on its cross),
// and bougainvillea (flowering azalea leaves, kept from decaying) hung on the walls
// over the doorway and along the top of the ground floor.
// Cyberpunk: a band of neon round every other floor (froglights or sea lanterns where
// the floor's trim course runs), a blade sign down the street front (coloured concrete
// lit at both ends), an antenna mast on the roof with a light on its tip.
//
// The rule every dress keeps (as facadeDetail): nothing out from a wall lower than head
// height, nothing anywhere but into empty cells (or, for the neon, in place of the trim
// course itself), nothing on a roof hut or its way out. No random draws from the city's
// stream: each building has its own, seeded from where it stands.

import { MAT, MATERIALS, B, I, S } from './materials.js';

const put = (world, x, y, z, id) => { if (world.has(x, y, z)) return false; world.set(x, y, z, id); return true; };
const sides = (r) => ({                // the cells just outside each wall, by side
  north: (() => { const a = []; for (let x = r.x0 + 1; x < r.x1; x++) a.push([x, r.z0 - 1]); return a; })(),
  south: (() => { const a = []; for (let x = r.x0 + 1; x < r.x1; x++) a.push([x, r.z1 + 1]); return a; })(),
  west: (() => { const a = []; for (let z = r.z0 + 1; z < r.z1; z++) a.push([r.x0 - 1, z]); return a; })(),
  east: (() => { const a = []; for (let z = r.z0 + 1; z < r.z1; z++) a.push([r.x1 + 1, z]); return a; })(),
});
const ACROSS = { north: ['east', 'west'], south: ['east', 'west'], east: ['north', 'south'], west: ['north', 'south'] };
// the way out onto the roof stays clear: the hut and round its door
const roofBusy = (c) => (x, z) => {
  const { hut, core, hutDoor } = c;
  if (hut && core && x >= core.x0 - 2 && x <= core.x1 + 2 && z >= core.z0 - 2 && z <= core.z1 + 2) return true;
  if (hutDoor && Math.abs(x - hutDoor[0]) <= 2 && Math.abs(z - hutDoor[2]) <= 2) return true;
  return false;
};

// ---- Steampunk ----------------------------------------------------------------------------
export function steampunkDress(world, c, rng) {
  const { rects, roofY, top, style, face, gy, floors, P } = c;
  const info = { chimneys: [], fires: [], pipes: 0, rods: [] };
  const busy = roofBusy(c);
  if (style === 'house') {
    // the house's own chimney (facadeDetail) gets a fire on its top
    if (c.chimney) {
      const [x, z] = c.chimney;
      let y = roofY; while (world.get(x, y + 1, z) === MAT.BRICK) y++;
      if (put(world, x, y + 1, z, MAT.CAMPFIRE_LIT)) { info.fires.push([x, y + 1, z]); info.chimneys.push([x, z]); }
    }
  } else {
    // two stacks at opposite corners of the roof, inside the parapet, three to five high
    for (const [x, z] of [[top.x0 + 1, top.z1 - 1], [top.x1 - 1, top.z0 + 1]]) {
      if (busy(x, z) || world.has(x, roofY + 1, z)) continue;
      const h = 3 + Math.floor(rng() * 3);
      let ok = true;
      for (let y = roofY + 1; y <= roofY + h + 1; y++) if (world.has(x, y, z)) ok = false;
      if (!ok) continue;
      for (let y = roofY + 1; y <= roofY + h; y++) world.set(x, y, z, y === roofY + h ? MAT.DEEPSLATE_BRICKS : MAT.BRICK);
      world.set(x, roofY + h + 1, z, MAT.CAMPFIRE_LIT);
      info.chimneys.push([x, z]); info.fires.push([x, roofY + h + 1, z]);
    }
    // lightning rods on the other two corners of the parapet
    const ph = style === 'tower' ? 2 : 1;
    for (const [x, z] of [[top.x0, top.z0], [top.x1, top.z1]]) {
      if (busy(x, z)) continue;
      if (put(world, x, roofY + ph + 1, z, MAT.LIGHTNING_ROD)) info.rods.push([x, roofY + ph + 1, z]);
    }
  }
  // pipes: down the middle of each side wall (not the street front), from the roof's
  // edge to a block over head height, a block out from the wall, where it is all empty
  const r0 = rects[0], low = gy + 3;
  const r = rects[floors - 1];
  const S_ = sides(r);
  for (const side of ACROSS[face] || []) {
    const cells = S_[side];
    if (!cells.length) continue;
    const [x, z] = cells[Math.floor(cells.length / 2)];
    // (the pipe stops where the building below steps out under it)
    const inLower = (yy) => { for (let k = 0; k < floors; k++) { const rk = rects[k]; if (yy > c.floorYs[k] && yy <= c.floorYs[k] + P && x >= rk.x0 && x <= rk.x1 && z >= rk.z0 && z <= rk.z1) return true; } return false; };
    const ys = [];
    for (let y = roofY - 1; y >= low; y--) { if (world.has(x, y, z) || inLower(y)) break; ys.push(y); }   // (under the eave)
    if (ys.length < 3) continue;
    for (const y of ys) world.set(x, y, z, MAT.LIGHTNING_ROD);
    info.pipes++;
  }
  void r0;
  return info;
}

// ---- Santorini ----------------------------------------------------------------------------
export function santoriniDress(world, c, rng) {
  const { rects, roofY, top, style, face, gy, doorCells, outv } = c;
  const info = { dome: null, flowers: 0 };
  const busy = roofBusy(c);
  // the dome: on a flat roof, in the middle of the top floor, if the cells are free
  // (a house's roof is flat in this style)
  const w = top.x1 - top.x0 + 1, d = top.z1 - top.z0 + 1;
  const R = Math.min(w, d) >= 9 ? 2 : Math.min(w, d) >= 6 ? 1 : 0;
  if (R && rng() < 0.7) {
    const cx = Math.floor((top.x0 + top.x1) / 2), cz = Math.floor((top.z0 + top.z1) / 2);
    let free = true;
    for (let dz = -R; dz <= R && free; dz++) for (let dx = -R; dx <= R && free; dx++) {
      if (busy(cx + dx, cz + dz)) free = false;
      for (let y = roofY + 1; y <= roofY + R + 4; y++) if (world.has(cx + dx, y, cz + dz)) free = false;
    }
    if (free) {
      // a drum a block high, then rings closing in: a dome R+1 high
      const cells = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (R === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        world.set(cx + dx, roofY + 1, cz + dz, MAT.C_WHITE); cells.push([cx + dx, roofY + 1, cz + dz]);
      }
      for (let k = 1; k <= R; k++) {
        const rr = R - k + 1;
        for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 1 : 0)) continue;
          world.set(cx + dx, roofY + 1 + k, cz + dz, MAT.C_BLUE); cells.push([cx + dx, roofY + 1 + k, cz + dz]);
        }
      }
      const capY = roofY + R + 2;
      world.set(cx, capY, cz, MAT.C_BLUE); cells.push([cx, capY, cz]);
      world.set(cx, capY + 1, cz, MAT.FENCE); world.set(cx, capY + 2, cz, MAT.LAMP);
      info.dome = { centre: [cx, cz], R, top: capY + 2, cells: cells.length };
    }
  }
  // bougainvillea: over the doorway (a block out, the course over the door frame) and
  // along the top of the ground floor on the street front, never below head height
  const sy0 = c.floorYs[0], hi = sy0 + c.P - 1;
  const r0 = rects[0];
  const S_ = sides(r0);
  const front = S_[face] || [];
  for (const [dx, dz] of doorCells) {
    for (const s of [-1, 0, 1]) {
      const lat = outv[0] === 0 ? [s, 0] : [0, s];
      const x = dx + outv[0] + lat[0], z = dz + outv[1] + lat[1];
      if (put(world, x, Math.max(gy + 3, hi), z, MAT.BOUGAINVILLEA)) info.flowers++;
    }
  }
  front.forEach(([x, z], i) => {
    if (i % 4 === 1 || i % 4 === 2) { if (hi >= gy + 3 && put(world, x, hi, z, MAT.BOUGAINVILLEA)) info.flowers++; }
  });
  return info;
}

// ---- Cyberpunk ----------------------------------------------------------------------------
const NEON = () => [MAT.FROG_PINK, MAT.FROG_GREEN, MAT.FROG_YELLOW, MAT.SEA_LANTERN];
export function cyberDress(world, c, rng) {
  const { rects, floorYs, roofY, top, theme, style, face, gy, P, floors, outv } = c;
  const info = { neon: 0, sign: null, antenna: null };
  const busy = roofBusy(c);
  const colour = NEON()[Math.floor(rng() * 4)];
  if (style !== 'house') {
    // neon bands: the trim course at the top of every other floor (from the first up)
    for (let k = 1; k < floors; k += 2) {
      const r = rects[k], y = floorYs[k] + P - 1;
      for (let x = r.x0; x <= r.x1; x++) for (const z of [r.z0, r.z1]) if (world.get(x, y, z) === theme.trim) { world.set(x, y, z, colour); info.neon++; }
      for (let z = r.z0 + 1; z < r.z1; z++) for (const x of [r.x0, r.x1]) if (world.get(x, y, z) === theme.trim) { world.set(x, y, z, colour); info.neon++; }
    }
  } else {
    // a house: its door frame's lintel lit
    for (const [dx, dz] of c.doorCells) if (world.get(dx, gy + 3, dz) === theme.trim) { world.set(dx, gy + 3, dz, colour); info.neon++; }
  }
  // the blade sign: down the street front a block out, from the first floor up (never
  // lower than head height), a third of the way along, all its cells empty
  if (floors >= 2) {
    const r = rects[floors - 1];
    const front = sides(r)[face] || [];
    if (front.length >= 3) {
      const [x, z] = front[Math.floor(front.length / 3)];
      const y0 = Math.max(gy + 3, floorYs[1]), y1 = Math.min(roofY, y0 + 2 + Math.floor(rng() * 4));
      let ok = y1 - y0 >= 2;
      for (let y = y0; y <= y1 && ok; y++) if (world.has(x, y, z)) ok = false;
      if (ok) {
        const ink = [MAT.C_MAGENTA, MAT.C_CYAN, MAT.C_PURPLE][Math.floor(rng() * 3)];
        for (let y = y0; y <= y1; y++) world.set(x, y, z, y === y0 || y === y1 ? colour : ink);
        info.sign = { at: [x, z], y0, y1 };
      }
    }
  }
  // the antenna: iron bars up from the roof, an end rod on its tip
  if (style !== 'house') {
    const x = top.x1 - 1, z = top.z1 - 1, h = 4 + Math.floor(rng() * 5);
    if (!busy(x, z)) {
      let ok = true;
      for (let y = roofY + 1; y <= roofY + h + 1; y++) if (world.has(x, y, z)) ok = false;
      if (ok) {
        for (let y = roofY + 1; y <= roofY + h; y++) world.set(x, y, z, MAT.BARS);
        world.set(x, roofY + h + 1, z, MATERIALS.add(null, 'minecraft:end_rod', '#f2eee4', { facing_direction: I(1) }));
        info.antenna = { at: [x, z], top: roofY + h + 1 };
      }
    }
  }
  void outv; void B; void S;
  return info;
}
