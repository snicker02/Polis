// engine/jail.js — a jail: every hostile mob that can be held, behind bars.
//
// Fifteen across, twenty-five deep, three floors, built in the lot's own frame
// (u across, v back from the street, y up from the ground G) and set down in the
// world by OUTWARD. A lobby at the front with the stairs; a corridor three wide
// down the middle; cells either side, three wide, four deep, three high, iron
// bars on the corridor. At the back of each floor a hall: the creepers on the
// ground floor, the guardians' tank on the first, the ghasts on the top.
//
// What holds them:
// - walls, floors and roof of polished blackstone bricks: silverfish cannot burrow
//   into them (they can into stone, stone bricks and deepslate), and they stand an
//   explosion as well as stone does;
// - iron bars on the cells: they stand a ghast's fireball (blast resistance 6
//   against its power 1);
// - the corridor's ceiling a slab low (two and a half clear): a player fits, an
//   enderman (2.9 tall) has nowhere there to teleport to;
// - the creepers behind bars six blocks past a fence: a creeper lights within three
//   of a player, so it never does;
// - every room roofed: zombies, skeletons and phantoms never see the sky;
// - every inmate summoned with a name, which keeps a Bedrock mob from despawning.
// Cellmates are chosen not to fight; the zoglin, which attacks anything, is alone.
// Not held (no cell keeps them): the evoker (its vexes pass through walls), the
// vex, the Wither, the Warden, the Ender Dragon, the elder guardian (its curse
// reaches fifty blocks), and the piglins and hoglins, which turn into other mobs
// in the Overworld.

import { MAT, stairId, WEIRDO, signId, SIGN_FACING, railId, RAIL } from './materials.js';
import { OUTWARD } from './building.js';

export const JAIL_SIZE = [15, 23];       // the building, across and deep (a row before it where the lot allows)

// the cells, in the order they are filled: ground floor left then right, then up
export const JAIL_CELLS = [
  { kinds: ['zombie', 'husk', 'drowned', 'zombie_villager'], name: 'Zombies' },
  { kinds: ['skeleton', 'stray', 'bogged'], name: 'Skeletons' },
  { kinds: ['wither_skeleton'], name: 'Wither skeleton' },
  { kinds: ['spider', 'cave_spider'], name: 'Spiders' },
  { kinds: ['enderman'], name: 'Enderman' },
  { kinds: ['endermite', 'silverfish'], name: 'Endermite and silverfish' },
  { kinds: ['witch'], name: 'Witch' },
  { kinds: ['slime'], name: 'Slime' },
  { kinds: ['magma_cube'], name: 'Magma cube' },
  { kinds: ['blaze'], name: 'Blaze' },
  { kinds: ['phantom'], name: 'Phantom' },
  { kinds: ['shulker'], name: 'Shulker' },
  { kinds: ['breeze'], name: 'Breeze' },
  { kinds: ['creaking'], name: 'Creaking' },
  { kinds: ['pillager', 'vindicator'], name: 'Illagers' },
  { kinds: ['ravager'], name: 'Ravager' },
  { kinds: ['zoglin'], name: 'Zoglin' },
];
export const JAIL_HALLS = { creeper: 'creeper', guardian: 'guardian', ghast: 'ghast' };

const W_ = 15, DEPTH = 23, E = 16;        // E: the row the cells end on (three to a side a floor)

