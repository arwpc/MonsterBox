/**
 * Control bar + responsive layer
 * ==============================
 * The control bar is the one piece of chrome that must behave identically on
 * every page: it carries the stop-everything control. If it is missing, hidden,
 * or overlapped on any page or any viewport, an operator standing next to a
 * moving animatronic cannot stop it — so these tests assert presence,
 * reachability and non-overlap rather than appearance.
 *
 * Run: npx playwright test tests/browser/control-bar-responsive.spec.js
 */

import { test, expect } from '@playwright/test';

// Every page that renders the shared layout. The conversation view deliberately
// opts out because it carries its own richer operator bar.
const PAGES = [
  { path: '/', name: 'dashboard', expectsGlobalBar: false },
  { path: '/scenes', name: 'animation studio', expectsGlobalBar: true },
  { path: '/poses/editor', name: 'pose editor', expectsGlobalBar: true },
  { path: '/setup/calibration', name: 'calibration', expectsGlobalBar: true },
  { path: '/orchestration', name: 'fleet', expectsGlobalBar: true },
  { path: '/audio-library', name: 'audio library', expectsGlobalBar: true },
  { path: '/setup/system', name: 'system', expectsGlobalBar: true }
];

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];

async function ready(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('Global control bar', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}px)`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const target of PAGES.filter((p) => p.expectsGlobalBar)) {
        test(`${target.name} shows a reachable stop control`, async ({ page }) => {
          await page.goto(target.path);
          await ready(page);

          const bar = page.locator('#mbControlBar');
          await expect(bar, 'control bar should render').toHaveCount(1);
          await expect(bar).toBeVisible();

          const stop = page.locator('#mbStopEverything');
          await expect(stop, 'stop control should be present').toBeVisible();

          // It must be inside the viewport without scrolling — a stop control you
          // have to scroll to find is not a stop control.
          const box = await stop.boundingBox();
          expect(box, 'stop control should have a box').not.toBeNull();
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

          // Touch-sized on small screens, where it is hit under pressure.
          if (viewport.width <= 768) {
            expect(box.height, 'stop must be a comfortable touch target').toBeGreaterThanOrEqual(40);
          }
        });
      }

      test('page never scrolls sideways', async ({ page }) => {
        // Horizontal overflow is the classic responsive failure and makes a
        // fixed bottom bar drift out of reach.
        for (const target of PAGES) {
          await page.goto(target.path);
          await ready(page);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          expect(overflow, `${target.path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});

test.describe('Control bar behaviour', () => {
  test('does not cover page content', async ({ page }) => {
    await page.goto('/scenes');
    await ready(page);
    // The layout reserves space via body.mb-has-control-bar; without it the bar
    // sits on top of the last element on the page.
    const hasClass = await page.evaluate(() =>
      document.body.classList.contains('mb-has-control-bar')
    );
    expect(hasClass, 'body should reserve space for the fixed bar').toBe(true);

    const padding = await page.evaluate(() =>
      parseInt(getComputedStyle(document.body).paddingBottom, 10)
    );
    expect(padding, 'body needs bottom padding equal to the bar height').toBeGreaterThan(40);
  });

  test('reports live server health rather than a hardcoded state', async ({ page }) => {
    await page.goto('/scenes');
    await ready(page);
    const dot = page.locator('#mbHealthService');
    await expect(dot).toBeVisible();
    // Starts as idle and must resolve to a real probed state.
    await expect(dot).not.toHaveClass(/mb-dot-idle/, { timeout: 15000 });
  });

  test('stop requires a deliberate hold, not a click', async ({ page }) => {
    const fired = [];
    await page.route('**/api/orchestration/stop-all', (route) => {
      fired.push('stop-all');
      route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/scenes');
    await ready(page);
    const stop = page.locator('#mbStopEverything');

    // A brush against the control must do nothing.
    await stop.click({ delay: 30 });
    await page.waitForTimeout(400);
    expect(fired, 'a quick click must not fire the stop').toHaveLength(0);

    // A deliberate hold must fire it.
    const box = await stop.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    expect(fired.length, 'a hold should fire the stop').toBeGreaterThan(0);
  });
});

test.describe('Self-hosted assets', () => {
  test('fonts load from this host, not the internet', async ({ page }) => {
    // On show night the WAN is the least reliable part of the setup, so the
    // app's typography must not depend on it.
    const external = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) external.push(url);
    });
    await page.goto('/scenes');
    await ready(page);
    expect(external, 'no font should be fetched from Google').toHaveLength(0);
  });
});
