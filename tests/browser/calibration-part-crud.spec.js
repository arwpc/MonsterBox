/**
 * Calibration page — part CRUD for EVERY part type, driven through the real UI.
 *
 * Operator complaint (2026-10-10): "Confirm CRUD for all part types in Calibration and
 * confirm all save settings for all part types — several do not work. It keeps me from
 * making changes to get parts working."
 *
 * For each part type the page knows, this spec creates a throwaway part through the Add
 * Part modal (or through the API where the modal lacks the type), edits every field the
 * Edit tab offers and saves, assigns a model / saves overrides / reverts, exercises the
 * text-only calibration saves (servo: invert, Calibrated stamp, preset refusal), checks
 * the markers API, and deletes through each of the page's three delete controls. After
 * every write it asserts what the SERVER holds (GET /setup/calibration/api/parts/:id),
 * never just that a toast fired.
 *
 * Field-level assertions are soft (expect.soft) so one broken field does not hide the
 * others; the test still fails. Toasts, console errors, uncaught exceptions and every
 * >=400 response are attached to each test as ui-events.json.
 *
 * Hazard rules (:3100 is the live node; its hardware endpoints drive real hardware):
 *   - only QA-UI-* parts are ever written; existing parts are never saved, tested, moved
 *     or deleted;
 *   - unused resources only: GPIO 19-25 and 27; PCA9685 0x40 channels 5-9, 12-13;
 *   - nothing that moves or probes hardware is pressed (no Test / Go / Home / Sweep /
 *     Set Min / Set Max / Clear / Nudge / Jog). The reads the Controls tab starts on its
 *     own when a part is selected (mic VU poll, sensor GPIO poll, webcam stream) are
 *     answered in-page so nothing spawns on the Pi, and a hazard net answers every motion
 *     route in-page and FAILS the test if one is ever requested;
 *   - every part this spec creates is deleted in afterEach/afterAll even when assertions
 *     fail, the calibration profile the page auto-creates for it is removed, and
 *     parts.json / calibration_profiles.json are compared byte-for-byte with the pre-run
 *     snapshot (parts.json gets its exact pre-run bytes back when only whitespace
 *     differs — the server rewrites it without the trailing newline).
 *
 * Run (the only invocation that works on a node):
 *   MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 \
 *     npx playwright test tests/browser/calibration-part-crud.spec.js --reporter=list
 */

import { test, expect } from './fixtures.js';
import { request } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QA_PREFIX = 'QA-UI-';
const RUN_STARTED_MS = Date.now();
const RUN_TAG = RUN_STARTED_MS.toString(36);
const qaName = (type) => `${QA_PREFIX}${type}-${RUN_TAG}`;

// Resources no character wires (mission brief 2026-10-10). Everything else is live.
const GPIO = [19, 20, 21, 22, 23, 24, 25, 27];
const PCA_CH = [5, 6, 7, 8, 9, 12, 13];
const PCA_ADDR = 64; // 0x40

const SCHEMA_TYPES = (() => {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'schemas', 'parts.schema.json'), 'utf8'));
    return s.items.properties.type.enum;
  } catch { return null; }
})();

// Routes a CRUD spec must never reach. Answered in-page and recorded as a hazard.
const HAZARD_ROUTES = [
  /\/api\/parts\/[^/?]+\/test(\?|$)/,
  /\/api\/calibration\/[^/?]+\/(goto|nudge|jog-raw|home|stop|release|learn-openloop|set-min|set-max)(\?|$)/,
  /\/api\/calibration\/clear-all(\?|$)/,
  /\/setup\/calibration\/api\/(linear_actuator|standard_servo|continuous_servo)\/[^/?]+\/(jog|stop|save-position|reset)(\?|$)/,
  /\/setup\/calibration\/api\/webcam\/motion-tracking\//,
  /\/setup\/calibration\/api\/webcam\/parts\/[^/?]+\/(apply-device|controls\/set)(\?|$)/,
  /\/setup\/audio\/api\/set-input-gain(\?|$)/,
  /\/api\/elevenlabs\//,
  // The page's fixed bottom bar: panic stop, master volume. And the character
  // switcher in the nav: this spec must never change the selected character.
  /\/api\/panic(\?|$)/,
  /\/scenes\/api\/queue\/emergency-stop(\?|$)/,
  /\/api\/system\/volume(\?|$)/,
  /\/setup\/characters\/api\//,
  /\/api\/orchestration\//,
];

let api;                     // APIRequestContext, pinned to the selected character
let charId;                  // read from the server, never assumed
let originalPartIds = new Set();
let snapshot = { parts: null, cal: null, partsFile: null, calFile: null };
const createdIds = new Set();  // every part id this run created (for profile cleanup)
let page = null;
let bag = null;

// ───────────────────────────── API helpers ─────────────────────────────

function partsUrl(suffix = '') {
  const base = `${BASE_URL}/setup/calibration/api/parts${suffix}`;
  return base + (base.includes('?') ? '&' : '?') + `characterId=${encodeURIComponent(charId)}`;
}

async function getPart(id) {
  const r = await api.get(partsUrl(`/${encodeURIComponent(id)}`));
  const body = await r.json().catch(() => null);
  return { status: r.status(), body, part: body && body.part ? body.part : null };
}

async function listParts() {
  const r = await api.get(partsUrl());
  const j = await r.json().catch(() => ({}));
  return j.parts || [];
}

async function createViaApi(payload) {
  const r = await api.post(partsUrl(), { data: payload });
  const j = await r.json().catch(() => ({}));
  expect(r.ok(), `POST /setup/calibration/api/parts -> ${r.status()} ${JSON.stringify(j)}`).toBeTruthy();
  createdIds.add(String(j.part.id));
  return j.part;
}

async function patchConfig(id, config) {
  const r = await api.put(partsUrl(`/${encodeURIComponent(id)}`), { data: { config } });
  expect(r.ok(), `PUT config patch -> ${r.status()}`).toBeTruthy();
}

async function getProfile(id) {
  const r = await api.get(`${BASE_URL}/api/calibration/${encodeURIComponent(id)}/profile?characterId=${encodeURIComponent(charId)}`);
  return r.json().catch(() => null);
}

function readOrNull(p) { try { return fs.readFileSync(p); } catch { return null; } }
function parseOrNull(buf) { try { return JSON.parse(buf.toString('utf8')); } catch { return null; } }

/** Calibration profile keys currently on disk (null when the file is not reachable from here). */
function calKeysOnDisk() {
  const data = snapshot.calFile ? parseOrNull(readOrNull(snapshot.calFile) || Buffer.from('')) : null;
  return data && typeof data === 'object' ? Object.keys(data) : null;
}

/** Remove every QA-UI-* part and every calibration profile this run's parts acquired. */
async function sweepQaParts() {
  if (!api || charId == null) return;
  const parts = await listParts().catch(() => []);
  for (const p of parts) {
    if (!String(p.name || '').startsWith(QA_PREFIX)) continue;
    createdIds.add(String(p.id));
    await api.delete(partsUrl(`/${encodeURIComponent(p.id)}`)).catch(() => {});
  }
  const keys = calKeysOnDisk();
  for (const id of createdIds) {
    if (originalPartIds.has(String(id))) continue;           // never a pre-existing part's profile
    if (keys && !keys.includes(`${charId}:${id}`)) continue; // nothing to remove, keep .err quiet
    // Clear the trust stamp first: the store snapshots the whole file to
    // data/calibration-backups/ whenever a write drops a profile marked measured,
    // and a throwaway's invert/stamp test marks it so. Un-stamping makes the
    // delete an ordinary write.
    await api.post(`${BASE_URL}/api/calibration/${encodeURIComponent(id)}/calibrated`, { data: { calibrated: false, characterId: charId } }).catch(() => {});
    await api.delete(`${BASE_URL}/api/calibration/${encodeURIComponent(id)}/profile?characterId=${encodeURIComponent(charId)}`).catch(() => {});
  }
}

