// engine/zoo.js — a zoo with every land animal, and an aquarium with every fish.
//
// Two landmarks, since big lots are few (a fitted town may have one, and the jail
// wants it): the zoo outdoors, fifteen by twenty-four; the aquarium indoors,
// eleven by twenty. Each is laid out in the lot's own frame (u across, v back from
// the street) and set down by OUTWARD, front to back where the lot is deep enough,
// turned sideways beside the street where it is long and shallow.
//
// The zoo: a plaza at the gate, a path down the middle, ten enclosures either
// side, four deep and three wide, the ground in each its animals' own, fences
// three high (goats, frogs and foxes jump; nothing clears three), a sign on each.
// The aviary roofed in glass. Penned so none hunts another: wolves alone (sheep,
// rabbits), the fox with the cats, rabbits with the turtles and frogs.
//
// The aquarium: a hall down the middle, glass-fronted tanks either side, the reef
// tank across the back. Water three deep under a block of air (dolphins and squid
// breathe at the top), sea lanterns in the tank floors. The reef: all 22 named
// tropical fish, each summoned as itself (export.js gives the pack a keep event
// per variety, copied from the game's own), and dolphins. Axolotls alone (they
// hunt fish).
//
// Every animal and fish is summoned in populate with a name (a named mob does not
// despawn; a fish is kept by the pack's polis:keep event instead).

import { MAT, signId, SIGN_FACING } from './materials.js';
import { OUTWARD } from './building.js';

// the 22 named tropical fish, as the game's own events name them (become_X)
export const TROPICAL_VARIETIES = ['anenonme', 'black_tang', 'blue_dory', 'butterfly_fish', 'cichlid', 'clownfish', 'cc_betta', 'dog_fish',
  'e_red_snapper', 'goat_fish', 'moorish_idol', 'ornate_butterfly', 'parrot_fish', 'queen_angel_fish', 'red_cichlid', 'red_lipped_benny',
  'red_snapper', 'threadfin', 'tomato_clown', 'triggerfish', 'yellow_tail_parrot', 'yellow_tang'];

export const ZOO_PENS = [
  { kinds: ['cow', 'sheep', 'pig', 'chicken', 'mooshroom'], name: 'Farm', ground: 'grass', big: true },
  { kinds: ['horse', 'donkey', 'mule'], name: 'Horses', ground: 'grass' },
  { kinds: ['camel', 'llama', 'armadillo', 'sniffer', 'strider'], name: 'Drylands', ground: 'sand', big: true },
  { kinds: ['goat'], name: 'Goats', ground: 'stone', roof: true },   // (goats jump: roofed in glass)
  { kinds: ['polar_bear'], name: 'Polar bear', ground: 'snow' },
  { kinds: ['panda'], name: 'Pandas', ground: 'grass' },
  { kinds: ['cat', 'ocelot', 'fox'], name: 'Cats and fox', ground: 'grass' },
  { kinds: ['wolf'], name: 'Wolves', ground: 'podzol' },
  { kinds: ['turtle', 'frog', 'rabbit'], name: 'Pond', ground: 'pond' },
  { kinds: ['parrot', 'bee', 'allay', 'bat'], name: 'Aviary', ground: 'grass', roof: true },
];
export const AQUARIUM_TANKS = [
  { kinds: ['cod', 'salmon'], name: 'Cod and salmon' },
  { kinds: ['pufferfish'], name: 'Pufferfish' },
  { kinds: ['squid', 'glow_squid'], name: 'Squid' },
  { kinds: ['axolotl'], name: 'Axolotls' },
];
export const ZOO_SIZE = [15, 24], AQUARIUM_SIZE = [11, 20];

