// tools/checks/2zzzb-twelve-styles.js — twelve styles (0.74.0): Classical / Roman, Gothic,
// Nordic / Viking, Byzantine / Russian, Wild West, Victorian, Googie / retro-future, Copper
// city, Mushroom / fungal, Ice palace, Crystal / amethyst, Overgrown ruins (styles.js; their
// dresses in stylebits.js: DRESSES; city.js: the copper's ages, the frozen canal).
//
// - all twelve registered, offered in the page and in the Mix styles list;
// - each built in two cities (and all twelve in one, mixed): every building walks through,
//   every floor and door reached, nothing dark; every ordinary building in its style's dress;
// - Classical: quartz pillars up the corners, cornices, pediments over the doors, statues on
//   the roofs; Gothic: buttresses, pinnacles, rose windows of stained glass, spires;
//   Nordic: carved corner posts, dragons' heads on the ridges, turf (moss) on the roofs;
//   Byzantine: onion domes with gold at their tips, bands of colour; Wild West: false
//   fronts over the roofs, porch roofs, dirt streets, plank walks, four floors at most;
//   Victorian: bay windows, balconies, mansards; Googie: saucers, fins, neon;
//   Copper: all four ages of copper, the oldest in the middle, the newest at the edge,
//   lightning rods; Mushroom: caps over the buildings, mycelium for grass, the trees
//   mushrooms; Ice palace: ice pinnacles and spires, snow on the ground, the canal frozen
//   (open water by the boats); Crystal: amethyst clusters on the roofs; Ruins: stone aged,
//   vines, broken parapets, trees on the roofs;
// - nothing of any of it out from a wall lower than head height;
// - mixed: each style's dress in its own districts and no other;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzb';
export const label = '2zzzb. twelve more styles';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const NEW = ['classical', 'gothic', 'nordic', 'byzantine', 'western', 'victorian', 'googie', 'copper', 'mushroom', 'icepalace', 'crystal', 'ruins'];
  check('styles: all twelve registered, offered in the page and in the Mix styles list',
    NEW.every((n) => STYLE_NAMES.includes(n) && new RegExp(`<option value="${n}">`).test(html) && new RegExp(`class="mixStyle" value="${n}"`).test(html)));
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const cities = {};
  for (const st of NEW) cities[st] = [[224, 7], [160, 12345]].map(([size, seed]) => generateCity({ ...DEFAULTS, size, seed, cityStyle: st }));
  const mixed = generateCity({ ...DEFAULTS, size: 352, seed: 21, cityStyle: 'modern', mixStyles: true, mixList: NEW });
  const walk = (r) => { const v = verifyAll(r.world, r.buildings); return v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0; };
  const bad = NEW.filter((st) => !cities[st].every(walk));
  check('all twelve: every building walks through, every floor and door reached, nothing dark (and in a city of all twelve, mixed)', bad.length === 0 && walk(mixed), bad.join(', '));
  // every ordinary building in its dress; the dress's totals over both cities
  const tot = {}, undressed = [];
  for (const st of NEW) {
    tot[st] = {};
    for (const r of cities[st]) for (const b of r.buildings) {
      if (b.landmark) continue;
      if (!b.dress || b.dress.name !== STYLES[st].dress) { undressed.push(st); continue; }
      for (const [k, v] of Object.entries(b.dress)) if (typeof v === 'number') tot[st][k] = (tot[st][k] || 0) + v; else if (v && typeof v === 'object') tot[st][k] = (tot[st][k] || 0) + 1;
    }
  }
  check('all twelve: every ordinary building in its style\'s dress', undressed.length === 0, [...new Set(undressed)].join(', '));
  const count = (st, re) => { let n = 0; for (const r of cities[st]) r.world.forEach((x, y, z, id) => { if (re.test(MATERIALS.def(id).block)) n++; }); return n; };
  const T = tot;

  check('Classical: quartz pillars up the corners, cornices round the roofs, pediments over the doors, statues on the roofs',
    T.classical.pillars > 2000 && T.classical.cornice > 150 && T.classical.pediment > 100 && T.classical.statues > 60, JSON.stringify(T.classical));
  check('Gothic: buttresses, pinnacles on the roofs, rose windows of stained glass, spires on the towers',
    T.gothic.buttresses > 150 && T.gothic.pinnacles > 60 && T.gothic.rose > 150 && (T.gothic.spire || 0) >= 3, JSON.stringify(T.gothic));
  {
    let turf = 0;
    for (const r of cities.nordic) for (const b of r.buildings) if (!b.landmark && b.style === 'house') for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.roofY; y <= b.topY + 1; y++) if (blk(r.world, x, y, z) === 'moss_block') turf++;
    check('Nordic: carved posts up the corners, a dragon\'s head on the ends of the ridges, turf on the roofs', T.nordic.posts > 2000 && T.nordic.dragons > 100 && turf > 1000, `${JSON.stringify(T.nordic)}, turf ${turf}`);
  }
  {
    let tips = 0;
    for (const r of cities.byzantine) r.world.forEach((x, y, z, id) => { if (MATERIALS.def(id).block === 'minecraft:gold_block' && blk(r.world, x, y + 1, z) === 'iron_bars' && blk(r.world, x, y + 2, z) === 'iron_bars') tips++; });
    check('Byzantine: onion domes on the roofs, gold on their tips, bands of colour under the floors', T.byzantine.domes >= 15 && tips >= T.byzantine.domes && T.byzantine.band > 400, `${JSON.stringify(T.byzantine)}, ${tips} tips`);
  }
  {
    const tall = Math.max(...cities.western.flatMap((r) => r.buildings.filter((b) => !b.landmark).map((b) => b.floors)));
    const grass = count('western', /^minecraft:grass_block$/), dirt = count('western', /coarse_dirt|packed_mud/);
    check('Wild West: false fronts over the roofs (sign boards across them), porch roofs over the walks, dirt streets, four floors at most',
      T.western.front > 1500 && T.western.sign > 400 && T.western.porch > 400 && tall <= 4 && grass === 0 && dirt > 5000, `${JSON.stringify(T.western)}, tallest ${tall}, grass ${grass}, dirt ${dirt}`);
  }
  check('Victorian: bay windows on the fronts, balconies on the sides, mansards round the roofs', T.victorian.bays > 100 && T.victorian.balconies > 200 && T.victorian.mansard > 1000, JSON.stringify(T.victorian));
  check('Googie: flying saucers over the roofs, boomerang fins, neon over the doors', (T.googie.saucer || 0) >= 20 && T.googie.fins > 200 && T.googie.neon > 50, JSON.stringify(T.googie));
  {
    // the ages: every one in the city, the oldest nearer the middle than the newest
    const ages = { '': [], exposed_: [], weathered_: [], oxidized_: [] };
    const r = cities.copper[0], mx = r.plan.W / 2, mz = r.plan.D / 2;
    r.world.forEach((x, y, z, id) => {
      const m = MATERIALS.def(id).block.match(/^minecraft:waxed_(exposed_|weathered_|oxidized_)?(cut_)?copper(_stairs|_grate)?$/);
      if (m) ages[m[1] || ''].push(Math.hypot(x - mx, z - mz));
    });
    const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const all = Object.values(ages).every((a) => a.length > 50);
    check('Copper: every age of copper in the city, the oldest (green) in the middle and the newest at the edge; lightning rods on the roofs',
      all && mean(ages.oxidized_) < mean(ages['']) && T.copper.rods > 100, `${Object.entries(ages).map(([k, a]) => `${k || 'new'} ${a.length} at ${mean(a).toFixed(0)}`).join(', ')}, ${T.copper.rods} rods`);
  }
  {
    const grass = count('mushroom', /^minecraft:grass_block$/), myc = count('mushroom', /mycelium/), leaves = count('mushroom', /_leaves$/);
    check('Mushroom: a cap over every building, mycelium for grass, the trees great mushrooms', T.mushroom.cap > 20000 && grass === 0 && myc > 3000 && leaves === 0, `${JSON.stringify(T.mushroom)}, grass ${grass}, mycelium ${myc}, leaves ${leaves}`);
  }
  {
    const snow = count('icepalace', /snow_layer/);
    // the canal frozen, a city with one
    let frozen = 0, openByBoat = 0;
    const r = generateCity({ ...DEFAULTS, size: 224, seed: 7, cityStyle: 'icepalace', canal: true });
    const { USE_CANAL } = await import('../../engine/water.js');
    const boats = r.spawns.filter((p) => p.type === 'boat');
    for (let z = 0; z < r.plan.D; z++) for (let x = 0; x < r.plan.W; x++) {
      if (r.plan.use[z * r.plan.W + x] !== USE_CANAL) continue;
      for (let y = 12; y >= -10; y--) { const b = blk(r.world, x, y, z); if (b === 'air') continue; if (b === 'packed_ice' && blk(r.world, x, y - 1, z) === 'water') frozen++; break; }
    }
    for (const b of boats) { const k = blk(r.world, Math.floor(b.x), Math.floor(b.y) - 1, Math.floor(b.z)); if (k === 'water' || k === 'air') openByBoat++; }
    check('Ice palace: ice pinnacles on the roofs, spires on the towers, snow on the ground, the canal frozen over (open water by the boats)',
      T.icepalace.pinnacles > 100 && (T.icepalace.spire || 0) >= 3 && snow > 1000 && frozen > 100 && openByBoat === boats.length, `${JSON.stringify(T.icepalace)}, snow ${snow}, ${frozen} frozen, boats ${openByBoat}/${boats.length}`);
  }
  check('Crystal: clusters of amethyst on the roofs, crystal clusters on their tips', T.crystal.clusters > 100 && T.crystal.crystals > 800 && count('crystal', /amethyst_cluster/) > 150, JSON.stringify(T.crystal));
  check('Ruins: the stone aged (cracked and mossy), vines down the walls, parapets broken, trees on the roofs', T.ruins.aged > 8000 && T.ruins.vines > 600 && T.ruins.broken > 400 && (T.ruins.tree || 0) >= 15, JSON.stringify(T.ruins));

  // ---- the signature pieces (0.74.2): the amphitheatre, the aqueduct, the longships, the
  // railroad and its wooden water tower
  {
    const { USE_CANAL, WATER_LO, WATER_HI } = await import('../../engine/water.js');
    // Classical: an amphitheatre in each city (a sand arena, an arcade round it, its name), and
    // over the canal an aqueduct: piers standing in open water down to the bed, a deck three
    // wide, a trough of water shut in on every side but the sky; never a pier on a bridge
    let amph = 0, amphBad = [];
    for (const r of cities.classical) {
      const S = r.landmarks.find((l) => l.kind === 'stadium');
      if (!S) { amphBad.push('none'); continue; }
      const P = S.pitch, G0 = S.tunnel[0][1] - 1;
      let sand = 0, all = 0;
      for (let x = P.x0; x <= P.x1; x++) for (let z = P.z0; z <= P.z1; z++) { all++; if (/^(sand|lantern|sea_lantern|glowstone|shroomlight|.*froglight)$/.test(blk(r.world, x, G0, z))) sand++; }   // (sand, or a light the lighting set in it)
      const place = r.places.find((q) => q.kind === 'stadium');
      if (S.name === 'Amphitheatre' && sand >= all * 0.97 && S.arcade && S.arcade.piers > 20 && S.arcade.arches > 40 && place && place.name === 'Amphitheatre') amph++;
      else amphBad.push(`${S.name} ${sand}/${all} ${JSON.stringify(S.arcade)}`);
    }
    check('Classical: an amphitheatre in every city (an arena of sand, two storeys of arches round it, named so in Find a landmark)', amph === cities.classical.length, amphBad.join('; '));
    let runs = 0, piers = 0, aqBad = [];
    for (const r of cities.classical) for (const [i, A] of (r.aqueducts || []).entries()) {
      const cn = r.canals[i], mid = cn.ch0 + 1, G0 = 1;
      for (const run of A.runs) {
        runs++;
        const Y = (() => { const [x, z] = cn.cell(run.u0 + 1, mid); for (let y = 30; y > 0; y--) if (blk(r.world, x, y, z) === 'smooth_quartz') return y; return null; })();
        if (Y === null) { aqBad.push('no deck'); continue; }
        for (let u = run.u0; u <= run.u1; u++) {
          for (const a of [cn.ch0, mid, cn.ch1]) { const [x, z] = cn.cell(u, a); if (blk(r.world, x, Y, z) !== 'smooth_quartz') aqBad.push(`deck ${u}`); }
          const [x, z] = cn.cell(u, mid);
          const top = blk(r.world, x, Y + 1, z);
          if (u === run.u0 || u === run.u1) { if (top !== 'quartz_bricks') aqBad.push(`end ${u}`); }
          else {
            if (top !== 'water') aqBad.push(`trough ${u}`);
            for (const a of [cn.ch0, cn.ch1]) { const [sx, sz] = cn.cell(u, a); if (blk(r.world, sx, Y + 1, sz) !== 'quartz_bricks') aqBad.push(`wall ${u}`); }
          }
        }
      }
      for (const [x, z] of A.piers) {
        piers++;
        if (r.plan.use[z * r.plan.W + x] !== USE_CANAL) aqBad.push(`pier on ${x},${z}`);
        for (let y = WATER_LO; y <= WATER_HI; y++) if (blk(r.world, x, y, z) !== 'polished_diorite') { aqBad.push(`pier ${x},${z} at ${y}`); break; }
      }
      void G0;
    }
    check('Classical: an aqueduct along the canal, high over it: piers in open water to the bed (never on a bridge), a deck three wide, a trough of water walled in', runs >= 2 && piers >= 15 && aqBad.length === 0, `${runs} runs, ${piers} piers; ${aqBad.slice(0, 4).join(', ')}`);
    // Nordic: longships in the harbour's basin, shields along their sides, a dragon at the prow,
    // a striped sail; every boat left moored on open water, none inside a ship
    let ships = 0, shipBad = [];
    for (const r of cities.nordic) {
      for (const S of r.longships || []) {
        ships++;
        const [x, y, z] = S.at;
        let shields = 0, sail = 0;
        for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
          if (/_wool$/.test(blk(r.world, x + dx, y + 1, z + dz))) shields++;
          for (let dy = 3; dy <= 7; dy++) if (/_wool$/.test(blk(r.world, x + dx, y + dy, z + dz))) sail++;
        }
        const head = blk(r.world, S.prow[0], y + 4, S.prow[1]);
        if (shields < 6 || sail < 10 || head !== 'dark_oak_stairs' || blk(r.world, x, y + 8, z) !== 'stripped_spruce_log') shipBad.push(`${shields} shields, ${sail} sail, head ${head}`);
      }
      for (const b of r.spawns.filter((p) => p.type === 'boat')) {
        const bx = Math.floor(b.x), bz = Math.floor(b.z), by = Math.floor(b.y);
        if (blk(r.world, bx, by, bz) !== 'water' || r.world.has(bx, by + 1, bz)) shipBad.push(`boat at ${bx},${bz}`);
      }
    }
    check('Nordic: longships in the harbour (shields along the sides, a dragon at the prow, a striped sail on the mast); every boat still on open water', ships >= 2 && shipBad.length === 0, `${ships} ships; ${shipBad.slice(0, 3).join('; ')}`);
    // Wild West: the railroad (the railway on) and its water tower in wood
    let wood = 0, rail = 0;
    for (const r of cities.western) {
      if (r.cfg.transit === 'rails' && r.transit && r.transit.lines.length > 5) rail++;
      const T = r.landmarks.find((l) => l.kind === 'watertower');
      if (T && T.wooden && T.legs.every(([x, y, z]) => blk(r.world, x, y, z) === 'stripped_spruce_log') && T.water.length > 20) wood++;
    }
    check('Wild West: a railroad through town, and a wooden water tower (spruce legs, a tank of staves) full of water', rail === cities.western.length && wood === cities.western.length, `${rail} railroads, ${wood} wooden towers`);
  }

  // nothing of any dress out from a wall lower than head height: no block of a dress's kinds
  // at street level just outside an ordinary building's walls, but what was there before
  {
    // (the blocks only a dress puts outside a wall; on the street side, not in another building)
    const DRESSY = /deepslate_brick_wall|spruce_slab|dark_oak_slab|^vine$|chiseled_quartz|smooth_quartz$|blue_ice|amethyst_cluster|deepslate_bricks/;
    let low = 0;
    for (const st of NEW) for (const r of cities[st]) {
      const inside = new Set();
      for (const b of r.buildings) for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) inside.add(x + ',' + z);
      for (const b of r.buildings) {
        if (b.landmark) continue;
        const q = b.rects[0], gy = b.groundY;
        for (let x = q.x0 - 1; x <= q.x1 + 1; x++) for (let z = q.z0 - 1; z <= q.z1 + 1; z++) {
          if (inside.has(x + ',' + z)) continue;
          for (const y of [gy + 1, gy + 2]) if (DRESSY.test(blk(r.world, x, y, z))) low++;
        }
      }
    }
    check('no dress out from a wall lower than head height', low === 0, `${low}`);
  }

  // ---- mixed
  {
    const by = {};
    for (const b of mixed.buildings) {
      if (b.landmark) continue;
      const lot = mixed.plan.lots.find((l) => b.x0 >= l.x0 - 1 && b.x1 <= l.x1 + 1 && b.z0 >= l.z0 - 1 && b.z1 <= l.z1 + 1 && l.district);
      if (!lot) continue;
      const k = lot.district;
      by[k] = by[k] || { n: 0, wrong: 0 };
      by[k].n++;
      if (!b.dress || b.dress.name !== STYLES[k].dress) by[k].wrong++;
    }
    const seen = NEW.filter((k) => by[k] && by[k].n > 0);
    check('mixed: each style in its own districts, in its own dress and no other', seen.length >= 8 && Object.values(by).every((q) => q.wrong === 0), `${seen.length} of 12 seen; ${JSON.stringify(by)}`);
  }

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const st of NEW) for (const s of buildStructures(cities[st][1].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states (walls, waxed copper, mushroom blocks, amethyst)', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`styles: ${NEW.map((st) => `${st} ${cities[st].map((r) => r.buildings.length).join('/')}`).join('; ')}`);
}