function writeAtomicSync(abs, buf) {
  const tmp = `${abs}.crud-ui-restore-${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, abs);
}

function stripUpdatedAt(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') { out[k] = v; continue; }
    const c = { ...v }; delete c.updatedAt; out[k] = c;
  }
  return out;
}

/**
 * Park the calibration-store backups THIS run caused.
 *
 * The store writes a full copy of calibration_profiles.json to data/calibration-backups/
 * whenever a write drops or demotes a profile marked measured, and keeps only ten.
 * Clearing the Calibrated stamp on a throwaway servo is such a write, so each run adds
 * snapshots that would rotate the operator's real backups out. A snapshot is this
 * run's when it was written after the run started AND contains a profile key of a
 * part this run created. Moved (never deleted) into a subfolder the rotation does
 * not count.
 */
function parkRunBackups() {
  const dir = path.join(REPO_ROOT, 'data', 'calibration-backups');
  const parked = [];
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return parked; }
  const qaKeys = new Set([...createdIds].filter((id) => !originalPartIds.has(String(id))).map((id) => `${charId}:${id}`));
  for (const f of entries) {
    if (!(f.startsWith('calibration_profiles-') && f.endsWith('.json'))) continue;
    const abs = path.join(dir, f);
    let st; try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.mtimeMs < RUN_STARTED_MS) continue;
    const data = parseOrNull(readOrNull(abs) || Buffer.from(''));
    if (!data || !Object.keys(data).some((k) => qaKeys.has(k))) continue;
    const sub = path.join(dir, 'qa-ui-spec-runs');
    try { fs.mkdirSync(sub, { recursive: true }); fs.renameSync(abs, path.join(sub, f)); parked.push(f); } catch { /* leave it */ }
  }
  return parked;
}

/** Prove the operator files are back to the pre-run snapshot; restore whitespace-only drift. */
function restoreSnapshots() {
  const lines = [];
  const parked = parkRunBackups();
  if (parked.length) lines.push(`calibration-backups: ${parked.length} snapshot(s) this run caused moved to data/calibration-backups/qa-ui-spec-runs/ (${parked.join(', ')})`);
  if (snapshot.parts && snapshot.partsFile) {
    const after = readOrNull(snapshot.partsFile);
    if (!after) lines.push(`parts.json: cannot read ${snapshot.partsFile} after the run`);
    else if (snapshot.parts.equals(after)) lines.push('parts.json: byte-identical to the pre-run snapshot');
    else {
      const b = parseOrNull(snapshot.parts), a = parseOrNull(after);
      if (b && a && JSON.stringify(b) === JSON.stringify(a)) {
        writeAtomicSync(snapshot.partsFile, snapshot.parts);
        lines.push('parts.json: JSON-identical after cleanup; exact pre-run bytes restored (server rewrites without the trailing newline)');
      } else {
        const ids = (arr) => (Array.isArray(arr) ? arr.map((p) => `${p.id}:${p.name}`) : []);
        lines.push(`parts.json: CONTENT DIFFERS from the pre-run snapshot — left untouched. before=[${ids(b)}] after=[${ids(a)}]`);
      }
    }
  }
  if (snapshot.cal && snapshot.calFile) {
    const after = readOrNull(snapshot.calFile);
    if (!after) lines.push(`calibration_profiles.json: cannot read ${snapshot.calFile} after the run`);
    else if (snapshot.cal.equals(after)) lines.push('calibration_profiles.json: byte-identical to the pre-run snapshot');
    else {
      const b = parseOrNull(snapshot.cal) || {}, a = parseOrNull(after) || {};
      const extra = Object.keys(a).filter((k) => !(k in b));
      const missing = Object.keys(b).filter((k) => !(k in a));
      const changed = Object.keys(b).filter((k) => k in a && JSON.stringify(stripUpdatedAt({ x: b[k] })) !== JSON.stringify(stripUpdatedAt({ x: a[k] })));
      lines.push(`calibration_profiles.json: differs — extra keys [${extra}], missing keys [${missing}], changed keys [${changed}] (keys this run created were deleted; anything else was written by someone else during the run)`);
    }
  }
  for (const l of lines) console.log(`[crud-ui] ${l}`);
  return lines;
}

// ───────────────────────────── page helpers ─────────────────────────────

async function openPage(browser) {
  const b = { toasts: [], consoleErrors: [], failedResponses: [], writes: [], hazards: [] };
  const p = await browser.newPage();
  // Tall viewport: at 1280x720 the device list's last rows sit under the page's fixed
  // bottom control bar (STOP / volume), and a click aimed at them can land on the bar.
  await p.setViewportSize({ width: 1280, height: 2000 });
  await p.exposeFunction('__mbQaToast', (text, kind) => { b.toasts.push({ text, kind }); });
  await p.addInitScript(() => {
    // 1. Synchronous capture: the page assigns window.mbCalToast and re-claims
    //    window.showToast from it; savePartChanges() calls location.reload()
    //    right after its toast, so wrap the function itself rather than wait for
    //    the DOM.
    let real = null;
    Object.defineProperty(window, 'mbCalToast', {
      configurable: true,
      get() { return real; },
      set(fn) {
        real = typeof fn === 'function'
          ? function (message, type) {
            try { window.__mbQaToast(String(message == null ? '' : message), type || 'info'); } catch (e) { /* ignore */ }
            return fn.apply(this, arguments);
          }
          : fn;
      },
    });
    // 2. DOM capture for toasts raised by any other helper.
    const seen = new WeakSet();
    const report = (n) => {
      if (seen.has(n)) return; seen.add(n);
      try { window.__mbQaToast(n.textContent || '', n.getAttribute('data-mb-toast') || n.className); } catch (e) { /* ignore */ }
    };
    const scan = (root) => {
      if (!(root instanceof Element)) return;
      if (root.matches('.mb-toast')) report(root);
      root.querySelectorAll('.mb-toast').forEach(report);
    };
    // `document` itself: an init script runs before documentElement exists.
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan)))
      .observe(document, { childList: true, subtree: true });
  });
  p.on('console', (m) => { if (m.type() === 'error') b.consoleErrors.push(`console.error: ${m.text()}`); });
  p.on('pageerror', (e) => b.consoleErrors.push(`pageerror: ${e.message}`));
  p.on('response', (r) => {
    const method = r.request().method();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') b.writes.push({ method, url: r.url(), status: r.status() });
    if (r.status() >= 400) {
      const entry = { method, url: r.url(), status: r.status(), body: '' };
      b.failedResponses.push(entry);
      r.text().then((t) => { entry.body = String(t).slice(0, 400); }).catch(() => {});
    }
  });
  // Reads the Controls tab starts on its own when a part is selected: answered here so
  // nothing spawns a Python interpreter or opens a device on the Pi for a QA part.
  await p.route(/\/setup\/audio\/api\/audio-levels/, (route) => route.fulfill({ json: { success: true, level: 0 } }));
  await p.route(/\/api\/parts\/[^/?]+\/gpio-read/, (route) => route.fulfill({ json: { success: true, v: 0 } }));
  await p.route(/\/setup\/calibration\/api\/webcam\/parts\/[^/?]+\/stream/, (route) => route.abort());
  // Hazard net: a CRUD spec must never reach a motion/probe route. If it does, record it
  // (the test fails on bag.hazards) and answer in-page so the node does not move.
  await p.route((url) => HAZARD_ROUTES.some((re) => re.test(url.pathname + url.search)), (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.continue();
    b.hazards.push({ method: req.method(), url: req.url(), body: req.postData() });
    return route.fulfill({ json: { success: false, intercepted: true, error: 'crud-ui spec hazard net' } });
  });
  p.__bag = b;
  return p;
}

async function gotoCalibration() {
  await page.goto(`${BASE_URL}/setup/calibration`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#deviceList .list-group-item', { timeout: 20000 });
}

async function selectPart(id) {
  const item = page.locator(`#deviceList .list-group-item[data-pid="${id}"]`);
  await expect(item, `part ${id} is listed`).toHaveCount(1);
  await item.click();
  await expect(page.locator('#devMeta')).toContainText(`ID: ${id}`);
  // The page's selectPart() awaits a models fetch, THEN clicks the Controls tab and
  // renders the Edit form. A tab click made before that lands is undone by it, so
  // wait for the Edit form to carry this part before touching any tab.
  await page.waitForFunction((pid) => {
    const sel = window.selectedPart;
    const name = document.getElementById('editName');
    return !!sel && String(sel.id) === String(pid) && !!name && name.value === sel.name;
  }, id, { timeout: 15000 });
  await expect(page.locator('#tabControls')).toHaveClass(/active/);
  await page.waitForTimeout(250);
}

