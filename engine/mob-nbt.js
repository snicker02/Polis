// engine/mob-nbt.js — a mob as the game saves it, for the structures, made from a
// real saved mob and the game's own definition of the one wanted.
//
// The jail's, zoo's, aquarium's and museum's mobs used to be summoned by command,
// and summons kept failing in game where structures never did (the villagers, the
// golems, the farm animals, the enderman riding its minecart all came every time:
// a structure waits for its chunks and runs no command). So these come in
// structures too. Polis has saved copies of only a few mobs (entity-templates.js),
// so each is built from the cow's (the whole set of fields the game writes for a
// mob), changed to be the mob wanted:
//
//   identifier and definitions: the mob's own, its starting groups followed from
//     its own spawn event (mob-entities.js, fish-entities.js), the likeliest way
//     at every choice (an adult, not a baby), and kept (persistent);
//   Attributes: health, movement, follow range and knockback from its components;
//   Variant, MarkVariant, Color, Color2, SkinID, IsBaby: from the components its
//     starting groups carry (a coat, a colour, a tropical fish's pattern);
//   Persistent 1, its name, a UniqueID of its own, its place and facing;
//   an armour stand's Armor: the four pieces, head to feet.
//
// A rider (the jail's shulker) comes in a minecart: the player's own saved minecart
// (rider-templates.js), its link naming this mob.

import { N } from './blockcore.js';
import { COW, hydrate } from './entity-templates.js';
import { VANILLA_MOBS } from './mob-entities.js';
import { VANILLA_FISH } from './fish-entities.js';
import { MINECART_RIDER } from './rider-templates.js';

const defOf = (kind) => (VANILLA_MOBS[kind] || VANILLA_FISH[kind] || {})['minecraft:entity'] || null;

// The groups a mob starts with: its spawn event followed, the likeliest branch of
// every randomize, every trigger followed into the event it names.
export function startingGroups(kind, eventName = 'minecraft:entity_spawned') {
  const e = defOf(kind);
  const on = new Set();
  if (!e) return on;
  const events = e.events || {};
  const run = (ev, depth) => {
    if (!ev || depth > 8) return;
    if (ev.add && ev.add.component_groups) for (const g of ev.add.component_groups) on.add(g);
    if (ev.remove && ev.remove.component_groups) for (const g of ev.remove.component_groups) on.delete(g);
    if (ev.trigger) run(events[typeof ev.trigger === 'string' ? ev.trigger : ev.trigger.event], depth + 1);
    if (Array.isArray(ev.sequence)) for (const s of ev.sequence) run(s, depth + 1);
    if (Array.isArray(ev.randomize) && ev.randomize.length) run(ev.randomize.slice().sort((a, b) => (b.weight || 1) - (a.weight || 1))[0], depth + 1);
  };
  run(events[eventName], 0);
  return on;
}

// a component's value, from the mob's own components or the groups it starts with
function component(e, groups, name) {
  let v = (e.components || {})[name];
  for (const g of groups) { const c = ((e.component_groups || {})[g] || {})[name]; if (c !== undefined) v = c; }
  return v;
}
const num = (c, key = 'value') => (c === undefined || c === null ? null : typeof c === 'number' ? c : typeof c[key] === 'number' ? c[key] : (c[key] && typeof c[key].range_max === 'number') ? c[key].range_max : null);

let counter = 1;
function uid(rng) { return -BigInt(Math.floor(rng() * 2 ** 40)) * 1000n - BigInt(counter++); }
const floats = (a) => N.list(5, a.map((v) => N.float(v)));

// the four armour pieces, head to feet, as the game saves an item
function item(name) { return N.comp({ Count: N.byte(name ? 1 : 0), Damage: N.short(0), Name: N.str(name || ''), WasPickedUp: N.byte(0) }); }

