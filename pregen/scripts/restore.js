// Remembers where a walking player started so they can be put back afterwards,
// even if they were offline when the job ended.
import { world } from "@minecraft/server";
import { runCmd } from "./cmd.js";

const KEY = "pregen:restore";
const MODES = ["survival", "creative", "adventure", "spectator"];

export function captureRestore(player) {
  const l = player.location;
  let gm = "survival";
  try { gm = String(player.getGameMode()).toLowerCase(); } catch { /* keep default */ }
  return {
    name: player.name,
    x: l.x, y: l.y, z: l.z,
    dim: player.dimension.id,
    gm: MODES.includes(gm) ? gm : "survival",
  };
}

export function applyRestore(player, r) {
  if (!r) return;
  try { player.teleport({ x: r.x, y: r.y, z: r.z }, { dimension: world.getDimension(r.dim) }); } catch { /* ignore */ }
  runCmd(player, `gamemode ${r.gm} @s`);
}

export function deferRestore(r) {
  if (!r) return;
  try { world.setDynamicProperty(KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

export function applyDeferredRestore(player) {
  try {
    const s = world.getDynamicProperty(KEY);
    if (typeof s !== "string") return false;
    const r = JSON.parse(s);
    if (r.name !== player.name) return false;
    applyRestore(player, r);
    world.setDynamicProperty(KEY, undefined);
    return true;
  } catch {
    return false;
  }
}
