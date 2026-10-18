// engine/flood.js — a sunken district under the sea (the Sunken style: styles.js).
//
// Where the city (or one district of a mixed city) is Sunken, the sea comes over it:
// water through its streets, gardens and rooms, its cellars too, up to DEPTH blocks over
// its highest ground, so the low buildings stand under it and the tall ones rise out of
// it. To swim through: every doorway open to the water, every room a room to swim into.
//
// THE WALL. The sea has to stand in something: a wall of glass round the flooded ground
// wherever it meets ground that is not (the dry city, the edge of the city, a landmark's
// lot with machines or mobs in it, which stays dry in its own pocket of air), from the ground to over the water a
// block. Posts of dark prismarine with sea lanterns up them every six; a coping of
// prismarine brick. In each column of the wall a block that would let the water through
// (anything but a whole block, glass or a door) gives way to the wall; the world's own
// water there (a canal crossing under it) stays, as level outside as in. Where a street
// or path crosses the wall a door: a door holds back the sea, open or shut, and the way
// on foot across the city is kept.
//
// WHAT THE WATER WOULD BREAK. Water washes away torches, rails, redstone, carpets,
// buttons, flowers, crops and the like. Under the water each is taken out first: a
// plant on solid ground becomes seagrass, the rest goes. (The city's lighting pass runs
// after this one and lights the dark it leaves, with sea lanterns set in the floor and
// lanterns hung, which stand in water.)
//
// LIFE. No villager, golem, cat or farm animal is left under the water (they would
// drown); a hostile mob there becomes a drowned. In their place fish, squid, glow squid,
// turtles on the sand, dolphins near the surface, axolotls. Kelp up through the streets,
// seagrass, coral on the roofs under water, sea pickles.
//
// BREATH. A conduit on the open ground of each part of the flooded city, in a whole frame
// of prismarine (forty-two blocks: three square rings of sixteen through it, one in each
// plane), the three-by-three of water round it clear: in the game it gives Water
// Breathing (and sight, and quick mining) to everyone within ninety-six blocks. As many
// as it takes for every flooded column to be within EIGHTY of one.
//
// The sea itself is not blocks of the world (sea.js says why): world.sea describes it,
// and the exports write it last, once the wall is whole.

import { MAT, MATERIALS, B as BIT, I, S, doorId, DIR } from './materials.js';
import { makeRng } from './rng.js';
import { inAirBox } from './underground.js';
import { tropicalVariant, FISH_NAMES } from './fish.js';
import { HOSTILE_KINDS } from './hostiles.js';

export const DEPTH = 11;
const REACH = 80;
const MIN_PATCH = 300;
export const DRY_KINDS = new Set(['zoo', 'aquarium', 'jail', 'factory', 'workshop', 'mill', 'park', 'waterpark', 'lazyriver', 'garden', 'stadium', 'bank',
  'nightclub', 'bandstand', 'petrol', 'themepark', 'airport', 'sports', 'wizard', 'station', 'museum']);              // (columns: a patch of sea smaller than this stays dry)
