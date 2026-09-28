// Form UI: /scriptevent pregen:menu. Uses only form signatures shared by server-ui 1.x and 2.x.
import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import * as runner from "./runner.js";
import { buildJob, parseCoord, toInt } from "./jobs.js";
import { normRect } from "./geometry.js";
import { say } from "./log.js";

const wait = (t) => new Promise((res) => system.runTimeout(res, t));

// Chat is still open right after typing the command; retry until the player can see the form.
async function show(player, form) {
  for (let i = 0; i < 60; i++) {
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === "UserBusy") { await wait(10); continue; }
    return res;
  }
  return { canceled: true };
}

export function openMenu(player) {
  if (!player) return;
  const p = runner.getJob() ? jobMenu(player) : newJobMenu(player);
  p.catch((e) => say(`§c${e?.message ?? e}`, player));
}

async function jobMenu(player) {
  const j = runner.getJob();
  const form = new ActionFormData()
    .title("Chunk Pregen")
    .body(runner.statusText())
    .button(j.paused ? "Resume" : "Pause")
    .button("Stop and clean up")
    .button("Close");
  const r = await show(player, form);
  if (r.canceled) return;
  if (r.selection === 0) {
    if (runner.getJob()?.paused) runner.resume(player);
    else runner.pause("paused from menu", player);
  } else if (r.selection === 1) {
    runner.stop({ player });
  }
}

function corner(text, player, label) {
  const parts = String(text ?? "").trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 2) throw new Error(`${label}: enter "X Z", e.g. -1000 500`);
  return [parseCoord(parts[0], player.location.x, `${label} X`), parseCoord(parts[1], player.location.z, `${label} Z`)];
}

async function newJobMenu(player) {
  const form = new ModalFormData()
    .title("Chunk Pregen")
    .dropdown("Mode", ["Area: ticking areas, fastest", "Walk: teleports you, fills held maps"])
    .dropdown("Region", ["Square around me (radius)", "Two corners"])
    .textField("Radius in blocks", "e.g. 1000")
    .textField("Corner 1: X Z  (~ works)", "e.g. -1000 -1000")
    .textField("Corner 2: X Z", "e.g. 1000 1000")
    .textField("Walk step in blocks (blank = 128)", "64 for dense map fill")
    .toggle("Walk in creative instead of spectator");
  const r = await show(player, form);
  if (r.canceled) return;

  const [modeI, regionI, radius, c1, c2, step, creative] = r.formValues;
  const mode = modeI === 1 ? "walk" : "area";

  let rect;
  if (regionI === 0) {
    const rad = toInt(String(radius).trim(), "Radius");
    if (rad <= 0) throw new Error("Radius must be positive");
    const cx = Math.floor(player.location.x), cz = Math.floor(player.location.z);
    rect = normRect(cx - rad, cz - rad, cx + rad, cz + rad);
  } else {
    const [x1, z1] = corner(c1, player, "Corner 1");
    const [x2, z2] = corner(c2, player, "Corner 2");
    rect = normRect(x1, z1, x2, z2);
  }

  const opts = {};
  if (mode === "walk") {
    if (String(step ?? "").trim()) opts.step = String(step).trim();
    opts.gm = creative ? "creative" : "spectator";
  }
  runner.start(buildJob(mode, rect, opts, player, player.dimension.id), player);
}
