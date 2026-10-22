// engine/fireworks.js — fireworks over the town square (0.80.0), switched on and off by a lever
// at the town hall.
//
// - the battery: the fountain's spout raised into a column eight high; on top of it a cell kept
//   empty, the four sides round it and the top over it dispensers facing up, each holding nine
//   stacks of rockets of different colours and bursts (a large ball, a star, a burst, a creeper's
//   face, small balls, some that twinkle and some that trail);
// - the clock: under the fountain, a repeating command block every one and a half seconds asks
//   whether the lever at the town hall is on; if it is, it sets a block of redstone in the empty
//   cell, and the chain command block beside it takes it away again a moment later. Each time,
//   all five dispensers fire at once. (Command blocks, not wire: the town hall and the square
//   are lots apart, with streets, cellars and the metro between them.) Silent: build turns the
//   command block chat off;
// - the lever on the town hall's front wall beside its doors, a sign under it saying what it does.
//
// Built once the city's ground is where it will stay (city.js: after the lots ride up on fitted
// ground), so the commands' offsets from block to lever and to the battery are the real ones.

import { MAT, MATERIALS, I as INT, B as BYTE, S as STR, wallSignId } from './materials.js';
import { N, TAG } from './blockcore.js';
import { commandBlock } from './airport.js';
import { OUTWARD } from './building.js';

export const FIREWORKS = { HEIGHT: 8, EVERY: 30, PULSE: 4 };
// the nine stacks in each dispenser: colours (Bedrock's dye numbers), fade, burst, twinkle, trail
// (0 small ball, 1 large ball, 2 star, 3 creeper, 4 burst)
export const ROCKETS = [
  { colors: [1], fade: [14], type: 1, flicker: 0, trail: 1 },
  { colors: [11], fade: [15], type: 2, flicker: 1, trail: 0 },
  { colors: [4, 15], fade: [12], type: 4, flicker: 0, trail: 1 },
  { colors: [10], fade: [], type: 0, flicker: 1, trail: 0 },
  { colors: [13, 9], fade: [15], type: 1, flicker: 0, trail: 1 },
  { colors: [14], fade: [11], type: 4, flicker: 1, trail: 0 },
  { colors: [6, 12], fade: [], type: 2, flicker: 0, trail: 1 },
  { colors: [10, 2], fade: [], type: 3, flicker: 0, trail: 0 },
  { colors: [1, 15, 4], fade: [15], type: 1, flicker: 1, trail: 1 },
];
const dispenserUp = () => MATERIALS.add(null, 'minecraft:dispenser', '#7a7a7a', { facing_direction: INT(1), triggered_bit: BYTE(0) });
const leverOn = (facing) => MATERIALS.add(null, 'minecraft:lever', '#6a5a4a', { lever_direction: STR(facing), open_bit: BYTE(0) }, { passable: true, transparent: true });
const byteArray = (a) => ({ t: TAG.BYTE_ARRAY, v: a });
export function rocketItem(r, slot) {
  return N.comp({ Count: N.byte(64), Damage: N.short(0), Name: N.str('minecraft:firework_rocket'), Slot: N.byte(slot), WasPickedUp: N.byte(0),
    tag: N.comp({ Fireworks: N.comp({ Explosions: N.list(10, [N.comp({ FireworkColor: byteArray(r.colors), FireworkFade: byteArray(r.fade),
      FireworkFlicker: N.byte(r.flicker), FireworkTrail: N.byte(r.trail), FireworkType: N.byte(r.type) })]), Flight: N.byte(slot % 3 === 2 ? 3 : 2) }) }) });
}

