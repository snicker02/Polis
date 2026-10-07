// tools/checks/2zzb-museum.js — the museum (museum.js): its rooms and exhibits.
//
// Built into the world and looked at there: the skeleton's bones, every mineral in
// its case under glass, every relic in its frame, every painting on clear wall with
// solid wall behind it, every armour stand on a floor in the open, and every room
// (the hall, the fossils, the minerals, the armour) reached on foot from the street.
// On a wide lot (nineteen across), a narrow one (fifteen) and a player's own fitted
// city. The pack: populate (and museum) summon every stand and dress it, standard
// item names only; every block the museum writes one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzb';
export const label = '2zzb. the museum';

let MATERIALS;

function inspectMuseum(r) {
  const M = r.landmarks.find((L) => L.kind === 'museum');
  if (!M) return { built: false };
  const w = r.world, fr = M.frame;
  const blk = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const solid = (b) => !['air', 'water', 'lantern', 'short_grass'].includes(b) && !/sign|carpet|rail|frame/.test(b);
  // the building's lift: its floor under the hall's middle
  const [hx, hz] = fr.at(fr.MID, 5); let lift = 0; for (let d = -3; d <= 6; d++) if (blk(hx, M.door[1] - 1 + d, hz) === 'smooth_stone' && blk(hx, M.door[1] + d, hz) === 'air') { lift = d; break; }
  const out = { built: true, lift, problems: [] };
  out.bonesOk = M.bones.every(([x, y, z]) => blk(x, y + lift, z) === 'bone_block');
  out.casesOk = M.cases.every((c) => blk(c.x, c.y + lift, c.z) === c.block.replace('minecraft:', '') && blk(c.x, c.y + lift + 1, c.z) === 'glass');
  out.framesOk = M.frames.every((f) => blk(f.x, f.y + lift, f.z) === 'frame');
  out.standsOk = M.stands.every((s) => blk(Math.floor(s.x), s.y, Math.floor(s.z)) === 'air' && solid(blk(Math.floor(s.x), s.y - 1, Math.floor(s.z))));
  out.bones = M.bones.filter(([x, y, z]) => blk(x, y + lift, z) === 'bone_block').length + ' of ' + M.bones.length;
  out.cases = M.cases.filter((c) => blk(c.x, c.y + lift, c.z) === c.block.replace('minecraft:', '') && blk(c.x, c.y + lift + 1, c.z) === 'glass' && blk(c.x, c.y + lift - 1, c.z) === 'quartz_pillar').length + ' of ' + M.cases.length;
  out.frames = M.frames.filter((f) => { const d = w.getData ? w.getData(f.x, f.y + lift, f.z) : null; return blk(f.x, f.y + lift, f.z) === 'frame' && (!w.getData || (d && d.id === 'ItemFrame')); }).length + ' of ' + M.frames.length;
  let badPaint = 0;
  for (const p of M.paintings) for (const k of p.cells) { const [x, y, z] = k.split(',').map(Number); if (blk(x, y, z) !== 'air') badPaint++; }
  let noWall = 0;
  for (const p of M.paintings) for (const k of p.cells) { const [x, y, z] = k.split(',').map(Number); const bx = Math.round(p.x === x ? x : x), dirs = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] }[p.direction]; if (!solid(blk(x - dirs[0], y, z - dirs[1]))) noWall++; }
  out.paintings = `${M.paintings.length} hung, ${badPaint} cells not clear`;
  out.paintBad = badPaint + noWall; out.paintCount = M.paintings.length;
  out.stands = M.stands.filter((s) => blk(Math.floor(s.x), s.y, Math.floor(s.z)) === 'air' && solid(blk(Math.floor(s.x), s.y - 1, Math.floor(s.z)))).length + ' of ' + M.stands.length;
  // visitors: from the street, every room's middle reached on foot
  const [dx0, dy0, dz0] = [M.door[0], M.door[1] + lift, M.door[2]];
  const stand = (x, y, z) => { const b = blk(x, y, z), a = blk(x, y + 1, z), u = blk(x, y - 1, z); return (b === 'air' || /sign|carpet|lantern/.test(b)) && (a === 'air' || /lantern|frame/.test(a)) && solid(u); };
  const walk = new Set([dx0 + ',' + dy0 + ',' + dz0]), q = [[dx0, dy0, dz0]];
  while (q.length && walk.size < 40000) { const [a, b, c] = q.pop(); for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const x = a + ddx, y = b + dy, z = c + ddz, k = x + ',' + y + ',' + z; if (walk.has(k) || !stand(x, y, z)) continue; walk.add(k); q.push([x, y, z]); } }
  const reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(x + ',' + (M.door[1] + lift) + ',' + z); };
  out.wide = M.wide;
  out.rooms = { hall: reach(fr.leftC, 5), fossils: reach(fr.MID - 1, 15), minerals: reach(fr.rightC - 1, 12), armour: reach(fr.rightC, 19) };
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures, functionFiles } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { MINERALS, RELICS, ARMOUR, ARMOUR_SLOTS } = await import('../../engine/museum.js');
  const L = { furnish: false, villagers: 0, fish: false };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, museum: true })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345, museum: true })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, museum: true, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no museum unless asked', DEFAULTS.museum === false);
  const ts = cities.map(([n, r]) => [n, r, inspectMuseum(r)]);
  const built = ts.filter(([, , t]) => t.built);
  check('museum: built when asked, on a wide lot, a narrow one and a fitted city', built.length === cities.length && new Set(built.map(([, r]) => r.landmarks.find((Lm) => Lm.kind === 'museum').wide)).size === 2, built.map(([n, r]) => `${n}: ${r.landmarks.find((Lm) => Lm.kind === 'museum').wide}`).join(', '));
  check('museum: the skeleton, every mineral in its case under glass, every relic in its frame', built.every(([, , t]) => t.bonesOk && t.casesOk && t.framesOk), built.map(([n, , t]) => `${n}: ${t.bones} bones, ${t.cases} cases, ${t.frames} frames`).join('; '));
  check('museum: every painting on clear wall, solid wall behind every block of it', built.every(([, , t]) => t.paintCount >= 3 && t.paintBad === 0), built.map(([n, , t]) => `${n}: ${t.paintings}`).join('; '));
  check('museum: every armour stand on a floor, in the open', built.every(([, , t]) => t.standsOk));
  check('museum: every room reached on foot from the street (hall, fossils, minerals, armour)', built.every(([, , t]) => Object.values(t.rooms).every(Boolean)), built.map(([n, , t]) => `${n}: ${JSON.stringify(t.rooms)}`).join('; '));
  {
    const M = built[1] ? built[1][1].landmarks.find((Lm) => Lm.kind === 'museum') : null;
    check('museum: every mineral, every relic, every suit of armour in it', M && new Set(M.cases.map((c) => c.block)).size === MINERALS.length && new Set(M.frames.map((f) => f.item)).size === RELICS.length && new Set(M.stands.map((s) => s.set)).size === ARMOUR.length);
  }
  // the pack: every stand summoned and dressed, standard item names only; the museum's own functions
  {
    const r = built[0][1], w = r.world;
    const structs = buildStructures(w, {});
    const fns = functionFiles(structs, w, { namespace: 'test', spawns: r.spawns, stands: r.stands });
    const pop = fns.find((f) => f.fn === 'test/populate').text.split('\n');
    const items = new Set(ARMOUR.flatMap((a) => ARMOUR_SLOTS.map(([, p]) => `minecraft:${a}_${p}`)));
    const summons = pop.filter((l) => /^summon minecraft:armor_stand \S+ \S+ \S+ -?\d+ 0$/.test(l)).length;
    const dressed = pop.filter((l) => /^replaceitem entity @e\[type=minecraft:armor_stand,[^\]]+\] slot\.armor\.(head|chest|legs|feet) 0 (\S+)$/.test(l));
    const odd = dressed.filter((l) => !items.has(l.split(' ').pop()));
    check('museum: populate summons every stand and dresses it, head to feet, standard item names only', summons === r.stands.length && dressed.length === r.stands.length * 4 && odd.length === 0, `${summons} stands, ${dressed.length} pieces, ${odd.length} odd`);
    check('museum: its own functions (museum, museum_centered) to dress them again', !!fns.find((f) => f.fn === 'test/museum') && !!fns.find((f) => f.fn === 'test/museum_centered'));
    // every block it writes one of Bedrock's own states
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of structs) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('museum: every block it writes is one of Bedrock\'s own states (frames, bone, minerals)', bad.size === 0, [...bad].slice(0, 4).join(', '));
    note(`museum: ${built.map(([n, r]) => { const M = r.landmarks.find((Lm) => Lm.kind === 'museum'); return `${n} ${M.wide} wide`; }).join(', ')}`);
  }
}
