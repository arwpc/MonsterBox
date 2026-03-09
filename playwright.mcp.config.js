import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright MCP configuration for MonsterBox
 *
 * This config is used when running browser tests via Claude Code MCP
 * integration. It runs headlessly on the RPi (no display required)
 * and targets the test server on port 3200.
 *
 * Usage:
 *   npm run test:mcp              — Run all MCP browser tests
 *   npm run test:mcp:quick        — Quick smoke test via MCP
 *   npm run test:mcp:live         — Test against live server (port 3000)
 *
 * For IDE (VS Code + Claude Code):
 *   The @playwright/mcp server is configured in .claude/settings.json
 *   and provides browser_* tools for interactive testing.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/playwright-report-mcp', open: 'never' }]
  ],
  outputDir: 'tests/test-results-mcp',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3200',
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },

  projects: [
    {
      name: 'mcp-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],

  webServer: {
    command: 'MB_TEST_MODE=1 TEST_PORT=3200 npm start',
    url: 'http://localhost:3200',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
