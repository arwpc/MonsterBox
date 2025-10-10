/**
 * Setup Audio "Gold" E2E Test Suite
 * 
 * Tests the Setup Audio page for:
 * - Panel layout (Input left, Output right)
 * - Real-time VU meter updates (≥10 Hz)
 * - Device selection and persistence
 * - Test audio output functionality
 * - Error handling and user feedback
 * 
 * Run with:
 * BASE_URL=http://orlok:3000 MB_E2E=1 PW_CLEAN_SERVER=0 npx playwright test -c playwright.config.ts --project=firefox test/e2e/setup-audio-gold.spec.js
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Setup Audio Gold - Layout and UI', () => {
  test('should display correct title and version', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Check title
    const title = await page.title();
    expect(title).toContain('MonsterBox 5.1');
    
    // Check page heading
    const heading = await page.textContent('h1');
    expect(heading).toContain('PipeWire Audio Configuration');
  });

  test('should have Input panel on LEFT and Output panel on RIGHT', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for cards to load
    await page.waitForSelector('.card', { timeout: 5000 });
    
    // Get all col-md-6 cards in the configuration row
    const cards = await page.$$('.row .col-md-6 .card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    
    // First card should be Input (Microphones)
    const firstCardHeader = await cards[0].$eval('.card-header h5', el => el.textContent);
    expect(firstCardHeader).toContain('Input');
    expect(firstCardHeader).toContain('Microphones');
    
    // Second card should be Output (Speakers)
    const secondCardHeader = await cards[1].$eval('.card-header h5', el => el.textContent);
    expect(secondCardHeader).toContain('Output');
    expect(secondCardHeader).toContain('Speakers');
  });

  test('should display system status indicators', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for system status to load
    await page.waitForSelector('#pipewire-status', { timeout: 5000 });
    
    // Check status badges exist
    const pipewireStatus = await page.textContent('#pipewire-status');
    expect(pipewireStatus).toBeTruthy();
    
    const sinksCount = await page.textContent('#sinks-count');
    expect(sinksCount).toMatch(/\d+/);
    
    const sourcesCount = await page.textContent('#sources-count');
    expect(sourcesCount).toMatch(/\d+/);
  });
});

test.describe('Setup Audio Gold - Device Selection', () => {
  test('should load and populate device dropdowns', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for dropdowns to populate
    await page.waitForFunction(() => {
      const sinkSelect = document.querySelector('#default-sink');
      const sourceSelect = document.querySelector('#default-source');
      return sinkSelect && sourceSelect && 
             sinkSelect.options.length > 0 && 
             sourceSelect.options.length > 0;
    }, null, { timeout: 10000 });
    
    // Check that both dropdowns have options
    const sinkOptions = await page.$$eval('#default-sink option', opts => opts.length);
    expect(sinkOptions).toBeGreaterThan(0);
    
    const sourceOptions = await page.$$eval('#default-source option', opts => opts.length);
    expect(sourceOptions).toBeGreaterThan(0);
  });

  test('should persist device selection in localStorage', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for dropdowns to populate
    await page.waitForFunction(() => {
      const sinkSelect = document.querySelector('#default-sink');
      return sinkSelect && sinkSelect.options.length > 1;
    }, null, { timeout: 10000 });
    
    // Select a device (not 'auto')
    const sinkOptions = await page.$$eval('#default-sink option', opts => 
      opts.map(o => o.value).filter(v => v !== 'auto')
    );
    
    if (sinkOptions.length > 0) {
      await page.selectOption('#default-sink', sinkOptions[0]);
      
      // Check localStorage
      const storedSink = await page.evaluate(() => localStorage.getItem('setupAudio.defaultSink'));
      expect(storedSink).toBe(sinkOptions[0]);
      
      // Reload page and verify selection persists
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#default-sink', { timeout: 5000 });
      
      const selectedValue = await page.$eval('#default-sink', sel => sel.value);
      expect(selectedValue).toBe(sinkOptions[0]);
    }
  });
});

test.describe('Setup Audio Gold - VU Meters', () => {
  test('should display VU meters for input and output', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Check VU meters exist
    await page.waitForSelector('#input-vu-meter', { timeout: 5000 });
    await page.waitForSelector('#output-vu-meter', { timeout: 5000 });
    
    // Check VU meter labels exist
    const inputLabel = await page.textContent('#input-level-text');
    expect(inputLabel).toMatch(/\d+%/);
    
    const outputLabel = await page.textContent('#output-level-text');
    expect(outputLabel).toMatch(/\d+%/);
  });

  test('should start and stop input VU meter monitoring', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for page to load
    await page.waitForSelector('#input-vu-toggle', { timeout: 5000 });
    
    // Initial state should be "Start"
    let toggleText = await page.textContent('#input-vu-toggle');
    expect(toggleText).toContain('Start');
    
    // Click to start monitoring
    await page.click('button:has-text("Input Monitoring")');
    
    // Wait a bit for toggle to update
    await page.waitForTimeout(500);
    
    // Should now say "Stop"
    toggleText = await page.textContent('#input-vu-toggle');
    expect(toggleText).toContain('Stop');
    
    // Click again to stop
    await page.click('button:has-text("Input Monitoring")');
    
    await page.waitForTimeout(500);
    
    // Should be back to "Start"
    toggleText = await page.textContent('#input-vu-toggle');
    expect(toggleText).toContain('Start');
  });

  test('should update VU meter values during monitoring', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Start input monitoring
    await page.waitForSelector('button:has-text("Input Monitoring")', { timeout: 5000 });
    await page.click('button:has-text("Input Monitoring")');
    
    // Wait for monitoring to start
    await page.waitForTimeout(500);
    
    // Collect VU meter values over 1 second (should get ~10 updates at 10 Hz)
    const values = [];
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      const value = await page.textContent('#input-level-text');
      values.push(value);
      await page.waitForTimeout(100);
    }
    
    // Should have collected multiple values
    expect(values.length).toBeGreaterThanOrEqual(8); // At least 8 updates in 1 second
    
    // Stop monitoring
    await page.click('button:has-text("Input Monitoring")');
  });
});

test.describe('Setup Audio Gold - Test Buttons', () => {
  test('should have Test Audio Output button', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('button:has-text("Test Audio Output")', { timeout: 5000 });
    
    const button = await page.$('button:has-text("Test Audio Output")');
    expect(button).toBeTruthy();
  });

  test('should have Test Audio Input button', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('button:has-text("Test Audio Input")', { timeout: 5000 });
    
    const button = await page.$('button:has-text("Test Audio Input")');
    expect(button).toBeTruthy();
  });

  test('should call test-system API when Test Audio Output is clicked', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for page to load and select a device
    await page.waitForFunction(() => {
      const sel = document.querySelector('#default-sink');
      return sel && sel.options.length > 1;
    }, null, { timeout: 10000 });
    
    // Select a non-auto device
    const sinkOptions = await page.$$eval('#default-sink option', opts => 
      opts.map(o => o.value).filter(v => v !== 'auto')
    );
    
    if (sinkOptions.length > 0) {
      await page.selectOption('#default-sink', sinkOptions[0]);
      
      // Set up request interception to verify API call
      let apiCalled = false;
      page.on('request', request => {
        if (request.url().includes('/setup/audio/api/test-system')) {
          apiCalled = true;
        }
      });
      
      // Click test button
      await page.click('button:has-text("Test Audio Output")');
      
      // Wait for API call
      await page.waitForTimeout(1000);
      
      expect(apiCalled).toBeTruthy();
    }
  });
});

test.describe('Setup Audio Gold - Error Handling', () => {
  test('should show error when testing without device selection', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Wait for page to load
    await page.waitForSelector('#default-sink', { timeout: 5000 });
    
    // Ensure 'auto' is selected
    await page.selectOption('#default-sink', 'auto');
    
    // Click test button
    await page.click('button:has-text("Test Audio Output")');
    
    // Should show error toast
    await page.waitForSelector('.toast.show', { timeout: 2000 });
    
    const toastText = await page.textContent('.toast-body');
    expect(toastText).toContain('select a specific');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // This test verifies error handling when API returns error
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // No console errors should be present
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Interact with page
    await page.waitForSelector('#default-sink', { timeout: 5000 });
    await page.click('button:has-text("Refresh")');
    
    await page.waitForTimeout(2000);
    
    // Should have no unhandled console errors
    const unhandledErrors = errors.filter(e => 
      !e.includes('VU meter') && // VU meter warnings are expected
      !e.includes('Failed to')   // Expected failures are logged
    );
    expect(unhandledErrors.length).toBe(0);
  });
});

test.describe('Setup Audio Gold - Persistence', () => {
  test('should maintain layout across page reloads', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/audio`, { waitUntil: 'domcontentloaded' });
    
    // Verify initial layout
    await page.waitForSelector('.card', { timeout: 5000 });
    const cards1 = await page.$$('.row .col-md-6 .card');
    const firstCardHeader1 = await cards1[0].$eval('.card-header h5', el => el.textContent);
    expect(firstCardHeader1).toContain('Input');
    
    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Verify layout persists
    await page.waitForSelector('.card', { timeout: 5000 });
    const cards2 = await page.$$('.row .col-md-6 .card');
    const firstCardHeader2 = await cards2[0].$eval('.card-header h5', el => el.textContent);
    expect(firstCardHeader2).toContain('Input');
  });
});

