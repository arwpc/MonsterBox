import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/webcam',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:80',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-file-for-fake-audio-capture=tests/assets/hello.wav'
          ]
        }
      }
    }
  ]
});
