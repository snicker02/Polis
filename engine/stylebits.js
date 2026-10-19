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

import { MAT, MATERIALS, B, I, S, vineId, glazedId, stairId, WEIRDO } from './materials.js';

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

// =============================================================================================
// Twelve styles (0.74.0). Each keeps the rule above: nothing out from a wall lower than head
// height, nothing but into empty cells (or in place of the building's own plain wall), nothing
// on a roof's way out. DRESSES (at the end) names each by its style's `dress`.
// =============================================================================================
const corners4 = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]];
const ringOf = (r) => { const a = []; for (let x = r.x0; x <= r.x1; x++) a.push([x, r.z0], [x, r.z1]); for (let z = r.z0 + 1; z < r.z1; z++) a.push([r.x0, z], [r.x1, z]); return a; };
const grow = (r, n) => ({ x0: r.x0 - n, z0: r.z0 - n, x1: r.x1 + n, z1: r.z1 + n });
const solidAt = (world, x, y, z) => { const id = world.get(x, y, z); return id >= 0 && !MATERIALS.isPassable(id); };
// the first free cell over a roof at (x, z), no higher than roofY + up; null if none
const overRoof = (world, x, z, roofY, up = 2) => { let y = roofY + 1; while (world.has(x, y, z) && y <= roofY + up) y++; return y <= roofY + up && !world.has(x, y, z) && solidAt(world, x, y - 1, z) ? y : null; };
// the highest block over a footprint (a pitched roof's ridge), from y up
const peakOver = (world, r, y0) => { let top = y0; for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) for (let y = y0; y <= y0 + 24; y++) if (world.has(x, y, z)) top = Math.max(top, y); return top; };
// a box of cells all empty (and none on the roof's way out)
const allFree = (world, busy, x0, x1, z0, z1, y0, y1) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { if (busy && busy(x, z)) return false; for (let y = y0; y <= y1; y++) if (world.has(x, y, z)) return false; } return true; };
// the free spot nearest the middle of a roof for something r round and h high (the stair's
// hut is often in the middle): its centre, or null
function roofSpot(world, c, r, h, margin = 0) {
  const { top, roofY } = c, busy = roofBusy(c);
  const mx = (top.x0 + top.x1) / 2, mz = (top.z0 + top.z1) / 2, cand = [];
  for (let x = top.x0 + r + margin; x <= top.x1 - r - margin; x++) for (let z = top.z0 + r + margin; z <= top.z1 - r - margin; z++) cand.push([x, z]);
  cand.sort((a, b) => (a[0] - mx) ** 2 + (a[1] - mz) ** 2 - ((b[0] - mx) ** 2 + (b[1] - mz) ** 2));
  for (const [x, z] of cand) {
    if (!allFree(world, busy, x - r, x + r, z - r, z + r, roofY + 1, roofY + h)) continue;
    let held = true;
    for (let dx = -r; dx <= r && held; dx++) for (let dz = -r; dz <= r; dz++) if (!solidAt(world, x + dx, roofY, z + dz)) { held = false; break; }
    if (held) return [x, z];
  }
  return null;
}
const sideOf = (r, x, z) => (z < r.z0 ? 'north' : z > r.z1 ? 'south' : x < r.x0 ? 'west' : 'east');
// a spire in the middle of a tower's roof: squares closing in, two layers each, its tip on top
function spireOn(world, c, body, tip, finial) {
  const { top, roofY } = c;
  const w = top.x1 - top.x0 + 1, d = top.z1 - top.z0 + 1;
  const h = Math.min(2, Math.floor((Math.min(w, d) - 5) / 2));
  if (h < 1) return null;
  const tall = 2 * (h + 1) + 3;
  const spot = roofSpot(world, c, h, tall);
  if (!spot) return null;
  const [cx, cz] = spot;
  let y = roofY + 1, n = 0;
  for (let s = h; s >= 0; s--) for (let k = 0; k < 2; k++, y++) for (let dx = -s; dx <= s; dx++) for (let dz = -s; dz <= s; dz++) { world.set(cx + dx, y, cz + dz, body); n++; }
  world.set(cx, y, cz, tip); n++;
  if (finial) { world.set(cx, y + 1, cz, finial); n++; }
  return { at: [cx, cz], top: y + (finial ? 1 : 0), cells: n };
}

