#!/usr/bin/env node
/**
 * Read-only browser instrumentation for a MonsterBox page.
 *
 * Loads a page in real Chromium and records everything that would otherwise only be
 * visible to someone sitting in front of it: console output, uncaught exceptions,
 * failed requests, HTTP error responses, navigation/paint timing, layout shift,
 * long tasks, and DOM/overflow stats at several viewports.
 *
 * DELIBERATELY READ-ONLY. It never clicks. The orchestration page carries fleet
 * controls (emergency stop, queue start, superpower fan-out, volume) and a stray
 * click would fire real commands at real animatronics.
 *
 * Usage: node scripts/ui-instrument.mjs <url> <outdir> [settleMs]
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2];
const outDir = process.argv[3];
const settleMs = Number(process.argv[4] || 9000);

if (!url || !outDir) {
  console.error('usage: node scripts/ui-instrument.mjs <url> <outdir> [settleMs]');
  process.exit(2);
}

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'phone-390', width: 390, height: 844 },
];

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const report = { url, capturedAt: new Date().toISOString(), viewports: [] };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const console_ = [];
  const pageErrors = [];
  const failed = [];
  const httpErrors = [];

  page.on('console', (m) => {
    const loc = m.location();
    console_.push({
      type: m.type(),
      text: m.text().slice(0, 600),
      url: loc.url,
      line: loc.lineNumber,
    });
  });
  page.on('pageerror', (e) => pageErrors.push({ message: String(e.message).slice(0, 800), stack: String(e.stack || '').slice(0, 1200) }));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), method: r.method(), failure: r.failure()?.errorText }));
  page.on('response', (r) => {
    if (r.status() >= 400) httpErrors.push({ url: r.url(), status: r.status(), method: r.request().method() });
  });

  // Observers must be installed before any page script runs.
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });

  const t0 = Date.now();
  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    navError = String(e.message).slice(0, 400);
  }
  const domContentLoadedMs = Date.now() - t0;

  // Let polling / fetch-on-interval code run so its failures surface.
  await page.waitForTimeout(settleMs);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = {};
    for (const p of performance.getEntriesByType('paint')) paints[p.name] = Math.round(p.startTime);
    const res = performance.getEntriesByType('resource');
    const byType = {};
    let transfer = 0;
    for (const r of res) {
      byType[r.initiatorType] = (byType[r.initiatorType] || 0) + 1;
      transfer += r.transferSize || 0;
    }
    const slowest = res
      .map((r) => ({ name: String(r.name).slice(-90), dur: Math.round(r.duration), size: r.transferSize || 0 }))
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 12);

    // Layout / design signals
    const docW = document.documentElement.clientWidth;
    const overflowing = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > docW + 2 || r.left < -2)) {
        overflowing.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 70),
          right: Math.round(r.right),
          docW,
        });
      }
      if (overflowing.length > 25) break;
    }
    const tiny = [];
    for (const el of document.querySelectorAll('button, a, [role=button], input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
        tiny.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
      }
      if (tiny.length > 25) break;
    }
    const imgsNoAlt = [...document.querySelectorAll('img:not([alt])')].length;
    const btnsNoLabel = [...document.querySelectorAll('button')].filter(
      (b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')
    ).length;
    const inputsNoLabel = [...document.querySelectorAll('input,select,textarea')].filter((i) => {
      if (i.type === 'hidden') return false;
      if (i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title')) return false;
      if (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) return false;
      return !i.closest('label');
    }).length;

    return {
      nav: {
        domInteractiveMs: Math.round(nav.domInteractive || 0),
        domCompleteMs: Math.round(nav.domComplete || 0),
        loadEventMs: Math.round(nav.loadEventEnd || 0),
        transferBytes: nav.transferSize || 0,
      },
      paints,
      cls: Number((window.__cls || 0).toFixed(4)),
      longTasks: (window.__longTasks || []).slice(0, 20),
      longTaskCount: (window.__longTasks || []).length,
      longTaskTotalMs: (window.__longTasks || []).reduce((a, b) => a + b.dur, 0),
      resourceCount: res.length,
      resourceByType: byType,
      resourceTransferBytes: transfer,
      slowestResources: slowest,
      dom: {
        nodes: document.querySelectorAll('*').length,
        scripts: document.querySelectorAll('script').length,
        inlineScripts: [...document.querySelectorAll('script')].filter((s) => !s.src).length,
        stylesheets: document.querySelectorAll('link[rel=stylesheet]').length,
        title: document.title,
        h1Count: document.querySelectorAll('h1').length,
        buttons: document.querySelectorAll('button').length,
      },
      design: { overflowing, tinyTargets: tiny, imgsNoAlt, btnsNoLabel, inputsNoLabel },
      bodyTextSample: (document.body.innerText || '').slice(0, 1500),
    };
  }).catch((e) => ({ evalError: String(e.message).slice(0, 300) }));

  const shot = path.join(outDir, `${vp.name}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

  report.viewports.push({
    viewport: vp,
    navError,
    domContentLoadedMs,
    console: console_,
    consoleErrors: console_.filter((c) => c.type === 'error'),
    consoleWarnings: console_.filter((c) => c.type === 'warning'),
    pageErrors,
    failedRequests: failed,
    httpErrors,
    metrics,
    screenshot: shot,
  });

  await context.close();
}

await browser.close();
const outFile = path.join(outDir, 'report.json');
await fs.writeFile(outFile, JSON.stringify(report, null, 2));

// Console summary
for (const v of report.viewports) {
  console.log(
    `${v.viewport.name.padEnd(14)} dcl=${String(v.domContentLoadedMs).padStart(5)}ms ` +
      `errs=${v.consoleErrors.length} warns=${v.consoleWarnings.length} ` +
      `pageErr=${v.pageErrors.length} failedReq=${v.failedRequests.length} http4xx5xx=${v.httpErrors.length} ` +
      `cls=${v.metrics?.cls ?? '?'} longTasks=${v.metrics?.longTaskCount ?? '?'}(${v.metrics?.longTaskTotalMs ?? '?'}ms) ` +
      `overflow=${v.metrics?.design?.overflowing?.length ?? '?'}`
  );
}
console.log(`\nreport: ${outFile}`);