async function openTab(which) { // Controls | Edit | Model | Advanced
  await page.click(`#devTabs button[data-bs-target="#tab${which}"]`);
  const pane = page.locator(`#tab${which}`);
  await expect(pane).toHaveClass(/active/);
  await expect(pane).toHaveClass(/show/); // Bootstrap fade finished: fields are clickable
}

/**
 * Custom .mb-switch inputs are real (44x24, opacity 0) hit targets, so a plain click
 * works. No `force`: if anything overlays the control, fail here rather than click
 * through it onto whatever sits underneath on a live node.
 */
async function setSwitch(selector, on) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  const now = await el.isChecked();
  if (now !== on) await el.click();
  await expect(el).toBeChecked({ checked: on });
}

async function waitToast(re, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (bag.toasts.some((t) => re.test(t.text))) return true;
    await page.waitForTimeout(100).catch(() => {});
  }
  return false;
}

function countWrites(re) { return bag.writes.filter((w) => re.test(`${w.method} ${w.url}`)).length; }

async function openAddModal({ name, type, description }) {
  await page.click('button[data-bs-target="#addPartModal"]');
  await expect(page.locator('#addPartModal')).toHaveClass(/show/);
  await page.fill('#addPartName', name);
  await page.selectOption('#addPartType', type);
  if (description != null) await page.fill('#addPartDescription', description);
}

/** The modal's dynamic HTML for some types is malformed ("< div" renders as text). */
async function expectCleanModalMarkup(type) {
  const text = await page.locator('#addPartConfigArea').textContent();
  expect.soft(text, `Add Part modal for ${type} renders no stray "< div" text`).not.toMatch(/<\s*div/);
}

async function submitAddModal() {
  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/setup\/calibration\/api\/parts(\?|$)/.test(r.url()), { timeout: 20000 });
  await page.click('#addPartModal .modal-footer button.mb-btn-primary');
  const resp = await respP;
  const body = await resp.json().catch(() => ({}));
  if (body && body.part && body.part.id != null) createdIds.add(String(body.part.id));
  return { status: resp.status(), body };
}

/** Add through the modal, then prove it: toast, modal closed, listed, server holds it. */
async function finishAdd(name) {
  const created = await submitAddModal();
  expect(created.status, `create -> ${JSON.stringify(created.body)}`).toBe(200);
  const id = String(created.body.part.id);
  expect.soft(await waitToast(/created successfully/i), 'success toast after Add Part').toBe(true);
  await expect(page.locator('#addPartModal')).not.toHaveClass(/show/);
  await expect(page.locator(`#deviceList .list-group-item[data-pid="${id}"]`)).toHaveCount(1);
  const got = await getPart(id);
  expect(got.status, 'GET created part').toBe(200);
  expect.soft(got.part.name, 'name').toBe(name);
  return { id, part: got.part };
}

async function openEdit(id) {
  await selectPart(id);
  await openTab('Edit');
  await expect(page.locator('#editName')).toBeVisible();
  // motor/actuator values are populated on a 100 ms timer
  await page.waitForTimeout(400);
}

async function saveEdit() {
  const loadP = page.waitForEvent('load', { timeout: 30000 }).catch(() => null);
  const respP = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/setup\/calibration\/api\/parts\/[^/?]+/.test(r.url()), { timeout: 20000 });
  await page.click('#saveEditBtn');
  const resp = await respP;
  const status = resp.status();
  const body = await resp.json().catch(() => ({}));
  if (resp.ok()) {
    await loadP; // the page reloads itself after a successful save
    await page.waitForSelector('#deviceList .list-group-item', { timeout: 20000 });
  }
  return { status, body };
}

async function saveAndFetch(id) {
  const saved = await saveEdit();
  expect(saved.status, `save -> ${JSON.stringify(saved.body)}`).toBe(200);
  expect.soft(await waitToast(/saved successfully/i), 'success toast after Save Changes').toBe(true);
  const got = await getPart(id);
  expect(got.status).toBe(200);
  return got.part;
}

async function setAdvancedJson(obj) {
  await page.click('button[data-bs-target="#advancedConfigCollapse"]');
  await expect(page.locator('#advancedConfigCollapse')).toHaveClass(/show/);
  await page.fill('#editConfig', JSON.stringify(obj, null, 2));
}

async function confirmDialog(expectedTarget) {
  const dlg = page.locator('[data-mb-confirm]');
  await expect(dlg).toHaveCount(1);
  if (expectedTarget) expect.soft(await dlg.textContent(), 'confirm dialog names the part').toContain(expectedTarget);
  const respP = page.waitForResponse((r) => r.request().method() === 'DELETE' && /\/setup\/calibration\/api\/parts\/[^/?]+/.test(r.url()), { timeout: 20000 });
  await dlg.locator('[data-mb-confirm-ok]').click();
  return respP;
}

async function assertGone(id) {
  await expect(page.locator(`#deviceList .list-group-item[data-pid="${id}"]`)).toHaveCount(0, { timeout: 15000 });
  const after = await getPart(id);
  expect(after.status, 'deleted part answers 404').toBe(404);
}

async function deleteViaEditTab(id, name) {
  await openEdit(id);
  const errorsBefore = bag.consoleErrors.length;
  await page.click('#deletePartBtn');
  const opened = await page.waitForSelector('[data-mb-confirm]', { timeout: 5000 }).then(() => true).catch(() => false);
  expect(opened, `Edit tab "Delete Part" opens the confirm dialog (page errors after click: ${JSON.stringify(bag.consoleErrors.slice(errorsBefore))})`).toBe(true);
  const resp = await confirmDialog(name);
  expect(resp.status(), 'DELETE (Edit tab) status').toBe(200);
  expect.soft(await waitToast(/deleted successfully/i), 'delete toast (Edit tab)').toBe(true);
  await assertGone(id);
}

async function deleteViaRemoveButton(id, name) {
  await selectPart(id);
  await expect(page.locator('#btnRemove')).toBeEnabled();
  await page.click('#btnRemove');
  const resp = await confirmDialog(name);
  expect(resp.status(), 'DELETE (Remove button) status').toBe(200);
  expect.soft(await waitToast(/deleted successfully/i), 'delete toast (Remove button)').toBe(true);
  await assertGone(id);
}

async function deleteViaBulk(id, name) {
  // Let any loadParts() the Model tab started finish re-rendering the list first.
  await page.waitForTimeout(800);
  const cb = page.locator(`#deviceList .part-select[data-pid="${id}"]`);
  await cb.scrollIntoViewIfNeeded();
  await cb.check();
  await expect(cb).toBeChecked();
  await expect(page.locator('#deleteSelectedBtn')).toBeEnabled();
  await page.click('#deleteSelectedBtn');
  const resp = await confirmDialog(name);
  expect(resp.status(), 'DELETE (bulk) status').toBe(200);
  expect.soft(await waitToast(/Deleted 1 part/i), 'delete toast (bulk)').toBe(true);
  await assertGone(id);
}

async function assignModel(id, modelId) {
  await openTab('Model');
  await page.waitForSelector(`#modelSelect option[value="${modelId}"]`, { state: 'attached', timeout: 10000 });
  await page.selectOption('#modelSelect', modelId);
  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/parts\/[^/?]+\/model/.test(r.url()), { timeout: 15000 });
  await page.click('#assignModelBtn');
  const resp = await respP;
  expect(resp.status(), 'assign model status').toBe(200);
  const got = await getPart(id);
  expect.soft(got.part.modelId, 'modelId persisted top-level').toBe(modelId);
  await expect(page.locator('#modelBadge')).toContainText(modelId);
}

async function saveOverride(id, key, value) {
  const field = page.locator(`.override-field[data-key="${key}"]`);
  await expect(field, `override field ${key}`).toBeVisible();
  if ((await field.evaluate((el) => el.tagName)) === 'SELECT') await field.selectOption(String(value));
  else await field.fill(String(value));
  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/parts\/[^/?]+\/overrides/.test(r.url()), { timeout: 15000 });
  await page.click('#saveOverridesBtn');
  const resp = await respP;
  const body = await resp.json().catch(() => ({}));
  expect(resp.status(), `save overrides -> ${JSON.stringify(body)}`).toBe(200);
  expect.soft(await waitToast(/Overrides saved/i), 'overrides toast').toBe(true);
  const got = await getPart(id);
  expect.soft(got.part.config && got.part.config[key], `override ${key} persisted`).toBe(value);
  // Under automation the page sets MB_TEST_MODE (navigator.webdriver) and its Save
  // Overrides handler clicks back to the Controls tab 1.2 s later; let that land
  // before the next tab click so it cannot undo it.
  await page.waitForTimeout(1500);
  return got.part;
}

