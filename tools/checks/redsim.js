// tools/checks/redsim.js — a small redstone simulator, to run the city's machines.
//
// It knows the parts the city builds (repeaters, comparators, observers, redstone
// torches on top of a block, buttons, levers, note blocks, redstone lamps, pistons,
// copper bulbs, targets) and the rules the city's machines are built by, in game
// ticks (a redstone tick is two):
// - a block is strongly powered by a repeater or comparator pointing into it, an
//   observer's output into it, a torch under it, a button or lever on it;
// - a part (note block, lamp, piston, bulb) is powered when beside a strongly
//   powered block, pointed into by a repeater, comparator or observer, or beside a
//   lit torch, a lever that is on or a button that is in;
// - a repeater turns on (off) its delay after what is behind it does; a torch goes
//   out two ticks after the block under it is powered; a comparator follows the
//   bulb or power behind it in two; an observer sees any change in the cell it
//   watches and two ticks later gives a pulse two ticks long;
// - a note block plays when it becomes powered; a bulb turns over when it does;
//   a piston pushes the block in front of it while powered (a sticky one pulls it back).
// It is not the game. It catches what the eye misses in a drawing: a repeater the
// wrong way round, a part beside a powered block that should not be, a torch tower
// of the wrong parity, a ring that does not close.

import { MATERIALS } from '../../engine/materials.js';

const V = { east: [1, 0, 0], west: [-1, 0, 0], south: [0, 0, 1], north: [0, 0, -1], up: [0, 1, 0], down: [0, -1, 0] };
const PISTON = [V.down, V.up, V.south, V.north, V.east, V.west];
const BUTTON = [V.down, V.up, V.north, V.south, V.west, V.east];
const N6 = Object.values(V);
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const neg = (d) => [-d[0], -d[1], -d[2]];
const K = (p) => p.join(',');
const sv = (def, k) => { const v = def.states[k]; return v === undefined || v === null ? undefined : (v.value ?? v); };

