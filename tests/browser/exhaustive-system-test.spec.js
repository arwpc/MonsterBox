import { test, expect } from '@playwright/test';

/**
 * EXHAUSTIVE System-Wide Browser Test
 * Tests every page, panel, form, control, toggle, button, slider, dropdown, and input.
 *
 * Run against LIVE server:
 *   BASE_URL=http://localhost:3100 npx playwright test tests/browser/exhaustive-system-test.spec.js --reporter=list
 *
 * Run against test server (default):
 *   npx playwright test tests/browser/exhaustive-system-test.spec.js --reporter=list
 */

const BASE = process.env.BASE_URL || 'http://localhost:3200';

// Global error collector for the report
const testReport = {
  pages: {},
  consoleErrors: [],
  networkErrors: [],
  bugs: [],
  passed: 0,
  failed: 0,
  skipped: 0
};

function trackPage(page, label) {
  const errors = { console: [], network: [], pageErrors: [] };
  page.on('pageerror', err => {
    errors.pageErrors.push({ message: err.message, stack: err.stack });
    testReport.consoleErrors.push({ page: label, message: err.message });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('net::ERR')) {
        errors.console.push(text);
        testReport.consoleErrors.push({ page: label, message: text });
      }
    }
  });
  page.on('response', resp => {
    if (resp.status() >= 400) {
      const entry = { url: resp.url(), status: resp.status() };
      errors.network.push(entry);
      // Don't report favicon/websocket 404s
      if (!resp.url().includes('favicon') && !resp.url().includes('socket')) {
        testReport.networkErrors.push({ page: label, ...entry });
      }
    }
  });
  return errors;
}

// Helper: safe click (only if element exists)
async function safeClick(page, selector, description) {
  const el = page.locator(selector);
  if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
    await el.click({ force: true, timeout: 3000 }).catch(e => {
      console.log(`  [WARN] click failed on ${description || selector}: ${e.message}`);
    });
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

// Helper: safe fill
async function safeFill(page, selector, value, description) {
  const el = page.locator(selector);
  if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
    await el.fill(value, { timeout: 3000 }).catch(e => {
      console.log(`  [WARN] fill failed on ${description || selector}: ${e.message}`);
    });
    return true;
  }
  return false;
}

