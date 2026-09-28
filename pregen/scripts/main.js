// Chunk Pregen v1.0.0: entry point. Wires events and the job tick loop.
import { world, system } from "@minecraft/server";
import { handleScriptEvent } from "./commands.js";
import * as runner from "./runner.js";
import { applyDeferredRestore } from "./restore.js";

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  try { handleScriptEvent(ev); } catch (e) { console.warn(`[pregen] ${e}`); }
}, { namespaces: ["pregen"] });

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  runner.init();
  system.runInterval(() => runner.tick(system.currentTick), runner.TICK_INTERVAL);
}

// Script API 2.x runs in early-execution mode: touch the world only after it has loaded.
if (world.afterEvents.worldLoad) world.afterEvents.worldLoad.subscribe(boot);
else system.run(boot);

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  system.runTimeout(() => {
    try {
      applyDeferredRestore(player);
      runner.notifySpawn(player);
    } catch { /* player left again */ }
  }, 40);
});
