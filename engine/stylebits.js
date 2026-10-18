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

import { MAT, MATERIALS, B, I, S, vineId, glazedId } from './materials.js';

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

// ---- Mesoamerican ------------------------------------------------------------------------
// Vines down the street front and the sides from the roof's edge to a block over head
// height, leaves in clumps along the eaves, out over the street. A pyramid (a tower or
// mid-rise of this style, stepped back every floor: building.js) has its temple on top: a roof comb
// of chiseled stone along the roof, braziers (lit campfires) at its corners and on the
// corners of the steps below.
const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };
export function mesoDress(world, c, rng) {
  const { rects, roofY, top, style, face, gy, floors, floorYs, doorCells } = c;
  const info = { vines: 0, leaves: 0, comb: 0, braziers: 0 };
  const busy = roofBusy(c);
  const low = gy + 3;
  const nearDoor = (x, z) => doorCells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 2);
  const S_ = sides(top);
  // (not down a pyramid: its walls step back under the vine)
  for (const side of c.pyramid ? [] : [face, ...(ACROSS[face] || [])]) {
    const chance = side === face ? 0.35 : 0.18;
    const toward = OPP[side];
    for (const [x, z] of S_[side] || []) {
      if (nearDoor(x, z)) continue;
      const wx = x + (side === 'east' ? -1 : side === 'west' ? 1 : 0), wz = z + (side === 'south' ? -1 : side === 'north' ? 1 : 0);
      // (on the eave, where there is one: out over the street)
      if (rng() < 0.3) { const ly = !world.has(x, roofY, z) ? roofY : !world.has(x, roofY + 1, z) ? roofY + 1 : null; if (ly !== null) { world.set(x, ly, z, MAT.JUNGLE_LEAF); info.leaves++; } }
      if (rng() >= chance) continue;
      const len = 3 + Math.floor(rng() * 8);
      let n = 0;
      for (let y = roofY - 1; y >= Math.max(low, roofY - len); y--) {
        if (world.has(x, y, z) || !world.has(wx, y, wz) || MATERIALS.isPassable(world.get(wx, y, wz))) break;
        world.set(x, y, z, vineId(toward)); n++;
      }
      if (n) info.vines++;
    }
  }
  if (c.pyramid) {
    // the roof comb: a crest along the long middle line of the temple's roof
    const alongX = top.x1 - top.x0 >= top.z1 - top.z0;
    const mx = Math.floor((top.x0 + top.x1) / 2), mz = Math.floor((top.z0 + top.z1) / 2);
    const cells = [];
    if (alongX) for (let x = top.x0 + 2; x <= top.x1 - 2; x++) cells.push([x, mz]);
    else for (let z = top.z0 + 2; z <= top.z1 - 2; z++) cells.push([mx, z]);
    cells.forEach(([x, z], i) => {
      if (busy(x, z)) return;
      for (let y = roofY + 1; y <= roofY + 4; y++) if (world.has(x, y, z)) return;
      world.set(x, roofY + 1, z, MAT.CHISELED_STONE); world.set(x, roofY + 2, z, MAT.CHISELED_STONE);
      if (i % 2 === 0) world.set(x, roofY + 3, z, MAT.CHISELED_STONE);
      info.comb++;
    });
    // braziers: on the parapet's corners, and on the corners of every step
    const fire = (x, y, z) => { if (!world.has(x, y, z) && world.has(x, y - 1, z) && !MATERIALS.isPassable(world.get(x, y - 1, z))) { world.set(x, y, z, MAT.CAMPFIRE_LIT); info.braziers++; } };
    for (const [x, z] of [[top.x0, top.z0], [top.x1, top.z0], [top.x0, top.z1], [top.x1, top.z1]]) {
      let y = roofY + 1; while (world.has(x, y, z) && y < roofY + 4) y++;
      fire(x, y, z);
    }
    for (let k = 1; k < floors; k++) {
      const a = rects[k - 1], b = rects[k];
      if (a.x0 === b.x0) continue;
      for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x0, a.z1], [a.x1, a.z1]]) {
        let y = floorYs[k]; while (world.has(x, y, z) && y < floorYs[k] + 3) y++;
        fire(x, y, z);
      }
    }
  }
  return info;
}

