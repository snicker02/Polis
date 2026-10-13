// engine/bank.js — a bank: a marble hall, teller windows, and a vault behind an iron
// door that opens to a combination of levers.
//
// Seventeen by twenty-one, in the lot's own frame (zoo.js: lotFrame: u across, v back
// from the street). Quartz and calcite, quartz pillars down the hall, chandeliers:
//
// - the hall inside the doors, customers' side, its floor a quartz and calcite check;
// - the counter across it, three teller windows in a screen of iron bars, a gap at its
//   end into the tellers' side (the manager's desk at the far end, and on it, for
//   those who look, the code);
// - on the tellers' back wall, five levers, and beside them the vault's iron door with
//   a redstone lamp over it that lights when the levers are set right;
// - the lock behind the wall, sealed, lit, glass to see it from the vault: each lever on
//   a block. A lever that should be on has a redstone torch on the back of its block:
//   lit while the lever is off (wrong). A lever that should be off has dust behind its
//   block: powered while the lever is on (wrong). All of them run into one line of dust,
//   a block at its end: powered while any lever is wrong. On that block a torch: lit
//   only when nothing is wrong; it powers the dust beside it, which powers the wall
//   block beside the door's upper half: the door opens, and the lamp over it lights;
// - inside the vault a button by the door to let yourself out; gold blocks stacked
//   along the walls, chests of emeralds, and across the back a safe-deposit wall of
//   barrels in an iron frame, some with something in them.

import { MAT, MATERIALS, B, I, S, chestId, ironDoorId, DIR, wallSignId } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';
import { N } from './blockcore.js';

export const BANK_SIZE = [17, 21];
const lever = (dir) => MATERIALS.add(null, 'minecraft:lever', '#6a5a4a', { lever_direction: S(dir), open_bit: B(0) });
const DUST = () => MATERIALS.add(null, 'minecraft:redstone_wire', '#a01010', { redstone_signal: I(0) });
const TORCH = (side) => MATERIALS.add(null, 'minecraft:redstone_torch', '#d03020', { torch_facing_direction: S(side) }, { passable: true, transparent: true });
const RLAMP = () => MATERIALS.add(null, 'minecraft:redstone_lamp', '#8a5a3a', {});
const FACING_NUM = { north: 2, south: 3, west: 4, east: 5 };
const button = (dir) => MATERIALS.add(null, 'minecraft:stone_button', '#8a8a8a', { button_pressed_bit: B(0), facing_direction: I(FACING_NUM[dir]) });
const barrelId = (dir) => MATERIALS.add(null, 'minecraft:barrel', '#7d5a34', { facing_direction: I(FACING_NUM[dir]), open_bit: B(0) });
const item = (name, count, slot) => N.comp({ Count: N.byte(count), Damage: N.short(0), Name: N.str(name), Slot: N.byte(slot), WasPickedUp: N.byte(0) });

// the code: five levers, on or off, from the city's own seed; never all one way
export function bankCode(seed) {
  let s = (seed * 2654435761) >>> 0;
  for (;;) {
    s = (s * 1103515245 + 12345) >>> 0;
    const bits = [0, 1, 2, 3, 4].map((k) => ((s >>> (8 + k)) & 1) === 1);
    if (bits.some(Boolean) && bits.some((b) => !b)) return bits;
  }
}

