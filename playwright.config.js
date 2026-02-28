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

  // Run local dev server before tests on HTTP port 3200 (avoids conflict with production on 3000/3100)
  // TEST_PORT tells server.js to open an extra HTTP listener on 3200 for Playwright
  webServer: process.env.CI ? undefined : {
    command: 'MB_TEST_MODE=1 TEST_PORT=3200 npm start',
    url: 'http://localhost:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