// ---- the lot's frame: u across, v back from the street ----------------------------------
// front to back where the lot is deep enough; else turned sideways (u from the street)
export function lotFrame(lot, face, Wb, Db) {
  const F = OUTWARD[face];
  if (!F) return null;
  const lotW = lot.x1 - lot.x0 + 1, lotD = lot.z1 - lot.z0 + 1;
  const along = F[0] ? lotD : lotW, deep = F[0] ? lotW : lotD;
  const sideways = !(along >= Wb && deep >= Db) && along >= Db && deep >= Wb;
  if (!sideways && !(along >= Wb && deep >= Db)) return null;
  const side = [-F[1], F[0]];
  const across = sideways ? [-F[0], -F[1]] : side;
  const back = sideways ? side : [-F[0], -F[1]];
  const lo = (d, a0, a1) => (d > 0 ? a0 : a1);
  const ox = across[0] ? lo(across[0], lot.x0, lot.x1) : lo(back[0], lot.x0, lot.x1);
  const oz = across[1] ? lo(across[1], lot.z0, lot.z1) : lo(back[1], lot.z0, lot.z1);
  const spanU = sideways ? deep : along, spanV = sideways ? along : deep;
  const u0 = sideways ? (spanU > Wb ? 1 : 0) : Math.floor((spanU - Wb) / 2);
  const v0 = sideways ? Math.floor((spanV - Db) / 2) : (spanV > Db ? 1 : 0);
  const at = (u, v) => [ox + (u0 + u) * across[0] + (v0 + v) * back[0], oz + (u0 + u) * across[1] + (v0 + v) * back[1]];
  // the world direction of +u / +v / -u / -v, by name (for a sign to face)
  const nameOf = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
  return { at, sideways, across, back, nameOf };
}

// a standing sign with text, its block entity laid out as Bedrock saves one
function sign(world, x, y, z, facingName, text, signTags) {
  world.set(x, y, z, signId(SIGN_FACING[facingName]));
  world.setData(x, y, z, { id: 'Sign', tags: signTags(text) });
}

const GROUND = { grass: () => MAT.GRASS, sand: () => MAT.SAND, stone: () => MAT.ZOO_STONE, snow: () => MAT.SNOW_BLOCK,
  podzol: () => MAT.PODZOL, pond: () => MAT.GRASS };

