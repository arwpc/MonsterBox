// Initial-load waterfall of a page under emulated WiFi: what blocks first paint of real content?
//   PAGE=/orchestration node scripts/perf/waterfall.mjs
//   BASE=http://localhost:3100 PAGE=/ READY='#scenesContainer li' RTT=40 node scripts/perf/waterfall.mjs
// Columns: start -> end (browser timing), total, ttfb (request sent -> first response byte),
// status, wire KB (encoded), decoded KB, type, url. RTT=0 disables emulation.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3100';
const PAGE = process.env.PAGE || '/orchestration';
const READY = process.env.READY || '.fcc-card';
const READY_STATE = process.env.READY_STATE || 'visible'; // 'attached' for content inside a collapsed panel
const RTT = parseInt(process.env.RTT || '40', 10);
const DOWN_MBPS = parseFloat(process.env.DOWN_MBPS || '15');
const SETTLE_MS = parseInt(process.env.SETTLE_MS || '500', 10);
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
if (RTT > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: DOWN_MBPS * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 });
const wire = new Map(); // requestId -> encoded bytes, from CDP (Playwright only exposes decoded bodies)
cdp.on('Network.loadingFinished', e => wire.set(e.requestId, e.encodedDataLength));
const reqIds = new Map();
cdp.on('Network.requestWillBeSent', e => reqIds.set(e.request.url + '|' + e.requestId, e.requestId));
const t0 = Date.now(); const rows = [];
page.on('request', r => { r.__t = Date.now() - t0; });
const fin = async r => {
  const resp = await r.response().catch(() => null);
  const timing = r.timing();
  const b = resp ? await resp.body().catch(() => null) : null;
  const start = timing && timing.startTime > 0 ? Math.round(timing.startTime - navStart) : r.__t;
  const end = timing && timing.responseEnd >= 0 ? Math.round(start + timing.responseEnd) : Date.now() - t0;
  const ttfb = timing && timing.responseStart >= 0 && timing.requestStart >= 0 ? Math.round(timing.responseStart - timing.requestStart) : -1;
  const enc = resp ? (await resp.headerValue('content-length').catch(() => null)) : null;
  rows.push({ start, end, ttfb, url: r.url().replace(BASE, ''), status: resp ? resp.status() : 'fail', kb: b ? Math.round(b.length / 1024) : 0, wire: enc != null ? Math.round(parseInt(enc, 10) / 1024) : -1, type: r.resourceType() });
};
let navStart = 0;
page.on('request', r => { if (!navStart && r.isNavigationRequest()) { const t = r.timing(); navStart = t && t.startTime > 0 ? t.startTime : 0; } });
page.on('requestfinished', fin); page.on('requestfailed', fin);
await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded' });
const dcl = Date.now() - t0;
let ready = null; try { await page.waitForSelector(READY, { timeout: 30000, state: READY_STATE }); ready = Date.now() - t0; } catch { ready = 'never'; }
await page.waitForTimeout(SETTLE_MS);
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), ttfb: Math.round(n.responseStart) } : null; });
// Browser timing is absolute epoch ms; rebase every row on the earliest request (the document).
const base = rows.reduce((m, r) => Math.min(m, r.start), Infinity);
rows.forEach(r => { r.start -= base; r.end -= base; });
console.log(`${PAGE}  DOMContentLoaded=${dcl}ms(wall) nav.dcl=${nav && nav.dcl}ms nav.load=${nav && nav.load}ms doc.ttfb=${nav && nav.ttfb}ms  ready(${READY})=${ready}ms  emu=${RTT > 0 ? RTT + 'ms/' + DOWN_MBPS + 'Mbps' : 'off'}`);
rows.sort((a, b) => a.start - b.start).forEach(r => console.log(String(r.start).padStart(5), '->', String(r.end).padStart(5), String(r.end - r.start).padStart(5) + 'ms', 'ttfb' + String(r.ttfb).padStart(4), String(r.status).padStart(4), (r.wire >= 0 ? String(r.wire) : '?').padStart(4) + 'KBw', String(r.kb).padStart(4) + 'KB', r.type.padEnd(10), r.url.slice(0, 90)));
await browser.close();
