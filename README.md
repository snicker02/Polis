# Polis v0.45.1

*Created with help from Claude AI.*

**Polis is a free Minecraft city generator that runs in your browser.** Pick a
size and a style, and it plans a whole city — streets, furnished buildings with
real stairs and rooms, railways, bridges, a metro, landmarks, even a jail, a zoo
and an aquarium — then gives you a Minecraft Bedrock `.mcpack` (or a Java
datapack) to build it with one command. It can also fit a city to the real
ground of your own world.

**Use it in your browser: https://snicker02.github.io/Polis/** (nothing to
install).

A procedural city generator that exports to **Minecraft Bedrock** and **Java
Edition**. Plans a street grid, subdivides it into lots, raises buildings with
real interiors — stairs, floors, windows, doors — and writes the result out as
`.mcstructure` chunks in a `.mcpack` behaviour pack, or Java structures in a
datapack.

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
    validate.js          headless test runner
    combine.js           adds the shards of a split run into one result
    checks/
      registry.js        every section, its group and the fixtures it shares
      harness.js         counters, per-section timing, shard output
      fixtures.js        the expensive cities, built once and shared
      <id>-<name>.js     one file per section of checks
```

## Running it

It is all static files, but ES modules need a real origin — opening
`index.html` from `file://` will not work. Any one-liner will do:

```
node tools/serve.js              # then open http://localhost:8080
```

`tools/serve.js` is a dependency-free static server with caching switched off.
Browsers cache JavaScript modules hard, so after unzipping a new version any
other server can hand you a mix of old and new files. The app checks for that:
if the page, `main.js` and the engine report different versions it shows a red
banner and refuses to export until you hard-refresh (Ctrl+Shift+R).

Headless checks:

```
npm run validate:plan            # once: packs the suite into batches of at most 4 minutes
npm run validate:batch -- 1      # then each batch: 1, 2, 3 (the plan says how many)
npm run combine                  # adds the batches up into one result
npm run validate:list            # every section, and how long it took last time
```

The suite (64 sections, about thirteen minutes of machine time) is run in pieces:
each run writes a shard to `.validate/`, and `npm run combine` adds them into
one total. The combiner will not report a pass if a section was missed,
counted twice, or measured before the newest source file changed.

`--plan [seconds]` packs the sections into batches that each fit the budget
(240 by default), from the measured times, and saves the plan; `--batch k`
runs batch k of it. The plan does not move until the next `--plan`, so times
measured meanwhile cannot shift a section into two batches or none. Every run
records its sections' times in `tools/checks/times.json` (kept with the checks,
so a release carries them). `node tools/validate.js --only 2z,3` runs named
sections, `--group fast|slow` a group, and `--part k/n` still splits a group
on the spot. A check that needs many cities but asks only about the plan, the
streets or the outdoors builds them with `LIGHT` (tools/checks/harness.js): no
furniture, lighting, fish or hostile mobs, three or four times quicker.

## The requirements, and how they are met

**Steps up to every level.** Three stair layouts, chosen per building by
the **Stairs** setting:

- **Switchback** — 1-wide straight flights that alternate direction each
  storey, with a landing at both ends. Core is (pitch+2) × 2. Each flight has
  one step per block of height, the top one set into the floor above, so you
  walk straight off onto the landing without a hop.
- **Wide switchback** — the same with 2-wide flights. Core is (pitch+2) × 4.
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

## Perimeter wall

A stone-brick wall runs round the city's outermost row (the outside edge of
the ring road), 3 blocks high by default — the **Perimeter wall** slider sets
0–8. It starts at ground level and the city's surface and stone base beneath
it are already solid, so water has no way in at any height up to the top of
the wall. Each side has a double wooden door near the middle (it slides along the
wall if something is in the way); closed doors block
water too, so the gates do not weaken it. Walls under 3 blocks have no gates —
you can step or jump over them. If you build next to water that stands higher
than the wall, raise the slider.

## Uneven ground

Two export settings let a city sit properly into real terrain:

- **Foundation depth** (default 8) — solid ground under the city's stone
  base, stone inside with a stone-brick retaining face round the edge. On a
  slope the low side becomes a retaining wall instead of the city floating
  over a gap, and caves under the city are filled.
- **Clear above ground** (default 32, with air fill on) — terrain inside the
  city is cleared up to that height even where no building reaches it, so a
  hillside does not leave overhangs above the streets.

Both are built into the structure files at export time; the preview shows the
city itself. The city id includes these settings, so packs of the same city
exported differently never collide.

## Detail on the outside

Buildings are no longer plain boxes. Every one gets quoins at the corners,
pilasters between the window runs, an eave of upside-down stairs projecting at
the roofline, a framed doorway, and clutter on the roof — a chimney on a house,
a water tank on legs or vents on anything taller. Above the ground floor there
are railed balconies and, on mid-rises, a projecting bay window. Everything that
sticks out is placed only into empty space and always above head height, so it
can never block a street, a doorway or a lamp; the **Facade detail** checkbox
turns it off.

## Shopfronts and street names

**Shops.** A shop at street level gets a proper glass front between the piers,
an awning over the pavement, a counter just inside, and a **wall sign** with
its name (Bakery, Cobbler, Tea House, Fishmonger...).

**Street names.** Every street and avenue is named, however narrow (alleys
inside the blocks are not): numbered avenues one way across the city, tree
names the other, so a junction reads "Oak St / First Ave". Past the end of the
lists the names carry on with a compass prefix (N Oak St), so no two streets
share a name. Each junction gets a standing sign on a pavement corner with both
names on it, facing the crossing. The **Street name signs** checkbox turns them
off.

## Rooms

Floors are divided into real rooms. Each floor gets a corridor along its
length, taking in the stair core and the open floor round it, so every landing
opens onto the corridor. The strips either side become rooms, 4–6 blocks long,
each behind a floor-to-ceiling inside wall with a door onto the corridor:

- **Houses** — kitchen and living room downstairs, bedrooms upstairs; a
  one-storey cottage is split into a kitchen and a bedroom.
- **Mid-rises** — shops at street level, apartments above: each apartment is
  a kitchen off the corridor with its bedroom behind it, through a door in the
  wall between them (or a studio with a bed and a stove).
- **Towers** — shops at street level, then floors of apartments and offices.
- **Landmarks** keep their open halls; libraries get freestanding shelf rows.

Each room is furnished along its own walls, clear of every doorway, and the
piece that makes it what it is goes in first — the bed in a bedroom, the
crafting table in a kitchen (a room too cramped for a bed becomes a sitting
room). Narrow rooms keep the row by their door as an aisle. Every room has a
light. Inside walls take the style's finish: plaster in modern cities,
sandstone in the desert, spruce in the snow, calcite in cherry towns, oak
panelling in medieval ones. Switchback stairs now sit against the back wall
when they can, leaving one deep strip for rooms instead of two shallow ones.
After furnishing, every room is walked to from the front door (stepping up
only onto stairs); if any room cannot be reached, the building keeps an open
plan instead.

**Art.** Rooms carry real **paintings** — from a structure saved in game, so
the motifs are genuine Bedrock paintings in their proper sizes (1x1, 2x1, 1x2
and 2x2). They are entities, so they travel with the villagers in the mob
structures. Each is hung at eye level on a clear patch of wall with solid wall
behind every block of it, after the furniture is in, one or two to a room and
no more than eight to a building. The inside walls also carry 2x2 panels of
glazed terracotta — four tiles of one colour, each turned a quarter from the
last — and since a wall is one block thick, both rooms see each panel.

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

**Animals.** Every city gets at least four fenced paddocks — one each of
cows, sheep, pigs and chickens, more in big cities — on the lots furthest from
downtown, with a gate on the street side, hay and a water trough, and four to
ten animals each depending on the pen's size. About a third of parks get a
fenced bamboo grove with a panda or two. Cats — five coats, wild and
unowned — wander the pavements and plazas. Cats and pandas travel in the mob
structures like the villagers (templates from a structure saved in game);
and so, since 0.3.0, do cows, pigs, chickens and sheep (white or light
grey), from templates in a second structure saved in game.

**Workstations for every profession.** Interiors now include smokers,
lecterns, stonecutters, looms, grindstones and smithing tables alongside the
earlier ones, plus chests and table lanterns, so all thirteen professions have
somewhere to work. Farms get potatoes as a fourth crop and hay bales; parks
get lantern posts at the path crossing.

**Villagers at every level.** About 70% of villagers start with a trade —
armorer, butcher, cartographer, cleric, farmer, fletcher, leatherworker, mason
or toolsmith — at a level from novice to master (roughly 30/25/20/15/10%);
the rest are unemployed and take jobs from the workstations. The templates come
from villagers saved in game: every profession's trade table already holds all
five levels' trades, and `TradeTier` / `TradeExperience` unlock them (novices
get a few points so they keep their job even away from a workstation).

**Villagers and golems.** The populate function places villagers next to beds
(**Villagers** slider caps the number) and iron golems — **Golems per 10
villagers** sets how many (default 3, up to 10 for a well-guarded city).
Golems are placed only on pavement and plazas, outside every building
footprint, with three clear blocks of headroom. A bell in a plaza or park gives
the village its gathering point. Workstations — composters, cartography and
fletching tables, blast furnaces, brewing stands, cauldrons, barrels — let
villagers take up professions.

## City styles

**City style** restyles the whole city in one setting:

- **Modern** — concrete, glass and asphalt (the original look).
- **Desert** — sandstone, terracotta and acacia; sand underfoot, acacia trees
  and cacti, dead bushes in place of flowers, sandstone roads and wall.
- **Snowy** — spruce, stone and deepslate; snow over every open patch of
  ground, spruce trees, dark stone roads, cobblestone wall.
- **Cherry blossom** — cherry wood, calcite, white and pink; cherry trees,
  pink petals among the flowers, gravel lanes, calcite sidewalks.
- **Medieval** — stone brick, cobblestone and timber frame (white walls with
  oak or dark-oak framing); cobbled streets, dirt park paths, lantern posts.

Each style has its own building palettes (walls, trims, floors, doors and
stair kinds for houses, mid-rises and towers) and its own landmarks — a
sandstone town hall with a terracotta dome, a calcite one with cherry columns,
and so on. Ground, roads, sidewalks, markings, park paths, trees, flowers,
street lamps, the perimeter wall and terrace faces are *role materials*,
separate from other uses of the same block, so a style restyles the roads
without touching a grey-concrete wall; indoor planters keep their own soil so
flowers still grow in them in the desert. Every block in every style is checked
against Bedrock's own state list (plain terracotta is `hardened_clay`, the dead
bush is `deadbush`, cobblestone stairs are `stone_stairs`), and the validator
checks that plants stand on soil they can grow on, cacti stand on sand with
nothing solid beside them, and snow lies only on solid ground.

## Fitting a city to your own world

Load a world exported from Minecraft (**Worlds → pencil → Export World**) into
the **Fit to your world** panel and Polis will build a city that suits the real
ground.

**Either edition.** A Bedrock world is a `.mcworld`; a Java world is the world
folder from `saves`, zipped. Polis works out which it has and reads it: for
Bedrock, `db/` is a LevelDB (tables plus a write-ahead log) holding records per chunk; for Java,
`region/*.mca` are Anvil region files, each holding up to 1024 chunks behind a
sector header, with the ground heights packed nine bits at a time into longs
in `Heightmaps.WORLD_SURFACE`. Both are read here in plain JavaScript —
LevelDB, Anvil, zip, gzip and DEFLATE all written from scratch — and both come
out as the same heightmap, so everything after that is shared.

### Filling in unexplored ground (Chunk Pregen)

Bedrock only writes a chunk to the save once something in it has changed, so
land you have only flown over is often not in the exported world. The panel
under the map fixes that:

1. **Download Chunk Pregen** and open the file to add it to Minecraft.
2. Edit the world: activate it under **Behavior Packs**, and turn **Cheats** on.
3. In the world, paste the copied command into chat, either for the chosen site
   or for the whole map view, and wait for **Done**.
4. Quit to the title screen, **Export World** again, and load it here.

The pack generates the area in batches and flips one block at the top of each
chunk and back, so the game counts the chunk as changed and saves it. Its own
commands (`/scriptevent pregen:help`, `pregen:status`, `pause`, `resume`,
`stop`, `walk`, `menu`) are described in `pregen/README.md`.

The Bedrock path in detail: a `.mcworld` is a zip, and inside it `db/` is a
LevelDB: sorted tables (`*.ldb`) and a write-ahead log (`*.log`) of everything
written since the last compaction. Bedrock can leave freshly generated chunks
in the log for a long time, so both are read, and where a key appears more
than once the record with the highest sequence number wins (a newer deletion
removes it). Polis unzips, walks the tables and the log and
takes the 1.18-and-later "Data3D" record, which starts with the chunk's
heightmap and carries its biomes. All of it is done here, in plain JavaScript —
the zip, the LevelDB block format and the DEFLATE decompression (`inflate.js`),
since the browser's own decompressor cannot be used synchronously.

The heightmap counts the top of anything, so a forest reads as rough ground. A
median filter over a small window takes the treetops off and leaves the land —
but it smooths away real detail along with them. So for the square a city will
actually stand on, a Bedrock world is read properly: the blocks themselves
come out of the subchunk records (palette, packed indices, ordered x then z
then y), and the ground is the first real block down each column, with trees,
leaf litter and grass passed over and water noted where it lies. That is about
a second's work for a site, so the map still uses the heightmaps and the
blocks are read when a site is chosen. Java worlds keep their heightmap, which
is already exact.
From that, Polis works out the **base level** (the median of the dry ground,
which the streets sit on), which cells are **water**, and which are too steep
or too far above or below to build on. Then:

- the **outline** keeps the blocks that are mostly buildable, leaving water,
  cliffs and anything beyond cut-and-fill range alone;
- the **whole city surface follows the land, cell by cell** — the streets roll
  with the ground instead of standing on one flat plane. Two rules keep it
  walkable: no two neighbouring cells differ by more than a block, and every
  lot is dead level so its building has flat ground. Anything that cannot
  slope (a lot, the canal, the harbour basin) is levelled as a unit, and the
  streets ramp to meet it. The surface is fitted with two slope-limited
  envelopes — one shaving the peaks, one filling the hollows — and takes the
  middle of the two, which keeps most of the city within two blocks of the
  real ground;
- where the city is **cut into rising ground**, the cut is graded rather than
  left as a face: the land outside climbs away a block per cell until it meets
  the real hillside, each step keeping the surface the land had, with a low
  retaining wall holding the first step at the city's edge. Where two slopes
  meet, the higher comes down until the join is a step rather than a jump;
- each column is **carved and founded only as far as it needs**: cleared to
  the height the clearance setting asks for above the city's own roofs, and
  above anything that stood there (by the raw heightmap, so a tree is taken
  with its trunk rather than left floating), then founded down to the ground
  and no further. Everything outside stays structure void, so the landscape
  around the city is left standing instead of a box being cut out of it.

**The preview shows the land.** When a world is loaded, the surrounding ground
is drawn around the city in the viewer — surface and a little depth, water
included — so a city cut into a hillside or standing proud of a slope can be
seen before anything is exported. The land is added to a copy of the world for
the preview only; the export writes the city and nothing else.

A fitted city can be placed either way, and there is a button for each that
copies a `/tp` straight to the spot: the **corner** with `build`, or the
**centre** — the monument's alcove — with `build_centered`. Both put the city
on exactly the ground it was fitted to. The corner spot is the first block of
the city, not the corner of the site: an outline rarely reaches the site edge,
so those differ.

**Scroll on the map to zoom**, from about 3000 blocks across down to 250; it
zooms about the pointer, so what you are looking at stays where it is, and the
scale is written under the map.

Click the map to choose a site, or type coordinates (an F3 position pasted
straight in works: `-6926.11 69.00 -10080.98`) to jump anywhere in the world.
The whole world is read once, so moving about is instant. The panel shows the
ground range, the base level, and how much of the site is explored, water or
buildable. A site does not have to be fully explored — unexplored ground is
left alone exactly like water or a cliff, and the city grows on what is
there — so anywhere with about 60% explored and a third of it buildable can
take a city. The stats panel then tells you
exactly where to stand — the corner of the site, one block above base level —
and the placement guide in the pack repeats it.

On rough ground the city shrinks rather than pretending: a mountain site may
keep only a sixth of its area, a gentle one nearly all of it.

## Outline and hills

**Organic outline** (default; **Outline** can switch back to Square). The
city keeps only the blocks inside a lobed shape and the streets that border
them, so its edge follows the street grid in an irregular outline instead of
filling the square. Holes are filled and stray islands dropped, so the city is
always one piece with a single edge. The perimeter wall follows that edge (with
a gate on each compass side), and the rail loop follows it too, laid along a
contour a fixed distance in from the wall, with a curved rail at every corner.
Land outside the outline is left exactly as it was: no ground layer, no air
fill, no foundation.

**Hills** (0–3, default 2). Each city block sits on a terrace 0 to 3 blocks
above the streets, following a smooth hill pattern, so neighbouring blocks
rise and fall gently. The streets stay level, which keeps the railway, its
bridges and the loop exactly as they are. Each block is generated flat and
lifted whole, so buildings, stairs and furniture keep every guarantee they had;
the terrace is solid underneath with a stone-brick face towards the street.
Staircases are cut into every side of a raised block, climbing straight in
from the street and facing it: one step per block of height, cut into the
sidewalk (and the yard behind it for a 3-high terrace), so they never stick
out into the street. Where a straight flight will not fit, the steps run along
the kerb instead.

## The centre monument

The spot you build from is marked by a monument, built from a structure saved
in game: a block of diamond with a person-sized alcove through it, a wall sign
above the entrance reading "Polis / city centre / you built from here", and
three beacons on the roof, so the beam is visible from anywhere in the world.
`build_centered` centres the city on the alcove, so you end up standing inside
it, under the sign, when the city appears. It goes as near the middle as it
can while staying outdoors, on level ground, clear of buildings, off the
railway and under open sky, with its entrance turned to face the street — a
plaza or pavement is preferred to the roadway, but being near the middle counts
for more. The **centreMark** setting turns it off.

## The harbour

A stretch of the canal, clear of the bridges, is widened into a **basin** and
the block beside it becomes a working waterfront — a second centre away from
downtown:

- **Quay** — a paved wharf along the water with mooring bollards, stacked
  crates and barrels, and a clear walking lane behind them.
- **Cranes** — gantries on the quay, their arms reaching out over the water
  with chains hanging from them.
- **Warehouses** — long sheds facing the quay, entered from it.
- **Goods yard** — gravel behind the sheds with rail sidings (buffered at both
  ends, each with a parked minecart) and a loading platform.
- **Boats** moored along the quay, and a sign naming the place.

The district is reserved while the city is still being planned, so no ordinary
lots are laid on it, the hills leave it level with the quay, and it always fits
inside the block beside the canal — it never swallows a street or a railway.
The basin follows the same rule as all Polis water: solid stone or water on all
four sides and underneath. The **Harbour district** checkbox turns it off.

## Java Edition (in progress)

The generator makes blocks with states; only the output is edition-specific.
`engine/java-blocks.js` translates those states to Java (Bedrock's
`facing_direction=2` to `facing=north`, `weirdo_direction` and
`upside_down_bit` to a stair's `facing` and `half`, rail directions to shapes,
bed colours into block names), and `engine/export-java.js` writes Java's own
format: big-endian gzipped NBT holding a palette and a list of positioned
blocks, cut into 48-block pieces, wrapped in a **datapack** whose function
places them with `/place template`.

Every block state a city produces is checked against Java's own block
definitions by `tools/check-java-blocks.mjs` — 435 states across 176 blocks,
all valid — and the validator reads a finished structure back the way the game
would.