// ---- the zoo ---------------------------------------------------------------------------
export function zoo(world, lot, face, cfg, rng, G, signTags) {
  // Twenty-eight deep where the lot allows: then the farm and the drylands, the
  // two pens with the most in them, are two rows long (four by seven). On a lot
  // only twenty-four deep, every pen one row.
  const W_ = 15;
  let D_ = 28, fr = lotFrame(lot, face, W_, 28);
  if (!fr) { D_ = 24; fr = lotFrame(lot, face, W_, 24); }
  if (!fr) return null;
  const rows = (D_ - 4) / 4;                                // 6 or 5 a side
  const big = D_ === 28;
  const { at } = fr;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const FENCE_H = 3;
  // the ground: cleared above, paved path and plaza, a hedge of fence round it all
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= G + 6; y++) clear(u, v, y);
    put(u, v, G, MAT.GRASS);
    const edge = u === 0 || u === W_ - 1 || v === D_ - 1;
    if (edge) for (let y = G + 1; y <= G + FENCE_H; y++) put(u, v, y, MAT.FENCE);
  }
  for (let v = 0; v < D_ - 1; v++) for (let u = 6; u <= 8; u++) put(u, v, G, MAT.GRAVEL);      // the path
  for (let v = 0; v <= 2; v++) for (let u = 1; u < W_ - 1; u++) put(u, v, G, MAT.GRAVEL);      // the plaza at the gate
  // the front: fenced but for the gate in the middle
  for (let u = 0; u < W_; u++) { if (u >= 6 && u <= 8) continue; put(u, 0, G + 1, MAT.FENCE); }

  // which pens go where: each side filled in turn, the farm and the drylands two
  // rows long either way. Twenty-eight deep, every pen its own; twenty-four
  // deep, two pairs that get along share, to make the room: the horses join the
  // drylands (grazers all), the polar bear and the pandas share the bears' pen.
  const bySide = big
    ? [['Farm', 'Goats', 'Polar bear', 'Cats and fox', 'Pond'], ['Drylands', 'Horses', 'Pandas', 'Wolves', 'Aviary']]
    : [['Farm', 'Goats', 'Bears', 'Pond'], ['Drylands', 'Cats and fox', 'Wolves', 'Aviary']];
  const penOf = (name) => {
    if (name === 'Bears') return { ...ZOO_PENS.find((p) => p.name === 'Polar bear'), name: 'Bears', kinds: ['polar_bear', 'panda'] };
    const p = ZOO_PENS.find((q) => q.name === name);
    if (!big && name === 'Drylands') return { ...p, kinds: [...p.kinds, 'horse', 'donkey', 'mule'] };
    return p;
  };
  const animals = [], pens = [];
  for (const side of [0, 1]) {
    let k = 0;
    for (const name of bySide[side]) {
      const pen = penOf(name);
      const span = pen.big ? 2 : 1;
      if (k + span > rows) break;
      const va = 4 + 4 * k, vb = 4 + 4 * (k + span - 1) + 2;
      k += span;
      const ua = side === 0 ? 1 : 10, ub = side === 0 ? 4 : 13;
      const front = side === 0 ? 5 : 9;                     // the fence on the path
      // fences: the path side, and the row before and after (shared between pens)
      for (let v = va - 1; v <= vb + 1; v++) for (let y = G + 1; y <= G + FENCE_H; y++) put(front, v, y, MAT.FENCE);
      for (const v of [va - 1, vb + 1]) for (let u = ua; u <= ub; u++) for (let y = G + 1; y <= G + FENCE_H; y++) put(u, v, y, MAT.FENCE);
      // inside a two-row pen, the old divider row is ground too
      for (let v = va; v <= vb; v++) for (let u = ua; u <= ub; u++) { for (let y = G + 1; y <= G + FENCE_H; y++) clear(u, v, y); put(u, v, G, GROUND[pen.ground]()); }
      if (pen.ground === 'pond') for (let v = va; v <= va + 1; v++) for (let u = ua + 1; u <= ua + 2; u++) put(u, v, G, MAT.WATER);
      if (pen.roof) for (let v = va - 1; v <= vb + 1; v++) for (let u = Math.min(ua, front) - (side === 0 ? 1 : 0); u <= Math.max(ub, front) + (side === 1 ? 1 : 0); u++) put(u, v, G + FENCE_H + 1, MAT.GLASS);
      // the animals spread through the pen, a block clear of the fence
      const cols = side === 0 ? [1, 2, 3] : [13, 12, 11], len = vb - va + 1;
      pen.kinds.forEach((kind, i) => {
        const u = cols[i % 3], v = va + Math.min(len - 1, Math.floor(i / 3) * 2 + (span === 2 ? (i % 2) * 2 : 0));
        const [x, z] = at(u, v);
        animals.push({ type: kind, x: x + 0.5, y: G + 1, z: z + 0.5, name: niceName(kind), pen: pens.length });
      });
      // its sign: on the path, before the pen, facing the path
      const [sx, sz] = at(side === 0 ? 6 : 8, va + 1);
      const facing = fr.nameOf(side === 0 ? [fr.across[0], fr.across[1]] : [-fr.across[0], -fr.across[1]]);
      sign(world, sx, G + 1, sz, facing, pen.name, signTags);
      pens.push({ side, u: [ua, ub], v: [va, vb], name: pen.name, kinds: pen.kinds, roof: !!pen.roof });
    }
  }
  // lanterns on posts along the path
  // (never on row 19: the aviary's glass roof runs over it, and a lantern there
  // would leave a gap a bee could leave by)
  for (const v of [3, 11, 15]) for (const u of [5, 9]) {
    if (pens.some((p) => p.roof && v >= p.v[0] - 1 && v <= p.v[1] + 1 && (u === 5) === (p.side === 0))) continue;
    put(u, v, G + FENCE_H + 1, MAT.LAMP);
  }
  const door = at(7, -1);
  return { kind: 'zoo', lot, animals, pens, big, sideways: fr.sideways, door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_, FENCE_H } };
}

