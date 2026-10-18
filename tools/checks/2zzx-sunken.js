// tools/checks/2zzx-sunken.js — the Sunken style and its flooding (styles.js, flood.js).
//
// - registered, offered in the page and in the Mix styles list;
// - a sunken city: level, no metro, no rails; a mixed city floods only its sunken
//   districts; with the metro (or the dome, or fitted ground) a sunken district stays dry
//   and says why;
// - in two sunken cities and a mixed one: every building walks through, every door
//   reached, nothing dark;
// - the sea DEPTH over the highest flooded ground, low roofs under it, tall buildings out
//   of it; sealed (no cell of the sea beside an open cell, or a block the water gets
//   through, that is not sea); a wall door where the way crosses, the sea held by it;
//   no building cut by the wall;
// - nothing under the water that it would wash away; every plant under it standing in
//   water; kelp and seagrass in the streets, coral;
// - a conduit in a whole frame (forty-two), the water round it clear, every flooded
//   column within eighty of one;
// - no villager, golem, cat or farm animal under the water; sea creatures and fish in
//   the sea's own water; a hostile mob under it a drowned;
// - the exports: Bedrock's sea structures exactly the sea (its cellars too), loaded after
//   the city; Java's the same, placed last;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzx';
export const label = '2zzx. the Sunken style, flooded';

