// tools/checks/2zk-venetian-artdeco.js — the Venetian and Art Deco styles.
//
// Venetian: canals are the main streets (several, walkways along both banks,
// streets carried over on their decks, railed footbridges between), piazzas
// for open spaces, pointed Gothic windows (pairs of lights with pointed heads
// between piers), a brick campanile standing over the city. Every door can
// still be walked to.
// Art Deco: towers stepped back every four floors, vertical fins between the
// bays (never at street level), gold finials, a crown of gold chevrons and a
// spire on every tower, roof huts still reached.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zk';
export const label = '2zk. Venetian and Art Deco';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { STYLE_NAMES } = await import('../../engine/styles.js');
  const { USE } = await import('../../engine/plan.js');
  const { WATER_HI, USE_CANAL } = await import('../../engine/water.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('styles: Venetian and Art Deco are registered and offered in the page',
    STYLE_NAMES.includes('venetian') && STYLE_NAMES.includes('artdeco') && /value="venetian"/.test(html) && /value="artdeco"/.test(html));

  // ---- Venetian ---------------------------------------------------------------------
  let ok = true, canals = 0, few = 0, streetBridges = 0, foot = 0, footBad = 0, waterBad = 0, walkBad = 0, parks = 0, piazzas = 0;
  let trams = 0, hilly = 0, pairs = 0, headBad = 0, noLancets = 0, campanile = 0, campLow = 0;
  for (const [seed, size] of [[7, 224], [12345, 160], [3, 224]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: 'venetian' });
    const w = r.world, G = 1;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    if (r.canals.length < 3) few++;
    canals += r.canals.length;
    if (r.cfg.transit !== 'roads') trams++;
    if (r.cfg.hills !== 0) hilly++;
    for (const c of r.canals) {
      streetBridges += c.bridgeSpans.length;
      // the channel: water at its surface along every open stretch; walkways either side to stand on
      for (let u = c.u0; u <= c.u1; u += 5) {
        const [mx, mz] = c.cell(u, Math.floor((c.ch0 + c.ch1) / 2));
        if (r.plan.use[mz * r.plan.W + mx] === USE_CANAL && !/water/.test(blk(w, mx, WATER_HI, mz))) waterBad++;
        // each bank passable: some cell across its walkway can be stood on (a
        // sign or a lamp may take one cell); a dock's steps down count as the way on
        for (const strip of [[c.a0, c.ch0 - 1], [c.ch1 + 1, c.a1]]) {
          const cells = [];
          for (let a = strip[0]; a <= strip[1]; a++) { const [x, z] = c.cell(u, a); if (r.plan.use[z * r.plan.W + x] === USE.SIDEWALK) cells.push([x, z]); }
          if (!cells.length) continue;
          const stands = ([x, z]) => solid(w, x, G, z) && !solid(w, x, G + 1, z) && !solid(w, x, G + 2, z);
          // (a dock's steps and landing, the landing perhaps lit: a sea lantern or shroomlight among its planks)
          const dockStep = ([x, z]) => { for (let y = WATER_HI; y <= G; y++) if (/stairs|planks|sea_lantern|shroomlight/.test(blk(w, x, y, z))) return true; return false; };
          if (!cells.some((q) => stands(q) || dockStep(q))) walkBad++;
        }
      }
      // footbridges: the middle row walked across at street level, the outer two railed
      for (const [f0, f2] of c.footbridges || []) {
        foot++;
        for (let a = c.ch0; a <= c.ch1; a++) {
          const [x, z] = c.cell(f0 + 1, a);
          if (!solid(w, x, G, z) || solid(w, x, G + 1, z) || solid(w, x, G + 2, z)) footBad++;
          for (const u of [f0, f2]) { const [rx, rz] = c.cell(u, a); if (!/fence|lantern/.test(blk(w, rx, G + 1, rz))) footBad++; }
          // a boat still fits under it
          if (solid(w, x, WATER_HI + 1, z) || solid(w, x, WATER_HI + 2, z)) footBad++;
        }
      }
    }
    for (const l of r.plan.lots) { if (l.kind === USE.PARK) parks++; if (l.kind === USE.PLAZA) piazzas++; }
    // pointed windows: every house and mid-rise has them; each head sits over glass
    for (const b of r.buildings) {
      if (b.landmark || b.style === 'tower') continue;
      if (!b.lancets) { noLancets++; continue; }
      pairs += b.lancets.pairs;
    }
    w.forEach((x, y, z, id) => {
      const n = MATERIALS.def(id).block;
      if (!/stairs/.test(n)) return;
      // a window head: an upside-down stair with glass right under it, on a wall
      const d = MATERIALS.def(id);
      if (!(d.states && d.states.upside_down_bit && d.states.upside_down_bit.value === 1)) return;
      if (/glass/.test(blk(w, x, y - 1, z)) && !/glass/.test(blk(w, x, y - 2, z)) && y - 2 > G + 1) headBad++;   // a head over a one-high light
    });
    const camp = r.landmarks.find((l) => l.kind === 'clocktower');
    if (camp && camp.name === 'Campanile') {
      campanile++;
      const tallest = Math.max(...r.buildings.filter((b) => !b.landmark).map((b) => b.topY));
      if (camp.rec.topY <= tallest) campLow++;
    }
  }
  check('venetian: every building walks through and every door is reached on foot', ok);
  check('venetian: canals are the main streets (three or more in each city)', few === 0, `${canals} canals, ${few} cities with fewer than three`);
  check('venetian: water in the channels, a walkway along each bank you can walk', waterBad === 0 && walkBad === 0, `${waterBad} dry, ${walkBad} walkways blocked`);
  check('venetian: streets cross on their bridges, footbridges between (railed, a boat fits under)', streetBridges > 20 && foot > 3 && footBad === 0, `${streetBridges} street bridges, ${foot} footbridges, ${footBad} bad`);
  check('venetian: piazzas, not parks', parks === 0 && piazzas > 3, `${piazzas} piazzas, ${parks} parks`);
  check('venetian: a flat lagoon, no trams', trams === 0 && hilly === 0);
  check('venetian: pointed Gothic windows on every house and palazzo', noLancets === 0 && pairs > 100 && headBad === 0, `${pairs} pairs, ${noLancets} without, ${headBad} heads over short lights`);
  check('venetian: a brick campanile, named so, standing over the city', campanile === 3 && campLow === 0, `${campanile} campanili, ${campLow} not tallest`);

  // ---- Art Deco ---------------------------------------------------------------------
  let dOk = true, fins = 0, finials = 0, lowFin = 0, towers = 0, crowned = 0, goldless = 0, spireless = 0, stepped = 0, shaped = 0, huts = 0;
  for (const [seed, size] of [[7, 224], [12345, 224]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: 'artdeco' });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) dOk = false;
    shaped += (r.stats.shapes || []).length;
    for (const b of r.buildings) {
      if (b.landmark || !b.deco) continue;
      fins += b.deco.fins; finials += b.deco.finials;
      if (b.hut) huts++;
      if (b.style !== 'tower') continue;
      towers++;
      if (new Set(b.rects.map((q) => (q.x1 - q.x0) + ',' + (q.z1 - q.z0))).size > 1) stepped++;
      if (b.deco.crown) {
        crowned++;
        const t = b.rects[b.floors - 1];
        let gold = 0;
        for (let y = b.roofY + 1; y <= b.deco.crown.top; y++) for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) if (w.get(x, y, z) === MAT.GOLD) gold++;
        if (gold < 4) goldless++;
        if (!b.deco.crown.spire || w.get(Math.round((t.x0 + t.x1) / 2), b.deco.crown.top, Math.round((t.z0 + t.z1) / 2)) !== MAT.GOLD) spireless++;
      }
    }
    // fins are never at street level: the lowest fin block is at the first floor or above
    for (const b of r.buildings) {
      if (b.landmark || !b.deco || !b.deco.fins) continue;
      if (b.deco.finLow < b.groundY + b.pitch) lowFin++;
    }
  }
  check('artdeco: every building walks through, every door and roof hut reached', dOk && huts > 0, `${huts} huts`);
  check('artdeco: vertical fins between the bays, gold finials at the top', fins > 500 && finials > 100, `${fins} fins, ${finials} finials`);
  check('artdeco: no fin comes down to the street', lowFin === 0, `${lowFin}`);
  check('artdeco: every tower crowned: gold chevrons and a spire with a gold tip', towers > 5 && crowned === towers && goldless === 0 && spireless === 0, `${crowned}/${towers} crowned, ${goldless} without gold, ${spireless} without a spire`);
  check('artdeco: towers step back (the setbacks are the shape: no twisting towers)', stepped >= towers * 0.6 && shaped === 0, `${stepped}/${towers} stepped, ${shaped} shaped`);
  note(`venetian: ${canals} canals, ${streetBridges} street bridges, ${foot} footbridges, ${pairs} window pairs · artdeco: ${fins} fins, ${crowned} crowns`);
}
