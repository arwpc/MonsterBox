#!/usr/bin/env node
/**
 * Quick test to check if conversation page loads in browser
 */

import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors = [];
  const logs = [];
  
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
  });
  
  try {
    console.log('Loading http://localhost:3000/conversation...');
    const response = await page.goto('http://localhost:3000/conversation', {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    
    console.log(`HTTP Status: ${response.status()}`);
    console.log(`Page title: ${await page.title()}`);
    
    // Wait a bit for any async errors
    await page.waitForTimeout(2000);
    
    // Check if main elements are visible
    const h1 = await page.locator('h1').textContent();
    console.log(`Page heading: ${h1}`);
    
    const gridColumns = await page.locator('.col-lg-4').count();
    console.log(`Grid columns: ${gridColumns}`);
    
    console.log(`\nConsole logs (${logs.length}):`);
    logs.forEach(log => console.log(`  ${log}`));
    
    if (errors.length > 0) {
      console.log(`\n❌ ERRORS FOUND (${errors.length}):`);
      errors.forEach(err => console.log(`  ${err}`));
      process.exit(1);
    } else {
      console.log('\n✅ Page loaded successfully with no errors');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Failed to load page:', error.message);
    if (errors.length > 0) {
      console.log('\nPage errors:');
      errors.forEach(err => console.log(`  ${err}`));
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