// world: the city's world; box: {x0,y0,z0,x1,y1,z1} the machine's cells
export function makeSim(world, box) {
  const cells = new Map();                 // key -> { kind, ... }
  const ids = new Map();                   // key -> material id (moved blocks change it)
  const idAt = (p) => { const k = K(p); return ids.has(k) ? ids.get(k) : world.get(...p); };
  const nameAt = (p) => { const i = idAt(p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  for (let x = box.x0; x <= box.x1; x++) for (let y = box.y0; y <= box.y1; y++) for (let z = box.z0; z <= box.z1; z++) {
    const p = [x, y, z], i = world.get(x, y, z);
    if (i < 0) continue;
    const def = MATERIALS.def(i), n = def.block.replace('minecraft:', '');
    let c = null;
    if (/repeater$/.test(n)) c = { kind: 'rep', out: neg(V[sv(def, 'minecraft:cardinal_direction')]), delay: 2 * (sv(def, 'repeater_delay') + 1), on: n === 'powered_repeater' };
    else if (/comparator$/.test(n)) c = { kind: 'comp', out: neg(V[sv(def, 'minecraft:cardinal_direction')]), on: n === 'powered_comparator' };
    else if (n === 'observer') c = { kind: 'obs', watch: V[sv(def, 'minecraft:facing_direction')], on: !!sv(def, 'powered_bit') };
    else if (/redstone_torch$/.test(n)) c = { kind: 'torch', on: n === 'redstone_torch', att: sv(def, 'torch_facing_direction') === 'top' ? V.down : neg(V[sv(def, 'torch_facing_direction')] || V.down) };
    else if (/_button$/.test(n)) c = { kind: 'button', on: !!sv(def, 'button_pressed_bit'), att: neg(BUTTON[sv(def, 'facing_direction')]) };
    else if (n === 'lever') c = { kind: 'lever', on: !!sv(def, 'open_bit'), att: /^up/.test(sv(def, 'lever_direction')) ? V.down : /^down/.test(sv(def, 'lever_direction')) ? V.up : neg(V[sv(def, 'lever_direction')]) };
    else if (n === 'noteblock') c = { kind: 'note', powered: false };
    else if (/redstone_lamp$/.test(n)) c = { kind: 'lamp', on: n === 'lit_redstone_lamp' };
    else if (/piston$/.test(n) && !/head/.test(n)) c = { kind: 'piston', face: PISTON[sv(def, 'facing_direction')], sticky: /sticky/.test(n), ext: false };
    else if (/copper_bulb$/.test(n)) c = { kind: 'bulb', lit: !!sv(def, 'lit'), powered: !!sv(def, 'powered_bit') };
    else if (n === 'target') c = { kind: 'target', hitUntil: -1 };
    if (c) { c.p = p; cells.set(K(p), c); }
  }
  // the parts' places move with pistons (a block pushed is a new place for its part)
  const partAt = (p) => { const c = cells.get(K(p)); return c && c.p.join() === p.join() ? c : null; };
  const conductive = (p) => {
    const i = idAt(p); if (i < 0) return false;
    const d = MATERIALS.def(i), n = d.block;
    if (d.passable || d.transparent) return /noteblock|copper_bulb|target/.test(n);
    return !/repeater|comparator|observer|torch|button|lever|lamp|piston|glass|slab|stairs|leaves|fence|lantern|ice$/.test(n) || /packed_ice|blue_ice/.test(n);
  };
  let t = 0;
  const log = [];
  const sched = [];                          // [time, fn]
  const at = (time, fn) => sched.push([time, fn]);
  // what powers a cell: (strong) a solid block's power, (into) direct outputs into it
  const outputInto = (p) => {
    for (const d of N6) {
      const c = partAt(add(p, d)); if (!c) continue;
      const back = neg(d);                    // from c's place toward p
      if ((c.kind === 'rep' || c.kind === 'comp') && c.on && c.out.join() === back.join()) return true;
      if (c.kind === 'obs' && c.on && neg(c.watch).join() === back.join()) return true;
    }
    return false;
  };
  const strong = (p) => {
    if (!conductive(p)) return false;
    if (outputInto(p)) return true;
    const below = partAt(add(p, V.down)); if (below && below.kind === 'torch' && below.on && below.att.join() === V.down.join()) return true;
    for (const d of N6) { const c = partAt(add(p, d)); if (c && (c.kind === 'button' || c.kind === 'lever') && c.on && add(c.p, c.att).join() === p.join()) return true; }
    return false;
  };
  const mechPowered = (p) => {
    if (outputInto(p)) return true;
    for (const d of N6) {
      const q = add(p, d), c = partAt(q);
      if (c && (c.kind === 'button' || c.kind === 'lever') && c.on) return true;
      if (c && c.kind === 'torch' && c.on && add(c.p, c.att).join() !== p.join()) return true;
      if (c && c.kind === 'target' && c.hitUntil > t) return true;
      if ((!c || c.kind === 'note' || c.kind === 'bulb') && strong(q)) return true;    // (a powered note block or bulb is a powered block too)
    }
    return false;
  };
  const repInput = (c) => {
    const b = add(c.p, neg(c.out)), bc = partAt(b);
    if (bc) {
      if ((bc.kind === 'rep' || bc.kind === 'comp') && bc.on && bc.out.join() === c.out.join()) return true;
      if (bc.kind === 'obs' && bc.on && neg(bc.watch).join() === c.out.join()) return true;
      if ((bc.kind === 'torch' || bc.kind === 'lever' || bc.kind === 'button') && bc.on) return true;
      if (bc.kind === 'bulb' && c.kind === 'comp') return bc.lit;
      if (bc.kind === 'note' || bc.kind === 'target') return strong(b);
      return false;
    }
    return strong(b);
  };
  const sig = (p) => { const c = partAt(p); return idAt(p) + ':' + (c ? [c.on, c.lit, c.ext].join() : ''); };
  // observers: what each saw last tick
  const seen = new Map();
  for (const c of cells.values()) if (c.kind === 'obs') seen.set(c, sig(add(c.p, c.watch)));
  const pending = new Set();
  const move = (from, to) => {
    const k = K(from), id = idAt(from), c = cells.get(k);
    ids.set(K(to), id); ids.set(k, -1);
    if (c) { cells.delete(k); c.p = to; cells.set(K(to), c); }
  };
  function step() {
    // scheduled changes due now
    for (let i = sched.length - 1; i >= 0; i--) if (sched[i][0] <= t) { const f = sched[i][1]; sched.splice(i, 1); f(); }
    for (const c of [...cells.values()]) {
      const key = c;
      if (c.kind === 'rep' || c.kind === 'comp') {
        const want = repInput(c);
        if (want !== c.on && !pending.has(key)) { pending.add(key); at(t + (c.kind === 'rep' ? c.delay : 2), () => { pending.delete(key); c.on = want; }); }
      } else if (c.kind === 'torch') {
        const want = !strong(add(c.p, c.att));
        if (want !== c.on && !pending.has(key)) { pending.add(key); at(t + 2, () => { pending.delete(key); c.on = want; }); }
      } else if (c.kind === 'obs') {
        const s = sig(add(c.p, c.watch));
        if (s !== seen.get(c)) { seen.set(c, s); at(t + 2, () => { c.on = true; }); at(t + 4, () => { c.on = false; }); }
      } else if (c.kind === 'note') {
        const pw = mechPowered(c.p);
        if (pw && !c.powered) log.push({ t, what: 'note', p: c.p });
        c.powered = pw;
      } else if (c.kind === 'lamp') {
        const on = mechPowered(c.p);
        if (on !== c.on) log.push({ t, what: on ? 'lamp on' : 'lamp off', p: c.p });
        c.on = on;
      } else if (c.kind === 'bulb') {
        const pw = mechPowered(c.p);
        if (pw && !c.powered) { c.lit = !c.lit; log.push({ t, what: c.lit ? 'bulb on' : 'bulb off', p: c.p }); }
        c.powered = pw;
      } else if (c.kind === 'piston') {
        const pw = mechPowered(c.p);
        if (pw !== c.ext) {
          const front = add(c.p, c.face), beyond = add(front, c.face);
          if (pw) { if (idAt(front) >= 0) move(front, beyond); ids.set(K(front), -2); }
          else { ids.set(K(front), -1); if (c.sticky && idAt(beyond) >= 0) move(beyond, front); }
          c.ext = pw;
          log.push({ t, what: pw ? 'piston out' : 'piston in', p: c.p });
        }
      }
    }
    t++;
  }
  return {
    get t() { return t; }, log, cells, nameAt, idAt,
    run(n) { for (let i = 0; i < n; i++) step(); },
    press(p, ticks = 30) { const c = partAt(p); c.on = true; at(t + ticks, () => { c.on = false; }); },
    lever(p, on) { const c = partAt(p); c.on = on; },
    hit(p, ticks = 20) { const c = partAt(p); if (c) c.hitUntil = t + ticks; return !!c; },
    part: partAt,
  };
}