Villagers, golems, cats, pandas, farm animals, paintings, minecarts and boats
travel in the structures too, written from scratch rather than copied from
saved templates — Java's entity NBT is small enough to write directly.

One deliberate difference from Bedrock: **Java villagers arrive unemployed**.
Bedrock's arrive pre-levelled with trades captured from real villagers, but
writing believable trades for every profession and level in Java would mean
inventing Mojang's whole trade table, and a villager given a profession with
no trades has nothing to offer at all. On Java they take up the lecterns,
looms, barrels and smokers the city already provides, and the game gives them
proper trades.

**Exporting one.** The export panel has an **Edition** choice: Bedrock gives
the usual `.mcpack`, Java gives a datapack zip (`<city>_java_v<version>.zip`)
holding the structures, a build function and a readme. Drop it in the world's
`datapacks` folder, `/reload`, stand where you want the north-west corner and
run `/function <city>:build`.

Java worlds can now be read for terrain fitting too, so both editions have it.

## The canal's grandest crossing

One crossing of the canal — the widest — is built as a piece of architecture
rather than a slab of road: a stone tower at each corner with a lamp on top,
an arch of stone springing between them over the water, and a balustrade along
both parapets. The deck is left alone, so the street and any railway across it
still run.

## Bridges between districts

On real ground a city rarely comes out as one lump: a river, a bluff or a
patch of unexplored land splits it. The outline used to keep only the piece
holding downtown and throw the rest away — on one test site that left a single
building out of fifty. Now the outlying districts are kept and joined by a
**viaduct**: a straight deck on piers every four blocks, as wide as the street
it carries, with parapets, a lamp every eight blocks, steps down where it
meets a lower street, and track along it where the city has a railway. The
perimeter wall does not follow a bridge — both ends are inside walled ground
already. The **Bridges between districts** checkbox turns them off.

## Landmarks

Each city builds up to eight one-off landmarks — the civic ones on the lots
nearest its downtown focal point, the school halfway out, the lighthouse by the
water and the castle on the highest hill (the **Landmarks** checkbox turns them off):

- **Town hall** — smooth quartz, set back behind an andesite forecourt with
  a two-storey colonnade and entablature, a copper dome with a gold finial,
  and the **village bell** standing in the forecourt beside the path in.
- **Clock tower** — a slender stone-brick tower with a clock face on all four
  sides (minute hand at 12, hour hand at 3, gold centre — each face mirrored
  so it reads correctly from outside), an open belfry with a hanging bell, and
  a copper spire.
- **Library** — brick with dark-oak floors, bookshelves and lecterns on every
  floor, lantern posts flanking the entrance.
- **Church** — a tall nave with stained-glass windows, pews facing the
  altar, and a bell tower rising over the entrance to a spire with a gold top.
- **School** — two storeys set back behind a front yard, built like a chapel:
  one open hall to a floor with a chalkboard down one side wall, a lectern in
  front of it and desks in rows facing it, the staircase against the wall
  opposite the door. A covered porch over the
  entrance, a bell cupola, a flagpole, and — on a lot deep enough — a fenced sports
  field behind with a gate, white lines and two goals. Inside, classrooms with
  a lectern and rows of desks and chairs facing it, aisles left clear. It
  prefers a big lot that runs deep from its street.
- **Lighthouse** — a slender tower banded red and white with a glass lantern
  room and a light at the top, beside the canal (or out at the edge).
- **Mansion** — an estate on the biggest lot out of the centre: a three-storey
  house with a columned portico, two flanking wings (where the frontage
  allows), a hedge round the grounds with lit gate piers, a driveway to the
  door, and — on a deep lot — a formal garden behind with crossing paths, a
  fountain, flower beds and benches.
- **Town square** — paved, with a fountain in the middle (a raised basin with
  a lantern on its plinth), benches facing it on all four sides, market stalls
  with cloth roofs along the back, lamps at the corners and flower beds.
- **Stadium** — a grass pitch in a bowl of three terraced rows of seating,
  with goals at each end, a halfway line, floodlights at the corners and a
  tunnel through the terracing for the players.
- **Cemetery** — walled ground with a lych gate, a path up the middle and rows
  of headstones, some with flowers.
- **Allotments** — fenced plots of wheat, carrots, potatoes and beetroot, each
  watered by a channel down its middle, with a shed and a compost heap.
- **Bandstand** — a small raised stage on posts with a roof and a lantern,
  reached by a step from the street.
- **Castle** — a stone keep on the highest hill: crenellated roof and four
  corner turrets.
- **Market square** — a chequered square of striped wool-canopied stalls
  selling melons, pumpkins, hay and more, round a covered well in big squares
  or a lantern post in small ones.

**Name signs.** Every landmark has a small standing sign with its name —
Town Hall, Clock Tower, Library, Market, Church, School, Lighthouse, Castle —
beside the path to its front door (never on it), facing the street; the
market's stands on its street edge. The sign's block entity is laid out exactly
as Bedrock saves one, field for field, from signs saved in game.

The three buildings are made by the same engine as every other building, so
they keep the same guarantees — stairs to every floor (wide switchbacks in the
town hall, a spiral up the clock tower), doors, windows, head room — and are
checked by the same player flood fill. The copper is waxed, so it stays green.
The minimap outlines each landmark in gold.

## Canal

One long street through the middle of the city becomes a canal (the **Canal**
checkbox turns it off): a stone channel of water two deep, its surface three
blocks below the street, with walkways along both banks and railings where the
street is wide enough. Every street that meets the canal carries straight over
on its own road deck — two blocks of air between the water and the deck — so
streets and railway lines cross at street level with no ramps, and a boat fits
underneath. It follows the rule that keeps all water in Polis in place: every
water block has solid stone or water on all four sides and underneath (the
city's stone base is extended down to hold it, and the channel stops well
inside the wall). A dock has three stairs down from the walkway to a wooden
landing at the water's edge; `populate` puts the boats in the
water along with everything else, while its ticking areas still hold the city
loaded; `/function <city id>/boats_centered` (or `boats`) re-summons them if
any are missing.

## Railways

The **Streets** setting chooses what runs between the blocks:

- **Roads** — asphalt, markings and crosswalks (the default).
- **Railways (no roads)** — every street becomes a green strip with a minecart
  line down the middle on a gravel bed.
- **Roads + tram rails** — asphalt roads with a line down the centre.

Every street gets one straight line. East–west lines run at ground level
straight through every junction; north–south lines never meet them at grade —
they climb four blocks on powered rails, cross on a stone-brick bridge that
leaves two clear blocks for a cart and rider underneath, and come back down.
So there are no junctions anywhere: every line is a simple path with nothing
to derail at.

**The loop.** The ring road's four lines are joined into one closed track
round the whole city, with a curved rail at each corner and powered boosters
two blocks either side of every curve, so a cart can go round and round
without stopping. Every other line ends one block inside the loop, so nothing
ever crosses it.

Every powered rail sits on a redstone block, so it is permanently on and needs
no wiring. Flat track has a powered booster every 16 blocks. Each line ends at
a stone-brick buffer with a powered rail in front of it, so a cart that stops
there is pushed straight back out: **every line is a shuttle that runs back and
forth on its own.** `populate` puts one minecart on each line. Right-click a
cart to get in (catch it as it passes, or at a buffer as it turns round);
sneak to get out.

Lamps and pedestrians keep the sidewalks. Rails are walkable, so you can cross
the tracks anywhere on foot.

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

which brings in the villagers, iron golems and minecarts. Villagers and
golems travel inside entity-only structures (`m_x…_z…`), so they arrive
wherever blocks can load — exactly like the city itself. `/summon` could not
do this: it only works in chunks the game is actively simulating (simulation
distance, 4 chunks by default), so summoning a whole population from one spot
placed only the few nearest the player. Minecarts are still summoned; `build`
adds temporary ticking areas over the city so those summons reach every line,
and `populate` removes them again. `build` is safe to rerun if some tiles were
missed; `populate` is meant to run once.

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

**Block states.** Every block and state Polis writes is checked against
Bedrock's own 1.21.60 state list (`tools/bedrock-states.json`); orientations
(doors, beds, stairs, rails) come from Bedrock's Java-to-Bedrock mapping tables.
To add a block, add it to `materials.js` and run the validator — it will say
exactly which states Bedrock expects.

**Checking a pack in game.** Settings → Creator → Content Log shows exactly
which line of which function Bedrock refused to load.

**"Function … not found".** Bedrock silently drops a whole function file if
any single command in it fails to parse, and uses the higher pack when two
active packs share a function name. Check the content log (Settings → Creator →
Content Log) for load errors, and remove older Polis packs from the world.

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

**0.45.1** — The factory fits small-block cities.

A ticked factory was not built: even the compact one needed a lot fifteen by
twenty-two, and a city of small blocks (blocks from ten) seldom has one; at 256
across it never did. Now a third, small factory, thirteen by eighteen (factory.js):
the same machines, the master switch's bench shorter, the assembly line shorter
with its four workstations side by side. It fits nearly every city: at blocks from
ten, 256 to 384 across now always, 192 across nearly always.

2zze checks the factory built in cities of small blocks (256 across, blocks from
ten, three seeds), and the redstone simulator passes on all three sizes (11
checks).

**0.45.0** — A factory, with working redstone.

A new option, "A factory with working redstone" (off by default), builds a
factory (factory.js): stone brick, a saw-tooth roof of skylights, two chimneys
smoking; nineteen by twenty-five where the lot allows, fifteen by twenty-two where
it is smaller. Each machine built the plainest way that works:

- The control room: four levers on the wall, each on a wall block with a redstone
  lamp set in above it (the lever powers its block, the lamp beside it lights);
  the master switch, a lever on a console beside a bench of lamps with redstone
  dust along their tops (the whole bench lights).
- The doors: a double iron door, a pressure plate before it on each side.
- The assembly line: a raised channel, a water source at its head and flowing
  water down it over a hopper that feeds a chest; a smoker, a blast furnace, a
  smithing table and a stonecutter along it (villagers' jobs).
- The freight siding: a short track with an empty minecart on it (the player's
  saved minecart, in the factory's own structure), a detector rail on a redstone
  lamp with another beside it, a loading chest. On a fitted city the transit's own
  pass cleared every rail and laid the railway again; the siding is now laid again
  after it.

The lighting keeps off every lever, redstone block, plate, iron door, hopper and
rail.

New section 2zze (10 checks), with a small redstone simulator (one source on at a
time: a lever powers its block, a plate or detector the block under it; dust takes
fifteen and loses one a block; a lamp or door works beside a source or a strongly
powered block, or under powered dust): each panel lever lights its own lamp only;
the master switch the whole bench; every plate opens a door; a cart on the detector
lights both lamps; the line's water a level deeper each block, held in, over the
hopper facing the chest; the chimneys; every part reached through the doors; the
minecart in its structure; every block one of Bedrock's own states. On wide,
narrow and fitted lots.

**0.44.0** — The jail, zoo, aquarium and museum arrive in structures, as the enderman does.

What came in structures always appeared (the villagers, golems, farm animals, and
the enderman since it rode in on the player's own saved minecart); what was
summoned by command kept failing. Now every inmate, zoo animal, aquarium fish and
armour stand comes in structures too, in tiles of their own landmark's (m_jail_,
m_zoo_, m_museum_): a structure waits for its part of the world to load, and runs
no command that can fail.

Polis has saved copies of only a few mobs, so each is made (mob-nbt.js) from the
cow's (every field the game writes for a mob), changed to be the mob wanted: its
identifier; its definitions, its starting groups followed from its own spawn event
in the game's definition, the likeliest branch at every choice (an adult), and
kept; its health, movement, follow range and knockback from its components; its
variant, marking and colours where its groups set them (a tropical fish as its
named variety, the random ones left out); persistent, named, a fresh id; an
armour stand's four pieces. The shulker rides a minecart (the player's saved one,
linked to it); the enderman is the player's own saved pair.

populate loads them with the rest; jail, zoo and museum load only their own tiles.

2zz, 2zza and 2zzb read the structures the pack loads: every inmate, animal, fish
and armour stand there as the game saves it, kept and named, in its place, a
tropical fish carrying its variety's groups, every stand dressed head to feet,
the shulker in its minecart, populate and each landmark's own function loading
its tiles.

**0.43.2** — populate leaves the ticking areas alone.

0.43.1 made populate take the city's ticking areas off at its start and make them
again, in case they were missing. Taking them off unloads the far side at that
moment, and making them again only starts it loading: every summon and every rail
in populate ran into unloaded ground, and only the villagers and golems came (a
structure waits for its chunks; a summon does not). Now populate holds no
tickingarea command at all: build makes them, they hold the city while populate
runs and stay on after (for any later run, or jail, zoo or museum), and release
takes them off. Where they are missing, areas makes them again, run on its own
with a moment let pass before anything is summoned.

2zza checks populate holding no tickingarea command, and release taking off every
one build made (16 checks); 6d checks build adding them, populate leaving them
alone and release removing the same ones.

**0.43.1** — populate keeps the city loaded.

The jail and the museum's armour room stayed empty while the zoo filled. Checked
against the player's own pack: every inmate and armour stand lands in the clear;
the zoo is within twenty blocks of the build spot, the museum eighty and the jail
two hundred, and a summon reaches only loaded chunks. A city's ticking areas keep
it loaded, a world holds ten, and another city's (its populate had never loaded)
were still there. And populate took its own ticking areas off at its end, so any
later run, or jail, zoo or museum, found the far side unloaded and summoned
nothing there.

Now populate makes its ticking areas again at its start and leaves them on; new
functions release / release_centered take them off when everything is in.
populate's message and the placement guide say what to do when the jail, zoo,
aquarium or the museum's armour room stays empty (/tickingarea remove_all, areas,
a moment, then jail, zoo or museum), and name release.

2zza checks populate making its ticking areas before any summon and leaving them
on, and release taking every one off (16 checks); 2zp, 2zy and 2zi follow
populate's ticking areas as they now are.

**0.43.0** — A police station, a theatre and a hotel.

Three new options (off by default), three new landmarks (civic.js), each taking a
lot early when asked for:

- The police station, thirteen by fifteen, white with a band of light blue: a
  blue lamp over the doorway; a front desk; the office, four desks with chairs and
  lockers of barrels; a holding cell behind iron bars, a bed in it. Where the city
  has a jail, it takes the lot nearest the jail.
- The theatre, seventeen by twenty, dark oak, red trim over the door: a lobby with
  a ticket booth; the stage against the lobby wall, raised two, red wool curtains
  across its back and at its sides; the orchestra pit before it, note blocks along
  it; six rows of seats rising a block a row to a gallery at the back, the aisles
  climbing with them (every seat walked to); chandeliers.
- The hotel, thirteen by nineteen, brick, five storeys: the lobby, a reception
  desk, seats; a flight of stairs a floor up the front; on each floor above a
  corridor and six rooms off it, each a bed, a window and a lantern: twenty-four
  rooms.

A sign at every room; the summary says when no lot could take one.

New section 2zzd (9 checks): built on flat cities (the police station on a fitted
one too); the police station's desks, lockers, cell and bed, its rooms reached, and
within forty blocks of the jail; every theatre seat, the pit's note blocks, the
curtains whole, every row's aisle reached; the hotel's twenty-four rooms, every
bed whole, every room's door reached up the stairs; every block one of Bedrock's
own states.

**0.42.2** — The jail's enderman placed already riding its minecart.

The enderman was often gone from its cell. It was summoned, a minecart summoned,
and the enderman set riding by command, in the same moment; when that missed, it
was never riding, and an enderman not riding teleports (the game's own: its
not-riding group carries the teleport, its riding group does not). Now it goes in
the structures with the villagers, as the pair a player saved from their own trap
(tools/extract-rider.js, engine/rider-templates.js): the minecart, its link naming
the enderman, and the enderman already riding, persistent, its riding group on.
Each copy gets ids of its own and stands at the heights over the rail it was saved
at (entities.js: makeRiderPair). A structure also waits for its chunks, where a
summon does not. No enderman is summoned any more; the shulker still is.

2zz reads the structure the pack loads: the enderman on its cell's rail, the
minecart's link naming that enderman, the enderman riding, kept and named, and no
enderman summoned (13 checks).

**0.42.1** — populate loads again with a hospital and a museum.

With both built, the game loaded none of populate, populate_centered, museum or
museum_centered: three armour stands summoned at NaN. The hospital kept its
brewing stands in a list called stands, and the city gathered every landmark's
stands as armour stands to summon; the brewing stands had no x, y or z. Now the
hospital's are its brewing (services.js), and the city takes only armour stands
(city.js). And a safety net: the export leaves out any command with NaN or
undefined in it, so one bad place can no longer stop a whole function loading,
and keeps what it left out on the file.

2zz checks a city with every landmark on at once (jail, zoo, aquarium, museum,
hospital, fire station, metro, railway, hostiles): no NaN, undefined or Infinity
in any command, and nothing left out by the net (13 checks). (The checks had built
the hospital and the museum only in separate cities.)

**0.42.0** — A hospital and a fire station.

Two new options (off by default), two new landmarks (services.js), each taking a
lot early when asked for:

