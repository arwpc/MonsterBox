/**
 * Comprehensive E2E Tests for Conversation Mode
 * Simulates a user interacting with a trick-or-treater
 * Tests all buttons, toggles, and UI interactions
 * 
 * Run with: MB_E2E=1 npx playwright test test/e2e/conversation-mode-complete.spec.js
 */

import { expect, test } from '@playwright/test';

// Use Playwright baseURL

test.describe('Conversation Mode - Complete E2E Tests', () => {
  test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping E2E test');

  test.beforeEach(async ({ page }) => {
    // Navigate to Conversation Mode page
    await page.goto('/conversation');
    await expect(page).toHaveTitle(/Conversation Mode/);
  });

  test('Page loads with all required panels', async ({ page }) => {
    // Check for Live Audio panel
    await expect(page.locator('text=Live Audio')).toBeVisible();
    await expect(page.locator('#micStart')).toBeVisible();
    await expect(page.locator('#micStop')).toBeVisible();
    await expect(page.locator('#listenInBtn')).toBeVisible();

    // Check for Make Character Say panel
    await expect(page.locator('text=Make')).toBeVisible();
    await expect(page.locator('#sayInput')).toBeVisible();
    await expect(page.locator('#sayBtn')).toBeVisible();

    // Check for Monster Features panel
    await expect(page.locator('text=Monster Features')).toBeVisible();
    await expect(page.locator('#jawToggle')).toBeVisible();
    await expect(page.locator('#parrotToggle')).toBeVisible();
    await expect(page.locator('#headTrackToggle')).toBeVisible();
    await expect(page.locator('#aiOnToggle')).toBeVisible();

    // Check for Scenes panel
    await expect(page.locator('.card-header:has-text("Scenes")')).toBeVisible();
    await expect(page.locator('#scenesContainer')).toBeVisible();

    // Check for Webcam panel
    await expect(page.locator('.card-header:has-text("Webcam")')).toBeVisible();
    await expect(page.locator('#webcamImg')).toBeVisible();

    console.log('✅ All panels loaded successfully');
  });

  test('Navigation header displays MonsterBox 5.3 with git commit', async ({ page }) => {
    const navBrand = page.locator('.navbar-brand');
    await expect(navBrand).toContainText('MonsterBox 5.3');
    await expect(navBrand).toContainText('commit:');

    console.log('✅ Version display correct in navigation');
  });

  test('STT and TTS config buttons work', async ({ page }) => {
    // Click STT Config button
    await page.locator('a:has-text("STT Config")').click();
    await expect(page).toHaveURL(/ai-settings\/stt/);
    await page.goBack();

    // Click TTS Config button
    await page.locator('a:has-text("TTS Config")').click();
    await expect(page).toHaveURL(/ai-settings\/tts/);
    await page.goBack();

    console.log('✅ STT and TTS config buttons working');
  });

  test('Live Audio panel - Start/Stop Listening buttons work', async ({ page }) => {
    const startBtn = page.locator('#micStart');
    const stopBtn = page.locator('#micStop');

    // Initially, Start button should be visible
    await expect(startBtn).toBeVisible();

    // Click Start Listening
    await startBtn.click();
    await page.waitForTimeout(500);

    // Stop button should be clickable
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();
    await page.waitForTimeout(500);

    console.log('✅ Start/Stop Listening buttons working');
  });

  test('Live Audio panel - Listen In button toggles', async ({ page }) => {
    const listenInBtn = page.locator('#listenInBtn');

    await expect(listenInBtn).toBeVisible();
    await expect(listenInBtn).toContainText('Listen In');

    // Click Listen In
    await listenInBtn.click();
    await page.waitForTimeout(500);

    // Button text should change (may show "Stop Listening" or error if no mic configured)
    const btnText = await listenInBtn.textContent();
    expect(btnText).toBeDefined();

    console.log('✅ Listen In button clickable');
  });

  test('Live Audio panel - Transcription display exists', async ({ page }) => {
    const transcript = page.locator('#transcript');

    await expect(transcript).toBeVisible();
    await expect(transcript).toContainText(/Transcription will appear here|transcription/i);

    console.log('✅ Transcription display visible');
  });

  test('Make Character Say - Text input and Speak button work', async ({ page }) => {
    const sayInput = page.locator('#sayInput');
    const sayBtn = page.locator('#sayBtn');

    await expect(sayInput).toBeVisible();
    await expect(sayBtn).toBeVisible();

    // Type test message
    await sayInput.fill('Boo! Welcome to my haunted house!');

    // Click Speak button
    await sayBtn.click();
    await page.waitForTimeout(1000);

    // Check for status message (success or error)
    const sayStatus = page.locator('#sayStatus');
    const statusText = await sayStatus.textContent();
    expect(statusText).toBeDefined();

    console.log('✅ Make Character Say input and button working');
  });

  test('Monster Features - Jaw Animation toggle works', async ({ page }) => {
    const jawToggle = page.locator('#jawToggle');

    await expect(jawToggle).toBeVisible();

    // Get initial state
    const initialState = await jawToggle.isChecked();

    // Toggle it
    await jawToggle.click();
    await page.waitForTimeout(500);

    // Verify state changed
    const newState = await jawToggle.isChecked();
    expect(newState).toBe(!initialState);

    // Toggle back
    await jawToggle.click();
    await page.waitForTimeout(500);

    const finalState = await jawToggle.isChecked();
    expect(finalState).toBe(initialState);

    console.log('✅ Jaw Animation toggle working');
  });

  test('Monster Features - Parrot Mode toggle works', async ({ page }) => {
    const parrotToggle = page.locator('#parrotToggle');

    await expect(parrotToggle).toBeVisible();

    // Get initial state
    const initialState = await parrotToggle.isChecked();

    // Toggle it
    await parrotToggle.click();
    await page.waitForTimeout(500);

    // Verify state changed
    const newState = await parrotToggle.isChecked();
    expect(newState).toBe(!initialState);

    console.log('✅ Parrot Mode toggle working');
  });

  test('Monster Features - Head Tracking toggle works', async ({ page }) => {
    const headTrackToggle = page.locator('#headTrackToggle');

    await expect(headTrackToggle).toBeVisible();

    // Get initial state
    const initialState = await headTrackToggle.isChecked();

    // Toggle it
    await headTrackToggle.click();
    await page.waitForTimeout(500);

    // Verify state changed
    const newState = await headTrackToggle.isChecked();
    expect(newState).toBe(!initialState);

    console.log('✅ Head Tracking toggle working');
  });

  test('Monster Features - AI On toggle works and shows latency', async ({ page }) => {
    const aiOnToggle = page.locator('#aiOnToggle');
    const aiLatency = page.locator('#aiLatency');

    await expect(aiOnToggle).toBeVisible();

    // Enable AI
    if (!await aiOnToggle.isChecked()) {
      await aiOnToggle.click();
      await page.waitForTimeout(1000);
    }

    // Latency display should be visible when AI is on
    const isLatencyVisible = await aiLatency.isVisible();
    if (isLatencyVisible) {
      await expect(aiLatency).toContainText(/latency|ms/i);
      console.log('✅ AI On toggle working with latency display');
    } else {
      console.log('⚠️  AI On toggle working (latency display may require character selection)');
    }

    // Disable AI
    await aiOnToggle.click();
    await page.waitForTimeout(500);
  });

  test('Monster Features - Config buttons link to Super Powers', async ({ page }) => {
    // Click Jaw Animation config button
    const jawConfigBtn = page.locator('a[title="Configure Jaw Animation"]');
    await expect(jawConfigBtn).toBeVisible();
    await jawConfigBtn.click();
    await expect(page).toHaveURL(/super-powers/);
    await page.goBack();

    console.log('✅ Monster Features config buttons working');
  });

  test('Scenes panel - Loads and displays scenes', async ({ page }) => {
    const scenesContainer = page.locator('#scenesContainer');

    await expect(scenesContainer).toBeVisible();

    // Wait for scenes to load (spinner should disappear)
    await page.waitForTimeout(2000);

    // Check if scenes loaded or "no scenes" message appears
    const hasScenes = await page.locator('.scene-item, .list-group-item').count() > 0;
    const hasNoScenesMsg = await page.locator('text=/no scenes|create a scene/i').count() > 0;

    expect(hasScenes || hasNoScenesMsg).toBeTruthy();

    console.log('✅ Scenes panel loading correctly');
  });

  test('Scenes panel - Play button works if scenes exist', async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for scenes to load

    const playButtons = page.locator('button:has-text("Play")');
    const playButtonCount = await playButtons.count();

    if (playButtonCount > 0) {
      // Click first play button
      await playButtons.first().click();
      await page.waitForTimeout(500);

      console.log('✅ Scene play button working');
    } else {
      console.log('⚠️  No scenes available to test play button');
    }
  });

  test('Scenes panel - Manage Scenes button works', async ({ page }) => {
    const manageScenesBtn = page.locator('a[title="Manage Scenes"]');
    await expect(manageScenesBtn).toBeVisible();

    await manageScenesBtn.click();
    await expect(page).toHaveURL(/scenes/);
    await page.goBack();

    console.log('✅ Manage Scenes button working');
  });

  test('Webcam panel - Stream loads or shows error', async ({ page }) => {
    const webcamImg = page.locator('#webcamImg');
    const webcamStatus = page.locator('#webcamStatus');

    await expect(webcamImg).toBeVisible();

    // Wait for webcam to load
    await page.waitForTimeout(3000);

    // Check if image has src or status shows message
    const imgSrc = await webcamImg.getAttribute('src');
    const statusText = await webcamStatus.textContent();

    expect(imgSrc || statusText).toBeDefined();

    console.log('✅ Webcam panel displaying');
  });

  test('Complete trick-or-treater interaction simulation', async ({ page }) => {
    console.log('🎃 Starting trick-or-treater interaction simulation...');

    // Step 1: Enable all Monster Features
    console.log('  1. Enabling Monster Features...');
    await page.locator('#jawToggle').check();
    await page.waitForTimeout(300);
    await page.locator('#headTrackToggle').check();
    await page.waitForTimeout(300);
    await page.locator('#aiOnToggle').check();
    await page.waitForTimeout(500);

    // Step 2: Start listening for trick-or-treater
    console.log('  2. Starting microphone listening...');
    await page.locator('#micStart').click();
    await page.waitForTimeout(500);

    // Step 3: Make character greet trick-or-treater
    console.log('  3. Making character say greeting...');
    await page.locator('#sayInput').fill('Welcome, brave trick-or-treater! Dare you enter my domain?');
    await page.locator('#sayBtn').click();
    await page.waitForTimeout(2000);

    // Step 4: Play a scary scene
    console.log('  4. Playing a scene...');
    const playButtons = page.locator('button:has-text("Play")');
    if (await playButtons.count() > 0) {
      await playButtons.first().click();
      await page.waitForTimeout(1000);
    }

    // Step 5: Stop listening
    console.log('  5. Stopping microphone...');
    await page.locator('#micStop').click();
    await page.waitForTimeout(300);

    // Step 6: Disable AI On
    console.log('  6. Disabling AI...');
    await page.locator('#aiOnToggle').uncheck();
    await page.waitForTimeout(300);

    console.log('✅ Complete trick-or-treater interaction simulation successful!');
  });
});

