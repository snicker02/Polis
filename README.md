# Polis v0.1.5

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

**Steps up to every level.** Three stair layouts, chosen per building by
the **Stairs** setting:

- **Switchback** — 1-wide straight flights that alternate direction each
  storey, with a landing at both ends. Core is (pitch+1) × 2.
- **Wide switchback** — the same with 2-wide flights. Core is (pitch+1) × 4.
- **Spiral** — the original 3×3 ring. Compact, but tight to walk.
- **Mixed** (default) — towers get wide switchbacks, most mid-rises and houses
  get switchbacks, and about a third of mid-rises keep a spiral for variety.

Every layout falls back to the next one that fits if the footprint is too
small. Straight flights only need the two landings open, so they can sit flush
against the back wall — away from the street, so the front door never opens
onto a flight.

The subtle part is headroom. A player standing on a step at height `s` needs
cells `s+1`, `s+2` **and** `s+3` clear — the third one because the next step up
puts their head where the floor slab above would otherwise be. At each slab the
cells over the three highest steps below it are left open. Get that wrong by
one and the climb stalls at the first floor; the verifier caught exactly that
during the first build.

**Windows and doors.** Real Bedrock door blocks with `direction` /
`door_hinge_bit` / `upper_block_bit` states, placed on the lot's street
frontage — oak, spruce, birch, dark oak, mangrove, crimson and warped, all of
which open by hand. Towers get twin doors and a lit entrance. Window banding
varies by style: ribbon glazing on towers, punched openings on mid-rises,
individual panes on houses.

**At least 2 blocks of headroom per level.** Floor pitch defaults to 5, giving
4 blocks of interior clearance, and is adjustable from 4 to 7 (3 to 6 clear).
The validator asserts the minimum on every configuration it generates.

**Streets between the buildings.** A BSP subdivision produces avenues,
streets and alleys with sidewalks, curbs, centre lines and crosswalks. Lot
subdivision guarantees frontage through alleys, so there are no landlocked
lots and every door opens onto pavement.

## Life

**Farms** take over some suburban lots (**Farms** slider). Each is hedged in
oak leaves with a two-block entrance on the street side, has a dirt path
round the inside, and a water channel running down the centre — more than one
channel on wide farms, spaced so every farmland block is within 4 of water and
stays hydrated. Wheat, carrots and beetroot grow in strips at mixed stages. A
composter by the entrance is the farmer's workstation.

**Water never escapes.** Every water block — farm channels, park ponds,
plaza fountains — sits at ground level with solid blocks on all four sides and
underneath. Water does not flow upward, so the crops and flowers above it are
safe, and there is nothing at its own level for it to spread into. The
validator checks every water block in every test city against that rule.

**Ponds** appear in about half the parks (**Park ponds** slider): a clay-bottomed
oval in one quarter of the park, clear of the paths, with flowers on the bank.

**Interiors.** Houses get a kitchen downstairs (crafting table, furnaces,
barrel, bookshelves) and bedrooms upstairs; mid-rises get a shop on the ground
floor and apartments above; towers mix lobbies, apartments, offices and
libraries. Planters — a grass block with a flower or azalea — sit in rooms
throughout. Beds come in eight colours, stored in the bed's block entity.
Furniture only goes against the outer walls, never within one cell of the
stairs or two cells of the front door, and every furnished building is
re-verified: if furniture ever cost a floor its reachability, it is removed.

