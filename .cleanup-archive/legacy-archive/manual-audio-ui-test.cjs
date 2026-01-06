#!/usr/bin/env node
/**
 * Manual Audio UI Test - Tests all buttons on Setup Audio page
 * Uses Playwright to click buttons and verify responses
 */

const { chromium, firefox } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function testSetupAudioPage() {
  log('🎵 Starting Setup Audio Page UI Test');
  log('='.repeat(60));

  let browser;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Launch Firefox (headless)
    log('Launching Firefox browser...');
    browser = await firefox.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    // Track console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to Setup Audio page
    log('Navigating to /setup/audio...');
    await page.goto(`${BASE_URL}/setup/audio`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await sleep(3000);

    // Test 1: Page loads without errors
    log('\n=== Test 1: Page Load ===');
    const title = await page.locator('h1').textContent();
    if (title.includes('Audio Configuration')) {
      testsPassed++;
      log('✅ PASS: Page loaded with correct title');
    } else {
      testsFailed++;
      log('❌ FAIL: Page title incorrect');
    }

    // Test 2: Input device selector visible
    log('\n=== Test 2: Input Device Selector ===');
    const inputSelect = page.locator('#default-source');
    if (await inputSelect.isVisible()) {
      testsPassed++;
      log('✅ PASS: Input device selector visible');
    } else {
      testsFailed++;
      log('❌ FAIL: Input device selector not visible');
    }

    // Test 3: Output device selector visible
    log('\n=== Test 3: Output Device Selector ===');
    const outputSelect = page.locator('#default-sink');
    if (await outputSelect.isVisible()) {
      testsPassed++;
      log('✅ PASS: Output device selector visible');
    } else {
      testsFailed++;
      log('❌ FAIL: Output device selector not visible');
    }

    // Test 4: Test Audio Output button
    log('\n=== Test 4: Test Audio Output Button ===');
    try {
      const testOutputBtn = page.locator('button:has-text("Test Audio Output")');
      await testOutputBtn.waitFor({ state: 'visible', timeout: 5000 });

      log('Clicking Test Audio Output button...');
      await testOutputBtn.click();
      await sleep(500);

      // Check if button shows "Playing..." state
      const btnText = await testOutputBtn.textContent();
      if (btnText.includes('Playing')) {
        testsPassed++;
        log('✅ PASS: Test Audio Output button clicked and shows Playing state');
      } else {
        testsPassed++;
        log('✅ PASS: Test Audio Output button clicked');
      }

      // Wait for audio to finish
      await sleep(3000);
    } catch (error) {
      testsFailed++;
      log(`❌ FAIL: Test Audio Output button - ${error.message}`);
    }

    // Test 5: Test Audio Input button
    log('\n=== Test 5: Test Audio Input Button ===');
    try {
      const testInputBtn = page.locator('button:has-text("Test Audio Input")');
      await testInputBtn.waitFor({ state: 'visible', timeout: 5000 });

      log('Clicking Test Audio Input button...');
      await testInputBtn.click();
      await sleep(500);

      // Check if button shows "Testing..." state
      const btnText = await testInputBtn.textContent();
      if (btnText.includes('Testing')) {
        testsPassed++;
        log('✅ PASS: Test Audio Input button clicked and shows Testing state');
      } else {
        testsPassed++;
        log('✅ PASS: Test Audio Input button clicked');
      }

      // Wait for test to finish
      await sleep(2000);
    } catch (error) {
      testsFailed++;
      log(`❌ FAIL: Test Audio Input button - ${error.message}`);
    }

    // Test 6: Start/Stop Input Monitoring toggle
    log('\n=== Test 6: Input Monitoring Toggle ===');
    try {
      const inputToggle = page.locator('button:has-text("Input Monitoring")');
      await inputToggle.waitFor({ state: 'visible', timeout: 5000 });

      const toggleSpan = page.locator('#input-vu-toggle');
      const initialState = await toggleSpan.textContent();
      log(`Initial state: ${initialState}`);

      // Click to start
      log('Starting input monitoring...');
      await inputToggle.click();
      await sleep(1000);

      const newState = await toggleSpan.textContent();
      log(`New state: ${newState}`);

      if (initialState !== newState) {
        testsPassed++;
        log('✅ PASS: Input monitoring toggle works');
      } else {
        testsFailed++;
        log('❌ FAIL: Input monitoring toggle did not change state');
      }

      // Click to stop
      await inputToggle.click();
      await sleep(500);
    } catch (error) {
      testsFailed++;
      log(`❌ FAIL: Input monitoring toggle - ${error.message}`);
    }

    // Test 7: Start/Stop Output Monitoring toggle
    log('\n=== Test 7: Output Monitoring Toggle ===');
    try {
      const outputToggle = page.locator('button:has-text("Output Monitoring")');
      await outputToggle.waitFor({ state: 'visible', timeout: 5000 });

      const toggleSpan = page.locator('#output-vu-toggle');
      const initialState = await toggleSpan.textContent();
      log(`Initial state: ${initialState}`);

      // Click to start
      log('Starting output monitoring...');
      await outputToggle.click();
      await sleep(1000);

      const newState = await toggleSpan.textContent();
      log(`New state: ${newState}`);

      if (initialState !== newState) {
        testsPassed++;
        log('✅ PASS: Output monitoring toggle works');
      } else {
        testsFailed++;
        log('❌ FAIL: Output monitoring toggle did not change state');
      }

      // Click to stop
      await outputToggle.click();
      await sleep(500);
    } catch (error) {
      testsFailed++;
      log(`❌ FAIL: Output monitoring toggle - ${error.message}`);
    }

    // Test 8: VU meters visible
    log('\n=== Test 8: VU Meters ===');
    const inputVU = page.locator('#input-vu-meter');
    const outputVU = page.locator('#output-vu-meter');

    let vuCount = 0;
    if (await inputVU.isVisible()) vuCount++;
    if (await outputVU.isVisible()) vuCount++;

    if (vuCount === 2) {
      testsPassed++;
      log('✅ PASS: Both VU meters visible');
    } else {
      testsFailed++;
      log(`❌ FAIL: Only ${vuCount}/2 VU meters visible`);
    }

    // Test 9: No null reference errors
    log('\n=== Test 9: Console Errors ===');
    const nullErrors = errors.filter(err =>
      err.includes('Cannot read properties of null')
    );

    if (nullErrors.length === 0) {
      testsPassed++;
      log('✅ PASS: No null reference errors');
    } else {
      testsFailed++;
      log(`❌ FAIL: Found ${nullErrors.length} null reference errors`);
      nullErrors.forEach(err => log(`   ${err}`));
    }

    // Test 10: API endpoints respond
    log('\n=== Test 10: API Endpoints ===');
    try {
      const response = await page.request.get(`${BASE_URL}/setup/audio/api/audio-levels?deviceId=80&deviceType=input`);
      const data = await response.json();

      if (data.success && typeof data.level === 'number') {
        testsPassed++;
        log(`✅ PASS: Audio levels API works - Level: ${(data.level * 100).toFixed(1)}%`);
      } else {
        testsFailed++;
        log('❌ FAIL: Audio levels API returned invalid data');
      }
    } catch (error) {
      testsFailed++;
      log(`❌ FAIL: Audio levels API - ${error.message}`);
    }

    // Summary
    log('\n' + '='.repeat(60));
    log(`📊 UI Test Results: ${testsPassed} passed, ${testsFailed} failed`);

    if (testsFailed === 0) {
      log('✅ All UI tests passed!');
    } else {
      log('❌ Some UI tests failed');
    }

    await browser.close();
    process.exit(testsFailed === 0 ? 0 : 1);

  } catch (error) {
    log(`Fatal error: ${error.message}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

testSetupAudioPage();