// ---- Moorish / Andalusian -------------------------------------------------------------
// Glazed terracotta: a dado of tiles round the foot of the walls, each tile turned a
// quarter on from the last so the pattern runs; a panel of them over the doorway; on a
// building of floors, a frieze of them along the street front under the roof. The tiles
// take the place of plain wall only.
const TILE_COLOURS = [['blue', 'white'], ['light_blue', 'blue'], ['cyan', 'white'], ['blue', 'yellow'], ['green', 'white']];
export function moorishDress(world, c, rng) {
  const { rects, theme, gy, face, doorCells, roofY, style, floors } = c;
  const info = { tiles: 0 };
  const [a, b] = TILE_COLOURS[Math.floor(rng() * TILE_COLOURS.length)];
  const tile = (x, y, z, i) => { if (world.get(x, y, z) !== theme.wall) return; world.set(x, y, z, glazedId(i % 8 < 4 ? a : b, 2 + (i % 4))); info.tiles++; };
  const r0 = rects[0];
  let i = 0;
  for (let x = r0.x0; x <= r0.x1; x++) { tile(x, gy + 1, r0.z0, i++); tile(x, gy + 1, r0.z1, i++); }
  for (let z = r0.z0 + 1; z < r0.z1; z++) { tile(r0.x0, gy + 1, z, i++); tile(r0.x1, gy + 1, z, i++); }
  // over the door
  for (const [dx, dz] of doorCells) for (const s of [-1, 0, 1]) {
    const lat = face === 'north' || face === 'south' ? [s, 0] : [0, s];
    tile(dx + lat[0], gy + 4, dz + lat[1], i++);
  }
  // the frieze under the roof, along the street front
  if (style !== 'house' && floors >= 2) {
    const t = rects[floors - 1], y = roofY - 1;
    const cells = sides({ x0: t.x0 - 1, z0: t.z0 - 1, x1: t.x1 + 1, z1: t.z1 + 1 })[face] || [];
    cells.forEach(([x, z], k) => tile(x, y, z, k));
  }
  return info;
}