- The hospital, fifteen by twenty-three, white concrete, one storey five high: a
  red cross over the doorway, a helipad (a yellow H in a ring) on the roof. The
  entrance hall with a reception desk and oak benches facing it; the pharmacy,
  three brewing stands (a cleric's job) and cauldrons of water; the emergency
  room, two beds behind a glass curtain; the ward, eight beds down both walls,
  glass curtains between them.
- The fire station, brick, two storeys, fifteen across where the lot allows and
  twelve where it is narrower: two engine bays open on the street, a fire engine
  in each (built of blocks: black wheels, a red body, a glass windscreen, a light
  on the cab, a ladder rack), a bell between them; upstairs a bunk room of six
  beds, a pole down through the floor to the bays and a ladder beside it; at the
  back the lookout tower, a ladder up inside it to a railed platform.

A sign at every room; the summary says when no lot could take either. And the
lighting no longer sets a light in place of a mark or a display (it left a hole in
the helipad's H): not yellow or red concrete, coal, bone, or the museum's ores and
gems.

New section 2zzc (10 checks): built on flat cities and a fitted one (the fire
station at both widths); every bed whole; the brewing stands, the red cross, the
helipad whole; both engines, the bell, the bunks; the pole unbroken, every ladder
rung, the tower's top to step off onto; every room and bay reached from the
street; every block one of Bedrock's own states.

**0.41.1** — A whole dinosaur in the fossil hall.

The skeleton was one block thick and ran straight away from the doorway: from
the way in, only its skull on a column showed, and it read as a pillar. Now it is
three across, 43 bones (museum.js): a skull with its mouth open, the neck and
spine, a ribcage on both sides, little arms, a pelvis, two legs with their toes
forward, and a tail coming down. Each bone lies the way its run goes: upright in
a leg, lengthways along the spine and tail, crossways in the skull. It stands on
a raised plinth a block high, two blocks back from the doorway, with a way past
it on both sides.

2zzb checks the skeleton three across, at least forty bones, and the doorway
before it clear (11 checks).

**0.41.0** — A museum.

A new option, "A museum: fossils, minerals, armour, relics and art" (off by
default), builds a museum landmark (museum.js): smooth quartz, a portico of
quartz pillars before a doorway three wide, one storey six high inside. Nineteen
across and twenty-four deep where the lot allows, fifteen across where it is
narrower (the same rooms, the galleries narrower); it takes a lot early when asked
for, preferring one for the wider.

- The entrance hall: a reception desk with a lectern (a librarian's job), and the
  relic wall, twelve item frames down the side walls (a trident, a totem of
  undying, a heart of the sea, a nether star, an elytra, a mace, a spyglass, a
  nautilus shell, a recovery compass, an echo shard, a goat horn, a music disc).
- The fossil hall: a dinosaur's skeleton of 26 bone blocks (skull, neck, spine,
  ribs, arms, legs, tail) on a polished andesite plinth, and along its outer wall
  the gallery: real paintings, the motifs and sizes the buildings hang, on solid
  wall.
- The minerals gallery: twenty cases, each a quartz pedestal, the block and glass
  over it: every ore, ancient debris, the raw metals, amethyst, diamond and
  emerald blocks, copper in all four stages of weathering.
- The armour room: six armour stands, leather, chainmail, iron, gold, diamond and
  netherite, summoned in populate and dressed head to feet with replaceitem
  (standard item names only), with museum / museum_centered to dress them again.

A sign at every room; on fitted cities the paintings and stands ride up with the
ground; the summary says when no lot could take it.

New section 2zzb (10 checks): built on a wide lot, a narrow one and a player's
fitted city; the skeleton, every case and frame; every painting on clear wall
with wall behind; every stand on a floor; every room reached from the street;
every mineral, relic and suit in it; populate dressing every stand with standard
items; the museum's own functions; every block one of Bedrock's own states.

**0.40.9** — Findable: a description for search engines and link previews.

No change to the cities. The page now says what it is to search engines and to
anything that previews a link (a description, keywords, Open Graph and Twitter
tags, and a canonical address at https://snicker02.github.io/Polis/), and the
repository carries robots.txt and sitemap.xml for the GitHub Pages site. The
README opens with a plain description and the link to use it in a browser.

**0.40.8** — The jail, zoo and aquarium kept: their mobs no longer despawn.

The zoo's farm stayed full, the other pens and the jail and aquarium emptied.
Checked against the player's own pack: every summon lands in the clear, and runs.
The farm's are the animals the game never despawns; the rest can, and a hostile
mob vanishes at once with no player within 128 blocks. A name given by /summon
did not keep them, and the ticking areas, keeping those chunks running with the
player away, are where the despawning happens.

Now they are kept as the park fish are: the pack carries the game's own definition
of each of the 60 mobs the jail, zoo and aquarium summon (mob-entities.js, from
Mojang's bedrock-samples), with one thing added, polis:kept (persistent; a despawn
rule, where the mob has one, kept off a persistent one) and polis:keep, which runs
the game's own spawn event (a cat's coat, a panda's gene) and then adds it. Every
inmate, animal and fish is summoned with polis:keep, and named. And the fish's
definitions now come whenever there is an aquarium, not only pond fish: its fish
are summoned with keep events those define.

2zza checks every jail, zoo and aquarium summon kept, the pack carrying each
mob's own definition with only the keep added, and the pack itself carrying the
mobs' and fish's definitions for a jail, zoo or aquarium (15 checks).

**0.40.7** — Bigger zoo pens; no animal set against a fence.

A turtle ended up between two pens, and a frog got out. Pens were three wide and
animals were set on their edge rows: a turtle (a block and a fifth across) began
inside the fence, and the game pushes an animal out of a block it overlaps, not
always back into its pen.

- The zoo (zoo.js) is as wide as the lot allows, the pens deeper back from the
  path: twenty-three across gives pens eight deep, nineteen six, fifteen four
  (lots run wider than long). A zoo picks its lot by how wide a one it takes, and
  before the aquarium. Every pen its own only where they are six deep or more.
- Every animal is placed by its size: its body clear of every fence by half its
  width and a tenth, the biggest first, on the rows furthest from the fences.
- The pond is roofed in glass (frogs jump), like the goats and the aviary.

2zza checks every animal's body inside its pen with room, and the pond closed
above (13 checks).

**0.40.6** — Bigger aquarium tanks.

The squid were cramped: the side tanks were two deep, four long, water three
deep. The aquarium (zoo.js) is fifteen by twenty-five where the lot allows: side
tanks four deep, six long, water four deep (four times the water), a block of air
over each; the reef thirteen across, five deep, water four deep; three of each
squid. It prefers a lot that takes it; on a smaller one, the compact aquarium
(eleven by twenty) as before. One floor still.

2zza checks, where the lot allows, the tanks four deep, six long, water four deep
(12 checks).

**0.40.5** — Bigger jail cells, five floors; no inmate against a wall.

Inmates escaped. The cells were three wide, and inmates were set on the cells'
end rows: a wide one (a ravager nearly two blocks across, a slime or magma cube
at its biggest just over two) began inside the wall, and the game pushes an
entity out of a block it overlaps, not always back into the cell; four zombies
crowded one cell. And a shulker teleports when hit, past any bars.

The jail (jail.js) is rebuilt in the same fifteen by twenty-three: five floors a
storey of five apart (four clear inside), two cells a side on each, each cell
four deep, five wide and four high, twenty in all. One group a cell: the zombies
now in two (zombies and husks; drowned and zombie villagers). Every inmate is set
near its cell's middle, each a block clear of the walls. The shulker rides a
minecart on a rail down its cell's middle, as the enderman does: riding, neither
teleports. The halls (creepers, guardians, ghasts) stay at the back of the lower
three floors; above them the back is walled up. A flight of five steps a floor,
sides in turn; the corridor still a slab low its whole length.

2zz checks every inmate's body inside its cell with a tenth to spare on every
side, at its widest (12 checks); the corridor reached on all five floors.

**0.40.4** — The enderman in a minecart; bigger farm and drylands; goats roofed.

- The jail's enderman teleported out, as endermen do. One riding a minecart
  cannot (found in the game and saved as a structure: a rail, a minecart, the
  enderman riding it). Its cell now has a rail down the middle, and populate (and
  jail) summon a minecart on it, then the enderman, then set it riding:
  `ride @e[type=minecraft:enderman,...] start_riding @e[type=minecraft:minecart,...]`.
- The farm and the drylands, the pens with the most in them, are two rows long
  in every zoo: four by seven, not four by three. Twenty-eight deep where the lot
  allows (a zoo prefers a lot that takes it), every pen its own; on a lot only
  twenty-four deep, two pairs that get along share to make the room: the horses
  join the drylands (grazers all) and the polar bear shares with the pandas.
- The goats' pen is roofed in glass, like the aviary: goats jump.

2zz checks the enderman on its cell's rail and the minecart, the enderman and the
ride in order, in populate and in jail (11 checks); 2zza checks the goats' pen
closed above and the farm and drylands four by seven in every zoo, every animal
still in it (11).

**0.40.3** — The jail and the zoo when the city is not all loaded.

Villagers, golems and farm animals arrived and no inmate, zoo animal or fish did.
The jail's, zoo's and aquarium's are summoned, and a summon reaches only loaded
chunks (the others come in structures, which wait for theirs). Checked end to
end on the player's own settings (city 1051122b): every summon lands in the
clear, before the city's ticking areas come off. The likeliest cause: a world
holds ten ticking areas at most, another city's (whose populate had never loaded)
were still there, and most of this city's were never made.

- build takes its own ticking areas off before it makes them (built again, it
  never doubles them).
- New functions: jail / jail_centered and zoo / zoo_centered summon just those,
  to fill them again; areas / areas_centered make the city's ticking areas again
  on their own (populate takes them off at its end). Each with its _from_mark.
- populate, and the placement guide, say what to do when the jail, zoo or
  aquarium stays empty: /tickingarea list, /tickingarea remove_all, then areas,
  a moment, then jail and zoo.

2zza checks those functions, each summoning all of its own, and build clearing
its ticking areas before it makes them (10 checks). 2zp counts ticking areas as
work for a centred function.

**0.40.2** — populate loads again: a zombie villager /summon can create.

The game's own error said it: populate failed to load at the jail's zombie
villager, `summon minecraft:zombie_villager_v2`. Mojang's files mark that entity
not summonable (is_summonable false), and one such summon and Bedrock loads none
of the function. The jail now summons minecraft:zombie_villager, which /summon
does create. (0.40.1's guess, the length of the function, was wrong; its smaller
populate and rails stand anyway.)

Every entity Polis summons is now checked against Mojang's own behaviour files
(github.com/Mojang/bedrock-samples): tools/bedrock-summonable.json holds
is_summonable for each of them, all 64 found summonable. 2zz checks every summon
in every function, on a city with the jail, the zoo, hostiles and a railway,
names one of them; one not in the list fails too, so no new mob slips in
unchecked (10 checks).

**0.40.1** — populate and rails load again on big cities.

On a big city the game loaded neither populate (nor populate_centered) nor rails
(nor rails_centered): only populate_from_mark was there, and the world gave
errors as it opened. Bedrock does not load a function file of more than ten
thousand commands, and since 0.37.2 those set every rail of the city again; a big
city with a metro has more rails than that. Now only the rails the game can have
reshaped are set again (export.js: railLines): those within two of a tile's edge,
where a rail goes in before the one it joins in the next tile, and every curve and
slope; a straight inside a tile goes in with its neighbours and keeps its shape.
About a fifth as many: on a city 320 across with a railway, a metro, a jail and a
zoo, populate is 1,266 commands, not 5,882.

2zy checks exactly those rails set again, and that no function on such a big city
comes near Bedrock's limit (7 checks).

**0.40.0** — A zoo with every land animal, an aquarium with every fish, and signs.

A new option, "A zoo and an aquarium with every animal and fish" (off by
default), builds two landmarks (zoo.js), since big lots are few:

- The zoo, outdoors, fifteen by twenty-four: a plaza at the gate, a path down the
  middle, lanterns on posts, ten pens with their animals' own ground, fences three
  high (goats, frogs and foxes jump; nothing clears three), a sign on each, the
  aviary roofed in glass. 27 kinds, penned so none hunts another: the farm (cow,
  sheep, pig, chicken, mooshroom); horses (horse, donkey, mule); drylands (camel,
  llama, armadillo, sniffer, strider); goats; the polar bear on snow; pandas; cats
  and the fox; wolves alone; the pond (turtle, frog, rabbit); the aviary (parrot,
  bee, allay, bat).
- The aquarium, indoors, eleven by twenty: prismarine, glass-fronted tanks with
  lit floors, water three deep under a block of air. The reef across the back
  holds all 22 named tropical fish, each summoned as itself: the pack's tropical
  fish gets a keep event per variety, the game's own become_X event with the keep
  group added (export.js). And dolphins; cod and salmon; pufferfish; squid and
  glow squid; axolotls alone (they hunt fish).

Every animal and fish is summoned in populate, a kept fish by the pack's event and
everything else by its name. The jail's cells now carry signs naming their
inmates. When a jail or zoo is asked for and no lot is big enough, the summary
says so.

New section 2zza (9 checks): built on flat cities and on a player's own fitted
one; every land animal in it, each on its feet; each pen fenced three solid high
all round; the aviary and every tank closed; every fish in water, all 22
varieties in the reef; a sign at every pen; populate summoning every animal and
fish; the pack's keep event for each variety. 2zc accepts the variety events only
if each is exactly the game's own plus the keep group.

**0.39.0** — A jail: every hostile mob that can be held, behind bars.

A new option, "A jail holding every hostile mob" (off by default), builds a jail
landmark (jail.js): fifteen across, twenty-three deep, three floors. A lobby with
the stairs, a corridor down the middle, cells either side (three wide, four deep,
three high) with iron bars, and a hall at the back of each floor: creepers on the
ground floor, a guardians' tank on the first, ghasts on the top. 32 inmates of 28
kinds, in 17 cells grouped so cellmates will not fight (the zoglin alone).

What holds them: polished blackstone bricks (silverfish cannot burrow into them);
iron bars (they stand a ghast's fireball); the corridor's ceiling a slab low (no
enderman fits under it to teleport in); the creepers behind bars two rows past a
fence (five from any visitor; a creeper lights within three); every room roofed
(nothing burns); every inmate summoned by name in populate (a named mob does not
despawn). Not held, because no cell keeps them: the evoker (vexes pass walls), the
vex, the Wither, the Warden, the Ender Dragon, the elder guardian, and the piglins
and hoglins (they change in the Overworld). The jail gets first pick of the lots
when asked for (it needs a big one), and turns sideways on a lot long beside its
street. On fitted cities its inmates ride up with the ground. The jail is empty on
Peaceful.

New section 2zz (9 checks): built on flat cities and on a player's own fitted one;
every kind in it; no inmate's space reaching the corridor or the street; the
corridor reached from the street on every floor; the slab ceiling all along; no
visitor within four of a creeper; populate summoning every inmate by name.

**0.38.6** — A metro under fitted cities; the page says what a fitted city cannot have.

The metro was never built under a city fitted to the world, and the page said
nothing: its tunnels were laid at fixed depths under one ground height, and on
real ground the streets rise and fall. Now (metro.js) it takes the street's
surface (city.js: from the city's own elevations): every tunnel keeps its depth
below the lowest street in the city, all at one level, so the second cross line
still passes under the first and under high ground they simply lie deeper; and
each station's stairs climb as far as its own street, each street height near
the station tried in turn, the flight taken whose way out and opening stand on
level street at that height. On a flat city, exactly as before.

A fitted city follows the world's own ground, so it has no glass dome, no stilts,
no floating islands and no cliff tiers. Those four options are marked "not on
fitted ground" once a site from the world is chosen, and the summary names any
that were ticked.

2zu checks the metro under a player's own city (from the blocks of their world):
lines and stations, every flight out on its own street's surface, every room
watertight below the street over it, each line's track its whole tunnel in one
piece (24 checks).

**0.38.5** — Boosters across the bridges.

Carts crawled over the bridges: the loop's rails seated on a deck kept their kind
but not the redstone they stood on, and those laid new were plain, so a deck was
a long run of plain rail (the longest, 131) with not one powered rail, and on one
bridge five powered rails with no power, which brake a cart. Now, round each loop
once (bridges.js: bridgeRails), a deck's straights get a powered rail on a
redstone block set into the deck every 9 rails, counted on from the last boost
the cart had on land; a powered rail on a deck straight is given its redstone, one
on a curve made plain. On the players' two cities: every powered rail on a deck
powered, never more than 10 rails apart.

2zx checks the boosters across every bridge of both cities (24 checks).

**0.38.4** — Every bridge on the loop: landing platforms, and the city's outline walked whole.

A city built in the game (1004954, rebuilt here from the player's own world and
saved settings) came out with its bridges off the loop: the loop U-turned along
the shore at each landing and the decks' lanes were dead ends, knotted at the
junctions. Two faults, both fixed:

- The walk that traces the loop round the whole city stopped the first time it
  stepped on its starting cell, which a ragged outline can pass through half way
  round, and dropped what it had walked twice: it came back with one district's
  ring and no bridges, and the city fell back to splicing rings onto decks. Now
  the walk (transit.js: traceOuter) goes on until it is back where it began
  facing the way it set off, keeps every step, and refuses an outline it walks a
  cell of twice (the track would cross itself there).
- A bridge from the old search landed at a corner of the shore, the water close
  beside it, and the band the loop is traced in pinched to a single row there.
  Every bridge now has a landing platform at each end: the deck fills out over any
  water within its half-width and one more of where it lands (bridges.js: apron),
  so it always arrives full width.

Players' own cities are in the checks now: two, rebuilt from their sites (ground
and water read from the blocks of their worlds) and saved settings; each must come
out ringed whole, its loop closed through every district and across every bridge,
each line one piece, and at the bridges no rail crowded and no brick on a landing
(2zx, 22 checks).

**0.38.3** — The divider stops where the deck meets the land.

The brick between a bridge's two tracks (0.38.2) followed the deck's middle onto
the shore, and was laid even over the loop's own rail there: at the junctions,
where the land meets the bridge, it stood in L-shapes and blocks, and the
repairs routed the track round it in knots and crossings. Checked against
junctions built in the game and fixed by hand (e6/f6, f7, e8/f8, e9/f9): the
brick runs only over the water, and where the deck meets the land the two
tracks part, the one carrying on with the ring and the other turning once onto
it (going round clockwise, on at the left lane, off at the right). Now the brick
goes only on the deck's cells over the gap (recorded when the bridge is planned:
gapCells), never on a cell with a rail or anything else on it.

2zx checks no brick where the deck meets the land (17 checks).

**0.38.2** — Two tracks a bridge, a brick between them.

A bridge built in the game (multi41253) came out with its deck a tangle of
rails. Read from the pack: three tracks side by side, the deck's own two and
an ordinary line down the middle (a street carried across the water brought its
line with it), and three rails abreast merge as the game loads them. Now:

- No ordinary line runs on a bridge: the bridge's cells are recorded in the plan
  (plan.bridgeCells) and a line will not go there (transit.js); one comes to its
  end at the bank instead.
- A raised stone brick runs down the middle of every deck, end to end (bridges.js),
  so the deck's two tracks can never touch, and each has one way on and one way
  off at either end. You walk either side of it.

2zx checks the brick end to end on every deck, no rail on a deck's middle, and no
rail on a deck crowded by more than two others (15 checks); 2z walks the deck
either side of the brick.

**0.38.1** — The loop closed in big hilly cities.

Read from a city built in the game (multi41144, 400 across, fitted), by the rail
graph: the loop came out in pieces. Four causes, all fixed:

- A curve where the track changes height (a curve is flat: it cannot climb).
  shapeLine (city.js) now holds every line to the rules a cart needs: a block a
  cell at most, no dip, and no curve below either neighbour, raising rails onto
  gravel until they hold, then shaping each rail from its neighbours. It runs
  last, on every line, from where each rail actually is.
- Where a bridge lands on hilly ground, its approach is levelled, and the loop's
  rails beside the landing went with it; the sweep then took the stranded pieces
  up. Before the sweep, a loop rail that is gone is laid again on the ground
  there, and a short gap in a line's list (four cells or less) is filled in,
  straight or round a corner through cells with no other rail; and again after
  the sweep for the loop, which is the one track that must close.
- A traced ring could skip a cell or two where the edge is ragged: the gaps are
  closed through street when the ring is traced (transit.js).
- Ringed whole, a bridge's deck is no longer bent toward a ring.

On the fitted test sites (160, 192 and 256 across) every loop is closed as a
cart runs it, a district's own ring as well. 2zx checks the 256-across sites
too. Short lines on very rugged ground can still come out in two pieces (each
runs between its buffers).

**0.38.0** — Bridges: narrower, centred, curving; one loop round every island by design.

Bridges are five across: two tracks, one each way, a kerb either side, the tracks
two apart (they were seven to nine). A bridge carries a street on: it leaves on a
street's centre line and lands on one, square into the district, the street going
on inland and the deck's width on land where it lands (it used to take the
shortest gap along any row, and landed off the street or along a coast). Straight
where a street's line reaches a street on the far side; otherwise it turns the way
streets do, straight runs and full-width square corners: an L where the two
streets meet square, a Z where they face each other a little to one side, a U
where both run the same way (out of both, along beyond them, back in). A curve may
run half as long again as a straight span. The old searches only if none of that
can be made (bridges.js: centredCrossing, curvedCrossing, landsSquare).

And the loop no longer has each district's ring spliced onto the bridges after the
fact (that went wrong over and over, in junctions found and fixed by hand in the
game). A bridged city is ringed whole (transit.js): the loop is traced over all of
it, decks included, and on a deck five across the contour two in from its edge is
the two lane rows, so the one loop crosses every bridge out on one side and back on
the other, round every district. Its rails on a deck are seated at deck height and
the line shaped whole (city.js: shapeLine): a ramp a block a cell up to a higher
deck, no dips, every rail from its neighbours. A deck turns full width at a corner
(the deck pinched at a bend, and the loop could not get round). A whole-city ring
that would run beside itself is refused for the old way.

On nine made landscapes (channels, offset islands, two islands), every loop one
closed circuit a cart can ride through every district, six of the bridges curved.
2zx checks bridges five across, landing on streets at both ends, curving where the
streets do not line up, and the loop closed over straight and curved bridges alike
(12 checks); 2z accepts a city ringed whole for its lane joins, and a bent end
joined otherwise if the city's loop rides.

**0.37.4** — Track a cart can take: no steps, no dips.

Checked against more junctions built in the game and fixed by hand (e4/f4,
e5/f5): track only changes height up a slope (the lower rail rising toward the
higher), and the checks counted a flat rail beside one a block higher as joined.
A new shared rail graph (engine/railgraph.js: railLinks, railsOf, trackFrom)
follows the rails as a cart can, and found two faults the old check passed:

- On hills, a street dipping a block for one cell made a dip in the track (down
  a block and up again), which a cart cannot take: a slope rises one way only.
  After the track is raised to the streets (city.js: shiftTransit), any rail
  lower than both its neighbours is lifted onto gravel, until there are none,
  and every rail of the line is shaped again from its neighbours and heights.
- A bridge's spur joined a ring a block above or below the deck with a flat
  step. Now the height change is made on the spur's first cell, a slope (rising
  onward to a ring above, rising back toward the deck to one below), and the
  spur runs on at the ring's height to the junction, which stays a flat curve.

2zx follows the rails by the rail graph: the city loop one closed circuit a cart
can ride through every district, and on six fitted test sites every loop
closed (8 checks).

**0.37.3** — One loop round every island: the bridge junctions fixed.

A bridge carries two tracks, one each way, and the ring on each bank is turned
onto them, so ring, bridge and ring are one circuit round every district. The
junctions were built wrong, and the circuit never crossed (followed by the
rails' own shapes, the city loop had two loose ends at the first bridge).
Checked against junctions built in the game and fixed by hand (e1/f1, e2/f2,
f3), four faults, all in bridges.js: bridgeRails:

- The two junctions on a bank both turned the same way along the ring, so the
  stretch between them dead-ended. Each now turns to its ring neighbour on the
  longer stretch round the ring (measured round the ring: by direction alone a
  partner a little to one side fooled it).
- The lane's last cell was left pointing past its junction (a lane ending beside
  its junction, not facing it). Every join is made mutual: the cell before a
  junction is turned to lead from its own neighbour into it.
- On an angled deck a lane could run on over the ring at the bank and cut it.
  A lane that crosses the ring at right angles stops short of it and joins it
  there; if that leaves it no way onto the ring, it is laid whole again.
- The stretch of ring between a bank's two junctions, left out of the circuit,
  is taken up, as it was by hand (a stub a cart could stray onto).

2zx now follows the rails by their shapes: the city loop one closed circuit,
every rail joined to two, through every district across the bridges (the old
check only asked that one network touch every district, which the broken loop
passed). 7 checks.

**0.37.2** — Rails set again once the city is in; remove a city.

No curved rails in the game. The cities still carry them (the same 40-odd
curves as before); they were lost going in. The game reshapes a rail to the
rails beside it as it goes in, and a city goes in a tile at a time: a curve at
a tile's edge, its neighbour not in yet, turned itself straight and stayed so.
Now populate sets every rail of the city again with its exact shape once the
city is in, before the minecarts (export.js: railLines): straights and climbs
first, the curves last, both their neighbours there when they go in. rails and
rails_centered do it on their own (for a city already built: run from the build
spot). Only where the city has track.

remove and remove_centered take a city away, from the same spot as build or
build_centered: every entity in the city's room that is not a player first
(villagers, animals, minecarts, items, so nothing is buried), then the city:
everything it put above its ground back to air, its ground to grass, everything
under it (cellars, metro, foundations) to dirt, column by column at the city's
own ground height, inside its outline (buildRemoveStructures). With air fill
the city replaced the world's ground, so this leaves a clean site, not the old
one. The guide says how.

New section 2zy (6 checks): every rail set again once each with its exact
shape, the curves last, populate setting them after the mobs and before the
minecarts and before the city can unload, rails / rails_centered; a city built
and then removed leaving every cell inside its outline air above its ground,
grass on it, dirt under it; remove clearing the entities first. 6e knows the
new commands; 6b and 2zp count them where they count the city's own.

**0.37.1** — Every district joined to the rest.

A city fitted to real ground can fall into districts (land split by water, or
by ground too high or low to build on), and bridges join them. Each was bridged
only to downtown's district, by a crossing of at most 96: a district further
than that, reachable only through another, got no bridge, so no road or rail to
the rest (it kept its own streets and track, cut off). And the reach check walks
from every district's own streets, so nothing noticed. Now the districts are
joined in a chain (bridges.js: planBridges), the nearest first, each to whatever
is joined already: downtown's district, the districts bridged so far and their
bridges. A district behind another is reached through it. Where a bridge's
straight run meets higher ground, the ground is cut through at the deck (its
cells are city street, cleared by air fill), as before. A single bridge comes
out as it did.

New section 2zx (5 checks), on a made landscape (three masses west to east, two
channels of water, downtown in the west, the east more than a span from it) and
on the test terrain's split site: the far district bridged through the middle,
every district reached on foot from downtown's streets across the bridges, one
rail network touching every district, track across every bridge, every building
walking through.

**0.37.0** — Lots that step on rugged ground.

A city fitted to real ground held every pair of neighbouring cells within a
block: each lot flat, and every lot within a block of every lot and street round
it. On steep ground that chained whole blocks of lots to one compromise level.
(Stairs along a steep street would not have helped: a flight climbs a block a
block, the same as a street already may.) Now, with "Step lots on rugged ground"
(on by default, under the world file), a lot is held within a block only of the
street it faces, all along its frontage, so its door stays reachable; against
anything else (the lots behind and beside it, a side street) it stands at its own
height, a retaining wall between (terrain.js: tied). Streets keep the one-block
rule among themselves. Where a lot or a pavement stands two or more over a
neighbour it is not held to, a railing goes along the edge (city.js: railSteps).

On the rugged sites of the test terrain, cells within a block of the real ground
rise from 41% to 45% and from 37% to 43%; on the gentler ones by three to eight
points. A lot is now about 3.2 blocks off its ground on average where a flat lot
at its own ground's median could do no better than 2.4, so most of what lots can
win is won. What is left: half a site's ground lies under its base level (the
median), which the fitter can only raise to it; a lower base helped the rugged
sites and hurt the gentle one and doubled the fill, so it is not the default. And
a few street steps of more than a block on very rugged ground, as before (a
street pulled both ways by its neighbours): no more than the old fit leaves.

