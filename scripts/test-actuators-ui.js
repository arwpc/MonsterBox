#!/usr/bin/env node
/**
 * Test Orlok Actuators via Calibration UI
 * 
 * This script uses Playwright to navigate to the calibration page
 * and test the three linear actuators (Left Arm, Right Arm, Loom Over).
 */

import { firefox } from 'playwright';

async function testActuators() {
  console.log('🧪 Testing Orlok Actuators via Calibration UI...\n');

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🎯 Selecting character 3 (Orlok) as active...');
    await page.goto('http://192.168.8.120:3000/setup/characters', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async () => {
      await fetch('/setup/characters/api/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 3 }) });
    });
    const currentSel = await page.evaluate(async () => { try { const r = await fetch('/setup/characters/api/current'); const j = await r.json(); return j && j.selectedCharacter; } catch (_) { return null; } });
    console.log('📌 Active character now:', currentSel, '\n');
    console.log('📍 Navigating to http://192.168.8.120:3000/setup/calibration\n');
    await page.goto('http://192.168.8.120:3000/setup/calibration', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for parts to load
    await page.waitForSelector('#deviceList .list-group-item', { timeout: 10000 });

    // Get all parts
    const parts = await page.locator('#deviceList .list-group-item').all();
    console.log(`✅ Found ${parts.length} parts\n`);

    // Find the three actuators
    const actuators = [
      { name: 'Left Arm', tested: false },
      { name: 'Right Arm of Satan', tested: false },
      { name: 'Loom Over', tested: false }
    ];

    for (const part of parts) {
      const textRaw = await part.textContent();
      const text = (textRaw || '').trim();
      console.log(`   Part: ${text.substring(0, 80)}...`);

      for (const actuator of actuators) {
        if (text && text.includes(actuator.name) && !actuator.tested) {
          console.log(`🔧 Testing ${actuator.name}...`);

          // Click on the part to select it
          await part.click();
          await page.waitForTimeout(1000);

          // Look for extend/retract buttons in the Controls tab
          const extendBtn = page.locator('#controlsArea button:has-text("Extend")').first();
          const retractBtn = page.locator('#controlsArea button:has-text("Retract")').first();

          if (await extendBtn.isVisible()) {
            console.log(`   ↗️  Extending ${actuator.name}...`);
            await extendBtn.click();
            await page.waitForTimeout(2000);

            console.log(`   ↙️  Retracting ${actuator.name}...`);
            await retractBtn.click();
            await page.waitForTimeout(2000);

            console.log(`   ✅ ${actuator.name} tested successfully\n`);
            actuator.tested = true;
          } else {
            console.log(`   ⚠️  Extend/Retract buttons not found for ${actuator.name}\n`);
          }

          break;
        }
      }
    }

    // Summary
    console.log('\n📊 Test Summary:');
    for (const actuator of actuators) {
      const status = actuator.tested ? '✅ TESTED' : '❌ NOT FOUND';
      console.log(`   ${actuator.name}: ${status}`);
    }

    const allTested = actuators.every(a => a.tested);
    if (allTested) {
      console.log('\n🎉 All actuators tested successfully!');
    } else {
      console.log('\n⚠️  Some actuators were not tested');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testActuators().catch(console.error);