// ---- Elven / forest -------------------------------------------------------------------------
// Every building wrapped round a great tree: its corners trunks of mangrove, floor after
// floor; on a mid-rise or a tower the trunks go on up past the roof (and its hut) into a
// crown of mangrove leaves spread over it. Moss in tufts round its foot; lanterns hung on
// chains under the eaves of its front, never lower than head height.
export function elvenDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, face, gy, floors, P, hut, doorCells } = c;
  const info = { trunks: 0, leaves: 0, moss: 0, lanterns: 0 };
  for (let k = 0; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]])
      for (let y = sy + 1; y <= sy + P - 1; y++) if (world.has(x, y, z)) world.set(x, y, z, MAT.MANGROVE_LOG);
  }
  if (style !== 'house') {
    const base = roofY + (hut ? 6 : 4);
    for (const [x, z] of [[top.x0, top.z0], [top.x1, top.z0], [top.x0, top.z1], [top.x1, top.z1]]) {
      let ok = true;
      for (let y = roofY + 1; y <= base; y++) if (world.has(x, y, z) && world.get(x, y, z) !== c.theme.wall && world.get(x, y, z) !== c.theme.trim) ok = false;
      if (!ok) continue;
      for (let y = roofY + 1; y <= base; y++) world.set(x, y, z, MAT.MANGROVE_LOG);
      info.trunks++;
    }
    // the crown: three layers over the roof, the middle widest, a block out past the walls
    const cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2;
    const A = (top.x1 - top.x0) / 2 + 2, B = (top.z1 - top.z0) / 2 + 2;
    for (const [dy, shrink] of [[1, 1], [2, 0], [3, 1.5]]) {
      const y = base + dy - 1;
      for (let x = Math.floor(cx - A); x <= Math.ceil(cx + A); x++) for (let z = Math.floor(cz - B); z <= Math.ceil(cz + B); z++) {
        const q = ((x - cx) / (A - shrink)) ** 2 + ((z - cz) / (B - shrink)) ** 2;
        if (q > 1 || world.has(x, y, z)) continue;
        if (q > 0.75 && rng() < 0.35) continue;                 // (a ragged edge)
        world.set(x, y, z, MAT.MANGROVE_LEAF); info.leaves++;
      }
    }
  }
  // moss round its foot
  const r0 = rects[0];
  const nearDoor = (x, z) => doorCells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 1);
  for (let x = r0.x0 - 1; x <= r0.x1 + 1; x++) for (let z = r0.z0 - 1; z <= r0.z1 + 1; z++) {
    if (x >= r0.x0 && x <= r0.x1 && z >= r0.z0 && z <= r0.z1) continue;
    if (nearDoor(x, z) || rng() > 0.45 || world.has(x, gy + 1, z) || !world.has(x, gy, z) || MATERIALS.isPassable(world.get(x, gy, z))) continue;
    world.set(x, gy + 1, z, MAT.MOSS_CARPET); info.moss++;
  }
  // lanterns on chains under the eaves of the front
  const S_ = sides(top);
  (S_[face] || []).forEach(([x, z], i) => {
    if (i % 4 !== 2 || !world.has(x, roofY, z)) return;
    const lampY = Math.max(gy + 3, roofY - 3);
    if (lampY >= roofY - 1) return;
    for (let y = lampY; y <= roofY - 1; y++) if (world.has(x, y, z)) return;
    for (let y = lampY + 1; y <= roofY - 1; y++) world.set(x, y, z, MAT.CHAIN);
    world.set(x, lampY, z, MAT.LAMP_HANG); info.lanterns++;
  });
  return info;
}

// ---- End city -------------------------------------------------------------------------------
// Purpur pillars at the corners; end rods for lights along the roof's edge and on its corners.
export function endDress(world, c, rng) {
  const { rects, floorYs, roofY, top, floors, P } = c;
  const info = { rods: 0, pillars: 0 };
  for (let k = 0; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]])
      for (let y = sy + 1; y <= sy + P - 1; y++) if (world.has(x, y, z)) { world.set(x, y, z, MAT.PURPUR_PILLAR); info.pillars++; }
  }
  const busy = roofBusy(c);
  const edge = [];
  for (let x = top.x0; x <= top.x1; x++) edge.push([x, top.z0], [x, top.z1]);
  for (let z = top.z0 + 1; z < top.z1; z++) edge.push([top.x0, z], [top.x1, z]);
  for (const [x, z] of edge) {
    const corner = (x === top.x0 || x === top.x1) && (z === top.z0 || z === top.z1);
    if (!corner && (x + z) % 4 !== 0) continue;
    if (busy(x, z)) continue;
    let y = roofY + 1; while (world.has(x, y, z) && y <= roofY + 3) y++;
    if (y > roofY + 3 || world.has(x, y, z) || MATERIALS.isPassable(world.get(x, y - 1, z))) continue;
    world.set(x, y, z, MAT.END_ROD); info.rods++;
  }
  void rng;
  return info;
}

