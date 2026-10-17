// tools/checks/2zzw-underwater.js — the city under the sea (sea.js).
//
// - offered in the page, off by default; not on fitted ground; no dome, stilts,
//   islands, cliff or harbour with it, nor the airport or theme park beside it;
// - in three cities (a plain one, a medieval one, one with the metro and a dome
//   asked for too): every building walks through, every door reached, nothing dark;
// - the hall: all of the city inside it (every empty cell over every column of the
//   plan, to three over its highest block, is the hall's inside); sealed (no cell of
//   the sea touches an empty or passable cell that is not sea); the sea's surface at
//   least four over the hall's top; the outer wall whole all round to over the sea;
// - four tunnels, each walked from the city's streets through its doorway and along
//   it to its door in the outer wall;
// - the seabed: kelp, seagrass, coral and sea pickles, each written standing in water,
//   kelp on the seabed or on kelp; a light (a sea pickle cluster) within six of every
//   open cell of the seabed;
// - fish in the sea's own water, summoned by populate;
// - the exports: Bedrock's sea structures water and nothing else, exactly the sea's
//   cells, loaded by build after every tile of the city and after the drains; remove
//   reaching the sea's top; Java's sea pieces the same water, placed last;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzw';
export const label = '2zzw. the city under the sea';

const key = (p) => p.join(',');
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { buildStructures, buildSeaStructures, buildDrainStructures, buildRemoveStructures, functionFiles, tileList } = await import('../../engine/export.js');
  const { javaTiles } = await import('../../engine/export-java.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('under the sea: offered in the page, off by default, and marked not for fitted ground',
    /<input type="checkbox" id="underwater">/.test(html) && DEFAULTS.underwater === false && /underwater: 'under the sea'/.test(main) && /'lifts', 'underwater'\]/.test(main));

  const cities = [
    ['plain 160', generateCity({ ...DEFAULTS, size: 160, seed: 12345, underwater: true })],
    ['medieval 192', generateCity({ ...DEFAULTS, size: 192, seed: 3, underwater: true, cityStyle: 'medieval' })],
    ['metro, dome and airport asked for, 224', generateCity({ ...DEFAULTS, size: 224, seed: 7, underwater: true, metro: true, dome: true, airport: true, stilts: true, harbour: true, hills: 6 })],
  ];
  const { findSites, siteGround } = await import('../../engine/worldfile.js');
  const rawT = JSON.parse(readFileSync(join(ROOT, 'tools', 'test-terrain.json'), 'utf8'));
  const terrain = new Map(Object.entries(rawT).map(([k, v]) => [k, Int16Array.from(v)]));
  const site = findSites(terrain, 128, { step: 64 })[0];
  const fitted = generateCity({ ...DEFAULTS, size: 128, seed: 7, underwater: true, terrain: siteGround(terrain, site.x, site.z, 128), furnish: false, fish: false });
  const c3 = cities[2][1];
  check('under the sea: none on fitted ground; with it no dome, stilts, harbour or hills, and the airport not beside it',
    !fitted.world.sea && fitted.cfg.underwater === false && !c3.dome && c3.cfg.dome === false && c3.cfg.stilts === false && c3.cfg.harbour === false && c3.cfg.hills === 0
    && /under the sea/.test(c3.stats.airportMissing || ''), `${c3.stats.airportMissing}`);

  const isPass = (id) => id < 0 || MATERIALS.isPassable(id);
  const results = [];
  for (const [name, r] of cities) {
    const w = r.world, sea = w.sea, inside = w.dome && w.dome.air;
    if (!sea || !inside) { results.push({ name, built: false }); continue; }
    const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const v = verifyAll(w, r.buildings);
    const out = { name, built: true, walks: v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0 };
    const G = sea.G, b = sea.box;
    // all of the city inside: over every column of the plan, every empty cell to three over its top is the hall's inside
    const { W, D, mask } = r.plan;
    let outside = 0;
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      if (mask && !mask[z * W + x]) continue;                 // (outside the city's own outline: seabed now)
      let top = G; for (let y = G; y <= sea.S; y++) if (w.has(x, y, z) && !r.sea.shell.has(x + ',' + y + ',' + z)) top = y;
      for (let y = G + 1; y <= top + 3; y++) if (!w.has(x, y, z) && !inside(x, y, z)) outside++;
    }
    out.enclosed = outside === 0; out.outside = outside;
    // sealed
    let leaks = 0, seaCells = 0;
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = G + 1; y <= sea.S; y++) {
      if (!sea.at(x, y, z) || w.has(x, y, z)) continue;
      seaCells++;
      for (const [a, c, d] of N6) {
        const X = x + a, Y = y + c, Z = z + d;
        if (Y > sea.S || sea.at(X, Y, Z)) continue;
        if (isPass(w.get(X, Y, Z))) leaks++;
      }
    }
    out.sealed = leaks === 0; out.leaks = leaks; out.seaCells = seaCells;
    const hallTop = r.stats.sea.top + G;
    out.deep = sea.S - hallTop >= 4;
    // the outer wall: every cell of its ring from the seabed to over the sea a block (a door or two where a tunnel meets it)
    let gaps = 0;
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
      if (!(x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1)) continue;
      for (let y = G + 1; y <= sea.S + 1; y++) { const n = raw([x, y, z]); if (!/glass|prismarine|sea_lantern|door/.test(n)) gaps++; }
    }
    out.outer = gaps === 0;
    // the tunnels: from the streets to each door
    const tunnels = r.sea.tunnels;
    const stand = (p) => { const a = w.get(...p), c = w.get(p[0], p[1] + 1, p[2]), u = w.get(p[0], p[1] - 1, p[2]); return isPass(a) && isPass(c) && !isPass(u); };
    const streetStart = (() => { for (const L of r.plan.lots) { const x = L.x0 - 2, z = L.z0 - 2; for (const y of [G + 1, G + 2]) if (x >= 0 && z >= 0 && stand([x, y, z]) && inside(x, y, z)) return [x, y, z]; } return null; })();
    const seen = new Set(), q = [];
    if (streetStart) { seen.add(key(streetStart)); q.push(streetStart); }
    while (q.length) {
      const p = q.pop();
      for (const [a, c] of D4) for (const dy of [0, 1, -1]) {
        const n = [p[0] + a, p[1] + dy, p[2] + c];
        if (seen.has(key(n)) || n[1] > G + 6 || n[0] < b.x0 || n[0] > b.x1 || n[2] < b.z0 || n[2] > b.z1 || !stand(n)) continue;
        if (dy === 1 && !isPass(w.get(p[0], p[1] + 2, p[2]))) continue;
        if (dy === -1 && !isPass(w.get(n[0], n[1] + 2, n[2]))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    out.tunnels = tunnels.length;
    out.walkOut = !!streetStart && tunnels.length === 4 && tunnels.every((T) => seen.has(key(T.inside)) && T.doors.every((d) => seen.has(key(d)) && /door/.test(raw(d))));
    out.tunnelsDry = tunnels.every((T) => T.cells.every((c) => inside(...c) && inside(c[0], c[1] + 2, c[2])));
    // the seabed
    const S_ = r.sea, wet = w.wet || new Set();
    const { VoxelWorld } = await import('../../engine/blockcore.js');
    let plants = 0, dry = 0, kelpBad = 0;
    const lights = [];
    for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
      if (S_.inFoot(x, z)) continue;
      for (let y = G + 1; y <= sea.S; y++) {
        const n = raw([x, y, z]);
        if (!/kelp|seagrass|coral$|coral_fan|sea_pickle/.test(n)) continue;
        plants++;
        if (!wet.has(VoxelWorld.key(x, y, z))) dry++;
        if (n === 'kelp' && !/kelp|sand|gravel|clay|coral_block/.test(raw([x, y - 1, z]))) kelpBad++;
        if (n === 'sea_pickle') lights.push([x, z]);
      }
    }
    // a light within six of every open seabed cell
    let darkBed = 0;
    for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
      if (S_.inFoot(x, z) || w.has(x, G + 1, z) || !sea.at(x, G + 1, z)) continue;
      if (!lights.some(([a, c]) => Math.abs(a - x) + Math.abs(c - z) <= 6) && !(w.has(x, G + 1, z))) {
        // (or a sea lantern in a wall or rib near by)
        let lamp = false;
        for (let dx = -4; dx <= 4 && !lamp; dx++) for (let dz = -4; dz <= 4 && !lamp; dz++) for (let y = G + 1; y <= G + 6 && !lamp; y++) if (raw([x + dx, y, z + dz]) === 'sea_lantern') lamp = true;
        if (!lamp) darkBed++;
      }
    }
    out.seabed = S_.kelp > 20 && S_.seagrass > 50 && S_.coral > 5 && S_.pickles > 20 && dry === 0 && kelpBad === 0 && plants > 100;
    out.bedLit = darkBed === 0; out.darkBed = darkBed; out.dry = dry; out.kelpBad = kelpBad; out.plants = plants;
    // fish
    const fish = r.spawns.filter((p) => p.water === 'sea');
    const ff = functionFiles(tileList(w, {}), w, { namespace: 'polis', spawns: r.spawns });
    const pop = (ff.find((f) => f.name.endsWith('/populate.mcfunction')) || {}).text || '';
    out.fish = fish.length >= 20 && fish.every((f) => sea.at(f.x, f.y, f.z) && !w.has(f.x, f.y, f.z) && !w.has(f.x, f.y + 1, f.z)) && (pop.match(/^summon minecraft:(cod|salmon|tropicalfish)/gm) || []).length >= fish.length;
    out.fishN = fish.length;
    // Bedrock: the sea's structures, water only, exactly the sea; loaded after the city
    const ss = buildSeaStructures(w, {});
    let water = 0, wrong = 0;
    for (const st of ss) {
      const s = decodeNbt(st.data).root.structure;
      const pal = s.palette.default.block_palette.map((p) => p.name);
      const idx = s.block_indices[0];
      const [sx, sy, sz] = st.size;
      for (let i = 0; i < idx.length; i++) {
        if (idx[i] < 0) continue;
        if (pal[idx[i]] !== 'minecraft:water') { wrong++; continue; }
        const xx = Math.floor(i / (sy * sz)), yy = Math.floor(i / sz) % sy, zz = i % sz;
        const p = [st.box.x0 + xx, st.box.y0 + yy, st.box.z0 + zz];
        if (!sea.at(...p) || w.has(...p) || inside(...p)) wrong++; else water++;
      }
    }
    out.bedrockSea = water === seaCells && wrong === 0;
    const build = ((ff.find((f) => f.name.endsWith('/build.mcfunction')) || {}).text || '').split('\n');
    const loads = build.map((l, i) => [l, i]).filter(([l]) => /^structure load /.test(l));
    const lastCity = Math.max(...loads.filter(([l]) => !/_s /.test(l)).map(([, i]) => i)), firstSea = Math.min(...loads.filter(([l]) => /_s /.test(l)).map(([, i]) => i));
    out.order = ss.length > 0 && loads.filter(([l]) => /_s /.test(l)).length === ss.length && firstSea > lastCity && loads.some(([l]) => /_d /.test(l));
    out.remove = buildRemoveStructures(w, {}).every((st) => st.box.y1 >= sea.S + 1);
    // Java: the same water, placed last
    if (name === 'plain 160') {
      const jt = javaTiles(w, { fillAir: false });
      const seaP = jt.filter((p) => p.sea);
      const firstSeaJ = jt.findIndex((p) => p.sea);
      out.java = seaP.length > 0 && seaP.reduce((a, p) => a + p.blocks, 0) === seaCells && jt.slice(firstSeaJ).every((p) => p.sea) && seaP.every((p) => p.palette === 1);
    } else out.java = true;
    results.push(out);
  }
  const say = () => results.map((o) => JSON.stringify(o)).join(' | ');
  const all = (f) => results.every((o) => o.built && f(o));
  check('under the sea: every building walks through, every door reached, nothing dark, in all three cities', all((o) => o.walks), say());
  check('under the sea: all of the city inside the hall; the hall sealed against the sea; the sea four and more over its top; the outer wall whole all round',
    all((o) => o.enclosed && o.sealed && o.deep && o.outer), say());
  check('under the sea: four glass tunnels, each walked from the streets along it to its door in the outer wall, dry all through', all((o) => o.walkOut && o.tunnelsDry), say());
  check('under the sea: kelp, seagrass, coral and sea pickles on the seabed, each standing in water, kelp on the seabed; a light near every open cell of it', all((o) => o.seabed && o.bedLit), say());
  check('under the sea: fish in the sea\'s own water, summoned by populate', all((o) => o.fish), say());
  check('under the sea, Bedrock: the sea\'s structures water and only water, exactly the sea, loaded after every tile of the city (and the drains); remove reaching the sea\'s top',
    all((o) => o.bedrockSea && o.order && o.remove), say());
  check('under the sea, Java: the sea\'s pieces exactly the sea\'s water, placed after all the city\'s', all((o) => o.java), say());

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    const w = cities[0][1].world;
    for (const st of buildStructures(w, {}).concat(buildDrainStructures(w, {}), buildSeaStructures(w, {}))) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states (the sea\'s plants included)', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`under the sea: ${cities.map(([n, r]) => `${n}: ${r.stats.sea ? `${r.stats.sea.wide}x${r.stats.sea.deep}, walls ${r.stats.sea.wall}, top ${r.stats.sea.top}, sea ${r.stats.sea.surface}, ${r.stats.sea.fish} fish` : 'none'}`).join('; ')}`);
}
