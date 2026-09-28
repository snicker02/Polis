import * as runner from "./runner.js";
import { buildJob, parseArgs, parseCoord, toInt } from "./jobs.js";
import { normRect } from "./geometry.js";
import { say } from "./log.js";
import { openMenu } from "./ui.js";
import { runDiag } from "./diag.js";

const HELP = [
  "§bChunk Pregen§r commands (all via /scriptevent):",
  "pregen:menu  form UI",
  "pregen:area <x1> <z1> <x2> <z2> [dim=overworld|nether|end] [budget=1000] [timeout=60]",
  "pregen:walk <x1> <z1> <x2> <z2> [step=128] [y=200] [gm=spectator|creative] [maxdwell=20]",
  "pregen:radius <area|walk> <blocks> [cx= cz=] [same options]",
  "pregen:status | pause | resume | stop | diag",
  "Coordinates accept ~ and ~N. mark=off skips the save marker. pregen:diag tests ticking-area creation.",
].join("\n");

export function handleScriptEvent(ev) {
  const sub = String(ev.id).split(":")[1]?.toLowerCase();
  const src = ev.sourceEntity;
  const player = src?.typeId === "minecraft:player" ? src : undefined;
  try {
    run(sub, parseArgs(ev.message), player, src);
  } catch (e) {
    say(`§c${e?.message ?? e}`, player);
  }
}

function run(sub, { pos, opts }, player, src) {
  const loc = src?.location;
  const srcDim = src?.dimension?.id;

  switch (sub) {
    case "area":
    case "walk": {
      if (pos.length < 4) throw new Error(`Usage: /scriptevent pregen:${sub} <x1> <z1> <x2> <z2> [options]`);
      const rect = normRect(
        parseCoord(pos[0], loc?.x, "x1"), parseCoord(pos[1], loc?.z, "z1"),
        parseCoord(pos[2], loc?.x, "x2"), parseCoord(pos[3], loc?.z, "z2"));
      runner.start(buildJob(sub, rect, opts, player, srcDim), player);
      return;
    }
    case "radius": {
      const mode = String(pos[0] ?? "").toLowerCase();
      if (mode !== "area" && mode !== "walk") throw new Error("Usage: /scriptevent pregen:radius <area|walk> <blocks>");
      const r = toInt(pos[1], "radius");
      if (r <= 0) throw new Error("radius must be positive");
      const cx = opts.cx !== undefined ? toInt(opts.cx, "cx") : loc ? Math.floor(loc.x) : undefined;
      const cz = opts.cz !== undefined ? toInt(opts.cz, "cz") : loc ? Math.floor(loc.z) : undefined;
      if (cx === undefined || cz === undefined) throw new Error("No position to center on; pass cx= and cz=");
      runner.start(buildJob(mode, normRect(cx - r, cz - r, cx + r, cz + r), opts, player, srcDim), player);
      return;
    }
    case "status": say(runner.statusText(), player); return;
    case "pause": runner.pause("paused by command", player); return;
    case "resume": runner.resume(player); return;
    case "stop": runner.stop({ player }); return;
    case "diag": runDiag(player, srcDim); return;
    case "menu":
      if (!player) throw new Error("The menu must be opened by a player");
      openMenu(player);
      return;
    default: say(HELP, player);
  }
}
