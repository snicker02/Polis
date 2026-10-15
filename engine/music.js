// engine/music.js — the bandstand's tune: a melody and a bass line of note blocks and
// repeaters on the bandstand's roof, set off by a button on a stand in the middle of
// the stage. Different for every city: the key, the instrument, the notes and the
// rhythm all come from the city's seed and where the bandstand stands.
//
// The button is on the side of a block on the stage (A). On top of A a redstone torch;
// over the torch a block (B); on B a second torch, set in the roof; on that the block
// the tune starts from (C), on the roof, a redstone lamp on C. At rest A is off, the
// first torch on, B powered, the second torch off, C off. The button turns A on: the
// first torch goes out, B loses its power, the second torch lights and C comes on (the
// lamp with it) for as long as the button is in. One rising edge per press: the tune
// plays once (a button's release only turns C off again).
//
// From C two lines run out over the roof, the melody one way and the bass the other,
// each a repeater, then a note block (or, for a rest in the bass, a plain block), then
// a repeater, and so on. Twelve steps each, the same repeater delays step for step in
// both, so the bass keeps time with the melody. A line turns only at a note block (a
// repeater runs straight). No note block touches another, or C (a powered block sets
// off any note block beside it), and no repeater's back touches anything but the cell
// before it in its line. Each note block has air over it (it sounds only so) and its
// instrument's block under it, in the roof: the melody's from the seed (bells on gold,
// a flute on clay, chimes on packed ice, a xylophone on bone, the pling on glowstone or
// the harp on moss), the bass on oak planks.

import { MAT, MATERIALS, B, I, S } from './materials.js';
import { makeRng } from './rng.js';

// the twelve steps of each line, from beside C: [dx, dz] of the repeater, then of its
// note (the melody's; the bass's are the same turned half round)
export const MELODY_PATH = [
  [[1, 0], [2, 0]], [[3, 0], [4, 0]], [[4, 1], [4, 2]], [[3, 2], [2, 2]], [[1, 2], [0, 2]], [[-1, 2], [-2, 2]],
  [[-3, 2], [-4, 2]], [[-4, 3], [-4, 4]], [[-3, 4], [-2, 4]], [[-1, 4], [0, 4]], [[1, 4], [2, 4]], [[3, 4], [4, 4]],
];
export const BASS_PATH = MELODY_PATH.map(([r, n]) => [[-r[0], -r[1]], [-n[0], -n[1]]]);
export const STEPS = MELODY_PATH.length;

export const INSTRUMENTS = [
  { name: 'bells', java: 'bell', under: () => MAT.GOLD },
  { name: 'flute', java: 'flute', under: () => MAT.CLAY },
  { name: 'chimes', java: 'chime', under: () => MAT.PACKED_ICE },
  { name: 'xylophone', java: 'xylophone', under: () => MAT.BONE_Y },
  { name: 'pling', java: 'pling', under: () => MAT.GLOWSTONE },
  { name: 'harp', java: 'harp', under: () => MATERIALS.add(null, 'minecraft:moss_block', '#5a7a2a', {}) },
];
const KEYS = [{ name: 'A', note: 3 }, { name: 'C', note: 6 }, { name: 'D', note: 8 }, { name: 'F', note: 11 }];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const semis = (deg) => 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];
// four-step bars of twelve redstone ticks (1.2 s; a repeater gives one to four), the
// last bar three notes and a held one
const BARS = [[3, 3, 3, 3], [4, 2, 3, 3], [3, 3, 4, 2], [4, 4, 2, 2], [2, 2, 4, 4], [2, 4, 2, 4]];

// The tune: the delay before each step (the first short), the melody's notes (a
// number 0-24 for the note block: 0 is F#3 on the harp), the bass's (null for a rest).
export function composeTune(seed) {
  const rng = makeRng(seed >>> 0);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const key = pick(KEYS);
  const inst = pick(INSTRUMENTS);
  let hi = 0; while (hi < 9 && key.note + semis(hi + 1) <= 24) hi++;   // the highest degree that stays in range
  // a step within range, turned back at either end rather than stopped there
  const walk = (d, m) => { let n = d + m; if (n < 0) n = -n; if (n > hi) n = 2 * hi - n; return Math.max(0, Math.min(hi, n)); };
  // rhythm: the first bar's pattern, the second a different one, the third the first again
  const b1 = pick(BARS);
  let b2 = pick(BARS); if (b2 === b1) b2 = BARS[(BARS.indexOf(b1) + 1) % BARS.length];
  const durs = [...b1, ...b2, ...b1.slice(0, 3)];               // notes 0-10; note 11 is held
  const delays = [1, ...durs];                                  // before each step
  // the melody: a walk of the scale, mostly by steps; the second bar the first again a
  // step or two higher (or lower), its last note free; the third bar coming home, the
  // next to last on the second or the fifth, the last on the tonic
  const STEPS_ = [-2, -1, -1, 1, 1, 2, -3, 3];
  const deg = [];
  let d = pick([2, 3, 4]);
  for (let k = 0; k < 4; k++) { deg.push(d); d = walk(d, pick(STEPS_)); }
  const lift = pick([1, 2, -1, 2]);
  for (let k = 0; k < 3; k++) deg.push(walk(deg[k], lift));
  deg.push(walk(deg[6], pick(STEPS_)));
  d = deg[7];
  for (let k = 8; k < 10; k++) { d = walk(d, d > 4 ? pick([-1, -2, -1]) : pick([1, -1, 2, -2])); deg.push(d); }
  const home = d >= 5 && hi >= 7 ? 7 : 0;
  deg.push(home === 7 ? pick([8, 6]) > hi ? 6 : pick([8, 6]) : pick([1, 4]));
  deg.push(home);
  const melody = deg.map((g) => key.note + semis(g));
  // the bass: the chord's root on the first of each bar and on the last note (I, IV or V, vi or IV, I)
  const second = pick([3, 4]), third = pick([5, 3]);
  const bass = Array(STEPS).fill(null);
  bass[0] = key.note; bass[4] = key.note + semis(second); bass[8] = key.note + semis(third); bass[STEPS - 1] = key.note;
  for (let k = 0; k < STEPS; k++) if (bass[k] !== null) while (bass[k] > 24) bass[k] -= 12;
  return { key: key.name, instrument: inst, delays, melody, bass };
}

