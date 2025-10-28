import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/orchestration-live.spec.js'],
  retries: 0,
  fullyParallel: false,
  workers: 1,
  
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-live' }]
  ],

  use: {
    baseURL: 'http://orlok:3000', // Use LIVE server, not test port
    headless: true,                 // Headless for SSH/remote testing
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
          ]
        }
      },
    },
  ],

  // NO webServer - we're using the live system!
});
