// tools/checks/2zzzc-joined-cities.js — cities joined by bridges (joins.js, 0.75.0).
//
// - no bridges unless asked;
// - a city with a bridge out of every side (viaducts, and again suspension bridges): each
//   bridge from one of its streets out through the wall to a landing past the gap; walked on
//   foot from the street to the landing's far edge; railed, lit, nothing over the deck; a
//   viaduct on piers going down as deep as the city does, a suspension bridge with two towers,
//   its cables unbroken from end to end and hangers down to the deck; every building of the
//   city still walked through, every floor reached, nothing dark;
// - a second city joined to one bridge, and a third to a bridge of the second (more than two):
//   set where their packs' stand_here put them, no block of any of the three where another
//   has one; each road in lying against its bridge's landing at the same height; walked on
//   foot from a street of the first city over the bridge into the second and on to the third;
//   the airport and the theme park of a joined city never on the side it is joined on;
// - the pack: stand_here (from the other city's marker, by its tag, to this city's build spot);
//   the guide's sections for both; the air over the deck written as air.

export const id = '2zzzc';
export const label = '2zzzc. cities joined by bridges';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { functionFiles, tileList, placementGuide, layoutTag, buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  check('defaults: no bridges to other cities unless asked', Array.isArray(DEFAULTS.joinSides) && DEFAULTS.joinSides.length === 0 && DEFAULTS.joinTo === null);
  const ok = (r) => { const v = verifyAll(r.world, r.buildings); return v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0; };
  const name = (w, x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const pass = (b) => b === 'air' || /sign|lantern|torch|flower|tulip|short_grass|rail|carpet|pressure_plate/.test(b);
  const solid = (b) => !pass(b) && !/fence|bars|wall|water|lava/.test(b);

  // ---- bridges on every side, of both kinds
  const ALL = ['north', 'east', 'south', 'west'];
  for (const kind of ['viaduct', 'suspension']) {
    const r = generateCity({ ...DEFAULTS, size: 192, seed: 7, joinSides: ALL, joinKind: kind, joinGap: 56 });
    const w = r.world;
    const bad = [];
    for (const b of r.joins) {
      const F = b.frame, YA = F.YA;
      // on foot from the street end of its road to the landing's far row
      const start = b.road[1], goal = new Set();
      for (let u = -F.H; u <= F.H; u++) { const [x, z] = F.at(u, F.L - 1); goal.add(x + ',' + z); }
      const seen = new Set([start.join()]), q = [[start[0], start[1] + 1, start[2]]];
      let reached = false;
      while (q.length && seen.size < 40000 && !reached) {
        const [x, y, z] = q.pop();
        if (goal.has(x + ',' + z)) { reached = true; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
          const n = [x + dx, y + dy, z + dz];
          if (seen.has(n.join())) continue;
          if (!pass(name(w, n[0], n[1], n[2])) || !pass(name(w, n[0], n[1] + 1, n[2])) || !solid(name(w, n[0], n[1] - 1, n[2]))) continue;
          if (dy === 1 && !pass(name(w, x, y + 2, z))) continue;
          seen.add(n.join()); q.push(n);
        }
      }
      if (!reached) bad.push(`${b.side}: not walked to the landing`);
      // nothing over the road down the middle; the railing; lamps
      for (let v = 0; v < F.L; v++) for (const u of [-1, 0, 1]) { const [x, z] = F.at(u, v); for (let y = YA + 1; y <= YA + 3; y++) if (!pass(name(w, x, y, z))) { bad.push(`${b.side}: something over the deck at v ${v}`); v = F.L; break; } }
      if (b.lamps.length < 8) bad.push(`${b.side}: ${b.lamps.length} lamps`);
      if (kind === 'viaduct') {
        if (b.piers.length < 5) bad.push(`${b.side}: ${b.piers.length} piers`);
        for (const [x, y, z] of b.piers) if (name(w, x, y, z) !== 'stone_bricks' || y > w.box.y0 + 1) bad.push(`${b.side}: pier short at ${x},${z}`);
      } else {
        if (b.towers.length !== 2) bad.push(`${b.side}: ${b.towers.length} towers`);
        // the cable on each side unbroken, from the deck at one end to the deck at the other
        for (const u of [-(F.H + 1), F.H + 1]) for (let v = 0; v < b.gap; v++) {
          const [x, z] = F.at(u, v);
          let has = false; for (let y = YA; y <= YA + 20; y++) if (name(w, x, y, z) === 'iron_block' || name(w, x, y, z) === 'red_concrete') has = true;
          if (!has) { bad.push(`${b.side}: cable broken at v ${v}`); break; }
        }
        if (b.hangers.length < 40) bad.push(`${b.side}: ${b.hangers.length} hangers`);
      }
    }
    check(`joined cities: a ${kind} out of every side it can take, each walked from its street to the far landing, nothing over the road, lit; ${kind === 'viaduct' ? 'piers down as deep as the city' : 'two towers, cables unbroken end to end, hangers'}`,
      r.joins.length + r.joinMissing.length === 4 && r.joins.length >= 3 && bad.length === 0, `${r.joins.map((b) => b.side).join(',')}; missing: ${r.joinMissing.join('; ')}; ${bad.slice(0, 4).join('; ')}`);
    check(`joined cities: with ${kind}s on every side, every building still walked through, every floor reached, nothing dark`, ok(r));
  }

  // ---- three cities: B joined to A's east bridge, C to B's south bridge
  const A = generateCity({ ...DEFAULTS, size: 192, seed: 7, joinSides: ['east'], joinKind: 'viaduct', joinGap: 48, airport: true, themepark: true });
  const endOf = (r, side, nm) => ({ ...r.world.joins.find((j) => j.side === side), ctag: layoutTag(r.world), name: nm, ns: nm.toLowerCase() });
  const B = generateCity({ ...DEFAULTS, size: 160, seed: 5, hills: 3, cityStyle: 'nordic', airport: true, themepark: true, joinSides: ['south'], joinKind: 'suspension', joinGap: 64, joinTo: endOf(A, 'east', 'Alpha') });
  const C = generateCity({ ...DEFAULTS, size: 160, seed: 99, cityStyle: 'western', joinTo: endOf(B, 'south', 'Beta') });
  check('three cities: the second joined to the first\'s bridge, the third to the second\'s, each its road in found, none missing', !!B.world.joinFrom && !!C.world.joinFrom && !B.joinMissing.length && !C.joinMissing.length && B.joins.length === 1, `${B.joinMissing.join('; ')} ${C.joinMissing.join('; ')}`);
  // into one frame: the first city's own; each joined city shifted by where stand_here puts it
  const shiftOf = (base, baseShift, r) => {
    const o = r.world.joinFrom.offset, bc = base.world.centre, rc = r.world.centre;
    return [baseShift[0] + bc[0] + o[0] - rc[0], baseShift[1] + o[1], baseShift[2] + bc[1] + o[2] - rc[1]];
  };
  const sA = [0, 0, 0], sB = shiftOf(A, sA, B), sC = shiftOf(B, sB, C);
  const cities = [[A, sA], [B, sB], [C, sC]];
  const occ = new Map();
  let clash = 0;
  for (const [i, [r, s]] of cities.entries()) r.world.forEach((x, y, z) => { const k = (x + s[0]) + ',' + (y + s[1]) + ',' + (z + s[2]); if (occ.has(k) && occ.get(k) !== i) clash++; else occ.set(k, i); });
  check('three cities: no block of any one where another has one', clash === 0, `${clash} cells`);
  // each road in against its bridge: the road's second row past the edge on the bridge's end, the same height
  const meets = (from, sF, to, sT) => {
    const j = to.world.joinFrom, e = from.world.joins.find((q) => q.side === { north: 'south', south: 'north', east: 'west', west: 'east' }[j.side]);
    const fc = from.world.centre, end = [e.end[0] + fc[0] + sF[0], e.end[1] + sF[1], e.end[2] + fc[1] + sF[2]];
    const road = to.joinFrom.road.map(([x, y, z]) => [x + sT[0], y + sT[1], z + sT[2]]);
    return road.some(([x, y, z]) => x === end[0] && y === end[1] && z === end[2]);
  };
  check('three cities: each road in lies against its bridge\'s landing, at the same height', meets(A, sA, B, sB) && meets(B, sB, C, sC));
  // on foot from the first city's street to a street of the third
  {
    const get = (x, y, z) => { for (const [r, s] of cities) { const i = r.world.get(x - s[0], y - s[1], z - s[2]); if (i >= 0) return MATERIALS.def(i).block.replace('minecraft:', ''); } return 'air'; };
    const aRoad = A.joins[0].road[1], cRoad = C.joinFrom.road[0];
    const goal = [cRoad[0] + sC[0], cRoad[1] + sC[1] + 1, cRoad[2] + sC[2]];
    const seen = new Set(), q = [[aRoad[0], aRoad[1] + 1, aRoad[2]]];
    seen.add(q[0].join());
    let reached = false;
    while (q.length && seen.size < 400000) {
      const [x, y, z] = q.shift();
      if (Math.abs(x - goal[0]) + Math.abs(z - goal[2]) <= 1 && Math.abs(y - goal[1]) <= 1) { reached = true; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
        const n = [x + dx, y + dy, z + dz];
        if (seen.has(n.join())) continue;
        if (!pass(get(n[0], n[1], n[2])) || !pass(get(n[0], n[1] + 1, n[2])) || !solid(get(n[0], n[1] - 1, n[2]))) continue;
        if (dy === 1 && !pass(get(x, y + 2, z))) continue;
        seen.add(n.join()); q.push(n);
      }
    }
    check('three cities: walked on foot from a street of the first, over both bridges, to a street of the third', reached, `${seen.size} cells searched`);
  }
  {
    const airB = B.landmarks.find((l) => l.kind === 'airport'), tpB = B.landmarks.find((l) => l.kind === 'themepark');
    const facing = B.world.joinFrom.side;
    check('a joined city\'s airport and theme park never on the side it is joined on', (!airB || airB.side !== facing) && (!tpB || tpB.side !== facing), `${airB && airB.side} / ${tpB && tpB.side}, joined on the ${facing}`);
  }
  // ---- the packs
  {
    const fns = functionFiles(tileList(B.world, {}), B.world, { namespace: 'beta', spawns: B.spawns, centre: B.world.centre, places: B.places });
    const sh = fns.find((f) => f.fn === 'beta/stand_here');
    const o = B.world.joinFrom.offset, r = (a) => `~${a || ''}`;
    const line = `execute at @e[type=armor_stand,tag=${layoutTag(A.world)},c=1] run tp @s ${r(o[0])} ${r(o[1])} ${r(o[2])}`;
    check('the pack: stand_here takes you from the first city\'s marker (by its tag) to the joined city\'s build spot', !!sh && sh.text.includes(line), sh ? sh.text.split('\n')[2] : 'none');
    // (0.75.3) failing the tag, by the marker's name; failing both, it says to go to that spot,
    // and stand_here_from_spot does it with no marker from the spot itself
    const byName = `execute unless entity @e[type=armor_stand,tag=${layoutTag(A.world)}] at @e[type=armor_stand,name=alpha_centre,c=1] run tp @s ${r(o[0])} ${r(o[1])} ${r(o[2])}`;
    const fs = fns.find((f) => f.fn === 'beta/stand_here_from_spot');
    check('the pack: stand_here finds the marker by its name when the tag is not there, says where to stand when neither is; stand_here_from_spot needs no marker',
      !!sh && sh.text.includes(byName) && /Go to Alpha's build spot/.test(sh.text) && !!fs && fs.text.includes(`\ntp @s ${r(o[0])} ${r(o[1])} ${r(o[2])}\n`), sh ? '' : 'none');
    const gB = placementGuide(tileList(B.world, {}), { namespace: 'beta', world: B.world, centre: B.world.centre });
    const gA = placementGuide(tileList(A.world, {}), { namespace: 'alpha', world: A.world, centre: A.world.centre });
    check('the guide: the joined city says how to stand on its spot and build; the first lists its bridges and where each ends', /THIS CITY JOINS ALPHA/.test(gB) && gB.includes('/function beta/stand_here') && /BRIDGES TO OTHER CITIES/.test(gA) && /east\s+a viaduct, 48 blocks across/.test(gA));
    const noJ = fns.every((f) => f.fn !== 'alpha/stand_here') && !functionFiles(tileList(A.world, {}), A.world, { namespace: 'alpha' }).some((f) => /stand_here/.test(f.fn));
    check('the pack: no stand_here for a city that joins none', noJ);
    // the air over the deck written as air (the world's ground there cleared on loading)
    const b = A.joins[0], [x, z] = b.frame.at(0, Math.floor(b.gap / 2)), y = b.frame.YA + 2;
    const tiles = buildStructures(A.world, { fillAir: true, foundation: 8 });
    let cell = null;
    for (const t of tiles) {
      const [ox, oy, oz] = t.offset, [sx, sy, sz] = t.size;
      if (x < ox || x >= ox + sx || z < oz || z >= oz + sz || y < oy || y >= oy + sy) continue;
      const st = decodeNbt(t.data).root.structure;
      const idx = st.block_indices[0][((x - ox) * sy + (y - oy)) * sz + (z - oz)];
      cell = idx < 0 ? 'void' : st.palette.default.block_palette[idx].name;
    }
    check('the pack: the air over a bridge\'s deck written as air', cell === 'minecraft:air', cell);
  }
  note(`A ${A.joins.map((b) => b.side).join(',')} · B joined on the ${B.world.joinFrom.side} at ${B.world.joinFrom.offset.join(',')} · C on the ${C.world.joinFrom.side}`);
}
