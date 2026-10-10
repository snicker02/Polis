// engine/mall.js — a shopping mall, its shopkeepers trading.
//
// Two floors of shops either side of a glass-roofed atrium, laid out in the lot's
// own frame (u across, v back from the street; zoo.js: lotFrame):
//
// - the atrium down the middle: on the ground a walk the length of the mall,
//   planters and benches down its centre; above, a balcony along each row of
//   upper shops (a railing of iron bars on its edge), open between them to the
//   glass roof; a bridge across at the front, a flight of stairs up the middle at
//   the back to a landing joining the two balconies;
// - the shops, five deep, side by side down each side, on both floors: a glass
//   shop front on the atrium with a doorway in it and the shop's name on a sign
//   before it; inside, a display of the shop's goods along its side walls, a
//   lantern; at the back the counter;
// - behind each counter its shopkeeper, a villager of the trade the shop sells,
//   at a high level (every trade open), standing in a booth: walls either side, a
//   canopy over the booth and the counter three over the floor, the counter its
//   own workstation (a lectern for the bookshop, a smoker for the butcher). A
//   villager cannot climb onto the counter with the canopy over it, so it stays
//   where it trades; the player reaches it over the counter.
//
// The thirteen trades, then a cafe, a toy shop and a florist (no shopkeeper):
// sixteen shops, eight a floor, where the lot takes it (twenty-five or twenty-one
// across by twenty-six), twelve on a smaller one (twenty-one or seventeen by twenty;
// on the narrowest the balconies one wide, the shops four).
// No workstation anywhere but the counters (no barrel, no composter in a
// display), so no villager of the city takes a shopkeeper's job block.

import { MAT, stairId, WEIRDO, lecternId, smokerId, stonecutterId, loomId, grindstoneId, furnaceId, chestId, pumpkinId, WOOLS, FLOWERS } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const SHOPS = [
  { name: 'Bookshop', pro: 'librarian', job: 'lectern', show: ['shelf', 'shelf', 'chest'] },
  { name: 'Armourer', pro: 'armorer', job: 'blast', show: ['anvil', 'iron', 'chest'] },
  { name: 'Tool Shop', pro: 'tool_smith', job: 'smithing', show: ['crafting', 'anvil', 'chest'] },
  { name: 'Weapons', pro: 'weaponsmith', job: 'grindstone', show: ['anvil', 'iron', 'chest'] },
  { name: 'Pharmacy', pro: 'cleric', job: 'brewing', show: ['shelf', 'chest', 'shelf'] },
  { name: 'Greengrocer', pro: 'farmer', job: 'composter', show: ['hay', 'melon', 'pumpkin'] },
  { name: 'Butcher', pro: 'butcher', job: 'smoker', show: ['ice', 'chest', 'ice'] },
  { name: 'Fishmonger', pro: 'fisherman', job: 'barrel', show: ['ice', 'ice', 'chest'] },
  { name: 'Map Shop', pro: 'cartographer', job: 'cartography', show: ['shelf', 'crafting', 'shelf'] },
  { name: 'Archery', pro: 'fletcher', job: 'fletching', show: ['hay', 'chest', 'hay'] },
  { name: 'Leather Goods', pro: 'leather_worker', job: 'cauldron', show: ['chest', 'hay', 'chest'] },
  { name: 'Wool Shop', pro: 'shepherd', job: 'loom', show: ['wool', 'wool', 'wool'] },
  { name: 'Stonemason', pro: 'stone_mason', job: 'stonecutter', show: ['stone', 'stone', 'stone'] },
  { name: 'Cafe', show: ['cake', 'seat', 'cake'] },
  { name: 'Toy Shop', show: ['wool', 'note', 'chest'] },
  { name: 'Florist', show: ['flower', 'flower', 'flower'] },
];
// the workstation of each trade, by the name the game knows it by
export const JOB_BLOCK = { lectern: 'lectern', blast: 'blast_furnace', smithing: 'smithing_table', grindstone: 'grindstone',
  brewing: 'brewing_stand', composter: 'composter', smoker: 'smoker', barrel: 'barrel', cartography: 'cartography_table',
  fletching: 'fletching_table', cauldron: 'cauldron', loom: 'loom', stonecutter: 'stonecutter_block' };

