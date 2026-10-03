// tools/checks/2zv-settings.js — saving the settings and putting them back.
//
// Run against the page's own controls (read from index.html: every input and
// select, its id, type and starting value), as plain objects: every control
// saved and put back exactly, the styles to mix and the downtown's place too;
// the building style put back before the theme (it refills the theme list);
// settings from an older Polis load, with a note, and names this one does not
// have are told, not fatal; the world file is never saved; anything that is not
// a Polis settings file is refused. The page has the buttons, and holds the
// city back while settings go in.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zv';
export const label = '2zv. saving and loading settings';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const root = ROOT || join(new URL('.', import.meta.url).pathname, '..', '..');
  const { collectSettings, applySettings, FIRST } = await import('../../engine/settings.js');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const mainJs = readFileSync(join(root, 'main.js'), 'utf8');

  // the page's controls, as plain objects
  const controlsOf = () => {
    const out = [];
    for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
      const a = m[1], at = (k) => { const r = a.match(new RegExp(`\\b${k}="([^"]*)"`)); return r ? r[1] : null; };
      out.push({ id: at('id'), type: at('type') || 'text', value: at('value') || '', checked: /\bchecked\b/.test(a), className: at('class') || '' });
    }
    for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const idm = m[1].match(/\bid="([^"]*)"/), opts = [...m[2].matchAll(/<option[^>]*value="([^"]*)"/g)].map((o) => o[1]);
      out.push({ id: idm ? idm[1] : null, type: 'select', value: opts[0] || '', checked: false, className: '', options: opts });
    }
    return out;
  };
  const a = controlsOf();
  check('settings: the page has controls to save (inputs and selects with ids)', a.filter((c) => c.id).length > 50, `${a.length}`);
  // change every control, save, put back into a fresh page: every one as it was
  for (const c of a) {
    if (c.type === 'checkbox') c.checked = !c.checked;
    else if (c.type === 'select') c.value = c.options && c.options.length > 1 ? c.options[1] : c.value;
    else if (c.type === 'range' || c.type === 'number') c.value = String(Number(c.value || 0) + 1);
    else if (c.type === 'text') c.value = c.value + 'x';
  }
  const saved = JSON.parse(JSON.stringify(collectSettings(a, { version: '9.9.9', focal: [0.31, 0.72] })));
  const b = controlsOf();
  const order = [];
  const res = applySettings(saved, b, { version: '9.9.9', changed: (c) => order.push(c.id || c.value) });
  let differ = 0;
  for (const ca of a) {
    if (!ca.id && !/mixStyle/.test(ca.className)) continue;
    if (ca.type === 'file') continue;
    const cb = b.find((x) => (ca.id ? x.id === ca.id : x.className === ca.className && x.value === ca.value));
    if (!cb) { differ++; continue; }
    if (ca.type === 'checkbox' ? ca.checked !== cb.checked : ca.value !== cb.value) differ++;
  }
  check('settings: every control saved and put back exactly (the styles to mix too)', differ === 0 && res.applied > 50, `${differ} differ, ${res.applied} put back`);
  check('settings: the downtown\'s place saved and put back', res.focal && res.focal[0] === 0.31 && res.focal[1] === 0.72);
  const iStyle = order.indexOf('style'), iTheme = order.indexOf('theme');
  check('settings: the building style goes back before the theme (it refills the theme list)', iStyle >= 0 && iTheme > iStyle && order.slice(0, FIRST.length).every((id) => FIRST.includes(id)));
  check('settings: the world file is never saved', !('worldFile' in saved.settings) && !('settingsFile' in saved.settings));
  // settings from an older Polis, naming a control this one has not got
  const old = { ...saved, version: '0.1.0', settings: { ...saved.settings, aControlLongGone: '5' } };
  delete old.settings.seed;
  const c = controlsOf();
  const seedBefore = c.find((x) => x.id === 'seed').value;
  const r2 = applySettings(old, c, { version: '9.9.9' });
  check('settings: from an older Polis they load, with a note that the city may differ', !!r2.note && /0\.1\.0/.test(r2.note));
  check('settings: a name this version has not got is told, not fatal; a control not named keeps its value', r2.unknown.includes('aControlLongGone') && c.find((x) => x.id === 'seed').value === seedBefore);
  let refused = false;
  try { applySettings({ some: 'json' }, controlsOf(), {}); } catch (e) { refused = true; }
  check('settings: anything that is not a Polis settings file is refused', refused);
  // the page
  check('settings: the page has Save, Load and Reset, and a hidden file picker for Load',
    /id="saveSettings"/.test(html) && /id="loadSettings"/.test(html) && /id="resetSettings"/.test(html) && /id="settingsFile"[^>]*display:none/.test(html));
  check('settings: the city waits while settings go in, and is built once after', /if \(applyingSettings\) return;/.test(mainJs) && /restoreRemembered\(\);[\s\S]{0,200}generate\(\);/.test(mainJs));
  note(`settings: ${res.applied} controls saved and put back`);
}