// ---- the aquarium ----------------------------------------------------------------------
export function aquarium(world, lot, face, cfg, rng, G, signTags) {
  const W_ = 11, D_ = 20;
  const fr = lotFrame(lot, face, W_, D_);
  if (!fr) return null;
  const { at } = fr;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const WALL = MAT.AQUA_WALL || MAT.STONEBRICK, ROOF = G + 5;
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= ROOF + 1; y++) clear(u, v, y);
    put(u, v, G, WALL); put(u, v, ROOF, WALL);
    if (u === 0 || u === W_ - 1 || v === 0 || v === D_ - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, WALL);
  }
  // the hall's ceiling lit, the doorway in the front
  for (const v of [2, 7, 12]) put(5, v, ROOF - 1, MAT.LAMP_HANG);
  const doorAt = fr.sideways ? [0, 2] : [5, 0];
  for (let y = G + 1; y <= G + 2; y++) clear(doorAt[0], doorAt[1], y);

  const fish = [], tanks = [];
  const fillTank = (us, vs, glassAt) => {
    for (const v of vs) for (const u of us) {
      put(u, v, G, MAT.SEA_LANTERN || MAT.LAMP);                   // a lit floor
      for (let y = G + 1; y <= G + 3; y++) put(u, v, y, MAT.WATER); // three deep
      clear(u, v, G + 4);                                            // a block of air to breathe at
    }
    for (const [u, v] of glassAt) for (let y = G + 1; y <= G + 4; y++) put(u, v, y, MAT.GLASS);
  };
  // the side tanks: two each side, four long, two deep, glass on the hall
  let next = 0;
  for (let k = 0; k < 2; k++) for (const side of [0, 1]) {
    const va = 4 + 5 * k, vb = va + 3;
    const us = side === 0 ? [1, 2] : [8, 9], glassU = side === 0 ? 3 : 7;
    for (const v of [va - 1, vb + 1]) for (const u of us) for (let y = G + 1; y <= G + 4; y++) put(u, v, y, WALL);
    const vs = []; for (let v = va; v <= vb; v++) vs.push(v);
    fillTank(us, vs, vs.map((v) => [glassU, v]));
    const t = AQUARIUM_TANKS[next++];
    t.kinds.forEach((kind, i) => {
      for (let n = 0; n < 2; n++) {
        const [x, z] = at(us[n % 2], va + (i * 2 + n) % 4);
        fish.push({ type: kind, x: x + 0.5, y: G + 2, z: z + 0.5, name: niceName(kind), tank: tanks.length });
      }
    });
    const [sx, sz] = at(side === 0 ? 4 : 6, va + 1);
    sign(world, sx, G + 1, sz, fr.nameOf(side === 0 ? fr.across : [-fr.across[0], -fr.across[1]]), t.name, signTags);
    tanks.push({ side, v: [va, vb], name: t.name, kinds: t.kinds });
  }
  // the reef across the back: every named tropical fish, and dolphins
  const reefV = [15, 16, 17, 18], reefU = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let u = 1; u < W_ - 1; u++) for (let y = G + 1; y <= G + 4; y++) put(u, 14, y, MAT.GLASS);
  fillTank(reefU, reefV, []);
  TROPICAL_VARIETIES.forEach((variety, i) => {
    const [x, z] = at(reefU[i % reefU.length], reefV[Math.floor(i / reefU.length) % reefV.length]);
    fish.push({ type: 'tropicalfish', variety, x: x + 0.5, y: G + 1 + (i % 3), z: z + 0.5, name: 'Fish', tank: tanks.length });
  });
  for (const u of [3, 7]) { const [x, z] = at(u, 17); fish.push({ type: 'dolphin', x: x + 0.5, y: G + 2, z: z + 0.5, name: 'Dolphin', tank: tanks.length }); }
  const [rx, rz] = at(5, 13);
  sign(world, rx, G + 1, rz, fr.nameOf(fr.back.map((n) => -n)), 'The reef', signTags);
  tanks.push({ reef: true, name: 'The reef', kinds: ['tropicalfish', 'dolphin'] });
  const door = fr.sideways ? at(-1, 2) : at(5, -1);
  return { kind: 'aquarium', lot, fish, tanks, sideways: fr.sideways, door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_ } };
}

// a name for its nametag: the kind, words capitalised, no spaces (the summon form)
export function niceName(kind) { return kind.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(''); }
