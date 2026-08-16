import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MonsterBox browser tests
 * Tests every page and validates all interactive elements
 *
 * Uses PORT=3200 so the test server doesn't collide with the production
 * monsterbox.service which listens on 3000 + 3100.  The test server runs
 * with MB_TEST_MODE=1 so API endpoints return mocked data.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to prevent server conflicts
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/playwright-report', open: 'never' }]
  ],
  outputDir: 'tests/test-results',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run dev server before tests on HTTP port 3200 (avoids conflict with production on 3000/3100)
  // TEST_PORT tells server.js to open an extra HTTP listener on 3200 for Playwright
  // Set MB_USE_RUNNING_SERVER=1 to test against a server that is ALREADY up
  // (e.g. the systemd service, via its always-on listener on :3100) instead of
  // spawning one.
  //
  // Without this, running a single spec on a live node is impossible:
  // services/resource/singleInstance.js refuses a second server, so the spawn
  // dies with "MonsterBox already running" and Playwright reports it as a config
  // failure rather than the port conflict it is. The alternative — stopping the
  // service to run one test — takes the whole animatronic offline.
  //
  //   MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test <spec>
  webServer: process.env.MB_USE_RUNNING_SERVER === '1' ? undefined : {
    command: 'MB_TEST_MODE=1 TEST_PORT=3200 npm start',
    url: 'http://localhost:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
