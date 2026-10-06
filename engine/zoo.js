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
  { kinds: ['turtle', 'frog', 'rabbit'], name: 'Pond', ground: 'pond', roof: true },   // (frogs jump: roofed)
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
// how wide each animal is (a body this wide must fit its pen with room)
export const ANIMAL_WIDTH = { sniffer: 1.9, camel: 1.7, panda: 1.7, polar_bear: 1.4, horse: 1.4, donkey: 1.4, mule: 1.4, turtle: 1.2,
  cow: 0.9, mooshroom: 0.9, llama: 0.9, goat: 0.9, strider: 0.9, sheep: 0.9, pig: 0.9, armadillo: 0.7, fox: 0.6, wolf: 0.6, cat: 0.6, ocelot: 0.6 };

export function zoo(world, lot, face, cfg, rng, G, signTags) {
  // As wide as the lot allows, the pens deeper back from the path: twenty-three
  // across gives pens eight deep, nineteen six, fifteen four (lots run wider than
  // they run long). Twenty-eight deep where the lot allows: every pen its own;
  // twenty-four: two pairs that get along share. The farm and the drylands two
  // rows long either way.
  let fr = null, W_ = 0, D_ = 0;
  for (const D of [28, 24]) for (const W of [23, 19, 15]) { if (fr) break; const f = lotFrame(lot, face, W, D); if (f) { fr = f; W_ = W; D_ = D; } }
  if (!fr) return null;
  const pd = (W_ - 7) / 2;                                  // how deep a pen runs back from the path
  const rows = (D_ - 4) / 4;                                // 6 or 5 a side
  // (every pen its own only when they are six deep or more: three horses, each a
  // block and a half across, do not stand clear in a pen four by three)
  const big = D_ === 28 && pd >= 6;
  const pathU = [pd + 2, pd + 3, pd + 4], fenceU = [pd + 1, pd + 5];
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
  for (let v = 0; v < D_ - 1; v++) for (const u of pathU) put(u, v, G, MAT.GRAVEL);         // the path
  for (let v = 0; v <= 2; v++) for (let u = 1; u < W_ - 1; u++) put(u, v, G, MAT.GRAVEL);  // the plaza at the gate
  for (let u = 0; u < W_; u++) { if (pathU.includes(u)) continue; put(u, 0, G + 1, MAT.FENCE); }   // the front, the gate open

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
      const ua = side === 0 ? 1 : pd + 6, ub = side === 0 ? pd : W_ - 2;
      const front = side === 0 ? fenceU[0] : fenceU[1];
      for (let v = va - 1; v <= vb + 1; v++) for (let y = G + 1; y <= G + FENCE_H; y++) put(front, v, y, MAT.FENCE);
      for (const v of [va - 1, vb + 1]) for (let u = ua; u <= ub; u++) for (let y = G + 1; y <= G + FENCE_H; y++) put(u, v, y, MAT.FENCE);
      for (let v = va; v <= vb; v++) for (let u = ua; u <= ub; u++) { for (let y = G + 1; y <= G + FENCE_H; y++) clear(u, v, y); put(u, v, G, GROUND[pen.ground]()); }
      if (pen.ground === 'pond') for (let v = va; v <= va + 1; v++) for (let u = ua + 1; u <= Math.min(ub - 1, ua + 2); u++) put(u, v, G, MAT.WATER);
      if (pen.roof) for (let v = va - 1; v <= vb + 1; v++) for (let u = Math.min(ua, front) - (side === 0 ? 1 : 0); u <= Math.max(ub, front) + (side === 1 ? 1 : 0); u++) put(u, v, G + FENCE_H + 1, MAT.GLASS);
      // Where each animal stands: on a pen row's middle line, a block apart along
      // it, its body clear of every fence by half its width and a tenth more (an
      // animal set against a fence starts inside it, and the game pushes it out,
      // not always back into the pen: a turtle ended up between two). The biggest
      // first, on the rows furthest from the fences.
      // (every row is a slot row; the fence clearance below keeps a big one to
      // the middle rows, a small one may stand on an outer one)
      const lines = []; for (let v = va; v <= vb; v++) lines.push(v);
      lines.sort((p, q) => Math.abs(p - (va + vb) / 2) - Math.abs(q - (va + vb) / 2));
      const slots = [];
      for (const lv of lines) for (let u = ua; u <= ub; u++) slots.push([u, lv]);
      const order = pen.kinds.slice().sort((a, b) => (ANIMAL_WIDTH[b] || 0.6) - (ANIMAL_WIDTH[a] || 0.6));
      const taken = [];
      for (const kind of order) {
        const h = (ANIMAL_WIDTH[kind] || 0.6) / 2 + 0.1;
        // a slot whose middle is far enough from the pen's edges, and from those taken
        // (clear of the fence is what matters; each its own block among the others,
        // two apart where the pen has the room)
        const clearOfFence = slots.filter(([u, v]) => u + 0.5 - ua >= h && ub + 1 - (u + 0.5) >= h && v + 0.5 - va >= h && vb + 1 - (v + 0.5) >= h);
        const apart = (d) => clearOfFence.filter(([u, v]) => taken.every(([tu, tv]) => Math.abs(tu - u) + Math.abs(tv - v) >= d));
        const fits = apart(2).length ? apart(2) : apart(1);
        const pick = fits.length ? fits[Math.floor(fits.length / 2)] : null;
        if (!pick) continue;
        taken.push([pick[0], pick[1], h]);
        const [x, z] = at(pick[0], pick[1]);
        animals.push({ type: kind, x: x + 0.5, y: G + 1, z: z + 0.5, name: niceName(kind), pen: pens.length });
      }
      const [sx, sz] = at(side === 0 ? pathU[0] : pathU[2], va + 1);
      const facing = fr.nameOf(side === 0 ? [fr.across[0], fr.across[1]] : [-fr.across[0], -fr.across[1]]);
      sign(world, sx, G + 1, sz, facing, pen.name, signTags);
      pens.push({ side, u: [ua, ub], v: [va, vb], name: pen.name, kinds: pen.kinds, roof: !!pen.roof });
    }
  }
  // lanterns on the path's fence posts (never on a roofed pen's front row)
  for (const v of [3, 11, 15]) for (const u of fenceU) {
    if (pens.some((p) => p.roof && v >= p.v[0] - 1 && v <= p.v[1] + 1 && (u === fenceU[0]) === (p.side === 0))) continue;
    put(u, v, G + FENCE_H + 1, MAT.LAMP);
  }
  const door = at(pathU[1], -1);
  return { kind: 'zoo', lot, animals, pens, big, wide: W_, sideways: fr.sideways, door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_, FENCE_H, pathU } };
}

