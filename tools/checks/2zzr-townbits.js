// tools/checks/2zzr-townbits.js — the water tower, the petrol station, the skate park
// (townbits.js).
//
// Built into the world and looked at there, flat and hilly:
// - the water tower: four iron legs from the ground to the tank; the tank's water held
//   in; the ladder up the front leg unbroken from the ground to the catwalk and the one
//   up the tank to the roof, each on a solid block; climbed on foot to the catwalk and
//   the roof, the catwalk walked round with no edge to fall off; the hatch open over
//   the water; lit;
// - the petrol station: each pump a dropper of coal facing the lane with the cell before
//   it open, a button on it that powers it; room under the canopy for a car and a
//   driver; the shop reached through its door; the price board;
// - the skate park: its ramps stairs; walked on foot up onto both decks of the half
//   pipe and the top of the pyramid; the rail, the ledge; graffiti of five colours and
//   more;
// - every spot a mob could stand lit (the shop to 8); every block one of Bedrock's own
//   states, and in Java one Java has.

import { readFileSync } from 'node:fs';

export const id = '2zzr';
export const label = '2zzr. the water tower, the petrol station, the skate park';

let MATERIALS;
const key = (p) => p.join(',');
const H4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const FD = { 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0] };

function tools(r, L0, probe, name) {
  const w = r.world;
  const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const st = (p, k) => { const i = w.get(...p); const d = i < 0 ? null : MATERIALS.def(i); const v = d ? d.states[k] : undefined; return v === undefined || v === null ? undefined : (v.value ?? v); };
  // (lifted on a hill after it was built: how far, from where its ground now is)
  let lift = 0; for (let d = -2; d <= 12; d++) if (raw([probe[0], probe[1] + d, probe[2]]) === name) { lift = d; break; }
  const L = (p) => [p[0], p[1] + lift, p[2]];
  const pass = (b) => b === 'air' || b === 'lantern' || /sign|button|carpet/.test(b);
  const climb = (b) => b === 'ladder';
  const floor = (b) => !pass(b) && !climb(b) && !/water|fence|bars/.test(b);
  const stand = (p) => (pass(raw(p)) || climb(raw(p))) && (pass(raw(add(p, [0, 1, 0]))) || climb(raw(add(p, [0, 1, 0])))) && (floor(raw(add(p, [0, -1, 0]))) || climb(raw(p)) || climb(raw(add(p, [0, -1, 0]))));
  const walk = (start, lot) => {
    let s0 = null; for (let d = 0; d <= 3 && !s0; d++) for (const dd of [d, -d]) if (!s0 && stand([start[0], start[1] + dd, start[2]])) s0 = [start[0], start[1] + dd, start[2]];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    const inLot = ([x, , z]) => x >= lot.x0 - 2 && x <= lot.x1 + 2 && z >= lot.z0 - 2 && z <= lot.z1 + 2;
    while (q.length) {
      const p = q.pop(), moves = [];
      for (const d of H4) for (const dy of [0, 1, -1]) moves.push(add(add(p, d), [0, dy, 0]));
      if (climb(raw(p)) || climb(raw(add(p, [0, -1, 0])))) moves.push(add(p, [0, 1, 0]), add(p, [0, -1, 0]));
      for (const n of moves) {
        if (seen.has(key(n)) || !inLot(n) || !stand(n)) continue;
        if (n[1] > p[1] && !climb(raw(p)) && !pass(raw(add(p, [0, 2, 0])))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    return seen;
  };
  return { w, raw, st, L, lift, walk, stand };
}

function inspectTower(r) {
  const T = r.landmarks.find((q) => q.kind === 'watertower');
  if (!T) return { built: false };
  const { raw, st, L, walk, w } = tools(r, T, T.legs[0], 'iron_block');
  const F = T.frame, out = { built: true };
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return L([x, y, z]); };
  const G = T.door[1] - 1;
  out.legs = T.legs.every((p) => { for (let y = p[1]; y < F.TF; y++) if (raw(L([p[0], y, p[2]])) !== 'iron_block') return false; return true; });
  const water = T.water.map(L), set = new Set(water.map(key));
  out.water = water.length >= 40 && water.every((p) => raw(p) === 'water' && [...H4, [0, -1, 0]].every((d) => { const n = add(p, d); return set.has(key(n)) || !/^(air|water)$/.test(raw(n)); }));
  const ladderOk = (col) => col.map(L).every((p, i, a) => raw(p) === 'ladder' && (i === 0 || p[1] === a[i - 1][1] + 1) && (() => { const d = FD[st(p, 'facing_direction')]; return !!d && !/air|ladder/.test(raw([p[0] - d[0], p[1], p[2] - d[2]])); })());
  out.ladders = ladderOk(T.ladder) && L(T.ladder[0])[1] === G + 1 + (L([0, 0, 0])[1]) && ladderOk(T.roofLadder) && L(T.roofLadder[T.roofLadder.length - 1])[1] === F.ROOF + L([0, 0, 0])[1];
  const seen = walk(L(T.door), T.lot);
  const cat = T.catwalk.map(L).filter((p) => seen.has(key(p)));
  out.walk = { catwalk: cat.length >= 10, roof: seen.has(key(at(F.c, F.c - 3, F.ROOF + 1))) };
  // no edge to fall off: from every catwalk cell walked, nothing beside it open to the drop
  out.edge = cat.every((p) => H4.every((d) => { const n = add(p, d); return raw(n) !== 'air' || raw(add(n, [0, -1, 0])) !== 'air'; }));
  const h = L(T.hatch);
  out.hatch = raw(h) === 'air' && raw(add(h, [0, 1, 0])) === 'air' && [1, 2].some((k) => raw(add(h, [0, -k, 0])) === 'water');
  out.top = raw(L(T.top)) === 'lantern' && T.lanterns.every((p) => raw(L(p)) === 'lantern' && raw(add(L(p), [0, -1, 0])) !== 'air');
  void w;
  return out;
}

function inspectPetrol(r) {
  const P = r.landmarks.find((q) => q.kind === 'petrol');
  if (!P) return { built: false };
  const { raw, st, L, walk, w } = tools(r, P, P.pumps[0].dropper, 'dropper');
  const F = P.frame, out = { built: true };
  const lift = L([0, 0, 0])[1], G = P.door[1] - 1 + lift;
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return [x, y, z]; };
  out.pumps = P.pumps.every((p) => {
    const d = L(p.dropper), b = L(p.button), o = L(p.out);
    const face = FD[st(d, 'facing_direction')], bf = FD[st(b, 'facing_direction')];
    const items = (w.getData(...d) || { tags: {} }).tags.Items;
    return raw(d) === 'dropper' && !!face && key(add(d, face)) === key(o) && raw(o) === 'air'
      && raw(b) === 'stone_button' && !!bf && key([b[0] - bf[0], b[1], b[2] - bf[2]]) === key(d)
      && !!items && items.v.every((it) => it.v.Name.v === 'minecraft:coal') && items.v.length >= 1;
  }) && P.pumps.length === 2;
  out.canopy = P.canopy.map(L).every((p) => raw(p) !== 'air') && [4, 5].every((v) => { for (let y = G + 1; y < G + 6; y++) if (raw(at(7, v, y)) !== 'air') return false; return true; });
  const seen = walk(L(P.door), P.lot);
  out.walk = { lane: seen.has(key(at(7, 4, G + 1))), shop: seen.has(key(at(7, 12, G + 1))), shelves: seen.has(key(at(9, 13, G + 1))) };
  const txt = (w.getData(...L(P.price)) || { tags: {} }).tags.FrontText;
  out.price = !!txt && /PETROL/.test(txt.v.Text.v);
  return out;
}

function inspectSkate(r) {
  const S = r.landmarks.find((q) => q.kind === 'skatepark');
  if (!S) return { built: false };
  const { raw, L, walk } = tools(r, S, S.features.rail[0], 'iron_bars');
  const F = S.frame, out = { built: true };
  const lift = L([0, 0, 0])[1], G = S.door[1] - 1 + lift;
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return [x, y, z]; };
  out.ramps = S.ramps.length >= 60 && S.ramps.map(L).every((p) => /stairs/.test(raw(p)));
  const seen = walk(L(S.door), S.lot);
  out.walk = { backDeck: seen.has(key(at(7, S.features.halfPipe.back, G + 4))), frontDeck: seen.has(key(at(7, S.features.halfPipe.front, G + 4))),
    bottom: seen.has(key(at(7, 12, G + 1))), pyramid: seen.has(key(L(S.features.pyramid))) };
  out.rail = S.features.rail.map(L).every((p) => raw(p) === 'iron_bars') && raw(L(S.features.ledge)) === 'smooth_stone_slab';
  out.colours = new Set(S.graffiti.map(L).map(raw).filter((b) => /concrete/.test(b))).size;
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots, TARGET } = await import('../../engine/lighting.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const Lt = { furnish: false, villagers: 0, fish: false, watertower: true, petrol: true, skatepark: true };
  check('defaults: none of them unless asked', !DEFAULTS.watertower && !DEFAULTS.petrol && !DEFAULTS.skatepark);
  const cities = [
    ['flat 320', generateCity({ ...DEFAULTS, ...Lt, size: 320, seed: 7, hills: 0 })],
    ['flat 256', generateCity({ ...DEFAULTS, ...Lt, size: 256, seed: 2, hills: 0 })],
    ['hilly 320', generateCity({ ...DEFAULTS, ...Lt, size: 320, seed: 7 })],
  ];
  const ts = cities.map(([n, r]) => [n, r, { tower: inspectTower(r), petrol: inspectPetrol(r), skate: inspectSkate(r) }]);
  const all = (k, f) => ts.every(([, , t]) => t[k].built && f(t[k]));
  const say = (k) => ts.map(([n, , t]) => `${n}: ${JSON.stringify(t[k])}`).join(' | ');
  check('all three built when asked, flat and hilly', ['tower', 'petrol', 'skate'].every((k) => all(k, () => true)), ts.map(([n, r]) => `${n}: ${['watertower', 'petrol', 'skatepark'].map((k) => r.stats[k + 'Missing'] ? `${k} missing` : k).join(', ')}`).join(' | '));
  check('water tower: four iron legs from the ground to the tank; the tank\'s water held in', all('tower', (t) => t.legs && t.water), say('tower'));
  check('water tower: both ladders unbroken, each on a solid block, from the ground to the catwalk and from the catwalk to the roof', all('tower', (t) => t.ladders), say('tower'));
  check('water tower: climbed on foot to the catwalk and the roof; the catwalk walked round with no edge to fall off; the hatch open over the water; lanterns on posts and a lamp on top', all('tower', (t) => t.walk.catwalk && t.walk.roof && t.edge && t.hatch && t.top), say('tower'));
  check('petrol station: each pump a dropper of coal facing the lane, the cell before it open, a button on it', all('petrol', (t) => t.pumps), say('petrol'));
  check('petrol station: room under the canopy over the lane; walked on foot to the lane, through the shop door to its counter and shelves; the price board', all('petrol', (t) => t.canopy && Object.values(t.walk).every(Boolean) && t.price), say('petrol'));
  check('skate park: its ramps stairs; walked up onto both decks of the half pipe and the top of the pyramid, and down into its bottom', all('skate', (t) => t.ramps && Object.values(t.walk).every(Boolean)), say('skate'));
  check('skate park: the grind rail and the ledge; graffiti of five colours and more', all('skate', (t) => t.rail && t.colours >= 5), say('skate'));
  {
    let dark = 0, dim = 0, spots = 0;
    for (const [, r] of ts) {
      const map = lightMap(r.world);
      for (const kind of ['watertower', 'petrol', 'skatepark']) {
        const Lm = r.landmarks.find((q) => q.kind === kind); if (!Lm) continue;
        const lot = Lm.lot, shop = kind === 'petrol' ? new Set() : null;
        if (shop) for (let u = 3; u <= 11; u++) for (let v = 11; v <= 14; v++) shop.add(Lm.frame.at(u, v).join(','));
        for (const [x, , z, lv] of spawnSpots(r.world, map, (x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1)) {
          spots++;
          if (lv < 1) dark++;
          else if (shop && shop.has(x + ',' + z) && lv < TARGET) dim++;
        }
      }
    }
    check(`all three lit: no spot a mob could stand on dark, the shop at ${TARGET} and more`, dark === 0 && dim === 0 && spots > 200, `${dark} dark, ${dim} dim in the shop, of ${spots}`);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      if (/dropper|stone_button|quartz_stairs|smooth_stone_slab|ladder|iron_bars|concrete|barrel/.test(n)) {
        const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])));
        const props = java.get(j.name);
        if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
      }
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, the droppers, buttons, stairs, slabs, ladders and the rest each a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 4).join(', '));
  }
  note(`townbits: ${ts.map(([n, , t]) => `${n} tower ${t.tower.built}, petrol ${t.petrol.built}, skate ${t.skate.built}`).join('; ')}`);
}
