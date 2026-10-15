// engine/club.js — the nightclub: a dance floor, a bar, a DJ booth with a jukebox
// panel of six buttons, and over the club the sound system: six songs, each a melody
// and a rhythm line (bass, kick, snare and hat) of note blocks and repeaters, some
// seventy-odd steps and twenty-odd seconds long, every one different city to city.
//
// In the lot's own frame (zoo.js: lotFrame: u across, v back from the street),
// seventeen by twenty-three:
//
//   G+1..G+8    the club: doors in the front, a dance floor of light and colour, a
//               disco ball, the bar down the left, booths down the right, the DJ booth
//               across the back: six buttons on six stone blocks in the back wall, the
//               song's name over each, a lamp that lights when it is pressed; a real
//               jukebox and a chest of music discs beside them;
//   G+9         the club's ceiling (the first song's melody stands on it);
//   from G+10   the songs, one over another, eight blocks a song:
//                 L      the melody: repeater, note block, repeater... a snake of rows
//                        two apart across the whole floor, turning at its ends
//                 L+1    air (a note block sounds only with air over it)
//                 L+2,3  floor (its instrument's block under each note block)
//                 L+4    the rhythm line, the very same snake (same repeaters, same delays)
//                 L+5    air
//                 L+6,7  floor
//               (a gap one block high: nothing spawns in it), the walls glass at the two
//               lines, so the circuits can be watched from the street;
//   the roof    a crown of neon.
//
// Each button is on a block (A) at the foot of a tower of its own in the back wall: a
// redstone torch on A, a block on the torch, a torch on that block, and so on up, one
// tower a song, two blocks a storey of it. Each torch inverts, so with an even number
// of torches below it a block of the tower is on exactly while the button is in: the
// song's start (C) is such a block, at its melody's level; two torches more and the
// rhythm's start (C') four up. One rising edge a press: the song plays once. (The two
// torches between C and C' are two redstone ticks: the melody's first repeater is that
// much longer than the rhythm's, so the two start together.)
//
// The rules the lines keep (as the bandstand's, music.js): a repeater runs straight, a
// line turns only at a note block; no note block touches another of its own line (the
// rows are two apart; the cells between hold only the turns); each note block has air
// over it; no part of a line touches another song's tower.

import { MAT, MATERIALS, B, I, S, stairId, WEIRDO, chestId, doorId, DIR, wallSignId } from './materials.js';
import { helpers } from './services.js';
import { framed } from './townbits.js';
import { makeRng } from './rng.js';
import { N } from './blockcore.js';

export const CLUB_SIZE = [17, 24];             // (the first row the forecourt)
export const SONGS = 6;
const W = 17, D = 23;
export const TOWER_U = [3, 5, 7, 9, 11, 13];
export const TOWER_V = 21;
export const songBase = (G, k) => G + 10 + 8 * k;          // the melody's level of song k

const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
const item = (name, count, slot) => N.comp({ Count: N.byte(count), Damage: N.short(0), Name: N.str(name), Slot: N.byte(slot), WasPickedUp: N.byte(0) });