const PLANT = { passable: true, flowable: true, transparent: true };
const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FACE = (dx, dz) => (dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north');

// what the water would take away, and what of it is a plant (seagrass in its place)
const WASHED = /(^|_)torch$|redstone_wire|(^|_)rail$|carpet|_button$|^lever$|pressure_plate|tripwire|repeater|comparator|^web$|cobweb|^fire$|snow_layer|waterlily|lily_pad|frog_spawn/;
const PLANTS = /flower$|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|lily_of_the_valley|wither_rose|sapling|short_grass|tallgrass|^grass$|tall_grass|fern$|wheat|carrots|potatoes|beetroot|reeds|sugar_cane|sweet_berry|mushroom$|deadbush|dead_bush|pink_petals|torchflower|pitcher|^bamboo$|bamboo_sapling|melon_stem|pumpkin_stem|_roots$|nether_sprouts|lilac|rose_bush|peony|sunflower|double_plant|crimson_fungus|warped_fungus/;
// a block the sea gets through or round
const LEAKY = /stairs|slab|fence|_wall$|^cobblestone_wall$|pane|bars|trapdoor|(?<!sea_)lantern|chain|sign|ladder|scaffolding|campfire|candle|rail|carpet|torch|button|lever|plate|flower|sapling|grass(?!_path)|fern|kelp|seagrass|coral|pickle|vine|_bed$|^bed$|chest|banner|bell|anvil|cauldron|hopper|lectern|brewing|grindstone|stonecutter|composter|cake|pot$|head|skull|rod$|dripleaf|azalea|bamboo|cactus|leaves|water|lava|bubble|snow_layer|item_frame|end_portal|cobweb|web$/;

export function floodSunken(world, plan, ctx) {
  const { GROUND, elevAt, styleAt, base, landmarks = [], seed = 0 } = ctx;
  const { W, D, mask } = plan;
  const rng = makeRng((seed ^ 0x5a4ec) >>> 0);
  const sunkenAt = (x, z) => !!(styleAt ? styleAt(x, z) : base).sunken;
  // the landmarks with machines, mobs or lava in them stay dry, each in its own pocket of
  // air; the rest (the town hall, the library, the church, the castle...) go under with the city
  const lots = landmarks.filter((L) => DRY_KINDS.has(L.kind)).map((L) => L.lot).filter(Boolean);
  const dry = (x, z) => lots.some((l) => x >= l.x0 - 1 && x <= l.x1 + 1 && z >= l.z0 - 1 && z <= l.z1 + 1);
  const R = new Uint8Array(W * D);
  let any = 0;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    if (mask && !mask[i]) continue;
    if (!sunkenAt(x, z) || dry(x, z)) continue;
    R[i] = 1; any++;
  }
  const inR = (x, z) => x >= 0 && z >= 0 && x < W && z < D && R[z * W + x] === 1;
  // the wall never runs through a building: one the dry ground reaches (a building on
  // the district's edge) stays dry in a pocket of its own, a block of dry ground round it
  const dryBuildings = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const b of ctx.buildings || []) {
      if (b.landmark || dryBuildings.includes(b)) continue;
      let some = false, gap = false;
      for (let z = b.z0 - 1; z <= b.z1 + 1; z++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { if (inR(x, z)) some = true; else gap = true; }
      if (!some || !gap) continue;
      for (let z = b.z0 - 1; z <= b.z1 + 1; z++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) if (inR(x, z)) { R[z * W + x] = 0; any--; }
      dryBuildings.push(b); changed = true;
    }
  }
  // and no scrap of sea: a patch too small to swim in (left between dry buildings) stays dry
  {
    const seen = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (seen[z * W + x] || !inR(x, z)) continue;
      const cells = [[x, z]], q = [[x, z]]; seen[z * W + x] = 1;
      while (q.length) { const [a, b] = q.pop(); for (const [dx, dz] of N4) { const X = a + dx, Z = b + dz; if (inR(X, Z) && !seen[Z * W + X]) { seen[Z * W + X] = 1; q.push([X, Z]); cells.push([X, Z]); } } }
      if (cells.length < MIN_PATCH) for (const [a, b] of cells) { R[b * W + a] = 0; any--; }
    }
  }
  if (any <= 0) return null;
  const g = (x, z) => GROUND + elevAt(x, z);
  let gMax = -Infinity, gMin = Infinity, bx0 = W, bx1 = -1, bz0 = D, bz1 = -1;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (R[z * W + x]) {
    const h = g(x, z); if (h > gMax) gMax = h; if (h < gMin) gMin = h;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  const SEA = gMax + DEPTH;
  // the wall's columns: flooded ground with a side on ground that is not
  const B = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (R[z * W + x] && N4.some(([a, b]) => !inR(x + a, z + b))) B[z * W + x] = 1;
  const inB = (x, z) => x >= 0 && z >= 0 && x < W && z < D && B[z * W + x] === 1;
  const wet = (x, z) => inR(x, z) && !inB(x, z);              // a column the sea covers
  const info = { sea: SEA, columns: any, dryBuildings, wall: 0, doors: [], washed: 0, seagrass: 0, kelp: 0, coral: 0, pickles: 0, conduits: [], life: [], fish: [], gone: 0, drowned: 0, wetAt: [] };
  const name = (id) => (id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''));
  const pass = (id) => id < 0 || MATERIALS.isPassable(id);
  const tight = (id) => {
    if (id < 0) return false;
    const n = name(id);
    if (/_door$|^wooden_door$|^iron_door$/.test(n)) return true;
    if (/glass/.test(n)) return true;
    if (MATERIALS.isPassable(id)) return false;
    return !LEAKY.test(n);
  };
  // ---- the wall
  const DARK = MAT.DARK_PRISMARINE, CAP = MAT.AQUA_WALL;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!B[z * W + x]) continue;
    const gy = g(x, z);
    // a door where the way runs across: open on both sides of the wall at the ground
    let doorOut = null;
    for (const [a, b] of N4) {
      if (inR(x + a, z + b)) continue;
      const ox = x + a, oz = z + b, ix = x - a, iz = z - b;
      const outside = ox < 0 || oz < 0 || ox >= W || oz >= D || (mask && !mask[oz * W + ox]);
      const og = outside ? gy : g(ox, oz);
      const outOpen = outside || (Math.abs(og - gy) <= 1 && pass(world.get(ox, og + 1, oz)) && pass(world.get(ox, og + 2, oz)) && !pass(world.get(ox, og, oz)));
      const here = pass(world.get(x, gy + 1, z)) && pass(world.get(x, gy + 2, z)) && !pass(world.get(x, gy, z));
      const inOpen = inR(ix, iz) && pass(world.get(ix, gy + 1, iz)) && pass(world.get(ix, gy + 2, iz));
      if (outOpen && here && inOpen) { doorOut = [a, b]; break; }
    }
    // (from the bottom of whatever opens under the ground here, a canal's cut, the air
    // under a bridge's deck, so the sea cannot run out under the wall)
    let yLow = gy + 1;
    for (let y = gy; y >= Math.max(world.box.y0, gy - 24); y--) { const id = world.get(x, y, z); if (id === MAT.WATER) break; if (id < 0 || !tight(id)) yLow = y; }
    for (let y = yLow; y <= SEA + 1; y++) {
      const id = world.get(x, y, z);
      if (doorOut && (y === gy + 1 || y === gy + 2)) {
        const f = FACE(...doorOut), hinge = (x + z) & 1;
        world.set(x, y, z, doorId('warped', DIR[f], y === gy + 2, hinge));
        if (y === gy + 1) info.doors.push({ at: [x, y, z], out: doorOut });
        continue;
      }
      if (id === MAT.WATER) continue;                          // (a canal under the wall: level both sides)
      if (tight(id)) continue;
      const post = (x + z) % 6 === 0;
      world.set(x, y, z, y === SEA + 1 ? CAP : post ? ((y - gy) % 5 === 3 ? MAT.SEA_LANTERN : DARK) : MAT.GLASS);
      info.wall++;
    }
  }
  // ---- the sea's cells
  const rooms = inAirBox(world);
  // (and down whatever opens below the ground: the canal's cut over its water, a way down)
  const low = new Int16Array(W * D).fill(32767);
  let lowest = Infinity;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!wet(x, z)) continue;
    let y = g(x, z);
    while (y > g(x, z) - 24 && !world.has(x, y, z)) y--;
    low[z * W + x] = y + 1;
    if (y + 1 < lowest) lowest = y + 1;
  }
  const seaAt = (x, y, z) => {
    if (!wet(x, z) || y > SEA) return false;
    if (y >= low[z * W + x]) return true;
    return !!(rooms && rooms(x, y, z));                        // a cellar under it
  };
  const flooded = (x, y, z) => seaAt(Math.floor(x), Math.floor(y), Math.floor(z)) || (wet(Math.floor(x), Math.floor(z)) && Math.floor(y) <= SEA && Math.floor(y) > g(Math.floor(x), Math.floor(z)));
  // ---- what the water would break, taken out first
  const plantGrass = MAT.SEAGRASS;
  const changes = [];
  world.forEach((x, y, z, id) => {
    if (!wet(x, z) || y > SEA) return;
    if (y <= g(x, z) && !(rooms && rooms(x, y, z)) && y < low[z * W + x] - 1) return;
    const n = name(id);
    if (WASHED.test(n)) changes.push([x, y, z, -1]);
    else if (PLANTS.test(n)) {
      const below = world.get(x, y - 1, z);
      changes.push([x, y, z, below >= 0 && !MATERIALS.isPassable(below) && !PLANTS.test(name(below)) ? plantGrass : -1]);
    }
  });
  for (const [x, y, z, id] of changes) {
    if (id < 0) { world.clear(x, y, z); info.washed++; }
    else { world.set(x, y, z, id); info.seagrass++; }
  }
  // ---- the conduits: on open flooded ground, as few as cover it all
  // (a five by five of flooded columns with five clear over the highest thing in it,
  // the frame's top under the surface: on open ground, over a street, over low roofs)
  const topIn = (x, z) => { for (let y = SEA - 1; y > g(x, z); y--) if (world.has(x, y, z)) return y; return g(x, z); };
  const open5 = (cx, cz) => {
    let base = -Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { if (!wet(cx + dx, cz + dz)) return null; base = Math.max(base, topIn(cx + dx, cz + dz)); }
    if (base + 5 > SEA - 1) return null;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (let y = base + 1; y <= base + 5; y++) if (world.has(cx + dx, y, cz + dz)) return null;
    return base;
  };
  const cands = [];
  for (let z = 2; z < D - 2; z += 2) for (let x = 2; x < W - 2; x += 2) { const b0 = open5(x, z); if (b0 !== null) cands.push([x, z, b0, b0 === g(x, z)]); }
  const sample = [];
  for (let z = 0; z < D; z += 4) for (let x = 0; x < W; x += 4) if (wet(x, z)) sample.push([x, z]);
  let left = sample.slice();
  while (left.length && cands.length && info.conduits.length < 8) {
    let best = null, bestN = 0;
    for (const c of cands) {
      const [cx, cz, , onGround] = c;
      let n = 0; for (const [x, z] of left) if ((x - cx) ** 2 + (z - cz) ** 2 <= REACH * REACH) n++;
      // (on the open ground where it can be: the frame best seen from the street)
      if (n > bestN || (n === bestN && n > 0 && onGround && !best[3])) { bestN = n; best = c; }
    }
    if (!best) break;
    const [cx, cz, base] = best, cy = base + 3;
    const CONDUIT = mat('conduit', '#c8a060', {}, { transparent: true });
    world.set(cx, cy, cz, CONDUIT);
    info.wetAt.push([cx, cy, cz]);
    let frame = 0;
    const FR = [MAT.AQUA_WALL, MAT.PRISMARINE, MAT.DARK_PRISMARINE];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== 2) continue;
      for (const [dx, dy, dz] of [[a, b, 0], [a, 0, b], [0, a, b]]) {
        if (world.has(cx + dx, cy + dy, cz + dz)) continue;
        world.set(cx + dx, cy + dy, cz + dz, (dx === 0 || dy === 0 || dz === 0) && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 2 ? MAT.SEA_LANTERN : FR[(Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) % 3]);
        frame++;
      }
    }
    info.conduits.push({ at: [cx, cy, cz], frame });
    left = left.filter(([x, z]) => (x - cx) ** 2 + (z - cz) ** 2 > REACH * REACH);
    for (let i = cands.length - 1; i >= 0; i--) if (Math.abs(cands[i][0] - cx) <= 6 && Math.abs(cands[i][1] - cz) <= 6) cands.splice(i, 1);
  }
  info.uncovered = left.length;
  // ---- kelp, seagrass and coral
  const KELP = (age) => mat('kelp', '#2a6a3a', { kelp_age: I(age) }, PLANT);
  const PICKLE = mat('sea_pickle', '#6a9a2a', { cluster_count: I(2), dead_bit: BIT(0) }, PLANT);
  const CORALS = ['tube', 'brain', 'bubble', 'fire', 'horn'];
  const COLOUR = { tube: '#3150c8', brain: '#c45a9a', bubble: '#a030a8', fire: '#b02a2a', horn: '#d0c040' };
  const nearConduit = (x, z) => info.conduits.some((c) => Math.abs(c.at[0] - x) <= 3 && Math.abs(c.at[2] - z) <= 3);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!wet(x, z) || nearConduit(x, z)) continue;
    const gy = g(x, z);
    const ground = world.get(x, gy, z);
    if (!world.has(x, gy + 1, z) && !world.has(x, gy + 2, z) && (ground === MAT.SAND || ground === MAT.GRAVEL)) {
      const p = rng();
      if (p < 0.035) {
        const h = Math.min(SEA - gy - 2, 3 + Math.floor(rng() * 8));
        let ok = true; for (let y = gy + 1; y <= gy + h; y++) if (world.has(x, y, z)) ok = false;
        if (ok && h >= 2) { for (let y = gy + 1; y <= gy + h; y++) world.set(x, y, z, KELP(y === gy + h ? 25 : 0)); info.kelp++; continue; }
      }
      if (p < 0.12) { world.set(x, gy + 1, z, MAT.SEAGRASS); info.seagrass++; continue; }
    }
    // on a roof (or any top) under the water: coral now and then, a sea pickle
    let top = -1; for (let y = SEA - 1; y > gy; y--) if (world.has(x, y, z)) { top = y; break; }
    if (top > gy + 1 && top + 1 <= SEA - 1 && !world.has(x, top + 1, z) && !pass(world.get(x, top, z)) && !/glass|door|stairs|slab/.test(name(world.get(x, top, z)))) {
      const p = rng();
      if (p < 0.05) { const k = CORALS[Math.floor(rng() * 5)]; world.set(x, top + 1, z, rng() < 0.5 ? mat(k + '_coral', COLOUR[k], {}, PLANT) : mat(k + '_coral_fan', COLOUR[k], { coral_fan_direction: I(0) }, PLANT)); info.coral++; }
      else if (p < 0.07) { world.set(x, top + 1, z, PICKLE); info.pickles++; }
    }
  }
  // every plant under the water stands in water (its second layer): kelp, seagrass, coral, pickles
  world.forEach((x, y, z, id) => {
    if (!wet(x, z) || y > SEA) return;
    if (/kelp|seagrass|coral$|coral_fan|sea_pickle|conduit/.test(name(id))) info.wetAt.push([x, y, z]);
  });
  // ---- life: the land's folk out of the water, the sea's in
  const spots = [];
  for (let n = 0; n < 4000 && spots.length < 600; n++) {
    const x = bx0 + Math.floor(rng() * (bx1 - bx0 + 1)), z = bz0 + Math.floor(rng() * (bz1 - bz0 + 1));
    if (!wet(x, z)) continue;
    const gy = g(x, z), y = gy + 2 + Math.floor(rng() * Math.max(1, SEA - gy - 3));
    if (world.has(x, y, z) || world.has(x, y + 1, z) || !seaAt(x, y + 1, z)) continue;
    spots.push([x, y, z]);
  }
  const apart = (list, x, y, z, d) => list.every((p) => Math.max(Math.abs(p.x - x - 0.5), Math.abs(p.y - y), Math.abs(p.z - z - 0.5)) >= d);
  const area = any;
  const want = { squid: Math.min(8, 1 + Math.round(area / 2500)), glow_squid: Math.min(4, 1 + Math.round(area / 6000)), dolphin: Math.min(4, 1 + Math.round(area / 6000)),
    axolotl: Math.min(4, 1 + Math.round(area / 8000)), turtle: Math.min(6, 1 + Math.round(area / 4000)) };
  const NICE = { squid: 'Squid', glow_squid: 'Glow Squid', dolphin: 'Dolphin', axolotl: 'Axolotl', turtle: 'Turtle' };
  for (const [kind, n] of Object.entries(want)) {
    let placed = 0;
    for (let t = 0; t < 400 && placed < n; t++) {
      let [x, y, z] = spots[Math.floor(rng() * spots.length)] || [];
      if (x === undefined) break;
      if (kind === 'dolphin') { y = SEA - 1; if (world.has(x, y, z) || !seaAt(x, y, z)) continue; }
      if (kind === 'turtle' || kind === 'axolotl') { y = g(x, z) + 1; if (world.has(x, y, z) || world.has(x, y + 1, z) || !seaAt(x, y, z) || pass(world.get(x, y - 1, z))) continue; }
      if (!apart(info.life, x, y, z, 4)) continue;
      info.life.push({ type: kind, x: x + 0.5, y, z: z + 0.5, name: NICE[kind] });
      placed++;
    }
  }
  const nFish = Math.min(60, Math.max(8, Math.round(area / 350)));
  for (let t = 0; t < nFish * 10 && info.fish.length < nFish && spots.length; t++) {
    const [x, y, z] = spots[Math.floor(rng() * spots.length)];
    if (info.fish.some((f) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y), Math.abs(f.z - z)) < 3)) continue;
    const q = rng(), type = q < 0.5 ? 'tropicalfish' : q < 0.8 ? 'cod' : 'salmon';
    const f = { type, x, y, z, water: 'sea', name: FISH_NAMES[type] };
    if (type === 'tropicalfish') f.variant = tropicalVariant({ int: (a, b) => a + Math.floor(rng() * (b - a + 1)) });
    info.fish.push(f);
  }
  // the hostiles under the water drown
  const dr = HOSTILE_KINDS.drowned;
  for (const h of ctx.hostiles || []) if (flooded(h.x, h.y, h.z) && h.type !== 'drowned') { h.type = 'drowned'; h.name = dr.name; info.drowned++; }
  info.keep = (p) => {
    const kind = p.type === 'mob' ? p.kind : p.type;
    if (['cod', 'salmon', 'tropicalfish'].includes(kind)) return true;
    const x = p.x !== undefined ? p.x : p.pos && p.pos[0], y = p.y !== undefined ? p.y : p.pos && p.pos[1], z = p.z !== undefined ? p.z : p.pos && p.pos[2];
    if (x === undefined) return true;
    return !flooded(x, y, z);
  };
  info.seaAt = seaAt;
  info.flooded = flooded;
  info.inR = inR; info.inB = inB; info.wetCol = wet; info.ground = g;
  world.sea = { G: gMin, S: SEA, y0: rooms ? undefined : undefined, box: { x0: bx0 - 1, x1: bx1 + 1, z0: bz0 - 1, z1: bz1 + 1 }, at: seaAt, sunken: true };
  // (the cellars under it: the exports go down to them)
  { let lo = Math.min(gMin + 1, lowest); if (rooms) for (const b of world.airBoxes) if (b.y0 < lo && b.x1 >= bx0 && b.x0 <= bx1 && b.z1 >= bz0 && b.z0 <= bz1) lo = b.y0; world.sea.y0 = lo; }
  return info;
}
