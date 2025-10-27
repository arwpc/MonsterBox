import { defineConfig, devices } from '@playwright/test';
import os from 'os';

const inTestMode = process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
const envWorkers = process.env.PW_WORKERS || process.env.MB_WORKERS;
const cpuCount = Math.max(1, (os.cpus() ? os.cpus().length : 2));
// Default workers: conservative but parallel even in test mode; cap to 8 to avoid resource contention on small devices
const defaultWorkers = inTestMode ? Math.min(Math.max(2, Math.floor(cpuCount / 2)), 8) : undefined;
const workers = envWorkers ? Math.max(1, parseInt(String(envWorkers), 10) || 0) : defaultWorkers;
// Optional sharding (enable via PW_SHARD formatted as "1/4")
const shardEnv = (process.env.PW_SHARD || process.env.MB_SHARD || '').trim();
const shard = shardEnv && /^(\d+)\/(\d+)$/.test(shardEnv)
  ? (() => { const m = shardEnv.match(/^(\d+)\/(\d+)$/)!; return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) }; })()
  : undefined;

export default defineConfig({
  testDir: './tests',
  // Only pick up Playwright-style specs in UX folders; avoid Mocha/integration .test.js files at repo root
  testMatch: [
    'tests/playwright/**/*.{spec,test}.{js,ts}',
    'tests/ui/**/*.{spec,test}.{js,ts}',
    'tests/comprehensive/**/*.{spec,test}.{js,ts}',
  ],
  retries: 1,
  fullyParallel: true,
  // Allow configurable parallelism; default to multi-workers even in test mode for speed
  workers,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/report.json' }]
  ],

  use: {
    baseURL: 'http://127.0.0.1:3123', // use a dedicated test port to avoid clashes
    headless: true,                       // safe for Pi/CI
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // Additional browser projects can be re-enabled as needed
  ],
  globalSetup: 'tests/playwright/global-setup.js',
  // Enable optional sharding across multiple agents when PW_SHARD like "1/4" is provided
  shard,
  webServer: {
    // Ensure test server launches on a dedicated port to avoid collisions
    command: 'MB_TEST_MODE=1 NODE_ENV=test PORT=3123 node server.js',
    url: 'http://127.0.0.1:3123',
    reuseExistingServer: process.env.PW_CLEAN_SERVER !== '1',
    timeout: 180000
  },


  outputDir: 'test-results/',
});
