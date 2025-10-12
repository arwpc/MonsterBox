import { defineConfig } from '@playwright/test';

const inTestMode = process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';

export default defineConfig({
  testDir: './tests',
  // Only pick up Playwright-style specs in UX folders; avoid Mocha/integration .test.js files at repo root
  testMatch: [
    'tests/playwright/**/*.{spec,test}.{js,ts}',
    'tests/ui/**/*.{spec,test}.{js,ts}',
  ],
  retries: 1,
  fullyParallel: true,
  // Reduce concurrency in MB_TEST_MODE to eliminate server contention/timeouts on low-power devices
  workers: inTestMode ? 1 : undefined,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/report.json' }]
  ],

  use: {
    baseURL: 'http://127.0.0.1:3000', // match server port from config/app-config.json during tests
    headless: true,                       // safe for Pi/CI
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: [
        'tests/playwright/**/*',
        'tests/ui/**/*',
      ],
    },
  ],
  globalSetup: 'tests/playwright/global-setup.js',
  webServer: {
    // Ensure test server launches on the expected port
    command: 'MB_TEST_MODE=1 NODE_ENV=test PORT=3000 node server.js',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: process.env.PW_CLEAN_SERVER !== '1',
    timeout: 180000
  },


  outputDir: 'test-results/',
});