export function bank(world, lot, face, cfg, rng, G, signTags) {
  const [W, D] = BANK_SIZE, H = 7, TOP = G + H + 1;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, nameOf, sign } = h;
  const back = fr.back, across = fr.across;
  const BACK = nameOf(back), FRONT = nameOf(neg(back)), RIGHT = nameOf(across), LEFT = nameOf(neg(across));
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const wallSign = (u, v, y, faceName, text) => { const [x, z] = at(u, v); world.set(x, y, z, wallSignId(faceName)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const mid = 8, TC = 7, VW = 11;                     // the middle; the counter's row; the tellers' back wall
  const UD = 13;                                      // the vault door
  const LEVERS = [1, 3, 5, 7, 9];                     // the levers, two apart
  const code = bankCode(cfg.seed || 1);
  // (which way u runs for someone facing the back wall: to their right, or to their
  // left. The frame turns either way with the lot, and the code was read out in u's
  // order, which for half the lots was right to left: the sign's code did not open it)
  const uToRight = across[0] * -back[1] + across[1] * back[0] > 0;
  const CALCITE = MAT.CALCITE;

  // ---- the shell ------------------------------------------------------------------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 2; y++) clear(u, v, y);
    put(u, v, G - 1, MAT.STONEBRICK);
    put(u, v, G, v < VW ? ((u + v) % 2 ? CALCITE : MAT.QUARTZ) : MAT.SMOOTH);
    put(u, v, TOP, MAT.QUARTZ);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < TOP; y++) put(u, v, y, y === G + 1 || y === TOP - 1 ? MAT.CHISELED_QUARTZ : MAT.QUARTZ);
  }
  for (let u = mid - 1; u <= mid + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  for (const u of [2, 5, 11, 14]) for (let y = G + 2; y <= G + 5; y++) put(u, 0, y, MAT.GLASS);
  // the pillars down the hall
  for (const u of [3, 13]) for (const v of [2, 5]) for (let y = G + 1; y < TOP; y++) put(u, v, y, MAT.QUARTZ_PILLAR);
  // chandeliers
  const lights = [];
  for (const [u, v] of [[5, 3], [11, 3], [8, 5], [8, 9], [3, 9]]) { put(u, v, TOP - 1, MAT.LAMP_HANG); lights.push(pos(u, v, TOP - 1)); }
  // (and sea lanterns set in the walls three up: the hall is too high for its chandeliers to light the floor)
  for (let v = 2; v < D - 1; v += 3) for (const u of [0, W - 1]) { put(u, v, G + 3, MAT.SEA_LANTERN); lights.push(pos(u, v, G + 3)); }
  for (const u of [4, 12]) { put(u, 0, G + 3, MAT.SEA_LANTERN); lights.push(pos(u, 0, G + 3)); }
  // (and set in the floor down the middle of the hall and the vault)
  for (const [u, v] of [[8, 3], [6, 5], [10, 5], [8, 17], [5, 17], [11, 17]]) { put(u, v, G, MAT.SEA_LANTERN); lights.push(pos(u, v, G)); }
  sign(mid + 3, 1, G + 1, neg(back), 'Bank\nteller windows\nahead');

  // ---- the counter and the teller windows ------------------------------------------------------
  const windows = [];
  for (let u = 1; u <= W - 3; u++) {
    put(u, TC, G + 1, MAT.QUARTZ);
    const isWindow = u === 4 || u === 8 || u === 12;
    for (let y = G + 2; y <= G + 3; y++) if (!isWindow) put(u, TC, y, MAT.BARS);
    put(u, TC, G + 4, MAT.CHISELED_QUARTZ);
    if (isWindow) { windows.push(pos(u, TC, G + 2)); wallSign(u, TC - 1, G + 4, FRONT, `Teller ${uToRight ? windows.length : 4 - windows.length}`); }
  }
  // (the gap at its end, W - 2, the way through to the tellers' side)
  // the manager's desk at the far end of the tellers' side, the code on a sign on it
  put(1, VW - 1, G + 1, MAT.DARK_PLANKS); put(1, VW - 2, G + 1, MAT.DARK_PLANKS);
  const leftToRight = uToRight ? code : code.slice().reverse();
  const codeWords = leftToRight.map((b) => (b ? 'on' : 'off')).join(' ');
  const hint = wallSign(1, VW - 3, G + 2, RIGHT, `Vault code, left\nto right:\n${codeWords}\n(on: lever down)`);

  // ---- the levers and the vault door on the tellers' back wall ------------------------------------
  for (let u = 1; u <= W - 2; u++) for (let y = G + 1; y < TOP; y++) put(u, VW, y, y === G + 1 ? MAT.CHISELED_QUARTZ : MAT.QUARTZ);
  const levers = [];
  for (let k = 0; k < LEVERS.length; k++) {
    const u = LEVERS[k];
    put(u, VW, G + 2, MAT.QUARTZ);                                  // the lever's block (in the wall)
    put(u, VW - 1, G + 2, lever(FRONT));
    levers.push({ lever: pos(u, VW - 1, G + 2), block: pos(u, VW, G + 2), on: code[k] });
  }
  wallSign(LEVERS[2], VW - 1, G + 3, FRONT, 'Vault\nset the levers\nto open the door');
  for (const u of [2, 6, 10, 15]) { put(u, VW, G + 5, MAT.SEA_LANTERN); lights.push(pos(u, VW, G + 5)); }
  // the iron door, facing out to the tellers, its hinge on the side away from the levers
  put(UD, VW, G + 1, ironDoorId(DIR[FRONT], false, 0)); put(UD, VW, G + 2, ironDoorId(DIR[FRONT], true, 0));
  put(UD - 1, VW, G + 3, RLAMP());                                   // lit when the levers are right
  const door = { lower: pos(UD, VW, G + 1), upper: pos(UD, VW, G + 2), lamp: pos(UD - 1, VW, G + 3) };

  // ---- the lock, behind the wall -------------------------------------------------------------------
  // (v: VW + 1 a torch or dust behind each lever's block, VW + 2 the line of dust on
  // blocks; a block at its end, the torch on that, the dust beside it to the door)
  const lock = { wrong: [], bus: [], end: null, out: null, toDoor: null };
  const L0 = 1, L1 = UD - 1;
  for (let u = L0; u <= L1; u++) for (let v = VW + 1; v <= VW + 3; v++) {
    put(u, v, G + 1, MAT.SMOOTH);                                    // the floor the dust lies on
    for (let y = G + 2; y <= G + 3; y++) clear(u, v, y);
    put(u, v, G + 4, MAT.QUARTZ);
  }
  for (let u = L0; u <= L1; u++) put(u, VW + 4, G + 1, MAT.QUARTZ), put(u, VW + 4, G + 2, MAT.GLASS), put(u, VW + 4, G + 3, MAT.GLASS), put(u, VW + 4, G + 4, MAT.QUARTZ);
  for (let k = 0; k < LEVERS.length; k++) {
    const u = LEVERS[k];
    if (code[k]) put(u, VW + 1, G + 2, TORCH(FRONT));                // on wanted: a torch on the back of its block
    else put(u, VW + 1, G + 2, DUST());                              // off wanted: dust behind it
    lock.wrong.push(pos(u, VW + 1, G + 2));
  }
  for (let u = LEVERS[0]; u <= UD - 3; u++) { put(u, VW + 2, G + 2, DUST()); lock.bus.push(pos(u, VW + 2, G + 2)); }
  put(UD - 2, VW + 2, G + 2, MAT.QUARTZ); lock.end = pos(UD - 2, VW + 2, G + 2);
  put(UD - 1, VW + 2, G + 2, TORCH(LEFT)); lock.out = pos(UD - 1, VW + 2, G + 2);
  put(UD - 1, VW + 1, G + 2, DUST()); lock.toDoor = pos(UD - 1, VW + 1, G + 2);
  put(UD - 1, VW + 3, G + 2, MAT.QUARTZ);                            // (a block behind the torch: nothing else beside it)
  for (const u of [3, 9]) { put(u, VW + 2, G + 4, MAT.SEA_LANTERN); lights.push(pos(u, VW + 2, G + 4)); }   // (lit, sealed)
  // the wall between the lock and the vault's way in
  for (let v = VW + 1; v <= VW + 4; v++) for (let y = G + 1; y <= G + 4; y++) if (!(v <= VW + 2 && y === G + 2)) put(UD - 1, v, y, y === G + 1 ? MAT.SMOOTH : MAT.QUARTZ);

  // ---- the vault ----------------------------------------------------------------------------------------
  // the way in (u UD .. W - 2, v VW + 1 .. VW + 4), and the room behind the lock (v VW + 5 .. D - 2)
  const vault = { gold: [], chests: [], deposit: [], button: null };
  for (let v = VW + 5; v <= D - 2; v++) for (let u = 1; u <= W - 2; u++) for (let y = G + 1; y < TOP; y++) clear(u, v, y);
  // (a ceiling over the lock's room and the way in, lights in the vault's)
  for (const [u, v] of [[4, D - 4], [8, D - 4], [12, D - 4], [14, VW + 2]]) { put(u, v, TOP - 1, MAT.LAMP_HANG); lights.push(pos(u, v, TOP - 1)); }
  put(UD + 1, VW + 1, G + 2, button(BACK));                          // let yourself out
  vault.button = pos(UD + 1, VW + 1, G + 2);
  // gold blocks stacked along the side walls
  for (const u of [1, W - 2]) for (let v = VW + 6; v <= D - 3; v++) for (let y = G + 1; y <= G + 2; y++) { put(u, v, y, MAT.GOLD); vault.gold.push(pos(u, v, y)); }
  // chests of emeralds
  for (const u of [4, 6, 10, 12]) {
    put(u, VW + 5, G + 1, chestId(BACK));
    const [x, z] = at(u, VW + 5);
    world.setData(x, G + 1, z, { id: 'Chest', tags: { Items: N.list(10, [0, 1, 2, 3, 4, 5].map((s2) => item('minecraft:emerald', 64, s2))) } });
    vault.chests.push(pos(u, VW + 5, G + 1));
  }
  // the safe-deposit wall: barrels in an iron frame across the back
  for (let u = 2; u <= W - 3; u++) for (let y = G + 1; y <= G + 5; y++) {
    const frame = u === 2 || u === W - 3 || y === G + 1 || y === G + 5 || u % 3 === 2;
    put(u, D - 2, y, frame ? MAT.IRON : barrelId(FRONT));
    if (!frame) {
      vault.deposit.push(pos(u, D - 2, y));
      const k = vault.deposit.length;
      if (k % 4 === 1) { const [x, z] = at(u, D - 2); world.setData(x, y, z, { id: 'Barrel', tags: { Items: N.list(10, [item(['minecraft:diamond', 'minecraft:gold_ingot', 'minecraft:golden_apple', 'minecraft:emerald'][(k >> 2) % 4], 1 + (k % 7), 0)]) } }); }
    }
  }
  wallSign(mid, D - 3, G + 6, FRONT, 'Safe deposit');
  const doorAt = at(mid, -1);
  return { kind: 'bank', lot, code, codeWords, uToRight, levers, door, lock, vault, windows, hint, lights, sideways: fr.sideways,
    door0: [doorAt[0], G + 1, doorAt[1]], doorOut: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, TOP, VW, UD, TC, mid } };
}