// ---- Classical / Roman ------------------------------------------------------------------------
// Quartz pillars up every corner, floor after floor; a cornice a block out round the roof; a
// pediment over the door (two courses stepping in over it); a statue on each corner of the roof.
export function classicalDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, floors, P, gy, doorCells, outv } = c;
  const info = { pillars: 0, cornice: 0, pediment: 0, statues: 0 };
  for (let k = 0; k < floors; k++) for (const [x, z] of corners4(rects[k]))
    for (let y = floorYs[k] + 1; y <= floorYs[k] + P - 1; y++) if (world.has(x, y, z)) { world.set(x, y, z, MAT.QUARTZ_PILLAR); info.pillars++; }
  if (style !== 'house' || c.flatRoof) for (const [x, z] of ringOf(grow(top, 1))) if (put(world, x, roofY, z, MAT.SMOOTH_QUARTZ)) info.cornice++;
  for (const [dx, dz] of doorCells) {
    const x = dx + outv[0], z = dz + outv[1];
    for (const s of [-1, 0, 1]) {
      const lat = outv[0] === 0 ? [s, 0] : [0, s];
      if (put(world, x + lat[0], gy + 4, z + lat[1], MAT.SMOOTH_QUARTZ)) info.pediment++;
    }
    if (put(world, x, gy + 5, z, MAT.CHISELED_QUARTZ)) info.pediment++;
  }
  if (style !== 'house') {
    const busy = roofBusy(c);
    for (const [x, z] of corners4(top)) {
      if (busy(x, z)) continue;
      const y = overRoof(world, x, z, roofY);
      if (y === null || world.has(x, y + 1, z) || world.has(x, y + 2, z)) continue;
      world.set(x, y, z, MAT.SMOOTH_QUARTZ); world.set(x, y + 1, z, MAT.QUARTZ_PILLAR); world.set(x, y + 2, z, MAT.CHISELED_QUARTZ);
      info.statues++;
    }
  }
  void rng;
  return info;
}

// ---- Gothic ---------------------------------------------------------------------------------
// Buttresses a block out up the walls between the windows, from head height to the roof;
// pinnacles on the roof's corners; on a tower a spire, and over its door, high in the front, a
// rose window of stained glass.
const ROSE = [MAT.SG_RED, MAT.SG_BLUE];
export function gothicDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, floors, P, gy, face, theme } = c;
  const info = { buttresses: 0, pinnacles: 0, spire: null, rose: 0 };
  const r0 = rects[0];
  for (const side of ['north', 'south', 'east', 'west']) {
    (sides(r0)[side] || []).forEach(([x, z], i, all) => {
      if (i < 1 || i > all.length - 2 || i % 4 !== 2) return;
      const bx = x < r0.x0 ? r0.x0 : x > r0.x1 ? r0.x1 : x, bz = z < r0.z0 ? r0.z0 : z > r0.z1 ? r0.z1 : z;
      let n = 0;
      for (let y = gy + 3; y < roofY; y++) {
        if (world.get(bx, y, bz) === theme.glass) break;          // (never across a window)
        if (!put(world, x, y, z, MAT.DEEPSLATE_BRICKS)) break;
        n++;
      }
      if (n) info.buttresses++;
    });
  }
  if (style !== 'house') {
    const busy = roofBusy(c);
    for (const [x, z] of corners4(top)) {
      if (busy(x, z)) continue;
      const y = overRoof(world, x, z, roofY);
      if (y === null || world.has(x, y + 1, z) || world.has(x, y + 2, z)) continue;
      for (let k = 0; k < 3; k++) world.set(x, y + k, z, MAT.DS_WALL);
      info.pinnacles++;
    }
  }
  if (style === 'tower') info.spire = spireOn(world, c, MAT.DEEPSLATE_TILES, MAT.DS_WALL, MAT.GOLD);
  // the rose window: in the front of the top floor of a tower or a mid-rise of floors
  if (style !== 'house' && floors >= 2) {
    const k = floors - 1, r = rects[k], sy = floorYs[k];
    const R = P >= 6 ? 2 : 1;
    const cy = sy + Math.ceil(P / 2);
    const alongX = face === 'north' || face === 'south';
    const wz = face === 'north' ? r.z0 : face === 'south' ? r.z1 : null, wx = face === 'west' ? r.x0 : face === 'east' ? r.x1 : null;
    const mid = alongX ? Math.floor((r.x0 + r.x1) / 2) : Math.floor((r.z0 + r.z1) / 2);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      if (a * a + b * b > R * R + R - 1) continue;
      const y = cy + b;
      if (y <= sy || y >= sy + P) continue;
      const x = alongX ? mid + a : wx, z = alongX ? wz : mid + a;
      const id = world.get(x, y, z);
      if (id !== theme.wall && id !== theme.glass && id !== theme.trim) continue;
      world.set(x, y, z, a === 0 && b === 0 ? MAT.SG_YELLOW : ROSE[(Math.abs(a) + Math.abs(b)) % 2]); info.rose++;
    }
  }
  void rng;
  return info;
}

