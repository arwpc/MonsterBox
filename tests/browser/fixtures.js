/**
 * Shared Playwright fixtures for every MonsterBox browser spec.
 *
 * The only browser invocation that works on a node targets the always-on :3100
 * listener, which is the LIVE app (NODE_ENV=production, no MB_TEST_MODE). A click
 * on Loop All there starts a real scene loop; the AI switch wakes the real agent;
 * a scene tile plays a real show; a fleet button fans out to every node. So every
 * browser context created by a spec gets a hazard guard:
 *
 *   - scene plays and step tests are REWRITTEN to carry `?dryRun=1` (the play route
 *     only short-circuits on the query parameter, routes/scenes/api.js);
 *   - loop/queue starts, agent wake/sleep/AI-on, Lurk on/off, pose execution,
 *     speech/audio playback, service restarts and every fleet fan-out are ANSWERED
 *     by the guard (`{success:true, intercepted:true}`) and RECORDED, so a spec can
 *     assert the request contract (e.g. Loop All posts `scene_id`) without the node
 *     moving, speaking or changing state.
 *
 * Reads (GET) always reach the server. A spec that genuinely needs a live hazard
 * opts out with `test.use({ hazardGuard: false })` and owns the consequences.
 *
 * The worker also snapshots the node's operator files (tests/helpers/liveDataGuard.mjs)
 * and fails the run if a spec left any of them changed (restoring them first).
 *
 * Specs import { test, expect } from './fixtures.js' instead of '@playwright/test'.
 */
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGuard, logOffsets, brokenPartCommands } from '../helpers/liveDataGuard.mjs';
import { untouchablePartIds } from '../helpers/testableParts.mjs';

// Parts no automated test may command on this node: listed broken in
// config/physical-faults.json, or named in a config/scene-hazards.json rule.
const UNTOUCHABLE = (() => {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config', 'app-config.json'), 'utf8'));
    return untouchablePartIds(cfg.selectedCharacter);
  } catch { return new Set(); }
})();
const PART_COMMAND = /\/api\/(parts|calibration)\/([^/?]+)\/(test|goto|nudge|jog-raw|home|stop|release|learn-openloop)(\?|$)/;

/** Requests answered by the guard instead of the node (method + path regex). */
export const INTERCEPTED = [
  ['POST', /\/scenes\/api\/queue\/(start|start-config|enqueue|insert|templates\/enqueue|resume)(\?|$)/],
  ['POST', /\/scenes\/armed-mode\/playlist(\?|$)/],
  // A local panic stops the agent, the music and every motion of the live node.
  ['POST', /\/api\/panic(\?|$)/],
  ['POST', /\/scenes\/api\/queue\/emergency-stop(\?|$)/],
  ['POST', /\/conversation\/api\/(ai-on|ask-ai|wake|sleep|lurk-mode|say|play-audio|jaw-drive|motion-sensor|motion-sensor\/simulate|lurk-state\/prefs|lurk\/event-hold|lurk\/event-release|callouts|callouts\/test|lurk-scenes|lurk-scenes\/test)(\?|$)/],
  ['POST', /\/poses\/(api\/poses\/)?[^/]+\/execute(\?|$)/],
  ['POST', /\/api\/movement\/idle\/start(\?|$)/],
  ['POST', /\/api\/audio-loop\/start(\?|$)/],
  ['POST', /\/api\/elevenlabs\/(play-audio|generate-and-play|agent-speak)(\?|$)/],
  ['POST', /\/api\/system\/restart-service(\?|$)/],
  // Fleet fan-out: one click here acts on every node in the castle.
  ['POST', /\/api\/orchestration\/(restart-services|say-all|start-all-queue-loops|stop-all-queue-loops|emergency-stop|superpower\/[^/?]+|volume\/restore-canonical|fleet-mode\/[^/?]+)(\?|$)/],
  ['POST', /\/api\/orchestration\/animatronic\/[^/]+\/(say|play-audio|auto-ai\/start|restart|reboot)(\?|$)/],
  ['PUT', /\/api\/orchestration\/volume(\?|$)/],
];

/** Requests that reach the node with `dryRun=1` added. */
export const DRY_RUN = [
  ['POST', /\/scenes\/api\/[^/]+\/(play|play-stream|test-step)(\?|$)/],
  ['POST', /\/scenes\/api\/step\/test(\?|$)/],
];

