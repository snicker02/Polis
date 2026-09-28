// Argument parsing and job construction shared by chat commands and the form UI.
import { chunkRect, chunkCount, walkGrid } from "./geometry.js";
import { captureRestore } from "./restore.js";

const DIMS = {
  overworld: "minecraft:overworld",
  nether: "minecraft:nether",
  end: "minecraft:the_end",
  the_end: "minecraft:the_end",
};

export function resolveDim(v) {
  if (v === undefined) return undefined;
  const k = String(v).toLowerCase().replace(/^minecraft:/, "");
  if (!DIMS[k]) throw new Error(`Unknown dimension "${v}" (use overworld, nether or end)`);
  return DIMS[k];
}

export function toInt(v, name = "value") {
  const n = Number(v);
  if (v === "" || v === undefined || !Number.isFinite(n)) throw new Error(`${name}: "${v}" is not a number`);
  return Math.floor(n);
}

// Accepts absolute numbers, "~" and "~N" relative to base.
export function parseCoord(v, base, name) {
  if (v === undefined || v === "") throw new Error(`Missing ${name}`);
  if (v.startsWith("~")) {
    if (base === undefined) throw new Error(`"~" needs a player to be relative to`);
    const rest = v.slice(1);
    return Math.floor(base) + (rest ? toInt(rest, name) : 0);
  }
  return toInt(v, name);
}

function intOpt(o, key, def, min, max) {
  if (o[key] === undefined) return def;
  const n = toInt(o[key], key);
  if (n < min || n > max) throw new Error(`${key} must be between ${min} and ${max}`);
  return n;
}

function secOpt(o, key, defSec, min, max) {
  if (o[key] === undefined) return Math.round(defSec * 20);
  const n = Number(o[key]);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${key} must be ${min}–${max} seconds`);
  return Math.round(n * 20);
}

export function parseArgs(message) {
  const pos = [];
  const opts = {};
  for (const tok of String(message ?? "").trim().split(/\s+/).filter(Boolean)) {
    const eq = tok.indexOf("=");
    if (eq > 0) opts[tok.slice(0, eq).toLowerCase()] = tok.slice(eq + 1);
    else pos.push(tok);
  }
  return { pos, opts };
}

function boolOpt(o, key, def) {
  if (o[key] === undefined) return def;
  const v = String(o[key]).toLowerCase();
  if (["on", "true", "1", "yes"].includes(v)) return true;
  if (["off", "false", "0", "no"].includes(v)) return false;
  throw new Error(`${key} must be on or off`);
}

export function buildJob(mode, rect, o, player, fallbackDim) {
  const mark = boolOpt(o, "mark", true);
  const base = { mode, rect, index: 0, done: 0, skipped: 0, activeTicks: 0, paused: true, pauseReason: "new" };

  if (mode === "area") {
    const dim = resolveDim(o.dim) ?? fallbackDim ?? "minecraft:overworld";
    const opts = {
      tile: intOpt(o, "tile", 10, 1, 32),
      budget: intOpt(o, "budget", 1000, 1, 20000),
      timeout: secOpt(o, "timeout", 60, 5, 600),
      settle: secOpt(o, "settle", 1, 0, 30),
      mark,
    };
    return { ...base, dim, opts, total: chunkCount(chunkRect(rect)) };
  }

  if (mode === "walk") {
    if (!player) throw new Error("Walk mode must be started by a player (run the command from chat)");
    const gm = String(o.gm ?? o.gamemode ?? "spectator").toLowerCase();
    if (gm !== "spectator" && gm !== "creative") throw new Error("gm must be spectator or creative");
    const dim = resolveDim(o.dim) ?? player.dimension.id;
    const opts = {
      step: intOpt(o, "step", 128, 16, 512),
      y: o.y === undefined ? null : intOpt(o, "y", 200, -64, 319),
      gamemode: gm,
      minDwell: secOpt(o, "dwell", 0.5, 0, 30),
      maxDwell: secOpt(o, "maxdwell", 20, 2, 300),
      mark,
    };
    return {
      ...base, dim, opts,
      total: walkGrid(rect, opts.step).total,
      playerId: player.id, playerName: player.name,
      restore: captureRestore(player),
    };
  }

  throw new Error(`Unknown mode "${mode}" (use area or walk)`);
}