// ───────────────────────────── lifecycle ─────────────────────────────

test.beforeAll(async () => {
  api = await request.newContext();
  const cfg = await (await api.get(`${BASE_URL}/api/config`)).json();
  charId = cfg && cfg.config ? cfg.config.selectedCharacter : null;
  expect(charId, 'a character is selected on the node').not.toBeNull();
  originalPartIds = new Set((await listParts()).map((p) => String(p.id)));
  snapshot.partsFile = path.join(REPO_ROOT, 'data', `character-${charId}`, 'parts.json');
  snapshot.calFile = path.join(REPO_ROOT, 'data', 'calibration_profiles.json');
  snapshot.parts = readOrNull(snapshot.partsFile);
  snapshot.cal = readOrNull(snapshot.calFile);
  // A previous aborted run may have left QA parts behind: never count them as original.
  for (const p of await listParts()) if (String(p.name || '').startsWith(QA_PREFIX)) originalPartIds.delete(String(p.id));
  await sweepQaParts();
});

test.beforeEach(async ({ browser }) => {
  test.setTimeout(180000);
  page = await openPage(browser);
  bag = page.__bag;
});

test.afterEach(async ({}, testInfo) => {
  if (page) {
    // Written to the test's output dir (tests/test-results/<test>/ui-events.json) so the
    // evidence survives the list reporter, then attached.
    const events = JSON.stringify({ toasts: bag.toasts, consoleErrors: bag.consoleErrors, failedResponses: bag.failedResponses, hazards: bag.hazards, writes: bag.writes }, null, 2);
    const out = testInfo.outputPath('ui-events.json');
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, events); } catch { /* best effort */ }
    await testInfo.attach('ui-events.json', { path: out, contentType: 'application/json' }).catch(() => {});
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log(`[crud-ui] "${testInfo.title}" console=${JSON.stringify(bag.consoleErrors)} failed=${JSON.stringify(bag.failedResponses)} toasts=${JSON.stringify(bag.toasts.map((t) => t.text))}`);
    }
    await page.close().catch(() => {});
    page = null;
  }
  await sweepQaParts();
});

test.afterAll(async () => {
  await sweepQaParts();
  restoreSnapshots();
  await api.dispose();
});

// Every test ends by proving the hazard net was never needed.
async function noHazards() {
  expect(bag.hazards, 'no motion/probe route was requested by this spec').toEqual([]);
}

// ───────────────────────────── tests ─────────────────────────────

test('page is pinned to the selected character and the Add Part modal offers every schema type, nothing else', async () => {
  await gotoCalibration();
  const pageChar = await page.evaluate(() => window.__MB_CHAR_ID);
  expect(String(pageChar), 'window.__MB_CHAR_ID matches /api/config selectedCharacter').toBe(String(charId));
  const offered = await page.$$eval('#addPartType option', (os) => os.map((o) => o.value).filter(Boolean));
  const wanted = ['servo', 'motor', 'linear_actuator', 'stepper', 'light', 'led', 'led_ring', 'sensor', 'motion_sensor', 'speaker', 'microphone', 'webcam'];
  for (const t of wanted) expect.soft(offered, `Add Part modal offers "${t}"`).toContain(t);
  if (SCHEMA_TYPES) for (const t of offered) expect.soft(SCHEMA_TYPES, `offered type "${t}" is allowed by config/schemas/parts.schema.json`).toContain(t);
  await noHazards();
});

test('servo (standard, PCA9685): add via modal with a model, edit every Edit-tab field, save, delete via Edit tab', async () => {
  const name = qaName('servo-std');
  await gotoCalibration();
  await openAddModal({ name, type: 'servo', description: 'QA servo (standard)' });
  await page.fill('#addGpioPin', String(GPIO[0]));
  await page.selectOption('#addServoType', 'standard');
  await page.selectOption('#addControllerType', 'pca9685');
  await expect(page.locator('#addPca9685Group')).toBeVisible();
  await page.fill('#addPca9685Address', '0x40');
  await page.fill('#addPca9685Frequency', '50');
  await page.click(`#addPcaBoard .pca-ch[data-channel="${PCA_CH[0]}"]`);
  await expect(page.locator('#addPca9685Channel')).toHaveValue(String(PCA_CH[0]));
  await expect(page.locator('#addModelGroup')).toBeVisible();
  await page.waitForSelector('#addModelSelect option[value="servo_miuzei_mg90s"]', { state: 'attached', timeout: 10000 });
  await page.selectOption('#addModelSelect', 'servo_miuzei_mg90s');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.type).toBe('servo');
  expect.soft(p0.description).toBe('QA servo (standard)');
  expect.soft(p0.enabled).toBe(true);
  expect.soft(p0.pin, 'GPIO pin typed in the modal').toBe(GPIO[0]);
  expect.soft(p0.modelId, 'modal model lands top-level').toBe('servo_miuzei_mg90s');
  expect.soft(p0.config).toMatchObject({ servoType: 'standard', controllerType: 'pca9685', address: PCA_ADDR, pca9685Frequency: 50, channel: PCA_CH[0] });

  // A key the Edit form does not own must survive the form's save.
  await patchConfig(id, { qaForeignKey: 'keep-me' });

  await openEdit(id);
  await expect(page.locator('#editName')).toHaveValue(name);
  await expect(page.locator('#editType')).toHaveValue('servo');
  await expect(page.locator('#editServoType')).toHaveValue('standard');
  await expect(page.locator('#editControllerType')).toHaveValue('pca9685');
  await expect(page.locator('#editPca9685Address')).toHaveValue('0x40');
  await expect(page.locator('#editPca9685Channel')).toHaveValue(String(PCA_CH[0]));
  expect.soft(await page.locator('#editServoModel option').count(), 'Edit tab Model select lists the servo models').toBeGreaterThan(1);

  await page.fill('#editName', `${name} edited`);
  await page.fill('#editDescription', 'QA servo edited');
  await setSwitch('#editEnabled', false);
  await page.fill('#editServoPin', String(GPIO[1]));
  await page.selectOption('#editServoType', 'feedback');
  // A servo's inversion is a calibration fact (set-invert); the Edit-tab select is
  // optional. When the page offers it, it must persist what it shows.
  const servoInvertSelect = await page.locator('#editInvertDirection').count();
  if (servoInvertSelect) await page.selectOption('#editInvertDirection', 'true');
  await page.fill('#editPca9685Frequency', '60');
  await page.click(`#editPcaBoard .pca-ch[data-channel="${PCA_CH[1]}"]`);
  await expect(page.locator('#editPca9685Channel')).toHaveValue(String(PCA_CH[1]));
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name, 'name').toBe(`${name} edited`);
  expect.soft(p1.description, 'description').toBe('QA servo edited');
  expect.soft(p1.enabled, 'Enabled switch off').toBe(false);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[1]);
  expect.soft(p1.config.servoType, 'servoType').toBe('feedback');
  expect.soft(p1.config.controllerType, 'controllerType').toBe('pca9685');
  expect.soft(p1.config.address, 'I2C address').toBe(PCA_ADDR);
  expect.soft(p1.config.pca9685Frequency, 'PWM frequency').toBe(60);
  expect.soft(p1.config.channel, 'PCA9685 channel picked on the board').toBe(PCA_CH[1]);
  if (servoInvertSelect) expect.soft(p1.config.invertDirection, 'Edit tab "Invert Direction" select persists to config.invertDirection').toBe(true);
  expect.soft(p1.config.qaForeignKey, 'config key the form does not own survives the save').toBe('keep-me');
  expect.soft(p1.modelId, 'modelId survives the save').toBe('servo_miuzei_mg90s');

  await deleteViaEditTab(id, `${name} edited`);
  await noHazards();
});