New section 2zw (9 checks), on the rugged test sites: nearer the ground than the
old fit, every lot within a block of its frontage street, no more street steps
than before, the lots really stepping, every step of two or more a solid wall
with a railing where one can stand, every building and door reached, nothing
dark, and the old fit when switched off. 2r's "no step over a block" counts the
cells held together; a wall between lots is meant.

**0.36.0** — Save and load settings.

Under Generate, three buttons. Save settings downloads every setting as a small
file (named for the style, the seed and the version: polis-settings-medieval-
12345-v0.36.0.json); Load settings puts them all back, the city built once
after; Reset to defaults forgets the remembered settings. The page also
remembers the last settings in the browser and starts from them.

Every control in the panel is saved by its id (a checkbox by whether it is
ticked, anything else by its value), the styles ticked for mixing by their
values, and the downtown's place on the map; nothing is listed by hand, so a
control added later is saved too (engine/settings.js). The world file is not
(a page cannot set a file input). The building style goes back before the theme,
since it refills the theme list. Settings saved by an older Polis load, with a
note that the same settings may build a slightly different city in another
version, and any setting this version no longer has is named, not fatal; a
control the file does not name keeps what it has. The same settings and the same
Polis build the same city.

New section 2zv (10 checks), run against the page's own controls read from
index.html: every control saved and put back exactly, the styles to mix and the
downtown's place too, the style before the theme, older settings loading with a
note, unknown names told, the world file never saved, anything that is not a
settings file refused, the buttons on the page, the city waiting while settings
go in.

**0.35.3** — Plugs first: no water in the metro while the city goes in.

Water and broken rails were still in the metro. The pack itself was watertight
(rebuilt from a pack made in the game: its canal and ponds touch no room), so
the water came in while the city was going in. A city goes in a tile at a time;
a tunnel crosses many, and while one tile is in and the next is not, the tunnel
stands open at the edge between them onto the world's own ground. Where that
ground holds water, the water came in, and flowing water takes rails off (the
dropped rails in the tunnels). Loading a metro city tile by tile, up to 112 room
cells stood open onto the ground at once.

Now, before any of the city, plugs go in: stone brick through every cell of every
room dug under the city (cellars, the crypt, the metro) and the cells round them
under the street (export.js: buildPlugStructures; the Java pieces likewise, placed
first). build and build_centered load them first; each tile of the city then puts
its own share back to air and walls (sealRooms made every cell round a room a
block, so none of the plug is left). Loaded tile by tile with the plugs first, no
room is open onto the ground at any step. The guide says so.

2zu checks the plugs: loaded first by build and build_centered and placed first on
Java, no room ever open while the city goes in, every room air again once it is
in (20 checks). 2t and 6b leave the plugs out of the counts that are about the
city's own pieces, and 6b's build simulation loads them first.

**0.35.2** — Watertight underground.

Water came into the metro in the game. Under the city the ground round a dug
room is the world's own, and since 1.18 that ground is full of water: a room
keeps it out only where the city put a block. The tunnels, halls, cellars and
crypt were walled all round, but a stair shaft's walls went three over each step
and no higher, and nothing roofed it under the street: about 110 open faces in a
metro city, through which the world's water came down the stairs. Now after all
the digging (cellars, crypt, metro) every empty cell next to a dug room, below
street level and not in a room itself, becomes stone brick (underground.js:
sealRooms). No opening is left from any room into the ground round it, and the
stairs, the walks and the lighting are as they were.

2zt and 2zu each check that their rooms are watertight (14 and 16 checks).

**0.35.1** — Lanterns underground, powered track, and a loop round the city.

Lanterns: the torches on cellar, crypt and tunnel walls came out in the game
standing in the open, not on the walls. They are gone: cellars and crypts have
lanterns hung from the ceiling, so that every spot of the floor is within three
of one, all over head height; tunnels have lanterns hung from the roof over the
walkways, every six, either side in turn. A crypt was as deep as the church's
storey plus one, and a nave's storey is tall: crypts came out twelve high, lit
from far above. They are five high now.

Track: in the game the plain rails between the powered ones broke while the
powered ones stayed. The track is powered rails all along now, still on a
redstone block one in eight (so every one is powered), with plain rails only for
the loop's curves. (The track as generated was sound: every rail on a solid
block, straight, with room over it.)

The loop: a third line, a closed rectangle nineteen down, under the cellars, the
crypt and both cross lines, so it need not follow the streets: it is the city's
footprint drawn in until the loop and its halls lie inside the city all round,
whatever the outline. Its corners are curved, so a cart can go round the city
for ever. Its stations stand where a street crosses over it, clear of the
corners and 32 apart, and only where their stairs reach the street (each tried
first, dry). metro.js is rewritten around shared pieces (a tunnel, a hall, its
stairs, track, lanterns), the cross lines as they were. A later line, hall or
stair keeps clear of an earlier one's air as well as of cellars, and a stair
shaft's walls never go into another room's air (a loop's stair had walled off a
cross line); over a station hall's footprint only the hall's own height is
exempt from the check (a switchback climbs back over it far above its roof, and
one had gone through a cross line).

2zu checks powered track and the redstone, the loop closed all round with track,
room over it, curved corners and under both cross lines, lanterns in every
tunnel (15 checks). 2zt checks lanterns over head height (13). 2t counts the
air the Java pieces list for dug rooms; 6b allows air with air fill off only
inside a dug room.

**0.35.0** — A metro under the main streets.

A new option, "Metro under the main streets" (engine/metro.js; off by
default). A line runs under the longest main street each way, along its middle
(at least 64 long, the street's middle street all along, so never under a
canal): a tunnel three wide and three high, nine under the street, stone brick
walls, roof and floor, track down the middle with a powered rail every eight on
a hidden redstone block, a stop wall at each end. The second line runs five
deeper and passes under the first, since track cannot cross on the level.
Stations stand at both ends and about every 48 between: a hall nine wide, nine
long and four high, lanterns hung down both sides, a minecart waiting on the
track. The hall's end walls stop at the tunnel, which runs on through them.

From each station stairs climb to the pavement, a step a block: a straight
flight first, on a row clear of the track, and failing that a switchback (half
the way up, a landing, back the other way on the next row over), which comes
out by its own station. The opening is railed round (never on the flight, whose
top step is the way out), street furniture over it gives way, and it keeps a
block from any door. Torches light the tunnel walls (the lighting pass would
put floor lights under the track, where the redstone is). Nothing is dug where
something is built already (a cellar, the crypt): the metro is dug after the
cellars, into soft fill only. Every tunnel, hall and stair is listed on the
world as air for the exports; the rooms are now looked up column by column (an
export asks of every cell, and a metro adds dozens), and the Java export lists
each air cell once where rooms overlap. Not on stilts, in the sky, up a cliff
or on fitted terrain, for now.

New section 2zu (13 checks): a line in every city with two stations or more,
track all along with room over it, powered rails on redstone, stop walls, a
cart at every station, torches, stairs from most stations and every line, every
flight walked up a step at a time onto the street, the air on both exports,
none when switched off or on stilts, floating or up a cliff, every building
walking through and nothing dark.

**0.34.1** — Torches in the cellars and the crypt.

