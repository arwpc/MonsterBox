/**
 * Playwright Configuration for MonsterBox 4.0
 * Browser testing configuration
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Prefer console output that clearly completes; still generate HTML locally
  reporter: process.env.CI ? 'line' : [['list'], ['html']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // ARM64 default: run WebKit by default. Firefox optional, Chromium disabled.
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Uncomment to enable locally if supported
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