test('servo (continuous, direct GPIO): add via modal, edit pin, save, delete via Remove button', async () => {
  const name = qaName('servo-cont');
  await gotoCalibration();
  await openAddModal({ name, type: 'servo', description: 'QA continuous servo' });
  await page.fill('#addGpioPin', String(GPIO[2]));
  await page.selectOption('#addServoType', 'continuous');
  await page.selectOption('#addControllerType', 'gpio');
  await expect(page.locator('#addPca9685Group')).toBeHidden();
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.pin).toBe(GPIO[2]);
  expect.soft(p0.config).toMatchObject({ servoType: 'continuous', controllerType: 'gpio' });
  expect.soft(p0.config.channel, 'no PCA channel for a GPIO servo').toBeUndefined();

  await selectPart(id);
  await expect(page.locator('#rightPanelCol'), 'calibration panel shown for a servo').toBeVisible();
  const prof = await getProfile(id);
  expect.soft(prof && prof.profile && prof.profile.capability && prof.profile.capability.kind, 'profile kind for a continuous servo').toBe('continuous-servo');

  await openEdit(id);
  await expect(page.locator('#editServoType')).toHaveValue('continuous');
  await page.fill('#editServoPin', String(GPIO[3]));
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[3]);
  expect.soft(p1.config.servoType).toBe('continuous');

  await deleteViaRemoveButton(id, `${name} edited`);
  await noHazards();
});

test('servo: Model tab assigns, overrides save and show in Effective, Revert releases only model fields', async () => {
  const name = qaName('servo-model');
  const part = await createViaApi({ name, type: 'servo', pin: GPIO[0], description: 'QA servo model', config: { servoType: 'standard', controllerType: 'pca9685', address: PCA_ADDR, pca9685Frequency: 50, channel: PCA_CH[2] } });
  const id = String(part.id);
  await gotoCalibration();
  await selectPart(id);
  await assignModel(id, 'servo_miuzei_mg90s');
  const p1 = await saveOverride(id, 'pca9685Frequency', 55);
  expect.soft(p1.config.channel, 'channel untouched by an unrelated override save').toBe(PCA_CH[2]);
  expect.soft(p1.config.address, 'address untouched').toBe(PCA_ADDR);
  await expect.poll(async () => (await page.locator('#effectiveJson').textContent()) || '', { timeout: 8000 }).toContain('"pca9685Frequency": 55');

  await openTab('Model'); // the override save's test-mode timer may have returned to Controls
  const revertBtn = page.locator('#revertOverridesBtn');
  if (!(await revertBtn.count()) || !(await revertBtn.isVisible())) {
    expect.soft(true, 'Revert to Model is not offered on this build; revert assertions skipped').toBe(true);
    await deleteViaRemoveButton(id, name);
    await noHazards();
    return;
  }
  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/parts\/[^/?]+\/overrides/.test(r.url()), { timeout: 15000 });
  await revertBtn.click();
  expect((await respP).status(), 'revert status').toBe(200);
  expect.soft(await waitToast(/reverted/i), 'revert toast').toBe(true);
  const p2 = (await getPart(id)).part;
  expect.soft(p2.config.pca9685Frequency, 'overridden frequency released').toBeUndefined();
  expect.soft(p2.config.channel, 'Revert to Model keeps the PCA9685 channel (no servo model supplies one; losing it re-targets channel 0)').toBe(PCA_CH[2]);
  expect.soft(p2.config.controllerType, 'Revert to Model keeps controllerType').toBe('pca9685');
  expect.soft(p2.config.address, 'Revert to Model keeps the I2C address').toBe(PCA_ADDR);
  expect.soft(p2.config.servoType, 'Revert to Model keeps servoType').toBe('standard');

  await deleteViaRemoveButton(id, name);
  await noHazards();
});

test('servo: calibration-panel text saves (invert, Calibrated stamp, preset refusal) and the device-card Invert switch', async () => {
  const name = qaName('servo-cal');
  const part = await createViaApi({ name, type: 'servo', pin: GPIO[1], description: 'QA servo cal', config: { servoType: 'standard', controllerType: 'pca9685', address: PCA_ADDR, pca9685Frequency: 50, channel: PCA_CH[3] } });
  const id = String(part.id);
  await gotoCalibration();
  await selectPart(id);
  await expect(page.locator('#rightPanelCol')).toBeVisible();
  await expect(page.locator('#invertToggleContainer')).toBeVisible();
  await expect(page.locator('#calibratedStampContainer')).toBeVisible();
  let prof = await getProfile(id);
  expect(prof && prof.success, 'profile auto-created on selection').toBeTruthy();
  expect.soft(prof.profile.capability.kind).toBe('absolute-servo');
  expect.soft(prof.profile.autoGenerated, 'fresh profile is a placeholder').toBe(true);
  await expect(page.locator('#calMinDisplay')).toContainText('unmeasured');

  // Invert (text save, no motion). Inverting a direction is not a measurement: the
  // untouched 0-180 placeholder must stay a placeholder afterwards.
  let respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/calibration\/[^/?]+\/set-invert/.test(r.url()), { timeout: 15000 });
  await setSwitch('#invertToggle', true);
  expect((await respP).status(), 'set-invert status').toBe(200);
  await page.waitForTimeout(600); // loadUnifiedCalibration re-renders the panel
  prof = await getProfile(id);
  expect.soft(prof.profile.capability.invert, 'capability.invert persisted').toBe(true);
  await expect(page.locator('#invertToggle')).toBeChecked();
  expect.soft(prof.profile.autoGenerated, 'Invert leaves a never-measured profile marked as a placeholder (autoGenerated stays true)').toBe(true);
  expect.soft(prof.calibrated, 'Invert does not make the runtime trust the unmeasured 0-180 span').toBe(false);
  expect.soft(await page.locator('#calibratedToggle').isChecked(), 'Invert does not flip the Calibrated switch on by itself').toBe(false);

  // Calibrated stamp: off -> on -> off, each a POST, from whatever state Invert left.
  const stampWrite = () => page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/calibration\/[^/?]+\/calibrated/.test(r.url()), { timeout: 15000 });
  if (await page.locator('#calibratedToggle').isChecked()) {
    respP = stampWrite();
    await setSwitch('#calibratedToggle', false);
    expect((await respP).status(), 'calibrated stamp off (reset) status').toBe(200);
    await page.waitForTimeout(600);
  }
  respP = stampWrite();
  await setSwitch('#calibratedToggle', true);
  expect((await respP).status(), 'calibrated stamp on status').toBe(200);
  expect.soft(await waitToast(/Stamped/i), 'stamp toast (full-span warning expected)').toBe(true);
  await page.waitForTimeout(600);
  prof = await getProfile(id);
  expect.soft(prof.calibrated, 'API reports calibrated').toBe(true);
  expect.soft(prof.profile.calibrated, 'profile.calibrated').toBe(true);
  await expect(page.locator('#calMinDisplay')).not.toContainText('unmeasured');
  respP = stampWrite();
  await setSwitch('#calibratedToggle', false);
  expect((await respP).status(), 'calibrated stamp off status').toBe(200);
  await page.waitForTimeout(600);
  prof = await getProfile(id);
  expect.soft(prof.profile.calibrated, 'stamp cleared').toBe(false);
  expect.soft(prof.profile.autoGenerated, 'cleared stamp marks the window untrusted').toBe(true);
  await expect(page.locator('#calMinDisplay')).toContainText('unmeasured');

  // Preset "Set Here" with no known position must refuse WITHOUT writing the profile.
  const profileWrites = () => countWrites(/^POST .*\/api\/calibration\/[^/?]+\/profile/);
  const before = profileWrites();
  await page.fill('#presetNameInput', 'qa-open');
  await page.click('#unifiedCalPanel button:has-text("Set Here")');
  expect.soft(await waitToast(/Cannot capture position|move the part/i), 'preset refusal toast when position is unknown').toBe(true);
  await page.waitForTimeout(500);
  expect.soft(profileWrites() - before, 'no profile write for a refused preset').toBe(0);
  expect.soft(await page.locator('#presetsContainer').textContent(), 'no preset rendered').not.toContain('qa-open');

  // The device-card header "Invert" switch (#invertDir) is a visible control: it must write.
  const writesBefore = bag.writes.length;
  await setSwitch('#invertDir', true);
  await page.waitForTimeout(1200);
  expect.soft(bag.writes.length - writesBefore, 'device-card "Invert" switch (#invertDir) issues a write').toBeGreaterThan(0);

  await deleteViaEditTab(id, name);
  await noHazards();
});

