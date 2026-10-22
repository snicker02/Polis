// tools/checks/2zzzd-bridge-link.js — a link between two free bridges (link.js, 0.75.1).
//
// Two cities joined by one bridge, each with a free bridge out to the north, side by side: a
// link from the one's landing to the other's, planned in the first city's frame as the app
// plans it (the second placed through the join; the cities' ground and the bridges to keep
// off), and built:
// - it leaves each landing straight out and arrives straight in, turning as little as it can;
//   no block of it where either city or a bridge has one;
// - walked on foot from the first city's free landing, over the link, to the second's; its
//   rise never more than a block in three;
// - railed (open where it meets each landing), lit, on piers;
// - the pack: a function loading its tiles from the first city's marker by its tag, another at
//   given coordinates; the air over its deck written as air;
// - the cities' ground kept off is their own square and their grounds beside it (their
//   footprint), not the bridges' reach;
// - a link it cannot make says why: two ends too steep apart for their distance; an end with a
//   city in front of it.

export const id = '2zzzd';
export const label = '2zzzd. a link between two bridges';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { layoutTag, GROUND_DROP } = await import('../../engine/export.js');
  const { planLink, buildLink, linkPack, DIRV, LINK } = await import('../../engine/link.js');
  const { decodeNbt } = await import('../nbt-read.js');

  const A = generateCity({ ...DEFAULTS, size: 160, seed: 7, joinSides: ['east', 'north'], joinKind: 'viaduct', joinGap: 40 });
  const eA = (side) => ({ ...A.world.joins.find((j) => j.side === side), ctag: layoutTag(A.world), name: 'Alpha' });
  const B = generateCity({ ...DEFAULTS, size: 160, seed: 99, cityStyle: 'western', joinSides: ['north'], joinKind: 'suspension', joinGap: 40, joinTo: eA('east') });
  check('two joined cities, each with a free bridge to the north', A.joins.length === 2 && B.joins.length === 1 && !!B.world.joinFrom);
  // as the app plans it: A's frame; B placed through its join; every city's ground and every
  // bridge to keep off
  const off = B.world.joinFrom.offset;
  const ends = [{ city: A, at: [0, 0, 0], j: A.world.joins.find((q) => q.side === 'north') }, { city: B, at: off, j: B.world.joins[0] }];
  const a = { x: ends[0].j.end[0], y: ends[0].j.end[1], z: ends[0].j.end[2], dir: 'north' };
  const b = { x: off[0] + ends[1].j.end[0], y: off[1] + ends[1].j.end[1], z: off[2] + ends[1].j.end[2], dir: 'north' };
  const rects = [];
  for (const [r, o] of [[A, [0, 0, 0]], [B, off]]) {
    for (const q of r.world.footprint) rects.push({ x0: o[0] + q[0], z0: o[2] + q[1], x1: o[0] + q[2], z1: o[2] + q[3], pad: 2 });
    for (const j of r.world.joins) {
      const d = DIRV[j.side], L = j.gap + 5, ex = o[0] + j.end[0], ez = o[2] + j.end[2];
      const p1 = [ex - d[0], ez - d[1]], p2 = [ex - d[0] * L, ez - d[1] * L];
      rects.push({ x0: Math.min(p1[0], p2[0]) - (d[0] ? 0 : 3), x1: Math.max(p1[0], p2[0]) + (d[0] ? 0 : 3), z0: Math.min(p1[1], p2[1]) - (d[1] ? 0 : 3), z1: Math.max(p1[1], p2[1]) + (d[1] ? 0 : 3), pad: 0 });
    }
  }
  const P = planLink(a, b, rects);
  check('the link planned: out of the one landing, into the other', !P.missing, P.missing || `${P.length} long, ${P.turns} turns`);
  if (P.missing) return;
  const p0 = P.path[0], pN = P.path[P.path.length - 1];
  const straight = (k0, dir, rev) => [...Array(LINK.lead)].every((_, k) => { const p = P.path[rev ? P.path.length - 1 - k : k]; return p[0] === k0[0] + DIRV[dir][0] * k && p[1] === k0[1] + DIRV[dir][1] * k; });
  check('the link leaves its first end straight out and comes into the other straight in; as few turns as it needs', p0[0] === a.x && p0[1] === a.z && pN[0] === b.x && pN[1] === b.z && straight([a.x, a.z], 'north') && straight([b.x, b.z], 'north', true) && P.turns <= 4, `${P.turns} turns`);
  const steep = P.path.some((p, i) => i && Math.abs(p[2] - P.path[i - 1][2]) > 1);
  let rises = 0, lastRise = -99, close = false;
  P.path.forEach((p, i) => { if (i && p[2] !== P.path[i - 1][2]) { if (i - lastRise < LINK.slope) close = true; lastRise = i; rises++; } });
  check('its rise a block at a time, never more than one in three', !steep && !close && rises === Math.abs(P.rise), `${rises} rises for ${P.rise}`);
  // into one frame: A's blocks, B's shifted, the link's
  const L = buildLink(P), lw = L.world, [ox, oz] = L.origin;
  const shiftOf = (r, o) => [o[0] - r.world.centre[0], o[1], o[2] - r.world.centre[1]];
  const sA = shiftOf(A, [0, 0, 0]), sB = shiftOf(B, off);
  const occ = new Map();
  let clash = 0;
  A.world.forEach((x, y, z) => occ.set((x + sA[0]) + ',' + y + ',' + (z + sA[2]), 'A'));
  B.world.forEach((x, y, z) => { const k = (x + sB[0]) + ',' + (y + sB[1]) + ',' + (z + sB[2]); if (occ.has(k)) clash++; occ.set(k, 'B'); });
  let linkClash = 0;
  lw.forEach((x, y, z) => { const k = (x + ox) + ',' + y + ',' + (z + oz); if (occ.has(k)) linkClash++; });
  check('no block of the link where either city or a bridge has one', clash === 0 && linkClash === 0, `${clash} between the cities, ${linkClash} under the link`);
  const name = (x, y, z) => {
    let i = lw.get(x - ox, y, z - oz); if (i >= 0) return MATERIALS.def(i).block.replace('minecraft:', '');
    i = A.world.get(x - sA[0], y, z - sA[2]); if (i >= 0) return MATERIALS.def(i).block.replace('minecraft:', '');
    i = B.world.get(x - sB[0], y - sB[1], z - sB[2]); if (i >= 0) return MATERIALS.def(i).block.replace('minecraft:', '');
    return 'air';
  };
  const pass = (bk) => bk === 'air' || /sign|lantern|torch|flower|short_grass|rail|carpet/.test(bk);
  const solid = (bk) => !pass(bk) && !/fence|bars|wall|water|lava/.test(bk);
  // on foot from A's free landing (its middle) to B's
  {
    const ja = ends[0].j, jb = ends[1].j, dA = DIRV.north;
    const startC = [a.x - dA[0] * 3, a.y + 1, a.z - dA[1] * 3], goalC = [b.x - dA[0] * 3, b.y + 1, b.z - dA[1] * 3];
    const seen = new Set([startC.join()]), q = [startC];
    let reached = false;
    while (q.length && seen.size < 200000) {
      const [x, y, z] = q.shift();
      if (x === goalC[0] && z === goalC[2] && Math.abs(y - goalC[1]) <= 1) { reached = true; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
        const n = [x + dx, y + dy, z + dz];
        if (seen.has(n.join()) || !pass(name(...n)) || !pass(name(n[0], n[1] + 1, n[2])) || !solid(name(n[0], n[1] - 1, n[2]))) continue;
        if (dy === 1 && !pass(name(x, y + 2, z))) continue;
        seen.add(n.join()); q.push(n);
      }
    }
    check('walked on foot from the first city\'s free landing over the link to the second\'s', reached, `${seen.size} cells searched`);
    void ja; void jb;
  }
  check('railed (open at both landings), lit, on piers', L.info.rail > 60 && L.info.lamps.length >= 6 && L.info.piers >= 3, JSON.stringify({ rail: L.info.rail, lamps: L.info.lamps.length, piers: L.info.piers }));
  // the pack
  {
    const pk = await linkPack(P, { ns: 'link_ab', ctag: layoutTag(A.world), drop: GROUND_DROP, spot: [100, 64, -40], nameA: 'Alpha', nameB: 'Beta' });
    const fb = pk.functions.find((f) => f.name === 'functions/link_ab/build.mcfunction'), fa = pk.functions.find((f) => f.name === 'functions/link_ab/build_at.mcfunction');
    const loads = fb.data.split('\n').filter((l) => /structure load/.test(l));
    const okLoads = loads.length === pk.structures.length && loads.every((l, i) => l === `execute at @e[type=armor_stand,tag=${layoutTag(A.world)},c=1] run structure load link_ab:${pk.structures[i].name} ~${pk.structures[i].offset[0] || ''} ~${pk.structures[i].offset[1] - GROUND_DROP || ''} ~${pk.structures[i].offset[2] || ''}`.replace(/~0(?= |$)/g, '~'));
    const abs = fa && fa.data.split('\n').filter((l) => /^structure load/.test(l)).every((l, i) => l === `structure load link_ab:${pk.structures[i].name} ${100 + pk.structures[i].offset[0]} ${64 + pk.structures[i].offset[1] - GROUND_DROP} ${-40 + pk.structures[i].offset[2]}`);
    // the air over the deck written as air
    const [x, z, y] = P.path[Math.floor(P.path.length / 2)];
    let cell = null;
    for (const s of pk.structures) {
      const st = decodeNbt(s.data).root.structure, size = decodeNbt(s.data).root.size;
      const [sx, sy, sz] = (size.value || size).map((v) => v.value ?? v);
      const [x0, y0, z0] = s.offset;
      if (x < x0 || x >= x0 + sx || z < z0 || z >= z0 + sz) continue;
      const i = st.block_indices[0][((x - x0) * sy + (y + 2 - y0)) * sz + (z - z0)];
      cell = i < 0 ? 'void' : st.palette.default.block_palette[i].name;
    }
    const pk2 = await linkPack(P, { ns: 'link_ab', ctag: layoutTag(A.world), anchor: 'alpha_centre', drop: GROUND_DROP, nameA: 'Alpha', nameB: 'Beta' });
    const b2 = pk2.functions.find((f) => f.name === 'functions/link_ab/build.mcfunction').data;
    const named = b2.split('\n').filter((l) => l.startsWith(`execute unless entity @e[type=armor_stand,tag=${layoutTag(A.world)}] at @e[type=armor_stand,name=alpha_centre,c=1] run structure load`)).length;
    check('the pack: failing the marker\'s tag, its tiles loaded from the marker found by its name (0.75.3)', named === pk2.structures.length, `${named} of ${pk2.structures.length}`);
    check('the pack: its tiles loaded from the first city\'s marker by its tag (and at given coordinates); the air over the deck written as air', okLoads && !!abs && cell === 'minecraft:air', `${loads.length} loads, at ${!!abs}, ${cell}`);
  }
  // what it cannot do, said
  {
    const steepP = planLink({ x: 0, y: 0, z: 0, dir: 'east' }, { x: 30, y: 20, z: 0, dir: 'west' }, []);
    const blockedP = planLink({ x: 0, y: 0, z: 0, dir: 'east' }, { x: 60, y: 0, z: 0, dir: 'west' }, [{ x0: 2, z0: -5, x1: 6, z1: 5, pad: 0 }]);
    check('a link it cannot make says why (too steep for its length; a city in front of an end)', /too steep/.test(steepP.missing || '') && /in front of it/.test(blockedP.missing || ''), `${steepP.missing} | ${blockedP.missing}`);
  }
  note(`link ${P.length} long, ${P.turns} turns, rise ${P.rise}`);
}
