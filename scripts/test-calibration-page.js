#!/usr/bin/env node
/**
 * Test Calibration Page Loading
 * 
 * This script uses Playwright to navigate to the calibration page
 * and check for JavaScript errors and console messages.
 */

import { firefox } from 'playwright';

async function testCalibrationPage() {
  console.log('🧪 Testing Calibration Page...\n');
  
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    console.log(`[${type.toUpperCase()}] ${text}`);
  });
  
  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.error(`[PAGE ERROR] ${error.message}`);
    console.error(`[PAGE ERROR STACK] ${error.stack}`);
  });

  // Collect request failures
  page.on('requestfailed', request => {
    console.error(`[REQUEST FAILED] ${request.url()} - ${request.failure().errorText}`);
  });
  
  try {
    console.log('📍 Navigating to http://192.168.8.120:3000/setup/calibration\n');
    await page.goto('http://192.168.8.120:3000/setup/calibration', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait a bit for JavaScript to execute
    await page.waitForTimeout(3000);

    // Check if deviceList has items
    const deviceListItems = await page.locator('#deviceList .list-group-item').count();
    console.log(`\n✅ Device list items found: ${deviceListItems}`);

    // Check if parts were loaded
    const debugInfo = await page.evaluate(() => {
      // Check if the main script block executed
      const scripts = Array.from(document.querySelectorAll('script'));
      const mainScriptFound = scripts.some(s => s.textContent.includes('window.loadParts'));

      return {
        allParts: window.allParts ? window.allParts.length : 0,
        loadPartsExists: typeof window.loadParts === 'function',
        deviceListExists: !!document.getElementById('deviceList'),
        lastError: window.lastLoadError || null,
        mainScriptFound,
        totalScripts: scripts.length
      };
    });
    console.log(`✅ Parts loaded in window.allParts: ${debugInfo.allParts}`);
    console.log(`✅ loadParts function exists: ${debugInfo.loadPartsExists}`);
    console.log(`✅ deviceList element exists: ${debugInfo.deviceListExists}`);
    console.log(`✅ Main script found in page: ${debugInfo.mainScriptFound}`);
    console.log(`✅ Total script tags: ${debugInfo.totalScripts}`);
    if (debugInfo.lastError) {
      console.log(`❌ Last load error: ${debugInfo.lastError}`);
    }
    
    // Get the current character
    const currentCharacter = await page.evaluate(() => {
      return fetch('/setup/characters/api/current')
        .then(r => r.json())
        .then(d => d.selectedCharacter);
    });
    console.log(`✅ Current character: ${currentCharacter}`);
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Console messages: ${consoleMessages.length}`);
    console.log(`   Page errors: ${pageErrors.length}`);
    console.log(`   Device list items: ${deviceListItems}`);
    console.log(`   Parts loaded: ${debugInfo.allParts}`);
    
    if (pageErrors.length > 0) {
      console.log('\n❌ Page Errors:');
      pageErrors.forEach(err => console.log(`   - ${err}`));
    }
    
    if (deviceListItems === 0 && debugInfo.allParts > 0) {
      console.log('\n⚠️  WARNING: Parts loaded but not rendered in device list!');
    }
    
    // Screenshot for debugging
    await page.screenshot({ path: 'test-results/calibration-debug.png', fullPage: true });
    console.log('\n📸 Screenshot saved to test-results/calibration-debug.png');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testCalibrationPage().catch(console.error);

