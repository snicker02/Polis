// /scriptevent pregen:diag: reports which ticking-area backend is active and tries a 1-chunk test area.
import { world } from "@minecraft/server";
import { getManager, makeBackend, backendName, errText } from "./areaMode.js";
import { probeY } from "./chunks.js";
import { say } from "./log.js";

export function runDiag(player, srcDimId) {
  const dim = player?.dimension ?? world.getDimension(srcDimId ?? "minecraft:overworld");
  const lines = [`Ticking-area backend: ${backendName()}`];
  const tam = getManager();
  if (tam) {
    try { lines.push(`Pack chunk budget: ${tam.chunkCount} in use of ${tam.maxChunkCount}`); }
    catch (e) { lines.push(`Budget unreadable: ${errText(e)}`); }
  }
  const loc = player?.location ?? { x: 0, z: 0 };
  const x = Math.floor(loc.x / 16) * 16, z = Math.floor(loc.z / 16) * 16, y = probeY(dim);
  const b = makeBackend(dim);
  b.beginBatch();
  const err = b.add("diag", { x, y, z }, { x: x + 15, y, z: z + 15 });
  lines.push(err ? `Test area: §cFAILED§r: ${err}` : "Test area: §acreated OK§r (removed again)");
  b.remove("diag");
  say(lines.join("\n"), player);
}