// [across, deep, shop width inside, atrium width, shops a side a floor, balcony width]
const SIZES = [[25, 26, 6, 9, 4, 3], [21, 26, 5, 7, 4, 3], [21, 20, 5, 7, 3, 3], [17, 20, 4, 5, 3, 2]];
const FLOORS_OF = [MAT.DARK_PLANKS, MAT.OAK, MAT.SPRUCE, MAT.C_LGRAY, MAT.SMOOTH_SAND, MAT.CHERRY];

export function shoppingMall(world, lot, face, cfg, rng, G, signTags) {
  let fr = null, W, D, SW, A, S, BAL;
  // (square on to its street if any size allows, its doors on the street; turned only if none does)
  for (const turned of [false, true]) {
    for (const s of SIZES) { const f = lotFrame(lot, face, s[0], s[1]); if (f && f.sideways === turned) { fr = f; [W, D, SW, A, S, BAL] = s; break; } }
    if (fr) break;
  }
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign } = h;
  const back = fr.back, across = fr.across, out = neg(back);
  const UP = G + 5, ROOF = G + 10;                       // the upper floor (its floor block), the roof
  const L0 = SW + 1, R0 = W - SW - 2;                    // the shop fronts, left and right
  const V0 = SW + 2 + BAL, V1 = W - SW - 3 - BAL;        // the open well, u from V0 to V1
  const BACK = 6 * S;                                    // the landing row
  const mid = (W - 1) / 2;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const has = (u, v, y) => { const [x, z] = at(u, v); return world.has(x, y, z); };

  // ---- the shell -------------------------------------------------------------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= ROOF + 2; y++) clear(u, v, y);
    put(u, v, G, MAT.SMOOTH_QUARTZ);
    const atrium = u > L0 && u < R0;
    put(u, v, ROOF, atrium && v > 0 && v < D - 1 ? MAT.GLASS : MAT.C_LGRAY);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, y === G + 1 ? MAT.SMOOTH_QUARTZ : y === UP ? MAT.C_LBLUE : MAT.C_WHITE);
  }
  // the front: the atrium glazed floor to roof, a doorway three wide in it; shop windows
  for (let u = L0 + 1; u < R0; u++) for (let y = G + 1; y < ROOF; y++) put(u, 0, y, y === UP ? MAT.C_LBLUE : MAT.GLASS);
  for (const u of [L0, R0]) for (let y = G + 1; y < ROOF; y++) put(u, 0, y, MAT.QUARTZ_PILLAR);
  for (let u = Math.floor(mid) - 1; u <= Math.ceil(mid) + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  for (const base of [G, UP]) for (let u = 2; u < SW; u++) for (let y = base + 2; y <= base + 3; y++) { put(u, 0, y, MAT.GLASS); put(W - 1 - u, 0, y, MAT.GLASS); }

  // ---- the upper floor: over the shops and the balconies, the bridge, the landing ---------
  for (let v = 1; v < D - 1; v++) for (let u = 1; u < W - 1; u++) {
    const well = u >= V0 && u <= V1;
    if (well && v > 3 && v < BACK) continue;             // open to the roof
    if (well && v === D - 1) continue;
    put(u, v, UP, MAT.SMOOTH_QUARTZ);
  }
  // railings: along each balcony's edge, across the bridge's back, round the landing's front
  const rail = [];
  for (let v = 3; v < BACK; v++) for (const u of [V0 - 1, V1 + 1]) { put(u, v, UP + 1, MAT.BARS); rail.push(pos(u, v, UP + 1)); }
  for (let u = V0; u <= V1; u++) { put(u, 3, UP + 1, MAT.BARS); rail.push(pos(u, 3, UP + 1)); }
  // the stairs up the middle of the well, from the ground to the landing (rising toward the back)
  const stairs = [];
  for (let k = 1; k <= 5; k++) {
    const v = BACK - 6 + k;
    for (let u = V0; u <= V1; u++) {
      for (let y = G + 1; y < G + k; y++) put(u, v, y, MAT.QUARTZ);
      put(u, v, G + k, k < 5 ? stairId('quartz', WEIRDO[h.nameOf(back)]) : MAT.SMOOTH_QUARTZ);
      stairs.push(pos(u, v, G + k));
    }
  }

  // ---- the shops ---------------------------------------------------------------------------
  // a shop's cells, by its side (-1 left, +1 right) and its depth inside (0 at the
  // front wall's inner face, SW-1 against the outer wall): its own u
  const U = (side, d) => side < 0 ? L0 - 1 - d : R0 + 1 + d;
  const front = (side) => side < 0 ? L0 : R0;
  const facing = (side) => side < 0 ? across : neg(across);   // the way a shop looks, into the atrium
  const list = SHOPS.slice(0, 4 * S);                    // (S a side, two sides, two floors)
  const shops = [], keepers = [], lanterns = [], displays = [];
  let i = 0;
  for (const base of [G, UP]) for (let k = 0; k < S; k++) for (const side of [-1, 1]) {
    const spec = list[i++];
    const vs = 6 * k + 1;                                // its first row (rows vs..vs+4)
    const look = facing(side), lookName = h.nameOf(look);
    const fl = FLOORS_OF[(i * 5 + k) % FLOORS_OF.length];
    const trim = MAT.DARK_PLANKS;
    // floor, the dividing walls front and back, the shop front
    for (let v = vs; v <= vs + 4; v++) for (let d = 0; d < SW; d++) put(U(side, d), v, base, fl);
    for (const v of [vs - 1, vs + 5]) if (v > 0) for (let d = -1; d < SW; d++) for (let y = base + 1; y <= base + 4; y++) put(U(side, d), v, y, MAT.C_WHITE);
    for (let v = vs; v <= vs + 4; v++) for (let y = base + 1; y <= base + 4; y++) put(front(side), v, y, y === base + 4 ? MAT.C_LBLUE : MAT.GLASS);
    for (const y of [base + 1, base + 2]) clear(front(side), vs + 2, y);                 // the doorway
    if (!spec) continue;
    // the shop's name, on a sign before its door
    const su = side < 0 ? L0 + 1 : R0 - 1;
    sign(su, vs + 1, base + 1, look, spec.name);
    // the counter at the back: the booth (its keeper's cell), the workstation before it,
    // counter tops beside it, a canopy over the booth and the counter
    const bu = U(side, SW - 1), cu = U(side, SW - 2), vm = vs + 2;
    for (const v of [vm - 1, vm + 1]) { for (let y = base + 1; y <= base + 2; y++) put(bu, v, y, trim); put(cu, v, base + 1, MAT.SMOOTH_QUARTZ); }
    for (let v = vm - 1; v <= vm + 1; v++) for (const u of [bu, cu]) put(u, v, base + 3, trim);
    let counter = null;
    if (spec.job) {
      const id = jobBlock(spec.job, lookName);
      put(cu, vm, base + 1, id);
      counter = pos(cu, vm, base + 1);
      const [x, , z] = pos(bu, vm, 0);
      const keeper = { type: 'villager', x, y: base + 1, z, profession: spec.pro, tier: 4, group: 'mall', shop: spec.name };
      keepers.push(keeper);
    } else put(cu, vm, base + 1, MAT.SMOOTH_QUARTZ);
    // the display along the side walls
    const shown = [];
    for (const v of [vs, vs + 4]) for (let d = 1; d < SW - 2; d++) {
      const what = spec.show[(d + v) % spec.show.length];
      const u = U(side, SW - 1 - d);
      const at3 = pos(u, v, base + 1);
      if (place(what, u, v, base, v === vs ? out : back)) shown.push(at3);
    }
    displays.push(...shown);
    // its lantern
    const lu = U(side, Math.floor(SW / 2) - 1);
    put(lu, vm, base + 4, MAT.LAMP_HANG); lanterns.push(pos(lu, vm, base + 4));
    shops.push({ name: spec.name, floor: base === G ? 0 : 1, side, vs, pro: spec.pro || null, job: spec.job ? JOB_BLOCK[spec.job] : null,
      counter, booth: pos(bu, vm, base + 1), door: pos(front(side), vm, base + 1), inside: pos(U(side, 0), vm, base + 1) });
  }
  // what a display cell holds
  function place(what, u, v, base, wallward) {
    const y = base + 1;
    switch (what) {
      case 'shelf': put(u, v, y, MAT.BOOKSHELF); put(u, v, y + 1, MAT.BOOKSHELF); return true;
      case 'anvil': put(u, v, y, MAT.ANVIL); return true;
      case 'iron': put(u, v, y, MAT.IRON); return true;
      case 'chest': put(u, v, y, chestId(h.nameOf(neg(wallward)))); return true;
      case 'crafting': put(u, v, y, MAT.CRAFTING); return true;
      case 'hay': put(u, v, y, MAT.HAY); return true;
      case 'melon': put(u, v, y, MAT.MELON); return true;
      case 'pumpkin': put(u, v, y, pumpkinId(h.nameOf(neg(wallward)))); return true;
      case 'ice': put(u, v, y, MAT.PACKED_ICE); return true;
      case 'wool': put(u, v, y, WOOLS[(u * 3 + v) % WOOLS.length]); put(u, v, y + 1, WOOLS[(u * 3 + v + 4) % WOOLS.length]); return true;
      case 'stone': put(u, v, y, [MAT.STONEBRICK, MAT.CHISELED_STONE, MAT.ANDESITE, MAT.CALCITE][(u + v) % 4]); return true;
      case 'note': put(u, v, y, MAT.NOTEBLOCK); return true;
      case 'cake': put(u, v, y, MAT.CRAFTING); put(u, v, y + 1, MAT.CAKE); return true;
      case 'seat': put(u, v, y, stairId('oak', WEIRDO[h.nameOf(wallward)])); return true;
      case 'flower': put(u, v, base, MAT.GRASS); put(u, v, y, FLOWERS[(u + v) % FLOWERS.length]); return true;
      default: return false;
    }
  }

  // ---- the atrium: planters and benches down the middle of the ground floor ---------------
  const benches = [];
  for (let v = 5; v < BACK - 7; v += 4) {               // (the foot of the stairs kept clear)
    for (let u = V0; u <= V1; u++) { put(u, v, G, MAT.GRASS); put(u, v, G + 1, FLOWERS[(u + v) % FLOWERS.length]); }
    for (const [dv, d] of [[-1, out], [1, back]]) for (let u = V0; u <= V1; u++) {
      if (has(u, v + dv, G + 1)) continue;
      put(u, v + dv, G + 1, stairId('oak', WEIRDO[h.nameOf(neg(d))])); benches.push(pos(u, v + dv, G + 1));
    }
  }
  // lanterns: under the balconies on the ground floor, over the balconies from the roof
  for (let v = 2; v < BACK; v += 4) for (const u of [L0 + 2, R0 - 2]) {
    put(u, v, UP - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, UP - 1));
    put(u, v, ROOF - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, ROOF - 1));
  }
  for (const v of [2, BACK]) { const u = Math.round(mid); if (!has(u, v, UP - 1)) { put(u, v, UP - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, UP - 1)); } }
  const door = at(Math.round(mid), -1);
  const nameAt = pos(Math.floor(mid) - 2, 1, G + 1);     // its name inside the glass front, read from the street
  return { kind: 'mall', nameAt, lot, shops, keepers, lanterns, benches, rail, stairs, displays, wide: W, deep: D, noLighting: true, sideways: fr.sideways,
    door: [door[0], G + 1, door[1]], frame: { at, W, D, SW, S, UP, ROOF, L0, R0, V0, V1, BACK } };
}

// a trade's workstation, facing the way given (into the shop)
function jobBlock(job, f) {
  switch (job) {
    case 'lectern': return lecternId(f);
    case 'blast': return furnaceId('blast', f);
    case 'smithing': return MAT.SMITHING;
    case 'grindstone': return grindstoneId(f);
    case 'brewing': return MAT.BREWING;
    case 'composter': return MAT.COMPOSTER;
    case 'smoker': return smokerId(f);
    case 'barrel': return MAT.BARREL;
    case 'cartography': return MAT.CARTOGRAPHY;
    case 'fletching': return MAT.FLETCHING;
    case 'cauldron': return MAT.CAULDRON;
    case 'loom': return loomId(f);
    case 'stonecutter': return stonecutterId(f);
    default: return MAT.SMOOTH_QUARTZ;
  }
}
