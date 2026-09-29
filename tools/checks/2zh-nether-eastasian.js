// tools/checks/2zh-nether-eastasian.js — the Nether and East Asian city styles.
//
// A style is a palette and, for these two, some architecture of its own:
// the East Asian style's eave skirts, pagodas, torii and stone lanterns. Every
// block has to exist in Bedrock and convert to Java; each style's roles must
// really be restyled (no grass or oak left in a Nether city); and none of the
// new architecture may cost anything: every building still walks through,
// every door is reached, no skirt or gate takes anyone's head room.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zh';
export const label = '2zh. Nether and East Asian styles';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };

  check('styles: Nether and East Asian are registered and offered in the page',
    STYLE_NAMES.includes('nether') && STYLE_NAMES.includes('eastasian') &&
    /value="nether"/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')) && /value="eastasian"/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')));

  // every block the two styles name exists in Bedrock 1.21.60, with its states
  const used = new Set();
  for (const name of ['nether', 'eastasian']) {
    const st = STYLES[name];
    for (const list of Object.values(st.themes)) for (const t of list) for (const k of ['wall', 'trim', 'floor', 'glass', 'roof']) if (t[k] !== undefined) used.add(t[k]);
    for (const target of Object.values(st.remap)) if (target && MAT[target] !== undefined) used.add(MAT[target]);
    for (const v of Object.values(st.landmark)) (Array.isArray(v) ? v : [v]).forEach((x) => { if (typeof x === 'number') used.add(x); });
  }
  const bad = [...used].filter((id) => {
    const d = MATERIALS.def(id), st = states[d.block.replace('minecraft:', '')];
    if (!st) return true;
    return Object.keys(d.states || {}).some((k) => !(k in st));
  }).map((id) => MATERIALS.def(id).block);
  check('blocks: every block the styles use is a real Bedrock block with real states', bad.length === 0 && used.size > 30, bad.join(', ') || `${used.size} blocks`);
  // Java: the renamed ones, and a stem keeps its axis
  const jn = (id) => { const d = MATERIALS.def(id); return toJava(d.block, d.states).name; };
  check('java: nether bricks and red nether bricks take their Java names',
    /nether_bricks/.test(jn(MAT.NETHER_BRICK)) && /red_nether_bricks/.test(jn(MAT.RED_NETHER_BRICK)), `${jn(MAT.NETHER_BRICK)} / ${jn(MAT.RED_NETHER_BRICK)}`);
  check('java: stems, basalt and soul lanterns keep their names', /crimson_stem/.test(jn(MAT.CRIMSON_STEM)) && /polished_basalt/.test(jn(MAT.POL_BASALT)) && /soul_lantern/.test(jn(MAT.SOUL_LAMP)));

  // ---- Nether cities --------------------------------------------------------------
  let nOk = true, leftovers = {}, signature = {};
  for (const seed of [12345, 7]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 192, cityStyle: 'nether', parkChance: 0.2 });
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) nOk = false;
    r.world.forEach((x, y, z, id) => {
      const b = MATERIALS.def(id).block;
      if (/^minecraft:(grass_block|oak_log|oak_leaves|spruce_leaves|light_gray_concrete|sea_lantern)$/.test(b)) leftovers[b] = (leftovers[b] || 0) + 1;
      if (/^minecraft:(blackstone|polished_blackstone|crimson_nylium|shroomlight|crimson_stem|nether_wart_block|crimson_roots|nether_brick)$/.test(b)) signature[b] = (signature[b] || 0) + 1;
    });
  }
  check('nether: every building walks through and every door is reached', nOk);
  check('nether: no grass, oak, grey pavement or sea lanterns left', Object.keys(leftovers).length === 0, JSON.stringify(leftovers));
  check('nether: blackstone streets, nylium, shroomlight lamps, crimson fungus trees, roots, nether brick',
    ['blackstone', 'polished_blackstone', 'crimson_nylium', 'shroomlight', 'crimson_stem', 'nether_wart_block', 'crimson_roots', 'nether_brick'].every((b) => signature['minecraft:' + b] > 0),
    JSON.stringify(signature));

  // ---- East Asian cities ---------------------------------------------------------------
  let eOk = true, pagodas = 0, tierBad = 0, eaveLevelBad = 0, skirtless = 0, lowEave = 0, corners = 0, arcaded = 0;
  let gates = 0, gateBad = 0, headBad = 0, lanterns = 0, lanternBad = 0;
  for (const seed of [12345, 7, 3]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 192, cityStyle: 'eastasian', parkChance: 0.2 });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) eOk = false;
    for (const b of r.buildings) {
      if (b.shape && b.shape.startsWith('pagoda')) {
        pagodas++;
        if (b.floors > 9 || b.floors % 2 === 0) tierBad++;
        if (!b.eaves || b.eaves.levels.length !== b.floors || b.eaves.cells === 0) eaveLevelBad++;
        for (const y of (b.eaves && b.eaves.levels) || []) if (y < b.groundY + b.pitch) lowEave++;
        continue;
      }
      if (b.landmark) continue;
      if (b.arcade) arcaded++;
      if (b.floors >= 2 && (!b.eaves || b.eaves.skirts === 0)) skirtless++;
      if (b.eaves) {
        corners += b.eaves.corners;
        for (const y of b.eaves.levels) if (y < b.groundY + b.pitch) lowEave++;
      }
    }
    for (const lot of r.plan.lots) {
      for (const g of lot.torii || []) {
        gates++;
        const [gx, gy, gz] = g.at, [ax, az] = g.across;
        const at = (u, y) => blk(w, gx + ax * u, y, gz + az * u);
        for (const u of [-2, 2]) for (let y = gy + 1; y <= gy + 4; y++) if (!/red_concrete/.test(at(u, y))) gateBad++;
        for (let u = -2; u <= 2; u++) if (!/red_concrete/.test(at(u, gy + 4))) gateBad++;
        for (let u = -2; u <= 2; u++) if (!/black_concrete/.test(at(u, gy + 5))) gateBad++;
        for (const u of [-3, 3]) if (!/stairs/.test(at(u, gy + 5))) gateBad++;
        // under the gate, the path keeps three blocks of head room
        for (let u = -1; u <= 1; u++) for (let y = gy + 1; y <= gy + 3; y++) if (solid(w, gx + ax * u, y, gz + az * u)) headBad++;
      }
      for (const [x, y, z] of lot.stoneLanterns || []) {
        lanterns++;
        if (!/lantern/.test(blk(w, x, y, z)) || !/stone_bricks/.test(blk(w, x, y - 1, z))) lanternBad++;
      }
    }
  }
  check('eastasian: every building walks through and every door is reached', eOk);
  check('eastasian: pagodas, of three to nine tiers, an odd number', pagodas >= 2 && tierBad === 0, `${pagodas} pagodas, ${tierBad} bad`);
  check('eastasian: a pagoda has an eave ring at every tier', eaveLevelBad === 0, `${eaveLevelBad}`);
  check('eastasian: every building of two floors or more wears eave skirts, corners turned up', skirtless === 0 && corners > 0, `${skirtless} without, ${corners} corners`);
  check('eastasian: every eave is at least a storey up (never in anyone\'s way)', lowEave === 0, `${lowEave} low`);
  check('eastasian: no Romanesque arcades here', arcaded === 0, `${arcaded}`);
  check('eastasian: torii at the park gates, vermilion posts and beams, black lintel, upturned ends', gates > 0 && gateBad === 0, `${gates} gates, ${gateBad} bad cells`);
  check('eastasian: the path under every torii keeps its head room', headBad === 0, `${headBad} blocked`);
  check('eastasian: stone lanterns on their posts by the path crossing', lanterns > 0 && lanternBad === 0, `${lanterns} lanterns, ${lanternBad} bad`);

  // ---- other styles are untouched by the new flags ------------------------------------
  const m1 = generateCity({ ...DEFAULTS, seed: 7, size: 160 });
  check('modern: no eave skirts, no torii, no pagodas', m1.buildings.every((b) => !b.eaves && !(b.shape || '').startsWith('pagoda')) && m1.stats.torii === 0);
  note(`nether: ${Object.keys(signature).length} signature blocks · eastasian: ${pagodas} pagodas, ${gates} torii, ${lanterns} stone lanterns`);
}