export function buildFireworks(world, square, hall, ctx) {
  const { GROUND, elevAt, signTags } = ctx;
  if (!square || !hall || !square.fountain || !hall.rec) return { missing: !square ? 'no town square' : 'no town hall' };
  // ---- the battery, on the fountain
  const [mx, , mz] = square.fountain;
  const Gs = GROUND + elevAt(mx, mz);
  const plinth = world.get(mx, Gs + 2, mz);
  const col = plinth >= 0 ? plinth : MAT.SMOOTH_QUARTZ;
  const T = Gs + FIREWORKS.HEIGHT;
  for (let y = Gs + 2; y < T; y++) world.set(mx, y, mz, y === Gs + 5 ? MAT.SEA_LANTERN : col);
  const pulse = [mx, T, mz];
  world.clear(...pulse);
  const dispensers = [];
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const p = [mx + dx, T + dy, mz + dz];
    world.set(...p, dispenserUp());
    world.setData(...p, { id: 'Dispenser', tags: { Items: N.list(10, ROCKETS.map((r, i) => rocketItem(r, i))) } });
    dispensers.push(p);
  }
  // ---- the lever, on the town hall's front wall beside its doors
  const rec = hall.rec, F = OUTWARD[rec.facing] || [0, 1], R = [F[1], -F[0]];
  const name = (v) => (v[0] > 0 ? 'east' : v[0] < 0 ? 'west' : v[1] > 0 ? 'south' : 'north');
  const [dx0, dz0] = rec.doorCells[0];
  const ground = (x, z) => GROUND + elevAt(x, z);
  let lever = null, sign = null;
  for (const k of [2, -2, 3, -3, 4, -4]) {
    const wx = dx0 + R[0] * k, wz = dz0 + R[1] * k, ox = wx + F[0], oz = wz + F[1];
    const g = ground(ox, oz);
    if (!world.has(wx, g + 2, wz) || rec.doorCells.some(([a, b]) => a === wx && b === wz)) continue;     // a wall to fix it to
    if (world.has(ox, g + 2, oz) || world.has(ox, g + 1, oz)) continue;                                   // room before it
    lever = [ox, g + 2, oz];
    world.set(...lever, leverOn(name(F)));
    // the sign under it, on the same wall
    world.set(ox, g + 1, oz, wallSignId(name(F)));
    world.setData(ox, g + 1, oz, { id: 'Sign', tags: signTags('Fireworks over\nthe town square:\nthe lever above,\non and off') });
    sign = [ox, g + 1, oz];
    break;
  }
  if (!lever) return { missing: 'no room on the town hall\'s front wall for the lever', dispensers, pulse };
  // ---- the clock, under the fountain
  const C = [mx, Gs - 1, mz], C2 = [mx + 1, Gs - 1, mz];
  const rel = (a, b) => `~${a[0] - b[0]} ~${a[1] - b[1]} ~${a[2] - b[2]}`.replace(/~0(?= |$)/g, '~');
  const REPEAT = MATERIALS.add(null, 'minecraft:repeating_command_block', '#6b4fa0', { conditional_bit: BYTE(0), facing_direction: INT(5) });
  const CHAIN = MATERIALS.add(null, 'minecraft:chain_command_block', '#4f8a6b', { conditional_bit: BYTE(0), facing_direction: INT(5) });
  const cmdOn = `execute if block ${rel(lever, C)} lever ["open_bit"=true] run setblock ${rel(pulse, C)} redstone_block`;
  const cmdOff = `setblock ${rel(pulse, C2)} air`;
  for (const p of [C, C2]) for (let y = p[1] - 1; y <= p[1] + 1; y++) for (const [ax, az] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!world.has(p[0] + ax, y, p[2] + az)) world.set(p[0] + ax, y, p[2] + az, MAT.STONEBRICK);
  world.set(...C, REPEAT); world.setData(...C, commandBlock(cmdOn, { mode: 'repeat', delay: FIREWORKS.EVERY }));
  world.set(...C2, CHAIN); world.setData(...C2, commandBlock(cmdOff, { mode: 'chain', delay: FIREWORKS.PULSE }));
  return { dispensers, pulse, lever, sign, clock: [C, C2], commands: [cmdOn, cmdOff], top: T + 1 };
}
