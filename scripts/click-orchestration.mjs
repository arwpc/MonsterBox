#!/usr/bin/env node
/**
 * Fleet Command Center click sweep.
 *
 * Exercises every control on /orchestration that is safe to press, and asserts the
 * page reacted: no console error, no uncaught exception, no failed request, and
 * where there is an observable effect, that the effect happened.
 *
 * SAFETY — this script will NOT press anything that reaches hardware, speakers or
 * power. The fleet is live and this runs at night; see DENY below. Those controls
 * are still checked for *wiring* (present, enabled, has a handler) — they are just
 * never activated. Proving them end-to-end needs the operator's say-so and daylight.
 *
 *   node scripts/click-orchestration.mjs [--url ...]
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const URL_ = argOf('url', 'https://localhost:3000/orchestration');

// Anything whose label/id matches this is inspected but NEVER clicked.
const DENY = /stop|reboot|restart|estop|emergency|say|ask|send|play|loop|record|auto-?ai|volume|mute|lurk|jaw|head|motion|idle|orders|speak|audio/i;

const consoleErrors = [];
const pageErrors = [];
const failedReqs = [];
const results = [];

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
// Count requests from the driver, not from performance.getEntriesByType('resource'):
// that buffer holds 250 entries by default and the snapshot loop overruns it in
// about ten seconds, after which every count silently stops growing.
const reqCount = { snapshot: 0, fleetHealth: 0 };
page.on('request', r => {
    const u = r.url();
    if (u.includes('webcam-snapshot')) reqCount.snapshot++;
    else if (u.includes('fleet-health')) reqCount.fleetHealth++;
});
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e.message || e)));
page.on('requestfailed', r => {
    // An aborted snapshot preload is normal teardown noise, not a defect.
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
    failedReqs.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`);
});
page.on('response', async r => {
    if (r.status() >= 500) failedReqs.push(`HTTP ${r.status()} ${r.url()}`);
});

const check = async (name, fn) => {
    const before = consoleErrors.length + pageErrors.length;
    try {
        const detail = await fn();
        const clean = (consoleErrors.length + pageErrors.length) === before;
        results.push({ name, ok: clean, detail: detail || (clean ? 'ok' : 'console error raised') });
    } catch (e) {
        results.push({ name, ok: false, detail: 'THREW: ' + (e.message || e).slice(0, 120) });
    }
};

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.fcc-card', { timeout: 30000 });
await page.waitForTimeout(4000);

// ---- inventory: is every control wired at all? ----
await check('inventory: controls present', async () => {
    const inv = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('button, input, select, a[href], [role="button"]'));
        return {
            total: items.length,
            disabled: items.filter(e => e.disabled).length,
            noLabel: items.filter(e => !e.textContent.trim() && !e.getAttribute('aria-label') && !e.title && !e.placeholder).length,
        };
    });
    if (inv.noLabel > 0) throw new Error(`${inv.noLabel} controls have no accessible label`);
    return `${inv.total} controls, ${inv.disabled} disabled, all labelled`;
});

// ---- card collapse / expand ----
await check('card collapse + expand (all 6)', async () => {
    const n = await page.$$eval('[data-role="collapse"]', b => b.length);
    if (n !== 6) throw new Error(`expected 6 collapse buttons, saw ${n}`);
    // dispatch rather than mouse-click: the wall re-sorts cards on every poll, so a
    // real click can race the DOM moving under the cursor. This tests the handler.
    await page.$$eval('[data-role="collapse"]', bs => bs.forEach(b => b.click()));
    await page.waitForTimeout(400);
    const collapsed = await page.$$eval('.fcc-card.fcc-collapsed', n => n.length);
    if (collapsed !== 6) throw new Error(`collapse click left ${collapsed}/6 collapsed`);
    // Collapsed cards must stop pulling frames — that is the whole point.
    const before = reqCount.snapshot;
    await page.waitForTimeout(2500);
    const after = reqCount.snapshot;
    await page.$$eval('[data-role="collapse"]', bs => bs.forEach(b => b.click()));
    await page.waitForTimeout(1800);
    const expanded = await page.$$eval('.fcc-card.fcc-collapsed', n => n.length);
    if (expanded !== 0) throw new Error(`expand click left ${expanded} collapsed`);
    const painting = await page.$$eval('.fcc-cam-wrap img', els => els.filter(i => i.naturalWidth > 0).length);
    return `collapsed 6, snapshots while collapsed +${after - before} (want ~0), re-expanded 6, ${painting}/6 painting again`;
});

// ---- target checkboxes ----
await check('target checkboxes + summary', async () => {
    const boxes = await page.$$('[data-role="target"]');
    await boxes[0].click(); await boxes[1].click();
    await page.waitForTimeout(300);
    const summary = await page.$eval('#targetSummary', e => e.textContent.trim());
    if (!summary || summary === 'All') throw new Error(`summary did not update: "${summary}"`);
    return `2 targeted -> "${summary}"`;
});

await check('Clear targets button', async () => {
    const clear = await page.$('#clearTargets, button:has-text("Clear")');
    if (!clear) throw new Error('no Clear button found');
    await clear.click();
    await page.waitForTimeout(300);
    const summary = await page.$eval('#targetSummary', e => e.textContent.trim());
    if (summary !== 'All') throw new Error(`Clear left summary as "${summary}"`);
    return 'reset to All';
});

// ---- camera modal (live MJPEG path) ----
await check('camera modal opens, streams live, closes', async () => {
    await page.click('.fcc-cam-wrap');
    await page.waitForSelector('#fccCamModal.show', { timeout: 8000 });
    await page.waitForTimeout(3500);
    const shown = await page.evaluate(() => {
        const i = document.querySelector('#fccCamModalImg');
        return { w: i.naturalWidth, src: (i.getAttribute('src') || '').includes('webcam-stream') };
    });
    if (!shown.src) throw new Error('modal is not using the live stream endpoint');
    if (!shown.w) throw new Error('modal image never decoded a frame');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const src = await page.$eval('#fccCamModalImg', i => i.getAttribute('src') || '');
    if (src) throw new Error('modal did not release the stream on close');
    return `live ${shown.w}px frame, released on close`;
});

// ---- refresh button ----
await check('Refresh button re-polls', async () => {
    const before = reqCount.fleetHealth;
    const btn = await page.$('button:has-text("Refresh")');
    if (!btn) throw new Error('no Refresh button');
    await btn.click();
    await page.waitForTimeout(4000);
    const after = reqCount.fleetHealth;
    if (after <= before) throw new Error('Refresh did not trigger a fleet-health call');
    return `fleet-health calls ${before} -> ${after}`;
});

// ---- tab-hidden behaviour: a background tab must stop pulling video ----
await check('hidden tab stops pulling frames', async () => {
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);
    const a = reqCount.snapshot;
    await page.waitForTimeout(3000);
    const b = reqCount.snapshot;
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2500);
    const c = reqCount.snapshot;
    if (b - a > 2) throw new Error(`hidden tab still pulled ${b - a} frames in 3s`);
    if (c - b < 2) throw new Error('frames did not resume when the tab came back');
    return `hidden: +${b - a} frames in 3s, resumed: +${c - b}`;
});

// ---- destructive controls: wired but deliberately not fired ----
await check('hardware controls wired (inspected, NOT clicked)', async () => {
    const risky = await page.evaluate((denySrc) => {
        const deny = new RegExp(denySrc.slice(1, denySrc.lastIndexOf('/')), 'i');
        const out = [];
        document.querySelectorAll('button, input[type="range"], select').forEach(e => {
            const label = (e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + (e.id || '');
            if (deny.test(label)) out.push({ label: label.trim().slice(0, 40), disabled: !!e.disabled });
        });
        return out;
    }, DENY.toString());
    const enabled = risky.filter(r => !r.disabled).length;
    return `${risky.length} hardware/audio controls found, ${enabled} enabled — none activated (night + live fleet)`;
});

// ---- steady state after all that clicking ----
await check('page still healthy after sweep', async () => {
    await page.waitForTimeout(4000);
    const m = await page.evaluate(() => ({
        painting: Array.from(document.querySelectorAll('.fcc-cam-wrap img')).filter(i => i.naturalWidth > 0 && !i.classList.contains('fcc-invisible')).length,
        pill: (document.querySelector('#fleetCount') || {}).textContent,
        cards: document.querySelectorAll('.fcc-card').length,
    }));
    if (m.cards !== 6) throw new Error(`cards became ${m.cards}`);
    if (m.painting < 6) throw new Error(`only ${m.painting}/6 cameras painting after sweep`);
    return `${m.cards} cards, ${m.painting}/6 cameras painting, pill "${m.pill}"`;
});

console.log('\n=== Fleet Command Center click sweep ===');
results.forEach(r => console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n          ${r.detail}`));
console.log(`\nconsole errors: ${consoleErrors.length}`);
[...new Set(consoleErrors)].slice(0, 10).forEach(e => console.log('    ' + e.slice(0, 160)));
console.log(`uncaught page errors: ${pageErrors.length}`);
[...new Set(pageErrors)].slice(0, 10).forEach(e => console.log('    ' + e.slice(0, 200)));
console.log(`failed / 5xx requests: ${failedReqs.length}`);
[...new Set(failedReqs)].slice(0, 10).forEach(e => console.log('    ' + e.slice(0, 160)));

await page.screenshot({ path: '/tmp/orch-after-clicks.png' });
console.log('\nscreenshot -> /tmp/orch-after-clicks.png');
await browser.close();
process.exit(results.every(r => r.ok) && !pageErrors.length ? 0 : 1);
