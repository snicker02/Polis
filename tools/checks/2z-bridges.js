import { DEFAULTS } from '../../engine/city.js';
import { planBridges, stepsAlong, unitPath, dirAt } from '../../engine/bridges.js';
import { USE } from '../../engine/plan.js';
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
      for (const [x, z] of b.path) if (walked.has(x + ',' + (b.deckY + 1) + ',' + z)) ok++;
      if (ok > b.path.length * 0.9) deckWalkable++;
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
    let ends = 0, joined = 0, straight = 0, bent = 0, bentEnds = 0, bentStraight = 0;
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
          // Two lane ends sit at each end of the deck, so a deck bent at both
          // ends should show four joins with no leg and nothing further than
          // the next cell.
          for (const e of b.ends || []) {
            if (!(e.head ? b.bentHead : b.bentFoot)) continue;
            bentEnds++;
            if (e.joined && !e.leg && e.a === 1) bentStraight++;
          }
        }
      }
    }
    const unreachable = (why.get('no track within reach') || 0) + (why.get('the ring is not at deck level') || 0);
    const reasons = [...why].map(([k, v]) => `${v} ${k}`).join(' · ');
    check('bridges: a lane end with track in front of it is always led onto it',
      ends > 0 && joined + unreachable === ends,
      `${joined}/${ends} joined (${straight} straight, ${bent} round a corner)${reasons ? ' · ' + reasons : ''}`);
    // Alignment inverts what this section used to want. The L-shaped spur was
    // once the whole point, and a run of nothing but straight joins meant the
    // corner search had quietly stopped working. Now a straight join is the
    // RIGHT shape — the deck has been bent to face the ring, so the junction
    // is one curve and no detour — and a lateral leg is the fallback for the
    // ends no bend could serve. So the test is that straight joins are the
    // majority, not that bent ones exist.
    check('bridges: an aligned deck meets the ring head on, so most joins are straight',
      joined > 0 && straight >= bent && straight > 0,
      `${straight} straight · ${bent} round a corner`);
    check('bridges: a bent end puts its lane one cell short of the ring',
      bentEnds === 0 || bentStraight === bentEnds,
      `${bentStraight}/${bentEnds} bent ends joined by a single curve`);
    note(`lane ends ${joined}/${ends} joined · ${bent} round a corner · ${unreachable} with nothing at deck level to join`);
    note(`${bentEnds} lane ends sitting at a bent deck end`);
  }

  // Track that leads nowhere, and two lines laid on the same ground.
  //
  // On flat ground a second line laid along the same cells as the first just
  // overwrote it and nothing looked wrong. On real ground the two are lifted
  // to different heights, and what survives is one railway at grade with
  // pieces of the other stranded above it: the little humps and closed
  // circles of track that join nothing. So: no two lines may share more than
  // a crossing, every run of track must be a railway rather than a stub, and
  // a line's record must point at track that is really there.
  {
    let pairWorst = 0, pairName = '', orphanRuns = 0, orphanRails = 0, ghosts = 0;
    for (let i = 0; i < SITES; i++) {
      for (const seed of [7, 1118]) {
        const { r } = await fx.fitted(192, i, { seed });
        const lines = r.transit.lines;

        // two lines on the same ground cell: a crossing is one cell, a line
        // laid along another is many
        // A viaduct legitimately flies over a street railway, so height is
        // part of the test: two lines sharing ground is only wrong when they
        // share it at the same level. (How much headroom a low deck leaves
        // the track beneath is a separate question this does not answer.)
        const owner = new Map(), pairs = new Map();
        lines.forEach((line, li) => {
          for (const [x, y, z] of line.cells) {
            const k = x + ',' + z;
            const had = owner.get(k);
            if (had && had.li !== li) {
              if (Math.abs(had.y - y) <= 1) {
                const p = [had.li, li].sort((a, b) => a - b).join('+');
                pairs.set(p, (pairs.get(p) || 0) + 1);
              }
            } else owner.set(k, { li, y });
          }
        });
        for (const [p, n] of pairs) if (n > pairWorst) { pairWorst = n; pairName = `site ${i} seed ${seed} lines ${p}`; }

        // the record must agree with the world
        const railAt = (x, y, z) => { const id = r.world.get(x, y, z); return id >= 0 && /rail/.test(MATERIALS.def(id).block); };
        for (const line of lines) for (const [x, y, z] of line.cells) if (!railAt(x, y, z)) ghosts++;

        // every run of track, and whether it is a railway or a scrap
        const rails = new Map();
        r.world.forEach((x, y, z, mid) => { if (/rail/.test(MATERIALS.def(mid).block)) rails.set(x + ',' + y + ',' + z, [x, y, z]); });
        // The same standard the engine sweeps by: a run is a railway if it
        // has a station or a cart on it, or is a viaduct's lane. Some lines
        // are short by design, so length alone does not make a stub.
        const onBridge = new Set();
        for (const line of lines) {
          for (const [x, y, z] of line.stations || []) onBridge.add(x + ',' + y + ',' + z);
          if (line.bridge) for (const [x, y, z] of line.cells) onBridge.add(x + ',' + y + ',' + z);
        }
        for (const c of r.transit.carts || []) onBridge.add(c.x + ',' + c.y + ',' + c.z);
        const seen = new Set();
        for (const start of rails.keys()) {
          if (seen.has(start)) continue;
          const comp = [];
          const q = [start];
          seen.add(start);
          let spared = false;
          while (q.length) {
            const k = q.pop();
            comp.push(k);
            if (onBridge.has(k)) spared = true;
            const [x, y, z] = rails.get(k);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
              for (const dy of [0, 1, -1]) {
                const nk = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
                if (rails.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
              }
          }
          if (!spared && comp.length <= 14) { orphanRuns++; orphanRails += comp.length; }
        }
      }
    }
    check('rails: no line is laid along another, only across it', pairWorst <= 2,
      `worst pair shares ${pairWorst} cells${pairWorst > 2 ? ' · ' + pairName : ''}`);
    check('rails: no stub of track is left leading nowhere', orphanRuns === 0,
      `${orphanRuns} stranded runs holding ${orphanRails} rails`);
    check('rails: every cell a line claims has track on it', ghosts === 0, `${ghosts} claimed cells with no rail`);
  }

  // Each viaduct joins an outlying district to the main one. A bridge between
  // two offshoots leaves both of them off the network however well built it
  // is, so which districts an span actually lands in is checked, not assumed.
  {
    let spans = 0, toMain = 0;
    const wrong = [];
    for (let i = 0; i < SITES; i++) {
      for (const seed of [7, 1118]) {
        const { r } = await fx.fitted(192, i, { seed });
        const ds = r.plan.districts || [];
        if (ds.length < 2) continue;
        const districtOf = (x, z) => { const c = z * 192 + x; for (let k = 0; k < ds.length; k++) if (ds[k].has(c)) return k; return -1; };
        for (const b of r.bridges || []) {
          spans++;
          const far = b.spanPath[b.spanPath.length - 1], home = b.spanPath[0];
          const near = districtOf(home[0], home[1]), end = districtOf(far[0], far[1]);
          if (end === 0 || near === 0) toMain++;
          else wrong.push(`site ${i} seed ${seed}: ${near} to ${end}`);
        }
      }
    }
    check('bridges: every span joins an outlying district to the main one', spans === 0 || toMain === spans,
      `${toMain}/${spans} spans reach the main district${wrong.length ? ' · ' + wrong.slice(0, 3).join('; ') : ''}`);
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

  // ---- the shape of a span --------------------------------------------------
  // A span is a polyline now, so the first thing to know is that it really is
  // one: every step exactly one cell north, south, east or west, the flying
  // part of it still inside the polyline, and the deck a single piece.
  {
    let decks2 = 0, broken = 0, detached = 0;
    for (const { r } of cities) {
      for (const b of r.bridges || []) {
        decks2++;
        if (!unitPath(b.path) || b.path.length !== b.length) broken++;
        // the span the planner chose has to survive inside the built path
        const at = b.path.findIndex(([x, z]) => x === b.spanPath[0][0] && z === b.spanPath[0][1]);
        if (at < 0 || b.spanPath.some(([x, z], k) => !b.path[at + k] || b.path[at + k][0] !== x || b.path[at + k][1] !== z)) detached++;
      }
    }
    check('bridges: a span is a polyline of single steps', decks2 > 0 && broken === 0, `${broken} of ${decks2} malformed`);
    check('bridges: the built deck still contains the span that was planned', detached === 0, `${detached} detached`);
  }

  // A staircase between two banks that share no row and no column. The fitted
  // sites do not throw one of these up reliably, so the crossing search is put
  // to a plan of its own: two square districts set corner to corner, which no
  // straight run can join.
  {
    const W = 64, D = 64;
    const mk = (x0, z0, x1, z1, use, mask) => {
      const set = new Set();
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * W + x; set.add(i); use[i] = USE.ROAD; mask[i] = 1; }
      return set;
    };
    const use = new Uint8Array(W * D), mask = new Uint8Array(W * D);
    const main = mk(40, 40, 56, 56, use, mask);
    const island = mk(6, 6, 20, 20, use, mask);
    const plan = { W, D, use, mask };
    const spans = planBridges(plan, { bridges: true, streetWidth: 5 }, [main, island]);
    const s0 = spans[0];
    check('bridges: two banks that share no row or column still get a span', spans.length === 1, `${spans.length} spans`);
    check('bridges: that span is laid as a staircase', !!s0 && s0.angled === true && unitPath(s0.path),
      s0 ? `${s0.path.length} cells, angled ${s0.angled}` : 'no span');
    check('bridges: the staircase runs from the island to the main district',
      !!s0 && island.has(s0.path[0][1] * W + s0.path[0][0]) && main.has(s0.path[s0.path.length - 1][1] * W + s0.path[s0.path.length - 1][0]));
    // and its carriageway is one piece, not a chain of squares with gaps at
    // the corners
    if (s0) {
      const deck = new Set(s0.cells.map(([x, z]) => x + ',' + z));
      const q = [s0.cells[0]];
      const seen = new Set([q[0][0] + ',' + q[0][1]]);
      while (q.length) {
        const [x, z] = q.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (x + dx) + ',' + (z + dz);
          if (deck.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, z + dz]); }
        }
      }
      check('bridges: an angled deck is one connected piece', seen.size === deck.size, `${seen.size}/${deck.size} cells reachable`);
      // every cell of it is street, so the city builds and exports it
      check('bridges: an angled deck is reserved as carriageway',
        s0.cells.every(([x, z]) => use[z * W + x] === USE.ROAD && mask[z * W + x] === 1));
    }
    // a straight crossing is still preferred where one exists
    {
      const u2 = new Uint8Array(W * D), m2 = new Uint8Array(W * D);
      const m = mk(40, 20, 56, 36, u2, m2), i2 = mk(6, 20, 20, 36, u2, m2);
      const st = planBridges({ W, D, use: u2, mask: m2 }, { bridges: true, streetWidth: 5 }, [m, i2]);
      check('bridges: a straight crossing is still preferred where there is one',
        st.length === 1 && !st[0].angled && st[0].path.every(([, z]) => z === st[0].path[0][1]),
        st.length ? `angled ${st[0].angled}` : 'no span');
    }
  }

  // the staircase generator itself: it must land exactly on its target and
  // never take a diagonal step, whatever the slope
  {
    let bad = 0, cases = 0;
    for (const dx of [-13, -7, -1, 0, 1, 4, 9, 20])
      for (const dz of [-11, -4, 0, 1, 6, 20]) {
        cases++;
        const path = stepsAlong([30, 30], [30 + dx, 30 + dz]);
        const last = path[path.length - 1];
        if (last[0] !== 30 + dx || last[1] !== 30 + dz) { bad++; continue; }
        if (path.length !== Math.abs(dx) + Math.abs(dz) + 1) { bad++; continue; }
        if (path.length > 1 && !unitPath(path)) bad++;
        if (path.length > 1 && dirAt(path, 0).every((v) => v === 0)) bad++;
      }
    check('bridges: a staircase lands on its target in single steps', bad === 0, `${bad} of ${cases} wrong`);
  }

  check('bridges: they are worth building (the districts they save carry buildings)', buildingsGained > 0,
    `${buildingsGained} more buildings than without them`);
  note(`${spans} bridges across ${withBridges} cities, ${buildingsGained} buildings saved`);
}