// ---- the aquarium ----------------------------------------------------------------------
// Fifteen by twenty-five where the lot allows: tanks four deep, six long, water
// four deep (squid had no room in the old ones, two by four by three). Else the
// compact one, eleven by twenty, as before. The same plan either way: a hall down
// the middle, two tanks a side behind glass, the reef across the back.
export function aquarium(world, lot, face, cfg, rng, G, signTags) {
  let size = { W: 15, D: 25, td: 4, tl: 6, wd: 4 };
  let fr = lotFrame(lot, face, size.W, size.D);
  if (!fr) { size = { W: 11, D: 20, td: 2, tl: 4, wd: 3 }; fr = lotFrame(lot, face, size.W, size.D); }
  if (!fr) return null;
  const { W: W_, D: D_, td, tl, wd } = size;
  const big = W_ === 15;
  const { at } = fr;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const WALL = MAT.AQUA_WALL || MAT.STONEBRICK, ROOF = G + wd + 2;
  const hall = [td + 2, td + 3, td + 4], mid = td + 3;          // the hall down the middle
  for (let v = 0; v < D_; v++) for (let u = 0; u < W_; u++) {
    for (let y = G + 1; y <= ROOF + 1; y++) clear(u, v, y);
    put(u, v, G, WALL); put(u, v, ROOF, WALL);
    if (u === 0 || u === W_ - 1 || v === 0 || v === D_ - 1) for (let y = G + 1; y < ROOF; y++) put(u, v, y, WALL);
  }
  // the hall's ceiling lit, the doorway in the front
  for (let v = 2; v < D_ - 6; v += 5) put(mid, v, ROOF - 1, MAT.LAMP_HANG);
  const doorAt = fr.sideways ? [0, 2] : [mid, 0];
  for (let y = G + 1; y <= G + 2; y++) clear(doorAt[0], doorAt[1], y);

  const fish = [], tanks = [];
  const fillTank = (us, vs, glassAt) => {
    for (const v of vs) for (const u of us) {
      put(u, v, G, MAT.SEA_LANTERN || MAT.LAMP);                   // a lit floor
      for (let y = G + 1; y <= G + wd; y++) put(u, v, y, MAT.WATER);
      clear(u, v, G + wd + 1);                                       // a block of air to breathe at
    }
    for (const [u, v] of glassAt) for (let y = G + 1; y <= G + wd + 1; y++) put(u, v, y, MAT.GLASS);
  };
  // the side tanks: two each side, glass on the hall
  let next = 0;
  for (let k = 0; k < 2; k++) for (const side of [0, 1]) {
    const va = 4 + (tl + 1) * k, vb = va + tl - 1;
    const us = []; for (let u = 1; u <= td; u++) us.push(side === 0 ? u : W_ - 1 - u);
    const glassU = side === 0 ? td + 1 : W_ - 2 - td;
    for (const v of [va - 1, vb + 1]) for (const u of us) for (let y = G + 1; y <= G + wd + 1; y++) put(u, v, y, WALL);
    const vs = []; for (let v = va; v <= vb; v++) vs.push(v);
    fillTank(us, vs, vs.map((v) => [glassU, v]));
    const t = AQUARIUM_TANKS[next++];
    // two of each kind (squid three), spread through the tank, at depths in turn
    const each = (kind) => (kind === 'squid' || kind === 'glow_squid') && big ? 3 : 2;
    let n = 0;
    for (const kind of t.kinds) for (let c = 0; c < each(kind); c++, n++) {
      const u = us[(n * 2 + 1) % us.length], v = va + ((n * 3 + 1) % tl), y = G + 1 + (n % wd);
      const [x, z] = at(u, v);
      fish.push({ type: kind, x: x + 0.5, y, z: z + 0.5, name: niceName(kind), tank: tanks.length });
    }
    const [sx, sz] = at(side === 0 ? hall[0] : hall[2], va + 1);
    sign(world, sx, G + 1, sz, fr.nameOf(side === 0 ? fr.across : [-fr.across[0], -fr.across[1]]), t.name, signTags);
    tanks.push({ side, u: [Math.min(...us), Math.max(...us)], v: [va, vb], water: wd, name: t.name, kinds: t.kinds });
  }
  // the reef across the back: every named tropical fish, and dolphins
  const glassV = 4 + (tl + 1) * 2;
  const reefV = [], reefU = [];
  for (let v = glassV + 1; v < D_ - 1; v++) reefV.push(v);
  for (let u = 1; u < W_ - 1; u++) reefU.push(u);
  for (const u of reefU) for (let y = G + 1; y <= G + wd + 1; y++) put(u, glassV, y, MAT.GLASS);
  fillTank(reefU, reefV, []);
  TROPICAL_VARIETIES.forEach((variety, i) => {
    const [x, z] = at(reefU[(i * 3) % reefU.length], reefV[i % reefV.length]);
    fish.push({ type: 'tropicalfish', variety, x: x + 0.5, y: G + 1 + (i % wd), z: z + 0.5, name: 'Fish', tank: tanks.length });
  });
  for (const u of [Math.floor(W_ / 4), W_ - 1 - Math.floor(W_ / 4)]) { const [x, z] = at(u, reefV[Math.floor(reefV.length / 2)]); fish.push({ type: 'dolphin', x: x + 0.5, y: G + 2, z: z + 0.5, name: 'Dolphin', tank: tanks.length }); }
  const [rx, rz] = at(mid, glassV - 1);
  sign(world, rx, G + 1, rz, fr.nameOf(fr.back.map((n) => -n)), 'The reef', signTags);
  tanks.push({ reef: true, u: [1, W_ - 2], v: [reefV[0], reefV[reefV.length - 1]], water: wd, name: 'The reef', kinds: ['tropicalfish', 'dolphin'] });
  const door = fr.sideways ? at(-1, 2) : at(mid, -1);
  return { kind: 'aquarium', lot, fish, tanks, big, sideways: fr.sideways, door: [door[0], G + 1, door[1]], frame: { at, W: W_, D: D_ } };
}

// a name for its nametag: the kind, words capitalised, no spaces (the summon form)
export function niceName(kind) { return kind.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(''); }
