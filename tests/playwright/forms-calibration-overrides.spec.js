import { test, expect } from '../test.setup';

// Representative per-form workflow: Calibration  Model/Overrides tab
// Assign a model if selector exists, then save overrides and verify Effective JSON updates

test.describe('Form Workflow - Calibration Overrides', () => {
  test('assign model when needed and persist overrides', async ({ page }) => {
    await page.goto('/setup/calibration');

    // Pick the first device
    const listItem = page.locator('#deviceList .list-group-item').first();
    await expect(listItem).toBeVisible();
    await listItem.click();

    // If a model selector is present, assign the first non-empty option
    const modelSel = page.locator('#modelSelect');
    if (await modelSel.count()) {
      const optCount = await modelSel.locator('option').count();
      if (optCount > 1) {
        await modelSel.selectOption({ index: 1 });
        const assignBtn = page.locator('#assignModelBtn');
        if (await assignBtn.count()) await assignBtn.click();
        await page.waitForTimeout(200);
      }
    }

    // Open Model/Overrides tab if present and save overrides
    const tabBtn = page.locator('button.nav-link', { hasText: 'Model/Overrides' });
    if (await tabBtn.count()) await tabBtn.click();

    const editor = page.locator('#overridesEditor');
    const saveBtn = page.locator('#saveOverridesBtn');

    if ((await editor.count()) && (await saveBtn.count())) {
      await editor.fill('{"testFlag":true,"minPulse":600}');
      await saveBtn.click();
      await page.waitForTimeout(200);
      const effective = page.locator('#effectiveJson');
      await expect(effective).toBeVisible();
      const txt = (await effective.textContent()) || '';
      expect(txt).toContain('testFlag');
      expect(txt).toContain('600');
    }
  });
});

