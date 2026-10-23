// tools/checks/2zzzj-maproom-board.js — the map room and the find-a-landmark board (maproom.js,
// findboard.js; 0.81.0).
//
// In four cities (one on hills, one with the big landmarks too):
// - the map room: built, roofed, its doors open three wide; on its floor the city, every cell of
//   the map the block of the kind it says it is, square, at the scale that fits; the cell over
//   the map room itself red (you are here), the town hall's gold, water where the city has a
//   canal; a key on four signs and more; walked from the street through the doors, up the steps
//   to the gallery, round it to the key on the back wall, and down onto the map; every spot a mob
//   could spawn on, inside and out, lit;
// - the board: by the centre monument, a sign for every place the city lists (every goto_ the
//   pack has), naming its function; under each a button on a command block whose command runs
//   that very goto_ for the player who pressed it; in the pack the command names the pack; the
//   ground before every button stood on; the guide telling of both;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzj';
export const label = '2zzzj. the map room and the find-a-landmark board';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { MAP_KEY, MAPROOM } = await import('../../engine/maproom.js');
  const { lightMap, spawnSpots } = await import('../../engine/lighting.js');
  const ex = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');

  check('defaults: no map room and no board unless asked', DEFAULTS.mapRoom === false && DEFAULTS.findBoard === false);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), mainJs = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('offered in the page (and remembered with the settings)', /id="mapRoom"/.test(html) && /id="findBoard"/.test(html) && /'mapRoom', 'findBoard'/.test(mainJs));
  const L = { furnish: false, villagers: 0, fish: false, mapRoom: true, findBoard: true };
  const cities = [
    ['192', generateCity({ ...DEFAULTS, ...L, size: 192, seed: 7 })],
    ['256 on hills', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 11, hills: 3 })],
    ['160 medieval', generateCity({ ...DEFAULTS, ...L, size: 160, seed: 3, cityStyle: 'medieval' })],
    ['384 with the big landmarks', generateCity({ ...DEFAULTS, ...L, size: 384, seed: 5, jail: true, zoo: true, museum: true, mall: true })],
  ];
  const blkOf = (w) => (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const pass = (b) => b === 'air' || /sign|button|lantern|torch|carpet|flower|short_grass/.test(b) && !/sea_lantern/.test(b);
  const floor = (b) => b !== 'air' && !pass(b) && !/fence|bars|water|lava/.test(b);
  const walk = (w, start, box) => {
    const blk = blkOf(w), key = (p) => p.join(',');
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && floor(blk(x, y - 1, z));
    let s0 = null; for (let d = -2; d <= 4 && !s0; d++) if (stand(start[0], start[1] + d, start[2])) s0 = [start[0], start[1] + d, start[2]];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    while (q.length && seen.size < 300000) {
      const [a, b, c] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1, -2]) {
        const n = [a + dx, b + dy, c + dz];
        if (seen.has(key(n)) || n[0] < box.x0 || n[0] > box.x1 || n[2] < box.z0 || n[2] > box.z1 || !stand(...n)) continue;
        if (dy === 1 && !pass(blk(a, b + 2, c))) continue;
        if (dy < 0 && !pass(blk(n[0], b, n[2]))) continue;                  // (stepping down: room over the edge)
        seen.add(key(n)); q.push(n);
      }
    }
    return seen;
  };
  const res = cities.map(([n, r]) => {
    const w = r.world, blk = blkOf(w), out = { n };
    const MR = r.landmarks.find((q) => q.kind === 'maproom'), CM = r.cityMap;
    out.built = !!MR && !!CM;
    if (!out.built) return out;
    // the map: every cell the block of its kind; square; the scale that fits
    const [ox, y, oz] = CM.origin;
    out.cells = CM.cells.length === CM.size[0] * CM.size[1] && CM.size[0] === CM.size[1] && CM.cells.every((c) => blk(c.x, y, c.z) === MAP_KEY[c.kind][0]);
    const M = MR.map;
    out.fits = CM.size[0] <= M.x1 - M.x0 + 1 && CM.size[1] <= M.z1 - M.z0 + 1 && Math.ceil(r.plan.W / CM.scale) === CM.size[0];
    const cellAt = (x, z) => CM.cells.find((c) => c.x === ox + Math.floor(x / CM.scale) && c.z === oz + Math.floor(z / CM.scale));
    const here = cellAt((MR.lot.x0 + MR.lot.x1) >> 1, (MR.lot.z0 + MR.lot.z1) >> 1);
    const TH = r.landmarks.find((q) => q.kind === 'townhall'), hall = TH && cellAt((TH.lot.x0 + TH.lot.x1) >> 1, (TH.lot.z0 + TH.lot.z1) >> 1);
    out.here = !!here && here.kind === 'here' && (!hall || hall.kind === 'hall' || hall.kind === 'here');
    out.water = !r.canal || CM.cells.some((c) => c.kind === 'water');
    const lift = y - MR.floorY;                                            // (the lot's rise on hills: its records are from before)
    out.key = MR.key.length >= 4 && MR.key.every((p) => /wall_sign/.test(blk(p[0], p[1] + lift, p[2])));
    // roofed; the doors open
    let open = 0;
    for (let x = MR.lot.x0; x <= MR.lot.x1; x++) for (let z = MR.lot.z0; z <= MR.lot.z1; z++) if (blk(x, MR.floorY + MAPROOM.H + 1 + (y - MR.floorY), z) === 'air') open++;
    out.roofed = open === 0 && MR.door.every((p) => pass(blk(p[0], y + 1, p[2])) && pass(blk(p[0], y + 2, p[2])));
    // walked: street → doors → steps → gallery → the key; and the map stood on
    const PL = r.places.find((p) => p.kind === 'maproom');
    const box = { x0: MR.lot.x0 - 12, x1: MR.lot.x1 + 12, z0: MR.lot.z0 - 12, z1: MR.lot.z1 + 12 };
    const seen = walk(w, PL.at, box);
    const near = (p, r0 = 1) => [...seen].some((k) => { const [a, b, c] = k.split(',').map(Number); return Math.abs(a - p[0]) + Math.abs(c - p[2]) <= r0 && Math.abs(b - p[1]) <= 1; });
    const gy = y - MR.floorY + MR.gallery;
    out.walk = { start: seen.size > 0, door: MR.door.every((p) => near([p[0], y + 1, p[2]], 0)), top: near([MR.steps[MR.steps.length - 1][0], gy + 1, MR.steps[MR.steps.length - 1][2]], 1),
      key: MR.key.every((p) => near([p[0], gy + 1, p[2]], 1)), map: seen.has([CM.cells[Math.floor(CM.cells.length / 2)].x, y + 1, CM.cells[Math.floor(CM.cells.length / 2)].z].join(',')) };
    const map = lightMap(w);
    out.dark = spawnSpots(w, map, (x, z) => x >= MR.lot.x0 && x <= MR.lot.x1 && z >= MR.lot.z0 && z <= MR.lot.z1).filter((p) => p[3] === 0).length;
    // ---- the board
    const B = r.findBoard;
    out.board = !!B;
    if (B) {
      const why = [];
      const listed = r.places.filter((p) => p.kind !== 'findboard');
      if (B.entries.length !== listed.length) why.push(`${B.entries.length} of ${listed.length}`);
      // (0.81.1) the board a place of its own (goto_findboard), its visit before it; a sign by the
      // monument saying which way it is, where it stands further off
      const me = r.places.find((p) => p.kind === 'findboard');
      if (!me || Math.abs(me.at[0] - B.rect.x0) + Math.abs(me.at[2] - B.rect.z0) > 12) why.push('its place');
      if (Math.abs(B.rect.x0 - r.centre.stand[0]) + Math.abs(B.rect.z0 - r.centre.stand[2]) > 10 && !(B.pointer && /standing_sign/.test(blk(...B.pointer)))) why.push('pointer');
      // (0.82.0) joined to the monument where it can be: its first column beside a diamond block
      if (B.joined) { const d = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => [1, 2, 3].some((dy) => blk(x + a, B.ground + dy, z + b) === 'diamond_block'));
        if (![[B.rect.x0, B.rect.z0], [B.rect.x1, B.rect.z1], [B.rect.x0, B.rect.z1], [B.rect.x1, B.rect.z0]].some(([x, z]) => d(x, z))) why.push('not joined'); }
      for (const e of B.entries) {
        const sd = JSON.stringify(w.getData(...e.sign) || {}, (k, v) => (typeof v === 'bigint' ? String(v) : v));
        if (!/wall_sign/.test(blk(...e.sign)) || !sd.includes('goto_' + e.id)) why.push('sign ' + e.id);
        if (blk(...e.button) !== 'stone_button') why.push('button');
        const cmd = (w.getData(...e.command) || { tags: { Command: { v: '' } } }).tags.Command.v;
        if (blk(...e.command) !== 'command_block' || cmd !== `execute as @p[r=6] run function {ns}/goto_${e.id}`) why.push('command ' + e.id);
        if (Math.abs(e.button[0] - e.command[0]) + Math.abs(e.button[2] - e.command[2]) !== 1 || e.button[1] !== e.command[1]) why.push('button on its block');
        if (!floor(blk(e.button[0], B.ground, e.button[2])) || !pass(blk(e.button[0], B.ground + 1, e.button[2])) && blk(e.button[0], B.ground + 1, e.button[2]) !== 'stone_button') why.push('stand');
      }
      const [cx, , cz] = r.centre.stand;
      if (Math.abs(B.rect.x0 - cx) + Math.abs(B.rect.z0 - cz) > 200) why.push('far');
      out.boardBad = why;
    }
    return out;
  });
  const all = (f) => res.every(f);
  const say = (f) => res.map((t) => `${t.n}: ${JSON.stringify(f(t))}`).join(' | ');
  check('the map room built in every city, roofed, its doors open', all((t) => t.built && t.roofed), say((t) => [t.built, t.roofed]));
  check('on its floor the city: every cell the block of what it shows, square, at the scale that fits', all((t) => t.cells && t.fits), say((t) => [t.cells, t.fits]));
  check('the map room\'s own cell red (you are here), the town hall\'s gold; water drawn where the city has a canal; the key on signs', all((t) => t.here && t.water && t.key), say((t) => [t.here, t.water, t.key]));
  check('walked from the street through the doors, up the steps to the gallery, round it to the key, and onto the map', all((t) => Object.values(t.walk).every(Boolean)), say((t) => t.walk));
  check('every spot a mob could spawn on, in the map room and round it, lit', all((t) => t.dark === 0), say((t) => t.dark));
  check('the board by the centre monument (joined to it where a side has room): a sign for every place (naming its goto_), a button under each on a command block running that goto_ for the one who pressed it, ground before it', all((t) => t.board && t.boardBad.length === 0), say((t) => t.boardBad));
  // ---- the pack
  {
    const r = cities[0][1];
    const opts = { namespace: 'chk', prefix: 'c', spawns: r.spawns, places: r.places, centre: r.world.centre, world: r.world };
    const fns = ex.functionFiles(ex.tileList(r.world, opts), r.world, opts);
    const gotos = r.findBoard.entries.every((e) => fns.some((f) => f.fn === `chk/goto_${e.id}`)) && fns.some((f) => f.fn === 'chk/goto_findboard');
    const named = ex.buildStructures(r.world, { namespace: 'chk' }).some((s) => JSON.stringify(decodeNbt(s.data).root, (k, v) => (typeof v === 'bigint' ? String(v) : v)).includes('function chk/goto_'));
    const guide = ex.placementGuide(ex.tileList(r.world, opts), opts);
    check('in the pack: every button\'s goto_ a function the pack has, its command naming the pack; the guide telling of the map room and the board', gotos && named && /THE MAP ROOM/.test(guide) && /FIND A LANDMARK IN THE GAME/.test(guide), `${gotos} ${named}`);
  }
  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const s of ex.buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
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
  check('the board joined to the monument in every city: the two one thing (0.82.1)', res.filter((t) => cities.find(([n]) => n === t.n)[1].findBoard && cities.find(([n]) => n === t.n)[1].findBoard.joined).length === cities.length, res.map((t) => `${t.n}: ${(cities.find(([n]) => n === t.n)[1].findBoard || {}).joined}`).join(', '));
  // (0.82.1) the monument and the board one thing: in a run of cities of every size, every board joined
  {
    const runs = [[96, 1], [128, 2], [160, 3], [224, 5], [256, 6], [320, 7], [448, 9], [192, 12]].map(([size, seed]) => {
      const r = generateCity({ ...DEFAULTS, size, seed, findBoard: true, furnish: false, villagers: 0, mixStyles: seed % 2 === 0 });
      const B = r.findBoard, blk = blkOf(r.world);
      const touch = B && [[B.rect.x0, B.rect.z0], [B.rect.x1, B.rect.z1], [B.rect.x0, B.rect.z1], [B.rect.x1, B.rect.z0]].some(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => [1, 2, 3].some((dy) => blk(x + a, B.ground + dy, z + b) === 'diamond_block')));
      return [`${size}/${seed}`, !!B && B.joined && touch && B.entries.length === r.places.filter((p) => p.kind !== 'findboard').length];
    });
    check('in eight cities of every size, the board joined to the monument\'s diamond, every place on it', runs.every(([, ok]) => ok), runs.filter(([, ok]) => !ok).map(([n]) => n).join(', '));
  }
  note(res.map((t) => `${t.n}: map ${t.built ? cities.find(([n]) => n === t.n)[1].cityMap.size.join('x') : '-'}, board ${t.board}`).join('; '));
}
