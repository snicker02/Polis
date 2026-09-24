# Polis v0.11.3

*Created with help from Claude AI.*

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
    validate.js          headless test harness
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
npm run validate                 # node tools/validate.js
```

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
Bedrock, `db/*.ldb` are LevelDB tables holding a record per chunk; for Java,
`region/*.mca` are Anvil region files, each holding up to 1024 chunks behind a
sector header, with the ground heights packed nine bits at a time into longs
in `Heightmaps.WORLD_SURFACE`. Both are read here in plain JavaScript —
LevelDB, Anvil, zip, gzip and DEFLATE all written from scratch — and both come
out as the same heightmap, so everything after that is shared.

The Bedrock path in detail: a `.mcworld` is a zip, and inside it `db/*.ldb` are
LevelDB tables holding a record per chunk. Polis unzips, walks the tables and
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
- **School** — three storeys, set back behind a front yard: a covered porch
  over the entrance, a bell cupola, a flagpole, and — on a lot deep enough — a fenced sports
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