// ---- Dwarven ---------------------------------------------------------------------------------
// Lava behind glass for light: up each corner of a mid-rise or a tower, from head height
// to the roof, the corner itself lava, glass over its two outer faces. The lava is shut
// in on every side: walls (the corner's two neighbours in the walls), glass, the corner
// below and the roof above. Where any of that is not so, that cell stays as it was.
export function dwarvenDress(world, c, rng) {
  const { rects, floorYs, roofY, style, gy, floors, P } = c;
  const info = { lava: 0, glass: 0 };
  if (style === 'house' || c.wing) return info;               // (a courtyard's wing: its walls come down where the wings meet)
  const solid = (x, y, z) => { const id = world.get(x, y, z); return id >= 0 && !MATERIALS.isPassable(id) && id !== MAT.LAVA; };
  for (let k = 0; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    for (const [x, z, ox, oz] of [[r.x0, r.z0, -1, -1], [r.x1, r.z0, 1, -1], [r.x0, r.z1, -1, 1], [r.x1, r.z1, 1, 1]]) {
      const cells = [];
      for (let y = Math.max(gy + 3, sy + 1); y <= sy + P - 1; y++) {
        // its two neighbours in the walls; its two outer faces empty (for the glass) or glass already
        const wallsOk = solid(x - ox, y, z) && solid(x, y, z - oz);
        const outA = [x + ox, y, z], outB = [x, y, z + oz];
        const faceOk = (p) => !world.has(...p) || /glass/.test(MATERIALS.def(world.get(...p)).block);
        if (wallsOk && faceOk(outA) && faceOk(outB)) cells.push([y, outA, outB]); else cells.push(null);
      }
      // a run of lava only where it stands on a block and has a block over it
      for (let i = 0; i < cells.length; i++) {
        if (!cells[i]) continue;
        let j = i; while (j + 1 < cells.length && cells[j + 1]) j++;
        const y0 = cells[i][0], y1 = cells[j][0];
        if (solid(x, y0 - 1, z) && (solid(x, y1 + 1, z) || y1 + 1 === roofY)) {
          for (let m = i; m <= j; m++) {
            const [y, a, b] = cells[m];
            for (const p of [a, b]) if (!world.has(...p)) { world.set(...p, MAT.GLASS); info.glass++; }
            world.set(x, y, z, MAT.LAVA); info.lava++;
          }
        }
        i = j;
      }
    }
  }
  void rng;
  return info;
}

// ---- Brutalist -----------------------------------------------------------------------------
// The windows set deep in a grid of concrete: a slab a block out at every floor's line
// and fins a block out every third cell between them, over head height only; under a
// cantilever (building.js: the ground floor drawn in, the floors over it out to the full
// width) a column of concrete at each of the overhang's corners.
export function brutalDress(world, c, rng) {
  const { rects, floorYs, gy, floors, P, theme } = c;
  const info = { slabs: 0, fins: 0, columns: 0, finCells: [] };
  for (let k = 1; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    if (sy < gy + 3) continue;
    const ring = [];
    for (let x = r.x0 - 1; x <= r.x1 + 1; x++) ring.push([x, r.z0 - 1, x - r.x0], [x, r.z1 + 1, x - r.x0]);
    for (let z = r.z0; z <= r.z1; z++) ring.push([r.x0 - 1, z, z - r.z0], [r.x1 + 1, z, z - r.z0]);
    for (const [x, z, i] of ring) {
      if (!world.has(x, sy, z)) { world.set(x, sy, z, MAT.SMOOTH); info.slabs++; }
      const corner = (x === r.x0 - 1 || x === r.x1 + 1) && (z === r.z0 - 1 || z === r.z1 + 1);
      if (corner || i % 3 !== 0) continue;
      // (never in front of a window: a fin stands out from plain wall)
      const bx = x < r.x0 ? r.x0 : x > r.x1 ? r.x1 : x, bz = z < r.z0 ? r.z0 : z > r.z1 ? r.z1 : z;
      if (world.get(bx, sy + 2, bz) === theme.glass) continue;
      let placed = false;
      for (let y = sy + 1; y <= sy + P - 1; y++) if (!world.has(x, y, z)) { world.set(x, y, z, theme.trim); info.fins++; placed = true; }
      if (placed) info.finCells.push([x, sy, z, bx, bz]);
    }
  }
  if (c.cantilever && floors > 1) {
    const r1 = rects[1];
    for (const [x, z] of [[r1.x0, r1.z0], [r1.x1, r1.z0], [r1.x0, r1.z1], [r1.x1, r1.z1]])
      for (let y = gy + 1; y < floorYs[1]; y++) if (!world.has(x, y, z)) { world.set(x, y, z, theme.wall); info.columns++; }
  }
  void rng;
  return info;
}
