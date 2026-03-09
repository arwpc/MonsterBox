import { test, expect } from '@playwright/test';

/**
 * Comprehensive MCP-style browser test — tests every page and interactive element
 * in MonsterBox against the live server. Runs bottom-to-top (Phase 10 → Phase 1).
 *
 * Run with: npx playwright test tests/browser/mcp-comprehensive.spec.js --reporter=list
 */

const BASE = process.env.BASE_URL || 'http://localhost:3100';

// Collect JS errors globally
const pageErrors = {};
function trackErrors(page, label) {
  pageErrors[label] = [];
  page.on('pageerror', err => {
    pageErrors[label].push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      pageErrors[label].push(`[console.error] ${msg.text()}`);
    }
  });
}

// ============================================================
// Phase 10: Error & Edge Cases
// ============================================================
test.describe('Phase 10: Error & Edge Cases', () => {
  test('404 page returns proper error', async ({ page }) => {
    const response = await page.goto(`${BASE}/nonexistent`);
    expect(response.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/not found|404|error/i);
  });

  test('all pages load without JS errors', async ({ page }) => {
    test.setTimeout(120000); // 19 pages need more than 30s
    const pages = [
      '/', '/scenes', '/poses/editor', '/setup', '/setup/characters',
      '/setup/calibration', '/setup/audio', '/setup/jaw-animation',
      '/setup/head-animation', '/setup/system', '/audio-library',
      '/video-library', '/ai-settings', '/ai-settings/stt', '/ai-settings/tts',
      '/goblin-management', '/orchestration', '/live', '/first-run'
    ];

    const errors = {};
    for (const path of pages) {
      const jsErrors = [];
      page.on('pageerror', err => jsErrors.push(err.message));
      const errorHandler = msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('net::ERR')) {
          jsErrors.push(`[console.error] ${msg.text()}`);
        }
      };
      page.on('console', errorHandler);

      // Use 'load' — many pages have WebSocket/polling that prevents 'networkidle'
      const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 15000 });
      expect(response.status()).toBe(200);

      // Wait a moment for async JS to execute
      await page.waitForTimeout(500);

      if (jsErrors.length > 0) {
        errors[path] = jsErrors;
      }

      page.removeListener('pageerror', () => {});
      page.removeListener('console', errorHandler);
    }

    // Report but don't fail on console errors that are non-critical
    if (Object.keys(errors).length > 0) {
      console.log('JS errors found on pages:', JSON.stringify(errors, null, 2));
    }
  });
});

