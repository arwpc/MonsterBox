#!/usr/bin/env node
/**
 * Orchestration page diagnostic harness.
 *
 * Loads /orchestration in a real Chromium, records every console message, page
 * error, and request timing, then reports the things that actually make the page
 * feel broken: requests that sat in the connection queue, endpoints that 500,
 * and how long the fleet poll really takes.
 *
 * Read-only by design. It never clicks a control that would reach hardware
 * (say/ask/play/volume/superpower/stop) — see SAFE_CLICKS in run().
 *
 *   node scripts/diag-orchestration.mjs [--url https://localhost:3000/orchestration] [--seconds 45]
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
    const i = args.indexOf('--' + name);
    return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const URL_ = argOf('url', 'https://localhost:3000/orchestration');
const SECONDS = parseInt(argOf('seconds', '45'), 10);
// Control experiment: same page, but every MJPEG stream request is aborted at the
// browser. If the fleet poll gets fast, the streams were the thing starving it.
const NO_CAMS = args.includes('--no-cams');

const t0 = Date.now();
const console_ = [];
const pageErrors = [];
const requests = new Map();
const finished = [];

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

if (NO_CAMS) {
    await page.route('**/webcam-stream*', route => route.abort());
}

page.on('console', (m) => console_.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
page.on('request', (r) => requests.set(r, Date.now()));
const pollLog = [];
page.on('requestfinished', async (r) => {
    const started = requests.get(r) || Date.now();
    let status = null;
    try { status = (await r.response())?.status() ?? null; } catch (_) { /* gone */ }
    const ms = Date.now() - started;
    finished.push({ url: r.url(), method: r.method(), status, ms, failed: false });
    // Record what the fleet poll ACTUALLY returned, so a wrong pill can be blamed
    // on the server or on the browser rather than guessed at.
    if (r.url().includes('/fleet-health')) {
        try {
            const b = await (await r.response()).json();
            pollLog.push(`t+${String(Math.round((Date.now() - t0) / 100) / 10).padStart(5)}s took ${String(ms).padStart(5)}ms -> online ${b.online}/${b.total}` +
                (b.online < b.total ? ' OFFLINE: ' + b.nodes.filter(n => !n.online).map(n => n.name + '(' + (n.error || '?') + ')').join(', ') : ''));
        } catch (_) { /* body gone */ }
    }
});
page.on('requestfailed', (r) => {
    const started = requests.get(r) || Date.now();
    finished.push({ url: r.url(), method: r.method(), status: null, ms: Date.now() - started, failed: true, err: r.failure()?.errorText });
});

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
const domReady = Date.now() - t0;

// Let the page live long enough to complete several poll cycles.
await page.waitForTimeout(SECONDS * 1000);

const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const longTasks = performance.getEntriesByType('longtask') || [];
    return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
        longTaskCount: longTasks.length,
        longTaskMs: Math.round(longTasks.reduce((a, t) => a + t.duration, 0)),
        cards: document.querySelectorAll('.fcc-card').length,
        // A camera counts as WORKING only if it is painting pixels: a decoded frame
        // with real dimensions, actually visible. "the request returned 200" is not proof.
        camsPainting: Array.from(document.querySelectorAll('.fcc-cam-wrap img'))
            .filter(i => i.naturalWidth > 0 && !i.classList.contains('fcc-invisible')).length,
        camWraps: document.querySelectorAll('.fcc-cam-wrap img').length,
        // Only overlays the operator can actually SEE.
        camOffText: Array.from(document.querySelectorAll('.fcc-cam-off'))
            .filter(e => !e.classList.contains('fcc-hidden') && e.offsetParent !== null)
            .map(e => e.textContent.trim()),
        onlinePill: (document.querySelector('#fleetCount') || {}).textContent || null,
    };
});

const bucket = (u) => {
    try { return new URL(u).pathname.replace(/\/\d+\//, '/:id/').replace(/\?.*$/, ''); }
    catch (_) { return u; }
};
const byPath = new Map();
for (const f of finished) {
    const k = bucket(f.url);
    const e = byPath.get(k) || { path: k, n: 0, max: 0, total: 0, bad: 0, statuses: new Set() };
    e.n++; e.total += f.ms; e.max = Math.max(e.max, f.ms);
    if (f.failed || (f.status && f.status >= 400)) e.bad++;
    if (f.status) e.statuses.add(f.status);
    if (f.err) e.statuses.add(f.err);
    byPath.set(k, e);
}

console.log(`\n=== ${URL_} — ${SECONDS}s observation ===`);
console.log(`DOM ready in ${domReady}ms | load ${metrics.load}ms | long tasks: ${metrics.longTaskCount} (${metrics.longTaskMs}ms total)`);
console.log(`cards=${metrics.cards} camsPainting=${metrics.camsPainting}/${metrics.camWraps} pill="${metrics.onlinePill}"`);
if (metrics.camOffText.filter(Boolean).length) console.log(`cam overlays: ${JSON.stringify(metrics.camOffText.filter(Boolean))}`);

console.log('\n--- requests by path (n / avg / MAX ms / bad) ---');
[...byPath.values()].sort((a, b) => b.max - a.max).forEach(e => {
    console.log(`  ${String(e.max).padStart(6)}ms max  ${String(Math.round(e.total / e.n)).padStart(6)}ms avg  n=${String(e.n).padStart(3)}  bad=${e.bad}  ${e.path}  [${[...e.statuses].join(',')}]`);
});

console.log('\n--- fleet-health polls (what the SERVER actually returned) ---');
pollLog.forEach(l => console.log('  ' + l));

const errs = console_.filter(c => c.type === 'error');
console.log(`\n--- console errors: ${errs.length} ---`);
[...new Set(errs.map(e => e.text))].slice(0, 15).forEach(t => console.log('  ' + t.slice(0, 160)));
if (pageErrors.length) {
    console.log(`\n--- uncaught page errors: ${pageErrors.length} ---`);
    [...new Set(pageErrors)].forEach(t => console.log('  ' + t.slice(0, 200)));
}

await page.screenshot({ path: '/tmp/orch-shot.png', fullPage: false });
console.log('\nscreenshot -> /tmp/orch-shot.png');

await browser.close();
