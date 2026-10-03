// engine/settings.js — saving the settings, and putting them back.
//
// Every control in the settings panel is saved by its id (a checkbox by whether
// it is ticked, anything else by its value), the styles ticked for mixing by
// their values, and the downtown's place on the map. Nothing is listed by hand,
// so a control added later is saved without anything here changing. The world
// file is left out (a page cannot set a file input).
//
// Putting them back sets every control the settings name and the page still has;
// a control they do not name keeps what it has (settings saved by an older Polis
// load). A few go first, each told at once that it changed, because changing
// them redraws others (the building style refills the theme list: a theme set
// before its style would be lost). The same settings and the same Polis build
// the same city; a different Polis may build a different one from them, so the
// version they were saved by is kept and compared.
//
// These work on plain objects ({ id, type, value, checked, className }), which a
// page's input and select elements are, so they can be checked without a page.

export const SETTINGS_FORMAT = 1;
const SKIP_IDS = new Set(['worldFile', 'settingsFile']);
const SKIP_TYPES = new Set(['file', 'button', 'submit', 'reset', 'hidden']);
// changed first, in this order: each redraws others when it changes
export const FIRST = ['mode', 'style', 'edition', 'cityStyle'];

const saved = (c) => c.id && !SKIP_IDS.has(c.id) && !SKIP_TYPES.has(c.type);
const isBox = (c) => c.type === 'checkbox' || c.type === 'radio';

export function collectSettings(controls, { version, focal } = {}) {
  const settings = {};
  const mixStyles = [];
  for (const c of controls) {
    if (c.className && /\bmixStyle\b/.test(c.className)) { if (c.checked) mixStyles.push(c.value); continue; }
    if (!saved(c)) continue;
    settings[c.id] = isBox(c) ? !!c.checked : String(c.value);
  }
  return { polis: 'settings', format: SETTINGS_FORMAT, version: version || null, savedAt: new Date().toISOString(), settings, mixStyles, focal: focal ? focal.slice() : null };
}

// Puts the settings back into the controls; changed(control) is called as each
// one is set (the page fires its events there). Returns what was set, what the
// settings named that the page no longer has, and a note if the version differs.
export function applySettings(data, controls, { version, changed } = {}) {
  if (!data || data.polis !== 'settings' || typeof data.settings !== 'object') throw new Error('not a Polis settings file');
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  const order = [...FIRST.filter((id) => id in data.settings), ...Object.keys(data.settings).filter((id) => !FIRST.includes(id))];
  const unknown = [];
  let applied = 0;
  for (const id of order) {
    const c = byId.get(id);
    if (!c || !saved(c)) { unknown.push(id); continue; }
    const v = data.settings[id];
    if (isBox(c)) c.checked = !!v; else c.value = String(v);
    applied++;
    if (changed) changed(c);
  }
  if (Array.isArray(data.mixStyles)) {
    const want = new Set(data.mixStyles);
    for (const c of controls) if (c.className && /\bmixStyle\b/.test(c.className)) { c.checked = want.has(c.value); if (changed) changed(c); }
  }
  const note = data.version && version && data.version !== version
    ? `saved by Polis ${data.version}, this is ${version}: the same settings may build a slightly different city`
    : null;
  return { applied, unknown, focal: Array.isArray(data.focal) && data.focal.length === 2 ? data.focal.slice() : null, note };
}