const guarded = new WeakSet();

function matches(list, method, pathname) {
  return list.some(([m, re]) => m === method && re.test(pathname));
}

async function installHazardGuard(context) {
  if (guarded.has(context)) return;
  guarded.add(context);
  await context.route('**/*', async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
    if (context.__mbGuardOff) return route.continue();
    const log = context.__mbLog || test.__sharedLog;
    let url;
    try { url = new URL(req.url()); } catch { return route.continue(); }
    const partCmd = url.pathname.match(PART_COMMAND);
    if (partCmd && UNTOUCHABLE.has(decodeURIComponent(partCmd[2]))) {
      log.push({ method, path: url.pathname, action: 'refused-broken-part', body: safeJson(req) });
      return route.fulfill({ status: 409, contentType: 'application/json',
        body: JSON.stringify({ success: false, intercepted: true, error: 'test guard: part is listed broken or hazardous' }) });
    }
    if (matches(DRY_RUN, method, url.pathname)) {
      url.searchParams.set('dryRun', '1');
      log.push({ method, path: url.pathname, action: 'dry-run', body: safeJson(req) });
      return route.continue({ url: url.toString() });
    }
    if (matches(INTERCEPTED, method, url.pathname)) {
      const body = safeJson(req);
      log.push({ method, path: url.pathname, action: 'intercepted', body });
      const enabled = body && typeof body.enabled === 'boolean' ? body.enabled : undefined;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, intercepted: true, ...(enabled !== undefined ? { enabled } : {}) }),
      });
    }
    return route.continue();
  });
}

function safeJson(req) {
  try { return req.postDataJSON(); } catch { return req.postData() || null; }
}

export const test = base.extend({
  hazardGuard: [true, { option: true }],

  // Every guarded request this test made (method, path, action, body).
  hazards: async ({}, use) => { await use([]); },

  // Patch the worker's browser so contexts a spec creates itself
  // (browser.newPage / newContext in beforeAll) are guarded too.
  browser: [async ({ browser }, use) => {
    if (!browser.__mbGuardPatched) {
      const original = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const ctx = await original(...args);
        if (test.__guardOn !== false) await installHazardGuard(ctx);
        return ctx;
      };
      browser.__mbGuardPatched = true;
    }
    await use(browser);
  }, { scope: 'worker' }],

  context: async ({ context, hazardGuard, hazards }, use) => {
    test.__guardOn = hazardGuard;
    test.__sharedLog = hazards;
    context.__mbLog = hazards;
    context.__mbGuardOff = !hazardGuard;
    if (hazardGuard) await installHazardGuard(context);
    await use(context);
  },

  // Operator files must be byte-identical when the worker finishes, and no
  // broken/hazard part may have been commanded. Browser writes are all made by
  // the server, so nothing is auto-restored here (the guard cannot tell a spec's
  // write from a concurrent operator's): differences fail the run and the
  // pre-run snapshot is kept for a by-hand restore.
  liveDataGuard: [async ({}, use) => {
    const guard = process.env.MB_TEST_GUARD === 'off' ? null : startGuard({ track: false });
    const offsets = logOffsets();
    await use(guard);
    if (!guard) return;
    const hits = await brokenPartCommands(offsets);
    // The live service rewrites these on its own (library rescan at every start,
    // actuator positions after any motion, e.g. a fleet-event rehearsal), so a
    // browser run cannot attribute them; they are not reported here.
    const SERVICE_WRITTEN = new Set(['data/audio-library/library.json', 'data/actuator-positions.json']);
    const report = guard.diff().filter(r => !SERVICE_WRITTEN.has(r.rel.split(path.sep).join('/')));
    guard.finish(report);
    const problems = [];
    if (hits.length) problems.push('commanded a broken/hazard part:\n  ' + hits.join('\n  '));
    if (report.length) problems.push(`changed live operator data (snapshot kept at ${guard.runDir}):\n` +
      report.map(r => `  ${r.rel}: ${r.reason}`).join('\n'));
    if (problems.length) throw new Error('[live-data-guard] browser specs ' + problems.join('\n'));
  }, { scope: 'worker', auto: true }],
});

// Specs created with browser.newPage() in beforeAll run before any test's
// `context` fixture; default their log to a module-level array.
test.__sharedLog = [];

export { expect };
