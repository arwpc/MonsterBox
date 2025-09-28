import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    page.on('console', msg => {
      if (['error', 'warning'].includes(msg.type())) {
        throw new Error(`Console ${msg.type()}: ${msg.text()}`);
      }
    });

    page.on('response', async res => {
      if (res.status() >= 400) {
        throw new Error(`HTTP ${res.status()} for ${res.url()}`);
      }
      if (res.url().includes('/api/save')) {
        if (res.status() !== 200) throw new Error(`Save failed: ${res.url()} - ${res.status()}`);
        try {
          const body = await res.json();
          if (!body.success) throw new Error(`Save response missing success=true: ${res.url()}`);
        } catch {
          throw new Error(`Save response invalid or non-JSON: ${res.url()}`);
        }
      }
    });

    page.on('requestfailed', req => {
      throw new Error(`Request failed: ${req.url()} - ${req.failure()?.errorText}`);
    });

    await use(page);
  }
});

export { expect } from '@playwright/test';
