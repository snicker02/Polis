# Polis v0.1.1

A procedural city generator that exports to **Minecraft Bedrock**. Plans a
street grid, subdivides it into lots, raises buildings with real interiors —
stairs, floors, windows, doors — and writes the result out as `.mcstructure`
chunks wrapped in a `.mcpack` behaviour pack.

No dependencies. WebGL1 preview. ES modules, served from any static host.

```
polis/
  index.html
  main.js                UI, minimap, export wiring
  engine/
    rng.js               mulberry32 + value noise / fbm
    materials.js         block palette: ids, states, preview colours, themes
    blockcore.js         sparse voxel store, NBT writer, mcstructure, zip
    plan.js              street grid, zoning, lot subdivision
    building.js          one building: shell, floors, spiral core, openings
    verify.js            player-movement flood fill
    city.js              plan -> blocks: roads, lots, parks, furniture
    mesher.js            greedy face-culled mesher for the preview
    renderer.js          WebGL1 orbit viewer with cutaway
    export.js            chunk split, placement guide, .mcpack / .zip
  tools/
    nbt-read.js          little-endian NBT + zip reader (validation only)
    validate.js          headless test harness
```

## Running it

It is all static files, but ES modules need a real origin — opening
`index.html` from `file://` will not work. Any one-liner will do:

```
python3 -m http.server 8080      # then open http://localhost:8080
npx serve .
```

Headless checks:

```
npm run validate                 # node tools/validate.js
```

## The requirements, and how they are met

**Steps up to every level.** Each building has a 3×3 spiral stair core. The
climb runs around a ring of eight cells, rising exactly one block per cell, so
it lands flush with every floor slab whatever the floor pitch is. A landing
hole is punched through the slab at each floor, and the core always keeps at
least one cell of open floor on all four sides so you can step off the ring
wherever the spiral puts you.

The subtle part is headroom. A player standing on a step at height `s` needs
cells `s+1`, `s+2` **and** `s+3` clear — the third one because the next step up
puts their head where the floor slab above would otherwise be. The landing rule
excludes the ring cells of the steps at `Y-1`, `Y-2` and `Y-3`. Get that wrong
by one and the climb stalls at the first floor; this is what the verifier
caught during the build.

**Windows and doors.** Real `minecraft:*_door` blocks with proper
`direction` / `door_hinge_bit` / `upper_block_bit` states, placed on the lot's
street frontage. Towers get twin doors and a lit entrance. Window banding
varies by style: ribbon glazing on towers, punched openings on mid-rises,
individual panes on houses.

**At least 2 blocks of headroom per level.** Floor pitch defaults to 5, giving
4 blocks of interior clearance, and is adjustable from 4 to 7 (3 to 6 clear).
The validator asserts the minimum on every configuration it generates.

**Streets between the buildings.** A BSP subdivision produces avenues,
streets and alleys with sidewalks, curbs, centre lines and crosswalks. Lot
subdivision guarantees frontage through alleys, so there are no landlocked
lots and every door opens onto pavement.

## Verification

`engine/verify.js` is not a heuristic — it is a flood fill over *standing
positions* using Minecraft movement rules: a position needs air at feet and
head with something solid underfoot, you may step up or down one block if
there is headroom, and doors count as passable. It starts on the pavement
outside the front door and asks whether every floor is reachable.

The UI runs it on every generate and reports `stairs verified ✓ n/n floors`.
`tools/validate.js` runs it across ten city configurations and 36 single
buildings; at the time of writing that is 2,000+ floors, all reachable.

## Exporting to Bedrock

1. **Export .mcpack** and open the file — Bedrock imports it.
2. Enable the behaviour pack on the world, with cheats on.
3. Stand where you want the city and run one command:

```
/function polis/build_centered      city centred on you
/function polis/build               city corner at your feet
```

The city's ground layer replaces the block you are standing on.

Bedrock caps structures at 64 blocks per horizontal axis, so a city ships as
aligned 64×64 tiles; the two functions just load all of them in one go with
relative coordinates. Bedrock only places structures into **loaded chunks**.
For a large city, stand near the middle, raise render distance and fly up so
the whole area is in view. If a corner comes up missing, move toward it and
run the function again — reloading a tile is harmless.

**Fill open areas with air** (on by default) writes real `minecraft:air` into
every empty cell instead of structure void. Loading then clears terrain,
trees, water and anything else out of the whole city volume — full tile
footprint, from the base layer up to the tallest roof — including inside the
buildings. Turn it off to keep whatever is already there, which only matters
if you are deliberately layering the city onto an existing build. On a flat
world the two modes look identical.

The panel still lists exact-coordinate `/structure load` commands offset from
the base X/Y/Z you set, and **Copy exact /structure commands** puts them on the
clipboard. `placement-guide.txt` inside the pack has both.

**Export .mcstructure zip** gives the raw structure files and the two
`.mcfunction` files, for dropping into an existing pack.

## Controls

Drag to orbit, wheel to zoom, shift-drag or right-drag to pan. The **Cutaway**
slider slices the build horizontally so you can look down into the floors and
check the stair core for yourself. In city mode, clicking the plan minimap
moves downtown — towers rise toward wherever you put it and taper off with
distance, which is the same interaction as the earlier Downtown sketch.

## Notes and caveats

**Block ids.** Every block id and state lives in `engine/materials.js`. They
are the flattened modern Bedrock ids (1.21+). If a future version renames
something, that table is the only place to edit.

**Stair and door orientation.** Bedrock's `weirdo_direction`
(`0=east, 1=west, 2=south, 3=north`) does not match the door `direction`
ordering (`0=east, 1=south, 2=west, 3=north`), which is an easy thing to get
backwards. Both mappings are in `materials.js`. If an orientation is wrong the
failure is cosmetic: stairs face the wrong way and the spiral degrades from a
smooth walk to a jump per step. It stays climbable either way, because the
three-cell headroom rule does not depend on the stair shape. Turning **Stair
blocks** off replaces them with full blocks and is the fallback.

**blockcore.** This copy is a same-API rebuild rather than the canonical one
shipped in `fieldcraft-v0.1.0.zip`. It wants a reconciliation pass against the
Fieldcraft and Hypostyle copies before the three drift further apart.

**Shaders.** No `glslangValidator` was available in the build environment and
there is no usable npm or pip package for it, so `validate.js` does a
structural lint instead: varyings matched across stages, every uniform and
attribute declared in a shader is looked up by the renderer and vice versa, no
undeclared identifiers in the fragment stage, balanced blocks. It also runs the
renderer against a mock GL context to exercise the draw path. That catches the
silent-black-screen class of bug but is not a compile — the first browser load
is still the real test.

## Performance

A 192×192 city is roughly 250k blocks and 80 buildings: about 50 ms to
generate, 150 ms to verify, 500 ms to mesh. The mesher merges an exposed-face
count of ~1M down to ~160k quads. Vertices are 20-byte interleaved (position
`3×f32`, colour `4×u8`, normal `3×i8`) in batches of at most 16,384 quads so a
single shared `Uint16` index buffer serves them all, which is what keeps it
inside WebGL1's limits.

## Changelog

**0.1.1** — The pack now contains `functions/polis/build.mcfunction` and
`build_centered.mcfunction`, so the whole city loads with one command. New
**Fill open areas with air** export option (default on) replaces structure
void with air so loading clears existing terrain; tiles are then emitted at
full footprint and full city height so the carve has no gaps. Pack name and
description now carry the seed. The command list no longer encodes every
structure just to print coordinates. Validator adds an end-to-end simulation
of both functions against the source world, cell for cell.

**0.1.0** — First release.

