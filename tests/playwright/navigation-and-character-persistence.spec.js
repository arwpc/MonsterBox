import { test, expect } from '@playwright/test';

// Helper: open the Character menu even if Bootstrap JS is unavailable
async function openCharacterMenu(page) {
  await page.evaluate(() => {
    const menu = document.getElementById('charMenu');
    if (menu) menu.classList.add('show');
  });
}

async function selectCharacter(page, id) {
  await openCharacterMenu(page);
  // Click the menu item by data attribute; force in case menu is visually hidden
  const selector = `#charMenu .dropdown-item[data-char-id="${id}"]`;
  await page.locator(selector).first().click({ force: true });
  // character-menu.js triggers location.reload() on success; wait for navigation
  await page.waitForLoadState('networkidle');
}

async function currentCharacterLabel(page) {
  const label = page.locator('#charLabel');
  await expect(label).toBeVisible();
  return (await label.textContent()) || '';
}

const PAGES = [
  '/',
  '/setup',
  '/setup/parts',
  '/setup/calibration',
  '/setup/webcam',
  '/setup/models',
  '/setup/audio',
  '/audio-library',
  '/setup/super-powers',
  '/setup/system',
  '/setup/poses',
  '/setup/characters',
  '/setup/character-audio',
  '/live',
  '/scenes',
  '/ai-settings',
  '/ai-settings/stt',
  '/ai-settings/agents',
  '/ai-settings/tts',
  '/ai-settings/character-assignment',
];

async function verifyNavigationShell(page) {
  // Navbar exists
  await expect(page.locator('nav.navbar')).toBeVisible();
  await expect(page.locator('a.navbar-brand', { hasText: 'MonsterBox 4.0' })).toBeVisible();
  // Setup and Activities dropdown triggers exist
  await expect(page.locator('a.nav-link.dropdown-toggle', { hasText: 'Setup' })).toBeVisible();
  await expect(page.locator('a.nav-link.dropdown-toggle', { hasText: 'Activities' })).toBeVisible();
  // Character dropdown visible
  await expect(page.locator('#charLabel')).toBeVisible();
}

async function verifySetupLinksPresent(page) {
  // We only assert that anchor tags exist somewhere in DOM; not necessarily visible if collapsed
  const links = [
    '/setup/calibration', '/setup/webcam', '/setup/models',
    '/setup/audio', '/audio-library', '/setup/characters', '/setup/super-powers', '/setup/system'
  ];
  for (const href of links) {
    const linkLoc = page.locator(`a[href="${href}"]`).first();
    await expect(linkLoc, `Missing nav link ${href}`).toHaveCount(1);
  }
}

async function verifyActivitiesLinksPresent(page) {
  const links = ['/live', '/setup/poses', '/scenes'];
  for (const href of links) {
    const linkLoc = page.locator(`a[href="${href}"]`).first();
    await expect(linkLoc, `Missing nav link ${href}`).toHaveCount(1);
  }
}

// Ensure the navbar toggler is present and keyboard-focusable (basic accessibility check)
async function verifyNavbarTogglerAccessible(page) {
  const toggler = page.locator('button.navbar-toggler');
  await expect(toggler).toHaveCount(1);
  await toggler.focus();
  // Space/Enter should not throw; we cannot guarantee bootstrap JS is loaded, so just send key and ensure no crash
  await page.keyboard.press('Enter');
}

// Note: We avoid asserting modal/dropdown behavior that depends on Bootstrap JS from CDN.

test.describe('Navigation and Character persistence across pages', () => {
  test('nav present, links exist, character selection persists across all pages', async ({ page }) => {
    // Start on dashboard
    await page.goto('/');
    await verifyNavigationShell(page);

    // Capture initial label
    const originalLabel = await currentCharacterLabel(page);

    // Choose a different character (prefer id 2 if available)
    // Load list via API to know available ids
    const resp = await page.request.get('/setup/characters/api/characters');
    const lst = await resp.json();
    const characters = (lst && lst.characters) || [];
    const target = characters.find(c => c.id !== 1) || characters[0];
    if (!target) throw new Error('No characters available for selection test');

    await selectCharacter(page, target.id);
    const afterSelect = await currentCharacterLabel(page);
    // Server renders numeric id; client script later updates to name. Accept either, but never "No Character".
    expect(afterSelect).not.toContain('No Character');
    if (!afterSelect.includes(String(target.name)) && !afterSelect.includes(String(target.id))) {
      // Wait briefly for client script to update label to name
      await page.waitForTimeout(500);
      const afterWait = await currentCharacterLabel(page);
      expect(afterWait).not.toContain('No Character');
    }

    // Visit each page and verify navigation shell + character label persists
    for (const url of PAGES) {
      await page.goto(url);
      // Some URLs return JSON (e.g., if misused); skip shell assertions in that case
      const ct = (await page.evaluate(() => document.contentType || document.querySelector('html')?.getAttribute('xmlns'))) || '';
      // Best-effort: if there is no <nav>, skip shell assertions
      const hasNav = await page.locator('nav.navbar').count();
      if (hasNav > 0) {
        await verifyNavigationShell(page);
        await verifySetupLinksPresent(page);
        await verifyActivitiesLinksPresent(page);
        await verifyNavbarTogglerAccessible(page);
        const lbl = await currentCharacterLabel(page);
        expect(lbl).toContain(String(target.name || target.id));
      }
    }

    // Switch back to original (best effort)
    if (originalLabel) {
      const orig = characters.find(c => originalLabel.includes(String(c.name)) || originalLabel.includes(String(c.id)));
      if (orig) {
        await selectCharacter(page, orig.id);
        const finalLbl = await currentCharacterLabel(page);
        expect(finalLbl).toContain(String(orig.name || orig.id));
      }
    }
  });
});