The lighting pass only makes sure nothing can spawn, which under a building is
light 1: a cellar lit to that and no more looked dark, and some were. Every
cellar and crypt now has torches on its walls at head height, about every four
blocks round the room, pointing in, where nothing stands in front of them, and
one on the wall nearest the foot of the stairs (never on the flight or its
landing). Cellars come out at light 10 to 11 on average across the floor;
crypts about 10, a little dimmer behind their columns. Four torch blocks are
added (TORCH_E, TORCH_W, TORCH_N, TORCH_S: Bedrock's torch with its facing),
and the Java export turns a torch facing a compass direction into Java's
wall_torch facing the same way (a standing torch stays a torch).

2zt checks that every room has torches and its floor is lit to 8 on average,
and the Java wall torch (13 checks).

**0.34.0** — Cellars under the houses, a crypt under the cathedral.

A new option, "Cellars and crypt", on by default (engine/underground.js). A
room is dug under a building's whole footprint: stone brick walls on the
footprint's edge, a stone floor, the ground floor's slab for a ceiling. A
cellar is three high, with barrels and the odd chest along its walls; the
crypt under the cathedral is a storey deep, with stone columns on a grid of
three and chiseled stone tombs between them. A straight flight of stone brick
stairs goes down from the ground floor, a step a block, with a railing round
the opening where the floor above was taken out for head room. The flight's
run is chosen on the bare ground floor before the building is furnished
(reserveUnder) and kept clear of furniture; the room is dug after the lift, so
a terraced building's cellar is under its floor as it ends up, and only into
the soft fill the city stands on. A building that would no longer walk through,
or whose rooms could no longer be reached, with its stairs cut has its cellar
undone. About a third of houses get one (the rest have no straight run of free
floor long enough), and every cathedral its crypt. None on stilts or in the
sky. In the game the ground under a city is the world's own, so every room is
listed on the world and both exports write air through it (export.js: cityAir,
which the dome's air now shares).

Lighting: a lantern hung from the ceiling looked for its ceiling with -1 for
"none in reach" and -2 for "one that will not hold it"; a spot on a crypt's
floor is below both, so a lantern could be hung under nothing. They are null
and NaN now.

New section 2zt (10 checks): cellars and crypts, walled and floored, every
flight walked down a step at a time with head room onto the floor, every room's
empty cells written as air on Bedrock and listed on Java, none with the option
off, on stilts or floating, every building walking through and nothing dark.
2i leaves dug rooms out of "terraces are solid underneath"; 2zq compares a
stilt city with one on solid ground with no cellars on either side.

**0.33.1** — A tidier, quicker validator (nothing new in the cities).

The times the validator balances its splits by were kept in .validate/, which
is cleared before a release is packaged, and were only written by a run that
was not split, which the suite has outgrown: so they were stale or missing,
and the checks had to be run in batches made by hand. Now every run but a
--part one records its sections' times, in tools/checks/times.json, kept with
the checks. --plan [seconds] packs the suite into batches that each fit the
budget (240 by default) from those times and saves the plan; --batch k runs
batch k of it, and the plan does not move until the next --plan. The whole
suite is three batches: --plan, --batch 1, 2 and 3, combine. combine.js leaves
the plan out of the shards and the times out of its staleness test (they are
measurements, not code), and a time like 239.6 s prints as 4m00s.

The slowest checks built dozens of full cities to ask about the plan or the
outdoors: the wall's gates at every size and street width (2e), the farm pens
in every style (2j), the centre mark in big cities (2zp). They build them light
now (no furniture, lighting, fish or hostile mobs; LIGHT in harness.js): 2e
from 58 s to 23, 2j from 70 to 37, 2zp from 25 to 9. In the generator,
lighting looks up whether a spot is indoors in a grid instead of asking every
building, and banisters check a building once instead of once a floor (falling
back to floor by floor only when the rails would cost a floor or a room);
cities come out block for block as they did in 0.33.0. The whole suite: 9m54s
of machine time, from 11m26s.

**0.33.0** — A city in tiers up a cliff.

A new option, "A cliff city in tiers" (invented cities). The city climbs
northward in tiers, each eight blocks above the last (terrain.js:
cliffElevation). A tier's edge always runs down the middle of a street that
truly crosses the city: both rows either side of it street everywhere the city
reaches, the row at least half the city's widest, twenty rows in from where the
city actually starts and ends (on an organic outline the plan's first rows are
only spurs of street), edges forty apart. So no lot is split. The heights are a
rolling plan, every cell its own, so the existing lift raises streets, lots and
all and fills beneath them: the faces between tiers are retaining stone.

At every edge, flights of stairs climb along the foot of the face from the
lower street to the upper (cliffStairs): two wide, a block a step, filled
under, a landing level with the upper street and a parapet past it so no one
walks off the end; street furniture in the way (lamp posts, signs, flowers)
gives way, and if nowhere else will do, track too, so every edge has a way up.
The top of each face is railed but where the flights come up. No canal or
harbour (water cannot lie across tiers), and for now no perimeter wall: built
on the base level it sat buried in the upper tiers with its gates under their
streets; a wall that climbs the tiers is still to come.

Floating islands: the arches dressing a canal's widest bridge had their piers
on the canal's walls and bed, which a floating city cuts away, so they hung over
the chasm; a floating city leaves them out, and 2zr checks that nothing hangs
over a chasm (13 checks).

New section 2zs (9 checks): tiers, a way up at every edge, flights a block a
step, landings and parapets, railed tops, solid faces, no lot split, every
building and door reached from the bottom tier, nothing dark. A cliff city's
export is all Bedrock's own block states.

**0.32.1** — Wider gaps between the islands; the railway whatever the style.

The chasms between floating islands were canal channels, three across or, in a
narrow street, a one-block crack. A floating city now plans its streets wide
(avenues 13, streets 9, where the sliders are at their defaults) and a chasm in
a wide street takes all of it but a walkway two wide on each bank, railed on its
inner row: gaps of five to nine, the crossings and footbridges still decks
across the whole width. (A walled fortress keeps its streets wide when it
floats.)

The Venetian and Walled fortress styles set the Streets setting back to plain
roads whatever was chosen, so a railway (or trams) never appeared in a city of
either; that override is gone (Roads is already the default), and track crosses
canals and chasms on the street bridges.

2zr checks both: the chasms gaps, not cracks, the widest nine, and a railway
when asked for in a modern, Venetian and fortress floating city (12 checks).

**0.32.0** — A city of floating islands.

A new option, "Floating islands in the sky" (invented cities). The main streets
are planned as canals would be (planCanals) and become chasms instead, open to
the sky below; each is carried along its street right across to the city's edge
(only through street, never a lot), so the land cannot wrap round its ends and
the city falls into islands, six or seven in a city of 200. What the canal
machinery builds stays: walkways railed on both banks (in a narrow street the
chasm is a one-block crack, so each bank keeps a walkway two wide), every
crossing street and every line of track on a deck, footbridges between. The
decks are bridges now, one layer with air under it. Every island hangs on a
rocky underside like a mountain turned over: three deep at the rim, deeper
going in, up to 28, soil over stone with patches of cobble and andesite, and
never shallower than what stands in it (a pond, a fish spawner), so no water
spills into the void. No harbour and no boats; no stilts and no dome; the
foundation setting does nothing, and the guide says to build it high.

New section 2zr (10 checks): islands, undersides deeper in the middle, chasms
open all the way down, one-deck bridges, railed banks, no water spilling, no
boats, nothing founded below, every building walking through, nothing dark.

**0.31.1** — On stilts, the piles are the foundation.

The Foundation export setting filled solid stone under the whole city, which on
a stilt city buried the water and piles under a block of rock. With stilts on,
the foundation is the stilts carried on down: each pile goes the chosen depth
further into the ground below, islands (parks, farms, ranches) and the seawall
stand on solid ground, and under open water nothing is put, so whatever is
beneath (the real seabed, water, land) is left as it is. The same on Bedrock
(the foundation fill) and Java (the fill listed under the city). The stilt pass
records each column's kind on the world for the exports, each pile stands
through the seabed, and the seabed lanterns moved off the pile grid (they had
fallen on the same cells) to stand between the piles. The placement guide says
what the foundation does on stilts.

2zq checks the foundation on stilts, Bedrock and Java (11 checks).

**0.31.0** — A city on stilts over open water.

A new option, "On stilts over open water" (invented cities; the ground is made
flat). Everything above street level is the city it would have been; below it,
under the streets, squares and buildings, the stone gives way to open water: a
gravel seabed seven down, water up to the canal's own level, and two blocks of
air under the deck, room for a boat. Dark timber piles hold the deck up, every
four blocks under the streets, at every building's corners and every three
blocks under it. Parks, farms and ranches stay islands of soil, and so does any
column whose surface is not solid (a fountain's water would fall). A canal's
channel opens into the water below at the same level, with no pile in it. The
city's edge stands on a stone seawall, a breakwater at sea that keeps the water
in on land, and a sea lantern in the seabed every eight blocks lights all the
water (dark open water in an ocean would spawn drowned). Gravel ballast under
tram track that ends up over the gap is made stone, so it cannot fall.

New section 2zq (9 checks): above the deck the city unchanged, every building
walks through and nothing is dark, open water from the seabed to the canal's
level, the air gap, the piles, islands, seawall and seabed lanterns. A stilt
city's export is all Bedrock's own block states.

**0.30.6** — A fish spawner in every park pond.

Summoned fish still were not showing in park ponds, so each pond now makes its
own: a tropical fish spawner set into its floor (one to a pond, two in a pond
of more than sixty cells, on the deepest cells nearest the middle, in place of
the clay, water right over it). Whenever a player is within 16 blocks it lets
out fish, up to four at a time within four blocks of it, none while six are
already near, every 10 to 40 seconds: the settings (and their NBT types) of a
fish spawner saved in the game. On Java it is a minecraft:spawner whose spawn
data is a tropical fish, with the same rhythm and reach. The summoned fish stay
too, and the stats count the spawners.

2zc checks the spawners: every park pond has one on its floor with water over
it, the saved spawner's settings and tag types, the block entity in the Bedrock
structures and the tropical fish spawner on Java, none with fish off (43
checks). 6d accounts for spawner block entities like signs and beacons.

**0.30.5** — populate_centered is back to what worked.

0.30.4 turned populate_centered (and the other centred functions) into a
wrapper that ran its work from the armor stand build_centered leaves; in game it
did nothing at all (a city built by an earlier pack has no marker, and an
untested command that Bedrock refuses drops the whole function). The centred
functions are now exactly 0.30.3's again, run from where the player stands:
compared function by function for the same city, every one but build_centered
is byte-for-byte 0.30.3's, and build_centered only adds the marker (the lines
that already ran in 0.30.4) and a line saying how to come back to it:
/tp @s @e[type=armor_stand,name=<city id>_centre,c=1]. The marker is a help to
find the spot, not something populate depends on. Beside each centred function
there is an optional <name>_from_mark that runs it from the marker; if that
does not work in a game, nothing else is touched.

The centre mark is still always placed (0.30.4's wider search stays). 2zp and
the function checks read the centred functions where their work is again.

**0.30.4** — The centre is always marked, and populate always lands where build did.

A big hilly city could come without its centre mark: the search for a spot went
only 40 blocks from the middle, on ground at the base level, and in the dense,
terraced middle of a 512 city it found nothing. With no beacon to come back to,
populate_centered was run from another spot, and every villager, animal and
fish landed shifted (fish a few blocks off their pond land in the ground or on
the grass, and die). Now the search goes out as far as it takes (streets stay
level across a terraced city, so there is always somewhere), looking the
buildings up in a grid so a big city stays quick, and as a last resort the mark
may stand beside a building; in the test cities, 512 across included, it lands
within six blocks of the middle.

And build_centered now marks its spot with an armor stand (named <city id>_centre,
in the mark's alcove). populate_centered, fish_centered, boats_centered,
hostiles_centered and minecarts_centered run from that marker wherever the
player stands (execute at the armor stand: their work is in <name>_at_mark, and
they say so if there is no marker). The guide says how to go back to it:
/tp @s @e[type=armor_stand,name=<city id>_centre,c=1].

New section 2zp (7 checks, slow group): the mark placed in big, hilly, mixed
cities and near the middle, the marker set last in build_centered, every
centred function run from it with its work kept whole, the guide's way back.
6b, 6d, 6e, 2zc and 2zi read the centred functions' work where it now lives.
(Rebuilding a v0.30.3 city from its pack: all 120 of its fish summons land in
water when populate runs from build's spot.)

**0.30.3** — Fish that stay where they are put.

The pond fish were summoned, into water, in the right places (checked on a
pack built in game: all 67 summons of a mixed city land in water, the tropical
fish mid-pond with water above and below), and then vanished: in Bedrock a fish
despawns once the player is 32 to 40 blocks away, and a name does not keep it
(the game's own tropical fish definition has no exception for one; only a fish
let out of a bucket is kept). So by the time anyone walked to a park pond, its
fish were gone; the canal, passed more often, kept some.

The pack now carries the game's own three fish (engine/fish-entities.js:
Mojang's bedrock-samples tropicalfish, fish (cod) and salmon, format 1.26.0),
each with one thing added: an event, polis:keep, that gives the fish a
persistent component (and takes it off distance despawning). Every fish Polis
summons fires it: summon minecraft:tropicalfish ~x ~y ~z 0 0 polis:keep Koi. A
wild fish never gets the event and despawns as it always has.

2zc checks that every fish is summoned with the event and that the pack's three
fish are the game's own with only the event and its group added (39 checks);
6e knows the new command.

**0.30.2** — Park ponds deep enough to keep their fish.

Generation did put fish in park ponds, but a pond was only deep in its middle
(cells with water on three sides), with a one-deep margin all round and, in
small ponds, a deep patch of one to four cells or none: fish drifted into the
shallows and leapt out onto the grass. Now every pond cell is at least two deep,
edges too, the banks going straight down, and a cell with water all round goes
three deep; clay lines the bottom. A pond needs a park quarter six wide (four by
four of water at the least) and always takes the biggest quarter. Pond fish
start in open deep water, the four cells round them deep too, never in a
pocket. (A big lake counts as open water, like the canal, and gets cod and
salmon.)

2zc checks the new ponds: deep throughout, three deep where water is all round,
clay under them, no shallow margin, no fish in a deep pocket of a shallow pond
(36 checks). Two checks were made fairer: the share of buildings with rooms is
measured over eight cities (at least 55%; it measures 62-64%, and a real fault
took it to about 50%), and a village cottage's footing is checked all round its
ground course (every plain wall cell turned to stone) instead of at one cell
that could be a doorway.

**0.30.1** — The centre mark's beacons shine through a dome.

Under a dome the beacons' beams were stopped by the shell: its twelve quartz
meridians meet at the crown, right over the city's middle where the centre
mark stands, so a beam almost always ran into a rib (37 of 48 domed test
cities, mixed or not; mixing styles had nothing to do with it). Now where a
beacon's column meets the shell it is plain glass, which a beam passes
through, and the glowstone crown goes on the nearest cell off the beam; glass
seals as well as quartz, so the dome stays watertight. 2zj checks that nothing
but glass stands over any of the beacons, all the way up (28 checks).

**0.30.0** — A city of many styles.

Tick "Mix styles by district" and the styles wanted (a box for each of the
twelve, under the Style menu), and the city is shared out among districts,
each built in one of them (districts.js). Seed points are spread evenly over
the city and every place belongs to the nearest, measured through a gentle
noise warp so the borders wander like old quarters. A bigger city has more
districts (about one to every 72 x 72 blocks), and there is at least one for
every ticked style; the districts with the most lots are handed out first, one
to each style, so every ticked style gets buildings. The district at the heart
takes the base style (the Style menu) when it is ticked.

A lot takes its district's style whole, so no building is split at a border:
its theme, and its dress (pointed windows, eave skirts, Art Deco fins and
crowns, pagodas, cottages, no paintings in glass). Landmarks are built in
their own district's palette (a campanile in a Venetian quarter). Streets and
ground are restyled district by district (glass streets, nylium, gravel,
snow), and so are the lights set into the floor, the torii in parks and the
cacti in the desert. What shapes the whole city stays with the base style:
canals for streets, a fortress wall, floor height, setbacks, a village's low
buildings, the dome's ground.

New section 2zo (10 checks): every ticked style gets buildings, each built from
its own district's themes and dressed its style's way, none split, ground
restyled by district, no dark spot, and with mixing off (or one style ticked)
the city is the one-style city block for block. An eight-style city's export
is all Bedrock's own block states.

**0.29.0** — No dark corners: nowhere in a city for a hostile mob to spawn.

Since 1.18, in both editions, an Overworld hostile mob spawns only where block
light is 0, on an opaque surface with two cells of room above. When a city is
finished (dome and all), its block light is worked out the way the game does
(lighting.js: each light spreads a level weaker per block, stopped by opaque
blocks, passing through glass, fences, doors, stairs and the like), and every
spot a mob could spawn on is lit: at least 1 outside, and 8 inside buildings so
rooms are properly lit (and safe even under the old 7-or-less rule).

A dark spot gets, in order: a lantern hung from the ceiling (only three clear
over the floor, never over the stairs); a light set flush into the floor under
it (a sea lantern, or shroomlight in the Nether; streets, pavements, walkways
and every building floor count as floor); outside, a flush light in the nearest
floor that reaches it; or a small lantern standing on it (a bookshelf, a roof
ridge, a merlon), the block under it kept. Nether fungus canopies take
shroomlights among the wart. Never touched: furniture, workstations, gold,
doors, stairs, decoration that stands proud (a torii lintel, a spire's tip, a
stall counter), the soil under a flower, a fitted city's graded hillside. And a
safety net: a building that would not walk through with its new lights gets
them taken out again.

Across seven styles, a few hundred lights take every city from thousands of
dark spots to none; the glass dome's lawn, the darkest of all, is lit too. A
line in the stats says what was added. On by default (cfg.lightAll).

New section 2zn (7 checks): the light worked out afresh on the finished city,
no spot left at 0, every room at 8, lanterns in nobody's way. 2zj and 2zk accept
a lantern on a merlon and a lit dock landing.

**0.28.0** — A city of glass.

A new city style. Walls of stained glass, a colour for each kind of building
(light blue, pink and yellow houses with cyan, magenta and orange roofs; cyan,
amethyst, jade and frosted mid-rises; sapphire, emerald, ruby, smoked and clear
"prism" towers), a rainbow skyline. Clear glass windows framed in quartz, glass
floors (look up or down through a whole building), glass partitions, birch
doors. Glass streets and quartz pavements, white glass paths and crossings,
trees with quartz trunks and green glass canopies, glass-pane lamp posts under
sea lanterns, glass terrace walls. Mobs do not spawn on glass.

Nothing that needs a solid wall to hang on: a glass city climbs by stairs
(never ladders) and hangs no paintings. Lanterns stand on furniture or hang
from the glass ceilings.

Eight more stained glass colours (light blue, cyan, magenta, pink, lime,
orange, light grey, grey); white stained glass is marked see-through like the
rest. New section 2zm (10 checks); the style sweeps cover it, and every
exported block state is Bedrock's own.

**0.27.0** — Interiors that follow the building.

*Hearths.* A house records where its chimney stands; under it, on the ground
floor, a lit fire in the corner with a brick jamb beside it and brick over it,
and a brick chimney breast up that corner through every floor to the stack on
the roof (into empty cells only: never through a floor).

*Banisters.* On every upper floor a rail, in the door's wood, runs along the
edge of the stairwell where the floor meets the opening, never in front of a
step; a floor that would not walk through with its rail loses it again.

*Kitchens and tables.* A kitchen has an unbroken counter along one wall
(stove, worktop, sink, worktop, barrel). A room with space for one has a
dining table, two cells long or one in a small room, with a chair at each end
facing it and a clear cell all round, tried at every spot nearest the middle
first. Tables and counters come out before a building gives up its rooms.

*Shops true to their signs.* The name is chosen first and the fit-out follows
it: a bakery has smokers, hay and cakes on the counter, a butcher smokers, an
apothecary brewing stands and a cauldron, a tailor looms, a hardware shop a
grindstone, stonecutter and anvil, a cafe or tea house tables with chairs. New
shop: the Smithy (anvils, blast furnace, smithing table, grindstone).

*Streams.* Every building furnishes from its own fork of the city's life
stream, so how many draws a room takes can no longer move farms, trees or
cacti elsewhere in the city. (A stream seeded straight from a lot's
coordinates was tried first and made worse rooms.) Measured on an independent
set of twelve cities, buildings keep their rooms as often as in 0.26.0.

*Deserts always have cacti.* They are planted in place of some trees by
chance, so a small city could draw none; now if there are too few, some dead
bushes on open sand become cacti, chosen by position (no random draws).

New section 2zl (8 checks); 2ze checks houses in a village too. New blocks:
anvil, cake, campfire (its states checked as Bedrock's own types).

**0.26.0** — Two new city styles: Venetian and Art Deco.

*Venetian.* Canals are the main streets: up to six in a city, each a stone
channel with a walkway along both banks, chosen from the widest streets
(planCanals); a later canal may run straight through an earlier one's water,
an open junction. Every crossing street is carried over on its deck, and
between streets a railed footbridge crosses every ~18 blocks, lanterns at its
rails' ends, a boat still passing under. Open spaces are piazzas, the ground is
a flat lagoon, there are no trams, and floors are a block taller. Houses and
palazzi in pink and orange terracotta, brick and calcite have pointed Gothic
windows: each run of glass becomes pairs of lights between stone piers, with
two upside-down stairs leaning together over each pair for the pointed head.
The clock tower is a brick campanile with a green copper spire, eight floors
whatever the height limit, standing over the city and named Campanile.

*Art Deco.* Towers step back every four floors; from the first floor up,
vertical fins of trim stand out between the bays, unbroken to each setback,
with gold finials at the top; every tower wears a crown of three tiers
stepping inward, their faces in trim with gold chevrons, and a spire with a
gold tip, leaving the roof hut's door clear. White, black and limestone with
quartz and gold; no twisting towers.

Fixed on the way: laying the canal's stone base again for a second canal filled
the first canal's channel (and the air under its bridges) back in; the base is
laid once now. The centre mark no longer lands on a canal walkway. An Art Deco
crown's recorded heights ride up with the terraces.

New section 2zk (14 checks); the style sweeps cover both new styles, and every
exported block state is Bedrock's own.

**0.25.4** — Fortress tower doors open onto the wall walk.

A tower's two doors were put where the walk would meet it if the wall ran
straight for three blocks either side; where the town's outline bends near a
tower, a door could open onto air, or onto a solid block (20 of 220 doors
across five fortress towns). Now each side's rows are tried, the walk's inner
row first, and a door goes only where the cell outside it is walk to stand on;
a side the walk does not reach gets an arrow slit instead. Every door opens
onto the walk (202 of 202), and every tower keeps at least one (18 have one).
2zj now checks the cell outside every door, not only that a door is there.

**0.25.3** — Nothing in a dome built under water comes out waterlogged.

0.25.2 drained the empty cells inside a dome, but a block placed into a cell
still full of sea kept the water: in Bedrock a structure's second layer (the
liquid in a waterlogged block) was -1, "keep what is there", and Java's
/place template waterlogs a block it puts into water. So stairs, doors,
fences, lanterns, barrels, leaves and panes came out full of water, and being
water sources they ran onto the streets. Now build first loads drain
structures, one per tile: air through every cell of the dome's inside, blocks'
cells included (in Bedrock in both layers), and only then the city, into dry
space. Bedrock also writes air in the second layer of every cell inside the
dome. The sea test (2zj) now loads the structures in build's order and counts a
block placed into water as waterlogged whatever its second layer says: 0.25.2's
order put 33,419 blocks into sea water, this one none. 27 checks.

**0.25.2** — A dome built under water is dry inside; Java exports ten times faster.

A structure's empty cells are "leave alone" (structure void), so a dome built
in the sea kept the sea inside it. The dome now records its shape on the world,
and both exports write real air into every empty cell inside it, air fill or
not; outside the glass every empty cell stays "leave alone", so the water (or
the hillside, or anything else) around the dome is kept. Checked by loading the
exported structures into a simulated sea by each game's own rule: every empty
cell inside the dome comes out dry and every cell of sea outside keeps its
water, in Bedrock and in Java. The placement guide says so, and that running
build again from the same spot clears any water that got in through a chunk
not yet loaded.

Writing a dome's air meant listing about a million air blocks in the Java
structures, and the Java NBT writer made a fresh little array for every byte
and an object tree for every block: the export spent most of its time in the
garbage collector (33 s for a domed city). The writer now fills one growing
buffer, encodes tag names once, and writes a structure's blocks straight from
flat arrays: a domed city exports in about 3 s, an ordinary one in 0.4 s
instead of 3.7 s, and the output is byte-for-byte what it was (compared against
0.25.1 for three cities, with and without air fill).

2zj runs the sea test for both editions (24 checks now).

**0.25.1** — The Life panel lays out properly.

The checkbox grid's columns were plain 1fr, which cannot go narrower than
their longest word, so the long hostile-mobs label pushed the grid (and with it
the whole Life panel) wider than the sidebar, and the slider values were cut
off at the edge; the hostile-mobs count slider also sat inside the grid,
squeezed into half a column. The grid's columns now shrink to the panel
(repeat(2, minmax(0, 1fr))), a label wraps beside its box with the box kept
square, the slider has its own row, and the label is shorter, the /function
note moving into the hint below. Checked in a real browser (Chromium) at five
window sizes from 1920 down to 600 wide: no element overflows any panel. 2zi
now checks the markup for both causes, and fails on 0.25.0's page.

**0.25.0** — A walled fortress town, and a dome over the city.

*Walled fortress* (a city style). The medieval palette inside a curtain wall
three thick and at least nine high, built on the city's three outermost rings
(the ring road's outer lanes; no building ever stands under it). Its top is a
walk the whole way round with merlons on the outer edge. Towers stand astride
the wall every ~22 blocks, projecting two blocks outward: solid to the walk,
then a room at walk height with a door onto the walk either side, arrow slits,
a lantern and a crenellated roof. Each gate is a passage right through the
wall with a gatehouse tower either side (a gate goes only where both fit), and
beside it a flight of steps cut into the wall's inner face climbs to the walk
from a foot at street level. The keep (the castle) takes the heart of the town
first, the market square the next nearest lot; streets and lots are narrower,
buildings low, and there are no trams (sliders still at their defaults are set
for it).

*Dome* ("Glass dome over the whole city", off by default; invented cities
only, since real ground outside a city is not flat). Half an ellipsoid of
revolution over the whole city: its radius clears every block by four, and its
height is the least that leaves three blocks of air over every block inside
(a block at distance r and height h needs c >= (h+3)/√(1-r²/R²)), never flatter
than 0.45 of the radius. Each column's shell runs from one above the lowest of
its neighbours' surfaces up to its own and always keeps its surface cell, so
the shell is sealed: nothing gets from outside to inside block by block. Glass
between twelve quartz meridians, a quartz ring every sixteen blocks, a
glowstone crown; the ground under it made whole in the style's own ground
material; a double door at each compass point, in a column whose shell runs
unbroken from the ground so the seal holds.

*The voxel store* now keeps blocks west and north of the plan's edge (x and z
from -512). Up to now anything there was dropped without a word; a dome over a
city and a fortress tower standing out from its wall both reach there. Keys
are exactly 32 bits (the export's key array is unsigned now).

New section 2zj (22 checks): the store west and north of the plan; the
fortress wall solid and three thick with no building under it, its walk,
merlons, gates, gatehouses, tower rooms and doors, towers standing out, the
stairs, the keep at the heart; the dome sealed (a flood of the air from
outside), clear of every block by three, never over a block, on whole ground,
its doors walkable, ribs, crown and the style's ground.

**0.24.0** — Hostile mobs, on request.

Off by default. Every pack now carries three functions: hostiles and
hostiles_centered (pair them with build and build_centered, run from the same
spot) summon the city's hostile mobs, and hostiles_clear removes exactly the
ones Polis summoned. A "Hostile mobs with populate" checkbox (unchecked) has
populate bring them in with everything else instead, while its ticking areas
still hold the whole city loaded, so none is lost to an unloaded chunk; the
"Hostile mobs" slider sets how many (24).

Only kinds daylight leaves alone, a mix for each style: creepers, spiders,
endermen, witches, pillagers and vindicators in most cities; an illager raid
(pillagers, vindicators, evokers, witches) in medieval towns and villages;
husks in the desert; and for the Nether style its own fauna, wither skeletons,
blazes, magma cubes, zoglins and zombified piglins. On Bedrock they are summoned
with a name, which keeps them from despawning; on Java they carry
PersistenceRequired and a tag for clearing, and the ground is forceloaded
first, as build does. They stand on streets, squares, parks and pavements with
three blocks clear over them (an enderman is nearly three tall), at least five
apart, never within three of a doorstep and never inside a building. Chat warns
what the mix will do: creepers and endermen damage blocks
(/gamerule mobgriefing false stops that), illagers and zoglins attack
villagers, and nothing hostile appears on Peaceful. They come from their own
random stream, so a city is the same block for block with them or without.

New section 2zi (20 checks); 6e knows the new commands.

**0.23.2** — One staircase per courtyard block.

With the wings opened into one another, each keeping its own stair was two or
three staircases in one building. Now only the back wing (in a U, the middle
one) has a stair; the side wings are built with a new makeBuilding option,
noStairs, which keeps all their floors, lays every slab whole and puts no roof
hut on them. They are reached up the back wing's stair and through the
openings. The walk-through (verify.js) and the rooms check (roomsReachable)
walk a shared-stair wing over its whole block (rec.verifyBox) while still
counting only the wing's own floors, and the stair wing is furnished first, so
the other wings' rooms are judged against it as it will stand.

2zg checks it (24 checks now): exactly one stair per block, in the back wing;
the stairless wings keep every floor with whole slabs; every wing walks
through, the side wings up the back wing's stair. 2k's room walk knows about
shared stairs too.

**0.23.1** — A courtyard block is one building inside.

The wings of an L or U stood side by side, each with its own walls, so where
two met there was a double wall on every floor. Now, once the wings are up,
both walls come down along the whole line where they meet, floor to ceiling on
every floor, keeping only the two end cells, where the line meets the block's
outer wall and the court's, so those corners stay solid. The parapet over the
join comes off the roof. The floor and ceiling slabs already ran under and over
the line (each wing's slab covers its whole footprint), so the opening needs
nothing added. The cells just inside each wing in front of the opening are kept
clear of furniture (furnish() honours a building's keepClear cells), so the way
through stays open. Each wing keeps its own stair.

2zg checks it (22 checks now): every join open on every floor, the floor
unbroken under it, its end cells solid, no parapet left over it, and, in
furnished cities, a clear straight walk through every join on every floor.

**0.23.0** — Two new city styles: Nether and East Asian.

*Nether.* Crimson and warped wood houses with wart-block roofs, nether brick
and polished blackstone mid-rises, blackstone and crying-obsidian towers,
basalt columns on the town hall; blackstone streets, polished blackstone
pavements, gilded blackstone road lines, soul-soil paths, crimson nylium for
grass, crimson and warped fungus trees, crimson roots for flowers, nether-brick
fence posts with shroomlight lamps, and shroomlight ceiling lights. The canal
stays water: lava would take the boats, the fish and anyone who stepped in.

*East Asian.* White plaster between dark timber, paper-screen windows (white
stained glass), grey tile roofs, tea houses in bamboo, vermilion shrine halls;
gravel roads, stone-brick paving, pines with cherries among them. Its own
architecture: every building of two floors or more wears a skirt of tile
eaves at each floor, turned up at the corners, and at least a storey above the
ground; most towers are pagodas (a new plate-tower shape, square or octagonal,
tapering, an odd number of tiers from three to nine, an eave ring at every tier,
the spire ending in gold); a torii stands where each park path meets the
street (vermilion posts and tie beam, black lintel with upturned ends, the
lowest beam four up so the path keeps its head room); stone lanterns stand by
the path crossing.

Behind them: 34 new blocks and seven stair kinds, each checked against
Bedrock's own state list, with the two Java renames (nether_bricks,
red_nether_bricks). An untilted plate on an even lot needs half a block more
room at the top, which a pagoda's taper now allows for, so its top tier is
furnished. Pines are their own material, so a style can turn oak into pine and
spruce into cherry in the same city.

New section 2zh (17 checks): every block real, the Java names, Nether cities
with no grass or oak left and their signature blocks present, East Asian cities
with pagodas, eave skirts, torii and lanterns all built right and never in
anyone's way, and every building in both styles verified with every door
reached. 2zf now allows a cell per unit of perimeter for drawing an untilted
plate, and leaves the pagodas to 2zh.

**0.22.0** — Courtyard blocks, and a school with lights and books.

*Courtyard blocks* (engine/courtyard.js). A mid-rise lot may be built as an L
or a U round a courtyard that opens onto the street. The block is made of
wings, each a whole Polis building with its own stair core, rooms, furniture
and walk-through, sharing one theme, floor count and height, so from outside
it reads as one block. Side wings run the full depth with their door on the
street end; the back wing opens onto the court. The court is a lawn with a
path from the back wing's door to the street, flowers along its edges and a
lantern post. A wing narrower than seven cannot carry its stair above one
floor, so every wing is at least seven across: an L needs about 14 across the
street face, a U 21 (its side wings take the thickest they can and still leave
the back wing seven). Most mid-rise lots are 10 to 16 wide, so L blocks are
common and U blocks rare at the default lot size; raise the downtown lot size
for more. If the wings ever came out at different heights the lot is built the
usual way instead. Each block is decided by a hash and built and furnished
from its own random stream. A "Courtyard blocks" slider sets the share.

*School.* The hall had desks, a board and a lectern but no light and no books.
Each floor now gets lanterns hung from the ceiling on a three-block grid (clear
of the stair) and bookshelves, two high, along the walls that are neither the
front nor the board's, each keeping an aisle clear in front of it; a floor that
would not walk through with its shelves keeps none.

New section 2zg (18 checks): courtyards on flat ground in every facing, both
hands and both kinds (wings and court partition the footprint exactly, the
court opens onto the street, doors where they belong, the path, the lantern,
one theme and height), courtyards in cities (hills too) with every building
verified and every door reached, and the school's lights and shelves.

**0.21.0** — Shaped towers, Romanesque arcades, a Flamboyant portal.

*Shaped towers* (engine/twist.js is now a plate-tower engine). Every floor is
the same shape, a regular polygon or a circle, turned and optionally shrunk a
little from the one below. A plate is set by its circumradius R: a regular
n-gon turned by θ has inradius R·cos(π/n) and holds a cell when the cell lies
inside every edge's half-plane; a circle is drawn at R - 0.35 (no one-block
nubs). Any plate lies inside its circumscribed circle, so R no more than the
lot's half-width keeps it on the lot at every turn. Six shapes: twisting
square (0.20's, cell for cell), twisting octagon, twisting hexagon, tapered
twist (R shrinks linearly, never so far that the inradius drops below 3√2, the
room the stair core needs), round, and round with eight helical ribs. Piers
stand at the vertices, so on a twisting tower they climb as helices. One
spiral core, the furnishing ring and the walk-through serve them all. Each
lot draws its shape from a hash; the slider is now "Shaped towers". A shaped
tower furnishes from its own random stream, so a different shape never moves
a farm elsewhere in the city.

*Romanesque arcades*, from the plate's "Architecture romane": along the street
face of a mid-rise ground floor, a pier every fourth cell and between each
pair a three-wide round-headed opening (bulkhead, glass, a head of upside-down
stairs with glass at the crown); a bay that touches the doorway is left alone.
A billet course runs over them at the first floor's slab. A shop behind an
arcade keeps it as its window. Only ordinary mid-rise lots get one; landmarks
dress themselves.

*Flamboyant portal*: the church's door gets a pointed gable of stairs with a
carved apex and a finial, and a pinnacle on either side, all a block out from
the facade and starting at gy + 4, so the doorstep keeps its head room.

New section 2zf (50 checks): every shape on 48 lots (walk-through, furnished,
on the lot, the right area within 20%, walls closed, piers at every vertex of
every floor, taper rules), the square twist identical to 0.20's cell for cell,
all six shapes in cities with every building verified, the arcades cell by
cell and never at a door, and the portal on four churches.

**0.20.2** — Ponds deep enough for fish.

Park ponds were one block deep, and fish were placed in that one layer, right
at the surface: in game they leap out onto the bank. Ponds now get a deep
middle, dug as a last pass after every terrace lift so each pond's own surface
height is known (flat, terraced or rolling ground alike): every pond cell with
pond water on at least three sides takes a second layer of water under it and
clay under that, so a round pond gets a deep centre and a narrow one a deep
channel, and the rim stays a one-deep shelf. Fish are now only ever placed in
water at least two deep, in the layer under the surface, with water over them;
a pond too small to have a middle (a 2x2 puddle) gets none. Across 195 park
ponds in five city styles, every pond bigger than a puddle has a deep middle
and fish. 2zc checks it (a one-deep pond gets no fish; a pond with a deep
middle gets them there, in the bottom layer; every park pond in real cities
has its deep middle, clay under it, a rim, and fish).

**0.20.1** — Terrace steps face straight in; twisting towers furnished; houses dressed.

*Terrace steps.* Flights ran sideways along the kerb, where you step onto the
side of the first stair; villagers will not climb that. The cause was the
check that drops a flight which climbs nothing: it measured the ground beside
the last step, which on a terrace two or three high is still terrace, so every
straight flight there was thrown out. It now measures the street in front of
the first step. Where the pavement is too narrow for a whole flight, a stoop
starts out in the road, still climbing straight in (with a lane left beside
it). A flight along the kerb is a last resort for a side with nothing else, and
gets a notch cut to street level at its foot, so it too is entered from its low
end. Stairs keep off the city's outermost ring (the wall goes up there later),
and the centre monument keeps off the street in front of every flight. Over 20
hilly cities: 2,449 of 2,455 flights climb straight in, every one is entered
head on, every door is reachable.

*Twisting towers furnished.* Furniture follows a ring inside each floor; a
twisting tower's reference square hugs its stair core, whose surroundings are
kept clear, so nothing was placed. A tower now gives furnish() its own ring,
just inside each turned floor's walls, with the way in for each cell and sides
that change where the wall turns, so beds lie along one stretch of wall.

*Houses* get shutters beside every window (a wood that stands out from both
the wall and the trim), lintels and sills, window boxes under the upper
windows, flower beds under the ground-floor ones, a pitched hood over the door,
and a picket fence along the front with a lantern on each gate post. The hood
sits at gy + 4: at gy + 3 it took the head room of a step up out of the door on
real ground and shut a house in. The details draw on their own random streams
and are laid out after the yard, so a city's buildings, rooms, farms and mobs
are exactly as they were without them.

New section 2ze (20 checks); 2i now requires 98% of flights straight in and
every flight entered head on.

**0.20.0** — Twisting towers, a Gothic church, and standing stones.

*Twisting towers* (engine/twist.js). A downtown tower on a square-ish lot
(at least 13 across, 6 floors) may corkscrew: every floor is the same square
plate turned a little further than the one below, 60–90° in all, either hand.
A square turned by θ spans h(|cos θ| + |sin θ|), largest at 45°, so plates of
half-size H/√2 stay on the lot at every turn. The corners are solid piers, so
four helices climb the facade, with glass between them; a stepped crown and a
mast top it. Every plate contains the circle of radius h, so one 3x3 spiral
stair in the middle serves all of them, built to the same rules as every
other stair (one block per step, three of head room), and the same walk-through
proves every floor. Each lot is chosen by a hash and built from its own random
stream; the "Twisting towers" slider sets the share (0 keeps cities as they were).

*Gothic church* (engine/gothic.js), after the plates of the *Tableau
d'archéologie*: a rose window over the door (a ring of tracery, a carved hub,
four spokes at radius 3 and eight from 4, a colour to each sector), tall
lancets with keystones up the side walls and a triple lancet at the east end,
buttresses a block out with a sloped weathering and a pinnacle above the
eaves, a corbel table under them, gargoyles at the corners, and in place of
the old spire an octagonal stone flèche with crockets climbing its faces and a
pinnacle at each corner of the tower. The hall is taller to make room. It all
sits in walls or in the air, so the church still passes the walk-through;
with Detail off the church is exactly the old one.

*Standing stones* (engine/megaliths.js), from the plate's Celtic monuments:
half of all parks get a menhir, a dolmen (uprights and a capstone, with a
chamber you can walk into) or a stone circle of eight stones with a taller
king stone. They take a free quadrant, never a path, the pond or the panda
grove, trees keep their canopies clear, and they ride up with the terraces.
A "Standing stones in parks" checkbox under Life.

New section 2zd (61 checks): 160 twisting towers on flat ground across sizes,
heights, both hands and all four faces, each walked through, with plates on
the lot and full size, the turn measured at the floor nearest 45° (a square
turned 90° lands on itself), steps and head room checked block by block,
walls closed, and piers found at every corner of every floor; twisting towers
in four cities; the rose, lancets, buttresses, pinnacles and flèche of four
churches; and 60 monuments checked for footing, capstones, chambers and circles.

**0.19.0** — Fish in the ponds, the canal and the harbour.

Fish are placed last, once no more water will change, and found from the
blocks themselves: the surface of the water, grouped into bodies. Only real
pools get fish, never a one-wide irrigation channel or a fountain bowl (a body
needs at least 6 cells and a 2x2 patch of open water). Park ponds get mostly
tropical fish, some cod, one per 8 cells up to 6; the canal and harbour basin
get cod and salmon, one per 30 cells up to 48; at most 120 in a city. They keep
2 blocks apart and swim a block under the surface where the water is deep
enough. They use their own random stream, so a city's blocks and every other
spawn are identical with fish on or off (a new "Fish in ponds and canal"
checkbox under Life, on by default).

Wild fish despawn, so both editions mark them as kept. Bedrock keeps a named
mob, so populate summons them with a name ("Koi", "Cod", "Salmon", shown only
when you look right at one), while its ticking areas still hold the whole city
loaded; fish / fish_centered re-summon any that are missing. Java writes them
into the structures with PersistenceRequired, and each tropical fish gets its
own pattern and two colours. New section 2zc; 2c and 6e know about fish.

**0.18.0** — Chunk Pregen comes with Polis.

Bedrock only saves a chunk once it has changed since generation, so ground
you have flown over is often missing from an export and a site shows as
unexplored. Polis now carries the Chunk Pregen behaviour pack: a panel under
the map downloads it (built in the browser from the embedded copy; a legacy
build for games older than 26.10 is one click away), gives four steps, and
copies the exact `/scriptevent pregen:area …` command for the chosen site
(snapped to whole chunks, with a 16-block margin) or for everything the map is
showing. The panel is outlined when a site is too little explored. The pack's
source lives in `pregen/`; `node tools/embed-pregen.js` refreshes
`engine/pregen-pack.js`, and section 2zb fails if the two differ, checks both
builds, parses every pack script and checks the commands; it also boots the
app against a stub browser with a Bedrock world (written by the new
`tools/make-bedrock-world.mjs`, shared with 2za) and presses every pregen
button, and checks the panel stays hidden for Java worlds. A world whose
LevelDB is all in the log, with no table yet, is now recognised as Bedrock.

**0.17.2** — A world map that says why a chunk is dark.

A chunk only showed if it had a Data3D heightmap record; anything else was
drawn dark, the same as a chunk that is not in the world. Now every chunk with
any record is counted while reading. Chunks with blocks but no heightmap have
their heights worked out from the subchunks themselves (top non-air block + 1,
the heightmap's own convention) and show normally; pre-1.18 Data2D heightmaps
are used where there is no Data3D. Chunks that have records but no terrain are
drawn red, and the status line gives how many there are and Bedrock's own
generation state for them (FinalizedState: needs instaticking, needs
population, done). Dark now only means the world has nothing at all there.
Section 2za covers the census, Data2D, the rebuild and the report.

**0.17.1** — Chunks in the LevelDB log are read.

The world reader only walked the `.ldb` tables. Bedrock writes new and changed
chunks to the write-ahead log (`db/*.log`) first and moves them into tables
later, so recently generated terrain — a freshly pre-generated area especially
— was missing from the map. Because LevelDB orders keys by little-endian chunk
coordinates, the chunks that were in tables were scattered across the map, and
the missing ones showed as speckle rather than as a clean edge. The log is now
parsed (32 KB blocks, CRC32C, fragmented records, a torn tail tolerated), and
every key resolves to its newest record by sequence number across tables and
log, with deletions honoured; this also fixes an older record in one table
occasionally winning over a newer one in another. The exact-ground read under
a chosen site uses the same rules. New section 2za builds a world from scratch
with a real table writer and log writer and checks all of it.

**0.17.0** — Decks bend to meet the ring, and a bridge may run at an angle.

Two faults, one shape. A viaduct's deck stopped at the first cell of whatever
district it reached, wherever that happened to be, and the track then went
looking for the ring with an L-shaped spur — onward a few cells, then a leg
off to the side. That leg is the wrong shape. A junction wants to be a single
curve: the lane arrives facing the ring and turns onto it.

So a span is a polyline now — a list of centre cells, each one step north,
south, east or west from the last — rather than a row, a direction and a
length. Straight bridges are laid exactly as before; the polyline is what lets
the other two things exist.

**Bent ends.** After the railway is laid, each end of a deck looks for a ring
within reach that is at deck level and runs straight for the width of the
carriageway. Finding one, the deck carries on past the bank and round a corner
until it stands one cell short of the track, square on, with its two lanes
straddling the crossing. Each lane then joins with one curve and no detour.
That stretch is a bridgehead, not a viaduct: no parapets, laid at street
level, and stopping flush so the ring is never paved over. Where it has
claimed ground outside the city outline it is added to the city and given a
footing down to the terrain, the way the span gets piers.

Where the ring runs alongside the deck a cell away there is no room to turn
onto it — an offset lane taken round a corner lands on the ring instead of in
front of it — so that end is left to the spur search, which is still there.

An end is only bent when it needs to be. Bending moves both lanes, and a bend
chosen to fix one lane can push the other off a join it already had: on the
256-block sites that traded four clean joins for two. So each end is asked
first whether both its lanes already face a ring square on, and left alone if
they do. Bends are therefore rare — one or two across a whole test set — and
they are the ends that had nothing better.

**Angled spans.** Two districts are not always a row or a column apart, and a
district no straight run could reach got no bridge at all — it and everything
built on it stayed off the network however big it was. When no straight
crossing exists, the span is laid as a staircase between the two nearest
banks. The deck follows the staircase, and so do both lanes: a rail cannot run
diagonally, so an angled lane is a chain of curves, boosted on its straights.
A straight crossing still wins wherever one exists.

**Four ends at once.** Which junction a lane end may use depends on what the
other three have taken, and a lane only earns its keep if both of its ends
join. They were settled one after another, so the first end could claim a
junction the second needed and push it out onto a long lateral detour — a
shape chosen for no better reason than which lane was looked at first. All
four are now costed together: most lanes joined end to end, then most ends
joined, then the tidiest shapes.

Also fixed: a parapet was built down the middle of the carriageway wherever a
deck cell had been left unpaved to spare a rail underneath it; a bend's stop
line was a half-plane across the whole city, so on a deck bent at both ends
one end quietly cut away the other's deck; and a bridgehead is now registered
in the plan as street, so the walk that proves the city is connected and the
export both see it.

Measured against 0.16.0. On the six 192-block fitted sites at two seeds: 12 of
16 lane ends joined, unchanged, but 7 straight against 6 and 5 round a corner
against 6. On the 256- and 320-block sites: 42 of 52 lane ends joined against
38, with the same 23 straight — four ends that used to reach nothing now reach
the ring, and none of the joins that were already clean were spoiled. Most of
that gain is the four-ends-at-once change rather than the bending.

The ends that still join nothing have a ring below deck level or no track
within reach. A spur cannot descend, so those want a ramped approach carrying
sloped rails, which this release does not attempt.

**0.16.0** — A viaduct carries one track rather than two half-tracks.

A bridge lays a lane down each side of its deck, and each lane has to find the
ring at both ends. Where it could not, the lane was left hanging: a cart ran
to the end of the deck and stopped. The spur added in 0.15.0 reaches further
and turns a corner to find the ring, but some ends have nothing to reach — a
deck that meets the edge of the plan, or a ring sitting below deck level.

Those lanes are now taken up. A lane is kept only if it joins a ring at both
ends; otherwise its track is removed, its booster beds are put back to gravel,
and the ring's own rail is restored to what it was where the lane had already
bent it. A deck may end up carrying a single track, which is a railway, rather
than two that each stop halfway, which is not.

This is the shape of the fix Brad made by hand: delete the lane that cannot
get there, re-point the curve, keep one route a cart can ride.

NOT in this release: deck alignment, and bridges that bend to meet the ring.
The deck is still placed on the shortest gap between districts with no regard
for where the ring runs, so the spur is still doing work that better placement
would make unnecessary.

**0.15.1** — Rails that led nowhere.

Two lines could be laid along the same ground. The main district's ring was
protected — every straight line had to keep `k + 2` clear of it — but
outlying districts have had rings of their own for a while, and nothing kept
the lines off those. On flat ground it went unnoticed, because the second line
simply wrote its rail over the first. On real ground the two are lifted to
different heights, and what was left was one railway at grade with pieces of
the other stranded in the air above it: three-block humps and closed circles
of curved track, joined to nothing, at regular intervals down a street. Across
the fitted test sites, pairs of lines sharing 297, 216 and 138 ground cells;
now at most two, which is a crossing.

Every ring is now worked out before the straight lines are picked, and no line
may be laid on one. What that does not cover is track cut after the fact — a
viaduct raised through a line already at grade, or the skirt and face cuts
taking a bite out of the city's edge — so a last pass takes up whatever is
left leading nowhere. A run is only scrap if it holds no station and no cart
and is no part of a viaduct's lane: some lines are short by design, and length
alone does not make a stub. The records are trimmed with it, so the stats, the
exported carts and the line records agree with the track on the ground; where
a lane was laid along a line already there, the older line gives up the cell
rather than both counting the same rail.

Four checks were added to hold it: no line laid along another at the same
level (a viaduct over a street railway is fine), no stub left leading nowhere,
every cell a line claims has track on it, and every viaduct joining an
outlying district to the main one rather than to another offshoot.

**0.15.0** — Two things, one of them structural.

The validator is no longer a single 3,500-line file that has to run all the
way through. The checks are 39 modules under `tools/checks/`, listed in
`tools/checks/registry.js`, and `tools/validate.js` is a runner over them:

    npm run validate              everything, as before
    npm run validate:fast         the quick sections (~35s)
    npm run validate:slow:1       first half of the heavy ones (~1m40s)
    npm run validate:slow:2       second half (~1m20s)
    npm run combine               adds the shards up
    npm run validate:list         what there is, and how long each took

Every run writes a shard to `.validate/` with its counts, its failures and its
per-section times, and `tools/combine.js` adds them into the one number that
means anything. The combiner refuses to report a pass if a section was missed,
counted twice, or measured before the newest source file changed — a green
total over two thirds of the suite is worse than no total. `--part k/n` splits
a group by measured cost; those times are only rewritten by an unsplit run, so
the boundary cannot move between part 1 and part 2.

Each section is timed and its time printed as it finishes, so a slow one shows
while the run is still going. The expensive fixtures — the ten swept cities,
the sites cut from the saved terrain, the cities fitted to them — are built
once per process in `tools/checks/fixtures.js` and shared. The bridge section
alone had been generating the same six fitted cities seven times over. The
whole suite went from about seven minutes to three and a half, and no single
command now needs more than two.

And the bridge spurs are L-shaped. A lane end used to look only straight
inward, so where the ring ran parallel and offset to one side of the deck, the
lane on that side met it immediately and the lane on the other side walked
alongside it for its whole length and found nothing — two of four lane ends
left at a buffer, a cart running to the edge of the deck and stopping. The
search now considers every corner within reach: so many blocks inward, then a
turn, with a curved rail laid at the corner and the junction curve worked out
from whichever direction the spur actually arrives rather than from the
bridge's axis. A candidate only counts if the whole spur can be built — the
way to it clear of track, and the rail it reaches lying across the approach so
there is something to curve onto — so a blocked or unturnable corner is passed
over for the next one instead of losing the end. A ring cell always beats a
stray piece of track, and no two spurs may cross or claim the same junction.

Across the fitted test sites that is 12 of 16 lane ends joined, up from 9, and
on the site the fault was found on all four now join where two did. The four
that remain are on one bridge that spans nearly the whole plan: two of its
ends sit at the edge of the plan with no railway in front of them at all, and
two have their ring two blocks below deck level, which would need the spur to
descend on sloped rails. Those are named as such in `bridge.ends` rather than
counted as joins, and the validator fails on any end that had track in front
of it and did not reach it.

**0.14.4** — The bridge junction curves the right way. A lane now looks 28
blocks inward for the ring rather than 10, and the curve it bends the ring
into is chosen by looking up which side the rest of the ring actually lies on
instead of assuming. Two of a bridge's four lane ends join on the test site,
up from one; the remaining two need an L-shaped spur, since a lane that
searches straight inward never meets a ring running parallel and offset to one
side. The validator takes a section name as an argument now, because the whole
suite has outgrown a single run in some environments.

Known: two lane ends per bridge still end at a buffer rather than joining the
ring. The full suite was last run green at 0.14.3; only the bridge junction
and the validator's argument have changed since, and both were checked
directly.

**0.14.3** — Rings follow the city's edge rather than a traced contour
wherever they can. The first thing tried is now a plain rectangle drawn inward
from the district's own bounding box until every cell of it is road — four
corners, no doubling back, the way the perimeter wall runs. Only if no
rectangle fits does the contour walk get a turn, and its result is now
refused unless no cell of it sits beside another it is not next to in the
walk. That is what produced the little circles of track: a walk running back
alongside itself. Eight test cities, ten rings, none self-touching.

**0.14.2** — The railway crosses the bridges. A rail connects in two
directions only — there is no three-way junction without a switch — so a spur
cannot tee into a ring. The bridge therefore carries **two tracks**, one each
way, and each ring is diverted into one of them: the ring's own rail at the
meeting point is bent onto the deck. What was three separate railways (ring,
bridge, ring) is now one circuit that runs round a district, crosses, runs
round the other and crosses back. On the split test site the largest
connected run of track went from a single district's ring to 1,577 rails
spanning both districts and the deck, and the validator checks exactly that.

**0.14.1** — Two faults from a build review. Knocking the school's partitions
through left the doors standing in mid-air, because a door is not a solid
block and the demolition only took solid ones; doors in a wall that comes
down now go with it, both halves. And a district ring traced round a narrow
strip walked out along one side and back along the other, leaving the two runs
side by side — track laid on that is a thicket of curves rather than a
circuit. A ring is now refused unless no cell sits beside another it is not
next to in the walk, and it encloses at least twelve blocks across; a district
that cannot be ringed keeps its straight lines.

**0.14.0** — Two things finished. The widest crossing of the canal is now a
landmark: four stone towers with lamps, an arch over the water and a
balustrade, with the deck untouched so the road and rails still cross. And
every district of any size is circled by a line of its own — an island joined
by a bridge used to be somewhere a cart arrived and stopped, and is now
somewhere it can go round, curves and all. Both are checked: a test site with
two districts gets two rings, of 24 and 25 curved rails.

**0.13.9** — A school hall is now genuinely one room. The partition that
fenced off the staircase came down, shaft and all, so both floors see the
board and the stair stands open in the corner. Where the stairs are ladders
rather than steps the shaft stays, since a ladder needs a wall to hang on —
which is exactly what the ladder-equipped test city caught.

**0.13.8** — A canal needs a straight street it can run down, and the run it
demanded — a third of the city's width, at least 24 blocks — is a lot to ask
of a city cut to real ground. On a fitted site it now settles for a fifth of
the width, at least 16. A city with no straight run at all still goes without,
which is what happens on a badly broken site.

**0.13.7** — Three fixes from a build review. Staircases that climbed nothing
are no longer cut: where the street outside had settled to the same height as
the block, a flight was still being built, standing in the road as an
ornament — 60 of 282 in one test city, and none now. Boosters are roughly
twice as dense (one every nine blocks at most, four at least, against sixteen
and six), since a cart was losing its speed between them. And bridges between
districts are seven wide rather than five: two lanes and a rail, so the loop
can run across one.

**0.13.6** — Schools are bigger and keep their field. The school now takes the
deepest lot it can find, size breaking the tie, and the field is no longer the
first thing sacrificed: the hall is given nine blocks of depth (the least that
takes rows of desks with the board down one side) and the field has what is
left, down to five. Nine of ten test schools now have a field where fitted
cities had none at all, every one has desks, and each floor keeps its own
board and lectern — the lectern slides along the board until it finds a spot
the stairs have not taken.

**0.13.5** — The school's chalkboard has moved to a side wall, and the desks
have turned a quarter to face it. The staircase stands against the wall
opposite the door, so a board there was simply hidden behind a flight of
stairs; of the two side walls the one clear of the staircase now takes it.
Moving the board rather than the stairs leaves every other building alone —
and it fixed a school whose upper floor could not be reached, since the board
is no longer competing with the stairwell for the same wall.

**0.13.4** — Schools on ground-fitted sites had lost their sports fields: the
field wanted 23 blocks of lot depth and a fitted lot is usually 22, so every
fitted city quietly dropped it. A shorter field and a slightly shallower hall
now fit in 20. Farms also carry composters in their spare corners rather than
one apiece — a composter is a farmer's workstation, and only farmers harvest
crops and hand food to their neighbours, which is what villagers need before
they will breed. A test town went from 6 composters to 11, a village to 22.
Beds were never the problem: a 224-block city has 349 of them for 60
villagers.



**0.13.3** — Cities fitted to real ground often had no curved rails at all,
and this turns out to be old rather than new: the loop is traced round a ring
of cells and only works when they sit in a tidy circuit, which a city cut to a
hillside seldom does. One spur or pinch and there was no loop — and since the
loop carries every curve, the whole city went straight. When the ring will not
trace, the edge is now walked instead, with a hand on the wall, which closes
however ragged the shape is; a walk that comes back beside its own middle is
trimmed to the circuit inside it. Twelve fitted test cities now all have a
loop with curves, where a quarter of them had none.

**0.13.2** — Outlying districts were left almost without track. Restoring the
loop in 0.13.1 measured "how far in from the edge" across the main district
only, and the ordinary lines use that same measure to decide where they may
run — so outside the main district it read as zero and no line could be laid.
There are now two measures: the whole city's, which the lines use, and the
main district's, which the loop is traced on. On the split test site the
outlying district went from 25 rails to 93, with the loop and its 38 curves
intact. The validator checks that every district of any size gets track.

**0.13.1** — A city split into districts lost its railway loop, and with it
every curved rail: the loop is traced round the city's edge, and keeping the
outlying districts (0.13.0) meant there was no longer a single edge to trace.
The loop now follows the main district — the others are reached by their
bridge, not ringed as well. On a split test site that is a 934-block loop with
38 curves where there had been none. The validator checks that a city in
pieces still has a loop and curved rails.

**0.13.0** — Long bridges join the parts of a city that the ground splits up.
Districts the outline cannot reach are kept rather than discarded, and each is
given a viaduct to the main one: deck, piers, parapets, lamps, steps at a
lower end, and rails where the city has a railway. On a split test site that
is the difference between 1 building and 49. Building them turned up three
places where a doorway could be walled in — by a bridge ramp, by the hillside
grading, and by the pavement settling a block proud of a lot — all of which
are now cleared.

**0.12.0** — The school is a hall, not a warren: two storeys, each an open
floor with a chalkboard across the wall facing the door, a lectern in front of
it and desks in rows, with the staircase against the back wall. A small school
keeps one row, and if the furniture would ever shut a floor off it is taken
out rather than leaving it unreachable. Loop boosters are spaced properly too:
a booster after a bend used to mean five in a row on an organic outline, so
they are now never closer than six blocks nor further than sixteen.

**0.11.3** — The world map zooms. Scrolling moves through seven steps from
about 3000 blocks across down to 250, keeping whatever is under the pointer in
place, with the scale written underneath; chunks are drawn several pixels
across when zoomed in, so a site can be placed precisely. Picking, the site
outline and the coordinate box all follow the zoom.

**0.11.2** — A **Name** box in the export panel. Minecraft takes a pack's name
from inside it, not from the file, so renaming the download changed nothing —
a city still appeared in the game's list as `polis_<seed>_<hash>`. A name
given now becomes the pack's name in game, the file's name, and the commands
(`/function city_12_30e8/build`), with the city's own short id kept on the end
so two packs of the same name cannot collide. Leave it blank and nothing
changes.

**0.11.1** — On a loaded world the size slider did nothing. A site is measured
as a square of ground at whatever size was set when it was picked, and the
city is fitted to that square, so moving the slider afterwards changed a
number nobody read. The slider now measures the ground again about the same
centre, and the headless check moves it and fails if the site does not follow.

**0.11.0** — Bedrock sites are read from the blocks rather than the heightmap.
The heightmap counts treetops, and the filter that removes them was flattening
real ground with them; now the subchunk records are decoded for the chosen
site and the ground is the first real block down each column — trees and
ground cover passed over, water known rather than guessed from its height. It
takes about a second per site, so the map still uses heightmaps for speed. On
a wooded site it moved the base level two blocks and recovered detail the
filter had smoothed away.

**0.10.3** — The village style is rustier. Cottages stand on a course of
cobble, their corners are solid log posts rather than alternating quoins, and
the roofs hang a block further out over the walls, the way the game's own
village houses do; the town-ish details (pilasters, balconies, bay windows)
are left off. Villages also sit on rolling ground by default, and the clock
tower at the middle is built of stone rather than plaster, which gives the
village its one all-stone building.

**0.10.2** — Trams laid on a village's streets were destroying themselves. A
rail needs a whole block beneath it, and a village's streets are dirt paths,
which will not hold one — the track popped off as it was placed, leaving only
the boosters on their blocks of redstone. Track is now given a bed of ballast
wherever what is under it cannot hold it (dirt path, farmland, a slab, snow),
and the validator checks every style and both kinds of line.

**0.10.1** — A **Village** style, after the villages the game builds itself:
oak and spruce, white plaster between the timbers, cobble footings, hay roofs,
dirt paths and lantern posts. It is low by nature — cottages of one or two
storeys with the odd three-storey inn or granary, and no towers — while the
landmarks still rise above it, so a village keeps its church tower and its
clock. It works more ground too, with farms and animal pens more common than
in a town, unless those sliders have been moved deliberately.

**0.10.0** — Five new landmarks: a town square with a fountain, benches and
market stalls; a stadium with terraced seating, goals, floodlights and a
players' tunnel; a cemetery with a lych gate and rows of headstones;
allotments of watered plots with a shed and compost heap; and a bandstand. The
nine older landmarks still appear wherever they fit; the new ones are rationed
to about a sixth of a city's lots, so a small town keeps its buildings (they
take the big lots, and without the limit the rooms-per-building ratio fell from
68% to 57%). Every point a landmark records now rides up with its terrace,
which the new ones exposed.

**0.9.5** — Cuts into a hillside are graded, not just walled. The wall added in
0.9.3 only covered the bottom block of the cut and left the hill behind it as a
raw dirt face; the ground outside the city now steps up a block per cell until
it meets the real hillside, keeping the surface the land had, with a low wall
at the city's edge. On a hilly site that is nearly 900 cells of graded slope,
of which a dozen or so remain imperfect where two slopes meet against a cliff.

**0.9.4** — A line at the foot of the panel and at the top of this file:
created with help from Claude AI.

**0.9.3** — Cuts into a hillside are faced with a retaining wall instead of
showing raw dirt and stone, and the export leaves the land behind those walls
alone (75 to 190 cells of wall on a hilly site). A compactness rule was tried
and dropped: measuring showed fitted outlines are already solid blobs, and
what looks like sprawl is unexplored ground, so the rule earned nothing — and
while it was in, it had been applied to the wrong outline and was quietly
reshaping every ordinary city.

**0.9.2** — Both teleport buttons copied the centre. The corner button handed
its function straight to the click listener, so the click event arrived where
the "centred" flag was expected — and an event object is truthy, so every
click took the centred branch. The headless front-end check now presses both
buttons against a generated world and fails if they copy the same command.

**0.9.1** — The railway's corners came apart on fitted ground. A corner has to
be a curved rail and a climbing rail has to be straight, so where a line
turned on a step the corner became a climb and the track stopped connecting.
The line is now settled before the climbing rails go in: corners are levelled
flat with both neighbours, no step is left taller than one block, and the two
rules settle together (always downward, so neighbouring corners cannot pull
one another about); loops wrap, so their ends count as neighbours. Two smaller
faults fell out of it: a support block could be laid over a rail (rails count
as passable) and track could be dropped on top of another line.

**0.9.1** — The railway's corners came apart on fitted ground. A corner has to
be a curved rail and a climbing rail has to be straight, so where a line
turned on a step the corner was turned into a climb and the track stopped
connecting — visible as broken corners on the loop. The track is now settled
before the climbing rails go in: a corner is levelled flat with both its
neighbours, no step is left taller than one block, and the two rules are
settled together (always downward, so neighbouring corners cannot pull one
another about). Loops wrap, so their first and last cells count as neighbours.

**0.9.0** — Terrain fitting for Java worlds. Zip a world folder from `saves`
and load it like a `.mcworld`: Polis works out which edition it is and reads
Anvil region files — sector header, zlib or gzip chunks, big-endian NBT, and
heightmaps packed nine bits to a value — giving the same heightmap the Bedrock
reader produces, so site picking and fitting are unchanged. Tested against a
region file written in Java's own format by `tools/make-java-world.mjs`, with
a fitted city generated from it.

**0.8.7** — Only part of a big Java city appeared. A piece placed into a chunk
the game has not loaded is silently dropped, and a city is far wider than the
loaded area round the player — a 352-block city is 22 chunks across. The build
function now forceloads the ground first, in rectangles small enough to stay
under the 256-chunk limit for one command even when standing mid-chunk, and
releases them when it is done. This is the Java counterpart of the ticking
areas the Bedrock pack has always used.

**0.8.6** — Java packs can be made in the app: an Edition choice in the export
panel, and a datapack export with the structures, a build function and a
readme. The headless front-end check now presses both export buttons and fails
if either produces no file (which caught the version guard blocking exports in
the stub browser).

**0.8.5** — Railway bridges were laid on a bed of gravel with nothing under
them. Gravel falls, so in Java the deck dropped into the canal the moment it
was placed and the track went with it (and it was fragile on Bedrock too —
those were the "messed up" spots). A last pass before export now swaps any
gravel or sand that would fall for stone, and gives any unsupported rail a
footing: 13 to 40 blocks per city. Both editions benefit. The validator fails
if a city contains a falling block with space under it or a rail with nothing
beneath it.

**0.8.4** — Two more from building in Java. The air that clears the old
landscape was written from the bottom of the city box upward, which hollowed
out the ground beneath the town and left openings wherever the surface broke —
by the canal, at the bridges, along the rails. Clearing now stops at each
column's lowest block and the ground below it is filled, as it is on Bedrock.
And boats were placed in the block of water they sit in rather than on its
surface, so they started underwater and could not be boarded.

**0.8.3** — Java cities are populated: villagers, golems, cats, pandas, farm
animals, paintings, minecarts and boats ride along in the structures, written
directly as Java NBT. Each one lands in exactly one piece. Java villagers come
unemployed and take the jobs the city provides, since Java generates trades
itself.

**0.8.2** — Java signs read as words again. Up to 1.20.4 a sign's lines were
JSON strings; from 1.20.5 they are text components, where a plain string is
simply the words — so the JSON went on the sign verbatim, braces and all.
Lines are written plain, and the validator fails if one starts to look like
JSON.

**0.8.1** — Two fixes from the first Java build in game. Doors were a
quarter-turn out: Bedrock stores a door's direction rotated from Java's (their
own mapping table has java `facing=north` as bedrock `east`), and the
translation passed it straight through — the mirror image of the very first
Bedrock bug. And a Java structure places only the blocks it lists, so the old
landscape stayed standing inside the city; air is now written over every city
column up to its roof plus the clearance. The validator checks both.

**0.8.0** — The beginnings of Java Edition support: a block translation layer
checked against Java's own block definitions, a big-endian NBT writer, Java
structures cut to the 48-block limit, and a datapack that places them with
`/place template`. Signs carry their text as Java writes it. The validator
gains a Java section that reads a finished structure back.

**0.7.4** — Fitted cities can be placed from the centre as well as the corner:
a button for each spot, and the pack's guide gives both. This also fixes a
real misalignment — the corner spot was given as the corner of the *site*, but
`build` lines up the first block of the city, which is wherever its outline
begins (23 blocks in, on the test site), so fitted cities were landing offset
from the ground they were shaped to fit. The validator now checks that both
placements land in the same place, and on the fitted ground.

**0.7.3** — Clear above ground is respected on fitted sites again. Carving per
column (0.7.0) cleared only a block above each column's own roof and ignored
the setting, so hillsides overhung the streets and trees were left floating
where their trunks had been cut. Clearing now goes by the setting, and by the
raw heightmap rather than the tree-filtered one. The validator checks that
raising the setting clears more.

**0.7.2** — The preview draws the real terrain around a fitted city, so how it
sits in the land can be judged in the browser instead of in the game. The land
is preview-only: the validator checks it never reaches the export.

**0.7.1** — The railway on rolling ground. Its records were left at the flat
height when the city rode up with the land, so carts and stations were placed
in the wrong place; every cell, station and cart now moves with its own
column. Where the street steps, the rail becomes a climbing rail so a cart can
ride it, two blocks of headroom are cleared over every rail (no more breaking
blocks to get through), and a booster whose block of redstone would show at
the side of a step becomes a plain rail on ordinary ground. The city edge also
grows a skirt: where the surface stands proud of a falling hillside, the
ground steps down a block per cell until it meets the land, and those cells
are built with the city.

**0.7.0** — A fitted city now follows the ground properly. The whole surface
rolls cell by cell rather than sitting flat on one plane: no step taller than
a block anywhere, every lot flat under its building, and the canal and harbour
levelled as units so water cannot slope. Most of the city lands within two
blocks of the real terrain. The export no longer carves a box out of the
world — each column is cleared only to its own roof or the ground that was
there, and founded only down to that ground, which cut the terrain removed
from 1.5 million cells to 400 thousand on a test site.

**0.6.4** — A button that copies `/tp <x> <y> <z>` for the exact block to
build from, so the spot can be reached by pasting rather than walking. The
button shows the command on its face and the toast repeats it.

**0.6.3** — The site panel said "Site at X, Z" without saying that those were
the north-west corner, which read like the centre. It now gives the centre,
and says plainly where to stand (the corner, one block above base level) and
that a fitted city is placed with `build`, never `build_centered` — the
centred version would drop it half a city away from the ground it was shaped
to fit. The placement guide in the pack says the same.

**0.6.2** — Pick a site anywhere: type coordinates (F3 positions paste
straight in) as well as clicking the map, and the whole world is read at once
instead of only the chunks around spawn. A site no longer has to be fully
explored: unexplored ground is left alone like water or a cliff, and the city
fits itself to what is known, so a 60%-explored area can still take a city (it
just builds a smaller one).

**0.6.1** — Clicking the world map did nothing: the click handler called a
helper that only existed inside another function, so it threw on every click.
Fixed, and any failure in that panel now says so instead of failing silently.
Added `tools/ui-check.mjs`, which boots the real front end against a stub
browser (elements for every id, a canvas, a mock WebGL context), presses the
buttons and loads a world through the app's own code — run it with a
`.mcworld` path to exercise the whole flow. The validator runs it on every
pass, so a broken button or an out-of-scope helper is caught like any other
bug.

**0.6.0** — Polis can read your world. A `.mcworld` is unzipped and its
LevelDB tables read in the browser (zip, LevelDB and DEFLATE all written from
scratch), giving the terrain height and biome of every chunk you have visited.
Pick a site on the map and the city is fitted to the real ground: the outline
keeps off water and cliffs, the terraces follow the land, and the foundation
and clearance adjust to the site. The validator adds a section that generates
cities on real terrain from a saved world.

**0.5.2** — Real paintings on the walls, from a structure saved in game:
eleven motifs in four sizes, hung at eye level on clear wall after the
furniture is placed, one or two per room and at most eight per building. They
travel in the mob structures like the villagers. The validator checks every
painting has solid wall behind it, clear space in front, faces into its room
and is centred to match its motif's size.

**0.5.1** — Boats are summoned by `populate`, with the rest of the population.
They had their own function, which runs after `populate` releases the ticking
areas, so only boats near the player appeared and the harbour's were silently
lost. The standalone `boats` function stays as a fallback for any that miss.

**0.5.0** — A harbour district on the canal: basin, quay with bollards, crates
and cranes, warehouses, a goods yard with buffered rail sidings and parked
carts, moored boats and a name sign. It is reserved at planning time, stays
inside the block beside the canal and keeps its ground level. Fixes found while
building it: the terrace fill ignored per-cell levelling and buried the
waterfront; street lamps could be planted in a doorway (anywhere in the city,
not just here); the goods yard needed its own land use so the railway would not
route a main line through it. The validator adds a harbour section.

**0.4.2** — Street signs appear at every street width. Streets were named by
width (5 or wider), so at the narrowest settings nothing was named and no signs
appeared at all; naming now follows what a corridor *is* — a street or an alley
— which also raises the count at the usual widths (about 40 per city instead of
8). Numbered avenues one way, tree names the other, with compass prefixes past
the end of the lists so names never repeat. The validator checks every street
width.

**0.4.1** — The centre marker is now a monument from a structure saved in
game: diamond, with an alcove you stand in, the name sign above its entrance
and beacons whose beams shoot into the sky. build_centered still centres the
city on the alcove, and the monument turns to face the nearest street. The
validator checks the alcove, the beacons (block entities and open sky above),
the sign, and that the centred build lands you inside.

**0.4.0** — Detail on the outside of every building (quoins, pilasters, eaves,
framed doorways, balconies, bay windows, chimneys, water tanks, vents);
shopfronts at street level with glass, awnings, counters and named wall signs;
street names on signs at the junctions; a mansion landmark with wings, portico,
hedged grounds and a formal garden; cities up to 512 blocks (a 512 city
generates in about five seconds and exports in three). Pen animals are
re-checked at the end, in case a neighbour's tree grew over the fence. The
validator adds facade, shopfront, street-name and mansion checks.

**0.3.5** — The spot you build from is marked: a gold block with clear space
above, a sign beside it and a lantern opposite, placed near the middle of the
city (outdoors, level, off the railway). `build_centered` now centres on that
block, so it lands under your feet. The validator checks the marker, its sign
and that the centred build puts it exactly there.

**0.3.4** — The school's rooftop SCHOOL board is gone; instead every
landmark has a small standing name sign by its front door, facing the street.
Signs are written as block entities laid out exactly as Bedrock saves them (checked field
by field against signs saved in game). The validator checks each landmark's sign (name, facing, beside
but never on the door path) and that sign text reaches the structure files.

**0.3.3** — Villagers at every level: most start with a trade, from novice
to master, using the trade tables of villagers saved in game. The school is a
proper landmark: three storeys on a bigger lot, covered porch, SCHOOL sign on
the roof, bell cupola, flagpole, fenced sports field with goals where the lot
allows, and classrooms with rows of desks and chairs facing the lectern (desks
are removed before a room would ever be given up). Landmark heights now include
what stands on their roofs. The validator adds the school's porch, sign (read
back letter by letter), cupola, field and desk rows, and villager levels and
experience.

**0.3.2** — Canal with bridges, embankments, railings, a dock and boats;
four new landmarks (church, school, lighthouse, castle on the highest hill);
glazed-terracotta art panels on inside walls. Light grey glazed terracotta is
`silver_glazed_terracotta` in Bedrock. Landmark positions recorded for checks
now move up with their terrace. The validator adds the canal (water levels, bridges, open water,
distance from the wall), dock reachability and boats, art panel shape, and each
new landmark's defining features.

**0.3.1** — Terrace steps face the street. They used to climb along the kerb,
side-on to anyone arriving from the street; now they climb straight in from
the street (about nine in ten), cut into the sidewalk, and only run along the
kerb where a straight flight will not fit. The validator checks every step
faces the way its staircase climbs and that straight flights face the street.

**0.3.0** — Real rooms: corridors, inside walls and doors; apartments
(kitchen + bedroom), studios, shops, offices, kitchens, living rooms and
bedrooms, each furnished along its own walls with its key piece first and a
ceiling light; libraries get freestanding shelf rows. Switchback stairs sit
against the back wall when they can. Farm animals now travel in mob structures
from in-game templates (cows, pigs, chickens, white and light-grey sheep), so
nothing but minecarts is summoned. Park trees keep clear of panda groves. The
validator adds a rooms section: every room is reachable from the front door
without a hop, inside walls run floor to ceiling, doors are two high with wall
above, nothing blocks a doorway, every bedroom has a bed and every kitchen a
stove or crafting table, and every room is lit.

**0.2.9** — Animal pens are guaranteed: at least four per city (one of each
farm animal), placed on the outermost lots, with four to ten animals each.
Pens had been a random roll on suburban house lots after farms, and the
organic outline (0.2.6) removes many of those, so most cities ended up with
none or one. The validator checks every style for at least four pens with all
four animals.

**0.2.8** — No more hop at the top of the stairs. Switchback flights had one
step too few: the top step stopped a block below the floor above, so the last
move was up onto a full block. Each flight now has one step per block of
height, the top step set into the floor above, level with it. The validator
adds a no-hop walk (stepping up only onto stair blocks, as in game) through
every floor of every building and from the streets to every door; the old
flights fail it, the new ones pass.

**0.2.7** — City styles: Modern, Desert, Snowy, Cherry blossom and Medieval,
each with its own building palettes, landmarks, ground, roads, trees, flowers,
lamps and wall; snow cover and cacti where they belong. More iron golems: a
**Golems per 10 villagers** slider (default 3, was about 1 per 8) with the cap
raised to 60. Materials now carry roles so styles can restyle roads, ground and
lamps independently of walls built from the same block; the structure writer
still gives identical blocks one palette entry. The validator checks every style for reachable floors and doors, fully replaced
materials, plants on valid soil, cacti and snow.

**0.2.6** — Organic outline and gentle hills. The city now keeps only the
blocks inside a lobed shape (the **Outline** setting can switch back to
Square); the wall and the rail loop follow the new edge, the loop now built
along a contour so it works for any shape, and land outside the outline is
left untouched on export. **Hills** raise city blocks 0–3 blocks on terraces
with staircases up from every side; streets stay level. A new city-wide walk
checks every door is reachable from the streets. Animal pen and panda grove
fences are now two blocks high, with hay and troughs kept clear of the fence
line. Road centre lines no longer run past the outline. The validator adds the
outline and hills checks; its walk-through block list now comes from the
registry, so new plants cannot be missed.

**0.2.5** — Landmarks: town hall (colonnade, copper dome, the village bell),
clock tower (four clock faces, belfry, spire), library, and market square,
placed on the lots nearest downtown. The validator checks all four appear once each, near
downtown, that every clock face reads correctly from outside, that the market
stalls are complete, and that every landmark floor is reachable.

**0.2.4** — Animals and block variety. Animal pens with cows, sheep, pigs
and chickens (summoned); panda groves in parks and cats on the streets (in mob
structures, from in-game templates with no owner or village link). New blocks:
lecterns, smokers, stonecutters, looms, grindstones, smithing tables (every
profession now has a workstation), chests, lanterns, hay, oak fences and fence
gates, bamboo, potatoes, and five more flowers. Every new block and state was
checked against Bedrock's 1.21.60 state list, and every orientation against
Bedrock's own mapping table (fence gates, chests, lecterns, smokers and
stonecutters face directly; looms and grindstones use the old numbering). The validator checks the pens, groves and
workstations, and places every cat and panda in the population simulation.

**0.2.3** — Foundations for uneven ground: **Foundation depth** (solid
stone under the city, stone-brick retaining face) and **Clear above ground**
(removes hills inside the city), both at export time. Gate fix: on a 3-wide
ring road the loop track runs right behind the wall and 0.2.2 refused to open
a door onto it, silently dropping every gate; gates now open onto walkable
track and slide along the wall if the middle is blocked. The city id now also
covers air fill, foundation and clearance. The validator adds the foundation checks and gate
checks across every size and street width, and reruns the population
simulation on a founded, cleared city.

**0.2.2** — Perimeter wall (default 3 high, 0–8) with a double-door gate on
each side, so surrounding water can no longer flood the city. On railway
cities the ring road's four lines are now one closed loop with curved rails at
the corners and boosters either side, so carts can go round without stopping.
Curve rail directions were confirmed against Bedrock's own table. The validator
checks that the wall is water-tight all the way round, that the gates are proper double doors, and that there is
exactly one loop with the right curves; the side-touch rule now handles curves.

**0.2.1** — Exported files are named with underscores, matching the city id
used in game: `polis_<seed>_<hash>_v<version>.mcpack` (was dashes).

**0.2.0** — Population fixed. Villagers and iron golems now travel inside
entity-only structures instead of being summoned, because `/summon` only works
in simulated chunks and placed just the few mobs near the player. The entity
templates come from a real structure saved in Bedrock 26.x
(`tools/extract-templates.js` → `engine/entity-templates.js`); each villager is
reset to a fresh unemployed adult with no village, trades or inventory. `build`
adds ticking areas (each ≤ 144 blocks, well inside the 100-chunk limit) so the
minecart summons in `populate` reach the whole railway; `populate` removes
them. Structures now record their true world origin, as game-saved ones do.
The NBT writer gained long, double and array tags; it reproduces the in-game
file tag for tag (168,739 tags, zero differences). The validator now places
the city and mob structures from off-centre positions and checks that every
villager and golem lands on a floor with room to stand.

**0.1.9** — Doors fixed properly. Bedrock stores a door's facing in
`minecraft:cardinal_direction` rotated a quarter turn (a door facing north is
stored as `east`), per Bedrock's own Java-to-Bedrock table, which is now
vendored in `tools/bedrock-states.json`. 0.1.7–0.1.8 wrote the facing
unrotated, which split double doors onto opposite edges of their blocks.
Double doors also now put their hinges on the outer edges for every street
direction. The validator checks door facing against the table and every
double door's facing and hinges.

**0.1.8** — Villagers are summoned as `minecraft:villager`. 0.1.5–0.1.7 used
the internal id `minecraft:villager_v2`, which the command parser in current
Bedrock rejects. Because one unparseable line makes Bedrock drop the whole
function file, `populate` never loaded at all. There are now also per-kind
fallback functions (`villagers`, `golems`, `minecarts`, each with a
`_centered` twin), so if any one entity name is ever rejected again, the
others still load.

**0.1.7** — Railways: a **Streets** setting with Roads, Railways (no roads)
and Roads + tram rails; grade-separated lines with bridges over every
crossing; permanently powered boosters and shuttle stations; one minecart per
line, summoned by `populate`.

Block correctness: `tools/bedrock-states.json` now vendors Bedrock's own
list of every valid block state at 1.21.60 (from PrismarineJS minecraft-data),
and the validator checks every block Polis can write against it. That caught
two long-standing bugs. **Doors** were written with the old numeric `direction`
state, which is not valid at 1.21.60; they now use `minecraft:cardinal_direction`.
The game had been falling back to a default facing, which is why they still
worked. **Quartz blocks** were missing `pillar_axis`. Bed, stair and rail
orientations are now confirmed against Bedrock's Java-to-Bedrock tables, and
furnaces no longer need a special version tag.

**0.1.6** — The Polis version is now part of the city id, so packs made by
different versions never share a namespace. In 0.1.5 an unchanged city got
the same id as its 0.1.4 pack, and if both were active Bedrock used the older
one, which had no `populate` function. The app now detects stale cached files
and blocks export until a hard refresh. New `tools/serve.js` serves with
caching off. The guide lists all four functions. The validator checks that every
version stamp agrees and that every function command is one of the known-good
forms, because one bad line makes Bedrock drop the whole function.

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