// ---- the music -------------------------------------------------------------------------------
// melody instruments (the block under the note block decides it) and the rhythm's
export const MELODY_INSTRUMENTS = {
  bells: { java: 'bell', under: () => MAT.GOLD },
  flute: { java: 'flute', under: () => MAT.CLAY },
  chimes: { java: 'chime', under: () => MAT.PACKED_ICE },
  xylophone: { java: 'xylophone', under: () => MAT.BONE_Y },
  'iron xylophone': { java: 'iron_xylophone', under: () => MAT.IRON },
  pling: { java: 'pling', under: () => MAT.GLOWSTONE },
  bit: { java: 'bit', under: () => mat('emerald_block', '#2ab050') },
  banjo: { java: 'banjo', under: () => MAT.HAY },
  'cow bell': { java: 'cow_bell', under: () => mat('soul_sand', '#5a4434') },
  harp: { java: 'harp', under: () => mat('moss_block', '#5a7a2a') },
  guitar: { java: 'guitar', under: () => mat('white_wool', '#e9ecec') },
};
export const RHYTHM_PARTS = {
  bass: { java: 'bass', under: () => MAT.OAK },
  kick: { java: 'basedrum', under: () => mat('stone', '#7d7d7d') },
  snare: { java: 'snare', under: () => MAT.SAND },
  hat: { java: 'hat', under: () => MAT.GLASS },
};
const GENRES = [
  { name: 'Disco', melody: 'bells', beat: ['kick', 'hat', 'snare', 'hat'], tempo: 2, swing: 0 },
  { name: 'Synthwave', melody: 'pling', beat: ['kick', 'bass', 'snare', 'bass'], tempo: 3, swing: 0 },
  { name: 'Chiptune', melody: 'bit', beat: ['kick', 'hat', 'snare', 'hat'], tempo: 2, swing: 0 },
  { name: 'Funk', melody: 'banjo', beat: ['kick', 'bass', 'snare', 'bass'], tempo: 2, swing: 1 },
  { name: 'Ballad', melody: 'flute', beat: ['bass', null, 'hat', null], tempo: 3, swing: 0 },
  { name: 'Waltz', melody: 'harp', beat: ['bass', 'hat', 'hat'], tempo: 3, swing: 0 },
  { name: 'Calypso', melody: 'iron xylophone', beat: ['kick', 'hat', 'bass', 'snare'], tempo: 2, swing: 1 },
  { name: 'Boogie', melody: 'cow bell', beat: ['bass', 'snare', 'bass', 'snare'], tempo: 2, swing: 1 },
  { name: 'Lullaby', melody: 'chimes', beat: ['bass', null, null, null], tempo: 3, swing: 0 },
  { name: 'Surf', melody: 'guitar', beat: ['kick', 'snare', 'kick', 'snare'], tempo: 2, swing: 0 },
  { name: 'Marimba', melody: 'xylophone', beat: ['bass', 'hat', 'kick', 'hat'], tempo: 2, swing: 0 },
];
const ADJ = ['Neon', 'Midnight', 'Electric', 'Velvet', 'Golden', 'Cosmic', 'Crystal', 'Pixel', 'Moonlit', 'Silver', 'Starlight', 'Blue', 'Lucky', 'Fever', 'Sunset', 'Polar'];
const NOUN = ['Nights', 'Groove', 'Avenue', 'Dreams', 'Heartbeat', 'Skyline', 'Rhythm', 'Boulevard', 'Motion', 'Lights', 'Fever', 'Echo', 'Waves', 'Shuffle', 'Parade', 'Signal'];
const KEYS = [{ name: 'G', note: 1 }, { name: 'A', note: 3 }, { name: 'C', note: 6 }, { name: 'D', note: 8 }];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const semis = (deg) => 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];
const PROGS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 3, 0, 4]];

