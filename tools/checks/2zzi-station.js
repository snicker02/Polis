// tools/checks/2zzi-station.js — the railway station (station.js).
//
// Built into the world and looked at there: on a lot a line runs along, facing it,
// by a line's stop; the rail along its whole front still there (the station never
// breaks the line); the canopy out over the track with room for a rider under it
// (nothing in the three cells over any rail before the station); the clock, a
// frame holding a clock on a dark face in its quartz ring; benches; the booking
// hall's counter reached on foot from the platform, through the doorway. With the
// railway, with trams, on a fitted city; with roads only, no station and the
// summary saying it needs a railway. Found in the game: a goto_station function and
// the guide's list of where every landmark is. Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzi';
export const label = '2zzi. the railway station';

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, station: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['railway 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, transit: 'rails' })],
    ['railway, small blocks', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10, transit: 'rails' })],
    ['trams 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99, transit: 'trams' })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no station unless asked', DEFAULTS.station === false);
  const inspect = (r) => {
    const S = r.landmarks.find((Lm) => Lm.kind === 'station');
    if (!S) return { built: false };
    const w = r.world, fr = S.frame;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    let lift = 0; { const [x, y, z] = S.clock.frame; for (let d = -3; d <= 10; d++) if (blk(x, y + d, z) === 'frame') { lift = d; break; } }
    const Lf = ([x, y, z]) => [x, y + lift, z];
    // (a block found in its own column: on gentle hills the lot stands on a terrace
    // over the street, the hall raised with it and the canopy over the street not)
    const found = ([x, y, z], name) => { for (let d = -3; d <= 6; d++) if (blk(x, y + d, z) === name) return true; return false; };
    const out = { built: true, wide: S.wide, stop: S.stop };
    // the rail along its front, whole; nothing in the three cells over it before the station
    const G = S.door[1] - 1;
    const railY = (x, z) => { for (let y = G - 4 + lift; y <= G + 8 + lift; y++) if (/rail/.test(blk(x, y, z))) return y; return null; };
    const front = [...Array(fr.W).keys()].map((u) => fr.at(u, fr.railV));
    out.railWhole = front.every(([x, z]) => railY(x, z) !== null);
    out.headroom = front.every(([x, z]) => { const y = railY(x, z); return y !== null && [1, 2, 3].every((d) => blk(x, y + d, z) === 'air'); });
    // the canopy over the track
    const canopyOver = front.filter(([x, z]) => S.canopy.some((c) => c[0] === x && c[2] === z)).length;
    out.canopy = canopyOver >= Math.ceil(fr.W / 2) && S.canopy.every((c) => found(c, 'smooth_quartz'));
    // the clock
    const [fxx, fy, fz] = Lf(S.clock.frame);
    const data = w.data && w.data.get ? [...w.data.entries()].find(([k, v]) => v && v.id === 'ItemFrame' && JSON.stringify(v.tags.Item).includes('minecraft:clock')) : null;
    const [cx, cyy, cz] = Lf(S.clock.face);
    out.clock = blk(fxx, fy, fz) === 'frame' && !!data && blk(cx, cyy, cz) === 'black_concrete' && [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]].every(([a, b]) => {
      const [x2, z2] = fr.at(fr.mid + a, 0); return blk(x2, cyy + b, z2) === 'quartz_block'; });
    out.benches = S.benches.filter((b) => found(b, 'oak_stairs')).length;
    // on foot: from the platform (between the rail and the front) through the doorway to the counter
    const key = (p) => p.join(',');
    const pass = (b) => b === 'air' || /sign|lantern|frame/.test(b);
    const solid = (b) => b !== 'air' && !/sign|lantern|rail|water/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && solid(blk(x, y - 1, z));
    const [px, pz] = fr.at(fr.mid, fr.railV + 1);
    let py = null; for (let y = G - 3 + lift; y <= G + 6 + lift; y++) if (stand(px, y, pz)) { py = y; break; }
    const walk = new Set(), q = [];
    if (py !== null) { walk.add(key([px, py, pz])); q.push([px, py, pz]); }
    const near = (x, z) => Math.abs(x - px) + Math.abs(z - pz) <= 40;
    while (q.length && walk.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !near(n[0], n[2]) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
    const [kx, kz] = fr.at(fr.mid, fr.D - 4);
    out.reach = [...walk].some((k) => { const [x, , z] = k.split(',').map(Number); return x === kx && z === kz; });
    return out;
  };
  const ts = cities.map(([n, r]) => [n, inspect(r)]);
  const all = (f) => ts.every(([, t]) => t.built && f(t));
  check('station: built when asked, with the railway, with trams, on a fitted city; by a line\'s stop', ts.every(([, t]) => t.built) && all((t) => t.stop), ts.map(([n, t]) => `${n}: ${t.built ? t.wide + ' wide' : 'none'}`).join(', '));
  check('station: the rail along its whole front still there (the line not broken)', all((t) => t.railWhole));
  check('station: the canopy out over the track, room for a rider under it (nothing in the three cells over the rail)', all((t) => t.canopy && t.headroom));
  check('station: the clock, a frame holding a clock on a dark face in a quartz ring', all((t) => t.clock));
  check('station: benches, on the platform and in the hall', all((t) => t.benches >= 4), ts.map(([n, t]) => `${n}: ${t.benches}`).join(', '));
  check('station: the ticket counter reached on foot from the platform, through the doorway', all((t) => t.reach));
  {
    const r = generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, transit: 'roads' });
    check('station: with roads only, none, and the summary says it needs a railway or trams', !r.landmarks.some((Lm) => Lm.kind === 'station') && /railway or trams/.test(r.stats.stationMissing || ''));
  }
  // found in the game: every landmark a spot on the street before it to stand on
  // (two air over something solid, never water or a rail), a goto_<kind> function to
  // it from build_centered's marker, and the guide's list naming where it is
  {
    const { functionFiles, placementGuide, tileList } = await import('../../engine/export.js');
    const bad = [];
    for (const [n, r] of cities) {
      const w = r.world, blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
      if (!r.places || r.places.length !== r.landmarks.length) { bad.push(`${n}: ${r.places ? r.places.length : 0} places for ${r.landmarks.length} landmarks`); continue; }
      for (const P of r.places) {
        const [x, y, z] = P.at, under = blk(x, y - 1, z);
        if (blk(x, y, z) !== 'air' || blk(x, y + 1, z) !== 'air' || /air|water|rail|lava/.test(under)) bad.push(`${n} ${P.id}: on ${under}`);
      }
      const opts = { namespace: 'chk', places: r.places, spawns: r.spawns, centre: r.world.centre, world: r.world };
      const tiles = tileList(r.world, opts);
      const fns = functionFiles(tiles, r.world, opts), guide = placementGuide(tiles, opts);
      const go = fns.find((f) => f.fn === 'chk/goto_station');
      if (!go || !/^execute at @e\[type=armor_stand,name=chk_centre,c=1\] run tp @s ~-?\d* ~-?\d* ~-?\d* facing ~-?\d* ~-?\d* ~-?\d*$/m.test(go.text)) bad.push(`${n}: no goto_station`);
      if (!/WHERE THINGS ARE[\s\S]*Station\s+\d+ (east|west)/.test(guide)) bad.push(`${n}: the guide does not say where the station is`);
      if (new Set(r.places.map((P) => P.id)).size !== r.places.length) bad.push(`${n}: two places with one name`);
    }
    check('station (and every landmark): a spot before it to stand on, a goto function to it, the guide saying where it is', bad.length === 0, bad.slice(0, 4).join('; '));
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('station: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