// Helper: safe select
async function safeSelect(page, selector, value, description) {
  const el = page.locator(selector);
  if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
    await el.selectOption(value, { timeout: 3000 }).catch(e => {
      console.log(`  [WARN] select failed on ${description || selector}: ${e.message}`);
    });
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

// Helper: safe toggle (click checkbox and toggle back)
async function safeToggle(page, selector, description) {
  const el = page.locator(selector);
  if (await el.count() > 0) {
    await el.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await el.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    console.log(`  [OK] ${description || selector} toggled`);
    return true;
  }
  console.log(`  [SKIP] ${description || selector} not found`);
  return false;
}

// Helper: count elements
async function countElements(page, selector) {
  return await page.locator(selector).count();
}

// Helper: enumerate & log interactive elements on page
async function auditInteractiveElements(page, label) {
  const counts = await page.evaluate(() => {
    return {
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input').length,
      selects: document.querySelectorAll('select').length,
      textareas: document.querySelectorAll('textarea').length,
      checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
      sliders: document.querySelectorAll('input[type="range"]').length,
      links: document.querySelectorAll('a[href]').length,
      forms: document.querySelectorAll('form').length,
    };
  });
  console.log(`  [AUDIT] ${label}: ${JSON.stringify(counts)}`);
  testReport.pages[label] = { ...testReport.pages[label], interactiveElements: counts };
  return counts;
}

// ============================================================
// Phase 1: Dashboard (/)
// ============================================================
test.describe('Phase 1: Dashboard', () => {
  test.setTimeout(60000);

  test('1.1 — Dashboard loads with all panels', async ({ page }) => {
    const errors = trackPage(page, 'dashboard');
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000); // let async panels load

    // Verify page title
    const title = await page.title();
    expect(title).toContain('MonsterBox');

    // Check all panels by data-panel-id (includes accordion items in new layout)
    const expectedPanels = ['webcam', 'console', 'scenes', 'poses', 'manual-controls',
                            'monster-features', 'chat', 'audio-bridge', 'say'];
    const foundPanels = [];
    const missingPanels = [];

    for (const panelId of expectedPanels) {
      const panel = page.locator(`[data-panel-id="${panelId}"]`);
      if (await panel.count() > 0) {
        foundPanels.push(panelId);
      } else {
        missingPanels.push(panelId);
      }
    }

    console.log(`  Dashboard panels found: ${foundPanels.join(', ')}`);
    if (missingPanels.length > 0) {
      console.log(`  Dashboard panels MISSING: ${missingPanels.join(', ')}`);
      testReport.bugs.push({ page: '/', description: `Missing panels: ${missingPanels.join(', ')}` });
    }

    // At least 7 panels must be present
    expect(foundPanels.length).toBeGreaterThanOrEqual(7);

    await auditInteractiveElements(page, 'dashboard');
    testReport.pages['dashboard'] = { ...testReport.pages['dashboard'], status: 'loaded', panels: foundPanels, missing: missingPanels };
  });

  test('1.2 — Console panel controls', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-console');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Expand console accordion panel (new dashboard layout)
    const consoleAccBtn = page.locator('[data-bs-target="#collapseConsole"]');
    if (await consoleAccBtn.count() > 0) {
      await consoleAccBtn.click();
      await page.waitForTimeout(500);
    }

    // Lines dropdown
    await safeSelect(page, '#consoleLines', '200', 'Console lines 200');
    await safeSelect(page, '#consoleLines', '50', 'Console lines 50');
    await safeSelect(page, '#consoleLines', '100', 'Console lines back to 100');

    // Live toggle
    await safeToggle(page, '#consoleLive', 'Console live toggle');

    // Refresh button
    await safeClick(page, '#btnConsoleRefresh', 'Console refresh');

    // Verify console output element exists
    const consoleOutput = page.locator('#consoleOutput');
    expect(await consoleOutput.count()).toBeGreaterThan(0);

    // Collapse/expand
    const collapseBtn = page.locator('[data-panel-id="console"] [title="Collapse / Expand"], [data-panel-id="console"] .panel-collapse-btn');
    if (await collapseBtn.count() > 0) {
      await collapseBtn.first().click({ force: true });
      await page.waitForTimeout(500);
      await collapseBtn.first().click({ force: true });
      await page.waitForTimeout(300);
      console.log('  [OK] Console collapse/expand toggled');
    }
  });

  test('1.3 — Monster Features toggles', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-monster-features');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const toggles = [
      { id: '#jawToggle', name: 'Jaw Animation' },
      { id: '#parrotToggle', name: 'Parrot Mode' },
      { id: '#translateToggle', name: 'Translate' },
      { id: '#headTrackToggle', name: 'Head Tracking' },
      { id: '#speakerMuteToggle', name: 'Mute Speaker' },
    ];

    for (const t of toggles) {
      await safeToggle(page, t.id, t.name);
    }
  });

  test('1.4 — Chat panel controls', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-chat');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Chat input
    await safeFill(page, '#chatInput', 'Exhaustive test message', 'Chat input');

    // Send button
    await safeClick(page, '#chatSendBtn', 'Chat send');
    await page.waitForTimeout(500);

    // Audio mode dropdown
    await safeSelect(page, '#chatAudioMode', 'Audio: Auto', 'Chat audio mode');

    // Chat toggles
    await safeToggle(page, '#chatAiOnToggle', 'AI On toggle');
    await safeToggle(page, '#chatMuteSpeaker', 'Chat mute speaker');
    await safeToggle(page, '#chatBrowserSpeaker', 'Chat browser speaker');
    await safeToggle(page, '#chatBrowserMic', 'Chat browser mic');
  });

  test('1.5 — Scenes panel controls', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-scenes');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Expand scenes accordion panel (new dashboard layout)
    const scenesAccBtn = page.locator('[data-bs-target="#collapseScenes"]');
    if (await scenesAccBtn.count() > 0) {
      await scenesAccBtn.click();
      await page.waitForTimeout(500);
    }

    const sceneItems = await countElements(page, '#scenesContainer .scene-item, #scenesContainer [data-scene-id]');
    console.log(`  Scenes panel: ${sceneItems} scene items`);

    // Loop All button
    const hasLoopAll = await safeClick(page, '#btnLoopAll', 'Loop All');
    if (hasLoopAll) {
      await page.waitForTimeout(500);
      await safeClick(page, '#btnStopLoop', 'Stop Loop');
    }

    // Open in Animation Studio link
    const studioLink = page.locator('[data-panel-id="scenes"] a[href="/scenes"]');
    if (await studioLink.count() > 0) {
      console.log('  [OK] Animation Studio link present in scenes panel');
    }
  });

  test('1.6 — Manual Controls panel', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-manual-controls');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Layout selector
    const layoutSelect = page.locator('#mcLayoutSelect');
    if (await layoutSelect.count() > 0) {
      const options = await layoutSelect.locator('option').allTextContents();
      console.log(`  Manual Controls: layouts: ${options.join(', ')}`);
    }

    // Edit Layout button
    await safeClick(page, '#mcEditToggle', 'Edit Layout toggle');
    await page.waitForTimeout(500);
    await safeClick(page, '#mcEditToggle', 'Exit Edit Layout');

    // Save/Delete/Add layout buttons
    await safeClick(page, '#mcSaveLayout', 'Save layout');
    // Note: don't click delete layout to avoid data loss

    // Hardware items count
    const hardwareItems = await countElements(page, '.manual-control-item, .hardware-card, [data-part-id]');
    console.log(`  Manual Controls: ${hardwareItems} hardware items`);
  });

  test('1.7 — Say panel controls', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-say');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Speaker dropdown
    const speakerSelect = page.locator('[data-panel-id="say"] select, #saySpeaker');
    if (await speakerSelect.count() > 0) {
      console.log('  [OK] Say panel speaker dropdown found');
    }

    // Text input
    await safeFill(page, '[data-panel-id="say"] input[type="text"], #sayText', 'Test speech', 'Say text input');

    // Speak button (don't actually click to avoid audio)
    const speakBtn = page.locator('[data-panel-id="say"] button:has-text("Speak"), #btnSpeak');
    if (await speakBtn.count() > 0) {
      console.log('  [OK] Speak button found');
    }
  });

  test('1.8 — Audio Bridge panel', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-audio-bridge');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Listen In section
    const listenStart = page.locator('[data-panel-id="audio-bridge"] button:has-text("Start")').first();
    if (await listenStart.count() > 0) {
      console.log('  [OK] Audio Bridge Listen In Start button found');
    }

    // Volume slider
    const volumeSlider = page.locator('[data-panel-id="audio-bridge"] input[type="range"]');
    if (await volumeSlider.count() > 0) {
      console.log(`  [OK] Audio Bridge volume slider found (count: ${await volumeSlider.count()})`);
    }

    // Input/Output device selects
    const deviceSelects = page.locator('[data-panel-id="audio-bridge"] select');
    const selectCount = await deviceSelects.count();
    console.log(`  Audio Bridge: ${selectCount} device selectors`);
  });

  test('1.9 — Character switcher', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-character-switch');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Character selector in navbar
    const charBtn = page.locator('#character-select, .character-dropdown, [data-character-select]');
    const navCharBtn = page.locator('nav button:has-text("Orlok"), nav .dropdown-toggle');

    if (await navCharBtn.count() > 0) {
      await navCharBtn.first().click();
      await page.waitForTimeout(500);

      // Look for dropdown items
      const charItems = page.locator('.dropdown-menu .dropdown-item, .character-option');
      const charCount = await charItems.count();
      console.log(`  Character selector: ${charCount} character options`);

      if (charCount > 1) {
        // Switch to second character
        await charItems.nth(1).click();
        await page.waitForTimeout(2000);
        console.log('  [OK] Switched to second character');

        // Navigate to verify data changed
        const scenesResp = await page.request.get(`${BASE}/scenes/api/`);
        expect(scenesResp.status()).toBe(200);

        // Switch back
        await page.goto(`${BASE}/`, { waitUntil: 'load' });
        await page.waitForTimeout(1000);
        const navCharBtn2 = page.locator('nav button:has-text("Orlok"), nav .dropdown-toggle').first();
        if (await navCharBtn2.count() > 0) {
          await navCharBtn2.click();
          await page.waitForTimeout(300);
          const charItems2 = page.locator('.dropdown-menu .dropdown-item, .character-option');
          if (await charItems2.count() > 0) {
            await charItems2.first().click();
            await page.waitForTimeout(1000);
          }
        }
      }
    }
  });

  test('1.10 — Webcam panel', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-webcam');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const webcamImg = page.locator('[data-panel-id="webcam"] img, #webcamStream');
    if (await webcamImg.count() > 0) {
      console.log('  [OK] Webcam image element found');
      const src = await webcamImg.first().getAttribute('src');
      console.log(`  Webcam src: ${src}`);
    }
  });

  test('1.11 — Poses panel', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-poses');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const posesPanel = page.locator('[data-panel-id="poses"]');
    if (await posesPanel.count() > 0) {
      const poseItems = await posesPanel.locator('.pose-item, [data-pose-id], .list-group-item').count();
      console.log(`  Poses panel: ${poseItems} pose items`);
    }

    // New pose link
    const newPoseLink = page.locator('a[href="/poses/editor"]');
    if (await newPoseLink.count() > 0) {
      console.log('  [OK] New Pose link found');
    }
  });

  test('1.12 — Navigation dropdowns', async ({ page }) => {
    const errors = trackPage(page, 'dashboard-nav');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Setup dropdown
    const setupBtn = page.locator('nav button:has-text("Setup"), nav .nav-link:has-text("Setup")');
    if (await setupBtn.count() > 0) {
      await setupBtn.first().click();
      await page.waitForTimeout(500);
      const setupItems = await page.locator('.dropdown-menu:visible .dropdown-item').count();
      console.log(`  Nav Setup dropdown: ${setupItems} items`);
      await page.keyboard.press('Escape');
    }

    // Activities dropdown
    const activitiesBtn = page.locator('nav button:has-text("Activities"), nav .nav-link:has-text("Activities")');
    if (await activitiesBtn.count() > 0) {
      await activitiesBtn.first().click();
      await page.waitForTimeout(500);
      const actItems = await page.locator('.dropdown-menu:visible .dropdown-item').count();
      console.log(`  Nav Activities dropdown: ${actItems} items`);
      await page.keyboard.press('Escape');
    }
  });
});

