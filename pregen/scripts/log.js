import { world } from "@minecraft/server";

const PREFIX = "§b[pregen]§r ";

export function say(msg, target) {
  try { (target ?? world).sendMessage(PREFIX + msg); } catch { /* player gone */ }
}

export function actionBar(text) {
  for (const p of world.getAllPlayers()) {
    try { p.onScreenDisplay.setActionBar(text); } catch { /* ignore */ }
  }
}

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
