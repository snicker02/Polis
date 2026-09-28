import { world } from "@minecraft/server";

const JOB_KEY = "pregen:job";

export function loadJob() {
  try {
    const s = world.getDynamicProperty(JOB_KEY);
    return typeof s === "string" ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function saveJob(job) {
  try {
    world.setDynamicProperty(JOB_KEY, job ? JSON.stringify(job) : undefined);
  } catch (e) {
    console.warn(`[pregen] could not save job: ${e}`);
  }
}
