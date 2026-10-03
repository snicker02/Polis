// engine/metro.js — a metro under the main streets, and a loop round the city.
//
// Cross lines: one under the longest main street each way (east-west,
// north-south), along its middle, at least 64 long: a tunnel three wide and
// three high, walls, roof and floor of stone brick, a stop wall at each end. The
// second line runs five deeper and passes under the first.
//
// The loop: under the outermost long street on each side, a closed rectangle,
// nineteen down (under both cross lines), its corners curved, so a cart can go
// round the city for ever.
//
// Track: powered rails all along, on a redstone block every eight (plain rails
// between them broke in the game, the powered ones stayed), plain rails only for
// the loop's curves. Lanterns hang from the tunnel roofs over the walkways.
//
// Stations at both ends of a cross line and about every 48 between, along every
// side of the loop: a hall nine wide, nine long and four high, lanterns down
// both sides, a minecart waiting on the track; the hall's end walls stop at the
// tunnel, which runs on through. From each station stairs climb to the pavement:
// a straight flight first, on a row clear of the track, failing that a
// switchback (half the way up, a landing, back the other way on the next row
// over), which comes out by its own station. The opening is railed round (never
// on the flight), street furniture over it gives way, and it keeps a block from
// any door.
//
// Nothing is dug where something is built already (a cellar, the crypt, another
// line): only soft fill or empty ground. Every tunnel, hall and stair is listed
// on the world as air (the ground in the game is the world's own).

