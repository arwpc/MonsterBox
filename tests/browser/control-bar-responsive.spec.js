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

      // One test PER PAGE, not one test over all seven. The combined version
      // shared a single 30 s budget across seven page loads, and /orchestration
      // holds an open MJPEG webcam stream so its networkidle wait can never
      // settle -- on an RPi4B that reliably timed out before asserting anything,
      // which reads as "the control bar overflows" when measurement shows every
      // page/viewport pair at 0 px. Per-page tests also name the offender.
      for (const target of PAGES) {
        test(`${target.name} never scrolls sideways`, async ({ page }) => {
          // Horizontal overflow is the classic responsive failure and makes a
          // fixed bottom bar drift out of reach.
          await page.goto(target.path);
          await ready(page);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          expect(overflow, `${target.path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
        });
      }
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

  test('stop fires instantly on press, and once per press', async ({ page }) => {
    // This test previously asserted the OPPOSITE — that stop required a
    // deliberate hold — and it intercepted /api/orchestration/stop-all, a route
    // that does not exist. The interceptor therefore never matched, so the
    // "a quick click must not fire the stop" assertion passed vacuously and the
    // suite reported a safety guarantee it had never actually checked.
    //
    // The real design, and the one worth protecting: STOP fires on pointerdown
    // with no hold delay, because on show night the operator is stabbing at a
    // handset in the dark and a stop that can be swallowed by scroll or gesture
    // recognition is worse than useless. The repeat-jab guard is what stops a
    // panicking hand sending a dozen fleet-wide requests.
    const fired = [];
    await page.route('**/api/panic', (route) => {
      fired.push(route.request().postDataJSON());
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });

    await page.goto('/scenes');
    await ready(page);
    const stop = page.locator('#mbStopEverything');
    await expect(stop).toBeVisible();

    // A press must reach the fleet immediately — no hold, no delay.
    await stop.click();
    await expect.poll(() => fired.length, {
      message: 'stop must fire on press, without a hold',
      timeout: 3000
    }).toBeGreaterThan(0);
    expect(fired[0], 'stop must ask for the whole fleet').toMatchObject({ fleet: true });

    // Repeat jabs inside the guard window must not multiply the request.
    // Dispatched synchronously in the page rather than with three Playwright
    // clicks: on a Raspberry Pi each click action costs hundreds of
    // milliseconds, so three of them overrun the 1200ms guard window and the
    // test measures Playwright's speed instead of the product's behaviour.
    const before = fired.length;
    await page.evaluate(() => {
      const el = document.querySelector('#mbStopEverything');
      for (let i = 0; i < 3; i++) {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      }
    });
    await page.waitForTimeout(400);
    expect(fired.length, 'a burst of jabs inside the guard window must send at most one more request')
      .toBeLessThanOrEqual(before + 1);
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