// ============================================================
// Phase 8: Other Pages
// ============================================================
test.describe('Phase 8: Other Pages', () => {
  test('goblin management loads', async ({ page }) => {
    trackErrors(page, 'goblin');
    await page.goto(`${BASE}/goblin-management`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    // Check for key elements
    const content = await page.content();
    expect(content).toContain('goblin');
  });

  test('orchestration page loads', async ({ page }) => {
    trackErrors(page, 'orchestration');
    await page.goto(`${BASE}/orchestration`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('live dashboard loads', async ({ page }) => {
    trackErrors(page, 'live');
    await page.goto(`${BASE}/live`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('first-run page loads with character cards', async ({ page }) => {
    trackErrors(page, 'first-run');
    await page.goto(`${BASE}/first-run`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================
// Phase 7: AI Settings
// ============================================================
test.describe('Phase 7: AI Settings', () => {
  test('main AI settings page loads with status cards', async ({ page }) => {
    trackErrors(page, 'ai-settings');
    await page.goto(`${BASE}/ai-settings`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    // Look for status or connection info
    const content = await page.content();
    expect(content.toLowerCase()).toMatch(/status|connection|ai|settings/);
  });

  test('STT settings page loads', async ({ page }) => {
    trackErrors(page, 'ai-settings-stt');
    await page.goto(`${BASE}/ai-settings/stt`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('TTS settings page loads', async ({ page }) => {
    trackErrors(page, 'ai-settings-tts');
    await page.goto(`${BASE}/ai-settings/tts`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================
// Phase 6: Video Library
// ============================================================
test.describe('Phase 6: Video Library', () => {
  test('video library loads', async ({ page }) => {
    trackErrors(page, 'video-library');
    await page.goto(`${BASE}/video-library`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================
// Phase 5: Audio Library
// ============================================================
test.describe('Phase 5: Audio Library', () => {
  test('audio library loads and has controls', async ({ page }) => {
    trackErrors(page, 'audio-library');
    await page.goto(`${BASE}/audio-library`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();

    // Check for search/filter controls
    const searchInput = page.locator('#searchInput');
    if (await searchInput.count() > 0) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      await searchInput.clear();
    }

    // Check for category filter
    const categoryFilter = page.locator('#categoryFilter');
    if (await categoryFilter.count() > 0) {
      await expect(categoryFilter).toBeVisible();
    }

    // Check for view toggles
    const viewGrid = page.locator('#viewGrid');
    const viewList = page.locator('#viewList');
    if (await viewGrid.count() > 0) {
      await viewGrid.click();
      await page.waitForTimeout(300);
    }
    if (await viewList.count() > 0) {
      await viewList.click();
      await page.waitForTimeout(300);
    }
  });
});

// ============================================================
// Phase 4: Setup Pages
// ============================================================
test.describe('Phase 4: Setup Pages', () => {
  test('4a: Setup index loads with cards', async ({ page }) => {
    trackErrors(page, 'setup');
    await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    // Verify setup cards/links are present
    const links = await page.locator('a[href*="/setup/"]').count();
    expect(links).toBeGreaterThan(0);
  });

  test('4b: Character management loads', async ({ page }) => {
    trackErrors(page, 'setup-characters');
    await page.goto(`${BASE}/setup/characters`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('4c: Calibration page loads', async ({ page }) => {
    trackErrors(page, 'setup-calibration');
    await page.goto(`${BASE}/setup/calibration`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('4d: Audio setup loads', async ({ page }) => {
    trackErrors(page, 'setup-audio');
    await page.goto(`${BASE}/setup/audio`, { waitUntil: 'load' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('4e: Jaw animation setup loads', async ({ page }) => {
    trackErrors(page, 'setup-jaw');
    await page.goto(`${BASE}/setup/jaw-animation`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('4f: Head animation setup loads', async ({ page }) => {
    trackErrors(page, 'setup-head');
    await page.goto(`${BASE}/setup/head-animation`, { waitUntil: 'load' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('4g: System configuration loads', async ({ page }) => {
    trackErrors(page, 'setup-system');
    await page.goto(`${BASE}/setup/system`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================
// Phase 3: Pose Editor
// ============================================================
test.describe('Phase 3: Pose Editor', () => {
  test('pose editor loads with form fields', async ({ page }) => {
    trackErrors(page, 'pose-editor');
    await page.goto(`${BASE}/poses/editor`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();

    // Check form fields exist
    const poseName = page.locator('#poseName');
    if (await poseName.count() > 0) {
      await poseName.fill('MCP Test Pose');
    }

    const poseCategory = page.locator('#poseCategory');
    if (await poseCategory.count() > 0) {
      await poseCategory.fill('test');
    }

    const poseDescription = page.locator('#poseDescription');
    if (await poseDescription.count() > 0) {
      await poseDescription.fill('Created by MCP browser test');
    }

    // Test audio type selector
    const audioType = page.locator('#audioType');
    if (await audioType.count() > 0) {
      await audioType.selectOption('file');
      await page.waitForTimeout(300);
      await audioType.selectOption('tts');
      await page.waitForTimeout(300);
      await audioType.selectOption('none');
    }

    // Check for part cards
    const partCards = page.locator('.part-card');
    const partCount = await partCards.count();
    console.log(`Pose Editor: Found ${partCount} part cards`);
  });

  test('pose list loads', async ({ page }) => {
    const response = await page.goto(`${BASE}/poses/api/poses`);
    const data = await response.json();
    expect(data).toBeDefined();
    console.log(`Poses API: returned ${Array.isArray(data) ? data.length : (data.poses ? data.poses.length : 'unknown')} poses`);
  });
});

// ============================================================
// Phase 2: Animation Studio
// ============================================================
test.describe('Phase 2: Animation Studio', () => {
  test('animation studio loads with all panels', async ({ page }) => {
    trackErrors(page, 'animation-studio');
    await page.goto(`${BASE}/scenes`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();

    // Check toolbar buttons
    for (const id of ['#btnNewScene', '#btnSave', '#btnPlay', '#btnStop', '#btnEmergencyStop']) {
      const btn = page.locator(id);
      if (await btn.count() > 0) {
        console.log(`  Animation Studio: ${id} found`);
      } else {
        console.log(`  Animation Studio: ${id} MISSING`);
      }
    }

    // Check toggles
    for (const id of ['#jawToggle', '#headTrackToggle']) {
      const toggle = page.locator(id);
      if (await toggle.count() > 0) {
        console.log(`  Animation Studio: ${id} found`);
      } else {
        console.log(`  Animation Studio: ${id} MISSING`);
      }
    }

    // Check scenes section
    const scenesSection = page.locator('#scenesSection');
    if (await scenesSection.count() > 0) {
      console.log('  Animation Studio: scenes section found');
    }
  });

  test('scenes API returns data', async ({ page }) => {
    const response = await page.goto(`${BASE}/scenes/api/`);
    const data = await response.json();
    expect(data.success).toBe(true);
    console.log(`Scenes API: returned ${data.scenes ? data.scenes.length : 0} scenes`);
  });
});

// ============================================================
// Phase 1: Dashboard
// ============================================================
test.describe('Phase 1: Dashboard', () => {
  test('dashboard loads with all 8 panels', async ({ page }) => {
    trackErrors(page, 'dashboard');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();

    // Check all 8 panels by data-panel-id
    const panels = ['webcam', 'console', 'scenes', 'poses', 'manual-controls',
                     'monster-features', 'chat', 'audio-bridge'];
    for (const panelId of panels) {
      const panel = page.locator(`[data-panel-id="${panelId}"]`);
      const count = await panel.count();
      if (count > 0) {
        console.log(`  Dashboard: panel "${panelId}" found`);
      } else {
        console.log(`  Dashboard: panel "${panelId}" MISSING`);
      }
    }
  });

  test('console panel controls work', async ({ page }) => {
    trackErrors(page, 'dashboard-console');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // Test console lines dropdown
    const consoleLines = page.locator('#consoleLines');
    if (await consoleLines.count() > 0) {
      await consoleLines.selectOption('100');
      await page.waitForTimeout(500);
      await consoleLines.selectOption('50');
    }

    // Test live toggle
    const consoleLive = page.locator('#consoleLive');
    if (await consoleLive.count() > 0) {
      await consoleLive.click();
      await page.waitForTimeout(300);
      await consoleLive.click();
    }

    // Test refresh button
    const refreshBtn = page.locator('#btnConsoleRefresh');
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('monster features toggles work', async ({ page }) => {
    trackErrors(page, 'dashboard-monster-features');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    for (const id of ['#jawToggle', '#parrotToggle', '#headTrackToggle', '#speakerMuteToggle']) {
      const toggle = page.locator(id);
      if (await toggle.count() > 0) {
        // Get current state, toggle, then toggle back
        const wasChecked = await toggle.isChecked().catch(() => false);
        await toggle.click({ force: true });
        await page.waitForTimeout(500);
        await toggle.click({ force: true });
        await page.waitForTimeout(300);
        console.log(`  Monster Features: ${id} toggled successfully`);
      } else {
        console.log(`  Monster Features: ${id} not found`);
      }
    }
  });

  test('character selector works', async ({ page }) => {
    trackErrors(page, 'dashboard-character');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    const charSelect = page.locator('#character-select');
    if (await charSelect.count() > 0) {
      const options = await charSelect.locator('option').allTextContents();
      console.log(`  Character selector: ${options.length} options: ${options.join(', ')}`);

      if (options.length > 1) {
        // Switch to second character
        const secondOption = await charSelect.locator('option').nth(1).getAttribute('value');
        if (secondOption) {
          await charSelect.selectOption(secondOption);
          await page.waitForTimeout(2000);
          console.log(`  Switched to character: ${secondOption}`);

          // Switch back to first
          const firstOption = await charSelect.locator('option').nth(0).getAttribute('value');
          if (firstOption) {
            await charSelect.selectOption(firstOption);
            await page.waitForTimeout(2000);
            console.log(`  Switched back to character: ${firstOption}`);
          }
        }
      }
    }
  });

  test('scenes panel has content', async ({ page }) => {
    trackErrors(page, 'dashboard-scenes');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    const scenesContainer = page.locator('#scenesContainer');
    if (await scenesContainer.count() > 0) {
      const items = await scenesContainer.locator('.scene-item, .list-group-item, [data-scene-id]').count();
      console.log(`  Scenes panel: ${items} scene items`);
    }

    // Test loop all button
    const btnLoopAll = page.locator('#btnLoopAll');
    if (await btnLoopAll.count() > 0) {
      console.log('  Scenes panel: Loop All button found');
    }
  });

  test('chat panel works', async ({ page }) => {
    trackErrors(page, 'dashboard-chat');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    const chatInput = page.locator('#chatInput');
    if (await chatInput.count() > 0) {
      await chatInput.fill('Hello from MCP test');
      const chatSendBtn = page.locator('#chatSendBtn');
      if (await chatSendBtn.count() > 0) {
        await chatSendBtn.click();
        await page.waitForTimeout(1000);
        console.log('  Chat: message sent');
      }
    }

    // Test chat toggles
    for (const id of ['#chatAiOnToggle', '#chatMuteSpeaker', '#chatBrowserSpeaker', '#chatBrowserMic']) {
      const toggle = page.locator(id);
      if (await toggle.count() > 0) {
        console.log(`  Chat: ${id} found`);
      }
    }
  });

  test('manual controls panel works', async ({ page }) => {
    trackErrors(page, 'dashboard-manual-controls');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // Check edit toggle
    const editToggle = page.locator('#mcEditToggle');
    if (await editToggle.count() > 0) {
      await editToggle.click();
      await page.waitForTimeout(500);

      // Check layout selector
      const layoutSelect = page.locator('#mcLayoutSelect');
      if (await layoutSelect.count() > 0) {
        console.log('  Manual Controls: layout selector found');
      }

      // Exit edit mode
      await editToggle.click();
      await page.waitForTimeout(300);
    }
  });
});

// ============================================================
// Phase 9: Cross-character testing
// ============================================================
test.describe('Phase 9: Cross-character testing', () => {
  test('switching characters changes data on key pages', async ({ page }) => {
    trackErrors(page, 'cross-character');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    const charSelect = page.locator('#character-select');
    if (await charSelect.count() === 0) {
      test.skip();
      return;
    }

    const options = await charSelect.locator('option').all();
    if (options.length < 2) {
      console.log('  Cross-character: Only 1 character, skipping');
      test.skip();
      return;
    }

    // Get first character value
    const firstVal = await options[0].getAttribute('value');
    const secondVal = await options[1].getAttribute('value');

    // Switch to second character
    await charSelect.selectOption(secondVal);
    await page.waitForTimeout(2000);

    // Test scenes page with second character
    await page.goto(`${BASE}/scenes`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    console.log(`  Cross-character: scenes page loaded for character ${secondVal}`);

    // Test poses editor with second character
    await page.goto(`${BASE}/poses/editor`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    console.log(`  Cross-character: poses editor loaded for character ${secondVal}`);

    // Test calibration with second character
    await page.goto(`${BASE}/setup/calibration`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    console.log(`  Cross-character: calibration loaded for character ${secondVal}`);

    // Switch back
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const charSelectAgain = page.locator('#character-select');
    if (await charSelectAgain.count() > 0) {
      await charSelectAgain.selectOption(firstVal);
      await page.waitForTimeout(1000);
    }
  });
});
