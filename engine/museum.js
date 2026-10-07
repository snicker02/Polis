// engine/museum.js — a museum: fossils, minerals, armour, relics and paintings.
//
// Nineteen across, twenty-four deep, one tall storey (six clear), in smooth quartz,
// laid out in the lot's own frame (u across, v back from the street; zoo.js:
// lotFrame) and set down by OUTWARD, turned sideways on a lot long beside its
// street. A portico of quartz pillars before a broad doorway; inside:
//
// - the entrance hall: a reception desk with a lectern (a villager's job), and the
//   relic wall: item frames down both side walls, each holding one rare thing;
// - the fossil hall (the left half behind): a dinosaur's skeleton in bone blocks on
//   a plinth, and along the outer wall the gallery: real paintings, the same motifs
//   and sizes the buildings hang (entities.js: PAINTINGS), on solid wall;
// - the minerals gallery: cases of every ore and gem, each a quartz pedestal, the
//   block, and a glass case over it;
// - the armour room: six armour stands, leather to netherite (summoned in populate,
//   dressed with replaceitem: standard item names only, so the function loads).
//
// A sign at every room. The name sign is the landmarks' own.

import { MAT, signId, SIGN_FACING, lecternId } from './materials.js';
import { N } from './blockcore.js';
import { lotFrame } from './zoo.js';
import { PAINTINGS } from './entities.js';

export const MUSEUM_SIZE = [19, 24];       // (or fifteen across where the lot is narrower)
export const MINERALS = ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore', 'quartz_ore', 'ancient_debris',
  'raw_iron_block', 'raw_copper_block', 'raw_gold_block', 'amethyst_block', 'diamond_block', 'emerald_block', 'copper_block', 'exposed_copper', 'weathered_copper', 'oxidized_copper'];
// the relics, one to a frame (an item's name in a frame's block entity: a wrong
// one only leaves the frame empty, it cannot stop anything loading)
export const RELICS = ['minecraft:trident', 'minecraft:totem_of_undying', 'minecraft:heart_of_the_sea', 'minecraft:nether_star', 'minecraft:elytra', 'minecraft:mace',
  'minecraft:spyglass', 'minecraft:nautilus_shell', 'minecraft:recovery_compass', 'minecraft:echo_shard', 'minecraft:goat_horn', 'minecraft:music_disc_13'];
export const ARMOUR = ['leather', 'chainmail', 'iron', 'golden', 'diamond', 'netherite'];
export const ARMOUR_SLOTS = [['slot.armor.head', 'helmet'], ['slot.armor.chest', 'chestplate'], ['slot.armor.legs', 'leggings'], ['slot.armor.feet', 'boots']];

const D_ = 24, H = 6;

// The dinosaur, whole: its bones in its own frame (a along its body from the
// head, h up from the hall's floor, the plinth at 1, s to either side of its
// spine). Three across: a skull with an open mouth, a ribcage both sides, a
// pelvis, two legs with their toes forward, little arms, a tail tapering down.
// (Drawn one block thick, from the doorway it read as a pillar.)
const SKELETON = [];
{
  const add = (a, h, ...ss) => { for (const sd of ss) SKELETON.push([a, h, sd]); };
  // the skull: three across, two long, two high, its mouth open at the front
  for (const a of [0, 1]) for (const h of [5, 6]) for (const sd of [-1, 0, 1]) if (!(a === 0 && h === 5 && sd === 0)) add(a, h, sd);
  add(2, 5, 0);                                       // the neck
  for (let a = 3; a <= 7; a++) add(a, 5, 0);          // the spine
  for (let a = 4; a <= 6; a++) { add(a, 4, -1, 1); add(a, 3, -1, 1); }   // the ribs, both sides
  add(3, 4, -1, 1);                                   // the arms
  add(7, 4, -1, 0, 1);                                // the pelvis
  add(7, 3, -1, 1); add(7, 2, -1, 1); add(6, 2, -1, 1);   // the legs, the toes forward
  add(8, 5, 0); add(9, 4, 0); add(10, 3, 0);          // the tail, coming down
}