import { MAT, MATERIALS, stairId, WEIRDO, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

const SOFT = new Set([MAT.BASE, MAT.DIRT, MAT.RETAIN, MAT.CLAY, MAT.GRAVEL, MAT.CANAL_BED]);
const FURNITURE = /fence|lantern|sign|flower|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|lily|grass|fern|bush|carpet|torch/;

export function buildMetro(world, plan, cfg, G, opts = {}) {
  const { W, D, use, mask, corridors } = plan;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
  const isStreet = (x, z) => inCity(x, z) && (use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK);
  // (a room is any that was there before, or one the metro has dug since: a later
  // line, hall or stair keeps clear of an earlier one's air, not only of cellars)
  const rooms = world.airBoxes || [];
  const boxes = [];
  const near = (b, x, y, z, m) => x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m && y >= b.y0 - m && y <= b.y1 + m;
  const inRoom = (x, y, z) => rooms.some((b) => near(b, x, y, z, 1)) || boxes.some((b) => near(b, x, y, z, 1));
  const inAir = (x, y, z) => rooms.some((b) => near(b, x, y, z, 0)) || boxes.some((b) => near(b, x, y, z, 0));
  const free = (x, y, z) => { const id = world.get(x, y, z); return (id === -1 || SOFT.has(id)) && !inRoom(x, y, z); };
  const doors = [];
  for (const b of opts.buildings || []) for (const d of b.doorCells || []) doors.push(d);
  const byDoor = (x, z) => doors.some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
  const clearAbove = (x, z) => {
    for (let y = G + 1; y <= G + 3; y++) {
      const id = world.get(x, y, z); if (id === -1) continue;
      const n = MATERIALS.def(id).block;
      if (!FURNITURE.test(n) && n !== 'minecraft:sea_lantern') return false;
    }
    return true;
  };
 const lines = [];
  const box = (xa, za, xb, zb, y0, y1) => boxes.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), y0, y1 });

  // ---- a station's hall, its cart, and its stairs up ----------------------------
  // seg: { axis, a, F, cell, u0, u1 } — the straight stretch of tunnel it stands on
  const stationFits = (seg, s) => {
    for (let u = s - 4; u <= s + 4; u++) for (let da = -5; da <= 5; da++) for (let y = seg.F; y <= seg.F + 5; y++) {
      const [x, z] = seg.cell(u, seg.a + da);
      if (Math.abs(da) <= 2 && u >= seg.u0 && u <= seg.u1 && y <= seg.F + 4) continue;   // the tunnel itself
      if (!free(x, y, z)) return false;
    }
    return true;
  };
  const buildHall = (seg, st) => {
    const { F, cell, a } = seg;
    for (let u = st.u - 5; u <= st.u + 5; u++)
      for (let da = -5; da <= 5; da++) {
        const [x, z] = cell(u, a + da);
        const wall = Math.abs(da) === 5 || Math.abs(u - st.u) === 5;
        if (Math.abs(da) <= 2 && u >= seg.u0 && u <= seg.u1) {
          // the hall's end walls stop at the tunnel, which runs on through them
          if (Math.abs(u - st.u) === 5) continue;
          world.clear(x, F + 4, z); world.set(x, F + 5, z, MAT.STONEBRICK); continue;   // its roof raised to the hall's
        }
        if (Math.abs(da) <= 2 && (u < seg.u0 || u > seg.u1)) continue;
        world.set(x, F, z, MAT.STONEBRICK);
        world.set(x, F + 5, z, MAT.STONEBRICK);
        for (let y = F + 1; y <= F + 4; y++) { if (wall) world.set(x, y, z, MAT.STONEBRICK); else world.clear(x, y, z); }
      }
    // (the tunnel's own side walls run on through the hall: open them)
    for (let u = st.u - 4; u <= st.u + 4; u++) for (const da of [-2, 2]) {
      if (u < seg.u0 || u > seg.u1) continue;
      const [x, z] = cell(u, a + da); for (let y = F + 1; y <= F + 4; y++) world.clear(x, y, z);
    }
    const [hx0, hz0] = cell(st.u - 4, a - 4), [hx1, hz1] = cell(st.u + 4, a + 4);
    box(hx0, hz0, hx1, hz1, F + 1, F + 4);
    for (let u = st.u - 3; u <= st.u + 3; u += 3) for (const da of [-3, 3]) { const [x, z] = cell(u, a + da); world.set(x, F + 4, z, MAT.LAMP_HANG); }
  };
  const buildStairs = (seg, st, dry) => {
    const { F, cell, a, axis } = seg;
    const rise = G - F;
    const climbUp = { 1: axis === 'x' ? WEIRDO.east : WEIRDO.south, [-1]: axis === 'x' ? WEIRDO.west : WEIRDO.north };
    const plans = [];
    for (const side of [1, -1]) for (const ud of [1, -1]) for (const da of [3, 2, 4]) {          // straight
      const as = a + side * da, start = st.u + ud * 3;
      const steps = [];
      for (let i = 1; i <= rise; i++) steps.push({ u: start + ud * (i - 1), a: as, y: F + i, dir: ud });
      plans.push({ steps, landing: [], exit: { u: start + ud * rise, a: as }, foot: { u: start - ud, a: as } });
    }
    for (const side of [1, -1]) for (const ud of [1, -1]) for (const da of [2, 1, 3]) {          // switchback
      const as = a + side * da, bs = as + side, start = st.u + ud * 1;
      const h1 = Math.floor(rise / 2), h2 = rise - h1;
      const steps = [];
      for (let i = 1; i <= h1; i++) steps.push({ u: start + ud * (i - 1), a: as, y: F + i, dir: ud });
      const uL = start + ud * h1;
      for (let j = 1; j <= h2; j++) steps.push({ u: uL - ud * j, a: bs, y: F + h1 + j, dir: -ud });
      plans.push({ steps, landing: [{ u: uL, a: as, y: F + h1 }, { u: uL, a: bs, y: F + h1 }], exit: { u: uL - ud * (h2 + 1), a: bs }, foot: { u: start - ud, a: as } });
    }
    const hallHas = (u, aa) => Math.abs(u - st.u) <= 5 && Math.abs(aa - a) <= 5;
    for (const pl of plans) {
      const [ex, ez] = cell(pl.exit.u, pl.exit.a);
      if (!isStreet(ex, ez) || !clearAbove(ex, ez) || byDoor(ex, ez)) continue;
      if (pl.steps.some((q) => Math.abs(q.a - a) >= 5 && hallHas(q.u, q.a))) continue;      // not through the hall's side walls
      let ok = true;
      for (const q of [...pl.steps, ...pl.landing]) {
        const [x, z] = cell(q.u, q.a);
        // (over the hall's footprint only the hall's own height is the hall's: a
        // switchback climbs back over it, far above its roof, where it must be free too)
        for (let yy = F; yy <= Math.min(G - 1, q.y + 3); yy++) {
          if (hallHas(q.u, q.a) && yy <= F + 5) continue;
          if (!free(x, yy, z)) { ok = false; break; }
        }
        if (!ok) break;
        if (q.y + 3 >= G && (!isStreet(x, z) || byDoor(x, z) || !clearAbove(x, z))) { ok = false; break; }
      }
      if (!ok) continue;
      if (dry) return true;
      const all = [...pl.steps, ...pl.landing];
      const onFlight = new Set(all.map((q) => cell(q.u, q.a).join(',')));
      for (const q of all) if (q.y + 3 >= G) { const [x, z] = cell(q.u, q.a); for (let yy = G + 1; yy <= G + 3; yy++) world.clear(x, yy, z); }
      for (let yy = G + 1; yy <= G + 3; yy++) world.clear(ex, yy, ez);
      const opening = [];
      for (const q of all) {
        const [x, z] = cell(q.u, q.a);
        for (let yy = F + 1; yy < q.y; yy++) world.set(x, yy, z, MAT.STONEBRICK);
        world.set(x, q.y, z, q.dir ? stairId('stonebrick', climbUp[q.dir]) : MAT.STONEBRICK);
        const top = Math.min(G + 3, q.y + 3);
        for (let yy = q.y + 1; yy <= top; yy++) world.clear(x, yy, z);
        if (q.y + 1 <= G && G <= top) opening.push([x, z]);
        boxes.push({ x0: x, x1: x, z0: z, z1: z, y0: q.y + 1, y1: Math.min(G - 1, q.y + 3) });
      }
      // the shaft's walls, where it runs outside the hall (not between its own cells)
      for (const q of all) {
        if (hallHas(q.u, q.a)) continue;
        for (const [du, dA] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nu = q.u + du, na = q.a + dA;
          const [wx, wz] = cell(nu, na);
          if (onFlight.has(wx + ',' + wz) || (nu === pl.exit.u && na === pl.exit.a) || hallHas(nu, na)) continue;
          // (never into another room's air: a cross line's tunnel beside a loop's stair)
          for (let yy = q.y; yy <= Math.min(G - 1, q.y + 3); yy++) if ((!world.has(wx, yy, wz) && !inAir(wx, yy, wz)) || SOFT.has(world.get(wx, yy, wz))) world.set(wx, yy, wz, MAT.STONEBRICK);
        }
      }
      // the opening railed round, the way out open, never on the flight itself
      const openSet = new Set(opening.map(([x, z]) => x + ',' + z));
      for (const [x, z] of opening) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (openSet.has(nx + ',' + nz) || (nx === ex && nz === ez) || onFlight.has(nx + ',' + nz)) continue;
        if (!isStreet(nx, nz) || !world.has(nx, G, nz) || world.has(nx, G + 1, nz)) continue;
        world.set(nx, G + 1, nz, MAT.FENCE);
      }
      const [fx, fz] = cell(pl.foot.u, pl.foot.a);
      return { kind: pl.landing.length ? 'switchback' : 'straight', foot: [fx, F + 1, fz], exit: [ex, G + 1, ez], steps: pl.steps.map((q) => [...cell(q.u, q.a), q.y]), landing: pl.landing.map((q) => [...cell(q.u, q.a), q.y]) };
    }
    return null;
  };
  // a straight run of tunnel: three wide, three high, walls about it
  const carve = (seg, uFrom, uTo, endWalls) => {
    const { F, cell, a } = seg;
    for (let u = uFrom; u <= uTo; u++)
      for (let da = -2; da <= 2; da++) {
        const [x, z] = cell(u, a + da);
        const wall = Math.abs(da) === 2 || (endWalls && (u === uFrom || u === uTo));
        world.set(x, F, z, MAT.STONEBRICK);
        world.set(x, F + 4, z, MAT.STONEBRICK);
        for (let y = F + 1; y <= F + 3; y++) { if (wall) world.set(x, y, z, MAT.STONEBRICK); else world.clear(x, y, z); }
      }
  };
  // lanterns from the tunnel roof over the walkways, every six, either side in turn
  const hangLights = (seg, uFrom, uTo, stations) => {
    let n = 0;
    for (let u = uFrom, k = 0; u <= uTo; u += 6, k++) {
      if (stations.some((st) => Math.abs(u - st.u) <= 5)) continue;
      const [x, z] = seg.cell(u, seg.a + (k % 2 ? 1 : -1));
      if (world.has(x, seg.F + 3, z)) continue;
      world.set(x, seg.F + 3, z, MAT.LAMP_HANG); n++;
    }
    return n;
  };
  // powered rails along a straight run, a redstone block under every eighth
  const layStraight = (seg, uFrom, uTo, skip) => {
    const dir = seg.axis === 'x' ? RAIL.EW : RAIL.NS;
    for (let u = uFrom; u <= uTo; u++) {
      const [x, z] = seg.cell(u, seg.a);
      if (skip && skip(x, z)) continue;
      if ((u - uFrom) % 8 === 4) world.set(x, seg.F, z, MAT.REDSTONE);
      world.set(x, seg.F + 1, z, poweredRailId(dir));
    }
  };
  // stations along a straight run, and their halls, carts and stairs
  const stationsOn = (seg, at) => {
    const out = [];
    for (const s of at) if (stationFits(seg, s)) out.push({ u: s });
    return out;
  };
  const finishStations = (seg, stations) => {
    let flights = 0;
    const carts = [];
    for (const st of stations) {
      const [x, z] = seg.cell(st.u, seg.a);
      carts.push({ type: 'minecart', x, y: seg.F + 1, z });
    }
    for (const st of stations) { st.stairs = buildStairs(seg, st); if (st.stairs) flights++; }
    return { carts, flights };
  };

  // ---- the cross lines ----------------------------------------------------------
  const pick = (axis) => {
    let best = null;
    for (const c of corridors || []) {
      if (c.axis !== axis || c.w < 5) continue;
      const len = axis === 'x' ? c.x1 - c.x0 + 1 : c.z1 - c.z0 + 1;
      if (len < 64) continue;
      const a = axis === 'x' ? Math.floor((c.z0 + c.z1) / 2) : Math.floor((c.x0 + c.x1) / 2);
      const u0 = axis === 'x' ? c.x0 : c.z0, u1 = axis === 'x' ? c.x1 : c.z1;
      let ok = 0, all = 0;
      for (let u = u0; u <= u1; u++) { const [x, z] = axis === 'x' ? [u, a] : [a, u]; if (!inCity(x, z)) continue; all++; if (isStreet(x, z)) ok++; }
      if (all < 64 || ok < all) continue;
      if (!best || len > best.len) best = { c, axis, a, u0, u1, len };
    }
    return best;
  };
  [pick('x'), pick('z')].filter(Boolean).forEach((p, li) => {
    const F = G - 9 - li * 5;
    const cell = (u, a) => (p.axis === 'x' ? [u, a] : [a, u]);
    let u0 = p.u0 + 4, u1 = p.u1 - 4;
    while (u0 < u1 && !inCity(...cell(u0, p.a))) u0++;
    while (u1 > u0 && !inCity(...cell(u1, p.a))) u1--;
    if (u1 - u0 < 48) return;
    for (let u = u0 - 1; u <= u1 + 1; u++) for (let da = -2; da <= 2; da++) for (let y = F; y <= F + 4; y++) {
      const [x, z] = cell(u, p.a + da); if (!free(x, y, z)) return;
    }
    const seg = { axis: p.axis, a: p.a, F, cell, u0, u1 };
    const at = [u0 + 4];
    for (let u = u0 + 52; u < u1 - 30; u += 48) at.push(u);
    at.push(u1 - 4);
    const stations = stationsOn(seg, at);
    if (stations.length < 2) return;
    carve(seg, u0 - 1, u1 + 1, true);
    const [ax0, az0] = cell(u0, p.a - 1), [ax1, az1] = cell(u1, p.a + 1);
    box(ax0, az0, ax1, az1, F + 1, F + 3);
    for (const st of stations) buildHall(seg, st);
    layStraight(seg, u0, u1);
    const lights = hangLights(seg, u0 + 2, u1 - 2, stations);
    const { carts, flights } = finishStations(seg, stations);
    lines.push({ axis: p.axis, a: p.a, u0, u1, F, cell, stations: stations.map((st) => ({ at: cell(st.u, p.a), stairs: st.stairs })), carts, lights, flights });
  });

  // ---- the loop round the city -----------------------------------------------------
  if (opts.loop !== false) {
    const F = G - 19;
    // The loop runs nineteen down, under everything else (cellars, the crypt and
    // the cross lines are all higher), so it need not follow the streets: it is
    // the city's own footprint drawn in until the loop and its halls lie inside
    // the city all round. Only its stations need a street over them.
    let x0 = W, x1 = -1, z0 = D, z1 = -1;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (inCity(x, z)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let best = null;
    const ringInside = (xW, xE, zN, zS) => {
      for (let x = xW - 6; x <= xE + 6; x++) for (const z of [zN - 6, zN + 6, zS - 6, zS + 6]) if (!inCity(x, z)) return false;
      for (let z = zN - 6; z <= zS + 6; z++) for (const x of [xW - 6, xW + 6, xE - 6, xE + 6]) if (!inCity(x, z)) return false;
      return true;
    };
    for (let inset = 8; inset < Math.min(x1 - x0, z1 - z0) / 2 - 24; inset += 2) {
      const xW = x0 + inset, xE = x1 - inset, zN = z0 + inset, zS = z1 - inset;
      if (ringInside(xW, xE, zN, zS)) { best = { xW, xE, zN, zS }; break; }
    }
    if (best) {
      const { zN, zS, xW, xE } = best;
      const segs = [
        { axis: 'x', a: zN, F, cell: (u, a) => [u, a], u0: xW, u1: xE },
        { axis: 'z', a: xE, F, cell: (u, a) => [a, u], u0: zN, u1: zS },
        { axis: 'x', a: zS, F, cell: (u, a) => [u, a], u0: xW, u1: xE },
        { axis: 'z', a: xW, F, cell: (u, a) => [a, u], u0: zN, u1: zS },
      ];
      // the tunnel's interior all round, then walls where there is no interior
      const inside = new Set();
      for (const s of segs) for (let u = s.u0; u <= s.u1; u++) for (let da = -1; da <= 1; da++) inside.add(s.cell(u, s.a + da).join(','));
      let ok = true;
      for (const s of segs) for (let u = s.u0 - 2; u <= s.u1 + 2 && ok; u++) for (let da = -2; da <= 2 && ok; da++) {
        const [x, z] = s.cell(u, s.a + da);
        for (let y = F; y <= F + 4; y++) if (!free(x, y, z)) { ok = false; break; }
      }
      if (ok) {
        for (const s of segs) for (let u = s.u0 - 2; u <= s.u1 + 2; u++) for (let da = -2; da <= 2; da++) {
          const [x, z] = s.cell(u, s.a + da);
          world.set(x, F, z, MAT.STONEBRICK); world.set(x, F + 4, z, MAT.STONEBRICK);
          const open = inside.has(x + ',' + z);
          for (let y = F + 1; y <= F + 3; y++) { if (open) world.clear(x, y, z); else if (!inside.has(x + ',' + z) && !world.has(x, y, z)) world.set(x, y, z, MAT.STONEBRICK); }
        }
        for (const s of segs) { const [ax0, az0] = s.cell(s.u0, s.a - 1), [ax1, az1] = s.cell(s.u1, s.a + 1); box(ax0, az0, ax1, az1, F + 1, F + 3); }
        // stations where a street crosses over the loop, clear of the corners, 32
        // apart, and only where their stairs reach the street (tried first, dry)
        const ringStations = segs.map((s) => {
          const out = [];
          for (let u = s.u0 + 12; u <= s.u1 - 12; u++) {
            if (out.length && u - out[out.length - 1].u < 32) continue;
            const [x, z] = s.cell(u, s.a);
            if (!isStreet(x, z) || !stationFits(s, u)) continue;
            if (!buildStairs(s, { u }, true)) continue;
            out.push({ u });
          }
          return out;
        });
        segs.forEach((s, i) => { for (const st of ringStations[i]) buildHall(s, st); });
        // the track: powered rails along the sides, curves at the corners
        const corners = [[xW, zN, RAIL.SE], [xE, zN, RAIL.SW], [xE, zS, RAIL.NW], [xW, zS, RAIL.NE]];
        const isCorner = (x, z) => corners.some(([cx, cz]) => cx === x && cz === z);
        for (const s of segs) layStraight(s, s.u0, s.u1, isCorner);
        for (const [x, z, d] of corners) world.set(x, F + 1, z, railId(d));
        let lights = 0, flights = 0;
        const carts = [], stationsOut = [];
        segs.forEach((s, i) => {
          lights += hangLights(s, s.u0 + 3, s.u1 - 3, ringStations[i]);
          const r = finishStations(s, ringStations[i]);
          flights += r.flights; carts.push(...r.carts);
          for (const st of ringStations[i]) stationsOut.push({ at: s.cell(st.u, s.a), stairs: st.stairs });
        });
        // the way round, in order, for the checks
        const path = [];
        for (let x = xW; x <= xE; x++) path.push([x, zN]);
        for (let z = zN + 1; z <= zS; z++) path.push([xE, z]);
        for (let x = xE - 1; x >= xW; x--) path.push([x, zS]);
        for (let z = zS - 1; z > zN; z--) path.push([xW, z]);
        lines.push({ ring: true, F, rect: { xW, xE, zN, zS }, path, corners: corners.map(([x, z]) => [x, z]), stations: stationsOut, carts, lights, flights });
      }
    }
  }
  if (boxes.length) (world.airBoxes || (world.airBoxes = [])).push(...boxes);
  return { lines, carts: lines.flatMap((l) => l.carts) };
}