export function mobNbt(kind, x, y, z, rng, opts = {}) {
  const e = defOf(kind);
  const m = hydrate(COW);
  const v = m.v;
  let groups = startingGroups(kind);
  if (opts.variety) {
    // a named variety's pattern and colours its own: the spawn event's random ones left out
    const looks = (g) => { const c = ((e && e.component_groups) || {})[g] || {}; return ['minecraft:variant', 'minecraft:mark_variant', 'minecraft:color', 'minecraft:color2'].some((k) => k in c); };
    groups = new Set([...groups].filter((g) => !looks(g)));
    for (const g of startingGroups(kind, 'minecraft:become_' + opts.variety)) groups.add(g);
  }
  const kept = !!e && JSON.stringify(e).length > 0 && (VANILLA_MOBS[kind] || VANILLA_FISH[kind]);
  v.identifier = N.str('minecraft:' + kind);
  v.definitions = N.list(8, ['+minecraft:' + kind, ...[...groups].map((g) => '+' + g), ...(kept ? ['+polis:kept'] : [])].map((d) => N.str(d)));
  v.UniqueID = N.long(uid(rng));
  v.Pos = floats([x, y, z]);
  v.Rotation = floats([opts.yRot || 0, 0]);
  v.Persistent = N.byte(1);
  v.NaturalSpawn = N.byte(0);
  if (opts.name) v.CustomName = N.str(opts.name);
  // its looks, where its starting groups set them
  if (e) {
    const set = (field, comp, tag = 'int') => { const n = num(component(e, groups, comp)); if (n !== null) v[field] = N[tag](n); };
    v.Variant = N.int(0); v.MarkVariant = N.int(0); v.Color = N.byte(0); v.Color2 = N.byte(0); v.SkinID = N.int(0);
    set('Variant', 'minecraft:variant'); set('MarkVariant', 'minecraft:mark_variant');
    set('Color', 'minecraft:color', 'byte'); set('Color2', 'minecraft:color2', 'byte'); set('SkinID', 'minecraft:skin_id');
    v.IsBaby = N.byte(component(e, groups, 'minecraft:is_baby') !== undefined ? 1 : 0);
    // its attributes: health, movement, follow range, knockback, its own
    const health = component(e, groups, 'minecraft:health'), mv = num(component(e, groups, 'minecraft:movement'));
    const hp = num(health), hmax = num(health, 'max') || hp;
    const fr = num(component(e, groups, 'minecraft:follow_range')), kb = num(component(e, groups, 'minecraft:knockback_resistance'));
    for (const a of (v.Attributes ? v.Attributes.v : [])) {
      const nm = a.v.Name.v, put = (val, max) => { a.v.Base = N.float(val); a.v.Current = N.float(val); if (max !== undefined) { a.v.Max = N.float(max); a.v.DefaultMax = N.float(max); } };
      if (nm === 'minecraft:health' && hp) put(hp, hmax || hp);
      if (nm === 'minecraft:movement' && mv !== null) put(mv);
      if (nm === 'minecraft:follow_range' && fr !== null) put(fr);
      if (nm === 'minecraft:knockback_resistance' && kb !== null) put(kb);
    }
  }
  // the cow's own state taken off: no breeding, no love, nothing it was doing
  for (const k of ['Sheared', 'Saddled', 'Chested', 'InLove', 'IsEating', 'IsTamed', 'Sitting']) if (v[k]) v[k] = N.byte(0);
  if (opts.armour) v.Armor = N.list(10, opts.armour.map(item));
  return m;
}

// a mob riding a minecart (the player's own saved minecart, linked to it)
export function mobInMinecart(kind, x, y, z, rng, opts = {}) {
  const cart = hydrate(MINECART_RIDER.cart);
  const mob = mobNbt(kind, x + 0.5, y + MINECART_RIDER.riderDy, z + 0.5, rng, opts);
  cart.v.UniqueID = N.long(uid(rng));
  cart.v.Pos = floats([x + 0.5, y + MINECART_RIDER.cartDy, z + 0.5]);
  for (const link of cart.v.LinksTag.v) link.v.entityID = N.long(mob.v.UniqueID.v);
  return [cart, mob];
}
