// tools/checks/2zzj-mall.js — the shopping mall (mall.js).
//
// Built into the world and looked at there, at every size it comes in (twenty-five
// and twenty-one by twenty-six, twenty-one and seventeen by twenty; on a hilly lot
// raised with it, on a lot it is turned on): every shopkeeper a villager of its
// shop's trade, standing behind its counter, the counter its trade's own
// workstation; the shopkeeper unable to leave (walked as a villager walks: a step
// or a jump of one, two clear over its head); reached over its counter by a player
// walking in from the street door, the upper floor's by the stairs; no workstation
// in the mall but the counters (none for a city villager to take a shopkeeper's
// job from); every shop lit. The shopkeepers in the pack: in the mall's own
// structures, each saved as a villager of its trade at the top level (the four
// trades made from the fletcher's with their own group, look and trade table, no
// offers), and a mall function to bring them in again. Off by default; asked for
// on a city with no lot that takes it, the summary says so. Every block one of
// Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzj';
export const label = '2zzj. the shopping mall';

// the workstation each trade claims (the game's own pairs)
const JOB = { librarian: 'lectern', armorer: 'blast_furnace', tool_smith: 'smithing_table', weaponsmith: 'grindstone', cleric: 'brewing_stand',
  farmer: 'composter', butcher: 'smoker', fisherman: 'barrel', cartographer: 'cartography_table', fletcher: 'fletching_table',
  leather_worker: 'cauldron', shepherd: 'loom', stone_mason: 'stonecutter_block' };
// the component group and trade table each is saved with
const GROUP = { librarian: 'librarian', armorer: 'armorer', tool_smith: 'toolsmith', weaponsmith: 'weaponsmith', cleric: 'cleric', farmer: 'farmer',
  butcher: 'butcher', fisherman: 'fisherman', cartographer: 'cartographer', fletcher: 'fletcher', leather_worker: 'leatherworker', shepherd: 'shepherd', stone_mason: 'mason' };
const TABLE = { librarian: 'librarian', armorer: 'armorer', tool_smith: 'tool_smith', weaponsmith: 'weapon_smith', cleric: 'cleric', farmer: 'farmer',
  butcher: 'butcher', fisherman: 'fisherman', cartographer: 'cartographer', fletcher: 'fletcher', leather_worker: 'leather_worker', shepherd: 'shepherd', stone_mason: 'stone_mason' };