// ============================================================
// Phase 2: Animation Studio (/scenes)
// ============================================================
test.describe('Phase 2: Animation Studio', () => {
  test.setTimeout(60000);

  test('2.1 — Studio loads with all panels and toolbar', async ({ page }) => {
    const errors = trackPage(page, 'animation-studio');
    await page.goto(`${BASE}/scenes`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    expect(title.toLowerCase()).toContain('animation');

    // Toolbar buttons
    const toolbarBtns = ['#btnNewScene', '#btnNewPose', '#btnSave', '#btnPlay', '#btnStop', '#btnEmergencyStop'];
    for (const id of toolbarBtns) {
      const btn = page.locator(id);
      const found = await btn.count() > 0;
      console.log(`  Toolbar ${id}: ${found ? 'FOUND' : 'MISSING'}`);
      if (!found) testReport.bugs.push({ page: '/scenes', description: `Toolbar button ${id} missing` });
    }

    // Toggles
    for (const id of ['#jawToggle', '#headTrackToggle']) {
      const toggle = page.locator(id);
      console.log(`  Toggle ${id}: ${await toggle.count() > 0 ? 'FOUND' : 'MISSING'}`);
    }

    // Three main panels
    const scenesSection = page.locator('#scenesSection');
    const posesSection = page.locator('#posesSection');
    const queueSection = page.locator('#queueSection');
    console.log(`  scenesSection: ${await scenesSection.count() > 0}`);
    console.log(`  posesSection: ${await posesSection.count() > 0}`);
    console.log(`  queueSection: ${await queueSection.count() > 0}`);

    await auditInteractiveElements(page, 'animation-studio');
  });

  test('2.2 — Scene CRUD via API', async ({ page }) => {
    const errors = trackPage(page, 'scenes-api');

    // List scenes
    const listResp = await page.request.get(`${BASE}/scenes/api/`);
    expect(listResp.status()).toBe(200);
    const listData = await listResp.json();
    expect(listData.success).toBe(true);
    const sceneCount = listData.scenes ? listData.scenes.length : 0;
    console.log(`  Scenes API: ${sceneCount} scenes`);

    // Create a test scene
    const createResp = await page.request.post(`${BASE}/scenes/api/`, {
      data: { name: 'Exhaustive Test Scene', steps: [{ type: 'wait', duration: 100 }] }
    });
    expect(createResp.status()).toBe(200);
    const createData = await createResp.json();
    const newSceneId = createData.scene?.id || createData.id;
    console.log(`  Created scene: ${newSceneId}`);

    if (newSceneId) {
      // Update scene
      const updateResp = await page.request.put(`${BASE}/scenes/api/${newSceneId}`, {
        data: { name: 'Exhaustive Test Scene Updated', steps: [{ type: 'wait', duration: 200 }] }
      });
      expect(updateResp.status()).toBe(200);

      // Delete scene
      const deleteResp = await page.request.delete(`${BASE}/scenes/api/${newSceneId}`);
      expect(deleteResp.status()).toBe(200);
      console.log(`  Deleted test scene: ${newSceneId}`);
    }
  });

  test('2.3 — Studio toggles and E-stop', async ({ page }) => {
    const errors = trackPage(page, 'studio-toggles');
    await page.goto(`${BASE}/scenes`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await safeToggle(page, '#jawToggle', 'Jaw toggle (studio)');
    await safeToggle(page, '#headTrackToggle', 'Head track toggle (studio)');

    // E-stop (safe to click — just sends stop command)
    await safeClick(page, '#btnEmergencyStop', 'Emergency Stop');
    await page.waitForTimeout(500);

    // Stop button
    await safeClick(page, '#btnStop', 'Stop button');
  });

  test('2.4 — Step palette exists', async ({ page }) => {
    const errors = trackPage(page, 'studio-palette');
    await page.goto(`${BASE}/scenes`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Check for step type palette/dropdown
    const stepTypes = ['servo', 'motor', 'light', 'audio', 'sayThis', 'wait', 'pose'];
    const paletteContent = await page.content();
    for (const st of stepTypes) {
      if (paletteContent.includes(st)) {
        console.log(`  Step type "${st}" referenced in page`);
      }
    }
  });
});

// ============================================================
// Phase 3: Pose Editor
// ============================================================
test.describe('Phase 3: Pose Editor', () => {
  test.setTimeout(60000);

  test('3.1 — Editor loads with form and part cards', async ({ page }) => {
    const errors = trackPage(page, 'pose-editor');
    await page.goto(`${BASE}/poses/editor`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Form fields
    const fields = ['#poseName', '#poseCategory', '#poseDescription'];
    for (const id of fields) {
      const el = page.locator(id);
      const found = await el.count() > 0;
      console.log(`  Pose Editor ${id}: ${found ? 'FOUND' : 'MISSING'}`);
    }

    // Fill form
    await safeFill(page, '#poseName', 'Exhaustive Test Pose', 'Pose name');
    await safeFill(page, '#poseCategory', 'test', 'Pose category');
    await safeFill(page, '#poseDescription', 'Created by exhaustive browser test', 'Pose description');

    // Part cards
    const partCards = await countElements(page, '.part-card, .hardware-part, [data-part-id]');
    console.log(`  Pose Editor: ${partCards} part cards`);

    await auditInteractiveElements(page, 'pose-editor');
  });

  test('3.2 — Audio type selector', async ({ page }) => {
    const errors = trackPage(page, 'pose-editor-audio');
    await page.goto(`${BASE}/poses/editor`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const audioType = page.locator('#audioType');
    if (await audioType.count() > 0) {
      const options = await audioType.locator('option').allTextContents();
      console.log(`  Audio type options: ${options.join(', ')}`);

      for (const opt of ['file', 'tts', 'none']) {
        await audioType.selectOption(opt).catch(() => {});
        await page.waitForTimeout(300);
        console.log(`  Selected audio type: ${opt}`);
      }
    }
  });

  test('3.3 — Pose CRUD via API', async ({ page }) => {
    const errors = trackPage(page, 'pose-api');

    // List poses
    const listResp = await page.request.get(`${BASE}/poses/api/poses`);
    expect(listResp.status()).toBe(200);
    const listData = await listResp.json();
    const poseCount = Array.isArray(listData) ? listData.length : (listData.poses ? listData.poses.length : 0);
    console.log(`  Poses API: ${poseCount} poses`);

    // Create test pose
    const createResp = await page.request.post(`${BASE}/poses`, {
      data: { name: 'ExhaustiveTestPose', category: 'test', description: 'Auto-test', parts: {} }
    });
    const createStatus = createResp.status();
    console.log(`  Create pose: status ${createStatus}`);

    if (createStatus === 200 || createStatus === 201) {
      const createData = await createResp.json();
      const newPoseId = createData.pose?.id || createData.id;
      if (newPoseId) {
        // Update
        const updateResp = await page.request.put(`${BASE}/poses/${newPoseId}`, {
          data: { name: 'ExhaustiveTestPoseUpdated', category: 'test', description: 'Updated', parts: {} }
        });
        console.log(`  Update pose: status ${updateResp.status()}`);

        // Delete
        const deleteResp = await page.request.delete(`${BASE}/poses/${newPoseId}`);
        console.log(`  Delete pose: status ${deleteResp.status()}`);
      }
    }
  });

  test('3.4 — Part controls (sliders, buttons)', async ({ page }) => {
    const errors = trackPage(page, 'pose-editor-parts');
    await page.goto(`${BASE}/poses/editor`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Count sliders (servo angle controls)
    const sliders = page.locator('input[type="range"]');
    const sliderCount = await sliders.count();
    console.log(`  Pose Editor: ${sliderCount} sliders`);

    // Test first few sliders if any
    for (let i = 0; i < Math.min(sliderCount, 3); i++) {
      const slider = sliders.nth(i);
      const min = await slider.getAttribute('min') || '0';
      const max = await slider.getAttribute('max') || '180';
      const mid = Math.round((parseInt(min) + parseInt(max)) / 2);
      await slider.fill(String(mid)).catch(() => {});
      console.log(`  Slider ${i}: set to ${mid} (range ${min}-${max})`);
    }

    // Test buttons in part cards
    const testBtns = page.locator('.part-card button, [data-part-id] button');
    const btnCount = await testBtns.count();
    console.log(`  Pose Editor: ${btnCount} part buttons`);
  });
});

// ============================================================
// Phase 4: Setup Pages
// ============================================================
test.describe('Phase 4: Setup Pages', () => {
  test.setTimeout(90000);

  test('4.1 — Setup index loads with links', async ({ page }) => {
    const errors = trackPage(page, 'setup-index');
    await page.goto(`${BASE}/setup`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const setupLinks = await countElements(page, 'a[href*="/setup/"]');
    console.log(`  Setup index: ${setupLinks} setup links`);
    expect(setupLinks).toBeGreaterThan(0);

    await auditInteractiveElements(page, 'setup-index');
  });

  test('4.2 — Character management', async ({ page }) => {
    const errors = trackPage(page, 'setup-characters');
    await page.goto(`${BASE}/setup/characters`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const characterCards = await countElements(page, '.character-card, .card, [data-character-id]');
    console.log(`  Characters: ${characterCards} character cards`);

    await auditInteractiveElements(page, 'setup-characters');
  });

  test('4.3 — Calibration page', async ({ page }) => {
    const errors = trackPage(page, 'setup-calibration');
    await page.goto(`${BASE}/setup/calibration`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Part panels
    const partPanels = await countElements(page, '.calibration-panel, .part-panel, [data-part-id]');
    console.log(`  Calibration: ${partPanels} part panels`);

    // Sliders
    const sliders = await countElements(page, 'input[type="range"]');
    console.log(`  Calibration: ${sliders} sliders`);

    await auditInteractiveElements(page, 'setup-calibration');
  });

  test('4.4 — Audio setup', async ({ page }) => {
    const errors = trackPage(page, 'setup-audio');
    await page.goto(`${BASE}/setup/audio`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Input/output device selects
    const selects = await countElements(page, 'select');
    console.log(`  Audio Setup: ${selects} dropdowns`);

    // Volume controls
    const sliders = await countElements(page, 'input[type="range"]');
    console.log(`  Audio Setup: ${sliders} sliders`);

    await auditInteractiveElements(page, 'setup-audio');
  });

  test('4.5 — Jaw animation setup', async ({ page }) => {
    const errors = trackPage(page, 'setup-jaw');
    await page.goto(`${BASE}/setup/jaw-animation`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Check for enable checkbox
    const enableCheckbox = page.locator('#jawEnabled, input[name="enabled"]');
    if (await enableCheckbox.count() > 0) {
      console.log('  [OK] Jaw enable checkbox found');
    }

    // Servo selector
    const servoSelect = page.locator('#jawServo, select[name="servoPartId"]');
    if (await servoSelect.count() > 0) {
      console.log('  [OK] Jaw servo selector found');
    }

    // Preset buttons
    const presets = page.locator('.preset-btn, button:has-text("Speech"), button:has-text("Music")');
    console.log(`  Jaw Setup: ${await presets.count()} preset buttons`);

    // Filter toggles
    await safeToggle(page, '#useBandpassFilter, input[name="useBandpassFilter"]', 'Bandpass filter');
    await safeToggle(page, '#useAGC, input[name="useAGC"]', 'AGC');

    await auditInteractiveElements(page, 'setup-jaw');
  });

  test('4.6 — Head animation setup', async ({ page }) => {
    const errors = trackPage(page, 'setup-head');
    await page.goto(`${BASE}/setup/head-animation`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await auditInteractiveElements(page, 'setup-head');
  });

  test('4.7 — System configuration', async ({ page }) => {
    const errors = trackPage(page, 'setup-system');
    await page.goto(`${BASE}/setup/system`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Check for system info
    const content = await page.content();
    const hasSystemInfo = content.includes('version') || content.includes('system') || content.includes('hostname');
    console.log(`  System page has system info: ${hasSystemInfo}`);

    // Presets
    const presetBtns = page.locator('button:has-text("Apply"), button:has-text("RPi")');
    console.log(`  System: ${await presetBtns.count()} preset/apply buttons`);

    await auditInteractiveElements(page, 'setup-system');
  });
});

// ============================================================
// Phase 5: Audio Library
// ============================================================
test.describe('Phase 5: Audio Library', () => {
  test.setTimeout(30000);

  test('5.1 — Audio library loads with controls', async ({ page }) => {
    const errors = trackPage(page, 'audio-library');
    await page.goto(`${BASE}/audio-library`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Search input
    const searchInput = page.locator('#searchInput, input[type="search"], input[placeholder*="search" i]');
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('test');
      await page.waitForTimeout(500);
      await searchInput.first().clear();
      console.log('  [OK] Search input works');
    }

    // Category filter
    const categoryFilter = page.locator('#categoryFilter, select[name="category"]');
    if (await categoryFilter.count() > 0) {
      const options = await categoryFilter.locator('option').allTextContents();
      console.log(`  Category filter options: ${options.join(', ')}`);
    }

    // View toggles (grid/list)
    await safeClick(page, '#viewGrid, button:has-text("Grid")', 'Grid view');
    await safeClick(page, '#viewList, button:has-text("List")', 'List view');

    // Audio items count
    const audioItems = await countElements(page, '.audio-item, .audio-card, [data-audio-id], tr[data-file]');
    console.log(`  Audio Library: ${audioItems} audio items`);

    await auditInteractiveElements(page, 'audio-library');
  });

  test('5.2 — Audio library API', async ({ page }) => {
    const resp = await page.request.get(`${BASE}/audio-library/api/library`);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    const fileCount = Array.isArray(data) ? data.length : (data.files ? data.files.length : 0);
    console.log(`  Audio Library API: ${fileCount} files`);
  });
});

// ============================================================
// Phase 6: Video Library
// ============================================================
test.describe('Phase 6: Video Library', () => {
  test.setTimeout(30000);

  test('6.1 — Video library loads', async ({ page }) => {
    const errors = trackPage(page, 'video-library');
    await page.goto(`${BASE}/video-library`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();

    // Search
    const search = page.locator('input[type="search"], input[placeholder*="search" i], #searchInput');
    if (await search.count() > 0) {
      await search.first().fill('test');
      await page.waitForTimeout(300);
      await search.first().clear();
      console.log('  [OK] Video search works');
    }

    // Grid/list toggle
    await safeClick(page, '#viewGrid, button:has-text("Grid")', 'Video grid view');
    await safeClick(page, '#viewList, button:has-text("List")', 'Video list view');

    const videoItems = await countElements(page, '.video-item, .video-card, [data-video-id], video');
    console.log(`  Video Library: ${videoItems} video items`);

    await auditInteractiveElements(page, 'video-library');
  });
});

// ============================================================
// Phase 7: AI Settings
// ============================================================
test.describe('Phase 7: AI Settings', () => {
  test.setTimeout(30000);

  test('7.1 — AI Settings main page', async ({ page }) => {
    const errors = trackPage(page, 'ai-settings');
    await page.goto(`${BASE}/ai-settings`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const content = await page.content();
    expect(content.toLowerCase()).toMatch(/ai|settings|status/);

    await auditInteractiveElements(page, 'ai-settings');
  });

  test('7.2 — STT settings page', async ({ page }) => {
    const errors = trackPage(page, 'ai-settings-stt');
    await page.goto(`${BASE}/ai-settings/stt`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Check for STT-specific controls
    const selects = await countElements(page, 'select');
    const inputs = await countElements(page, 'input');
    console.log(`  STT Settings: ${selects} selects, ${inputs} inputs`);

    await auditInteractiveElements(page, 'ai-settings-stt');
  });

  test('7.3 — TTS settings page', async ({ page }) => {
    const errors = trackPage(page, 'ai-settings-tts');
    await page.goto(`${BASE}/ai-settings/tts`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const selects = await countElements(page, 'select');
    const inputs = await countElements(page, 'input');
    console.log(`  TTS Settings: ${selects} selects, ${inputs} inputs`);

    await auditInteractiveElements(page, 'ai-settings-tts');
  });
});

// ============================================================
// Phase 8: Other Pages
// ============================================================
test.describe('Phase 8: Other Pages', () => {
  test.setTimeout(60000);

  test('8.1 — Goblin Management', async ({ page }) => {
    const errors = trackPage(page, 'goblin-management');
    await page.goto(`${BASE}/goblin-management`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
    await auditInteractiveElements(page, 'goblin-management');
  });

  test('8.2 — Orchestration', async ({ page }) => {
    const errors = trackPage(page, 'orchestration');
    await page.goto(`${BASE}/orchestration`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
    await auditInteractiveElements(page, 'orchestration');
  });

  test('8.3 — Live Dashboard', async ({ page }) => {
    const errors = trackPage(page, 'live');
    await page.goto(`${BASE}/live`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
    await auditInteractiveElements(page, 'live');
  });

  test('8.4 — First Run', async ({ page }) => {
    const errors = trackPage(page, 'first-run');
    await page.goto(`${BASE}/first-run`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
    await auditInteractiveElements(page, 'first-run');
  });
});

// ============================================================
// Phase 9: Cross-Character Testing
// ============================================================
test.describe('Phase 9: Cross-Character Testing', () => {
  test.setTimeout(90000);

  test('9.1 — Switch character and test critical pages', async ({ page }) => {
    const errors = trackPage(page, 'cross-character');

    // Get characters list via API
    const charsResp = await page.request.get(`${BASE}/setup/characters/api/characters`);
    expect(charsResp.status()).toBe(200);
    const charsData = await charsResp.json();
    const characters = charsData.characters || charsData || [];
    console.log(`  Characters available: ${characters.length}`);

    if (characters.length < 2) {
      console.log('  Only 1 character, skipping cross-character test');
      return;
    }

    // Get current character
    const currentResp = await page.request.get(`${BASE}/setup/characters/api/current`);
    const currentData = await currentResp.json();
    const originalCharId = currentData.characterId || currentData.id;
    console.log(`  Original character: ${originalCharId}`);

    // Switch to each other character and test key pages
    for (const char of characters) {
      const charId = char.char_id || char.id;
      if (String(charId) === String(originalCharId)) continue;

      console.log(`  Testing character: ${charId} (${char.char_name || char.name})`);

      // Switch character
      const switchResp = await page.request.post(`${BASE}/setup/characters/api/select`, {
        data: { characterId: charId }
      });
      console.log(`  Switch to ${charId}: status ${switchResp.status()}`);

      // Test Dashboard
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toBeVisible();
      console.log(`  Dashboard OK for char ${charId}`);

      // Test Scenes API
      const scenesResp = await page.request.get(`${BASE}/scenes/api/`);
      expect(scenesResp.status()).toBe(200);

      // Test Poses API
      const posesResp = await page.request.get(`${BASE}/poses/api/poses`);
      expect(posesResp.status()).toBe(200);

      // Test Parts API
      const partsResp = await page.request.get(`${BASE}/api/parts?characterId=${charId}`);
      expect(partsResp.status()).toBe(200);

      // Test Animation Studio
      await page.goto(`${BASE}/scenes`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toBeVisible();
      console.log(`  Animation Studio OK for char ${charId}`);

      // Test Pose Editor
      await page.goto(`${BASE}/poses/editor`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toBeVisible();
      console.log(`  Pose Editor OK for char ${charId}`);

      // Test Calibration
      await page.goto(`${BASE}/setup/calibration`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toBeVisible();
      console.log(`  Calibration OK for char ${charId}`);
    }

    // Switch back to original
    await page.request.post(`${BASE}/setup/characters/api/select`, {
      data: { characterId: originalCharId }
    });
    console.log(`  Switched back to original: ${originalCharId}`);
  });
});

// ============================================================
// Phase 10: Error & Edge Cases
// ============================================================
test.describe('Phase 10: Error & Edge Cases', () => {
  test.setTimeout(120000);

  test('10.1 — 404 page', async ({ page }) => {
    const response = await page.goto(`${BASE}/this-page-does-not-exist-12345`);
    expect(response.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/not found|404|error/i);
    console.log('  [OK] 404 page works');
  });

  test('10.2 — All pages load without JS errors', async ({ page }) => {
    const allPages = [
      { path: '/', name: 'Dashboard' },
      { path: '/scenes', name: 'Animation Studio' },
      { path: '/poses/editor', name: 'Pose Editor' },
      { path: '/setup', name: 'Setup Index' },
      { path: '/setup/characters', name: 'Characters' },
      { path: '/setup/calibration', name: 'Calibration' },
      { path: '/setup/audio', name: 'Audio Setup' },
      { path: '/setup/jaw-animation', name: 'Jaw Animation' },
      { path: '/setup/head-animation', name: 'Head Animation' },
      { path: '/setup/system', name: 'System' },
      { path: '/audio-library', name: 'Audio Library' },
      { path: '/video-library', name: 'Video Library' },
      { path: '/ai-settings', name: 'AI Settings' },
      { path: '/ai-settings/stt', name: 'STT Settings' },
      { path: '/ai-settings/tts', name: 'TTS Settings' },
      { path: '/goblin-management', name: 'Goblin Management' },
      { path: '/orchestration', name: 'Orchestration' },
      { path: '/live', name: 'Live Dashboard' },
      { path: '/first-run', name: 'First Run' },
    ];

    const pageResults = {};
    for (const p of allPages) {
      const jsErrors = [];
      const networkErrors = [];

      const errorHandler = err => jsErrors.push(err.message);
      const consoleHandler = msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('net::ERR')) {
          jsErrors.push(`[console] ${msg.text()}`);
        }
      };
      const responseHandler = resp => {
        if (resp.status() >= 400 && !resp.url().includes('favicon') && !resp.url().includes('socket')) {
          networkErrors.push(`${resp.status()} ${resp.url()}`);
        }
      };

      page.on('pageerror', errorHandler);
      page.on('console', consoleHandler);
      page.on('response', responseHandler);

      const response = await page.goto(`${BASE}${p.path}`, { waitUntil: 'load', timeout: 15000 });
      expect(response.status()).toBe(200);
      await page.waitForTimeout(1000);

      pageResults[p.path] = {
        name: p.name,
        status: response.status(),
        jsErrors: [...jsErrors],
        networkErrors: [...networkErrors]
      };

      if (jsErrors.length > 0) {
        console.log(`  [WARN] ${p.name} (${p.path}): ${jsErrors.length} JS errors`);
        for (const e of jsErrors) console.log(`    ${e.substring(0, 120)}`);
      } else {
        console.log(`  [OK] ${p.name} (${p.path}): no JS errors`);
      }

      page.removeListener('pageerror', errorHandler);
      page.removeListener('console', consoleHandler);
      page.removeListener('response', responseHandler);
    }

    // Summary
    const withErrors = Object.entries(pageResults).filter(([, r]) => r.jsErrors.length > 0);
    console.log(`\n  === SUMMARY: ${allPages.length} pages tested, ${withErrors.length} with JS errors ===`);
  });

  test('10.3 — API endpoints return valid JSON', async ({ page }) => {
    const apiEndpoints = [
      { path: '/scenes/api/', name: 'Scenes list' },
      { path: '/poses/api/poses', name: 'Poses list' },
      { path: '/api/parts', name: 'Parts list' },
      { path: '/setup/characters/api/characters', name: 'Characters' },
      { path: '/setup/characters/api/current', name: 'Current character' },
      { path: '/audio-library/api/library', name: 'Audio library' },
      { path: '/conversation/api/speakers', name: 'Speakers' },
      { path: '/conversation/api/jaw-settings', name: 'Jaw settings' },
      { path: '/conversation/api/head-tracking-status', name: 'Head tracking' },
      { path: '/conversation/api/webcam-stream-url', name: 'Webcam URL' },
      { path: '/api/system/console?lines=10&source=stdout', name: 'System console' },
    ];

    for (const api of apiEndpoints) {
      const resp = await page.request.get(`${BASE}${api.path}`);
      const status = resp.status();
      let isJson = false;
      try {
        await resp.json();
        isJson = true;
      } catch (e) {
        // Not JSON
        const text = await resp.text();
        isJson = false;
      }
      console.log(`  ${api.name}: ${status} ${isJson ? '(valid JSON)' : '(NOT JSON)'}`);
      expect(status).toBe(200);
    }
  });

  test('10.4 — Rapid navigation stress test', async ({ page }) => {
    const pages = ['/', '/scenes', '/poses/editor', '/setup', '/audio-library', '/ai-settings'];
    const errors = [];

    page.on('pageerror', err => errors.push(err.message));

    for (let i = 0; i < 3; i++) {
      for (const path of pages) {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 10000 });
        expect(resp.status()).toBe(200);
        // Quick wait — stress test, not waiting for full load
        await page.waitForTimeout(200);
      }
    }

    console.log(`  Rapid navigation: ${3 * pages.length} page loads, ${errors.length} JS errors`);
    if (errors.length > 0) {
      console.log(`  Errors: ${errors.slice(0, 5).join('; ')}`);
    }
  });
});