// A song of `steps` steps: its genre, title, the delay before each step (redstone ticks,
// one to four), the melody's notes and the rhythm's parts (null: a rest).
export function composeSong(seed, steps, genre) {
  const rng = makeRng(seed >>> 0);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const g = genre || pick(GENRES);
  const key = pick(KEYS);
  let hi = 0; while (hi < 12 && key.note + semis(hi + 1) <= 24) hi++;
  const bar = g.beat.length;
  const prog = pick(PROGS);
  const chordOf = (k) => prog[Math.floor(k / bar) % prog.length];
  // the rhythm of the steps: the tempo, with a lilt for a swung genre, a longer note to end each phrase
  const delays = [];
  for (let k = 0; k < steps; k++) {
    let d = g.tempo;
    if (g.swing) d += k % 2 === 0 ? 1 : -1;
    if (k % (bar * 4) === bar * 4 - 1) d = Math.min(4, d + 1);
    delays.push(Math.max(1, Math.min(4, d)));
  }
  delays[0] = 1;                                               // (the rhythm's first; the melody's is two longer)
  // the melody: phrases of two bars, A A' B A over and over, each note near the last,
  // a chord tone on each bar's first step; a rest now and then; home to the tonic at the end
  const near = (from, chord) => { const tones = [0, 2, 4, 7, 9].map((t) => chord + t).filter((t) => t >= 0 && t <= hi); let best = tones[0] ?? 0; for (const t of tones) if (Math.abs(t - from) < Math.abs(best - from)) best = t; return best; };
  const walk = (d, m) => { let n = d + m; if (n < 0) n = -n; if (n > hi) n = 2 * hi - n; return Math.max(0, Math.min(hi, n)); };
  const phraseLen = bar * 2;
  const makePhrase = (startDeg, base) => {
    const out = []; let d = startDeg;
    for (let i = 0; i < phraseLen; i++) {
      const k = base + i;
      if (i % bar === 0) d = near(d, chordOf(k) % 7);
      else d = walk(d, pick([-2, -1, -1, 1, 1, 2, 0, 3]));
      out.push(rng() < 0.08 && i % bar !== 0 ? null : d);
    }
    return out;
  };
  const A = makePhrase(pick([2, 4, 7].filter((x) => x <= hi)), 0);
  const A2 = A.map((x, i) => (x === null ? null : i >= phraseLen - 2 ? walk(x, pick([1, 2, -1])) : x));
  const Bp = makePhrase(Math.min(hi, 5), phraseLen * 2);
  const form = [A, A2, Bp, A];
  const deg = [];
  for (let k = 0; k < steps; k++) deg.push(form[Math.floor(k / phraseLen) % form.length][k % phraseLen]);
  deg[steps - 2] = deg[steps - 2] === null ? 1 : near(deg[steps - 2], 4);
  deg[steps - 1] = 0;
  const melody = deg.map((x) => (x === null ? null : key.note + semis(x)));
  // the rhythm: the genre's beat, the bass on the chord's root (an octave down where it can)
  const rhythm = [];
  for (let k = 0; k < steps; k++) {
    const part = g.beat[k % bar];
    if (!part) { rhythm.push(null); continue; }
    let note = part === 'bass' ? key.note + semis(chordOf(k) % 7) : part === 'kick' ? 6 : part === 'snare' ? 12 : 18;
    while (note > 24) note -= 12;
    rhythm.push({ part, note });
  }
  rhythm[steps - 1] = { part: 'bass', note: key.note };
  const title = `${pick(ADJ)} ${pick(NOUN)}`;
  return { genre: g.name, instrument: g.melody, key: key.name, title, delays, melody, rhythm, seconds: delays.reduce((a, b) => a + b, 0) / 10 };
}

// The snake a song's lines take across a floor, from its tower's cell: [repeater, note] in
// (u, v), the rows two apart from v = 19 down to v = 1, notes on the odd cells 1..15.
export function songPath(tu) {
  const steps = [];
  let prev = [tu, TOWER_V];
  const go = (r, n) => { steps.push([r, n]); prev = n; };
  go([tu, 20], [tu, 19]);
  let dir = 1;
  for (let v = 19; v >= 1; v -= 2) {
    // along the row to its end
    let [u] = prev;
    while (dir > 0 ? u + 2 <= 15 : u - 2 >= 1) { go([u + dir, v], [u + 2 * dir, v]); u += 2 * dir; }
    if (v - 2 < 1) break;
    go([u, v - 1], [u, v - 2]);                                   // the turn down to the next row
    dir = -dir;
  }
  void prev;
  return steps;
}

