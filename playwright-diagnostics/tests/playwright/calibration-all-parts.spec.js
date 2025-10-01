import { test, expect } from '@playwright/test';
import fs from 'fs';

// End-to-end UI test for Calibration across all currently listed parts.
// - Seeds minimal models via Models UI if none exist for servo/linear_actuator/motor
// - Assigns models per-part on Calibration page when required
// - Exercises basic controls per type
// - Verifies Effective values and Markers CRUD for a servo
// - Verifies character data isolation

async function seedModelViaUI(page, type, name, defaults) {
  await page.goto('/setup/models');
  const typeSelect = page.locator('#typeSelect');
  await typeSelect.selectOption(type);
  // Fill basic fields
  await page.fill('#modelName', name);
  await page.fill('#modelDesc', `${type} defaults for tests`);
  await page.fill('#modelDefaults', JSON.stringify(defaults));
  await page.click('#btnSaveModel');
  // Wait for table to refresh
  await expect(page.locator('#modelsTable tbody')).toBeVisible();
}

async function ensureSeedModels(page) {
  await seedModelViaUI(page, 'servo', 'Test Servo Model', { minPulse: 500, maxPulse: 2500, neutral: 1500, rotationRangeDeg: 180 });
  await seedModelViaUI(page, 'linear_actuator', 'Test LA Model', { speedMaxPct: 100, strokeMs: 2000 });
  await seedModelViaUI(page, 'motor', 'Test Motor Model', { maxDutyPct: 100 });
}

async function maybeAssignModelForSelected(page) {
  const modelSelect = page.locator('#modelSelect');
  if (await modelSelect.count() === 0) return;
  const options = await modelSelect.locator('option').all();
  if (options.length <= 1) return;
  const selected = await modelSelect.inputValue();
  if (!selected) {
    const vals = await modelSelect.locator('option').evaluateAll(ops => ops.map(o => o.value).filter(v => !!v));
    if (vals.length > 0) {
      await modelSelect.selectOption(vals[0]);
      const btn = page.locator('#assignModelBtn');
      if (await btn.isVisible()) await btn.click();
      await page.waitForTimeout(200);
    }
  }
}

async function exerciseControlsForSelected(page) {
  const controls = page.locator('#controlsArea');
  await expect(controls).toBeVisible();
  const moveBtn = controls.locator('#goAng');
  if (await moveBtn.count() > 0) {
    const num = controls.locator('#angNum');
    if (await num.count() > 0) { await num.fill('45'); }
    await moveBtn.click();
    return;
  }
  const stopBtn = controls.locator('#stopBtn');
  if (await stopBtn.count() > 0) { await stopBtn.click(); return; }
  const contStop = controls.locator('button[data-dir="stop"]');
  if (await contStop.count() > 0) { await contStop.click(); return; }
}

