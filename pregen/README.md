# Chunk Pregen v1.2.0 (Minecraft Bedrock behavior pack)

Generates every chunk in a region so you don't have to fly it.

## Which file
- **chunk-pregen-v1.2.0.mcpack**: Bedrock **26.10 or newer**. Area mode uses the Script API's own
  ticking areas, a per-pack chunk budget that doesn't touch the world's 10 /tickingarea slots.
- **chunk-pregen-v1.2.0-legacy.mcpack**: Bedrock 1.21.90 to 26.0x. Area mode uses the /tickingarea
  command (10 slots x 100 chunks per world).
Install one, not both. If the regular pack does nothing at all (not even /scriptevent pregen:help),
your game is older than 26.10: use the legacy one.

Enable it in the world's Behavior Packs and turn **Cheats on** (needed for /scriptevent).

## Why chunks are marked
Bedrock only writes a chunk to disk if it changed since it was generated; an untouched
chunk is dropped and regenerated from the seed on the next visit. Loading chunks alone
therefore leaves them out of the save file, so external tools (world maps, Polis) don't
see them. While each chunk is loaded, the pack flips one block at the top of the world
and immediately puts it back (air at the build limit via structure_void; the Nether's
bedrock roof via barrier). The chunk counts as modified and is saved; the world is
unchanged. `mark=off` skips this.

## Modes
**area**: force-loads the region batch by batch. Fastest; you can stand anywhere.
**walk**: teleports you in a snake path (spectator by default) and waits for chunks at each stop.
Slower, but a map in your main hand or offhand fills in. You're returned to your start
position and game mode afterwards.

## Commands
```
/scriptevent pregen:menu
/scriptevent pregen:area -2000 -2000 2000 2000
/scriptevent pregen:radius area 1500
/scriptevent pregen:walk ~-1000 ~-1000 ~1000 ~1000 step=64
/scriptevent pregen:status | pause | resume | stop | diag | help
```
Both modes: `mark=on|off` (default on).
Area options: `dim=` `budget=` (max chunks loaded per batch, default 1000; capped by the pack budget)
`timeout=` (seconds per batch, default 60) `tile=`
Walk options: `step=` (default 128) `y=` `gm=spectator|creative` `dwell=` `maxdwell=`

`pregen:diag` shows which backend is active, the pack's chunk budget, and tries a 1-chunk test area,
printing the exact error if it fails.

Jobs are saved in the world. Closing the world pauses; `pregen:resume` continues.
