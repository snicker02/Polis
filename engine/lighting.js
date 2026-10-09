// engine/lighting.js — no dark corners: every spot a mob could spawn is lit.
//
// Block light is worked out the way the game does it: each light source gives
// its level to its own cell, and light spreads to the six neighbours one level
// weaker, stopped by opaque blocks (glass, leaves, fences, doors, stairs, slabs
// and the like let it through). A hostile mob can spawn on the top of an opaque
// block with two cells of room above it (air, or a plant it can stand in).
// Since 1.18, in both editions, an Overworld hostile mob spawns only where the
// block light is 0 (Bedrock also needs sky light under 7). So every such spot
// outside must reach at least 1 (TARGET_OUT); every spot inside a building
// reaches 8 (TARGET), so rooms are properly lit and a home stays safe even
// under the old rule (7 or less). (The Nether dimension is different, mobs
// spawning there up to 11, but a city is built in the Overworld whatever its
// style.)
//
// A spot that falls short gets a light: a lantern hung from the ceiling when
// the ceiling is high enough that the lantern takes nobody's head room (three
// clear over the floor), otherwise a light block set flush into the floor,
// which is walked on like any other and is never in the way. After each new
// light, light is spread from it before the next dark spot is looked at.

import { MATERIALS, MAT } from './materials.js';

export const TARGET = 8;          // inside buildings
export const TARGET_OUT = 1;      // outside: any block light at all stops a spawn

const EMIT = { 'minecraft:sea_lantern': 15, 'minecraft:glowstone': 15, 'minecraft:lantern': 15, 'minecraft:shroomlight': 15,
  'minecraft:campfire': 15, 'minecraft:soul_lantern': 10, 'minecraft:soul_campfire': 10, 'minecraft:torch': 14,
  'minecraft:end_rod': 14, 'minecraft:ochre_froglight': 15, 'minecraft:jack_o_lantern': 15, 'minecraft:beacon': 15 };
const SEE_THROUGH = /glass|pane|leaves|fence|door|stairs|slab|bars|carpet|lantern|campfire|bed|chest|sign|flower|torch|cake|bell|anvil|cauldron|brewing|lectern|grindstone|stonecutter|rail|ladder|button|pressure|trapdoor|wall|vine|roots|fungus|sapling|bush|grass$|short_grass|fern|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|lily|azalea|petals|crop|wheat|carrots|potatoes|beetroot|snow_layer|composter|hopper|chain|scaffolding|water|lava|kelp|seagrass|bamboo|sugar_cane|cactus|candle|flower_pot|skull|head|banner|rod|dripleaf|spore|moss_carpet|hay/;
// the surfaces a mob cannot spawn on even though they are solid
const NO_SPAWN_SURFACE = /farmland|dirt_path|grass_path|slab|stairs|glass|ice|magma|honey|soul_sand|bedrock|barrier|leaves|hay|campfire|carpet|bed|chest|cake/;

// per material id: opaque? light it gives? a surface a mob can spawn on?
let TABLE = null;
function table() {
  if (TABLE && TABLE.n === MATERIALS.defs.length) return TABLE;
  const n = MATERIALS.defs.length;
  const opaque = new Uint8Array(n), emit = new Uint8Array(n), surface = new Uint8Array(n), standIn = new Uint8Array(n);
  for (let id = 0; id < n; id++) {
    const d = MATERIALS.defs[id];
    if (!d) continue;
    const b = d.block;
    emit[id] = EMIT[b] || 0;
    opaque[id] = !d.passable && !d.transparent && !SEE_THROUGH.test(b) ? 1 : 0;
    surface[id] = opaque[id] && !NO_SPAWN_SURFACE.test(b) ? 1 : 0;
    // cells a mob can stand in: a plant (flowers, grass, roots), nothing else
    standIn[id] = d.passable && d.flowable && !/carpet|rail|snow|button|pressure|torch|ladder|water|lava|crop|wheat|carrots|potatoes|beetroot|sugar|kelp|seagrass/.test(b) ? 1 : 0;
  }
  TABLE = { n, opaque, emit, surface, standIn };
  return TABLE;
}

