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

// the cells, in the order they are filled: ground floor left then right, then up.
// One group a cell; the zombies in two cells, not four to one.
export const JAIL_CELLS = [
  { kinds: ['zombie', 'husk'], name: 'Zombies' },
  { kinds: ['drowned', 'zombie_villager'], name: 'Drowned and zombie villager' },
  { kinds: ['skeleton', 'stray', 'bogged'], name: 'Skeletons' },
  { kinds: ['wither_skeleton'], name: 'Wither skeleton' },
  { kinds: ['spider', 'cave_spider'], name: 'Spiders' },
  { kinds: ['enderman'], name: 'Enderman', ride: true },
  { kinds: ['endermite', 'silverfish'], name: 'Endermite and silverfish' },
  { kinds: ['witch'], name: 'Witch' },
  { kinds: ['slime'], name: 'Slime' },
  { kinds: ['magma_cube'], name: 'Magma cube' },
  { kinds: ['blaze'], name: 'Blaze' },
  { kinds: ['phantom'], name: 'Phantom' },
  { kinds: ['shulker'], name: 'Shulker', ride: true },
  { kinds: ['breeze'], name: 'Breeze' },
  { kinds: ['creaking'], name: 'Creaking' },
  { kinds: ['pillager', 'vindicator'], name: 'Illagers' },
  { kinds: ['ravager'], name: 'Ravager' },
  { kinds: ['zoglin'], name: 'Zoglin' },
];
export const JAIL_HALLS = { creeper: 'creeper', guardian: 'guardian', ghast: 'ghast' };
// how wide each is, at its biggest (a slime or magma cube at its largest size)
export const MOB_WIDTH = { ravager: 1.95, slime: 2.08, magma_cube: 2.08, spider: 1.4, zoglin: 1.4, wither_skeleton: 0.7, ghast: 4, guardian: 0.85 };