export function nightclub(world, lot, face, cfg, rng0, G, signTags) {
  // (built a row back from the lot's front: the first row is the club's forecourt)
  const F0 = framed(world, lot, face, W, D + 1, G, signTags);
  if (!F0) return null;
  const fr = { ...F0.fr, at: (u, v) => F0.fr.at(u, v + 1) };
  const h = helpers(world, fr, G, signTags);
  const { put, clear, sign, nameOf, neg } = h;
  const pos = (u, v, y) => { const [x, z] = fr.at(u, v); return [x, y, z]; };
  const wallSign = (u, v, y, faceName, text) => { const [x, z] = fr.at(u, v); world.set(x, y, z, wallSignId(faceName)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const BACK = nameOf(fr.back), FRONT = nameOf(neg(fr.back));
  const dirOf = (du, dv) => nameOf([fr.across[0] * du + fr.back[0] * dv, fr.across[1] * du + fr.back[1] * dv]);
  const top = songBase(G, SONGS - 1) + 8;                       // the roof
  const BLACK = MAT.C_BLACK2, NEON = [MAT.FROG_PINK, MAT.FROG_GREEN, MAT.FROG_YELLOW, MAT.SEA_LANTERN];
  for (let u = 0; u < W; u++) for (let v = -1; v < D; v++) for (let y = G + 1; y <= top + 6; y++) clear(u, v, y);
  // ---- the shell: walls, the club's floor and ceiling, the songs' floors (lights set in
  // them every four blocks, over the gaps, so nothing spawns in the dark up there)
  const towerTop = (k) => songBase(G, k) + 4;
  const towerAt = (u, v) => (v === TOWER_V ? TOWER_U.indexOf(u) : -1);
  const lights = [];
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
    const edge = u === 0 || u === W - 1 || v === 0 || v === D - 1;
    put(u, v, G, MAT.POLISHED_DEEPSLATE);
    if (edge) {
      for (let y = G + 1; y <= top; y++) {
        const off = (y - G - 10) % 8;
        const glassy = y >= G + 10 && y < top && (off === 0 || off === 4);
        put(u, v, y, glassy ? MAT.TINTED : (y - G) % 8 === 5 ? NEON[((u + v) >> 1) % 4] : BLACK);
      }
      continue;
    }
    put(u, v, G + 9, BLACK);                                      // the club's ceiling
    const t = towerAt(u, v);
    for (let k = 0; k < SONGS; k++) {
      const L = songBase(G, k);
      for (const y of [L + 2, L + 3, L + 6, L + 7]) {
        if (t >= 0 && y <= towerTop(t)) continue;
        const lamp = (y === L + 2 || y === L + 6) && u % 4 === 2 && v % 4 === 2;
        put(u, v, y, lamp ? MAT.SEA_LANTERN : MAT.C_GRAY);
        if (lamp) lights.push(pos(u, v, y));
      }
    }
  }
  // ---- the towers: from each button's block up to its song's two starts
  const songs = [];
  const seedBase = ((cfg.seed | 0) * 2654435761 ^ (lot.x0 * 73856093) ^ (lot.z0 * 19349663) ^ 0xd15c0) >>> 0;
  const order = makeRng(seedBase);
  const genres = GENRES.slice();
  for (let i = genres.length - 1; i > 0; i--) { const j = Math.floor(order() * (i + 1)); [genres[i], genres[j]] = [genres[j], genres[i]]; }
  const usedTitles = new Set();
  const TORCH = (lit) => mat(lit ? 'redstone_torch' : 'unlit_redstone_torch', '#d03020', { torch_facing_direction: S('top') }, { passable: true, transparent: true });
  const NOTE = () => mat('noteblock', '#6a4a3a');
  const REP = (toInput, d) => mat('unpowered_repeater', '#b8a8a8', { 'minecraft:cardinal_direction': S(toInput), repeater_delay: I(d - 1) }, { passable: true, flat: true });
  const STAND = MAT.SMOOTH_QUARTZ;
  TOWER_U.forEach((tu, k) => {
    const L = songBase(G, k);
    put(tu, TOWER_V, G + 1, BLACK);                               // (A's pedestal)
    const torches = [];
    for (let y = G + 2; y <= L + 4; y += 2) {
      put(tu, TOWER_V, y, y === G + 2 ? STAND : BLACK);
      if (y < L + 4) {
        // a block of the tower is on while the button is in when an even number of torches
        // are under it: the torch on it is then lit at rest
        const onWhenPressed = ((y - G - 2) / 2) % 2 === 0;
        put(tu, TOWER_V, y + 1, TORCH(onWhenPressed));
        torches.push(pos(tu, TOWER_V, y + 1));
      }
    }
    // the song: its path, composed to its length; no two titles alike
    const path = songPath(tu);
    let song, tries = 0;
    do song = composeSong((seedBase + k * 7919 + tries * 104729) >>> 0, path.length, genres[k]); while (song.title.split(' ').some((w) => usedTitles.has(w)) && ++tries < 40);
    for (const w of song.title.split(' ')) usedTitles.add(w);
    const inst = MELODY_INSTRUMENTS[song.instrument];
    const lines = {};
    for (const [which, y0] of [['melody', L], ['rhythm', L + 4]]) {
      const steps = [];
      let prev = [tu, TOWER_V];
      path.forEach(([r, n], i) => {
        const d = which === 'melody' && i === 0 ? song.delays[0] + 2 : song.delays[i];
        put(r[0], r[1], y0, REP(dirOf(prev[0] - r[0], prev[1] - r[1]), d));
        const [x, z] = fr.at(n[0], n[1]);
        let note = null, part = null;
        if (which === 'melody') { note = song.melody[i]; part = note === null ? null : song.instrument; }
        else if (song.rhythm[i]) { note = song.rhythm[i].note; part = song.rhythm[i].part; }
        if (note === null) put(n[0], n[1], y0, MAT.C_GRAY);       // (a rest: a plain block carries the beat on)
        else {
          put(n[0], n[1], y0, NOTE());
          const java = which === 'melody' ? inst.java : RHYTHM_PARTS[part].java;
          world.setData(x, y0, z, { id: 'Music', bytes: { note }, java: { note, instrument: java } });
          world.set(x, y0 - 1, z, which === 'melody' ? inst.under() : RHYTHM_PARTS[part].under());
        }
        steps.push({ repeater: pos(r[0], r[1], y0), at: [x, y0, z], under: [x, y0 - 1, z], note, part, delay: d });
        prev = n;
      });
      lines[which] = steps;
    }
    songs.push({ k, genre: song.genre, title: song.title, instrument: song.instrument, key: song.key, seconds: song.seconds, delays: song.delays,
      start: pos(tu, TOWER_V, L), start2: pos(tu, TOWER_V, L + 4), torches, melody: lines.melody, rhythm: lines.rhythm,
      button: pos(tu, TOWER_V - 1, G + 2), stand: pos(tu, TOWER_V, G + 2), lamp: pos(tu, TOWER_V - 1, G + 6) });
  });
  // ---- the DJ booth: the buttons, the names, the lamps
  const BUTTON = mat('stone_button', '#8a8a8a', { button_pressed_bit: B(0), facing_direction: I({ north: 2, south: 3, west: 4, east: 5 }[FRONT]) }, { passable: true, transparent: true });
  const signs = [];
  for (const s of songs) {
    const tu = TOWER_U[s.k];
    put(tu, TOWER_V - 1, G + 2, BUTTON);
    signs.push(wallSign(tu, TOWER_V - 1, G + 4, FRONT, `${s.k + 1}. ${s.title}\n${s.genre}\n${s.instrument} in ${s.key}\n${Math.round(s.seconds)} seconds`));
    put(tu, TOWER_V - 1, G + 6, mat('redstone_lamp', '#8a5a3a'));
  }
  // a real jukebox, and the discs for it
  put(1, 20, G + 1, mat('jukebox', '#6a4a3a'));
  put(15, 20, G + 1, chestId(FRONT));
  { const [x, z] = fr.at(15, 20); world.setData(x, G + 1, z, { id: 'Chest', tags: { Items: N.list(10,
    ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', 'wait', 'pigstep'].map((n, i) => item('minecraft:music_disc_' + n, 1, i))) } }); }
  // ---- the dance floor, lit from beneath
  const COLS = [MAT.C_MAGENTA, MAT.C_CYAN, MAT.C_PURPLE, mat('yellow_concrete', '#d5b31f')];
  const dance = [];
  for (let u = 5; u <= 11; u++) for (let v = 4; v <= 14; v++) {
    put(u, v, G, (u + v) % 2 ? COLS[((u >> 1) + (v >> 1)) % 4] : NEON[(u + v) % 4]);
    dance.push(pos(u, v, G));
  }
  // the disco ball, hung on a chain from the ceiling
  put(8, 9, G + 8, MAT.CHAIN); put(8, 9, G + 7, MAT.SEA_LANTERN);
  const ball = pos(8, 9, G + 7);
  // the bar down the left, barrels of drinks behind it, stools before it
  const DRINKS = [['honey_bottle', 16], ['milk_bucket', 1], ['sweet_berries', 32], ['cookie', 32], ['golden_apple', 2], ['glow_berries', 16]];
  for (let v = 5; v <= 14; v++) { put(3, v, G + 1, MAT.SMOOTH_QUARTZ); if (v % 2 === 1) put(4, v, G + 1, stairId('quartz', WEIRDO[nameOf(neg(fr.across))])); }
  const barrels = [];
  DRINKS.forEach(([n, c], i) => {
    const v = 6 + i;
    put(1, v, G + 1, mat('barrel', '#7d5a34', { facing_direction: I(1), open_bit: B(0) }));
    const [x, z] = fr.at(1, v); world.setData(x, G + 1, z, { id: 'Barrel', tags: { Items: N.list(10, [item('minecraft:' + n, c, 0)]) } });
    barrels.push(pos(1, v, G + 1));
  });
  // booths down the right: benches of stairs facing each other over a table
  for (const v of [5, 9, 13]) { put(15, v - 1, G + 1, stairId('blackstone', WEIRDO[nameOf(fr.back)])); put(15, v, G + 1, MAT.C_MAGENTA); put(15, v + 1, G + 1, stairId('blackstone', WEIRDO[nameOf(neg(fr.back))])); }
  // the doors: two, in the middle of the front
  const doors = [];
  for (const u of [8, 9]) {
    const hinge = u === 8 ? 0 : 1;
    put(u, 0, G + 1, doorId('dark', DIR[BACK], false, hinge));
    put(u, 0, G + 2, doorId('dark', DIR[BACK], true, hinge));
    doors.push(pos(u, 0, G + 1));
  }
  // the forecourt: a step of stone in front, the name on a sign, neon over the doors
  for (let u = 0; u < W; u++) put(u, -1, G, MAT.POLISHED_DEEPSLATE);
  sign(6, -1, G + 1, neg(fr.back), 'NIGHTCLUB\n6 songs on the\njukebox panel\nat the back');
  for (let u = 6; u <= 11; u++) put(u, 0, G + 4, NEON[u % 4]);
  // the roof: a crown of neon, an antenna with a light
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) put(u, v, top, BLACK);
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) if (u === 0 || u === W - 1 || v === 0 || v === D - 1) put(u, v, top + 1, NEON[(u + v) % 4]);
  for (let y = top + 1; y <= top + 5; y++) put(8, 11, y, MAT.BARS);
  put(8, 11, top + 6, mat('end_rod', '#f2eee4', { facing_direction: I(1) }));
  void rng0;
  return { kind: 'nightclub', lot, songs, signs, dance, ball, barrels, doors, lights, jukebox: pos(1, 20, G + 1), discs: pos(15, 20, G + 1), roof: top,
    sideways: fr.sideways, door: pos(8, -1, G + 1), frame: { at: fr.at, G, top } };
}
