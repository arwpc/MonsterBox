#!/usr/bin/env node
/**
 * Test a character's linear actuators through the Calibration UI.
 *
 * Drives every linear actuator the character actually has (read from its parts
 * file) rather than a fixed list of part names, so the same script exercises any
 * node in the fleet.
 *
 * Usage:
 *   node scripts/test-actuators-ui.js                     # this node's character
 *   node scripts/test-actuators-ui.js --character 2       # another fleet node
 *   node scripts/test-actuators-ui.js --base-url http://localhost:3000
 */

import { firefox } from 'playwright';
import { resolveCharacterTarget, resolveBaseUrl, loadParts } from './lib/character-target.mjs';
import { isTestSafePart } from '../services/hardwareService/safetyLimits.js';

async function testActuators() {
  const target = await resolveCharacterTarget();
  const baseUrl = await resolveBaseUrl(process.argv.slice(2), { characterId: target.characterId });

  console.log(`🧪 Testing ${target.name} actuators via Calibration UI...\n`);

  const parts = await loadParts(target.characterId);
  const actuators = [];
  for (const part of parts.filter(p => p.type === 'linear_actuator')) {
    if (await isTestSafePart(target.characterId, part.id)) {
      actuators.push({ id: part.id, name: part.name, tested: false });
    } else {
      console.log(`⛔ Skipping ${part.name} (id ${part.id}) — marked unsafe for automated testing`);
    }
  }

  if (actuators.length === 0) {
    console.log(`⚠️  ${target.name} has no testable linear actuators — nothing to do.`);
    return;
  }

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`🎯 Selecting character ${target.characterId} (${target.name}) as active...`);
    await page.goto(`${baseUrl}/setup/characters`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async (id) => {
      await fetch('/setup/characters/api/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    }, target.characterId);
    const currentSel = await page.evaluate(async () => { try { const r = await fetch('/setup/characters/api/current'); const j = await r.json(); return j && j.selectedCharacter; } catch (_) { return null; } });
    console.log('📌 Active character now:', currentSel, '\n');
    console.log(`📍 Navigating to ${baseUrl}/setup/calibration\n`);
    await page.goto(`${baseUrl}/setup/calibration`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for parts to load
    await page.waitForSelector('#deviceList .list-group-item', { timeout: 10000 });

    // Get all parts
    const listItems = await page.locator('#deviceList .list-group-item').all();
    console.log(`✅ Found ${listItems.length} parts\n`);

    for (const part of listItems) {
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
