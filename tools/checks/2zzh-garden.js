// tools/checks/2zzh-garden.js — the botanical garden (garden.js).
//
// Built into the world and looked at there, by the game's own rules for what a
// plant needs or it breaks: every plant there, whole, on a soil it may stand on
// (garden.js: PLANT_SOIL, a plant of a stack on the one below); every cactus with
// air on its four sides; every sugar cane's foot beside water; every lily pad on
// water; every kelp, seagrass and sea pickle in water, its cell marked to be
// written with water in its second layer, and in the pack's structure it is. The
// water held in (water, a waterlogged plant or a solid block on its four sides and
// under it). The city's lighting kept out (no light but the garden's own in its
// lot), and the garden lit by them (every bed within fourteen of a lantern). Every
// bed reached on foot from the door. On flat, fitted and small-block cities, at
// both sizes. Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzh';
export const label = '2zzh. the botanical garden';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { PLANT_SOIL, BIOMES } = await import('../../engine/garden.js');
  const L = { furnish: false, villagers: 0, fish: false, garden: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345 })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } })],
    ['small blocks', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10 })],
  ];
  check('defaults: no botanical garden unless asked', DEFAULTS.garden === false);

  const inspect = (r) => {
    const Gd = r.landmarks.find((Lm) => Lm.kind === 'garden');
    if (!Gd) return { built: false };
    const w = r.world;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    // the garden's lift: its first plant found in its column
    let lift = 0; { const p = Gd.plants[0]; for (let d = -3; d <= 10; d++) if (blk(p.at[0], p.at[1] + d, p.at[2]) === p.name) { lift = d; break; } }
    const Lf = ([x, y, z]) => [x, y + lift, z];
    const WETB = (b) => b === 'water' || b === 'flowing_water' || /kelp|seagrass|sea_pickle/.test(b);
    // (a sea lantern is solid; a hanging lantern, a sign or a plant is not)
    const SOLID = (b) => b === 'sea_lantern' || (b !== 'air' && !WETB(b) && !/lantern|sign|_sapling|bush|fern|roots|fungus|mushroom|wart|flower|poppy|dandelion|orchid|allium|bluet|daisy|lily|petals|reeds|cactus|bamboo|azalea|carpet|chorus|waterlily/.test(b));
    const out = { built: true, lift, wide: Gd.wide, beds: Gd.beds.length, biomes: Gd.beds.map((b) => b.biome) };
    const bad = [];
    for (const p of Gd.plants) {
      const [x, y, z] = Lf(p.at), here = blk(x, y, z), below = blk(x, y - 1, z);
      if (here !== p.name) { bad.push(`${p.name} gone (${here})`); continue; }
      const ok = PLANT_SOIL[p.name];
      if (ok && !ok.includes(below) && !(below === 'water' && ok.includes('water'))) bad.push(`${p.name} on ${below}`);
      if (p.name === 'cactus') for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = blk(x + a, y, z + c); if (n !== 'air') bad.push(`cactus beside ${n}`); }
      if (p.name === 'reeds' && below !== 'reeds' && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => blk(x + a, y - 1, z + c) === 'water')) bad.push('sugar cane with no water at its foot');
      if (p.wet) {
        if (!r.world.wet || !r.world.wet.has(VoxelWorld.key(x, y, z))) bad.push(`${p.name} not marked wet`);
        const up = blk(x, y + 1, z); if (!WETB(up) && up !== 'air') bad.push(`${p.name} under ${up}`);
      }
    }
    out.bad = bad;
    // water held in
    let leaks = 0; const eg = [];
    for (let x = Gd.lot.x0 - 1; x <= Gd.lot.x1 + 1; x++) for (let z = Gd.lot.z0 - 1; z <= Gd.lot.z1 + 1; z++) for (let y = Gd.frame.ROOF - 12 + lift; y <= Gd.frame.ROOF + lift; y++) {
      if (!WETB(blk(x, y, z))) continue;
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) { const n = blk(x + a, y + b, z + c); if (!WETB(n) && !SOLID(n)) { leaks++; if (eg.length < 3) eg.push(`${x},${y},${z}->${n}`); } }
    }
    out.leaks = leaks; out.leakEg = eg.join(' ');
    // the city's lighting kept out: no light in the lot but the garden's own lanterns
    const own = new Set(Gd.lanterns.map((p) => Lf(p).join(',')));
    let stray = 0;
    for (let x = Gd.lot.x0; x <= Gd.lot.x1; x++) for (let z = Gd.lot.z0; z <= Gd.lot.z1; z++) for (let y = Gd.frame.ROOF - 10 + lift; y <= Gd.frame.ROOF + lift; y++) {
      const b = blk(x, y, z);
      if (/lantern|glowstone|shroomlight|froglight|light_block/.test(b) && b !== 'sea_lantern' && !own.has([x, y, z].join(','))) stray++;
    }
    out.stray = stray;
    out.lit = Gd.beds.every((b) => b.cells.every((c) => { const [x, y, z] = Lf(c); return Gd.lanterns.some((l) => { const [a, bb, cc] = Lf(l); return Math.abs(a - x) + Math.abs(bb - y - 1) + Math.abs(cc - z) <= 14; }); }));
    // on foot from the door to the path end of every bed
    const key = (p) => p.join(',');
    const pass = (b) => b === 'air' || /sign|lantern/.test(b);
    const inLot = (x, z) => x >= Gd.lot.x0 - 1 && x <= Gd.lot.x1 + 1 && z >= Gd.lot.z0 - 1 && z <= Gd.lot.z1 + 1;
    const stand = (x, y, z) => inLot(x, z) && pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && blk(x, y - 1, z) !== 'air' && !WETB(blk(x, y - 1, z));
    const s0 = [Gd.door[0], Gd.door[1] + lift, Gd.door[2]], walk = new Set([key(s0)]), q = [s0];
    while (q.length && walk.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
    out.reach = Gd.beds.every((b) => b.cells.some((c) => { const [x, y, z] = Lf(c); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, cc]) => walk.has(key([x + a, y + 1, z + cc]))); }));
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('garden: built when asked, at both sizes (flat, fitted, small blocks)', ts.every(([, , t]) => t.built) && new Set(ts.map(([, , t]) => t.wide)).size === 2, ts.map(([n, , t]) => `${n}: ${t.wide}`).join(', '));
  check('garden: a bed for every biome the size holds (ten on the larger, eight on the smaller), none twice', all((t) => t.beds === (t.wide === 19 ? 10 : 8) && new Set(t.biomes).size === t.beds && t.biomes.every((b) => BIOMES.includes(b))));
  check('garden: every plant there and whole, on a soil it may stand on; every cactus with air all round; every sugar cane with water at its foot', all((t) => t.bad.filter((b) => !/wet|under/.test(b)).length === 0), ts.map(([n, , t]) => `${n}: ${t.bad.slice(0, 3).join('; ')}`).join(' | '));
  check('garden: every kelp, seagrass and sea pickle in water, its cell marked to be written as waterlogged', all((t) => t.bad.filter((b) => /wet|under/.test(b)).length === 0));
  check('garden: its water held in (water, a waterlogged plant or solid on four sides and under)', all((t) => t.leaks === 0), ts.map(([n, , t]) => `${n}: ${t.leakEg}`).join(' | '));
  check('garden: the city\'s lighting kept out (no light in its lot but its own), every bed within reach of one of its lanterns', all((t) => t.stray === 0 && t.lit), ts.map(([n, , t]) => `${n}: ${t.stray} stray`).join(', '));
  check('garden: every bed reached on foot from the door', all((t) => t.reach));
  // the pack: every waterlogged cell written with water in its structure's second layer
  {
    const r = cities[1][1];
    const structs = buildStructures(r.world, {});
    let marked = 0, written = 0;
    for (const st of structs) {
      const root = decodeNbt(st.data).root, [sx, sy, sz] = root.size, layers = root.structure.block_indices;
      const pal = root.structure.palette.default.block_palette;
      const [ox, oy, oz] = [st.box.x0, st.box.y0, st.box.z0];
      for (const k of r.world.wet) {
        const [x, y, z] = VoxelWorld.unkey(k);
        if (x < st.box.x0 || x > st.box.x1 || y < st.box.y0 || y > st.box.y1 || z < st.box.z0 || z > st.box.z1) continue;
        marked++;
        const i = ((x - ox) * sy + (y - oy)) * sz + (z - oz);
        if (layers[1][i] >= 0 && pal[layers[1][i]].name === 'minecraft:water' && /kelp|seagrass|sea_pickle/.test(pal[layers[0][i]].name)) written++;
      }
    }
    check('garden: in the pack, every waterlogged plant\'s second layer is water', marked > 0 && written === marked, `${written} of ${marked}`);
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of structs) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('garden: every block one of Bedrock\'s own states (every plant and soil)', bad.size === 0, [...bad].slice(0, 4).join(', '));
    note(`garden: ${ts.map(([n, , t]) => `${n} ${t.wide} wide, ${t.beds} beds`).join('; ')}`);
  }
}