// ---- Nordic / Viking ------------------------------------------------------------------------
// Carved posts (stripped logs) up the corners; a dragon's head (a post and a stair turned out)
// on each end of a house's ridge, on each corner of a hall's roof.
export function nordicDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, floors, P, theme } = c;
  const info = { posts: 0, dragons: 0, turf: 0 };
  for (let k = 0; k < floors; k++) for (const [x, z] of corners4(rects[k]))
    for (let y = floorYs[k] + 1; y <= floorYs[k] + P - 1; y++) if (world.has(x, y, z)) { world.set(x, y, z, theme.trim); info.posts++; }
  const head = (x, y, z, dir) => {
    if (world.has(x, y, z) || world.has(x, y + 1, z)) return;
    world.set(x, y, z, MAT.DARK_FENCE); world.set(x, y + 1, z, stairId('dark', WEIRDO[dir]));
    info.dragons++;
  };
  if (style === 'house' && !c.flatRoof) {
    // turf: the roof's top course, column by column, moss over the timber
    const g = grow(top, 1);
    for (let x = g.x0; x <= g.x1; x++) for (let z = g.z0; z <= g.z1; z++) {
      let y = roofY + 24; while (y > roofY && !world.has(x, y, z)) y--;
      if (y <= roofY) continue;
      if (/_stairs$/.test(MATERIALS.def(world.get(x, y, z)).block)) { world.set(x, y, z, MAT.MOSS_BLOCK); info.turf = (info.turf || 0) + 1; }
    }
    const r = grow(top, 1), peak = peakOver(world, r, roofY);
    const cells = [];
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) if (world.has(x, peak, z)) cells.push([x, z]);
    if (cells.length) {
      const alongX = top.x1 - top.x0 >= top.z1 - top.z0;
      const key = (p) => (alongX ? p[0] : p[1]);
      const lo = cells.reduce((a, b) => (key(b) < key(a) ? b : a)), hi = cells.reduce((a, b) => (key(b) > key(a) ? b : a));
      head(lo[0], peak + 1, lo[1], alongX ? 'west' : 'north');
      head(hi[0], peak + 1, hi[1], alongX ? 'east' : 'south');
    }
  } else {
    const busy = roofBusy(c);
    for (const [x, z] of corners4(top)) {
      if (busy(x, z)) continue;
      const y = overRoof(world, x, z, roofY);
      if (y !== null) head(x, y, z, x === top.x0 ? 'west' : 'east');
    }
  }
  void rng;
  return info;
}

