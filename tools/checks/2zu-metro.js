// tools/checks/2zu-metro.js — a metro under the main streets.
//
// A line under the longest main street each way: a tunnel with track all along
// (a powered rail every eight on redstone, stop walls at the ends), stations
// with a minecart each, and from the stations flights of stairs up to the
// pavement (straight, or a switchback that comes out by its station) that can be
// walked a step at a time. Torches light the tunnels; every building still walks
// through and nothing is dark. Both exports write the tunnels, halls and stairs
// as air. None when switched off, on stilts, in the sky, or up a cliff.

export const id = '2zu';
export const label = '2zu. the metro';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT, MATERIALS } = await import('../../engine/materials.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id >= 0 && !MATERIALS.isPassable(id); };

  check('defaults: no metro unless asked', DEFAULTS.metro === false);
  let ok = true, dark = 0, lines = 0, stations = 0, reached = 0, trackBad = 0, endBad = 0, powerBad = 0, walkBad = 0, cartBad = 0, torchless = 0, flightless = 0;
  const cities = [];
  for (const [seed, size, style, extra] of [[7, 192, 'modern', {}], [12345, 256, 'medieval', {}], [99, 224, 'modern', { transit: 'trams' }]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: style, metro: true, ...extra });
    cities.push(r);
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    dark += r.stats.lighting.darkAfter;
    for (const l of r.metro.lines) {
      lines++;
      if (!l.torches) torchless++;
      if (!l.flights) flightless++;
      // the track all along, room over it, a floor under it, redstone under the powered rails
      for (let u = l.u0; u <= l.u1; u++) {
        const [x, z] = l.cell(u, l.a);
        const b = blk(w, x, l.F + 1, z);
        if (!/rail/.test(b) || w.has(x, l.F + 2, z) || w.has(x, l.F + 3, z) || !solid(w, x, l.F, z)) trackBad++;
        if (b === 'minecraft:golden_rail' && blk(w, x, l.F, z) !== 'minecraft:redstone_block') powerBad++;
      }
      for (const u of [l.u0 - 1, l.u1 + 1]) { const [x, z] = l.cell(u, l.a); if (!solid(w, x, l.F + 1, z)) endBad++; }
      // the stations: a cart each on the track; the stairs walked up
      for (const st of l.stations) {
        stations++;
        if (!r.metro.carts.some((c) => c.x === st.at[0] && c.z === st.at[1] && /rail/.test(blk(w, c.x, c.y, c.z)))) cartBad++;
        if (!st.stairs) continue;
        reached++;
        // the path: the foot, the steps (with the landing where the rows change), the exit
        const s = st.stairs;
        let [px, feet, pz] = s.foot;
        if (w.has(px, feet, pz) || w.has(px, feet + 1, pz)) walkBad++;
        // (a switchback's two flights turn side by side: its landing is beside the way, not on it)
        const path = s.steps;
        for (const [x, z, y] of path) {
          if (Math.abs(x - px) + Math.abs(z - pz) !== 1) walkBad++;            // the next cell over
          if (y + 1 - feet > 1 || y + 1 - feet < 0) walkBad++;                 // a block up at most
          if (!solid(w, x, y, z) && !/stairs/.test(blk(w, x, y, z))) walkBad++;
          if (w.has(x, y + 1, z) || w.has(x, y + 2, z)) walkBad++;            // head room
          px = x; pz = z; feet = y + 1;
        }
        const [ex, ey, ez] = s.exit;
        if (Math.abs(ex - px) + Math.abs(ez - pz) !== 1 || ey - feet > 1 || !solid(w, ex, ey - 1, ez) || w.has(ex, ey, ez) || w.has(ex, ey + 1, ez)) walkBad++;
      }
    }
  }
  check('metro: every building walks through, every door reached; nothing dark', ok && dark === 0, `${dark} dark`);
  check('metro: a line in every city, two stations or more to a line', lines >= cities.length && stations >= lines * 2, `${lines} lines, ${stations} stations`);
  check('metro: track all along, room over it, a floor under it', trackBad === 0, `${trackBad}`);
  check('metro: every powered rail on a redstone block', powerBad === 0, `${powerBad}`);
  check('metro: a stop wall at each end of the line', endBad === 0, `${endBad}`);
  check('metro: a minecart on the track at every station', cartBad === 0, `${cartBad}`);
  check('metro: torches along every tunnel', torchless === 0, `${torchless}`);
  check('metro: every line has stairs up, most stations do', flightless === 0 && reached >= stations * 0.75, `${reached}/${stations} stations, ${flightless} lines without`);
  check('metro: every flight walked up a step at a time, head room all the way, out onto the street', walkBad === 0, `${walkBad}`);
  // the exports write the tunnels, halls and stairs as air
  {
    const { buildStructures } = await import('../../engine/export.js');
    const { javaTiles } = await import('../../engine/export-java.js');
    const { readJavaNbt } = await import('../../engine/javaworld.js');
    const { decodeNbt } = await import('../nbt-read.js');
    const r = cities[0], w = r.world;
    const lo = Math.min(...r.metro.lines.map((l) => l.F)) + 1, hi = 0;
    const want = new Set();
    for (const b of w.airBoxes) { if (b.y1 > hi || b.y0 < lo) continue; for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) if (!w.has(x, y, z)) want.add(`${x},${y},${z}`); }
    let bedrockAir = 0;
    for (const st of buildStructures(w, {})) {
      const root = decodeNbt(st.data).root, bi = root.structure.block_indices[0], pal = root.structure.palette.default.block_palette;
      const sy = root.size[1], sz = root.size[2], [ox, oy, oz] = st.offset;
      for (let i = 0; i < bi.length; i++) {
        if (bi[i] === -1 || pal[bi[i]].name !== 'minecraft:air') continue;
        const z = i % sz, y = Math.floor(i / sz) % sy, x = Math.floor(i / (sy * sz));
        if (want.has(`${ox + x},${oy + y},${oz + z}`)) bedrockAir++;
      }
    }
    check('metro, Bedrock: every empty cell of the tunnels, halls and stairs written as air', want.size > 500 && bedrockAir === want.size, `${bedrockAir}/${want.size}`);
    let javaAir = 0;
    for (const t of javaTiles(w, { prefix: 'city', spawns: r.spawns })) {
      const root = readJavaNbt(t.nbt), pal = root.palette.map((q) => q.Name);
      for (const b of root.blocks) {
        if (pal[b.state] !== 'minecraft:air') continue;
        if (want.has(`${w.box.x0 + t.offset[0] + b.pos[0]},${2 + t.offset[1] + b.pos[1]},${w.box.z0 + t.offset[2] + b.pos[2]}`)) javaAir++;
      }
    }
    check('metro, Java: the same cells listed as air', javaAir === want.size, `${javaAir}/${want.size}`);
  }
  // none when switched off, on stilts, in the sky, up a cliff
  {
    const { LIGHT } = await import('./harness.js');
    const base = { ...DEFAULTS, ...LIGHT, seed: 7, size: 192 };
    const rs = [generateCity({ ...base }), generateCity({ ...base, metro: true, stilts: true }), generateCity({ ...base, metro: true, floating: true }), generateCity({ ...base, metro: true, cliff: true })];
    check('metro: none when switched off, on stilts, floating, or up a cliff', rs.every((r) => !r.metro));
  }
  note(`metro: ${lines} lines, ${stations} stations, ${reached} with stairs, over ${cities.length} cities`);
}
