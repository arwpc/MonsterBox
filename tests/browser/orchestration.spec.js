/**
 * Fleet Command Center — Browser E2E Tests (v8.5.0)
 * Tests the multi-animatronic orchestration UI at /orchestration.
 */

import { test, expect } from '@playwright/test';
import { testNavigation, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Fleet Command Center', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/orchestration`, 'Orchestration');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('loads with the correct title and heading', async () => {
        expect(await page.title()).toContain('Orchestration');
        // Heading level is presentation, not contract: it moved h4 -> h1 in the
        // design-system pass. Assert the page says what it is, at whatever level.
        await expect(page.getByText('Fleet Command Center').first()).toBeVisible();
    });

    test('shows the command log with a ready message', async () => {
        const logPanel = page.locator('#commandLog');
        await expect(logPanel).toBeVisible();
        await expect(logPanel).toContainText('ready');
    });

    test('shows the fleet health rollup pill', async () => {
        await expect(page.locator('#fleetPill')).toBeVisible();
        // populates to "N / M online" after the first fetch
        await expect(page.locator('#fleetCount')).toContainText('online', { timeout: 10000 });
    });

    // Was "all six" and asserted 6 — `orders` was added with the fleet prompt box and
    // this went red on a page that was working correctly; then `aiMotion` was added
    // and it went red again on a bare count. Name the set and report the stranger
    // by name, so the next addition fails with "aiMotion is not in the list", not "8".
    const MASTER_TOGGLES = ['lurk', 'jaw', 'head', 'aiMotion', 'motion', 'idle', 'mute', 'orders'];
    test('shows every superpower master toggle', async () => {
        for (const sp of MASTER_TOGGLES) {
            await expect(page.locator(`.fcc-sp[data-sp="${sp}"]`)).toBeVisible();
        }
        const onPage = await page.locator('.fcc-sp').evaluateAll(els => els.map(e => e.getAttribute('data-sp')));
        const strangers = onPage.filter(sp => !MASTER_TOGGLES.includes(sp));
        expect(strangers, `superpower toggles not in MASTER_TOGGLES: ${strangers.join(', ')}`).toEqual([]);
        expect(onPage.length).toBe(MASTER_TOGGLES.length);
    });

    test('shows the transport + panic controls', async () => {
        await expect(page.locator('#startLoops')).toBeVisible();
        await expect(page.locator('#stopLoops')).toBeVisible();
        await expect(page.locator('#estop')).toBeVisible();
        await expect(page.locator('#estop')).toContainText('EMERGENCY STOP');
    });

    test('shows master volume, say-all, and target controls', async () => {
        await expect(page.locator('#masterVol')).toBeVisible();
        await expect(page.locator('#sayAllText')).toBeVisible();
        await expect(page.locator('#sayAllBtn')).toBeVisible();
        await expect(page.locator('#targetSummary')).toContainText('All');
    });

    test('renders node cards after the fleet fetch', async () => {
        tracker.clear();
        await page.waitForSelector('.fcc-card', { timeout: 15000 });
        const count = await page.locator('.fcc-card').count();
        expect(count).toBeGreaterThan(0);
        // each card exposes a target checkbox and health line
        await expect(page.locator('[data-role="target"]').first()).toBeVisible();
        await tracker.logErrors();
    });

    test('shows the discovery panel and pin form', async () => {
        await expect(page.locator('#discoveryState')).toContainText('mDNS');
        await expect(page.locator('#pinForm')).toBeVisible();
        await expect(page.locator('#pinIp')).toBeVisible();
    });

    test('shows the goblin row', async () => {
        await expect(page.locator('#goblinRow')).toBeVisible();
    });

    test('clears the command log', async () => {
        await page.locator('#clearLog').click();
        const logText = await page.locator('#commandLog').textContent();
        expect(logText.trim().length).toBeLessThan(5);
    });

    test('selecting a node updates the target summary', async () => {
        await page.waitForSelector('[data-role="target"]', { timeout: 15000 });
        const cb = page.locator('[data-role="target"]').first();
        await cb.check();
        await expect(page.locator('#targetSummary')).not.toHaveText('All');
        await page.locator('#clearTargets').click();
        await expect(page.locator('#targetSummary')).toHaveText('All');
    });

    test("double-clicking a node name opens that node's dashboard in a new tab", async () => {
        await page.waitForSelector('.fcc-card .fcc-name-link', { timeout: 15000 });
        // Stub window.open: the fleet IPs are not reachable from CI, so capture
        // the URL the handler builds instead of letting a dead tab open.
        await page.evaluate(() => {
            window.__opened = [];
            window.open = (url, target) => { window.__opened.push({ url, target }); return null; };
        });
        await page.locator('.fcc-card .fcc-name-link').first().dblclick();
        const opened = await page.evaluate(() => window.__opened);
        expect(opened.length).toBe(1);
        // The node's own dashboard root, over HTTPS, at its registry ip:port.
        expect(opened[0].url).toMatch(/^https:\/\/\d+\.\d+\.\d+\.\d+:\d+\/$/);
        expect(opened[0].target).toBe('_blank');
    });

    test('has no console/page errors on load', async () => {
        tracker.clear();
        await page.waitForTimeout(3000);
        await tracker.assertNoErrors();
    });

    test('exposes interactive elements', async () => {
        const elements = await getAllInteractiveElements(page);
        expect(elements.length).toBeGreaterThan(0);
    });
});
