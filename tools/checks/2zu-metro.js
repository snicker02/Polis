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
  let ok = true, dark = 0, lines = 0, stations = 0, reached = 0, trackBad = 0, endBad = 0, powerBad = 0, walkBad = 0, cartBad = 0, torchless = 0, flightless = 0, plain = 0;
  let loops = 0, loopOpen = 0, loopTrack = 0, cornerBad = 0, loopShallow = 0;
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
      if (!l.lights) torchless++;
      if (!l.flights) flightless++;
      if (l.ring) {
        // the loop: closed, a step to the next cell all round; track, room over it,
        // curves at its four corners, powered rails elsewhere; under both cross lines
        loops++;
        const P = l.path;
        for (let i = 0; i < P.length; i++) {
          const [x, z] = P[i], [nx, nz] = P[(i + 1) % P.length];
          if (Math.abs(nx - x) + Math.abs(nz - z) !== 1) loopOpen++;
          const b = blk(w, x, l.F + 1, z);
          if (!/rail/.test(b) || w.has(x, l.F + 2, z) || w.has(x, l.F + 3, z) || !solid(w, x, l.F, z)) loopTrack++;
          const corner = l.corners.some(([cx, cz]) => cx === x && cz === z);
          if (corner) { const d = MATERIALS.def(w.get(x, l.F + 1, z)).states.rail_direction; const v = d && (d.value ?? d); if (b !== 'minecraft:rail' || !(v >= 6 && v <= 9)) cornerBad++; }
          else if (b !== 'minecraft:golden_rail') plain++;
        }
        if (r.metro.lines.some((o) => !o.ring && o.F - 5 < l.F + 4 + 1 && o.F <= l.F + 4)) loopShallow++;
      } else {
      // the track all along, room over it, a floor under it; powered rails all along
      for (let u = l.u0; u <= l.u1; u++) {
        const [x, z] = l.cell(u, l.a);
        const b = blk(w, x, l.F + 1, z);
        if (!/rail/.test(b) || w.has(x, l.F + 2, z) || w.has(x, l.F + 3, z) || !solid(w, x, l.F, z)) trackBad++;
        if (b !== 'minecraft:golden_rail') plain++;
        // a redstone block under one in eight, so every powered rail is powered
        if ((u - l.u0) % 8 === 4 && blk(w, x, l.F, z) !== 'minecraft:redstone_block') powerBad++;
      }
      for (const u of [l.u0 - 1, l.u1 + 1]) { const [x, z] = l.cell(u, l.a); if (!solid(w, x, l.F + 1, z)) endBad++; }
      }
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
  check('metro: powered rails all along (plain ones only on the loop\'s curves), a redstone block under one in eight', powerBad === 0 && plain === 0, `${powerBad} unpowered, ${plain} plain`);
  check('metro: a loop round the city, closed all the way round', loops >= cities.length && loopOpen === 0, `${loops} loops, ${loopOpen} gaps`);
  check('metro: the loop has track all round, room over it, curves at its corners, under both cross lines', loopTrack === 0 && cornerBad === 0 && loopShallow === 0, `${loopTrack} track, ${cornerBad} corners, ${loopShallow} shallow`);
  check('metro: a stop wall at each end of the line', endBad === 0, `${endBad}`);
  check('metro: a minecart on the track at every station', cartBad === 0, `${cartBad}`);
  check('metro: lanterns along every tunnel', torchless === 0, `${torchless}`);
  check('metro: every line has stairs up, most stations do', flightless === 0 && reached >= stations * 0.75, `${reached}/${stations} stations, ${flightless} lines without`);
  check('metro: every flight walked up a step at a time, head room all the way, out onto the street', walkBad === 0, `${walkBad}`);
  // watertight: every cell beside a dug room, below the street, is a block or
  // another room (the world's own ground round it can be water)
  {
    const { inAirBox } = await import('../../engine/underground.js');
    let gaps = 0;
    for (const r of cities) {
      const w = r.world, air = inAirBox(w);
      if (!air) continue;
      for (const b of w.airBoxes) for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++)
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (ny < 1 && !w.has(nx, ny, nz) && !air(nx, ny, nz)) gaps++;
        }
    }
    check('metro: watertight, no opening from a room into the ground round it', gaps === 0, `${gaps} open faces`);
  }
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
  // In the game the city goes in a tile at a time: while one is in and the next
  // is not, a tunnel stood open at the edge onto the world's own ground, and its
  // water came in and took the rails. Plugs (stone through every room and its
  // walls) go in first; each tile puts its own share back.
  {
    const { buildStructures, buildPlugStructures, functionFiles, exportPack, cityId } = await import('../../engine/export.js');
    const { javaTiles } = await import('../../engine/export-java.js');
    const { inAirBox } = await import('../../engine/underground.js');
    const { decodeNbt } = await import('../nbt-read.js');
    const r = cities[0], w = r.world, room = inAirBox(w);
    const plugs = buildPlugStructures(w, {}), tiles = buildStructures(w, {});
    const placed = new Map();
    const put = (st) => {
      const root = decodeNbt(st.data).root, bi = root.structure.block_indices[0], pal = root.structure.palette.default.block_palette;
      const sy = root.size[1], sz = root.size[2], [ox, oy, oz] = st.offset;
      for (let i = 0; i < bi.length; i++) { if (bi[i] === -1) continue; const z = i % sz, y = Math.floor(i / sz) % sy, x = Math.floor(i / (sy * sz)); placed.set(`${ox + x},${oy + y},${oz + z}`, pal[bi[i]].name === 'minecraft:air' ? 'air' : 'block'); }
    };
    for (const p of plugs) put(p);
    let worst = 0;
    for (const st of tiles) {
      put(st);
      let open = 0;
      for (const [k, v] of placed) {
        if (v !== 'air') continue;
        const [x, y, z] = k.split(',').map(Number);
        if (y >= 1 || !room(x, y, z)) continue;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) if (y + dy < 1 && !placed.has(`${x + dx},${y + dy},${z + dz}`)) { open++; break; }
      }
      worst = Math.max(worst, open);
    }
    check('metro: going in a tile at a time with the plugs first, no room is ever open onto the ground round it', plugs.length > 0 && worst === 0, `${worst} open at worst`);
    let left = 0;
    for (const [k, v] of placed) { const [x, y, z] = k.split(',').map(Number); if (room(x, y, z) && !w.has(x, y, z) && v !== 'air') left++; }
    check('metro: once the city is in, every room is air again (no plug left behind)', left === 0, `${left}`);
    const fns = functionFiles(tiles, w, { namespace: 'test', spawns: r.spawns });
    let orderBad = 0;
    for (const n of ['build', 'build_centered']) {
      const lines = fns.find((f) => f.fn === 'test/' + n).text.split('\n').filter((l) => l.startsWith('structure load'));
      const lastPlug = Math.max(...lines.map((l, i) => (/_p /.test(l) ? i : -1))), firstTile = lines.findIndex((l) => !/_p /.test(l) && !/_d /.test(l));
      if (lines.filter((l) => /_p /.test(l)).length !== plugs.length || lastPlug > firstTile) orderBad++;
    }
    check('metro: build and build_centered load every plug before any of the city', orderBad === 0, `${orderBad}`);
    const jt = javaTiles(w, { prefix: 'city', spawns: r.spawns });
    const firstCity = jt.findIndex((t) => !t.plug && !t.drain), lastPlugJ = Math.max(...jt.map((t, i) => (t.plug ? i : -1)));
    check('metro, Java: the plug pieces placed before any of the city', jt.some((t) => t.plug) && lastPlugJ < firstCity);
  }
  // none when switched off, on stilts, in the sky, up a cliff
  {
    const { LIGHT } = await import('./harness.js');
    const base = { ...DEFAULTS, ...LIGHT, seed: 7, size: 192 };
    const rs = [generateCity({ ...base }), generateCity({ ...base, metro: true, stilts: true }), generateCity({ ...base, metro: true, floating: true }), generateCity({ ...base, metro: true, cliff: true })];
    check('metro: none when switched off, on stilts, floating, or up a cliff', rs.every((r) => !r.metro));
  }
  note(`metro: ${lines} lines, ${stations} stations, ${reached} with stairs, over ${cities.length} cities`);

  // On a fitted city: a player's own (its site's ground and water from the blocks
  // of their world), the metro switched on. The street rises and falls: the
  // tunnels lie below the lowest street, at one level, and each station's stairs
  // climb to its own street's surface. Every room watertight below its street.
  {
    const { readFileSync } = await import('node:fs');
    const { MATERIALS } = await import('../../engine/materials.js');
    const { railLinks, railsOf, trackFrom } = await import('../../engine/railgraph.js');
    const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
    const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
    const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
    const r = generateCity({ ...DEFAULTS, ...fx.settings, metro: true, furnish: false, villagers: 0, fish: false, terrain: { ground, water, baseY: fx.baseY } });
    const m = r.metro, w = r.world, { W, D } = r.plan;
    const G = r.cfg && r.cfg.ground !== undefined ? r.cfg.ground : null;
    const ls = m ? m.lines : [];
    let flights = 0, off = 0;
    for (const l of ls) for (const st of l.stations) {
      if (!st.stairs) continue;
      flights++;
      const [ex, ey, ez] = st.stairs.exit;
      // out on the street: solid underfoot, open above
      if (!w.has(ex, ey - 1, ez) || (w.has(ex, ey, ez) && !/fence|lantern|sign|air/.test(MATERIALS.def(w.get(ex, ey, ez)).block))) off++;
    }
    // watertight: beside every metro room, below the street over it, solid or another room
    const boxes = (w.airBoxes || []).filter((b) => ls.some((l) => b.y1 <= l.F + 5 + 30));
    const inBox = (x, y, z) => boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1);
    let leaks = 0;
    const streetTop = (x, z) => { for (let y = 120; y > -64; y--) { const id = w.get(x, y, z); if (id >= 0 && !MATERIALS.isPassable(id)) return y; } return -64; };
    for (const b of boxes) for (let y = b.y0; y <= b.y1; y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (inBox(nx, ny, nz) || w.has(nx, ny, nz)) continue;
        if (ny >= streetTop(nx, nz)) continue;                  // open air at or above the street
        leaks++;
      }
    }
    const rails = railsOf(w, MATERIALS);
    let whole = 0;
    for (const l of ls) {
      const [x0, z0] = l.cell(Math.round((l.u0 + l.u1) / 2), l.a);
      const k = [...rails.keys()].find((q) => { const [x, y, z] = q.split(',').map(Number); return x === x0 && z === z0 && y >= l.F && y <= l.F + 2; });
      if (k && trackFrom(rails, k).size >= l.u1 - l.u0 + 1) whole++;
    }
    check('metro on a fitted city: lines and stations under a player\'s own city', ls.length >= 1 && ls.reduce((n, l) => n + l.stations.length, 0) >= 2, `${ls.length} lines`);
    check('metro on a fitted city: every flight comes out on its own street\'s surface', flights >= 2 && off === 0, `${flights} flights, ${off} not out on the street`);
    check('metro on a fitted city: every room watertight below the street over it', leaks === 0, `${leaks} open faces`);
    check('metro on a fitted city: each line\'s track runs its whole tunnel in one piece', whole === ls.length, `${whole} of ${ls.length}`);
  }
}
