// tools/checks/2zq-stilts.js — a city on stilts over open water.
//
// Under the streets and buildings: a gravel seabed, water up to the canal's
// level, two blocks of air under the deck, timber piles holding it up. Parks,
// farms and ranches stay islands of soil, the edge stands on a seawall, sea
// lanterns in the seabed light the water. Above the deck the city is the city
// it was (but for gravel ballast over the gap, made stone so it cannot fall),
// every building walks through, and nothing is left dark.

export const id = '2zq';
export const label = '2zq. on stilts over open water';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT } = await import('../../engine/materials.js');
  const { USE } = await import('../../engine/plan.js');
  const { WATER_HI, USE_CANAL } = await import('../../engine/water.js');
  const G = 1;

  check('defaults: on solid ground unless asked', DEFAULTS.stilts === false);
  let same = true, ok = true, dark = 0, waterBad = 0, gapBad = 0, pileBad = 0, islandBad = 0, wallBad = 0, lanterns = 0, opens = 0;
  for (const [seed, size, style] of [[7, 160, 'modern'], [12345, 192, 'venetian']]) {
    const base = { ...DEFAULTS, seed, size, cityStyle: style, hills: 0 };
    // above the deck: the same city
    // (no cellars on either side: a stilt city has no ground to dig, so the one on
    // solid ground would differ by its cellar stairs and the floor kept for them)
    const a = generateCity({ ...base, lightAll: false, underground: false }), b = generateCity({ ...base, lightAll: false, underground: false, stilts: true });
    const ma = new Map(); a.world.forEach((x, y, z, id) => { if (y >= G) ma.set(x + ',' + y + ',' + z, id); });
    b.world.forEach((x, y, z, id) => {
      if (y < G) return;
      const k = x + ',' + y + ',' + z, was = ma.get(k);
      if (was !== id && !(was === MAT.GRAVEL && id === MAT.BASE && y === G)) same = false;
      ma.delete(k);
    });
    if (ma.size) same = false;
    // the full city
    const r = generateCity({ ...base, stilts: true });
    const w = r.world, { W, D, use, mask } = r.plan, BED = r.stilts.BED;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    dark += r.stats.lighting.darkAfter;
    const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
    const island = new Set();
    for (const l of r.plan.lots) if (l.kind === USE.PARK || l.island) for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) island.add(x + ',' + z);
    for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
      if (!inCity(x, z)) continue;
      let edge = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inCity(x + dx, z + dz)) edge = true;
      const surf = w.get(x, G, z), canal = use[z * W + x] === USE_CANAL;
      if (edge) { for (let y = BED; y < G; y++) if (!w.has(x, y, z)) { wallBad++; break; } continue; }
      if (island.has(x + ',' + z)) { for (let y = BED; y < G; y++) if (!w.has(x, y, z) || w.get(x, y, z) === MAT.WATER) { islandBad++; break; } continue; }
      if (w.get(x, BED, z) === MAT.LANTERN) lanterns++;
      if (!w.has(x, WATER_HI, z) || w.get(x, WATER_HI, z) === MAT.BASE) continue;   // a column kept solid (a fountain)
      const pile = w.get(x, WATER_HI, z) === MAT.DARK_FRAME;
      if (pile) { for (let y = BED + 1; y < G; y++) if (w.get(x, y, z) !== MAT.DARK_FRAME) { pileBad++; break; } continue; }
      if (w.get(x, WATER_HI, z) !== MAT.WATER) continue;                            // a dock's steps, kept
      opens++;
      for (let y = BED + 1; y <= WATER_HI; y++) if (w.get(x, y, z) !== MAT.WATER && w.get(x, y, z) !== MAT.DARK_FRAME) { waterBad++; break; }
      if (!canal) for (let y = WATER_HI + 1; y < G; y++) if (w.has(x, y, z)) { gapBad++; break; }
      // piles where they belong: every four under the streets
      if (!canal && x % 4 === 0 && z % 4 === 0) pileBad++;
    }
  }
  check('stilts: above the deck the city is the city it was (gravel over the gap made stone)', same);
  check('stilts: every building walks through, every floor and door reached; nothing left dark', ok && dark === 0, `${dark} dark`);
  check('stilts: open water under the streets, from the seabed up to the canal\'s level', opens > 5000 && waterBad === 0, `${opens} open columns, ${waterBad} bad`);
  check('stilts: two blocks of air under the deck (room for a boat)', gapBad === 0, `${gapBad}`);
  check('stilts: timber piles every four blocks under the streets, from the seabed to the deck', pileBad === 0, `${pileBad}`);
  check('stilts: parks, farms and ranches stand on islands of soil', islandBad === 0, `${islandBad}`);
  check('stilts: the edge stands on a seawall (the water stays in)', wallBad === 0, `${wallBad}`);
  check('stilts: sea lanterns in the seabed light the water', lanterns > 100, `${lanterns}`);
  // the foundation, on stilts: the piles go on down, islands and seawall are
  // founded, open water is left alone (Bedrock: nothing written; Java: nothing listed)
  {
    const { buildStructures } = await import('../../engine/export.js');
    const { javaTiles } = await import('../../engine/export-java.js');
    const { readJavaNbt } = await import('../../engine/javaworld.js');
    const { decodeNbt } = await import('../nbt-read.js');
    const r = generateCity({ ...DEFAULTS, seed: 7, size: 128, stilts: true });
    const w = r.world, { W, D, kind } = w.stiltGrid, y0 = w.box.y0, F = 6;
    let bad = 0, piles = 0, solid = 0, left = 0;
    const judge = (wx, wy, wz, name) => {
      if (wy >= y0 || wx < 0 || wz < 0 || wx >= W || wz >= D) return;
      const k = kind[wz * W + wx];
      if (k === 1) { if (name) bad++; else left++; }
      if (k === 2) { if (name === 'minecraft:dark_oak_log') piles++; else bad++; }
      if (k === 3) { if (name === 'minecraft:stone') solid++; else bad++; }
    };
    for (const st of buildStructures(w, { foundation: F })) {
      const root = decodeNbt(st.data).root, bi = root.structure.block_indices[0], pal = root.structure.palette.default.block_palette;
      const sy = root.size[1], sz = root.size[2], [ox, oy, oz] = st.offset;
      for (let i = 0; i < bi.length; i++) {
        const z = i % sz, y = Math.floor(i / sz) % sy, x = Math.floor(i / (sy * sz));
        judge(ox + x, oy + y, oz + z, bi[i] === -1 ? null : pal[bi[i]].name);
      }
    }
    check('stilts, Bedrock foundation: the piles go on down, islands and seawall founded, open water left alone', bad === 0 && piles > 1000 && solid > 1000 && left > 1000, `${piles} pile, ${solid} solid, ${left} left alone, ${bad} wrong`);
    let jbad = 0, jp = 0;
    for (const t of javaTiles(w, { prefix: 'city', spawns: r.spawns, fillAir: true, foundation: F })) {
      const root = readJavaNbt(t.nbt), pal = root.palette.map((q) => q.Name);
      for (const b of root.blocks) {
        const wx = w.box.x0 + t.offset[0] + b.pos[0], wy = 2 + t.offset[1] + b.pos[1], wz = w.box.z0 + t.offset[2] + b.pos[2];
        if (wy >= y0 || wx < 0 || wz < 0 || wx >= W || wz >= D) continue;
        const k = kind[wz * W + wx], n = pal[b.state];
        if (k === 1 || (k === 2 && n !== 'minecraft:dark_oak_log') || (k === 3 && n !== 'minecraft:stone')) jbad++;
        if (k === 2) jp++;
      }
    }
    check('stilts, Java foundation: the same', jbad === 0 && jp === piles, `${jp} pile, ${jbad} wrong`);
  }
  note(`stilts: ${opens} open columns, ${lanterns} seabed lanterns`);
}