// ---- Byzantine / Russian ----------------------------------------------------------------------
// Bands of the trim colour under every floor's line; an onion dome on a drum in the middle of
// the roof (four small ones round it on a big roof), its bulb bright, gold at its tip.
const BULBS = () => [[MAT.GOLD, MAT.GOLD], [MAT.COPPER_ROOF, MAT.COPPER_ROOF], [MAT.C_BLUE, MAT.GOLD], [MAT.C_RED, MAT.C_WHITE], [MAT.C_GREEN, MAT.C_WHITE], [MAT.T_GREEN, MAT.GOLD]];
function onion(world, c, cx, cz, R, colours, drum) {
  const { roofY } = c;
  const layers = [R, R, R + 1, R + 1, R, Math.max(R - 1, 0), 0];
  const reach = R + 1;
  if (!allFree(world, roofBusy(c), cx - reach, cx + reach, cz - reach, cz + reach, roofY + 1, roofY + layers.length + 3)) return 0;
  let n = 0;
  layers.forEach((r, k) => {
    const y = roofY + 1 + k;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + r) continue;
      const m = k < 1 ? drum : colours[(dx + dz + k + 64) % 2];
      world.set(cx + dx, y, cz + dz, m); n++;
    }
  });
  const ty = roofY + 1 + layers.length;
  world.set(cx, ty, cz, MAT.GOLD); world.set(cx, ty + 1, cz, MAT.BARS); world.set(cx, ty + 2, cz, MAT.BARS);
  return n + 3;
}
export function byzantineDress(world, c, rng) {
  const { rects, floorYs, top, style, floors, P, theme } = c;
  const info = { band: 0, domes: 0 };
  for (let k = 0; k < floors; k++) for (const [x, z] of ringOf(rects[k])) {
    const y = floorYs[k] + P - 1;
    if (world.get(x, y, z) === theme.wall) { world.set(x, y, z, theme.trim); info.band++; }
  }
  if (style !== 'house') {
    const w = top.x1 - top.x0 + 1, d = top.z1 - top.z0 + 1, m = Math.min(w, d);
    const R = m >= 11 ? 2 : m >= 7 ? 1 : 0;
    const cols = BULBS()[Math.floor(rng() * BULBS().length)];
    const spot = R ? roofSpot(world, c, R + 1, 11) : null;
    if (spot && onion(world, c, spot[0], spot[1], R, cols, theme.wall)) info.domes++;
    if (m >= 15) for (const [x, z] of [[top.x0 + 2, top.z0 + 2], [top.x1 - 2, top.z0 + 2], [top.x0 + 2, top.z1 - 2], [top.x1 - 2, top.z1 - 2]])
      if (onion(world, c, x, z, 0, cols, theme.wall)) info.domes++;
  }
  return info;
}

// ---- Wild West --------------------------------------------------------------------------------
// The false front: the street wall carried up over the roof, its middle a course higher, a sign
// board across it; a porch roof (a slab, at head height) along the front over the boardwalk.
export function westernDress(world, c, rng) {
  const { rects, roofY, top, style, gy, face, theme } = c;
  const info = { front: 0, sign: 0, porch: 0 };
  const busy = roofBusy(c);
  const line = [];
  if (face === 'north' || face === 'south') { const z = face === 'north' ? top.z0 : top.z1; for (let x = top.x0; x <= top.x1; x++) line.push([x, z]); }
  else { const x = face === 'west' ? top.x0 : top.x1; for (let z = top.z0; z <= top.z1; z++) line.push([x, z]); }
  const H = style === 'house' ? 2 : 3, n = line.length;
  line.forEach(([x, z], i) => {
    if (busy(x, z)) return;
    const h = H + (i >= n / 3 && i < (2 * n) / 3 ? 1 : 0);
    for (let y = roofY + 1; y <= roofY + h; y++) {
      const id = world.get(x, y, z);
      if (id >= 0 && id !== theme.wall && id !== theme.trim && !MATERIALS.isPassable(id) && y > roofY + 1) return;
      if (MATERIALS.isPassable(id)) return;
      world.set(x, y, z, y === roofY + 2 && i > 0 && i < n - 1 ? MAT.DARK_PLANKS : theme.wall);
      if (y === roofY + 2 && i > 0 && i < n - 1) info.sign++;
      info.front++;
    }
    put(world, x, roofY + h + 1, z, theme.trim);
  });
  for (const [x, z] of sides(rects[0])[face] || []) if (put(world, x, gy + 3, z, MAT.SPRUCE_SLAB_T)) info.porch++;
  void rng;
  return info;
}

