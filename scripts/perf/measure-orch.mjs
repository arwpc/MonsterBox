// Measure, in a REAL browser, how long a superpower toggle takes on the Fleet
// Command Center while the camera wall is running, under emulated WiFi.
//   BASE=https://<node-ip>:3000 RTT=40 DOWN_MBPS=15 node scripts/perf/measure-orch.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3100';
const RTT = parseInt(process.env.RTT || '40', 10);
const DOWN = parseFloat(process.env.DOWN_MBPS || '15');
const WALL = process.env.WALL !== '0';
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
if (RTT > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: DOWN * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 });
const inflight = new Map(); const done = [];
page.on('request', r => inflight.set(r, Date.now()));
const fin = r => { const t0 = inflight.get(r); inflight.delete(r); done.push({ url: r.url(), ms: Date.now() - t0, m: r.method() }); };
page.on('requestfinished', fin); page.on('requestfailed', fin);
const t0 = Date.now();
await page.goto(BASE + '/orchestration', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.fcc-card', { timeout: 30000 });
console.log(`RTT=${RTT}ms down=${DOWN}Mbps wall=${WALL}: first card at`, Date.now() - t0, 'ms');
if (!WALL) await page.evaluate(() => document.querySelectorAll('.fcc-cam-wrap img').forEach(i => { i.dataset.camWanted = ''; delete i.dataset.camWanted; }));
await page.waitForTimeout(8000);
const snapAt = () => [...inflight.keys()].map(r => r.url().replace(BASE, '')).filter(u => !/\.(js|css|png|woff2?)/.test(u));
const results = [];
for (let i = 0; i < 6; i++) {
  const before = snapAt();
  const ms = await page.evaluate(async () => {
    const t = performance.now();
    const r = await fetch('/api/orchestration/superpower/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    await r.json();
    return Math.round(performance.now() - t);
  });
  results.push({ ms, inflightBefore: before.length });
  await page.waitForTimeout(900);
}
console.log('toggle round-trips (ms):', results.map(r => r.ms).join(' '), ' inflight-at-click:', results.map(r => r.inflightBefore).join(' '));
const snaps = done.filter(d => /webcam-snapshot/.test(d.url));
const healthCalls = done.filter(d => /fleet-health|\/nodes(\?|$)/.test(d.url));
const stat = arr => arr.length ? { n: arr.length, avg: Math.round(arr.reduce((a, b) => a + b.ms, 0) / arr.length), max: Math.max(...arr.map(d => d.ms)) } : null;
console.log('snapshots:', JSON.stringify(stat(snaps)), 'per-node:', JSON.stringify(Object.fromEntries([1,2,3,4,5,6].map(id => [id, stat(snaps.filter(d => d.url.includes('/animatronic/' + id + '/')))]))));
console.log('fleet-health/nodes (ms):', healthCalls.map(h => h.ms).join(' '));
await browser.close();