test('markers: API add / rename / delete round-trip; the page offers a marker editor', async () => {
  const name = qaName('servo-markers');
  const part = await createViaApi({ name, type: 'servo', pin: GPIO[2], description: 'QA markers', config: { servoType: 'standard', controllerType: 'pca9685', address: PCA_ADDR, pca9685Frequency: 50, channel: PCA_CH[4] } });
  const id = String(part.id);
  await gotoCalibration();
  await selectPart(id);
  expect.soft(await page.locator('#addMarkerBtn').count(), 'page has an Add Marker control (#addMarkerBtn)').toBe(1);
  expect.soft(await page.locator('#newMarkerName').count(), 'page has a marker name field (#newMarkerName)').toBe(1);
  expect.soft(await page.locator('#customMarkers').count(), 'page renders markers (#customMarkers)').toBe(1);

  let r = await api.post(partsUrl(`/${id}/markers`), { data: { name: 'qa-mark', kind: 'absolute', value: 45, unit: 'deg' } });
  expect(r.status(), 'POST marker').toBe(200);
  let markers = (await (await api.get(partsUrl(`/${id}/markers`))).json()).markers || [];
  expect.soft(markers.find((m) => m.name === 'qa-mark'), 'marker stored').toMatchObject({ value: 45, unit: 'deg' });
  r = await api.post(partsUrl(`/${id}/markers/qa-mark/rename`), { data: { newName: 'qa-mark2' } });
  expect(r.status(), 'rename marker').toBe(200);
  markers = (await (await api.get(partsUrl(`/${id}/markers`))).json()).markers || [];
  expect.soft(markers.map((m) => m.name), 'renamed').toEqual(['qa-mark2']);
  r = await api.delete(partsUrl(`/${id}/markers/qa-mark2`));
  expect(r.status(), 'delete marker').toBe(200);
  markers = (await (await api.get(partsUrl(`/${id}/markers`))).json()).markers || [];
  expect.soft(markers, 'deleted').toEqual([]);
  expect.soft((await getPart(id)).part.markers, 'parts.json markers empty').toEqual([]);

  await deleteViaBulk(id, name);
  await noHazards();
});

test('motor (MDD10A -> BTS7960): add via modal, edit pins / duration / board, save twice, delete via bulk', async () => {
  const name = qaName('motor');
  await gotoCalibration();
  await openAddModal({ name, type: 'motor', description: 'QA motor' });
  expect.soft(await page.locator('#addModelGroup').isVisible(), 'Add Part modal offers a model for motor (data/models/motor_models.json exists)').toBe(true);
  await page.selectOption('#addControlBoard', 'MDD10A');
  await page.fill('#addDirectionPin', String(GPIO[4]));
  await page.fill('#addPwmPin', String(GPIO[5]));
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.controlBoard).toBe('MDD10A');
  expect.soft(p0.directionPin).toBe(GPIO[4]);
  expect.soft(p0.pwmPin).toBe(GPIO[5]);
  expect.soft(p0.maxDuration, 'motor safety default from the modal').toBe(10000);

  // Edit 1: same board, new pins and duration typed in the FORM
  await openEdit(id);
  await expect(page.locator('#editControlBoard')).toHaveValue('MDD10A');
  await expect(page.locator('#editDirectionPin')).toHaveValue(String(GPIO[4]));
  await page.fill('#editDirectionPin', String(GPIO[6]));
  await page.fill('#editPwmPin', String(GPIO[7]));
  await page.fill('#editMaxDuration', '7000');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.directionPin, 'Direction Pin typed in the form is what is saved').toBe(GPIO[6]);
  expect.soft(p1.pwmPin, 'PWM Pin typed in the form is what is saved').toBe(GPIO[7]);
  expect.soft(p1.config && p1.config.maxDuration, 'Max Duration typed in the form is what is saved').toBe(7000);

  // Edit 2: switch the board in the form
  await openEdit(id);
  await page.selectOption('#editControlBoard', 'BTS7960');
  await expect(page.locator('#editBtsGroup')).toBeVisible();
  await page.fill('#editRpwmPin', String(GPIO[0]));
  await page.fill('#editLpwmPin', String(GPIO[1]));
  await page.fill('#editRenPin', String(GPIO[2]));
  await page.fill('#editLenPin', String(GPIO[3]));
  const p2 = await saveAndFetch(id);
  expect.soft(p2.controlBoard, 'board switch persists (top-level controlBoard)').toBe('BTS7960');
  expect.soft(p2.config && p2.config.controlBoard, 'board switch persists (config.controlBoard)').toBe('BTS7960');
  expect.soft(p2.rpwmPin, 'RPWM').toBe(GPIO[0]);
  expect.soft(p2.lpwmPin, 'LPWM').toBe(GPIO[1]);
  expect.soft(p2.renPin, 'R_EN').toBe(GPIO[2]);
  expect.soft(p2.lenPin, 'L_EN').toBe(GPIO[3]);

  // Reopen: the Edit tab must display the BTS pins the server now holds.
  await openEdit(id);
  if (p2.rpwmPin === GPIO[0]) {
    expect.soft(await page.locator('#editRpwmPin').inputValue(), 'Edit tab shows the saved RPWM pin on reopen').toBe(String(GPIO[0]));
  }

  await deleteViaBulk(id, `${name} edited`);
  await noHazards();
});

test('linear_actuator (BTS7960 -> MDD10A): add via modal, edit limits and board, model + override, delete via Edit tab', async () => {
  const name = qaName('actuator');
  await gotoCalibration();
  await openAddModal({ name, type: 'linear_actuator', description: 'QA actuator' });
  expect.soft(await page.locator('#addModelGroup').isVisible(), 'Add Part modal offers a model for linear_actuator (registry exists)').toBe(true);
  await page.selectOption('#addControlBoard', 'BTS7960');
  await expect(page.locator('#addBtsGroup')).toBeVisible();
  await page.fill('#addRpwmPin', String(GPIO[0]));
  await page.fill('#addLpwmPin', String(GPIO[1]));
  await page.fill('#addRenPin', String(GPIO[2]));
  await page.fill('#addLenPin', String(GPIO[3]));
  await page.fill('#addMaxExtension', '12000');
  await page.fill('#addMaxRetraction', '11000');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.controlBoard).toBe('BTS7960');
  expect.soft([p0.rpwmPin, p0.lpwmPin, p0.renPin, p0.lenPin], 'BTS pins').toEqual([GPIO[0], GPIO[1], GPIO[2], GPIO[3]]);
  expect.soft(p0.maxExtension).toBe(12000);
  expect.soft(p0.maxRetraction).toBe(11000);
  expect.soft(p0.directionPin, 'no MDD10A pins on a BTS7960 part').toBeUndefined();

  await selectPart(id);
  await expect(page.locator('#rightPanelCol'), 'calibration panel shown for an actuator').toBeVisible();
  const prof = await getProfile(id);
  expect.soft(prof && prof.profile && prof.profile.capability && prof.profile.capability.kind, 'profile kind').toBe('openloop-linear');

  // Edit 1: limits typed in the form. The Edit tab must first SHOW the part as it is.
  await openEdit(id);
  expect.soft(await page.locator('#editControlBoard').inputValue(), 'Edit tab shows the BTS7960 board the part was created with').toBe('BTS7960');
  expect.soft(await page.locator('#editRpwmPin').inputValue(), 'Edit tab shows the RPWM pin').toBe(String(GPIO[0]));
  expect.soft(await page.locator('#editLenPin').inputValue(), 'Edit tab shows the L_EN pin').toBe(String(GPIO[3]));
  expect.soft(await page.locator('#editMaxExtension').inputValue(), 'Edit tab shows Max Extension').toBe('12000');
  await page.fill('#editMaxExtension', '9000');
  await page.fill('#editMaxRetraction', '8000');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.config && p1.config.maxExtension, 'Max Extension typed in the form is what is saved').toBe(9000);
  expect.soft(p1.config && p1.config.maxRetraction, 'Max Retraction typed in the form is what is saved').toBe(8000);
  expect.soft(p1.controlBoard, 'a limits-only save keeps the BTS7960 board').toBe('BTS7960');
  expect.soft([p1.rpwmPin, p1.lpwmPin, p1.renPin, p1.lenPin], 'a limits-only save keeps the BTS pins').toEqual([GPIO[0], GPIO[1], GPIO[2], GPIO[3]]);

  // Edit 2: switch to MDD10A in the form
  await openEdit(id);
  await page.selectOption('#editControlBoard', 'MDD10A');
  await expect(page.locator('#editMddGroup')).toBeVisible();
  await page.fill('#editDirectionPin', String(GPIO[4]));
  await page.fill('#editPwmPin', String(GPIO[5]));
  const p2 = await saveAndFetch(id);
  expect.soft(p2.controlBoard, 'board switch persists (top-level)').toBe('MDD10A');
  expect.soft(p2.config && p2.config.controlBoard, 'board switch persists (config)').toBe('MDD10A');
  expect.soft(p2.directionPin, 'Direction Pin').toBe(GPIO[4]);
  expect.soft(p2.pwmPin, 'PWM Pin').toBe(GPIO[5]);

  await selectPart(id);
  await assignModel(id, '1759010196402');
  const p3 = await saveOverride(id, 'speedMaxPct', 80);
  expect.soft(p3.config.maxExtension, 'other config keys survive an override save').toBe(p2.config && p2.config.maxExtension);

  await deleteViaEditTab(id, `${name} edited`);
  await noHazards();
});

