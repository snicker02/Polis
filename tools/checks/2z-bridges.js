import { DEFAULTS } from '../../engine/city.js';
import { MATERIALS } from '../../engine/materials.js';
import { walkCity } from '../../engine/terrain.js';

export const id = "2z";
export const label = "2z. bridges";

export default async function run(ctx) {
  const { check, note, fx } = ctx;

  // A fragmented site: the outline keeps the outlying districts and joins
  // them. Every check below reads the same six cities — they used to be
  // generated seven times over, once per check, which was most of the cost of
  // the whole suite.
  const SITES = 6;
  const cities = [];
  for (let i = 0; i < SITES; i++) cities.push(await fx.fitted(192, i));

  let withBridges = 0, spans = 0, unreachable = 0, deckWalkable = 0, decks = 0, buildingsGained = 0;
  for (let i = 0; i < SITES; i++) {
    const { r: on } = cities[i];
    if (!on.bridges || !on.bridges.length) continue;
    const { r: off } = await fx.fitted(192, i, { bridges: false });
    withBridges++;
    spans += on.bridges.length;
    buildingsGained += on.buildings.length - off.buildings.length;
    unreachable += on.reach.unreached.length;
    // you can walk the deck from end to end
    const walked = walkCity(on.world, on.plan, 1, (on.hills.H || 0) + 6, false);
    for (const b of on.bridges) {
      decks++;
      let ok = 0;
      for (let k = 0; k < b.length; k++) {
        const x = b.axis === 'x' ? b.from[0] + b.dir * k : b.from[0];
        const z = b.axis === 'x' ? b.from[1] : b.from[1] + b.dir * k;
        if (walked.has(x + ',' + (b.deckY + 1) + ',' + z)) ok++;
      }
      if (ok > b.length * 0.9) deckWalkable++;
    }
  }
  check('bridges: a split site gets viaducts joining its districts', withBridges > 0, `${withBridges} cities, ${spans} bridges`);
  check('bridges: you can walk from one end to the other', decks > 0 && deckWalkable === decks, `${deckWalkable}/${decks}`);
  check('bridges: every door is still reachable once they are built', unreachable === 0, `${unreachable} cut off`);

  // a split city still gets its loop: it follows the main district, since a
  // city in pieces has no single edge to run round
  {
    let looped = 0, curved = 0, split = 0;
    for (const { r } of cities) {
      if ((r.plan.districts || []).length < 2) continue;
      split++;
      if (r.transit.stats.loop) looped++;
      let c = 0;
      r.world.forEach((x, y, z, mid) => {
        const d = MATERIALS.def(mid);
        if (!/rail/.test(d.block) || !d.states.rail_direction) return;
        if (d.states.rail_direction.value >= 6) c++;
      });
      if (c > 0) curved++;
    }
    check('bridges: a city in pieces still has its loop, with curves', split === 0 || (looped === split && curved === split),
      `${split} split cities · ${looped} with a loop · ${curved} with curved rails`);
  }

  // and the outlying districts get track of their own, not just the main one
  {
    let bare = 0, checked = 0;
    for (const { r: r2 } of cities) {
      const ds = r2.plan.districts || [];
      if (ds.length < 2) continue;
      const per = ds.map(() => 0);
      r2.world.forEach((x, y, z, mid) => {
        if (!/rail/.test(MATERIALS.def(mid).block)) return;
        const i = z * 192 + x;
        ds.forEach((d, k) => { if (d.has(i)) per[k]++; });
      });
      ds.forEach((d, k) => {
        if (d.size < 400) return;                    // too small to expect a line
        checked++;
        if (per[k] < 20) bare++;
      });
    }
    check('bridges: every district of any size gets track, not just the main one', bare === 0,
      `${bare} of ${checked} districts without track`);
  }

  // the loop is what carries every curve in a city, so a city fitted to
  // real ground must have one — that is where it used to be lost
  {
    let fitted = 0, looped2 = 0, curvy2 = 0;
    for (let i = 0; i < SITES; i++) {
      for (const seed of [7, 1118]) {
        const { r: r3 } = await fx.fitted(192, i, { seed });
        fitted++;
        if (r3.transit.stats.loop) looped2++;
        let c3 = 0;
        r3.world.forEach((x, y, z, mid) => {
          const d = MATERIALS.def(mid);
          if (/rail/.test(d.block) && d.states.rail_direction && d.states.rail_direction.value >= 6) c3++;
        });
        if (c3 > 0) curvy2++;
      }
    }
    check('rails: every city fitted to real ground has a loop, and curves on it',
      fitted > 0 && looped2 === fitted && curvy2 === fitted,
      `${fitted} fitted cities · ${looped2} with a loop · ${curvy2} with curves`);
  }

  // each substantial district gets a ring of its own, with curves on it
  {
    let ringed = 0, want = 0;
    for (const { r: r4 } of cities) {
      const ds = r4.plan.districts || [];
      if (ds.length < 2) continue;
      const curves = ds.map(() => 0);
      r4.world.forEach((x, y, z, mid) => {
        const d = MATERIALS.def(mid);
        if (!/rail/.test(d.block) || !d.states.rail_direction || d.states.rail_direction.value < 6) return;
        const i = z * 192 + x;
        ds.forEach((dd, k) => { if (dd.has(i)) curves[k]++; });
      });
      ds.forEach((d, k) => { if (d.size < 600) return; want++; if (curves[k] > 0) ringed++; });
    }
    check('bridges: each district of any size is circled by its own line, curves and all',
      want === 0 || ringed === want, `${ringed}/${want} districts ringed`);
  }

  // the bridge's track joins the rings at both ends, so a cart can ride
  // from one district to the other rather than three separate railways
  {
    let spans5 = 0, joinedAll = 0;
    for (const { r: r5 } of cities) {
      if (!r5.bridges || !r5.bridges.length) continue;
      spans5++;
      const rails = new Map();
      r5.world.forEach((x, y, z, mid) => {
        if (/rail/.test(MATERIALS.def(mid).block)) rails.set(x + ',' + y + ',' + z, [x, y, z]);
      });
      // the biggest connected run of track
      const seen5 = new Set();
      let best = [];
      for (const key of rails.keys()) {
        if (seen5.has(key)) continue;
        const comp = [];
        const q = [key];
        seen5.add(key);
        while (q.length) {
          const k = q.pop();
          comp.push(rails.get(k));
          const [x, y, z] = rails.get(k);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            for (const dy of [0, 1, -1]) {
              const nk = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
              if (rails.has(nk) && !seen5.has(nk)) { seen5.add(nk); q.push(nk); }
            }
        }
        if (comp.length > best.length) best = comp;
      }
      const ds = r5.plan.districts || [];
      const both = ds.slice(0, 2).every((d) => best.some(([x, y, z]) => d.has(z * 192 + x)));
      const deck = best.some(([x, y, z]) => r5.bridges.some((b) => y === b.deckY + 1));
      if (both && deck) joinedAll++;
    }
    check('bridges: the track across a bridge joins the rings at both ends',
      spans5 === 0 || joinedAll === spans5, `${joinedAll}/${spans5} bridges carrying a joined-up railway`);
  }

  // Every lane end that has track in front of it must be led onto it, not
  // left at a buffer. A bridge carries two lanes and so has four ends; a
  // lane that only looked straight inward missed a ring running parallel to
  // one side of the deck, and those ends were left as buffers — a cart ran
  // to the end of the deck and stopped. The spur turns a corner now, so the
  // only ends left are the ones with nothing to join: a deck that meets the
  // edge of the plan, or a ring sitting below deck level, which would need
  // the spur to descend. Those two are counted and named rather than
  // waved through, and any other reason is a failure.
  {
    let ends = 0, joined = 0, straight = 0, bent = 0;
    const why = new Map();
    for (let i = 0; i < SITES; i++) {
      for (const seed of [7, 1118]) {
        const { r } = await fx.fitted(192, i, { seed });
        for (const b of r.bridges || []) {
          for (const e of b.ends || []) {
            ends++;
            if (e.joined) { joined++; if (e.leg) bent++; else straight++; continue; }
            why.set(e.why, (why.get(e.why) || 0) + 1);
          }
        }
      }
    }
    const unreachable = (why.get('no track within reach') || 0) + (why.get('the ring is not at deck level') || 0);
    const reasons = [...why].map(([k, v]) => `${v} ${k}`).join(' · ');
    check('bridges: a lane end with track in front of it is always led onto it',
      ends > 0 && joined + unreachable === ends,
      `${joined}/${ends} joined (${straight} straight, ${bent} round a corner)${reasons ? ' · ' + reasons : ''}`);
    // the corner spur is the whole point of the L: if none is ever built,
    // the search has quietly gone back to looking straight ahead
    check('bridges: lane ends are reached by turning a corner, not only straight on',
      ends === 0 || bent > 0, `${bent} of ${joined} joins needed a turn`);
    note(`lane ends ${joined}/${ends} joined · ${bent} round a corner · ${unreachable} with nothing at deck level to join`);
  }

  // no ring anywhere may run back alongside itself: that lays track in
  // circles instead of a circuit
  {
    let rings = 0, messy = 0;
    const look = (r6) => {
      for (const line of r6.transit.lines) {
        if (!line.loop) continue;
        rings++;
        const n = line.cells.length;
        const at = new Map();
        line.cells.forEach(([x, y, z], i) => at.set(x + ',' + z, i));
        for (let i = 0; i < n; i++) {
          const [x, , z] = line.cells[i];
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = at.get((x + dx) + ',' + (z + dz));
            if (j === undefined) continue;
            if (Math.min((j - i + n) % n, (i - j + n) % n) > 1) { messy++; return; }
          }
        }
      }
    };
    for (const [size, seed] of [[192, 7], [256, 3]])
      look(fx.city(`flat:${size}:${seed}:rails`, () => ({ ...DEFAULTS, size, seed, transit: 'rails' })));
    for (const { r } of cities) look(r);
    check('rails: no ring doubles back alongside itself', messy === 0, `${rings} rings · ${messy} messy`);
  }

  // the canal's grandest crossing is built as a landmark
  {
    let dressed = 0, canals = 0;
    for (const [size, seed] of [[192, 7], [256, 3], [224, 12345]]) {
      const rc = fx.city(`plain:${size}:${seed}`, () => ({ ...DEFAULTS, size, seed }));
      if (!rc.canal) continue;
      canals++;
      const lb = rc.canal.landmarkBridge;
      if (lb && lb.towers.length === 4 && lb.arches > 0) dressed++;
    }
    check('canal: one crossing is built as a landmark, with towers and an arch', canals > 0 && dressed === canals,
      `${dressed}/${canals} canals with a dressed crossing`);
  }

  check('bridges: they are worth building (the districts they save carry buildings)', buildingsGained > 0,
    `${buildingsGained} more buildings than without them`);
  note(`${spans} bridges across ${withBridges} cities, ${buildingsGained} buildings saved`);
}