// ---- Victorian --------------------------------------------------------------------------------
// A bay window a block out on the front of every floor over the ground floor (glass between trim
// posts, a sill and a hood); little iron balconies on the sides; a mansard of slate stairs
// round a flat roof, just inside its parapet.
export function victorianDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, floors, P, face, theme } = c;
  const info = { bays: 0, balconies: 0, mansard: 0 };
  for (let k = 1; k < floors; k++) {
    const r = rects[k], sy = floorYs[k];
    const front = sides(r)[face] || [];
    const spots = front.length >= 14 ? [Math.floor(front.length / 4), Math.floor((3 * front.length) / 4)] : front.length >= 7 ? [Math.floor(front.length / 2)] : [];
    for (const m of spots) {
      const cells = [front[m - 1], front[m], front[m + 1]];
      if (!allFree(world, null, Math.min(...cells.map((p) => p[0])), Math.max(...cells.map((p) => p[0])), Math.min(...cells.map((p) => p[1])), Math.max(...cells.map((p) => p[1])), sy, sy + P - 1)) continue;
      cells.forEach(([x, z], j) => {
        world.set(x, sy, z, theme.trim);
        for (let y = sy + 1; y <= sy + P - 2; y++) world.set(x, y, z, j === 1 ? theme.glass : theme.trim);
        world.set(x, sy + P - 1, z, theme.trim);
      });
      info.bays++;
    }
    for (const side of ACROSS[face] || []) {
      const row = sides(r)[side] || [];
      if (row.length < 5) continue;
      const m = Math.floor(row.length / 2);
      const cells = [row[m - 1], row[m], row[m + 1]];
      if (!cells.every(([x, z]) => !world.has(x, sy, z) && !world.has(x, sy + 1, z))) continue;
      for (const [x, z] of cells) { world.set(x, sy, z, MAT.DARK_SLAB_T); world.set(x, sy + 1, z, MAT.BARS); }
      info.balconies++;
    }
  }
  if (style !== 'house') {
    const busy = roofBusy(c), inner = grow(top, -1);
    if (inner.x1 - inner.x0 >= 2 && inner.z1 - inner.z0 >= 2)
      for (const [x, z] of ringOf(inner)) {
        if (busy(x, z) || world.has(x, roofY + 1, z) || !solidAt(world, x, roofY, z)) continue;
        const s = sideOf(grow(inner, -1), x, z);
        world.set(x, roofY + 1, z, stairId('deepslate', WEIRDO[OPP[s]])); info.mansard++;
      }
  }
  void rng;
  return info;
}

// ---- Googie / retro-future ----------------------------------------------------------------------
// A flying saucer over a tower's or a mid-rise's roof (a white disc on a stem, a teal rim, a
// glass bubble on top); boomerang fins rising out from the roof's front corners; neon over doors.
export function googieDress(world, c, rng) {
  const { roofY, top, style, face, gy, doorCells } = c;
  const info = { saucer: null, fins: 0, neon: 0 };
  const busy = roofBusy(c);
  const w = top.x1 - top.x0 + 1, d = top.z1 - top.z0 + 1;
  if (style !== 'house' && Math.min(w, d) >= 7) {
    let R = Math.min(5, Math.floor(Math.min(w, d) / 2) - 1), spot = null;
    for (; R >= 2 && !spot; R--) spot = roofSpot(world, c, R, 6);
    R++;
    if (spot) {
      const [cx, cz] = spot;
      world.set(cx, roofY + 1, cz, MAT.QUARTZ_PILLAR); world.set(cx, roofY + 2, cz, MAT.QUARTZ_PILLAR);
      let n = 2;
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const q = dx * dx + dz * dz;
        if (q > R * R) continue;
        world.set(cx + dx, roofY + 3, cz + dz, q > (R - 1) * (R - 1) ? MAT.C_CYAN : MAT.C_WHITE); n++;
        if (q <= (R - 2) * (R - 2)) { world.set(cx + dx, roofY + 4, cz + dz, q === 0 ? MAT.FROG_GREEN : MAT.SG_CYAN); n++; }
      }
      info.saucer = { at: [cx, cz], R, cells: n };
    }
  }
  if (style !== 'tower') {
    const alongX = face === 'north' || face === 'south';
    const fz = face === 'north' ? top.z0 : face === 'south' ? top.z1 : null, fx = face === 'west' ? top.x0 : face === 'east' ? top.x1 : null;
    for (const [end, out] of alongX ? [[top.x0, -1], [top.x1, 1]] : [[top.z0, -1], [top.z1, 1]]) {
      const x0 = alongX ? end : fx, z0 = alongX ? fz : end;
      const y0 = busy(x0, z0) ? null : overRoof(world, x0, z0, roofY);
      if (y0 === null) continue;
      for (let k = 0; k < 3; k++) {
        const x = alongX ? end + out * k : fx, z = alongX ? fz : end + out * k;
        if (!put(world, x, y0 + k, z, MAT.C_ORANGE)) break;
        info.fins++;
      }
    }
  }
  for (const [dx, dz] of doorCells) { const id = world.get(dx, gy + 3, dz); if (id === MAT.GLOWSTONE || id === c.theme.wall || id === c.theme.trim) { world.set(dx, gy + 3, dz, MAT.FROG_PINK); info.neon++; } }
  void rng;
  return info;
}