const NOTE = () => MATERIALS.add(null, 'minecraft:noteblock', '#6a4a3a', {});
const REPEATER = (toInput, delay) => MATERIALS.add(null, 'minecraft:unpowered_repeater', '#b8a8a8',
  { 'minecraft:cardinal_direction': S(toInput), repeater_delay: I(delay - 1) }, { passable: true, flat: true });
// (saved as the game will have it at rest: the first torch lit, the second out)
const TORCH = (lit) => MATERIALS.add(null, lit ? 'minecraft:redstone_torch' : 'minecraft:unlit_redstone_torch', '#d03020', { torch_facing_direction: S('top') }, { passable: true, transparent: true });
const RLAMP = () => MATERIALS.add(null, 'minecraft:redstone_lamp', '#8a5a3a', {});
const FACE = { east: 5, west: 4, south: 3, north: 2 };
const nameOf = (dx, dz) => (dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north');

// Build the tune on a bandstand: (mx, mz) its middle, G its ground, roof at G + 5,
// [fx, fz] the way out of it (the button faces that way), `stand` and `roof` blocks.
export function buildTune(world, mx, mz, G, [fx, fz], { stand, roof, rest }, seed) {
  const tune = composeTune(seed);
  const A = [mx, G + 2, mz], T1 = [mx, G + 3, mz], Bk = [mx, G + 4, mz], T2 = [mx, G + 5, mz], C = [mx, G + 6, mz], lamp = [mx, G + 7, mz];
  const button = [mx + fx, G + 2, mz + fz];
  world.set(...A, stand); world.set(...T1, TORCH(true)); world.set(...Bk, stand); world.set(...T2, TORCH(false)); world.set(...C, stand); world.set(...lamp, RLAMP());
  world.set(...button, MATERIALS.add(null, 'minecraft:wooden_button', '#a08050', { button_pressed_bit: B(0), facing_direction: I(FACE[nameOf(fx, fz)]) }));
  const Y = G + 6;
  const lines = {};
  for (const [which, path, notes] of [['melody', MELODY_PATH, tune.melody], ['bass', BASS_PATH, tune.bass]]) {
    const steps = [];
    let prev = [0, 0];
    path.forEach(([r, n], k) => {
      const [rx, rz] = r, [nx, nz] = n;
      const toInput = nameOf(prev[0] - rx, prev[1] - rz);
      world.set(mx + rx, Y, mz + rz, REPEATER(toInput, tune.delays[k]));
      const note = notes[k];
      const at = [mx + nx, Y, mz + nz], under = [mx + nx, Y - 1, mz + nz];
      if (note === null) world.set(...at, rest);
      else {
        world.set(...at, NOTE());
        world.setData(...at, { id: 'Music', bytes: { note }, java: { note, instrument: which === 'melody' ? tune.instrument.java : 'bass' } });
        world.set(...under, which === 'melody' ? tune.instrument.under() : MAT.OAK);
      }
      steps.push({ repeater: [mx + rx, Y, mz + rz], at, under, note, delay: tune.delays[k] });
      prev = n;
    });
    lines[which] = steps;
  }
  // lanterns on the roof either side of C, to keep its top lit
  const lanterns = [[0, 1], [0, -1]].map(([dx, dz]) => { const p = [mx + dx, Y, mz + dz]; world.set(...p, MAT.LAMP); return p; });
  void roof;
  return { key: tune.key, instrument: tune.instrument.name, delays: tune.delays, melody: lines.melody, bass: lines.bass,
    button, stand: A, torches: [T1, T2], relay: Bk, start: C, lamp, lanterns,
    seconds: tune.delays.reduce((a, b) => a + b, 0) / 10 };
}