test.describe('Calibration - all parts walkthrough', () => {
  test('assign models, exercise controls, verify effective/markers and isolation', async ({ page }) => {
    await ensureSeedModels(page);
    // Ensure character 1 is selected for character-scoped calibration data
    await page.request.post('/setup/characters/api/select', { data: { id: 1 } });


    await page.goto('/setup/calibration');

    const list = page.locator('#deviceList .list-group-item');
    await expect(list.first()).toBeVisible();

    const count = await list.count();
    let didEffective = false;
    let didNoControlsCheck = false;
    let isolationChecked = false;

    for (let i = 0; i < count; i++) {
      const item = list.nth(i);
      await item.scrollIntoViewIfNeeded();
      await item.click();

      // Assign model if required
      await maybeAssignModelForSelected(page);

      // Determine type and ID from meta
      const metaText = await page.locator('#devMeta').textContent();
      const idMatch = metaText && metaText.match(/ID:\s*(\d+)/);
      const typeMatch = metaText && metaText.match(/Type:\s*([a-zA-Z_]+)/);
      const partId = idMatch ? idMatch[1] : null;
      const partType = typeMatch ? typeMatch[1] : '';

      // Exercise controls
      await exerciseControlsForSelected(page);

      // For first servo: verify effective and markers CRUD + isolation
      if (!didEffective && partType === 'servo' && partId) {
        // Open Model/Overrides tab and save overrides
        await page.locator('button.nav-link', { hasText: 'Model/Overrides' }).click();
        await page.fill('#overridesEditor', '{"minPulse":600,"customFlag":"ok"}');
        await page.click('#saveOverridesBtn');
        await page.waitForTimeout(200);
        const effectiveText = await page.locator('#effectiveJson').textContent();
        expect(effectiveText).toContain('600');
        expect(effectiveText).toContain('customFlag');

        // Markers: add, rename, delete
        await page.locator('#minValue').fill('12');
        await page.locator('#setMinBtn').click();
        // Verify via API
        const r1 = await page.request.get(`/setup/calibration/api/parts/${partId}/markers`);
        const m1 = await r1.json();
        expect(m1.success).toBeTruthy();
        const hasMin = (m1.markers || []).some(m => m.name === 'Min');
        expect(hasMin).toBeTruthy();
        // Rename
        const r2 = await page.request.post(`/setup/calibration/api/parts/${partId}/markers/Min/rename`, { data: { newName: 'MinA' } });
        const m2 = await r2.json();
        expect(m2.success).toBeTruthy();
        const hasMinA = (m2.markers || []).some(m => m.name === 'MinA');
        expect(hasMinA).toBeTruthy();
        // Isolation: write a unique marker and check other character file unaffected
        const r3 = await page.request.post(`/setup/calibration/api/parts/${partId}/markers`, { data: { name: 'IsoTest', kind: 'absolute', value: 99, unit: 'deg' } });
        const m3 = await r3.json();
        expect(m3.success).toBeTruthy();
        // Check filesystem for isolation
        const c1 = JSON.parse(fs.readFileSync('data/character-1/parts.json', 'utf8'));
        const p1 = c1.find(p => String(p.id) === String(partId));
        expect(p1).toBeTruthy();
        expect(Array.isArray(p1.markers)).toBeTruthy();
        const hasIso = (p1.markers || []).some(m => m.name === 'IsoTest');
        expect(hasIso).toBeTruthy();
        if (fs.existsSync('data/character-2/parts.json')) {
          const c2 = JSON.parse(fs.readFileSync('data/character-2/parts.json', 'utf8'));
          const p2 = c2.find(p => String(p.id) === String(partId));
          if (p2) {
            const hasIso2 = Array.isArray(p2.markers) && p2.markers.some(m => m.name === 'IsoTest');
            expect(hasIso2).toBeFalsy();
          }
        }
        isolationChecked = true;
        // Cleanup IsoTest
        await page.request.delete(`/setup/calibration/api/parts/${partId}/markers/IsoTest`);
        didEffective = true;
      }

      // For a non-movement type, ensure basic test controls are rendered
      if (!didNoControlsCheck && ['speaker', 'microphone', 'webcam', 'sensor', 'motion_sensor', 'head_tracking', 'light', 'led'].includes(partType)) {
        await expect(page.locator('#controlsArea')).toBeVisible();
        const btnCount = await page.locator('#controlsArea button').count();
        expect(btnCount).toBeGreaterThan(0);
        didNoControlsCheck = true;
      }

      // Quick markers attempt for any part
      const minField = page.locator('#minValue');
      const setMinBtn = page.locator('#setMinBtn');
      if (await minField.count() > 0 && await setMinBtn.count() > 0) {
        await minField.fill('10');
        await setMinBtn.click();

        // Stop early once key checks are satisfied to keep test fast
        if (didEffective && didNoControlsCheck && isolationChecked) {
          break;
        }

      }
    }

    // Heuristic: ensure no console flood
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));
    await page.waitForTimeout(300);
    expect(consoleMessages.length).toBeLessThan(500);

    // Sanity: We should have performed key checks
    expect(didEffective).toBeTruthy();
    expect(didNoControlsCheck).toBeTruthy();
    expect(isolationChecked).toBeTruthy();
  });
});

