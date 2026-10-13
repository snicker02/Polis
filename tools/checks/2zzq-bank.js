// tools/checks/2zzq-bank.js — the bank (bank.js): its vault's combination lock.
//
// Built into the world, and the lock followed through for every one of the thirty-two
// ways its five levers can be set, block by block as redstone works: a lever powers
// the block it is on (strongly); a torch is lit unless the block it hangs on is
// powered, and powers the dust and the things beside it and the block over it; dust
// takes power beside a strongly powered block or a lit torch, loses one a block along
// its line, powers the block under it and the blocks it points into (a line points
// both ways along itself, a dust on its own all four); a door opens beside a powered
// block or a source. The door must open for the code and for nothing else, and the
// lamp over it light with it; the button inside opens it too. With the door shut the
// vault is reached by no other way on foot; with it open, every part of it. The code
// on the manager's sign the code the lock wants. The vault's gold, emeralds and
// safe-deposit wall; lit inside; every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzq';
export const label = '2zzq. the bank';

let MATERIALS;
const key = (p) => p.join(',');
const H4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const N6 = [...H4, [0, 1, 0], [0, -1, 0]];
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

function inspect(r) {
  const B = r.landmarks.find((L) => L.kind === 'bank');
  if (!B) return { built: false };
  const w = r.world, F = B.frame;
  const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const st = (p, k) => { const i = w.get(...p); const d = i < 0 ? null : MATERIALS.def(i); const v = d ? d.states[k] : undefined; return v === undefined || v === null ? undefined : (v.value ?? v); };
  const [hx, hz] = F.at(F.mid - 1, 4);
  let lift = 0; for (let d = -3; d <= 12; d++) if (/quartz_block|calcite/.test(raw([hx, B.door0[1] - 1 + d, hz])) && raw([hx, B.door0[1] + d, hz]) === 'air') { lift = d; break; }
  const L = (p) => [p[0], p[1] + lift, p[2]];
  const out = { built: true, lift };
  const CONDUCT = (b) => !/^(air|glass|redstone_wire|redstone_torch|unlit_redstone_torch|lever|stone_button|iron_door|redstone_lamp|chest|barrel|wall_sign|standing_sign|lantern|sea_lantern|iron_bars)$/.test(b);
  const DIRV = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
  const leverBlock = (p) => add(p, DIRV[{ north: 'south', south: 'north', east: 'west', west: 'east' }[st(p, 'lever_direction')]]);
  const torchBlock = (p) => { const f = st(p, 'torch_facing_direction'); return f === 'top' ? add(p, [0, -1, 0]) : add(p, DIRV[f]); };
  const buttonBlock = (p) => add(p, [[0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]][st(p, 'facing_direction')]);
  // every redstone part of the bank, by position
  const parts = { levers: B.levers.map((l) => L(l.lever)), torches: [], dust: [] };
  for (let x = B.lot.x0; x <= B.lot.x1; x++) for (let z = B.lot.z0; z <= B.lot.z1; z++) for (let y = B.door0[1] - 2 + lift; y <= B.door0[1] + 10 + lift; y++) {
    const b = raw([x, y, z]);
    if (b === 'redstone_torch') parts.torches.push([x, y, z]);
    if (b === 'redstone_wire') parts.dust.push([x, y, z]);
  }
  const dustSet = new Set(parts.dust.map(key));
  const torchSet = new Set(parts.torches.map(key));
  // a dust's connections: dust beside it (up or down a step where nothing conducting is in the way), and torches beside it
  const conn = (p) => {
    const c = [];
    for (const d of H4) {
      const n = add(p, d);
      if (dustSet.has(key(n)) || torchSet.has(key(n))) { c.push(d); continue; }
      if (!CONDUCT(raw(add(p, [0, 1, 0]))) && dustSet.has(key(add(n, [0, 1, 0])))) { c.push(d); continue; }
      if (!CONDUCT(raw(n)) && dustSet.has(key(add(n, [0, -1, 0])))) c.push(d);
    }
    return c;
  };
  const pointsOf = (p) => {
    const c = conn(p);
    if (c.length === 0) return H4;
    const alongX = c.every((d) => d[0] !== 0), alongZ = c.every((d) => d[2] !== 0);
    if (alongX) return [[1, 0, 0], [-1, 0, 0]];
    if (alongZ) return [[0, 0, 1], [0, 0, -1]];
    return c;
  };
  // the world settled with these levers on (and the button pressed or not)
  const settle = (on, pressed = false) => {
    const strong = new Set(), sources = new Set();
    parts.levers.forEach((lv, k) => { if (on[k]) { strong.add(key(leverBlock(lv))); sources.add(key(lv)); } });
    if (pressed) { const bt = L(B.vault.button); strong.add(key(buttonBlock(bt))); sources.add(key(bt)); }
    // torches: settle in rounds (a torch out powers nothing; its block powered by dust from another torch)
    let lit = new Set(parts.torches.map(key)), dust = new Map(), weak = new Set();
    for (let round = 0; round < 8; round++) {
      dust = new Map(); const q = [];
      const seed = (p, s) => { if (dustSet.has(key(p)) && (dust.get(key(p)) || 0) < s) { dust.set(key(p), s); q.push(p); } };
      for (const k of strong) { const p = k.split(',').map(Number); for (const d of N6) seed(add(p, d), 15); }
      for (const k of lit) { const p = k.split(',').map(Number); const tb = key(torchBlock(p)); for (const d of N6) { const n = add(p, d); if (key(n) !== tb) seed(n, 15); } }
      while (q.length) {
        const p = q.shift(), s = dust.get(key(p));
        if (s <= 1) continue;
        for (const d of conn(p)) {
          for (const n of [add(p, d), add(add(p, d), [0, 1, 0]), add(add(p, d), [0, -1, 0])]) if (dustSet.has(key(n)) && (dust.get(key(n)) || 0) < s - 1) { dust.set(key(n), s - 1); q.push(n); }
        }
      }
      weak = new Set();
      for (const [k] of dust) { const p = k.split(',').map(Number); weak.add(key(add(p, [0, -1, 0]))); for (const d of pointsOf(p)) { const n = add(p, d); if (CONDUCT(raw(n))) weak.add(key(n)); } }
      const strongTorch = new Set([...lit].map((k) => key(add(k.split(',').map(Number), [0, 1, 0]))));
      const powered = (p) => strong.has(key(p)) || weak.has(key(p)) || strongTorch.has(key(p));
      const next = new Set(parts.torches.filter((t) => !powered(torchBlock(t))).map(key));
      const same = next.size === lit.size && [...next].every((k) => lit.has(k));
      lit = next;
      if (same) break;
    }
    const strongTorch = new Set([...lit].map((k) => key(add(k.split(',').map(Number), [0, 1, 0]))));
    const poweredBlock = (p) => CONDUCT(raw(p)) && (strong.has(key(p)) || weak.has(key(p)) || strongTorch.has(key(p)));
    const active = (p) => N6.some((d) => { const n = add(p, d); return poweredBlock(n) || sources.has(key(n)) || lit.has(key(n)); });
    return { doorOpen: active(L(B.door.lower)) || active(L(B.door.upper)), lamp: active(L(B.door.lamp)) };
  };
  const code = B.levers.map((l) => l.on);
  const results = [];
  for (let m = 0; m < 32; m++) { const on = [0, 1, 2, 3, 4].map((k) => ((m >> k) & 1) === 1); results.push({ on, ...settle(on) }); }
  const right = results.filter((x) => x.on.every((b, k) => b === code[k]));
  out.lock = {
    opensForCode: right.length === 1 && right[0].doorOpen && right[0].lamp,
    shutOtherwise: results.filter((x) => !x.on.every((b, k) => b === code[k])).every((x) => !x.doorOpen && !x.lamp),
    opened: results.filter((x) => x.doorOpen).length,
    button: settle([false, false, false, false, false], true).doorOpen,
    levers: parts.levers.every((p) => raw(p) === 'lever') && parts.levers.length === 5,
  };
  // the code on the manager's sign
  const txt = (w.getData(...L(B.hint)) || { tags: {} }).tags.FrontText;
  out.hint = !!txt && txt.v.Text.v.includes(code.map((b) => (b ? 'on' : 'off')).join(' '));
  // the vault's contents
  const V = B.vault;
  const emeralds = V.chests.every((c) => { const d = w.getData(...L(c)); return d && d.tags.Items.v.some((it) => it.v.Name.v === 'minecraft:emerald'); });
  out.vault = { gold: V.gold.filter((p) => raw(L(p)) === 'gold_block').length, chests: V.chests.length, emeralds, deposit: V.deposit.filter((p) => raw(L(p)) === 'barrel').length };
  // on foot: the door shut, then open (treated as a doorway)
  const walk = (doorOpen) => {
    const doorCells = new Set([key(L(B.door.lower)), key(L(B.door.upper))]);
    const pass = (p) => { const b = raw(p); return b === 'air' || b === 'lantern' || /sign|lever|button|carpet/.test(b) || (doorOpen && doorCells.has(key(p))); };
    const floor = (p) => { const b = raw(p); return b !== 'air' && !pass(p) && !/bars|iron_door/.test(b); };
    const stand = (p) => pass(p) && pass(add(p, [0, 1, 0])) && floor(add(p, [0, -1, 0]));
    const inLot = ([x, , z]) => x >= B.lot.x0 - 1 && x <= B.lot.x1 + 1 && z >= B.lot.z0 - 1 && z <= B.lot.z1 + 1;
    const s0 = L(B.door0), seen = new Set([key(s0)]), q = [s0];
    while (q.length) { const p = q.pop(); for (const d of H4) for (const dy of [0, 1, -1]) { const n = add(add(p, d), [0, dy, 0]); if (seen.has(key(n)) || !inLot(n) || !stand(n)) continue; if (dy > 0 && !pass(add(p, [0, 2, 0]))) continue; seen.add(key(n)); q.push(n); } }
    return seen;
  };
  const shut = walk(false), open = walk(true);
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return [x, y + lift, z]; };
  const G = B.door0[1] - 1;
  const inVault = (S) => [...S].some((k) => { const [x, , z] = k.split(',').map(Number); for (let v = F.VW + 1; v < F.D - 1; v++) for (let u = 1; u < F.W - 1; u++) { const [a, b] = F.at(u, v); if (a === x && b === z) return true; } return false; });
  out.walk = { tellers: shut.has(key(at(5, F.VW - 1, G + 1))), levers: shut.has(key(at(5, F.VW - 2, G + 1))), shutKeepsOut: !inVault(shut),
    openLetsIn: open.has(key(at(F.UD, F.VW + 2, G + 1))) && open.has(key(at(8, F.D - 4, G + 1))) };
  out.inside = new Set(); for (let v = 1; v < F.D - 1; v++) for (let u = 1; u < F.W - 1; u++) out.inside.add(F.at(u, v).join(','));
  out.yr = [G + 1 + lift, F.TOP + lift - 1];
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots, TARGET } = await import('../../engine/lighting.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const Lb = { furnish: false, villagers: 0, fish: false, bank: true };
  check('defaults: no bank unless asked', DEFAULTS.bank === false);
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...Lb, size: 256, seed: 7, hills: 0 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...Lb, size: 320, seed: 12345, hills: 0 })],
    ['hilly 256', generateCity({ ...DEFAULTS, ...Lb, size: 256, seed: 7 })],
  ];
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('bank: built when asked, flat and hilly', all(() => true), ts.map(([n, r, t]) => `${n}: ${t.built ? 'built' : r.stats.bankMissing}`).join(', '));
  check('bank: the codes differ from city to city', new Set(ts.filter(([, , t]) => t.built).map(([, r]) => r.landmarks.find((q) => q.kind === 'bank').codeWords)).size >= 2, ts.map(([, r]) => (r.landmarks.find((q) => q.kind === 'bank') || {}).codeWords).join(' | '));
  check('bank: the vault door opens for the code, and the lamp over it lights (followed through, block by block)', all((t) => t.lock.levers && t.lock.opensForCode), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.lock)}`).join(' | '));
  check('bank: for every other one of the thirty-two ways to set the levers, the door stays shut and the lamp dark', all((t) => t.lock.shutOtherwise && t.lock.opened === 1), ts.map(([n, , t]) => `${n}: opens for ${t.lock.opened}`).join(', '));
  check('bank: the button inside opens the door (to let yourself out)', all((t) => t.lock.button));
  check('bank: the code on the manager\'s sign the code the lock wants', all((t) => t.hint));
  check('bank: the vault: gold blocks, chests of emeralds, a safe-deposit wall of barrels', all((t) => t.vault.gold >= 8 && t.vault.chests >= 4 && t.vault.emeralds && t.vault.deposit >= 20), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.vault)}`).join(' | '));
  check('bank: on foot, through the gap in the counter to the levers; with the door shut no way into the vault, with it open every part of it', all((t) => Object.values(t.walk).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.walk)}`).join(' | '));
  {
    let dim = 0, spots = 0;
    for (const [, r, t] of ts) {
      if (!t.built) continue;
      const map = lightMap(r.world);
      for (const [, y, , lv] of spawnSpots(r.world, map, (x, z) => t.inside.has(x + ',' + z))) { if (y < t.yr[0] || y > t.yr[1]) continue; spots++; if (lv < TARGET) dim++; }
    }
    check(`bank: lit inside, every spot a mob could stand at ${TARGET} and more (the lock's sealed room too)`, dim === 0 && spots > 100, `${dim} dim of ${spots}`);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('bank: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  note(`bank codes: ${ts.map(([n, r]) => `${n} ${(r.landmarks.find((q) => q.kind === 'bank') || {}).codeWords}`).join('; ')}`);
}