const key = (p) => p.join(',');
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const { DEPTH } = await import('../../engine/flood.js');
  const { buildStructures, buildSeaStructures, functionFiles, tileList } = await import('../../engine/export.js');
  const { javaTiles } = await import('../../engine/export-java.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('Sunken: registered, offered in the page and in the Mix styles list',
    STYLE_NAMES.includes('sunken') && STYLES.sunken.sunken === true && /<option value="sunken">/.test(html) && /class="mixStyle" value="sunken"/.test(html));

  const cities = [
    ['sunken 160', generateCity({ ...DEFAULTS, size: 160, seed: 12345, cityStyle: 'sunken' })],
    ['sunken 224, metro and trams asked for', generateCity({ ...DEFAULTS, size: 224, seed: 7, cityStyle: 'sunken', metro: true, transit: 'trams' })],
    ['mixed 256', generateCity({ ...DEFAULTS, size: 256, seed: 21, cityStyle: 'modern', mixStyles: true, mixList: ['modern', 'sunken', 'medieval', 'venetian'] })],
  ];
  const dryMetro = generateCity({ ...DEFAULTS, size: 192, seed: 5, cityStyle: 'modern', mixStyles: true, mixList: ['modern', 'sunken'], metro: true, furnish: false });
  const c2 = cities[1][1];
  check('Sunken: a sunken city level, with no metro and no rails; a sunken district with the metro stays dry and says why',
    c2.cfg.hills === 0 && c2.cfg.metro === false && c2.cfg.transit === 'roads' && !c2.metro && !!c2.flood
    && !dryMetro.flood && !dryMetro.world.sea && /metro/.test(dryMetro.stats.floodDry || ''), `${dryMetro.stats.floodDry}`);

  const LEAKY = /stairs|slab|fence|_wall$|pane|bars|trapdoor|(?<!sea_)lantern|chain|sign|ladder|scaffolding|campfire|candle|rail|carpet|torch|button|lever|plate|flower|sapling|grass(?!_path)|fern|kelp|seagrass|coral|pickle|vine|_bed$|^bed$|chest|banner|bell|anvil|cauldron|hopper|lectern|brewing|grindstone|stonecutter|composter|cake|pot$|head|skull|rod$|dripleaf|azalea|bamboo|cactus|bubble|snow_layer/;
  const WASHED = /(^|_)torch$|redstone_wire|(^|_)rail$|carpet|_button$|^lever$|pressure_plate|tripwire|repeater|comparator|cobweb|^fire$|snow_layer|waterlily|lily_pad|flower$|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|sapling|short_grass|tallgrass|^grass$|wheat|carrots|potatoes|beetroot|reeds|sweet_berry|deadbush|pink_petals|torchflower|double_plant/;
  const results = [];
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  for (const [name, r] of cities) {
    const w = r.world, f = r.flood, sea = w.sea;
    if (!f || !sea) { results.push({ name, built: false }); continue; }
    const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const v = verifyAll(w, r.buildings);
    const out = { name, built: true, walks: v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0 };
    const { W, D } = r.plan;
    // only sunken ground floods
    let wrongStyle = 0, wetCols = 0, gMax = -Infinity;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (f.inR(x, z)) {
      const st = r.cfg.styleAt ? r.cfg.styleAt(x, z) : STYLES[r.cfg.cityStyle];
      if (!st.sunken) wrongStyle++;
      if (f.wetCol(x, z)) wetCols++;
      gMax = Math.max(gMax, f.ground(x, z));
    }
    out.depth = sea.S === gMax + DEPTH && wrongStyle === 0 && wetCols > 500;
    // low under it, tall out of it
    const inFlood = r.buildings.filter((b) => !b.landmark && f.wetCol(Math.floor((b.x0 + b.x1) / 2), Math.floor((b.z0 + b.z1) / 2)));
    out.under = inFlood.filter((b) => b.roofY < sea.S).length; out.out = inFlood.filter((b) => b.roofY > sea.S + 2).length;
    // no building cut by the wall
    out.uncut = r.buildings.every((b) => { for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) if (f.inB(x, z)) return false; return true; });
    // sealed: from every cell of the sea, through whatever the water could get into or
    // through that is not sea (air, a stair, a fence...), nowhere out of the flooded ground
    const b = sea.box;
    let leaks = 0, seaCells = 0; const leakAt = [];
    const y0 = sea.y0 !== undefined ? sea.y0 : sea.G + 1;
    const porous = (p) => { const id = w.get(...p); if (id < 0) return true; const n = MATERIALS.def(id).block.replace('minecraft:', ''); if (n === 'water' || /_door$/.test(n) || /glass/.test(n)) return false; return MATERIALS.isPassable(id) || LEAKY.test(n); };
    const seenP = new Set();
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = y0; y <= sea.S; y++) {
      if (!sea.at(x, y, z) || w.has(x, y, z)) continue;
      seaCells++;
      for (const [a, c, d] of N6) {
        const start = [x + a, y + c, z + d];
        if (start[1] > sea.S || sea.at(...start) || seenP.has(key(start)) || !porous(start)) continue;
        // follow it: does it lead out?
        const q = [start]; seenP.add(key(start));
        while (q.length) {
          const p = q.pop();
          const outside = !f.wetCol(p[0], p[2]);
          if (outside) { leaks++; if (leakAt.length < 6) leakAt.push([...p, w.get(...p) < 0 ? 'air' : MATERIALS.def(w.get(...p)).block, f.inB(p[0], p[2])]); continue; }
          for (const [a2, c2, d2] of N6) {
            const n = [p[0] + a2, p[1] + c2, p[2] + d2];
            if (n[1] > sea.S || sea.at(...n) || seenP.has(key(n)) || !porous(n)) continue;
            seenP.add(key(n)); q.push(n);
          }
        }
      }
    }
    out.sealed = leaks === 0; out.leaks = leaks; out.leakAt = leakAt; out.seaCells = seaCells;
    out.doors = f.doors.length > 0 && f.doors.every((d) => /door/.test(raw(d.at)) && /door/.test(raw([d.at[0], d.at[1] + 1, d.at[2]])));
    // nothing the water would break, every plant in water
    let washed = 0, dryPlant = 0, plants = 0;
    w.forEach((x, y, z, id) => {
      if (!sea.at(x, y, z) && !(f.wetCol(x, z) && y <= sea.S && y > f.ground(x, z))) return;
      const n = MATERIALS.def(id).block.replace('minecraft:', '');
      if (WASHED.test(n)) washed++;
      if (/kelp|seagrass|coral$|coral_fan|sea_pickle|conduit/.test(n)) { plants++; if (!w.wet.has(VoxelWorld.key(x, y, z))) dryPlant++; }
    });
    out.washed = washed === 0 && dryPlant === 0 && f.kelp > 5 && f.seagrass > 20; out.nWashed = washed; out.dryPlant = dryPlant;
    // conduits
    const FRAME = /prismarine|sea_lantern/;
    out.conduits = f.conduits.length > 0 && f.uncovered === 0 && f.conduits.every((c) => {
      const [cx, cy, cz] = c.at;
      if (raw(c.at) !== 'conduit' || !w.wet.has(VoxelWorld.key(cx, cy, cz))) return false;
      let frame = 0;
      for (let a = -2; a <= 2; a++) for (let bb = -2; bb <= 2; bb++) {
        if (Math.max(Math.abs(a), Math.abs(bb)) !== 2) continue;
        for (const [dx, dy, dz] of [[a, bb, 0], [a, 0, bb], [0, a, bb]]) if (FRAME.test(raw([cx + dx, cy + dy, cz + dz]))) frame++;
      }
      // (each shared corner counted twice above: 48 seen when all 42 are there)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dy && !dz) continue;
        const p = [cx + dx, cy + dy, cz + dz];
        if (w.has(...p) || !sea.at(...p)) return false;
      }
      return frame === 48;
    });
    // life
    const LAND = new Set(['villager', 'golem', 'cat', 'panda', 'cow', 'sheep', 'pig', 'chicken']);
    out.landFolk = r.spawns.filter((p) => LAND.has(p.type) && f.flooded(p.x, p.y, p.z)).length;
    const sl = f.life, fish = r.spawns.filter((p) => p.water === 'sea');
    out.life = out.landFolk === 0 && sl.length >= 5 && sl.every((m) => sea.at(Math.floor(m.x), m.y, Math.floor(m.z)) && !w.has(Math.floor(m.x), m.y, Math.floor(m.z)))
      && r.zoo.filter((z) => ['squid', 'glow_squid', 'dolphin', 'turtle', 'axolotl'].includes(z.type)).length === sl.length
      && fish.length >= 8 && fish.every((p) => sea.at(p.x, p.y, p.z) && !w.has(p.x, p.y, p.z))
      && r.hostiles.every((h) => !f.flooded(h.x, h.y, h.z) || h.type === 'drowned');
    out.kinds = [...new Set(sl.map((m) => m.type))].join('/');
    // exports
    const ss = buildSeaStructures(w, {});
    let water = 0, wrong = 0;
    for (const st of ss) {
      const s = decodeNbt(st.data).root.structure;
      const pal = s.palette.default.block_palette.map((p) => p.name);
      const idx = s.block_indices[0];
      const [, sy, sz] = st.size;
      for (let i = 0; i < idx.length; i++) {
        if (idx[i] < 0) continue;
        if (pal[idx[i]] !== 'minecraft:water') { wrong++; continue; }
        const p = [st.box.x0 + Math.floor(i / (sy * sz)), st.box.y0 + Math.floor(i / sz) % sy, st.box.z0 + i % sz];
        if (!sea.at(...p) || w.has(...p)) wrong++; else water++;
      }
    }
    out.bedrock = water === seaCells && wrong === 0;
    const ff = functionFiles(tileList(w, {}), w, { namespace: 'polis', spawns: r.spawns });
    const build = ((ff.find((x) => x.name.endsWith('/build.mcfunction')) || {}).text || '').split('\n');
    const loads = build.map((l, i) => [l, i]).filter(([l]) => /^structure load /.test(l));
    out.order = loads.filter(([l]) => /_s /.test(l)).length === ss.length && Math.min(...loads.filter(([l]) => /_s /.test(l)).map(([, i]) => i)) > Math.max(...loads.filter(([l]) => !/_s /.test(l)).map(([, i]) => i));
    if (name === 'sunken 160') {
      const jt = javaTiles(w, { fillAir: false });
      const first = jt.findIndex((p) => p.sea);
      out.java = first >= 0 && jt.slice(first).every((p) => p.sea) && jt.filter((p) => p.sea).reduce((a, p) => a + p.blocks, 0) === seaCells;
    } else out.java = true;
    results.push(out);
  }
  const say = () => results.map((o) => JSON.stringify(o)).join(' | ');
  const all = (fn) => results.every((o) => o.built && fn(o));
  check('Sunken: flooded in all three; every building walks through, every door reached, nothing dark', all((o) => o.walks), say());
  check('Sunken: the sea DEPTH over the highest flooded ground, only on sunken ground; low roofs under it, tall buildings out of it; no building cut by the wall',
    all((o) => o.depth && o.uncut) && results.some((o) => o.under > 3) && results.some((o) => o.out > 0), say());
  check('Sunken: sealed all round; doors where the ways cross the wall', all((o) => o.sealed && o.doors), say());
  check('Sunken: nothing under the water that it would wash away; every plant under it in water; kelp and seagrass in the streets', all((o) => o.washed), say());
  check('Sunken: conduits in whole frames, the water round them clear, every flooded column within eighty of one', all((o) => o.conduits), say());
  check('Sunken: no villager, golem, cat or farm animal under the water; sea creatures and fish in it; any hostile under it a drowned', all((o) => o.life), say());
  check('Sunken, exports: Bedrock\'s sea exactly the sea, loaded after the city; Java\'s the same, placed last', all((o) => o.bedrock && o.order && o.java), say());

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    const w = cities[0][1].world;
    for (const st of buildStructures(w, {}).concat(buildSeaStructures(w, {}))) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`sunken: ${cities.map(([n, r]) => `${n}: ${r.stats.flood ? `sea ${r.stats.flood.surface} up, ${r.stats.flood.conduits} conduits, ${r.stats.flood.life} creatures, ${r.stats.flood.fish} fish, ${r.stats.flood.doors} doors` : r.stats.floodDry}`).join('; ')}`);
}