**Villagers and golems.** The populate function summons villagers next to beds
(**Villagers** slider caps the number) and one iron golem per eight villagers.
Golems are placed only on pavement and plazas, outside every building
footprint, with three clear blocks of headroom. A bell in a plaza or park gives
the village its gathering point. Workstations — composters, cartography and
fletching tables, blast furnaces, brewing stands, cauldrons, barrels — let
villagers take up professions.

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
/function polis_12345_a3f9/build_centered      city centred on you
/function polis_12345_a3f9/build               city corner at your feet
```

Then, once the whole city has finished appearing — **without moving** — run

```
/function polis_12345_a3f9/populate_centered   (or populate, after build)
```

which summons the villagers and iron golems. It is a separate step on
purpose: `/structure load` keeps placing blocks after the command returns, so
mobs summoned in the same function arrive before their floors do. `build` is
safe to rerun if some tiles were missed; `populate` is meant to run once.

`polis_12345_a3f9` is the **city id**: the seed plus a four-character hash of
the actual blocks. It is shown in the app, printed at the top of
`placement-guide.txt`, used in the pack's name and in the exported filename.
Typing `/function polis` in chat autocompletes every Polis city installed on
that world. Because each export has its own id, any number of city packs can
be active at once without handing each other's tiles to `/structure load`.

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

**Beds.** Bed orientation uses the legacy numbering Bedrock inherited
(`direction` 0 = head to the south, 1 = west, 2 = north, 3 = east). It is the
one block mapping here that could not be checked against a current reference.
If beds ever load as single halves, that table in `materials.js` (`BED_DIR` /
`BED_VEC`) is the only thing to change.

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

**0.1.5** — Villagers and golems now come from a separate `populate`
function, run after the city has appeared. In 0.1.4 the summons ran in the
same function as the structure loads, which finish placing blocks later, so
mobs arrived before their floors. Summons also used half-block offsets, which put every mob one
block off whenever the player stood past the middle of a block. They now use
whole-block offsets. Both functions report in chat. The validator simulates the
load and summons from off-centre player positions and checks that every mob
stands on a floor with clear space; the 0.1.4 offsets fail that check.

**0.1.4** — Life. Farms with central irrigation channels and hydrated
farmland, park ponds, flowers, furnished interiors (beds in eight colours,
crafting tables, furnaces, bookshelves, barrels, workstations, planters,
rugs), a village bell, and villagers and iron golems summoned by the build
function. New `blocks` / `blocks_centered` functions re-place blocks without
duplicating mobs. Every new block id was checked against Microsoft's Bedrock
block list; furnaces use the newer `minecraft:cardinal_direction` state and
carry a matching palette version tag. Validator adds watertightness of every
water block, farm hydration, bed pairing and colours, furniture clearance,
villager and golem placement, and the summon lines in the functions.

**0.1.3** — Oak doors now use Bedrock's `minecraft:wooden_door`; 0.1.2 and
earlier wrote the Java name `minecraft:oak_door`, which Bedrock does not have,
so every oak door loaded as a broken block. Iron doors are gone — they need
redstone to open — and tower themes now use dark oak, crimson, spruce, warped
and birch doors. New stair layouts: switchback and wide switchback, plus a
**Stairs** setting (Mixed / Switchback / Wide switchback / Spiral); Mixed is
the default. Validator adds a 240-build sweep across every layout, pitch and
footprint, and checks that every door id is a hand-openable Bedrock door.

**0.1.2** — Every export gets its own namespace (`polis_<seed>_<hash>`), so
multiple city packs on one world no longer collide — in 0.1.1 all packs used
`polis:c_x0_z0` and Bedrock picked whichever pack was higher in the list. The
hash is of block names, so regenerating the same city gives the same id, and
changing any slider on the same seed gives a new one. The placement guide now
opens with the exact command to type and names the seed. Validator adds
collision tests across two exported packs.

**0.1.1** — The pack now contains `functions/polis/build.mcfunction` and
`build_centered.mcfunction`, so the whole city loads with one command. New
**Fill open areas with air** export option (default on) replaces structure
void with air so loading clears existing terrain; tiles are then emitted at
full footprint and full city height so the carve has no gaps. Pack name and
description now carry the seed. The command list no longer encodes every
structure just to print coordinates. Validator adds an end-to-end simulation
of both functions against the source world, cell for cell.

**0.1.0** — First release.

