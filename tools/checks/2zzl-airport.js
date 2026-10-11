// tools/checks/2zzl-airport.js — the airport (airport.js).
//
// Built into the world and looked at there: beside the city, outside its square
// (no lot touched: its road crosses only street, pavement, park, square or open
// ground); on cities with hills, small blocks, a square outline. Walked on foot
// from the street the road leaves to the terminal's doors, through the hall and out
// onto the apron, onto every launch pad's plate and to its chest, and up the
// control tower's ladder into its cab. The runway: over a hundred long, nine wide,
// black with white markings, lights along both edges, nothing over it. Each launch
// pad: a pressure plate on a command block that lifts the player standing on it,
// a chain block under that one that slows their fall; a chest beside it with
// elytras and rockets. Three aircraft. Every piece of open ground lit. In the pack:
// the airfield cleared and founded like the city's own ground; a goto to it. Not on
// a fitted city or with the dome: the summary says why. In Java, the same commands
// in Java's words. Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzl';
export const label = '2zzl. the airport';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { USE } = await import('../../engine/plan.js');
  const { buildStructures, cityInside, foundationFill, functionFiles, tileList } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, airport: true };
  check('defaults: no airport unless asked', DEFAULTS.airport === false);
  const cities = [
    ['hilly 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99, hills: 0 })],
    ['small blocks', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10 })],
    ['a square city', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, outline: 'square' })],
  ];
  const inspect = (r) => {
    const A = r.landmarks.find((Lm) => Lm.kind === 'airport');
    if (!A) return { built: false };
    const w = r.world, F = A.frame, YA = A.ground, { W, D, use } = r.plan;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const out = { built: true, side: A.side };
    // outside the city's square, its road over open ground only
    out.outside = A.lot.x1 < 0 || A.lot.x0 >= W || A.lot.z1 < 0 || A.lot.z0 >= D;
    const OK = new Set([USE.EMPTY, USE.ROAD, USE.SIDEWALK, USE.PARK, USE.PLAZA]);
    out.roadOk = A.road.every(([x, , z]) => x < 0 || z < 0 || x >= W || z >= D || OK.has(use[z * W + x]));
    // on foot: a player two tall, a step of one; up a ladder; a sign, a plate, a lantern passed
    const pass = (b) => b === 'air' || /sign|pressure_plate|flower|tulip|lily|poppy|dandelion|orchid|allium|bluet|daisy|short_grass/.test(b);
    const ladder = (b) => b === 'ladder';
    const floor = (b) => b !== 'air' && !pass(b) && !/fence|bars|water|lava/.test(b);
    const stand = (x, y, z) => (pass(blk(x, y, z)) || ladder(blk(x, y, z))) && (pass(blk(x, y + 1, z)) || ladder(blk(x, y + 1, z))) && (floor(blk(x, y - 1, z)) || ladder(blk(x, y, z)) || ladder(blk(x, y - 1, z)));
    const key = (p) => p.join(',');
    const [sx, sy, sz] = A.road[1];                       // (the street end of the road)
    let s0 = null; for (let d = 0; d <= 4 && !s0; d++) if (stand(sx, sy + 1 + d - 1, sz)) s0 = [sx, sy + d, sz];
    if (!s0) for (let d = -2; d <= 4 && !s0; d++) if (stand(sx, sy + d, sz)) s0 = [sx, sy + d, sz];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    const lo = { x0: Math.min(A.lot.x0, A.roadRect.x0) - 2, x1: Math.max(A.lot.x1, A.roadRect.x1) + 2, z0: Math.min(A.lot.z0, A.roadRect.z0) - 2, z1: Math.max(A.lot.z1, A.roadRect.z1) + 2 };
    while (q.length && seen.size < 200000) {
      const [a, b, c] = q.pop();
      const moves = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) moves.push([a + dx, b + dy, c + dz]);
      if (ladder(blk(a, b, c)) || ladder(blk(a, b - 1, c))) moves.push([a, b + 1, c], [a, b - 1, c]);
      for (const n of moves) {
        if (seen.has(key(n)) || n[0] < lo.x0 || n[0] > lo.x1 || n[2] < lo.z0 || n[2] > lo.z1 || !stand(...n)) continue;
        if (n[1] > b && !ladder(blk(a, b, c)) && !pass(blk(a, b + 2, c)) && !ladder(blk(a, b + 2, c))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    const reached = (p) => seen.has(key(p));
    const near = (p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has(key([p[0] + dx, p[1], p[2] + dz])));
    out.walk = { start: !!s0, door: reached(A.terminal.doors[0]), apron: A.terminal.doors.slice(1).every(reached),
      plates: A.pads.every((p) => reached(p.plate)), chests: A.pads.every((p) => near(p.chest)),
      cab: [...seen].some((k) => { const [x, y, z] = k.split(',').map(Number); return y === A.tower.cab + 1 && x >= F.at(A.tower.u0, A.tower.v0)[0] - 8 && Math.abs(x - A.tower.door[0]) <= 4 && Math.abs(z - A.tower.door[2]) <= 6 && blk(x, y - 1, z) === 'smooth_quartz'; }) };
    // the runway
    const RW = A.runway;
    let bad = 0, over = 0;
    for (let u = RW.u0; u <= RW.u1; u++) for (let v = RW.v0; v <= RW.v1; v++) {
      const [x, y, z] = RW.cells(u, v);
      if (!/^(black|white)_concrete$/.test(blk(x, y, z))) bad++;
      for (let d = 1; d <= 30; d++) if (blk(x, y + d, z) !== 'air') { over++; break; }
    }
    out.runway = { length: RW.length, width: RW.width, bad, over, lights: A.lights.filter((p) => blk(...p) === 'sea_lantern').length };
    // the pads
    out.pads = A.pads.map((p) => {
      const cmd = w.getData(...p.command), chain = w.getData(...p.chain), chest = w.getData(...p.chest);
      const items = chest && chest.tags.Items ? chest.tags.Items.v.map((it) => it.v.Name.v) : [];
      return blk(...p.plate) === 'stone_pressure_plate' && blk(...p.command) === 'command_block' && blk(...p.chain) === 'chain_command_block'
        && !!cmd && /^effect @p\[r=2\] levitation \d+ \d+ true$/.test(cmd.tags.Command.v) && cmd.tags.auto.v === 0
        && !!chain && /slow_falling/.test(chain.tags.Command.v) && chain.tags.auto.v === 1
        && blk(...p.chest) === 'chest' && items.includes('minecraft:elytra') && items.includes('minecraft:firework_rocket');
    });
    out.planes = A.planes.filter((p) => p.blocks.length >= 25 && p.blocks.every((b) => blk(...b) !== 'air')).length;
    // lit: every turf or apron cell within reach of a light
    const lights = [...A.lamps, ...A.lights];
    let dark = 0;
    for (let v = 1; v < F.VD - 1; v++) for (let u = F.U0 + 1; u < F.U1; u++) {
      const [x, z] = F.at(u, v), b = blk(x, YA, z);
      if (b !== 'grass_block' && b !== 'light_gray_concrete') continue;
      if (blk(x, YA + 1, z) !== 'air') continue;
      if (!lights.some(([a, bb, c]) => Math.abs(a - x) + Math.abs(bb - YA - 1) + Math.abs(c - z) <= 12)) dark++;
    }
    out.dark = dark;
    // the pack: the airfield founded and cleared like the city's ground
    const inside = cityInside(w), fill = foundationFill(w);
    const [mx, mz] = F.at(0, 30), [rx, , rz] = A.road[0];
    out.packGround = [!!inside, inside(mx, mz), inside(rx, rz), fill(mx, YA - 4, mz) !== -1, !inside(...F.at(0, F.VD + 5))].every(Boolean) || [!!inside, inside(mx, mz), inside(rx, rz), fill(mx, YA - 4, mz) !== -1, !inside(...F.at(0, F.VD + 5))].join('/');
    out.place = r.places.find((P) => P.kind === 'airport');
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('airport: built beside the city (outside its square), on hills, small blocks, a square city', all((t) => t.outside), ts.map(([n, , t]) => `${n}: ${t.built ? t.side : 'none'}`).join(', '));
  check('airport: its road leaves the city over street, pavement, park or open ground only (no lot touched)', all((t) => t.roadOk));
  check('airport: walked from the city\'s street to the terminal, through it onto the apron', all((t) => t.walk.start && t.walk.door && t.walk.apron), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.walk)}`).join(' | '));
  check('airport: every launch pad\'s plate stood on, every chest reached', all((t) => t.walk.plates && t.walk.chests));
  check('airport: the control tower climbed by its ladder into the cab', all((t) => t.walk.cab));
  check('airport: the runway over a hundred long, nine wide, black and white, lit along both edges, nothing over it', all((t) => t.runway.length >= 100 && t.runway.width === 9 && t.runway.bad === 0 && t.runway.over === 0 && t.runway.lights >= 40), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.runway)}`).join(' | '));
  check('airport: three launch pads, each a plate on a command block that lifts you, a chain block that slows your fall, a chest of elytras and rockets', all((t) => t.pads.length === 3 && t.pads.every(Boolean)));
  check('airport: three aircraft, whole', all((t) => t.planes === 3));
  check('airport: every piece of its open ground lit', all((t) => t.dark === 0), ts.map(([n, , t]) => `${n}: ${t.dark}`).join(', '));
  check('airport: in the pack, its ground founded and cleared like the city\'s own (and no more)', all((t) => t.packGround === true), ts.map(([n, , t]) => `${n}: ${t.packGround}`).join(', '));
  {
    const r = cities[1][1];
    const opts = { namespace: 'chk', places: r.places, spawns: r.spawns, centre: r.world.centre, world: r.world };
    const go = functionFiles(tileList(r.world, opts), r.world, opts).find((f) => f.fn === 'chk/goto_airport');
    check('airport: a place in Find a landmark, a goto to its forecourt', !!ts[1][2].place && !!go);
  }
  {
    const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
    const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
    const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
    const f = generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } });
    const d = generateCity({ ...DEFAULTS, ...L, size: 192, seed: 3, dome: true });
    check('airport: not on a fitted city or with the dome, and the summary says why', !f.landmarks.some((q) => q.kind === 'airport') && /fitted/.test(f.stats.airportMissing || '') && !d.landmarks.some((q) => q.kind === 'airport') && /dome/.test(d.stats.airportMissing || ''));
  }
  {
    const { javaTiles } = await import('../../engine/export-java.js');
    const { decodeJavaNbt } = await import('../nbt-read.js').catch(() => ({}));
    const r = cities[1][1];
    const tiles = javaTiles(r.world, { prefix: 'c', fillAir: true });
    // (the Java structures carry their block entities as nbt in the blocks list)
    let cmds = [];
    for (const t of tiles) {
      const text = Buffer.from(t.nbt).toString('latin1');
      for (const m of text.matchAll(/effect give @p\[distance=\.\.\d\] minecraft:(levitation|slow_falling) \d+ \d+ true/g)) cmds.push(m[1]);
    }
    void decodeJavaNbt;
    check('airport: in Java, the launch pads\' commands in Java\'s words', cmds.filter((c) => c === 'levitation').length === 3 && cmds.filter((c) => c === 'slow_falling').length === 3, cmds.join(','));
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[1][1].world, { fillAir: true })) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('airport: every block one of Bedrock\'s own states (command blocks, plates, ladders)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  note(`airport: ${ts.map(([n, , t]) => t.built ? `${n} to the ${t.side}, runway ${t.runway.length}` : `${n} none`).join('; ')}`);
}
