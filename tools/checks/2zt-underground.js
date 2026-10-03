// tools/checks/2zt-underground.js — rooms under buildings.
//
// Cellars under houses, a crypt under the cathedral: walled and floored in stone,
// reached by a flight of stairs down from the ground floor that can be walked a
// step at a time. In the game the ground under a city is the world's own, so
// every room is written as air by both exports (or it would fill). Every
// building still walks through and nothing is left dark; no rooms with the
// option off, or on stilts or in the sky.

export const id = '2zt';
export const label = '2zt. cellars and the crypt';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT, MATERIALS } = await import('../../engine/materials.js');
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id >= 0 && !MATERIALS.isPassable(id); };

  check('defaults: cellars and crypt unless switched off', DEFAULTS.underground === true);
  let ok = true, dark = 0, cellars = 0, crypts = 0, churches = 0, wallBad = 0, floorBad = 0, walkBad = 0;
  const cities = [];
  for (const [seed, size, style, extra] of [[12345, 224, 'medieval', {}], [31, 192, 'medieval', { hills: 3 }], [7, 192, 'modern', {}]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: style, ...extra });
    cities.push(r);
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    dark += r.stats.lighting.darkAfter;
    if (r.landmarks.some((l) => l.kind === 'church')) churches++;
    for (const room of r.rooms) {
      if (room.kind === 'cellar') cellars++; else crypts++;
      const b = room.box;
      // walls: the ring just outside the room's air, every height of the room
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (const z of [b.z0 - 1, b.z1 + 1]) if (!solid(w, x, y, z)) wallBad++;
        for (let z = b.z0; z <= b.z1; z++) for (const x of [b.x0 - 1, b.x1 + 1]) if (!solid(w, x, y, z)) wallBad++;
      }
      for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) if (!solid(w, x, room.floorY, z)) floorBad++;
      // the flight: from the entry, each step a block down onto a stair, two clear over it, the landing on the floor
      let [fx, fy, fz] = room.entry;
      if (w.has(fx, fy, fz) || w.has(fx, fy + 1, fz)) walkBad++;
      for (const [x, y, z] of room.steps) {
        if (!/stairs/.test(MATERIALS.def(w.get(x, y, z)).block)) walkBad++;
        if (w.has(x, y + 1, z) || w.has(x, y + 2, z)) walkBad++;
        if (fy - (y + 1) > 1) walkBad++;                    // never more than a block down
        fy = y + 1;
      }
      const [lx, ly, lz] = room.landing;
      if (!solid(w, lx, ly - 1, lz) || w.has(lx, ly, lz) || w.has(lx, ly + 1, lz) || fy - ly > 1) walkBad++;
    }
  }
  check('underground: every building walks through, every door reached; nothing dark (the rooms lit)', ok && dark === 0, `${dark} dark`);
  check('underground: cellars under houses', cellars >= 5, `${cellars}`);
  check('underground: a crypt under every cathedral', crypts === churches && churches > 0, `${crypts} crypts, ${churches} churches`);
  check('underground: every room walled in stone all round', wallBad === 0, `${wallBad}`);
  check('underground: every room floored', floorBad === 0, `${floorBad}`);
  check('underground: every flight walked down a step at a time, head room all the way, onto the floor', walkBad === 0, `${walkBad}`);
  // lit like a room, not only kept from spawning: torches on the walls, and the
  // floor lit on average to what a room indoors is lit to (8)
  {
    const { lightMap } = await import('../../engine/lighting.js');
    let unlit = 0, dim = 0, rooms = 0, low = 0;
    for (const r of cities) {
      const w = r.world, m = lightMap(w);
      for (const room of r.rooms) {
        rooms++;
        if (!room.lights) unlit++;
        // every lantern hung over head height: two clear under it, the floor below that
        for (let x = room.box.x0; x <= room.box.x1; x++) for (let z = room.box.z0; z <= room.box.z1; z++)
          if (w.get(x, room.box.y1, z) === MAT.LAMP_HANG && room.box.y1 - (room.floorY + 1) < 2) low++;
        const b = room.box; let n = 0, sum = 0;
        for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) { const y = room.floorY + 1; if (w.has(x, y, z)) continue; n++; sum += m.light[m.idx(x, y, z)]; }
        if (n && sum / n < 8) dim++;
      }
    }
    check('underground: every room has lanterns hung from its ceiling, over head height', rooms > 0 && unlit === 0 && low === 0, `${unlit} of ${rooms} without, ${low} low`);
    check('underground: every room lit like a room (its floor 8 on average)', dim === 0, `${dim} dim`);
    const { toJava } = await import('../../engine/java-blocks.js');
    const wt = toJava('minecraft:torch', { torch_facing_direction: 'east' }), st = toJava('minecraft:torch', { torch_facing_direction: 'top' });
    check('underground, Java: a wall torch is a wall_torch facing the same way, a standing one a torch', wt.name === 'minecraft:wall_torch' && wt.props.facing === 'east' && st.name === 'minecraft:torch' && !Object.keys(st.props).length);
  }
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
    check('underground: watertight, no opening from a room into the ground round it', gaps === 0, `${gaps} open faces`);
  }
  // the exports write the rooms as air
  {
    const { buildStructures } = await import('../../engine/export.js');
    const { javaTiles } = await import('../../engine/export-java.js');
    const { readJavaNbt } = await import('../../engine/javaworld.js');
    const { decodeNbt } = await import('../nbt-read.js');
    const r = cities[0], w = r.world;
    const want = new Set();
    for (const room of r.rooms) { const b = room.box; for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) if (!w.has(x, y, z)) want.add(`${x},${y},${z}`); }
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
    check('underground, Bedrock: every empty cell of every room written as air', want.size > 100 && bedrockAir === want.size, `${bedrockAir}/${want.size}`);
    let javaAir = 0;
    for (const t of javaTiles(w, { prefix: 'city', spawns: r.spawns })) {
      const root = readJavaNbt(t.nbt), pal = root.palette.map((q) => q.Name);
      for (const b of root.blocks) {
        if (pal[b.state] !== 'minecraft:air') continue;
        const k = `${w.box.x0 + t.offset[0] + b.pos[0]},${2 + t.offset[1] + b.pos[1]},${w.box.z0 + t.offset[2] + b.pos[2]}`;
        if (want.has(k)) javaAir++;
      }
    }
    check('underground, Java: the same cells listed as air', javaAir === want.size, `${javaAir}/${want.size}`);
  }
  // none when switched off, on stilts, or in the sky
  {
    const { LIGHT } = await import('./harness.js');
    const off = generateCity({ ...DEFAULTS, ...LIGHT, seed: 12345, size: 160, underground: false });
    const st = generateCity({ ...DEFAULTS, ...LIGHT, seed: 12345, size: 160, stilts: true });
    const fl = generateCity({ ...DEFAULTS, ...LIGHT, seed: 12345, size: 160, floating: true });
    check('underground: none when switched off, on stilts, or floating', [off, st, fl].every((r) => !r.rooms.length && !(r.world.airBoxes || []).length));
  }
  note(`underground: ${cellars} cellars and ${crypts} crypts over ${cities.length} cities`);
}