// ---- Copper city -----------------------------------------------------------------------------
// Lightning rods on the roof's corners (a house's on its ridge). The copper itself ages by
// district once the city is built (city.js: applyStyle).
export function copperDress(world, c, rng) {
  const { roofY, top, style } = c;
  const info = { rods: 0 };
  if (style !== 'house' || c.flatRoof) {
    const busy = roofBusy(c);
    for (const [x, z] of corners4(top)) {
      if (busy(x, z)) continue;
      const y = overRoof(world, x, z, roofY);
      if (y !== null && !world.has(x, y + 1, z)) { world.set(x, y, z, MAT.LIGHTNING_ROD); info.rods++; }
    }
  } else {
    const peak = peakOver(world, grow(top, 1), roofY);
    const cx = Math.floor((top.x0 + top.x1) / 2), cz = Math.floor((top.z0 + top.z1) / 2);
    if (world.has(cx, peak, cz) && !world.has(cx, peak + 1, cz)) { world.set(cx, peak + 1, cz, MAT.LIGHTNING_ROD); info.rods++; }
  }
  void rng;
  return info;
}

// ---- Mushroom / fungal ----------------------------------------------------------------------------
// A great cap over the whole building, two blocks out past its walls all round: a dome of
// mushroom block (red or brown, the building's trim) with a skirt hanging a course lower at its
// rim; clear over the roof (and its hut) beneath.
export function mushroomDress(world, c, rng) {
  const { roofY, top, theme, hut } = c;
  const info = { cap: 0 };
  const base = roofY + (hut ? 6 : 4);
  const cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2;
  const A = (top.x1 - top.x0) / 2 + 2.5, B = (top.z1 - top.z0) / 2 + 2.5;
  const red = theme.trim === MAT.MUSH_RED, cap = red ? MAT.MUSH_RED : MAT.MUSH_BROWN;
  const layers = red ? [[-1, 0, 0.78], [0, 0, 0], [1, 1, 0], [2, 2.2, 0]] : [[-1, 0, 0.8], [0, 0, 0], [1, 1.5, 0]];
  for (const [dy, shrink, ringOnly] of layers) {
    const a = A - shrink, b = B - shrink;
    if (a < 1 || b < 1) continue;
    const y = base + dy;
    for (let x = Math.floor(cx - a); x <= Math.ceil(cx + a); x++) for (let z = Math.floor(cz - b); z <= Math.ceil(cz + b); z++) {
      const q = ((x - cx) / a) ** 2 + ((z - cz) / b) ** 2;
      if (q > 1 || (ringOnly && q < ringOnly)) continue;
      if (put(world, x, y, z, cap)) info.cap++;
    }
  }
  void rng;
  return info;
}