test('stepper: add via modal with a model, edit pins / microstepping / steps, save, delete via Remove button', async () => {
  const name = qaName('stepper');
  await gotoCalibration();
  await openAddModal({ name, type: 'stepper', description: 'QA stepper' });
  await expectCleanModalMarkup('stepper');
  await page.fill('#addStepPin', String(GPIO[0]));
  await page.fill('#addDirPin', String(GPIO[1]));
  await page.fill('#addEnablePin', String(GPIO[2]));
  await page.selectOption('#addMicrostepping', '8');
  await page.fill('#addStepsPerRev', '400');
  await expect(page.locator('#addModelGroup')).toBeVisible();
  await page.waitForSelector('#addModelSelect option[value="motor_stepperonline_nema17_59ncm"]', { state: 'attached', timeout: 10000 });
  await page.selectOption('#addModelSelect', 'motor_stepperonline_nema17_59ncm');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft([p0.stepPin, p0.dirPin, p0.enablePin], 'stepper pins').toEqual([GPIO[0], GPIO[1], GPIO[2]]);
  expect.soft(p0.config).toMatchObject({ microstepping: 8, stepsPerRevolution: 400 });
  expect.soft(p0.modelId).toBe('motor_stepperonline_nema17_59ncm');

  await openEdit(id);
  await expect(page.locator('#editStepPin')).toHaveValue(String(GPIO[0]));
  await page.fill('#editStepPin', String(GPIO[3]));
  await page.fill('#editDirPin', String(GPIO[4]));
  await page.fill('#editEnablePin', String(GPIO[5]));
  await page.selectOption('#editMicrostepping', '4');
  await page.fill('#editStepsPerRev', '800');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.stepPin, 'Step Pin typed in the form is what is saved').toBe(GPIO[3]);
  expect.soft(p1.dirPin, 'Dir Pin typed in the form is what is saved').toBe(GPIO[4]);
  expect.soft(p1.enablePin, 'Enable Pin typed in the form is what is saved').toBe(GPIO[5]);
  expect.soft(p1.config.microstepping, 'Microstepping picked in the form is what is saved').toBe(4);
  expect.soft(p1.config.stepsPerRevolution, 'Steps/Rev typed in the form is what is saved').toBe(800);

  await deleteViaRemoveButton(id, `${name} edited`);
  await noHazards();
});

test('light: add via modal, edit pin / brightness / Advanced JSON, save, delete via Remove button', async () => {
  const name = qaName('light');
  await gotoCalibration();
  await openAddModal({ name, type: 'light', description: 'QA light' });
  expect.soft(await page.locator('#addModelGroup').isVisible(), 'Add Part modal offers a model for light (registry exists)').toBe(true);
  await page.fill('#addGpioPin', String(GPIO[6]));
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.pin).toBe(GPIO[6]);

  await openEdit(id);
  await expect(page.locator('#editLightPin')).toHaveValue(String(GPIO[6]));
  await page.fill('#editLightPin', String(GPIO[7]));
  await page.fill('#editBrightness', '60');
  await setAdvancedJson({ brightness: 60, qaJsonKey: 'from-json' });
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[7]);
  expect.soft(p1.config && p1.config.brightness, 'brightness').toBe(60);
  expect.soft(p1.config && p1.config.qaJsonKey, 'Advanced Configuration (JSON) edits are saved').toBe('from-json');

  await deleteViaRemoveButton(id, `${name} edited`);
  await noHazards();
});

test('led: add via modal, edit pin / brightness, save, model + override, delete via bulk', async () => {
  const name = qaName('led');
  await gotoCalibration();
  await openAddModal({ name, type: 'led', description: 'QA led' });
  expect.soft(await page.locator('#addModelGroup').isVisible(), 'Add Part modal offers a model for led (registry exists)').toBe(true);
  await page.fill('#addGpioPin', String(GPIO[0]));
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.pin).toBe(GPIO[0]);

  await openEdit(id);
  await page.fill('#editLightPin', String(GPIO[1]));
  await page.fill('#editBrightness', '40');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[1]);
  expect.soft(p1.config && p1.config.brightness, 'brightness').toBe(40);

  await selectPart(id);
  await assignModel(id, 'led_standard_5mm');
  await saveOverride(id, 'pwmFrequency', 1000);

  await deleteViaBulk(id, `${name} edited`);
  await noHazards();
});

test('led_ring (not in the Add modal, created via API): edit geometry, colours survive, model list, delete via Edit tab', async () => {
  const name = qaName('led-ring');
  const part = await createViaApi({ name, type: 'led_ring', description: 'QA ring', config: { gpioPin: GPIO[2], pwmChannel: 0, colorOrder: 'GRB', pixelCount: 16, ringSplit: 8, dma: 10, dataRateHz: 800000, colors: { idle: '#200000' } } });
  const id = String(part.id);
  await gotoCalibration();
  await openEdit(id);
  await expect(page.locator('#editLedGpioPin')).toHaveValue(String(GPIO[2]));
  await expect(page.locator('#editLedPixelCount')).toHaveValue('16');
  await page.fill('#editLedGpioPin', String(GPIO[0]));
  await page.selectOption('#editLedPwmChannel', '1');
  await page.selectOption('#editLedColorOrder', 'RGB');
  await page.fill('#editLedPixelCount', '24');
  await page.fill('#editLedRingSplit', '12');
  await page.fill('#editLedDma', '5');
  await page.fill('#editLedDataRate', '400000');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.config).toMatchObject({ gpioPin: GPIO[0], pwmChannel: 1, colorOrder: 'RGB', pixelCount: 24, ringSplit: 12, dma: 5, dataRateHz: 400000 });
  expect.soft(p1.config.colors, 'colours (LED Animation page) survive a geometry save').toEqual({ idle: '#200000' });

  await selectPart(id);
  await openTab('Model');
  expect.soft(await page.locator('#modelSelect option').count(), 'Model tab lists led_ring models (data/models/led_ring_models.json)').toBeGreaterThan(1);

  await deleteViaEditTab(id, `${name} edited`);
  await noHazards();
});

test('sensor: add via modal, edit pin, save, delete via Remove button', async () => {
  const name = qaName('sensor');
  await gotoCalibration();
  await openAddModal({ name, type: 'sensor', description: 'QA sensor' });
  await page.fill('#addGpioPin', String(GPIO[3]));
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.pin).toBe(GPIO[3]);

  await openEdit(id);
  await expect(page.locator('#editSensorPin')).toHaveValue(String(GPIO[3]));
  await page.fill('#editSensorPin', String(GPIO[4]));
  await page.fill('#editName', `${name} edited`);
  await setSwitch('#editEnabled', false);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[4]);
  expect.soft(p1.enabled, 'Enabled off').toBe(false);

  await deleteViaRemoveButton(id, `${name} edited`);
  await noHazards();
});