export function jail(world, lot, face, cfg, rng, G, signTags = null) {
  const F = OUTWARD[face];
  if (!F) return null;
  const lotW = lot.x1 - lot.x0 + 1, lotD = lot.z1 - lot.z0 + 1;
  const along = F[0] ? lotD : lotW, deep = F[0] ? lotW : lotD;   // along the street, and back from it
  // Front to back (the door in the front wall) where the lot is deep enough; on
  // a lot long beside the street and shallow, turned sideways: the corridor runs
  // beside the street and the door is in the side wall that faces it.
  const sideways = !(along >= W_ && deep >= DEPTH) && along >= DEPTH && deep >= W_;
  if (!sideways && !(along >= W_ && deep >= DEPTH)) return null;
  const toStreet = F, side = [-F[1], F[0]];
  // u runs across the building, v back through it; the world corner they start from
  const across = sideways ? [-toStreet[0], -toStreet[1]] : side;   // sideways: u=0 at the street, rising inward
  const back = sideways ? side : [-toStreet[0], -toStreet[1]];
  const lo = (d, a0, a1) => (d > 0 ? a0 : a1);
  const ox = across[0] ? lo(across[0], lot.x0, lot.x1) : lo(back[0], lot.x0, lot.x1);
  const oz = across[1] ? lo(across[1], lot.z0, lot.z1) : lo(back[1], lot.z0, lot.z1);
  const spanU = sideways ? deep : along, spanV = sideways ? along : deep;
  const u0 = sideways ? (spanU > W_ ? 1 : 0) : Math.floor((spanU - W_) / 2);
  const v0 = sideways ? Math.floor((spanV - DEPTH) / 2) : (spanV > DEPTH ? 1 : 0);
  const at = (u, v) => [ox + (u0 + u) * across[0] + (v0 + v) * back[0], oz + (u0 + u) * across[1] + (v0 + v) * back[1]];
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  // which world direction "across" (+u) and "back" (+v) are, for stair facings
  const dirOf = (d) => (d[0] > 0 ? WEIRDO.east : d[0] < 0 ? WEIRDO.west : d[1] > 0 ? WEIRDO.south : WEIRDO.north);
  const WALL = MAT.JAIL_WALL, SLAB = MAT.JAIL_SLAB;

  const floorY = (f) => G + 4 * f;                              // the floor block; inside, floorY+1..floorY+3
  const ROOF = G + 12, HALL_ROOF = G + 14;                      // the ghasts' hall stands two higher
  const isBack = (v) => v > E && v < DEPTH - 1;
  const topAt = (v) => (v > E ? HALL_ROOF : ROOF);

  // ---- the shell: cleared, then floors, walls and roof ---------------------------------
  for (let v = 0; v < DEPTH; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= HALL_ROOF + 1; y++) clear(u, v, y);
    const edge = u === 0 || u === W_ - 1 || v === 0 || v === DEPTH - 1;
    put(u, v, G, WALL);
    for (const f of [1, 2]) put(u, v, floorY(f), WALL);
    put(u, v, topAt(v), WALL);
    if (edge) for (let y = G + 1; y < topAt(v); y++) put(u, v, y, WALL);
  }

  // ---- each floor: the cells, the corridor, the hall at the back -------------------------
  const inmates = [], cells = [];
  let next = 0;
  const lamp = (u, v, f) => put(u, v, floorY(f) + 3, MAT.LAMP_HANG);
  for (let f = 0; f < 3; f++) {
    const y0 = floorY(f) + 1, y1 = floorY(f) + 3;
    // divider rows (v = 4, 8, 12, 16): walls either side of the corridor
    for (let v = 4; v <= E; v += 4)
      for (let u = 1; u < W_ - 1; u++) {
        if (u >= 6 && u <= 8) continue;
        for (let y = y0; y <= y1; y++) put(u, v, y, WALL);
      }
    // the cells: bars on the corridor, an inmate group in each
    for (let k = 0; k < 3; k++) for (const side of [0, 1]) {
      const va = 5 + 4 * k, vb = va + 2;
      const bars = side === 0 ? 5 : 9;
      const ua = side === 0 ? 1 : 10, ub = side === 0 ? 4 : 13;
      for (let v = va; v <= vb; v++) for (let y = y0; y <= y1; y++) put(bars, v, y, MAT.BARS);
      lamp(Math.floor((ua + ub) / 2), va + 1, f);
      const group = JAIL_CELLS[next++];
      // its sign: on the corridor floor before the bars, facing the corridor
      if (group && signTags) {
        const [sx, sz] = at(side === 0 ? 6 : 8, va + 1);
        const d = side === 0 ? across : [-across[0], -across[1]];
        const nm = d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north';
        world.set(sx, y0, sz, signId(SIGN_FACING[nm]));
        world.setData(sx, y0, sz, { id: 'Sign', tags: signTags(group.name) });
      }
      const cell = { floor: f, side, u: [ua, ub], v: [va, vb], y: [y0, y1], name: group ? group.name : 'empty', kinds: group ? group.kinds : [] };
      cells.push(cell);
      if (group) group.kinds.forEach((kind, i) => {
        // spread along the cell, each in the middle of a block, a block clear of the bars
        const u = side === 0 ? 2 : 11, v = va + (i % 3);
        const [x, z] = at(u, v);
        // An enderman teleports out of any cell; one riding a minecart cannot
        // (found in the game, and saved as a structure). So its cell has a rail
        // down the middle, and it is put in a minecart on it (populate: ride).
        if (kind === 'enderman') {
          const [mx, mz] = at(u, va + 1);
          const alongZ = back[0] === 0;
          world.set(mx, y0, mz, railId(alongZ ? RAIL.NS : RAIL.EW));
          inmates.push({ type: kind, x: mx + 0.5, y: y0, z: mz + 0.5, name: 'Inmate', cell: cells.length - 1, ride: 'minecart' });
          return;
        }
        inmates.push({ type: kind, x: x + 0.5, y: y0, z: z + 0.5, name: 'Inmate', cell: cells.length - 1 });
      });
    }
    // the corridor's ceiling a slab low, its whole length: no enderman fits under it
    for (let v = 4; v <= E; v++) for (let u = 6; u <= 8; u++) put(u, v, y1, SLAB);
    // a fence across the corridor's end: visitors stop at the hall
    for (let u = 6; u <= 8; u++) put(u, E, y0, MAT.FENCE);
  }

  // ---- the halls at the back -----------------------------------------------------------
  const hallRow = (v, f, id, high = 3) => { for (let u = 1; u < W_ - 1; u++) for (let y = floorY(f) + 1; y <= floorY(f) + high; y++) put(u, v, y, id); };
  // ground floor: creepers, behind bars two rows past the fence (five from the
  // nearest visitor: a creeper lights within three)
  hallRow(19, 0, MAT.BARS);
  for (const u of [4, 7, 10]) inmates.push({ type: 'creeper', ...pt(at(u, 21), floorY(0) + 1), name: 'Inmate', hall: 'creeper' });
  // first floor: the guardians' tank, glass across, water behind it
  hallRow(17, 1, MAT.GLASS);
  for (let v = 18; v < DEPTH - 1; v++) for (let u = 1; u < W_ - 1; u++) for (let y = floorY(1) + 1; y <= floorY(1) + 3; y++) put(u, v, y, MAT.WATER);
  for (const u of [3, 7, 11]) put(u, 20, floorY(1), MAT.SEA_LANTERN || MAT.LAMP);
  for (const u of [4, 10]) inmates.push({ type: 'guardian', ...pt(at(u, 19), floorY(1) + 1), name: 'Inmate', hall: 'guardian' });
  // top floor: the ghasts, five high and four deep (a ghast is four across)
  hallRow(17, 2, MAT.BARS, 5);
  for (const u of [5, 9]) inmates.push({ type: 'ghast', ...pt(at(u, 19), floorY(2) + 1), name: 'Inmate', hall: 'ghast' });
  lamp(7, 17, 0);
  put(7, 16, HALL_ROOF - 1, MAT.LAMP_HANG);

  // ---- the lobby: the way in, and the stairs -------------------------------------------
  // the doorway: the middle of the front wall, or (sideways) the wall on the
  // street into the lobby
  const doorAt = sideways ? [0, 2] : [7, 0];
  for (let y = G + 1; y <= G + 2; y++) clear(doorAt[0], doorAt[1], y);
  // ground to first: up along +u on the front row, the first floor opened over it
  const upA = stairId('stonebrick', dirOf(across)), upB = stairId('stonebrick', dirOf([-across[0], -across[1]]));
  for (let i = 0; i < 4; i++) {
    for (let y = G + 1; y < G + 1 + i; y++) put(1 + i, 1, y, WALL);
    put(1 + i, 1, G + 1 + i, upA);
  }
  for (const u of [1, 2, 3]) clear(u, 1, floorY(1));
  // first to top: back along -u from the far side, the top floor opened over it
  for (let i = 0; i < 4; i++) {
    for (let y = floorY(1) + 1; y < floorY(1) + 1 + i; y++) put(13 - i, 1, y, WALL);
    put(13 - i, 1, floorY(1) + 1 + i, upB);
  }
  for (const u of [11, 12, 13]) clear(u, 1, floorY(2));
  for (const f of [0, 1, 2]) lamp(7, 2, f);

  const door = sideways ? at(-1, 2) : at(7, -1);
  return { kind: 'jail', lot, inmates, cells, sideways, door: [door[0], G + 1, door[1]], frame: { at, floorY, E, DEPTH, W: W_ } };
}

const pt = ([x, z], y) => ({ x: x + 0.5, y, z: z + 0.5 });