// ---- Ice palace -----------------------------------------------------------------------------------
// Ice pinnacles on the roof's corners (packed ice, a tip of blue ice); a spire of ice on a tower.
export function iceDress(world, c, rng) {
  const { roofY, top, style } = c;
  const info = { pinnacles: 0, spire: null };
  if (style !== 'house') {
    const busy = roofBusy(c);
    for (const [x, z] of corners4(top)) {
      if (busy(x, z)) continue;
      const y = overRoof(world, x, z, roofY);
      if (y === null || world.has(x, y + 1, z) || world.has(x, y + 2, z)) continue;
      world.set(x, y, z, MAT.PACKED_ICE); world.set(x, y + 1, z, MAT.PACKED_ICE); world.set(x, y + 2, z, MAT.BLUE_ICE);
      info.pinnacles++;
    }
  }
  if (style === 'tower') info.spire = spireOn(world, c, MAT.PACKED_ICE, MAT.BLUE_ICE, MAT.SEA_LANTERN);
  void rng;
  return info;
}

// ---- Crystal / amethyst -----------------------------------------------------------------------------
// Clusters of amethyst bursting from the roof: a few columns of crystal, each with shards round
// its foot and a crystal cluster on its tip (they glow).
export function crystalDress(world, c, rng) {
  const { roofY, top, style } = c;
  const info = { clusters: 0, crystals: 0 };
  const busy = roofBusy(c);
  if (style === 'house' && !c.flatRoof) {
    const peak = peakOver(world, grow(top, 1), roofY);
    const cx = Math.floor((top.x0 + top.x1) / 2), cz = Math.floor((top.z0 + top.z1) / 2);
    if (world.has(cx, peak, cz) && !world.has(cx, peak + 1, cz) && !world.has(cx, peak + 2, cz)) { world.set(cx, peak + 1, cz, MAT.AMETHYST); world.set(cx, peak + 2, cz, MAT.AMETHYST_UP); info.clusters++; info.crystals += 2; }
    return info;
  }
  const inner = grow(top, -1);
  const want = Math.max(1, Math.min(5, Math.floor(((inner.x1 - inner.x0 + 1) * (inner.z1 - inner.z0 + 1)) / 20)));
  for (let t = 0; t < want * 6 && info.clusters < want; t++) {
    const x = inner.x0 + Math.floor(rng() * (inner.x1 - inner.x0 + 1)), z = inner.z0 + Math.floor(rng() * (inner.z1 - inner.z0 + 1));
    const h = 1 + Math.floor(rng() * 3);
    if (!allFree(world, busy, x - 1, x + 1, z - 1, z + 1, roofY + 1, roofY + h + 1) || !solidAt(world, x, roofY, z)) continue;
    for (let y = roofY + 1; y <= roofY + h; y++) { world.set(x, y, z, MAT.AMETHYST); info.crystals++; }
    world.set(x, roofY + h + 1, z, MAT.AMETHYST_UP); info.crystals++;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rng() < 0.6 && solidAt(world, x + a, roofY, z + b)) { world.set(x + a, roofY + 1, z + b, MAT.AMETHYST); world.set(x + a, roofY + 2, z + b, MAT.AMETHYST_UP); info.crystals += 2; }
    info.clusters++;
  }
  return info;
}

