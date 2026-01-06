#!/usr/bin/env node
/**
 * Test Calibration Preset UI across all animatronics
 * 
 * This script:
 * 1. Iterates through all 5 target animatronics (PumpkinHead, Coffin Breaker, Orlok, Skulltalker, Groundbreaker)
 * 2. For each character, tests servo, motor, and linear actuator steps
 * 3. Verifies Control Mode dropdown and Position Preset UI appear
 * 4. Captures screenshots of each working preset UI
 * 5. Reports which parts have calibration data
 */

import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = './test-output/calibration-presets';

// Target characters: ID -> Name mapping
const CHARACTERS = [
  { id: 1, name: 'PumpkinHead' },
  { id: 2, name: 'Coffin Breaker' },
  { id: 3, name: 'Orlok' },
  { id: 4, name: 'Skulltalker' },
  { id: 5, name: 'Groundbreaker' }
];

const PART_TYPES = ['servo', 'motor', 'linear_actuator'];

async function main() {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    timestamp: new Date().toISOString(),
    characters: []
  };

  try {
    // Load scene editor
    console.log('Loading scene editor...');
    await page.goto(`${BASE_URL}/scenes/edit/new`);
    await page.waitForLoadState('networkidle');

    // Verify Control Mode UI is loaded
    const hasControlModeUI = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        if (s.textContent && s.textContent.includes('renderServoForm')) {
          return s.textContent.includes('Control Mode');
        }
      }
      return false;
    });

    if (!hasControlModeUI) {
      throw new Error('Control Mode UI not found in page! Template may not be updated.');
    }
    console.log('✓ Control Mode UI detected in page');

    // Fetch all parts and calibration profiles once
    const allParts = await page.evaluate(async () => {
      const r = await fetch('/api/parts');
      const j = await r.json();
      return j.parts || [];
    });

    const allProfiles = await page.evaluate(async () => {
      const r = await fetch('/api/calibration/profiles');
      const j = await r.json();
      return j || {};
    });

    console.log(`Loaded ${allParts.length} parts and ${Object.keys(allProfiles).length} calibration profiles`);

    // Test each character
    for (const character of CHARACTERS) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing Character: ${character.name} (ID: ${character.id})`);
      console.log('='.repeat(60));

      // Switch to this character
      await page.evaluate((charId) => {
        return fetch('/api/character/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: charId })
        });
      }, character.id);

      // Reload page to ensure character switch takes effect
      await page.goto(`${BASE_URL}/scenes/edit/new`);
      await page.waitForLoadState('networkidle');

      // Verify character switched in UI
      const currentCharName = await page.textContent('.navbar .character-avatar-wrapper + span, .navbar [id*="charLabel"]').catch(() => 'Unknown');
      console.log(`UI shows: ${currentCharName}`);

      const testResult = {
        id: character.id,
        name: character.name,
        uiName: currentCharName,
        partTypes: {}
      };

      // Test each part type
      for (const partType of PART_TYPES) {
        console.log(`\nTesting ${partType}...`);
      
      const partTypeResult = {
        type: partType,
        tested: false,
        hasControlMode: false,
        hasPresetDropdown: false,
        presetOptions: [],
        parts: [],
        screenshot: null,
        error: null
      };

      try {
        // Find parts of this type (parts are global, not per-character)
        const partsForType = allParts.filter(p => 
          p.type === partType && 
          p.enabled
        );

        if (partsForType.length === 0) {
          console.log(`  ⚠ No ${partType} parts found`);
          partTypeResult.error = `No ${partType} parts`;
          testResult.partTypes[partType] = partTypeResult;
          continue;
        }

        const testPart = partsForType[0];
        console.log(`Testing part: ${testPart.name} (ID: ${testPart.id})`);

        // Click Add Step button
        await page.click('button:has-text("Add Step")');
        await page.waitForSelector('.modal:visible', { timeout: 5000 });

        // Find and click the part button
        const partButtonText = partType === 'linear_actuator' ? 'Linear Actuator' : 
                               partType === 'motor' ? 'Motor' : 'Servo';
        
        // Click the specific part button (contains part name + type)
        await page.click(`button:has-text("${testPart.name}"):has-text("${partButtonText}")`);
        await page.waitForTimeout(500); // Wait for step to be added

        // Verify Control Mode dropdown exists
        const controlModeExists = await page.isVisible('select[data-field="usePreset"]');
        partTypeResult.hasControlMode = controlModeExists;
        console.log(`${controlModeExists ? '✓' : '✗'} Control Mode dropdown`);

        if (!controlModeExists) {
          partTypeResult.error = 'Control Mode dropdown not found';
          testResult.partTypes[partType] = partTypeResult;
          continue;
        }

        // Switch to Position Preset mode
        await page.selectOption('select[data-field="usePreset"]', 'true');
        await page.waitForTimeout(300);

        // Call handlers to populate presets
        await page.evaluate((pt) => {
          if (typeof window.handleModeChange === 'function') {
            window.handleModeChange(0, pt);
          }
          if (typeof window.handlePartChange === 'function') {
            window.handlePartChange(0, pt);
          }
        }, partType);

        await page.waitForTimeout(300);

        // Check if preset dropdown appeared
        const presetExists = await page.isVisible('select[data-field="presetName"]');
        partTypeResult.hasPresetDropdown = presetExists;
        console.log(`${presetExists ? '✓' : '✗'} Position Preset dropdown`);

        if (presetExists) {
          // Get preset options
          const options = await page.$$eval('select[data-field="presetName"] option', opts => 
            opts.map(o => ({ value: o.value, text: o.textContent }))
          );
          partTypeResult.presetOptions = options;
          console.log(`→ Preset options: ${options.map(o => o.text).join(', ')}`);

          // Check if part has calibration profile
          const hasProfile = allProfiles[testPart.id] !== undefined;
          console.log(`${hasProfile ? '✓' : '✗'} Calibration profile exists`);
        }

        // Take screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `${character.name.replace(/\s+/g, '-')}-${partType}.png`);
        await page.screenshot({ path: screenshotPath });
        partTypeResult.screenshot = screenshotPath;
        console.log(`📸 Screenshot: ${screenshotPath}`);

        partTypeResult.tested = true;
        partTypeResult.parts = partsForType.map(p => ({
          id: p.id,
          name: p.name,
          hasCalibration: allProfiles[p.id] !== undefined
        }));

      } catch (error) {
        console.error(`✗ Error testing ${partType}:`, error.message);
        partTypeResult.error = error.message;
      }

      testResult.partTypes[partType] = partTypeResult;

      // Navigate back to clean scene editor for next test
      await page.goto(`${BASE_URL}/scenes/edit/new`);
      await page.waitForLoadState('networkidle');
    }

    results.characters.push(testResult);
  }

    // Write results JSON
    const resultsPath = path.join(OUTPUT_DIR, 'test-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to ${resultsPath}`);

    // Generate summary report
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    for (const char of results.characters) {
      console.log(`\n${char.name} (UI: ${char.uiName}):`);
      for (const [type, result] of Object.entries(char.partTypes)) {
        const status = result.tested && result.hasControlMode && result.hasPresetDropdown ? '✓' : '✗';
        console.log(`  ${status} ${type}: ${result.tested ? 'tested' : 'not tested'}${result.error ? ` (${result.error})` : ''}`);
        if (result.tested && result.parts.length > 0) {
          console.log(`     Parts: ${result.parts.map(p => `${p.name}${p.hasCalibration ? ' ✓' : ' ✗'}`).join(', ')}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('All tests completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