// the block light of every cell in the box around the world's blocks
export function lightMap(world, pad = 2) {
  const { opaque, emit } = table();
  const b = world.box;
  const x0 = b.x0 - pad, y0 = Math.max(-64, b.y0 - pad), z0 = b.z0 - pad;
  const nx = b.x1 - b.x0 + 1 + 2 * pad, ny = b.y1 - y0 + 1 + pad, nz = b.z1 - b.z0 + 1 + 2 * pad;
  const light = new Uint8Array(nx * ny * nz);
  const solid = new Uint8Array(nx * ny * nz);
  const idx = (x, y, z) => ((y - y0) * nz + (z - z0)) * nx + (x - x0);
  let q = new Int32Array(1 << 16), qn = 0;
  const push = (i) => { if (qn >= q.length) { const g = new Int32Array(q.length * 2); g.set(q); q = g; } q[qn++] = i; };
  world.forEach((x, y, z, id) => {
    if (y < y0) return;
    const i = idx(x, y, z);
    if (opaque[id]) solid[i] = 1;
    if (emit[id]) { light[i] = emit[id]; push(i); }
  });
  const map = { light, solid, x0, y0, z0, nx, ny, nz, idx, spread: null };
  // spread from everything queued, and later from any new source
  map.spread = (queue, count) => {
    const plane = nx * nz;
    let head = 0;
    while (head < count) {
      const i = queue[head++];
      const L = light[i];
      if (L <= 1) continue;
      const x = i % nx, z = Math.floor(i / nx) % nz, y = Math.floor(i / plane);
      const next = L - 1;
      const nb = [];
      if (x > 0) nb.push(i - 1); if (x < nx - 1) nb.push(i + 1);
      if (z > 0) nb.push(i - nx); if (z < nz - 1) nb.push(i + nx);
      if (y > 0) nb.push(i - plane); if (y < ny - 1) nb.push(i + plane);
      for (const j of nb) {
        if (solid[j] || light[j] >= next) continue;
        light[j] = next;
        if (count >= queue.length) { const g = new Int32Array(queue.length * 2); g.set(queue); queue = g; }
        queue[count++] = j;
      }
    }
  };
  map.spread(q, qn);
  return map;
}

// every spot a hostile mob could spawn on (the cell it would stand in), within
// `inside(x, z)`, with its block light
export function spawnSpots(world, map, inside) {
  const { surface, standIn } = table();
  const b = world.box, out = [];
  const clear = (x, y, z) => { const id = world.get(x, y, z); return id === -1 || standIn[id]; };
  for (let z = b.z0; z <= b.z1; z++)
    for (let x = b.x0; x <= b.x1; x++) {
      if (!inside(x, z)) continue;
      for (let y = b.y0; y <= b.y1; y++) {
        const id = world.get(x, y, z);
        if (id === -1 || !surface[id]) continue;
        if (!clear(x, y + 1, z) || !clear(x, y + 2, z)) continue;
        out.push([x, y + 1, z, map.light[map.idx(x, y + 1, z)]]);
      }
    }
  return out;
}