const VARIANT = { farmer: 1, fisherman: 2, shepherd: 3, fletcher: 4, librarian: 5, cartographer: 6, cleric: 7, armorer: 8, weaponsmith: 9, tool_smith: 10, butcher: 11, leather_worker: 12, stone_mason: 13 };

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { buildStructures, buildMobStructures, functionFiles, tileList } = await import('../../engine/export.js');
  const { makeEntity } = await import('../../engine/entities.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { makeRng } = await import('../../engine/rng.js');
  const L = { furnish: false, villagers: 0, fish: false, mall: true };
  const cities = [
    ['the largest (512)', generateCity({ ...DEFAULTS, ...L, size: 512, seed: 5 })],
    ['twenty-one by twenty-six', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 6 })],
    ['twenty-one by twenty', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99 })],
    ['seventeen by twenty', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 8 })],
    ['on a hill, turned', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
  ];
  check('defaults: no mall unless asked', DEFAULTS.mall === false);

  const inspect = (r) => {
    const M = r.landmarks.find((Lm) => Lm.kind === 'mall');
    if (!M) return { built: false };
    const w = r.world, F = M.frame;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    // the lift: the keepers ride up with the lot (city.js), the records of blocks do not
    const lift = M.keepers.length ? M.keepers[0].y - M.shops.find((s) => s.pro).booth[1] : 0;
    const Lf = ([x, y, z]) => [x, y + lift, z];
    const out = { built: true, wide: F.W, deep: F.D, sideways: M.sideways, shops: M.shops.length, keepers: M.keepers.length, lift };
    const bad = [];
    // every shopkeeper: its shop's trade, behind a counter of its trade's workstation
    for (const s of M.shops.filter((q) => q.pro)) {
      const k = M.keepers.find((q) => q.x === s.booth[0] && q.z === s.booth[2] && q.y === s.booth[1] + lift);
      if (!k) { bad.push(`${s.name}: no keeper in the booth`); continue; }
      if (k.profession !== s.pro) bad.push(`${s.name}: a ${k.profession}`);
      const [cx, cy, cz] = Lf(s.counter);
      if (blk(cx, cy, cz) !== JOB[s.pro]) bad.push(`${s.name}: its counter ${blk(cx, cy, cz)}, not a ${JOB[s.pro]}`);
      if (Math.abs(cx - k.x) + Math.abs(cz - k.z) !== 1 || cy !== k.y) bad.push(`${s.name}: its counter not before its keeper`);
      if (blk(k.x, k.y, k.z) !== 'air' || blk(k.x, k.y + 1, k.z) !== 'air' || blk(k.x, k.y - 1, k.z) === 'air') bad.push(`${s.name}: its keeper's cell not two clear on a floor`);
    }
    out.trades = bad;
    // the keeper cannot leave: walked as a villager walks (onto the next cell if it is
    // clear for two, or up a block onto one if three are clear over it and two over
    // the keeper's head); from its booth it reaches nothing but the booth
    const vClear = (b) => b === 'air' || /sign|lantern/.test(b);
    const escapes = [];
    for (const k of M.keepers) {
      const key = (p) => p.join(','), seen = new Set([key([k.x, k.y, k.z])]), q = [[k.x, k.y, k.z]];
      while (q.length && seen.size < 50) {
        const [x, y, z] = q.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          let n = null;
          if (vClear(blk(nx, y, nz)) && vClear(blk(nx, y + 1, nz)) && !vClear(blk(nx, y - 1, nz))) n = [nx, y, nz];                // a step
          else if (!vClear(blk(nx, y, nz)) && vClear(blk(nx, y + 1, nz)) && vClear(blk(nx, y + 2, nz)) && vClear(blk(x, y + 2, z))) n = [nx, y + 1, nz];  // a jump
          else if (vClear(blk(nx, y, nz)) && vClear(blk(nx, y + 1, nz)) && vClear(blk(nx, y - 1, nz))) n = [nx, y - 1, nz];   // down
          if (n && !seen.has(key(n))) { seen.add(key(n)); q.push(n); }
        }
      }
      if (seen.size > 1) escapes.push(`${k.profession} at ${k.x},${k.y},${k.z} (${seen.size} cells)`);
    }
    out.escapes = escapes;
    // a player from the street door: every shop walked into, every keeper reached over
    // its counter (a standing cell two or less from the keeper, its head over the counter)
    const pClear = (b) => b === 'air' || /sign|lantern|flower|poppy|dandelion|orchid|allium|bluet|tulip|daisy|cornflower|lily/.test(b);
    const pFloor = (b) => b !== 'air' && !pClear(b) && !/bars|fence|wall$/.test(b);
    const stand = (x, y, z) => pClear(blk(x, y, z)) && pClear(blk(x, y + 1, z)) && pFloor(blk(x, y - 1, z));
    const [dx, dy, dz] = Lf(M.door);
    const key = (p) => p.join(','), walk = new Set(), q = [];
    // (from just outside the doorway)
    for (let y = dy - 2; y <= dy + 2; y++) if (stand(dx, y, dz)) { walk.add(key([dx, y, dz])); q.push([dx, y, dz]); break; }
    const box = M.lot;
    const inBox = (x, z) => x >= box.x0 - 2 && x <= box.x1 + 2 && z >= box.z0 - 2 && z <= box.z1 + 2;
    while (q.length && walk.size < 30000) {
      const [a, b, c] = q.pop();
      for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const ey of [0, 1, -1]) {
        const n = [a + ex, b + ey, c + ez];
        if (walk.has(key(n)) || !inBox(n[0], n[2]) || !stand(...n)) continue;
        if (ey === 1 && !pClear(blk(a, b + 2, c))) continue;          // (room to step up)
        walk.add(key(n)); q.push(n);
      }
    }
    out.walked = walk.size;
    out.shopsIn = M.shops.filter((s) => walk.has(key(Lf(s.inside)))).length;
    out.reached = M.keepers.filter((k) => [...walk].some((p) => { const [x, y, z] = p.split(',').map(Number); return y === k.y && Math.abs(x - k.x) + Math.abs(z - k.z) === 2 && (x === k.x || z === k.z); })).length;
    out.upstairs = M.shops.filter((s) => s.floor === 1 && walk.has(key(Lf(s.inside)))).length;
    // no workstation in the mall but the counters
    const JOBS = new Set(Object.values(JOB));
    let stations = 0;
    for (let x = M.lot.x0; x <= M.lot.x1; x++) for (let z = M.lot.z0; z <= M.lot.z1; z++) for (let y = F.UP - 6 + lift; y <= F.ROOF + lift; y++) if (JOBS.has(blk(x, y, z))) stations++;
    out.stations = stations;
    // every shop lit: a lantern hung in it
    out.lit = M.shops.every((s) => { const [x, y, z] = Lf(s.inside); return M.lanterns.some((l) => { const [a, b, c] = Lf(l); return Math.abs(a - x) + Math.abs(c - z) <= 6 && b > y && b - y <= 4 && blk(a, b, c) === 'lantern'; }); });
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  const sizes = new Set(ts.filter(([, , t]) => t.built).map(([, , t]) => `${t.wide}x${t.deep}`));
  check('mall: built when asked, at every size (25x26, 21x26, 21x20, 17x20), on a hill and turned', ts.every(([, , t]) => t.built) && sizes.size === 4 && ts.some(([, , t]) => t.lift > 0) && ts.some(([, , t]) => t.sideways),
    ts.map(([n, , t]) => `${n}: ${t.built ? `${t.wide}x${t.deep}${t.lift ? ' +' + t.lift : ''}${t.sideways ? ' turned' : ''}` : 'none'}`).join(', '));
  check('mall: sixteen shops (thirteen with a keeper) on the larger, twelve on the smaller', all((t) => (t.deep === 26 ? t.shops === 16 && t.keepers === 13 : t.shops === 12 && t.keepers === 12)));
  check('mall: every shopkeeper a villager of its shop\'s trade, behind a counter of that trade\'s workstation', all((t) => t.trades.length === 0), ts.map(([n, , t]) => t.trades ? t.trades.slice(0, 2).join('; ') : '').filter(Boolean).join(' | '));
  check('mall: no shopkeeper can leave its booth (a villager\'s step and jump)', all((t) => t.escapes.length === 0), ts.map(([n, , t]) => t.escapes ? t.escapes.slice(0, 2).join('; ') : '').filter(Boolean).join(' | '));
  check('mall: from the street door every shop walked into, upstairs by the stairs, every shopkeeper reached over its counter', all((t) => t.shopsIn === t.shops && t.upstairs === t.shops / 2 && t.reached === t.keepers),
    ts.map(([n, , t]) => `${n}: ${t.shopsIn}/${t.shops} shops, ${t.reached}/${t.keepers} keepers`).join(', '));
  check('mall: no workstation but the counters (none for a city villager to take)', all((t) => t.stations === t.keepers), ts.map(([n, , t]) => `${n}: ${t.stations}`).join(', '));
  check('mall: every shop lit by its own lantern', all((t) => t.lit));
  // the shopkeepers as the pack saves them
  {
    const r = cities[0][1], bad = [];
    const rng = makeRng(1);
    for (const k of r.spawns.filter((p) => p.group === 'mall')) {
      const e = makeEntity('villager', k.x, k.y, k.z, rng, { profession: k.profession, tier: k.tier }).v;
      const defs = e.definitions.v.map((d) => d.v);
      if (!defs.includes('+' + GROUP[k.profession])) bad.push(`${k.profession}: no +${GROUP[k.profession]}`);
      if (Object.values(GROUP).some((g) => g !== GROUP[k.profession] && defs.includes('+' + g))) bad.push(`${k.profession}: another trade's group`);
      if (e.Variant.v !== VARIANT[k.profession]) bad.push(`${k.profession}: Variant ${e.Variant.v}`);
      if (e.TradeTablePath.v !== `trading/economy_trades/${TABLE[k.profession]}_trades.json`) bad.push(`${k.profession}: ${e.TradeTablePath.v}`);
      if (e.TradeTier.v !== 4) bad.push(`${k.profession}: tier ${e.TradeTier.v}`);
      if (e.Persistent && e.Persistent.v !== 1) bad.push(`${k.profession}: not persistent`);
    }
    const mobs = buildMobStructures(r.spawns, {});
    const mallTiles = mobs.filter((t) => t.group === 'mall');
    const inTiles = mallTiles.reduce((a, t) => a + t.villagers, 0);
    const opts = { namespace: 'chk', spawns: r.spawns, centre: r.world.centre, places: r.places };
    const fns = functionFiles(tileList(r.world, opts), r.world, { ...opts, mobTiles: mobs });
    const fn = fns.find((f) => f.fn === 'chk/mall_centered');
    check('mall: every shopkeeper saved as a villager of its trade at the top level (its group, look and trade table)', bad.length === 0 && r.spawns.filter((p) => p.group === 'mall').length === 13, bad.slice(0, 4).join('; '));
    check('mall: the shopkeepers in structures of their own, and a mall function to bring them in again', inTiles === 13 && !!fn && mallTiles.every((t) => fn.text.includes(`${t.name} `)), `${inTiles} in ${mallTiles.length} tiles`);
  }
  {
    const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
    const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
    const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
    const r = generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } });
    const has = r.landmarks.some((Lm) => Lm.kind === 'mall');
    check('mall: asked for with no lot that takes it, the summary says so', has || /17 by 20/.test(r.stats.mallMissing || ''), r.stats.mallMissing || 'built');
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('mall: every block one of Bedrock\'s own states (every workstation)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  note(`mall: ${ts.map(([n, , t]) => t.built ? `${n} ${t.shops} shops, ${t.keepers} keepers` : `${n} none`).join('; ')}`);
}
