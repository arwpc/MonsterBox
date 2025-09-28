import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Only pick up Playwright-style specs in UX folders; avoid Mocha/integration .test.js files at repo root
  testMatch: [
    'tests/playwright/**/*.{spec,test}.{js,ts}',
    'tests/ui/**/*.{spec,test}.{js,ts}',
  ],
  retries: 1,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/report.json' }]
  ],

  use: {
    baseURL: 'http://127.0.0.1:3100', // switched to 3100 to ensure fresh server with latest code
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
  webServer: {
    command: 'MB_TEST_MODE=1 node server.js',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 120000
  },


  outputDir: 'test-results/',
});