const W_ = 15, DEPTH = 23, E = 16, FLOORS = 5, STOREY = 5;   // a floor every five: four clear inside

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
  const dirOf = (d) => (d[0] > 0 ? WEIRDO.east : d[0] < 0 ? WEIRDO.west : d[1] > 0 ? WEIRDO.south : WEIRDO.north);
  const nameOf = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
  // the middle of a run of cells, in the world (the midpoint of its two ends' blocks)
  const mid = (ua, ub, va, vb) => { const [xa, za] = at(ua, va), [xb, zb] = at(ub, vb); return [(xa + xb) / 2 + 0.5, (za + zb) / 2 + 0.5]; };
  const WALL = MAT.JAIL_WALL, SLAB = MAT.JAIL_SLAB;

  const floorY = (f) => G + STOREY * f;                            // the floor block; inside, floorY+1..floorY+4
  const ROOF = floorY(FLOORS);
  const HALL_UP = 1;                                               // the ghasts' hall a block higher (five clear)

  // ---- the shell: cleared, then every floor, the walls, the roof -------------------------
  for (let v = 0; v < DEPTH; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= ROOF + 1; y++) clear(u, v, y);
    const edge = u === 0 || u === W_ - 1 || v === 0 || v === DEPTH - 1;
    for (let f = 0; f <= FLOORS; f++) put(u, v, floorY(f), WALL);
    if (edge) for (let y = G + 1; y < ROOF; y++) put(u, v, y, WALL);
  }

  const inmates = [], cells = [];
  let next = 0;
  const lamp = (u, v, f) => put(u, v, floorY(f) + 4, MAT.LAMP_HANG);
  for (let f = 0; f < FLOORS; f++) {
    const y0 = floorY(f) + 1, y1 = floorY(f) + 4;
    // divider rows (v = 4, 10, 16): walls either side of the corridor
    for (const v of [4, 10, E]) for (let u = 1; u < W_ - 1; u++) {
      if (u >= 6 && u <= 8) continue;
      for (let y = y0; y <= y1; y++) put(u, v, y, WALL);
    }
    // two cells a side: four deep, five wide, four high, bars on the corridor
    for (let k = 0; k < 2; k++) for (const sd of [0, 1]) {
      const va = 5 + 6 * k, vb = va + 4;
      const bars = sd === 0 ? 5 : 9;
      const ua = sd === 0 ? 1 : 10, ub = sd === 0 ? 4 : 13;
      for (let v = va; v <= vb; v++) for (let y = y0; y <= y1; y++) put(bars, v, y, MAT.BARS);
      lamp(sd === 0 ? 2 : 12, va + 2, f);
      const group = JAIL_CELLS[next++];
      // its sign: on the corridor floor before the bars, facing the corridor
      if (group && signTags) {
        const [sx, sz] = at(sd === 0 ? 6 : 8, va + 2);
        const d = sd === 0 ? across : [-across[0], -across[1]];
        world.set(sx, y0, sz, signId(SIGN_FACING[nameOf(d)]));
        world.setData(sx, y0, sz, { id: 'Sign', tags: signTags(group.name) });
      }
      cells.push({ floor: f, side: sd, u: [ua, ub], v: [va, vb], y: [y0, y1], name: group ? group.name : 'empty', kinds: group ? group.kinds : [] });
      if (!group) continue;
      const [cx, cz] = mid(ua, ub, va, vb);
      // An enderman, or a shulker, teleports out of any cell; riding a minecart
      // neither can (found in the game: a rail, a minecart, the enderman in it).
      // So such a cell has a rail down its middle and its inmate rides on it.
      if (group.ride) {
        const [rx, rz] = at(sd === 0 ? 2 : 12, va + 2);
        world.set(rx, y0, rz, railId(back[0] === 0 ? RAIL.NS : RAIL.EW));
        inmates.push({ type: group.kinds[0], x: rx + 0.5, y: y0, z: rz + 0.5, name: 'Inmate', cell: cells.length - 1, ride: 'minecart' });
        continue;
      }
      // the rest near the middle, a block apart: every one a block clear of the walls
      const spots = [[0, 0], [0, -1.5], [0, 1.5], [0, 0]];
      group.kinds.forEach((kind, i) => {
        const [du, dv] = spots[i % spots.length];
        inmates.push({ type: kind, x: cx + du * across[0] + dv * back[0], y: y0, z: cz + du * across[1] + dv * back[1], name: 'Inmate', cell: cells.length - 1 });
      });
    }
    // the corridor's ceiling a slab low, its whole length: no enderman fits under it
    for (let v = 4; v <= E; v++) for (let u = 6; u <= 8; u++) { put(u, v, y1 - 1, SLAB); put(u, v, y1, WALL); }
    // the back: a hall on the lower three floors, walled up above them
    if (f < 3) for (let u = 6; u <= 8; u++) put(u, E, y0, MAT.FENCE);
    else for (let v = E; v < DEPTH - 1; v++) for (let u = 1; u < W_ - 1; u++) for (let y = y0; y <= y1; y++) put(u, v, y, WALL);
  }

  // ---- the halls at the back -----------------------------------------------------------
  const hallRow = (v, f, id, high = 4) => { for (let u = 1; u < W_ - 1; u++) for (let y = floorY(f) + 1; y <= floorY(f) + high; y++) put(u, v, y, id); };
  // ground floor: creepers, behind bars two rows past the fence (five from the
  // nearest visitor: a creeper lights within three)
  hallRow(19, 0, MAT.BARS);
  for (const u of [4, 7, 10]) inmates.push({ type: 'creeper', ...pt(at(u, 21), floorY(0) + 1), name: 'Inmate', hall: 'creeper' });
  // first floor: the guardians' tank, glass across, water three deep, a block of air
  hallRow(17, 1, MAT.GLASS);
  for (let v = 18; v < DEPTH - 1; v++) for (let u = 1; u < W_ - 1; u++) for (let y = floorY(1) + 1; y <= floorY(1) + 3; y++) put(u, v, y, MAT.WATER);
  for (const u of [3, 7, 11]) put(u, 20, floorY(1), MAT.SEA_LANTERN || MAT.LAMP);
  for (const u of [4, 10]) inmates.push({ type: 'guardian', ...pt(at(u, 19), floorY(1) + 1), name: 'Inmate', hall: 'guardian' });
  // second floor: the ghasts, five clear (into the walled-up floor above) and four deep
  for (let v = E + 1; v < DEPTH - 1; v++) for (let u = 1; u < W_ - 1; u++) clear(u, v, floorY(3));
  hallRow(17, 2, MAT.BARS, 4 + HALL_UP);
  for (const u of [5, 9]) inmates.push({ type: 'ghast', ...pt(at(u, 19), floorY(2) + 1), name: 'Inmate', hall: 'ghast' });
  for (const f of [0, 1, 2]) lamp(7, 17, f);

  // ---- the lobby: the way in, and the stairs -------------------------------------------
  const doorAt = sideways ? [0, 2] : [7, 0];
  for (let y = G + 1; y <= G + 2; y++) clear(doorAt[0], doorAt[1], y);
  // a flight a floor, five steps on the front row, sides in turn; the floor above
  // opened over each
  const upA = stairId('stonebrick', dirOf(across)), upB = stairId('stonebrick', dirOf([-across[0], -across[1]]));
  for (let f = 0; f < FLOORS - 1; f++) {
    const A = f % 2 === 0, base = floorY(f);
    for (let i = 0; i < STOREY; i++) {
      const u = A ? 1 + i : 13 - i;
      for (let y = base + 1; y < base + 1 + i; y++) put(u, 1, y, WALL);
      put(u, 1, base + 1 + i, A ? upA : upB);
    }
    for (let i = 1; i < STOREY - 1; i++) clear(A ? 1 + i : 13 - i, 1, floorY(f + 1));   // (the top step stays: it is the floor's edge)
  }
  for (let f = 0; f < FLOORS; f++) lamp(7, 2, f);

  const door = sideways ? at(-1, 2) : at(7, -1);
  return { kind: 'jail', lot, inmates, cells, sideways, door: [door[0], G + 1, door[1]], frame: { at, floorY, E, DEPTH, W: W_, FLOORS } };
}

const pt = ([x, z], y) => ({ x: x + 0.5, y, z: z + 0.5 });