// light every dark spot; returns what it added
export function lightUp(world, inside, opts = {}) {
  const floorLight = opts.floorLight !== undefined ? opts.floorLight : MAT.LANTERN;
  // (a city of several styles sets the light by where it goes: shroomlight in a Nether quarter)
  const lightFor = (x, z) => (typeof floorLight === 'function' ? floorLight(x, z) : floorLight);
  const hang = opts.hang !== undefined ? opts.hang : MAT.LAMP_HANG;
  const target = opts.target || (() => TARGET);          // the light a spot needs
  const keep = opts.keep || (() => true);                // (a dome: only spots inside it)
  const { opaque, emit } = table();
  const map = lightMap(world);
  const wanting = () => spawnSpots(world, map, inside).filter((s) => keep(s[0], s[1], s[2]) && s[3] < target(s[0], s[1], s[2]));
  const dark = wanting();
  const added = { hung: 0, flush: 0, standing: 0, before: dark.length, after: 0 };
  const lightAt = (x, y, z) => map.light[map.idx(x, y, z)];
  const changes = [];
  const addSource = (x, y, z, id) => {
    changes.push([x, y, z, world.get(x, y, z), id]);
    world.set(x, y, z, id);
    const i = map.idx(x, y, z);
    if (opaque[id]) map.solid[i] = 1;
    map.light[i] = Math.max(map.light[i], emit[id]);
    const q = new Int32Array(4096); q[0] = i;
    // (a solid source spreads from itself: its own cell is not walked through)
    const was = map.solid[i]; map.solid[i] = 0; map.spread(q, 1); map.solid[i] = was;
  };
  // A flush light takes the place of a floor block, never of anything else: a
  // block in a floor plane (at least three of its four neighbours at its own
  // height solid) that is not furniture, a workstation, a light, gold, a door, a
  // stair or a slab. A post, a lintel, a merlon, a finial or a counter top stands
  // proud of what is round it, and keeps its block.
  // (and what makes a mark or a display: a light set in its place left a hole in
  // a helipad's H, and would in a red cross, a fire engine, a skeleton, a case)
  const KEEP = /barrel|crafting|furnace|smoker|chest|bookshelf|loom|table|anvil|lectern|stand|cauldron|composter|jukebox|gold_block|lantern|glowstone|shroomlight|bed|hay|beehive|pumpkin|melon|bell|door|stairs|slab|campfire|grindstone|stonecutter|smithing|planter|quartz_pillar|chiseled|gilded|crying|yellow_concrete|red_concrete|coal_block|bone_block|_ore$|ancient_debris|raw_|amethyst_block|diamond_block|emerald_block|netherite_block|lever|redstone|pressure_plate|iron_door|hopper|rail|frame|piston|button|noteblock|daylight/;
  const floorBlock = (x, y, z) => {
    const id = world.get(x, y, z);
    if (id === -1 || !opaque[id] || KEEP.test(MATERIALS.def(id).block)) return false;
    // a fungus canopy takes its light as the Nether's fungi do: a shroomlight among the wart
    if (/wart_block/.test(MATERIALS.def(id).block)) return true;
    // never the soil under a plant: the flower would lose its footing
    const above = world.get(x, y + 1, z);
    if (above !== -1 && table().standIn[above]) return false;
    // anything at street level is floor (a street, a pavement, a walkway, a
    // square), and so is anything at a building's floor or roof level, whatever
    // is beside it: a lantern standing there would be in someone's way
    if (opts.groundAt && y === opts.groundAt(x, z)) return true;
    if (opts.floorLevel && opts.floorLevel(x, y, z)) return true;
    let solidAround = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = world.get(x + dx, y, z + dz); if (n !== -1 && opaque[n]) solidAround++; }
    return solidAround >= 3;
  };
  // lanterns keep clear of the stairs (a core and the cells round it)
  const noHang = opts.noHang || (() => false);
  const hangAt = (x, y, z) => {
    // (null: no ceiling within reach; NaN: one that will not hold a lantern. These
    // were -1 and -2, which a spot deep underground, a crypt's floor, can be under)
    let ceil = null;
    for (let h = 1; h <= 6; h++) { const id = world.get(x, y + h, z); if (id !== -1) { ceil = opaque[id] ? y + h : NaN; break; } }
    if (ceil === null || Number.isNaN(ceil) || ceil < y + 4 || world.has(x, ceil - 1, z) || noHang(x, z)) return false;
    addSource(x, ceil - 1, z, hang);
    added.hung++;
    return true;
  };
  // floor cells that could take a light, by column, for lighting a spot from beside it
  const floors = dark.filter(([x, y, z]) => floorBlock(x, y - 1, z));
  added.fromBeside = 0; added.unlit = 0; added.standing = 0;
  const stand = opts.stand !== undefined ? opts.stand : MAT.LAMP;
  // darkest first, so each new light does the most good
  dark.sort((p, q) => p[3] - q[3]);
  for (const [x, y, z] of dark) {
    const want = target(x, y, z);
    if (lightAt(x, y, z) >= want) continue;                 // lit by an earlier new light
    if (hangAt(x, y, z)) continue;                          // a lantern from the ceiling
    if (floorBlock(x, y - 1, z)) { addSource(x, y - 1, z, lightFor(x, z)); added.flush++; continue; }
    // The spot's own block must stay. Outside, light it from the nearest floor
    // that reaches it; failing that (or indoors, on furniture), stand a small
    // lantern on the spot itself: the block under it keeps its place, the cell
    // a mob would need is taken, and the lantern lights what is round it.
    let done = false;
    if (want <= 1) {
      const near = floors.filter(([fx, fy, fz]) => Math.abs(fx - x) + Math.abs(fy - y) + Math.abs(fz - z) <= 12 && floorBlock(fx, fy - 1, fz))
        .sort((p, q) => (Math.abs(p[0] - x) + Math.abs(p[1] - y) + Math.abs(p[2] - z)) - (Math.abs(q[0] - x) + Math.abs(q[1] - y) + Math.abs(q[2] - z)));
      for (const [fx, fy, fz] of near.slice(0, 2)) {
        addSource(fx, fy - 1, fz, lightFor(fx, fz)); added.flush++;
        if (lightAt(x, y, z) >= want) { done = true; added.fromBeside++; break; }
      }
    }
    // (a flower or a tuft of grass in the spot gives way to the lantern)
    const inCell = world.get(x, y, z);
    if (!done && (inCell === -1 || table().standIn[inCell])) { addSource(x, y, z, stand); added.standing++; done = true; }
    if (!done) added.unlit++;
  }
  // The safety net: a building that no longer walks through gets back what it
  // had, every light placed in it taken out again (its dark spots are counted).
  if (opts.check) {
    const undone = opts.check(changes);
    if (undone && undone.length) {
      const drop = new Set(undone);
      for (let i = changes.length - 1; i >= 0; i--) {
        if (!drop.has(i)) continue;
        const [x, y, z, old] = changes[i];
        if (old === -1) world.clear(x, y, z); else world.set(x, y, z, old);
      }
      added.undone = undone.length;
      // the light has changed: work it out again
      const fresh = lightMap(world);
      map.light = fresh.light; map.solid = fresh.solid;
    }
  }
  added.after = wanting().length;
  added.changes = changes;
  added.map = map;
  return added;
}