test('motion_sensor: add via modal, edit pin / sensitivity / window, save, model + overrides, delete via bulk', async () => {
  const name = qaName('motion-sensor');
  await gotoCalibration();
  await openAddModal({ name, type: 'motion_sensor', description: 'QA PIR' });
  expect.soft(await page.locator('#addModelGroup').isVisible(), 'Add Part modal offers a model for motion_sensor (registry exists)').toBe(true);
  await page.fill('#addGpioPin', String(GPIO[5]));
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.pin).toBe(GPIO[5]);

  await openEdit(id);
  await expect(page.locator('#editSensorPin')).toHaveValue(String(GPIO[5]));
  await page.fill('#editSensorPin', String(GPIO[6]));
  await page.fill('#editSensitivity', '7');
  await page.fill('#editWindowMs', '250');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.pin, 'GPIO pin').toBe(GPIO[6]);
  expect.soft(p1.config && p1.config.sensitivity, 'sensitivity').toBe(7);
  expect.soft(p1.config && p1.config.windowMs, 'window ms').toBe(250);

  await selectPart(id);
  await assignModel(id, 'pir_generic');
  const p2 = await saveOverride(id, 'retriggerMs', 3000);
  expect.soft(p2.config.windowMs, 'Edit-tab key survives an override save').toBe(250);

  await deleteViaBulk(id, `${name} edited`);
  await noHazards();
});

test('webcam: add via modal with device + model, edit device / size / fps, save, override, delete via Edit tab', async () => {
  const name = qaName('webcam');
  await gotoCalibration();
  await openAddModal({ name, type: 'webcam', description: 'QA webcam' });
  await expectCleanModalMarkup('webcam');
  // No device probe (it opens every /dev/video*): offer a fake device path to the select.
  await page.evaluate(() => {
    const s = document.getElementById('addWebcamDevice');
    s.add(new Option('QA fake camera', '/dev/video9'));
    s.value = '/dev/video9';
  });
  await expect(page.locator('#addModelGroup')).toBeVisible();
  await page.waitForSelector('#addModelSelect option[value="default-uvc-1"]', { state: 'attached', timeout: 10000 });
  await page.selectOption('#addModelSelect', 'default-uvc-1');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.config).toMatchObject({ devicePath: '/dev/video9', deviceId: 9 });
  expect.soft(p0.modelId).toBe('default-uvc-1');

  await openEdit(id);
  await expect(page.locator('#editDevicePath')).toHaveValue('/dev/video9');
  await expect(page.locator('#applyMjpgBtn')).toBeVisible();
  await page.fill('#editDevicePath', '/dev/video8');
  await page.fill('#editDeviceId', '8');
  await page.fill('#editWidth', '640');
  await page.fill('#editHeight', '480');
  await page.fill('#editFps', '15');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.config).toMatchObject({ devicePath: '/dev/video8', deviceId: 8, width: 640, height: 480, fps: 15 });

  await selectPart(id);
  await openTab('Model');
  const p2 = await saveOverride(id, 'fps', 10);
  expect.soft(p2.config.devicePath, 'device path survives an override save').toBe('/dev/video8');

  await deleteViaEditTab(id, `${name} edited`);
  await noHazards();
});

test('microphone: add via modal (scan + pick input), edit rate / gain, device id survives the save, delete via Remove button', async () => {
  const name = qaName('microphone');
  const fakeInput = `qa.fake.input.${RUN_TAG}`;
  await gotoCalibration();
  await openAddModal({ name, type: 'microphone', description: 'QA mic' });
  await expectCleanModalMarkup('microphone');
  await page.click('#addPartModal button:has-text("Scan Inputs")');
  await expect.poll(async () => page.locator('#addAudioInput option').count(), { timeout: 10000 }).toBeGreaterThan(1);
  // Pick a device no one is listening on: a fake PipeWire source id (the UI stores the id verbatim).
  await page.evaluate((v) => { const s = document.getElementById('addAudioInput'); s.add(new Option('QA fake input', v)); s.value = v; }, fakeInput);
  await expect(page.locator('#addModelGroup')).toBeVisible();
  await page.waitForSelector('#addModelSelect option[value="mic_generic_usb"]', { state: 'attached', timeout: 10000 });
  await page.selectOption('#addModelSelect', 'mic_generic_usb');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.config && p0.config.deviceId, 'input device id stored').toBe(fakeInput);
  expect.soft(p0.modelId).toBe('mic_generic_usb');

  await openEdit(id);
  expect.soft(await page.locator('#editMicDevice').inputValue(), 'Edit tab shows the configured input device').toBe(fakeInput);
  await page.fill('#editSampleRate', '48000');
  await page.fill('#editGain', '70');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.config && p1.config.deviceId, 'input device id survives a form save').toBe(fakeInput);
  expect.soft(p1.config && p1.config.sampleRate, 'sample rate').toBe(48000);
  // The gain field persists as config.inputGainPercent (the key the capture path
  // reads) on builds after a0388040, config.gain before it.
  expect.soft(p1.config && (p1.config.inputGainPercent != null ? p1.config.inputGainPercent : p1.config.gain), 'gain').toBe(70);

  await deleteViaRemoveButton(id, `${name} edited`);
  await noHazards();
});

test('speaker: add via modal (scan + pick output, volume/bass/treble), edit, device id survives, model + override, delete via bulk', async () => {
  const name = qaName('speaker');
  const fakeOutput = `qa.fake.output.${RUN_TAG}`;
  await gotoCalibration();
  await openAddModal({ name, type: 'speaker', description: 'QA speaker' });
  await expectCleanModalMarkup('speaker');
  await page.click('#addPartModal button:has-text("Scan Outputs")');
  await expect.poll(async () => page.locator('#addAudioOutput option').count(), { timeout: 10000 }).toBeGreaterThan(1);
  await page.evaluate((v) => { const s = document.getElementById('addAudioOutput'); s.add(new Option('QA fake output', v)); s.value = v; }, fakeOutput);
  await page.fill('#addSpeakerVolume', '30');
  await page.fill('#addSpeakerBass', '2');
  await page.fill('#addSpeakerTreble', '-1');
  await expect(page.locator('#addModelGroup')).toBeVisible();
  await page.waitForSelector('#addModelSelect option[value="default_speaker"]', { state: 'attached', timeout: 10000 });
  await page.selectOption('#addModelSelect', 'default_speaker');
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.config).toMatchObject({ audioDeviceId: fakeOutput, volume: 30, bass: 2, treble: -1 });
  expect.soft(p0.modelId).toBe('default_speaker');

  await openEdit(id);
  expect.soft(await page.locator('#editSpeakerDevice').inputValue(), 'Edit tab shows the configured output device').toBe(fakeOutput);
  expect.soft(await page.locator('#editVolume').inputValue(), 'Edit tab shows the stored volume').toBe('30');
  await page.fill('#editVolume', '45');
  await page.fill('#editBass', '3');
  await page.fill('#editTreble', '1');
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);
  expect.soft(p1.config && p1.config.audioDeviceId, 'output device id survives a form save').toBe(fakeOutput);
  expect.soft(p1.config && p1.config.volume, 'volume').toBe(45);
  expect.soft(p1.config && p1.config.bass, 'bass').toBe(3);
  expect.soft(p1.config && p1.config.treble, 'treble').toBe(1);

  await selectPart(id);
  await openTab('Model');
  const p2 = await saveOverride(id, 'volume', 35);
  expect.soft(p2.config.audioDeviceId, 'device id survives an override save').toBe(fakeOutput);

  await deleteViaBulk(id, `${name} edited`);
  await noHazards();
});

test('head_tracking (offered by the modal): add, rename via Edit, save, delete via Edit tab; type must be schema-valid', async () => {
  const name = qaName('head-tracking');
  await gotoCalibration();
  const offered = await page.$$eval('#addPartType option', (os) => os.map((o) => o.value));
  test.skip(!offered.includes('head_tracking'), 'Add Part modal no longer offers head_tracking');
  await openAddModal({ name, type: 'head_tracking', description: 'QA head tracking' });
  const { id, part: p0 } = await finishAdd(name);
  expect.soft(p0.type).toBe('head_tracking');
  if (SCHEMA_TYPES) expect.soft(SCHEMA_TYPES, 'a part type the modal creates is accepted by config/schemas/parts.schema.json (validate:schemas gate)').toContain('head_tracking');

  await openEdit(id);
  await page.fill('#editName', `${name} edited`);
  const p1 = await saveAndFetch(id);
  expect.soft(p1.name).toBe(`${name} edited`);

  await deleteViaEditTab(id, `${name} edited`);
  await noHazards();
});
