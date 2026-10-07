// tools/checks/2zz-jail.js — the jail (jail.js): every hostile mob that can be
// held, behind bars, and none of them getting out.
//
// Built into the world and looked at there: from each inmate, where it could
// move (air and water; not walls, bars, glass, fences, slabs): its own cell or
// hall only, never the street or the corridor. From the door, where a visitor
// can walk (never on a fence: a block and a half high): the corridor on every
// floor. The corridor's ceiling a slab low its whole length (no enderman fits).
// No spot a visitor reaches within four of a creeper (a creeper lights within
// three). The pack's populate summons every inmate, each by name. On flat cities
// and on a player's own fitted one (the jail rides up with the ground).

import { readFileSync } from 'node:fs';

export const id = '2zz';
export const label = '2zz. the jail';

let MATERIALS, MAT;

function inspectJail(r) {
  const J = r.landmarks.find((L) => L.kind === 'jail');
  if (!J) return { built: false };
  const w = r.world;
  const blockOf = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  // what a mob can move through: air and water (not walls, bars, glass, fences, slabs, stairs)
  // (a lantern hangs in the air; a sea lantern is a whole block)
  const open = (x, y, z) => { const b = blockOf(x, y, z); return b === 'air' || b === 'water' || b === 'lantern' || b === 'soul_lantern' || b === 'rail'; };
  const fill = (x, y, z, limit = 4000) => {
    const seen = new Set([x + ',' + y + ',' + z]), q = [[x, y, z]];
    while (q.length && seen.size < limit) {
      const [a, b, c] = q.pop();
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const k = (a + dx) + ',' + (b + dy) + ',' + (c + dz);
        if (seen.has(k) || !open(a + dx, b + dy, c + dz)) continue;
        seen.add(k); q.push([a + dx, b + dy, c + dz]);
      }
    }
    return seen;
  };
  // each inmate's space: small (its own room), never the door's space
  const fr0 = J.frame;
  const [fx, fz] = fr0.at(7, 10);
  let lift = 0;
  for (let d = -3; d <= 6; d++) if (/polished_blackstone_bricks$/.test(blockOf(fx, fr0.floorY(0) + d, fz)) && blockOf(fx, fr0.floorY(0) + d + 1, fz) === 'air') { lift = d; break; }
  const FY = (f) => fr0.floorY(f) + lift;
  const [dx0, dz0] = [J.door[0], J.door[2]]; const dy0 = J.door[1] + lift;
  const outside = fill(dx0, dy0, dz0, 20000);
  const res = { mobWidth: inspectJail.widths, lift, built: true, inmates: J.inmates.length, kinds: new Set(J.inmates.map((m) => m.type)).size, escaped: [], spaces: [] };
  const spaceOf = new Map();
  for (const m of J.inmates) {
    const k = Math.floor(m.x) + ',' + m.y + ',' + Math.floor(m.z);
    if (!open(Math.floor(m.x), m.y, Math.floor(m.z))) { res.escaped.push(`${m.type}: spawns inside a block (${blockOf(Math.floor(m.x), m.y, Math.floor(m.z))})`); continue; }
    const sp = fill(Math.floor(m.x), m.y, Math.floor(m.z));
    if (sp.size >= 4000 || outside.has(k)) {
      const fp = new Set(); for (let v = 0; v < J.frame.DEPTH; v++) for (let u = 0; u < J.frame.W; u++) fp.add(J.frame.at(u, v).join(','));
      // the first cells of its space that are outside the cell's own box, in the order the fill found them
      const c = J.cells[m.cell], box = new Set(); if (c) for (let u = c.u[0]; u <= c.u[1]; u++) for (let v = c.v[0]; v <= c.v[1]; v++) box.add(J.frame.at(u, v).join(','));
      const leak = [...sp].filter((q3) => { const [x, , z] = q3.split(',').map(Number); return !box.has(x + ',' + z); }).slice(0, 4);
      res.escaped.push(`${m.type}: its space reaches the street or the corridor (${sp.size} cells), first outside its cell: ${leak.join(' ')}`);
    }
    res.spaces.push(`${m.type}:${sp.size}`);
  }
  // visitors: the corridor of each floor reachable from the door (walking: two of air above a solid floor)
  const walk = new Set([dx0 + ',' + dy0 + ',' + dz0]); const q = [[dx0, dy0, dz0]];
  const stand = (x, y, z) => { const b = blockOf(x, y, z), a = blockOf(x, y + 1, z), u = blockOf(x, y - 1, z); return (b === 'air' || /lantern|slab/.test(b) && false || /stairs/.test(b)) && (a === 'air' || /slab|lantern/.test(a)) && u !== 'air' && u !== 'water' && !/fence/.test(u); };   // (no one stands on a fence: it is a block and a half high)
  while (q.length && walk.size < 30000) {
    const [a, b, c] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
      const x = a + dx, y = b + dy, z = c + dz, k = x + ',' + y + ',' + z;
      if (walk.has(k) || !stand(x, y, z)) continue;
      if (dy === 1 && blockOf(a, b + 2, c) !== 'air' && !/slab/.test(blockOf(a, b + 2, c))) continue;
      walk.add(k); q.push([x, y, z]);
    }
  }
  const fr = J.frame, corr = [...Array(fr.FLOORS || 3).keys()].map((f) => { const [x, z] = fr.at(7, 7); return walk.has(x + ',' + (FY(f) + 1) + ',' + z); });
  // every inmate's body inside its cell with room: its half width and a tenth
  // clear of the walls on every side (a wide one spawned against a wall is pushed
  // out of it by the game, and not always back into the cell)
  const { MOB_WIDTH } = res.widths || {};
  res.tight = [];
  for (const m of J.inmates) {
    if (m.cell === undefined) continue;
    const c = J.cells[m.cell], half = ((res.mobWidth || {})[m.type] || 1) / 2 + 0.1;
    const xs = [], zs = []; for (const u of c.u) for (const v of c.v) { const [x, z] = fr.at(u, v); xs.push(x, x + 1); zs.push(z, z + 1); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (m.x - half < x0 || m.x + half > x1 || m.z - half < z0 || m.z + half > z1) res.tight.push(`${m.type} (${(half * 2 - 0.2).toFixed(2)} wide) in a cell ${x1 - x0} by ${z1 - z0}`);
  }
  res.corridors = corr;
  // creepers: no walkable spot within 4
  let near = 0;
  const inside = new Set(); for (let v = 0; v < fr.DEPTH; v++) for (let u = 0; u < fr.W; u++) inside.add(fr.at(u, v).join(','));
  for (const m of J.inmates.filter((q2) => q2.type === 'creeper')) for (const k of walk) { const [x, y, z] = k.split(',').map(Number); if (!inside.has(x + ',' + z)) continue; if (Math.hypot(x + 0.5 - m.x, z + 0.5 - m.z) < 4 && Math.abs(y - m.y) < 3) near++; }
  res.creeperNear = near;
  res.creeperSpots = [];
  const uvOf = new Map(); for (let v = -1; v <= fr.DEPTH; v++) for (let u = -1; u <= fr.W; u++) uvOf.set(fr.at(u, v).join(','), `u${u}v${v}`);
  for (const m of J.inmates.filter((q2) => q2.type === 'creeper')) for (const k of walk) { const [x, y, z] = k.split(',').map(Number); if (!inside.has(x + ',' + z)) continue; if (Math.hypot(x + 0.5 - m.x, z + 0.5 - m.z) < 4 && Math.abs(y - m.y) < 3) res.creeperSpots.push(`${uvOf.get(x + ',' + z)}@${y - FY(0)}`); }
  // the corridor's ceiling: a slab at its top row all along, every floor
  let lowGaps = 0;
  // (a slab, or anything solid: a wall where the corridor ends, a sea lantern the
  // lighting set in; only open air there would let an enderman stand)
  for (let f = 0; f < (fr.FLOORS || 3); f++) for (let v = 4; v <= fr.E; v++) for (let u = 6; u <= 8; u++) { const [x, z] = fr.at(u, v); const b = blockOf(x, FY(f) + 3, z); if (b === 'air' || b === 'water') lowGaps++; }
  res.enderGaps = lowGaps;
  return res;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS, MAT } = await import('../../engine/materials.js'));
  const { buildStructures, functionFiles } = await import('../../engine/export.js');
  const { HOSTILE_KINDS } = await import('../../engine/hostiles.js');
  const { JAIL_CELLS, MOB_WIDTH } = await import('../../engine/jail.js');
  inspectJail.widths = MOB_WIDTH;
  const L = { furnish: false, villagers: 0, fish: false };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, jail: true })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345, jail: true })],
    ['a player\'s fitted city', generateCity({ ...DEFAULTS, ...fx.settings, ...L, jail: true, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no jail unless asked', DEFAULTS.jail === false);
  const kindsWanted = new Set([...JAIL_CELLS.flatMap((c) => c.kinds), 'creeper', 'guardian', 'ghast']);
  check('jail: every kind it holds is one Polis can summon', [...kindsWanted].every((k) => HOSTILE_KINDS[k] && HOSTILE_KINDS[k].be), [...kindsWanted].filter((k) => !HOSTILE_KINDS[k]).join(','));
  let built = 0, escaped = [], corridorsOk = 0, enderGaps = 0, creeperNear = 0, kindsAll = 0, tight = [];
  for (const [name, r] of cities) {
    const t = inspectJail(r);
    if (!t.built) { escaped.push(`${name}: no jail`); continue; }
    built++;
    if (t.kinds === kindsWanted.size) kindsAll++;
    escaped.push(...t.escaped.map((e) => `${name}: ${e}`));
    if (t.corridors.every(Boolean)) corridorsOk++;
    enderGaps += t.enderGaps; creeperNear += t.creeperNear; tight.push(...t.tight.map((q) => `${name}: ${q}`));
  }
  check('jail: built when asked, on flat cities and on a fitted one', built === cities.length, `${built} of ${cities.length}`);
  check('jail: every kind it holds is in it', kindsAll === built && built > 0, `${kindsAll} of ${built}`);
  check("jail: no inmate can get out (each one's space its own cell or hall)", escaped.length === 0, escaped.slice(0, 3).join('; '));
  check('jail: a visitor walks in from the street to the corridor on every floor', corridorsOk === built, `${corridorsOk} of ${built}`);
  check("jail: the corridor's ceiling a slab low all along (no enderman fits under it)", enderGaps === 0, `${enderGaps} gaps`);
  check('jail: no visitor within four of a creeper (one lights within three)', creeperNear === 0, `${creeperNear} spots`);
  check('jail: every inmate fits its cell with room, even the widest (a ravager, a slime at its biggest)', tight.length === 0, tight.slice(0, 3).join('; '));
  // the pack: every inmate summoned in populate, each by name (a named mob is kept)
  {
    const r = cities[0][1], w = r.world;
    const blockOf = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
    const fns = functionFiles(buildStructures(w, {}), w, { namespace: 'test', spawns: r.spawns, inmates: r.inmates });
    const pop = fns.find((f) => /(^|\/)populate\.mcfunction$/.test(f.name));
    const text = !pop ? '' : typeof pop.data === 'string' ? pop.data : pop.data ? new TextDecoder().decode(pop.data) : (pop.text || '');
    const lines = text.split('\n');
    const summons = lines.filter((l) => /^summon minecraft:\S+ \S+ \S+ \S+ 0 0 polis:keep Inmate$/.test(l));
    check('jail: populate summons every inmate, each kept by the pack (polis:keep) and named', summons.length === r.inmates.length && r.inmates.length > 0, `${summons.length} of ${r.inmates.length}`);
    // The enderman in a minecart on its cell's rail (riding, it cannot teleport),
    // placed as the pair a player saved from their own trap, in the structures with
    // the villagers: the minecart's link naming that enderman, the enderman already
    // riding (summoned and set riding by command, it was not always in it). Read
    // from the structure the pack loads. No enderman summoned any more.
    {
      const { buildMobStructures } = await import('../../engine/export.js');
      const { decodeNbt } = await import('../nbt-read.js');
      const rider = r.spawns.find((p) => p.type === 'ender_rider');
      const onRail = rider && blockOf(rider.x, rider.y, rider.z) === 'rail';
      let linked = false, riding = false, kept = false;
      if (rider) for (const t of buildMobStructures(r.spawns, { seed: 1 })) {
        const ents = decodeNbt(t.data).root.structure.entities;
        const ender = ents.find((e) => e.identifier === 'minecraft:enderman');
        const cart = ents.find((e) => e.identifier === 'minecraft:minecart');
        if (!ender || !cart) continue;
        linked = (cart.LinksTag || []).some((l) => String(l.entityID) === String(ender.UniqueID));
        riding = ender.definitions.includes('+minecraft:riding') && ender.definitions.includes('-minecraft:not_riding');
        kept = ender.Persistent === 1 && ender.CustomName === 'Inmate'
          && Math.floor(ender.Pos[0]) === rider.x && Math.floor(ender.Pos[2]) === rider.z && Math.floor(cart.Pos[0]) === rider.x;
      }
      const summoned = [...lines, ...((fns.find((f) => /(^|\/)jail\.mcfunction$/.test(f.name)) || {}).text || '').split('\n')].some((l) => /^summon minecraft:enderman /.test(l));
      check('jail: the enderman rides a minecart on its cell\'s rail, placed riding (the trap a player saved), not summoned', onRail && linked && riding && kept && !summoned, `rail ${!!onRail}, linked ${linked}, riding ${riding}, kept ${kept}, summoned ${summoned}`);
    }
    // every summon in every function names an entity /summon may create: one that
    // may not (zombie_villager_v2) and Bedrock loads none of populate. Checked
    // against Mojang's own files (tools/bedrock-summonable.json); one not listed
    // there fails too, so a new mob cannot slip in unchecked.
    {
      const ok = JSON.parse(readFileSync(new URL('../bedrock-summonable.json', import.meta.url), 'utf8')).summonable;
      const all = generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, jail: true, zoo: true, hostiles: true, hostileCount: 40, transit: 'rails' });
      const files = functionFiles(buildStructures(all.world, {}), all.world, { namespace: 'test', spawns: all.spawns, inmates: all.inmates, zoo: all.zoo, hostiles: all.hostiles, hostilesInPopulate: true });
      const bad = new Set();
      for (const f of files) for (const l of (f.text || '').split('\n')) {
        const m = l.match(/^summon (minecraft:[a-z_0-9]+)/);
        if (m && ok[m[1]] !== true) bad.add(m[1]);
      }
      check('functions: every summon names an entity Bedrock lets /summon create (Mojang\'s own is_summonable)', bad.size === 0, [...bad].join(', '));
    }
    // and with everything on at once (the hospital's brewing stands, beside the
    // museum, were taken for armour stands with no place: NaN in populate), every
    // line of every function a number where a number goes: no NaN, undefined or
    // Infinity in any command
    {
      const every = generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345, jail: true, zoo: true, museum: true, hospital: true, firestation: true, metro: true, transit: 'rails', hostiles: true, hostileCount: 20 });
      const files = functionFiles(buildStructures(every.world, {}), every.world, { namespace: 'test', spawns: every.spawns, inmates: every.inmates, zoo: every.zoo, stands: every.stands, hostiles: every.hostiles, hostilesInPopulate: true });
      const badLines = [];
      // (the export leaves such a line out so the pack still loads, and keeps it on
      // the file as dropped: any dropped here is a fault upstream, a stand or a mob
      // with no place, and fails)
      for (const f of files) for (const l of [...(f.text || '').split('\n'), ...(f.dropped || [])]) if (/NaN|undefined|Infinity|\[object/.test(l)) badLines.push(`${f.fn}: ${l.slice(0, 60)}`);
      const built = ['jail', 'zoo', 'aquarium', 'museum', 'hospital', 'firestation'].filter((k) => every.landmarks.some((Lm) => Lm.kind === k));
      check('functions: with every landmark on at once, no NaN, undefined or Infinity in any command', badLines.length === 0 && built.includes('museum') && built.includes('hospital'), badLines.slice(0, 2).join(' | ') + ` (built: ${built.join(', ')})`);
    }
    note(`jail: ${r.inmates.length} inmates of ${new Set(r.inmates.map((m) => m.type)).size} kinds; ${cities.filter(([, c]) => c.landmarks.some((Lm) => Lm.kind === 'jail' && Lm.sideways)).length} of ${cities.length} jails turned sideways`);
  }
}
