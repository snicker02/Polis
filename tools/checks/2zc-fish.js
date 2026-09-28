// tools/checks/2zc-fish.js — fish in the ponds, the canal and the harbour.
//
// Where fish go (real pools only: not irrigation channels, not fountain
// bowls), how many, how deep, which kinds, that turning them on changes
// nothing else about a city, and that both editions write them so they are
// kept: named summons on Bedrock, PersistenceRequired on Java.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zc';
export const label = '2zc. fish';

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { fishSpawns, waterBodies, FISH_NAMES } = await import('../../engine/fish.js');
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { MAT } = await import('../../engine/materials.js');
  const { makeRng } = await import('../../engine/rng.js');
  const { exportPack, cityId } = await import('../../engine/export.js');
  const { javaEntity } = await import('../../engine/java-entities.js');
  const { J } = await import('../../engine/export-java.js');
  const FISH = new Set(['cod', 'salmon', 'tropicalfish']);
  const isFish = (p) => FISH.has(p.type);

  // ---- a made-up world with one of each kind of water --------------------
  const w = new VoxelWorld({ budget: 100000 });
  const W = MAT.WATER, G = 10;
  for (let x = 0; x < 20; x++) w.set(x, G, 0, W);                                  // irrigation channel, 1 wide
  for (let x = 30; x < 32; x++) for (let z = 0; z < 2; z++) w.set(x, G, z, W);     // fountain bowl, 4 cells
  for (let x = 40; x < 44; x++) for (let z = 0; z < 4; z++) w.set(x, G, z, W);     // pond 4x4, 1 deep: a puddle to a fish
  for (let x = 70; x < 76; x++) for (let z = 0; z < 6; z++) w.set(x, G, z, W);     // pond 6x6 ...
  for (let x = 71; x < 75; x++) for (let z = 1; z < 5; z++) w.set(x, G - 1, z, W); // ... with a 2-deep 4x4 middle
  for (let x = 0; x < 60; x++) for (let z = 20; z < 25; z++) for (let y = G - 2; y <= G; y++) w.set(x, y, z, W);   // canal, 3 deep, 300 cells
  const bodies = waterBodies(w);
  check('water bodies: the channel and the fountain are not pools', bodies.length === 3, bodies.map((b) => b.kind + b.cells.length).join(' '));
  check('water bodies: the 4x4 pond is a pond, the 60x5 canal is a river',
    bodies.some((b) => b.kind === 'pond' && b.cells.length === 16) && bodies.some((b) => b.kind === 'river' && b.cells.length === 300));
  const f = fishSpawns(w, makeRng(1));
  const inPuddle = f.filter((p) => p.x >= 40 && p.x < 44), inPond = f.filter((p) => p.x >= 70 && p.x < 76 && p.z < 6), inCanal = f.filter((p) => p.z >= 20);
  check('fish: none in the channel or the fountain', f.every((p) => (p.x >= 70 && p.x < 76 && p.z < 6) || p.z >= 20 || (p.x >= 40 && p.x < 44)), JSON.stringify(f.filter((p) => p.z < 20 && !(p.x >= 70 && p.x < 76))));
  check('fish: none in a one-deep pond (they would leap out onto the bank)', inPuddle.length === 0, String(inPuddle.length));
  check('fish: a pond with a deep middle gets them there, spaced 2 apart (4x4 deep -> 4)', inPond.length === 4 && inPond.every((p) => p.x >= 71 && p.x < 75 && p.z >= 1 && p.z < 5), JSON.stringify(inPond.map((p) => [p.x, p.z])));
  check('fish: canal gets one per 30 cells (300 cells -> 10)', inCanal.length === 10, String(inCanal.length));
  check('fish: in deep water they swim a block under the surface', inCanal.every((p) => p.y === G - 1));
  check('fish: in a pond they swim in the bottom layer, under water', inPond.every((p) => p.y === G - 1 && w.get(p.x, G, p.z) === W));
  const spaced = (list) => list.every((a, i) => list.every((b, j) => i === j || Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)) >= 2));
  check('fish: never closer than 2 blocks to each other', spaced(f));
  check('fish: ponds hold tropical fish or cod; the canal cod or salmon',
    inPond.every((p) => p.type === 'tropicalfish' || p.type === 'cod') && inCanal.every((p) => p.type === 'cod' || p.type === 'salmon'));
  check('fish: every one carries its name', f.every((p) => p.name === FISH_NAMES[p.type]));
  const huge = new VoxelWorld({ budget: 800000 });
  for (let x = 0; x < 200; x++) for (let z = 0; z < 60; z++) { huge.set(x, G, z, W); huge.set(x, G - 1, z, W); }   // two deep
  const capped = fishSpawns(huge, makeRng(2));
  check('fish: a very big body stops at its cap (48)', capped.length === 48, String(capped.length));
  check('fish: same seed, same fish', JSON.stringify(fishSpawns(w, makeRng(9))) === JSON.stringify(fishSpawns(w, makeRng(9))));

  // ---- real cities --------------------------------------------------------
  const blocksOf = (r) => { const out = []; r.world.forEach((x, y, z, id) => out.push(x, y, z, id)); return out.join(','); };
  let total = 0, pondFish = 0, riverFish = 0, bad = 0;
  for (const c of [{ seed: 12345 }, { seed: 99 }, { seed: 31, parkChance: 0.45, pondChance: 1 }, { seed: 8, cityStyle: 'medieval', farmChance: 0.5 }]) {
    const r = generateCity({ ...DEFAULTS, size: 128, ...c });
    const fish = r.spawns.filter(isFish);
    total += fish.length;
    pondFish += fish.filter((p) => p.water === 'pond').length;
    riverFish += fish.filter((p) => p.water === 'river').length;
    for (const p of fish) {
      const isW = (x, y, z) => r.world.get(x, y, z) === MAT.WATER;
      if (!isW(p.x, p.y, p.z) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => isW(p.x + a, p.y, p.z + b))) bad++;
      if (r.buildings.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1)) bad++;
    }
    check(`city ${c.seed}: stats count the fish`, r.stats.fish === fish.length, `${r.stats.fish} vs ${fish.length}`);
    if (c.seed === 12345) {
      const off = generateCity({ ...DEFAULTS, size: 128, ...c, fish: false });
      check('city: fish off -> none', off.spawns.filter(isFish).length === 0);
      check('city: turning fish on changes no block', blocksOf(off) === blocksOf(r));
      check('city: turning fish on changes no other spawn',
        JSON.stringify(off.spawns) === JSON.stringify(r.spawns.filter((p) => !isFish(p))));
      // Bedrock: named summons in populate, and a fallback function
      const out = await exportPack(r.world, { namespace: cityId(r.world, 12345), spawns: r.spawns, deflateRaw });
      const fn = (n) => out.functions.find((x) => x.name.endsWith('/' + n + '.mcfunction'));
      const pop = fn('populate'), fb = fn('fish'), fbc = fn('fish_centered');
      const lines = (t) => t.text.split('\n').filter((l) => /^summon minecraft:(cod|salmon|tropicalfish) /.test(l));
      check('bedrock: populate summons every fish', pop && lines(pop).length === fish.length, `${pop && lines(pop).length} of ${fish.length}`);
      check('bedrock: every fish summon uses the named form (named mobs are kept)',
        lines(pop).every((l) => /^summon minecraft:(cod|salmon|tropicalfish) (Cod|Salmon|Koi) ~-?\d* ~-?\d* ~-?\d*$/.test(l)));
      check('bedrock: fish and fish_centered fallbacks exist and summon them all',
        fb && fbc && lines(fb).length === fish.length && lines(fbc).length === fish.length);
      check('bedrock: populate says how to bring back missing fish', /function [^ ]+\/fish from beside the water/.test(pop.text));
    }
  }
  // park ponds: a deep middle under water, clay under that, a one-deep rim
  {
    let ponds = 0, deepOk = 0, rimOk = 0, fishedDeep = 0;
    for (const st of ['modern', 'medieval', 'desert']) for (const seed of [3, 31, 99]) {
      const r = generateCity({ ...DEFAULTS, size: 128, seed, cityStyle: st, parkChance: 0.35, pondChance: 1 });
      const fishes = r.spawns.filter(isFish);
      for (const pd of r.ponds) {
        if (pd.cells < 6) continue;                               // a 2x2 puddle has no middle
        ponds++;
        let deep = 0, shelf = 0, bad = 0;
        for (let z = pd.z0; z <= pd.z1; z++) for (let x = pd.x0; x <= pd.x1; x++) {
          let top = null;
          for (let y = 60; y >= -3; y--) if (r.world.get(x, y, z) === MAT.WATER) { top = y; break; }
          if (top === null) continue;
          if (r.world.get(x, top - 1, z) === MAT.WATER) { deep++; if (r.world.get(x, top - 2, z) !== MAT.CLAY) bad++; }
          else shelf++;
        }
        if (deep > 0 && bad === 0) deepOk++;
        if (shelf > 0) rimOk++;
        if (fishes.some((p) => p.x >= pd.x0 && p.x <= pd.x1 && p.z >= pd.z0 && p.z <= pd.z1)) fishedDeep++;
      }
    }
    check('ponds: every park pond has a deep middle, clay under it', ponds > 5 && deepOk === ponds, `${deepOk}/${ponds}`);
    check('ponds: and keeps a one-deep rim', rimOk === ponds, `${rimOk}/${ponds}`);
    check('ponds: every park pond has fish', fishedDeep === ponds, `${fishedDeep}/${ponds}`);
  }
  check('cities: fish are generated', total > 0, String(total));
  check('cities: both ponds and the canal get fish', pondFish > 0 && riverFish > 0, `${pondFish} pond, ${riverFish} canal`);
  check('cities: every fish is in water with water beside it, outside every building', bad === 0, `${bad} bad`);

  // ---- Java: kept, and tropical fish with a pattern -------------------------
  const cod = javaEntity({ type: 'cod', x: 0, y: 0, z: 0 }, J);
  const sal = javaEntity({ type: 'salmon', x: 0, y: 0, z: 0 }, J);
  const trop = javaEntity({ type: 'tropicalfish', x: 0, y: 0, z: 0, variant: 0x0b030102 }, J);
  const kept = (e) => e && e.nbt.PersistenceRequired && e.nbt.PersistenceRequired[1] === 1;
  check('java: cod, salmon and tropical fish have their Java ids', cod.id === 'minecraft:cod' && sal.id === 'minecraft:salmon' && trop.id === 'minecraft:tropical_fish');
  check('java: every fish is PersistenceRequired', kept(cod) && kept(sal) && kept(trop));
  check('java: a tropical fish carries its Variant', trop.nbt.Variant && trop.nbt.Variant[1] === 0x0b030102);
  const vs = fishSpawns(huge, makeRng(3), { bigBody: 1e9, pondMax: 1e9, max: 1e9 }).filter((p) => p.type === 'tropicalfish').map((p) => p.variant);
  const okVariant = vs.every((v) => (v & 0xff) <= 1 && ((v >> 8) & 0xff) <= 5 && ((v >>> 16) & 0xff) <= 15 && ((v >>> 24) & 0xff) <= 15 && ((v >>> 16) & 0xff) !== ((v >>> 24) & 0xff));
  check('java: tropical Variants are valid (size, pattern, two different colours)', vs.length > 20 && okVariant, `${vs.length} checked`);

  // ---- the option in the page ------------------------------------------------
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('page: a Fish checkbox, read into the config', /id="fish"/.test(html) && /const CHECKS = \[[^\]]*'fish'/.test(main));
  note(`fish: ${total} across 4 cities (${pondFish} in ponds, ${riverFish} in the canal)`);
}