// ---- Overgrown ruins ----------------------------------------------------------------------------------
// Stone cracked and mossy (a third of the walls); vines down every side from the roof to head
// height; the parapet broken; on a tower, jagged stumps of wall at the corners; a tree growing on
// the roof of a mid-rise or a tower; moss and rubble over the roof.
const AGED = () => new Map([[MAT.STONEBRICK, [MAT.MOSSY_BRICK, MAT.CRACKED_BRICK]], [MAT.COBBLE, [MAT.MOSSY_COBBLE]], [MAT.TUFF_BRICKS, [MAT.MOSSY_BRICK]], [MAT.MOSSY_BRICK, [MAT.CRACKED_BRICK]]]);
export function ruinsDress(world, c, rng) {
  const { rects, floorYs, roofY, top, style, floors, P, gy, doorCells, theme } = c;
  const info = { aged: 0, vines: 0, broken: 0, stumps: 0, tree: null, moss: 0 };
  const aged = AGED();
  for (let k = 0; k < floors; k++) for (const [x, z] of ringOf(rects[k])) for (let y = floorYs[k] + 1; y <= floorYs[k] + P - 1; y++) {
    const id = world.get(x, y, z), to = aged.get(id);
    if (!to || rng() > 0.33) continue;
    world.set(x, y, z, to[Math.floor(rng() * to.length)]); info.aged++;
  }
  const nearDoor = (x, z) => doorCells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 2);
  const S_ = sides(top);
  for (const side of ['north', 'south', 'east', 'west']) for (const [x, z] of S_[side] || []) {
    if (nearDoor(x, z) || rng() > 0.4) continue;
    const wx = x + (side === 'east' ? -1 : side === 'west' ? 1 : 0), wz = z + (side === 'south' ? -1 : side === 'north' ? 1 : 0);
    let n = 0;
    for (let y = roofY - 1; y >= gy + 3; y--) {
      if (world.has(x, y, z) || !solidAt(world, wx, y, wz)) break;
      world.set(x, y, z, vineId(OPP[side])); n++;
    }
    if (n) info.vines++;
  }
  if (style === 'house' && !c.flatRoof) return info;
  const busy = roofBusy(c);
  // the parapet broken here and there (never by the way out)
  for (const [x, z] of ringOf(top)) {
    if (busy(x, z) || rng() > 0.3) continue;
    const id = world.get(x, roofY + 1, z);
    if (id < 0 || MATERIALS.isPassable(id) || id === MAT.LAMP) continue;
    world.clear(x, roofY + 1, z); info.broken++;
  }
  if (style === 'tower') for (const [x, z] of corners4(top)) {
    if (busy(x, z)) continue;
    const h = 1 + Math.floor(rng() * 4);
    let y = roofY + 1; while (world.has(x, y, z) && y < roofY + 3) y++;
    let n = 0;
    for (let k = 0; k < h; k++) { if (!put(world, x, y + k, z, rng() < 0.5 ? MAT.MOSSY_BRICK : theme.wall)) break; n++; }
    if (n) info.stumps++;
  }
  if (style !== 'house') {
    const inner = grow(top, -3);
    for (let t = 0; t < 12 && !info.tree && inner.x1 >= inner.x0 && inner.z1 >= inner.z0; t++) {
      const x = inner.x0 + Math.floor(rng() * (inner.x1 - inner.x0 + 1)), z = inner.z0 + Math.floor(rng() * (inner.z1 - inner.z0 + 1));
      const h = 3 + Math.floor(rng() * 2);
      if (!solidAt(world, x, roofY, z) || !allFree(world, busy, x - 2, x + 2, z - 2, z + 2, roofY + 1, roofY + h + 3)) continue;
      for (let y = roofY + 1; y <= roofY + h; y++) world.set(x, y, z, MAT.OAK_LOG_R);
      let leaves = 0;
      for (let dy = h - 1; dy <= h + 2; dy++) {
        const r = dy >= h + 2 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
          if (put(world, x + dx, roofY + dy, z + dz, MAT.OAK_LEAF_P)) leaves++;
        }
      }
      info.tree = { at: [x, z], h, leaves };
    }
    for (let x = top.x0 + 1; x < top.x1; x++) for (let z = top.z0 + 1; z < top.z1; z++) {
      if (busy(x, z) || world.has(x, roofY + 1, z) || !solidAt(world, x, roofY, z)) continue;
      const p = rng();
      if (p < 0.3) { world.set(x, roofY + 1, z, MAT.MOSS_CARPET); info.moss++; }
      else if (p < 0.34) world.set(x, roofY + 1, z, rng() < 0.5 ? MAT.MOSSY_COBBLE : MAT.COBBLE);
    }
  }
  return info;
}

export const DRESSES = {
  classical: classicalDress, gothic: gothicDress, nordic: nordicDress, byzantine: byzantineDress,
  western: westernDress, victorian: victorianDress, googie: googieDress, copper: copperDress,
  mushroom: mushroomDress, ice: iceDress, crystal: crystalDress, ruins: ruinsDress,
};