export function museum(world, lot, face, cfg, rng, G, signTags) {
  // nineteen across where the lot allows, else fifteen: the same rooms, the
  // galleries narrower and the minerals' aisles a block wide
  let W_ = 19, fr = lotFrame(lot, face, 19, D_);
  if (!fr) { W_ = 15; fr = lotFrame(lot, face, 15, D_); }
  if (!fr) return null;
  const MID = (W_ - 1) / 2;                                   // the wall down the middle behind the hall
  const leftC = Math.floor(MID / 2), rightC = Math.floor((MID + 1 + W_ - 2) / 2);   // the rooms' middles
  const leftDoor = leftC - 1, rightDoor = rightC - 1;          // their doorways, three wide from here
  const { at } = fr;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const nameOf = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
  const neg = (d) => [-d[0], -d[1]];
  // (a sign faces the way its reader comes from: toward the street, for one met
  // walking in)
  const sign = (u, v, d, text) => { const [x, z] = at(u, v); world.set(x, G + 1, z, signId(SIGN_FACING[nameOf(d)])); world.setData(x, G + 1, z, { id: 'Sign', tags: signTags(text) }); };
  const ROOF = G + H + 1, FRONT = 2;

  // ---- the shell -----------------------------------------------------------------------
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= ROOF + 2; y++) clear(u, v, y);
    put(u, v, G, v < FRONT ? MAT.MUSEUM_PLINTH : MAT.SMOOTH);          // the steps' landing, the floor
    if (v < FRONT) continue;
    put(u, v, ROOF, MAT.SMOOTH_QUARTZ);
    if (u === 0 || u === W_ - 1 || v === FRONT || v === D_ - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, MAT.SMOOTH_QUARTZ);
  }
  // the portico: pillars along the front, a roof over them
  for (let u = 1; u < W_ - 1; u += 3) for (let y = G + 1; y < ROOF; y++) put(u, 0, y, MAT.QUARTZ_PILLAR);
  for (let v = 0; v < FRONT; v++) for (let u = 0; u < W_; u++) put(u, v, ROOF, MAT.SMOOTH_QUARTZ);
  // the doorway, three wide and three high
  for (let u = MID - 1; u <= MID + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, FRONT, y);

  // ---- the rooms: a wall across behind the hall, one between the right-hand rooms --------
  const HALL_END = 9, RIGHT_SPLIT = 16;
  for (let u = 1; u < W_ - 1; u++) for (let y = G + 1; y < ROOF; y++) put(u, HALL_END, y, MAT.SMOOTH_QUARTZ);
  for (let v = HALL_END; v < D_ - 1; v++) for (let y = G + 1; y < ROOF; y++) put(MID, v, y, MAT.SMOOTH_QUARTZ);
  for (let u = MID + 1; u < W_ - 1; u++) for (let y = G + 1; y < ROOF; y++) put(u, RIGHT_SPLIT, y, MAT.SMOOTH_QUARTZ);
  // their doorways, three wide (the armour room's through the minerals)
  for (const [u0, v] of [[leftDoor, HALL_END], [rightDoor, HALL_END], [rightDoor, RIGHT_SPLIT]]) for (let u = u0; u < u0 + 3; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, v, y);
  // lanterns hung from the ceiling, every room
  for (const [u, v] of [[leftC, 5], [rightC, 5], [leftC, 12], [leftC, 19], [rightC, 12], [rightC, 19]]) put(u, v, ROOF - 1, MAT.LAMP_HANG);

  // ---- the entrance hall: the desk, and the relic wall --------------------------------
  for (let u = MID - 2; u <= MID + 2; u++) put(u, 7, G + 1, MAT.SMOOTH_QUARTZ);    // the desk
  { const [x, z] = at(MID, 8); world.set(x, G + 1, z, lecternId(fr.back[0] > 0 ? 'east' : fr.back[0] < 0 ? 'west' : fr.back[1] > 0 ? 'south' : 'north')); }
  // the frames on the inside of both side walls, two rows, facing into the hall
  const FACING = { north: 2, south: 3, west: 4, east: 5 };
  const frames = [];
  let r = 0;
  for (const [u, inward] of [[1, fr.across], [W_ - 2, neg(fr.across)]]) for (const y of [G + 2, G + 4]) for (const v of [3, 5, 7]) {
    if (r >= RELICS.length) break;
    const [x, z] = at(u, v);
    world.set(x, y, z, MAT['FRAME_' + FACING[nameOf(inward)]]);
    world.setData(x, y, z, { id: 'ItemFrame', tags: {
      Item: N.comp({ Count: N.byte(1), Damage: N.short(0), Name: N.str(RELICS[r]), WasPickedUp: N.byte(0) }),
      ItemDropChance: N.float(1), ItemRotation: N.float(0) } });
    frames.push({ x, y, z, item: RELICS[r++] });
  }
  sign(MID - 2, 3, neg(fr.back), 'Relics');

  // ---- the fossil hall: the skeleton on its plinth ----------------------------------------
  // (two blocks clear of the doorway, a raised plinth a block high under it, the
  // visitors' way past it on both sides)
  const spineU = leftC, a0 = HALL_END + 2;
  for (let a = 0; a <= 10; a++) for (let sd = -1; sd <= 1; sd++) put(spineU + sd, a0 + a, G + 1, MAT.MUSEUM_PLINTH);
  const bones = [];
  const has = (a, h, sd) => SKELETON.some(([b, k, t]) => b === a && k === h && t === sd);
  const lengthways = fr.back[0] !== 0 ? MAT.BONE_X : MAT.BONE_Z, crossways = fr.across[0] !== 0 ? MAT.BONE_X : MAT.BONE_Z;
  for (const [a, h, sd] of SKELETON) {
    const [x, z] = at(spineU + sd, a0 + a);
    // each bone lies the way its run goes: up a leg, along the spine, across the skull
    const id = has(a, h + 1, sd) || has(a, h - 1, sd) ? MAT.BONE_Y : has(a + 1, h, sd) || has(a - 1, h, sd) ? lengthways : has(a, h, sd + 1) || has(a, h, sd - 1) ? crossways : MAT.BONE_Y;
    world.set(x, G + h, z, id);
    bones.push([x, G + h, z]);
  }
  sign(Math.max(1, leftDoor - 1), HALL_END + 1, neg(fr.back), 'Fossils');

  // ---- the gallery: paintings along the fossil hall's outer wall --------------------------
  const paintings = [];
  {
    const inward = fr.across, dir = { south: 0, west: 1, north: 2, east: 3 }[nameOf(inward)];
    const y0 = G + 3;
    const sizes = PAINTINGS.slice().filter((p) => p.h <= 2 && p.w <= 2).sort((a, b) => b.w * b.h - a.w * a.h);
    let v = HALL_END + 2, k = 0;
    while (v < D_ - 2 && sizes.length) {
      const p = sizes[(k++ * 7) % sizes.length];
      if (v + p.w - 1 > D_ - 2) break;
      const cells = new Set(), xs = [], zs = [];
      for (let i = 0; i < p.w; i++) for (let j = 0; j < p.h; j++) { const [x, z] = at(1, v + i); cells.add(`${x},${y0 + j},${z}`); xs.push(x); zs.push(z); }
      // the centre, a thirty-second off the wall's face, the anchor the lowest corner
      const [wx, wz] = at(0, v), [ix, iz] = at(1, v);
      const alongX = fr.back[0] !== 0;                           // the wall runs along x
      const faceC = alongX ? (iz > wz ? wz + 1 : wz) : (ix > wx ? wx + 1 : wx);
      const n = alongX ? Math.sign(iz - wz) : Math.sign(ix - wx);
      const lo = alongX ? Math.min(...xs) : Math.min(...zs);
      const cu = lo + p.w / 2, cy = y0 + p.h / 2;
      const pos = alongX ? [cu, cy, faceC + n * 0.03125] : [faceC + n * 0.03125, cy, cu];
      const anchor = alongX ? [lo, y0, iz] : [ix, y0, lo];
      paintings.push({ type: 'painting', motif: p.motif, direction: dir, pos, h: p.h, face: faceC, x: anchor[0], y: anchor[1], z: anchor[2], cells });
      v += p.w + 1;
    }
  }

  // ---- the minerals: a pedestal, the block, a glass case, along both walls and an island -----
  const cases = [];
  const spots = [];
  for (let v = HALL_END + 1; v < RIGHT_SPLIT; v++) { spots.push([MID + 1, v]); spots.push([W_ - 2, v]); }
  for (let v = HALL_END + 2; v < RIGHT_SPLIT - 1; v++) for (const u of [rightC, rightC + 1]) spots.push([u, v]);
  spots.forEach(([u, v], i) => {
    if (i >= MINERALS.length) return;
    if (u >= rightDoor && u <= rightDoor + 2 && v === HALL_END + 1) return;   // (the doorway's way in kept clear)
    put(u, v, G + 1, MAT.QUARTZ_PILLAR);
    put(u, v, G + 2, MAT['MIN_' + MINERALS[i].toUpperCase()]);
    put(u, v, G + 3, MAT.GLASS);
    const [x, z] = at(u, v);
    cases.push({ x, y: G + 2, z, block: 'minecraft:' + MINERALS[i] });
  });
  sign(rightDoor, HALL_END + 1, neg(fr.back), 'Minerals');

  // ---- the armour room: six stands down its sides, facing in ------------------------------
  const stands = [];
  const yRot = (d) => ({ south: 0, west: 90, north: 180, east: -90 })[nameOf(d)];
  ARMOUR.forEach((set, i) => {
    const left = i < 3, u = left ? MID + 1 : W_ - 2, v = RIGHT_SPLIT + 2 + (i % 3) * 2;
    const [x, z] = at(u, v);
    stands.push({ type: 'armor_stand', set, x: x + 0.5, y: G + 1, z: z + 0.5, yRot: yRot(left ? fr.across : neg(fr.across)) });
  });
  sign(rightDoor, RIGHT_SPLIT + 1, neg(fr.back), 'Armour');

  const door = at(MID, -1);
  return { kind: 'museum', lot, frames, cases, bones, paintings, stands, sideways: fr.sideways, wide: W_,
    door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_, H, HALL_END, RIGHT_SPLIT, MID, leftC, rightC } };
}
