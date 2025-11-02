/**
 * Comprehensive tests for refactored Conversation Control page
 * Tests all grid panels and features inline (no modals)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 60000;

test.describe('Conversation Control - Grid Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should render page with grid layout', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Conversation Control');
    
    // Verify grid structure exists (Bootstrap col-lg-4 columns)
    const columns = page.locator('.col-lg-4');
    await expect(columns).toHaveCount(3);
  });

  test('should have Character Selection panel', async ({ page }) => {
    const card = page.locator('#character-selection-card');
    await expect(card).toBeVisible();
    
    // Check for character dropdown
    const select = page.locator('#character-select');
    await expect(select).toBeVisible();
    await expect(select).toBeEnabled({ timeout: 5000 });
    
    // Should have at least one option after loading
    const options = select.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have Live Audio (STT) panel', async ({ page }) => {
    const card = page.locator('text=Live Audio (STT)').locator('..');
    await expect(card).toBeVisible();
    
    // Check for mic controls
    await expect(page.locator('#micStart')).toBeVisible();
    await expect(page.locator('#micStop')).toBeVisible();
    await expect(page.locator('#listenInBtn')).toBeVisible();
    
    // Check for transcript area
    await expect(page.locator('#transcript')).toBeVisible();
    
    // Check for audio level progress bar
    await expect(page.locator('#audioLevel')).toBeVisible();
  });

  test('should have Make Character Say panel', async ({ page }) => {
    const card = page.locator('text=Make').locator('..');
    await expect(card).toBeVisible();
    
    // Check for speaker select
    await expect(page.locator('#convSpeakerSelect')).toBeVisible();
    
    // Check for input and button
    await expect(page.locator('#sayInput')).toBeVisible();
    await expect(page.locator('#sayBtn')).toBeVisible();
  });

  test('should have Ask AI panel (inline, no modal)', async ({ page }) => {
    const card = page.locator('text=Ask AI').locator('..');
    await expect(card).toBeVisible();
    
    // Verify it's inline, not a modal trigger
    const askBtn = page.locator('#askBtn');
    await expect(askBtn).toBeVisible();
    
    // Should NOT have modal data attributes
    const dataTarget = await askBtn.getAttribute('data-bs-target');
    expect(dataTarget).toBeNull();
    
    const dataToggle = await askBtn.getAttribute('data-bs-toggle');
    expect(dataToggle).toBeNull();
    
    // Check for input field
    await expect(page.locator('#askInput')).toBeVisible();
  });

  test('should have Audio Files panel with loop toggle', async ({ page }) => {
    const card = page.locator('text=Audio Files').locator('..');
    await expect(card).toBeVisible();
    
    // Check for audio file dropdown
    await expect(page.locator('#audioFileSelect')).toBeVisible();
    
    // Check for playback controls
    await expect(page.locator('#audioPlayBtn')).toBeVisible();
    await expect(page.locator('#audioStopBtn')).toBeVisible();
    
    // Check for loop toggle checkbox
    const loopToggle = page.locator('#audioLoopToggle');
    await expect(loopToggle).toBeVisible();
    await expect(loopToggle).toHaveAttribute('type', 'checkbox');
  });

  test('should have AI On autonomous panel (inline, no modal)', async ({ page }) => {
    const card = page.locator('text=AI On (Autonomous)').locator('..');
    await expect(card).toBeVisible();
    
    // Check for AI On toggle
    const aiToggle = page.locator('#aiOnToggle');
    await expect(aiToggle).toBeVisible();
    await expect(aiToggle).toHaveAttribute('type', 'checkbox');
    
    // Check for microphone toggle
    const micToggle = page.locator('#aiMicToggle');
    await expect(micToggle).toBeVisible();
    await expect(micToggle).toHaveAttribute('type', 'checkbox');
    
    // Check for chat log area (should be inline, not modal)
    const chatLog = page.locator('#aiChatLog');
    await expect(chatLog).toBeVisible();
    
    // Verify NO modal container
    const modal = page.locator('.modal');
    await expect(modal).toHaveCount(0);
  });

  test('should have Hardware Control panel for all part types', async ({ page }) => {
    const card = page.locator('text=Hardware Control').locator('..');
    await expect(card).toBeVisible();
    
    // Check for hardware list container
    const list = page.locator('#hardwareList');
    await expect(list).toBeVisible();
    
    // Check for parts count badge
    await expect(page.locator('#hardwareCount')).toBeVisible();
  });

  test('should have Monster Features panel', async ({ page }) => {
    const card = page.locator('text=Monster Features').locator('..');
    await expect(card).toBeVisible();
    
    // Check for Jaw Animation toggle
    const jawToggle = page.locator('#jawToggle');
    await expect(jawToggle).toBeVisible();
    await expect(jawToggle).toHaveAttribute('type', 'checkbox');
    
    // Check for Parrot Mode toggle
    const parrotToggle = page.locator('#parrotToggle');
    await expect(parrotToggle).toBeVisible();
    await expect(parrotToggle).toHaveAttribute('type', 'checkbox');
    
    // Check for Head Tracking toggle
    const headTrackToggle = page.locator('#headTrackToggle');
    await expect(headTrackToggle).toBeVisible();
    await expect(headTrackToggle).toHaveAttribute('type', 'checkbox');
  });

  test('should have Scenes panel', async ({ page }) => {
    const card = page.locator('text=Scenes').locator('..');
    await expect(card).toBeVisible();
    
    // Check for scenes container
    await expect(page.locator('#scenesContainer')).toBeVisible();
  });

  test('should have Webcam panel', async ({ page }) => {
    const card = page.locator('text=Webcam').locator('..');
    await expect(card).toBeVisible();
    
    // Check for webcam image
    await expect(page.locator('#webcamImg')).toBeVisible();
    
    // Check for status text
    await expect(page.locator('#webcamStatus')).toBeVisible();
  });
});

test.describe('Conversation Control - Character Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should load and display characters', async ({ page }) => {
    const select = page.locator('#character-select');
    await expect(select).toBeEnabled({ timeout: 5000 });
    
    const options = select.locator('option');
    const count = await options.count();
    
    // Should have at least one character
    expect(count).toBeGreaterThan(0);
    
    // First option should not be "Loading..."
    const firstText = await options.first().textContent();
    expect(firstText).not.toContain('Loading');
  });

  test('should change character and update page', async ({ page }) => {
    const select = page.locator('#character-select');
    await expect(select).toBeEnabled({ timeout: 5000 });
    
    const options = select.locator('option');
    const count = await options.count();
    
    if (count > 1) {
      // Get second character value
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      
      // Change to second character
      await select.selectOption(value);
      
      // Wait for status update
      await page.waitForTimeout(500);
      
      // Verify status shows something (switching or updated)
      const status = page.locator('#character-select-status');
      const statusText = await status.textContent();
      expect(statusText.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Conversation Control - Make Character Say', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should send text and get response', async ({ page }) => {
    const input = page.locator('#sayInput');
    const button = page.locator('#sayBtn');
    const status = page.locator('#sayStatus');
    
    // Type test message
    await input.fill('Test message from Playwright');
    
    // Click Say button
    await button.click();
    
    // Wait for response
    await page.waitForTimeout(2000);
    
    // Check status for success or processing
    const statusText = await status.textContent();
    expect(statusText.length).toBeGreaterThan(0);
  });

  test('should show warning for empty text', async ({ page }) => {
    const button = page.locator('#sayBtn');
    const status = page.locator('#sayStatus');
    
    // Click without entering text
    await button.click();
    
    // Should show warning
    await expect(status).toContainText('Enter text');
  });
});

test.describe('Conversation Control - Ask AI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should ask AI question inline (no modal)', async ({ page }) => {
    const input = page.locator('#askInput');
    const button = page.locator('#askBtn');
    const status = page.locator('#askStatus');
    
    // Verify no modal opens
    const modalCount = await page.locator('.modal.show').count();
    expect(modalCount).toBe(0);
    
    // Type question
    await input.fill('What is your name?');
    
    // Click Ask button
    await button.click();
    
    // Wait for response
    await page.waitForTimeout(2000);
    
    // Check status
    const statusText = await status.textContent();
    expect(statusText.length).toBeGreaterThan(0);
    
    // Still no modal
    const modalCountAfter = await page.locator('.modal.show').count();
    expect(modalCountAfter).toBe(0);
  });

  test('should show warning for empty question', async ({ page }) => {
    const button = page.locator('#askBtn');
    const status = page.locator('#askStatus');
    
    // Click without entering question
    await button.click();
    
    // Should show warning
    await expect(status).toContainText('Enter a question');
  });
});

test.describe('Conversation Control - Audio Files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should load audio files for character', async ({ page }) => {
    const select = page.locator('#audioFileSelect');
    
    // Wait for loading
    await page.waitForTimeout(1000);
    
    const options = select.locator('option');
    const count = await options.count();
    
    // Should have at least one option (either files or "No audio files")
    expect(count).toBeGreaterThan(0);
  });

  test('should toggle loop checkbox', async ({ page }) => {
    const loopToggle = page.locator('#audioLoopToggle');
    
    // Initially should be unchecked
    await expect(loopToggle).not.toBeChecked();
    
    // Check it
    await loopToggle.check();
    await expect(loopToggle).toBeChecked();
    
    // Uncheck it
    await loopToggle.uncheck();
    await expect(loopToggle).not.toBeChecked();
  });

  test('should play audio file (if available)', async ({ page }) => {
    const select = page.locator('#audioFileSelect');
    const playBtn = page.locator('#audioPlayBtn');
    const status = page.locator('#audioStatus');
    
    // Wait for loading
    await page.waitForTimeout(1000);
    
    const options = select.locator('option');
    const count = await options.count();
    
    if (count > 1) {
      // Select second option (first is placeholder)
      await select.selectOption({ index: 1 });
      
      // Click play
      await playBtn.click();
      
      // Wait for status
      await page.waitForTimeout(1000);
      
      const statusText = await status.textContent();
      expect(statusText.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Conversation Control - Hardware Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should load hardware parts for character', async ({ page }) => {
    const list = page.locator('#hardwareList');
    const count = page.locator('#hardwareCount');
    
    // Wait for loading
    await page.waitForTimeout(1500);
    
    // Should show parts count
    await expect(count).toBeVisible();
    
    // List should have content
    const content = await list.textContent();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should render type-specific controls for parts', async ({ page }) => {
    const list = page.locator('#hardwareList');
    
    // Wait for loading
    await page.waitForTimeout(1500);
    
    const partControls = list.locator('.conv-part-control');
    const controlCount = await partControls.count();
    
    if (controlCount > 0) {
      // Check first part has type badge
      const firstPart = partControls.first();
      const badge = firstPart.locator('.badge');
      await expect(badge).toBeVisible();
      
      // Should have at least one button
      const buttons = firstPart.locator('button');
      const btnCount = await buttons.count();
      expect(btnCount).toBeGreaterThan(0);
    }
  });
});

test.describe('Conversation Control - Monster Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should toggle Jaw Animation', async ({ page }) => {
    const toggle = page.locator('#jawToggle');
    
    // Get initial state
    const initialChecked = await toggle.isChecked();
    
    // Toggle it
    await toggle.click();
    
    // Wait for save
    await page.waitForTimeout(500);
    
    // Should be opposite of initial
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);
  });

  test('should toggle Parrot Mode', async ({ page }) => {
    const toggle = page.locator('#parrotToggle');
    
    // Get initial state
    const initialChecked = await toggle.isChecked();
    
    // Toggle it
    await toggle.click();
    
    // Should be opposite of initial
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);
  });

  test('should toggle Head Tracking', async ({ page }) => {
    const toggle = page.locator('#headTrackToggle');
    
    // Get initial state
    const initialChecked = await toggle.isChecked();
    
    // Toggle it
    await toggle.click();
    
    // Wait for save
    await page.waitForTimeout(500);
    
    // Should be opposite of initial
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);
  });
});

test.describe('Conversation Control - AI On Autonomous', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should have AI On inline panel (no modal)', async ({ page }) => {
    const chatLog = page.locator('#aiChatLog');
    
    // Chat log should be visible inline
    await expect(chatLog).toBeVisible();
    
    // Should NOT be in a modal
    const parent = page.locator('.modal');
    await expect(parent).toHaveCount(0);
  });

  test('should toggle AI On', async ({ page }) => {
    const toggle = page.locator('#aiOnToggle');
    const status = page.locator('#aiOnStatus');
    
    // Initially off
    await expect(toggle).not.toBeChecked();
    
    // Turn on
    await toggle.check();
    
    // Wait for status update
    await page.waitForTimeout(500);
    
    // Should show status
    const statusText = await status.textContent();
    expect(statusText.length).toBeGreaterThan(0);
    
    // Turn off
    await toggle.uncheck();
  });

  test('should toggle microphone mode', async ({ page }) => {
    const micToggle = page.locator('#aiMicToggle');
    
    // Initially checked (use mic)
    await expect(micToggle).toBeChecked();
    
    // Uncheck for auto-generation mode
    await micToggle.uncheck();
    await expect(micToggle).not.toBeChecked();
    
    // Check again
    await micToggle.check();
    await expect(micToggle).toBeChecked();
  });
});

test.describe('Conversation Control - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should adapt to mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // All panels should still be visible
    await expect(page.locator('#character-selection-card')).toBeVisible();
    await expect(page.locator('text=Live Audio (STT)')).toBeVisible();
    await expect(page.locator('text=Hardware Control')).toBeVisible();
    await expect(page.locator('text=Scenes')).toBeVisible();
    
    // Grid columns should stack on mobile
    const columns = page.locator('.col-lg-4');
    
    // All columns should be visible (stacked vertically)
    for (let i = 0; i < 3; i++) {
      await expect(columns.nth(i)).toBeVisible();
    }
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // All panels should still be visible
    await expect(page.locator('#character-selection-card')).toBeVisible();
    await expect(page.locator('text=AI On (Autonomous)')).toBeVisible();
    await expect(page.locator('text=Webcam')).toBeVisible();
  });
});

test.describe('Conversation Control - No Errors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should not have console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Wait for page to fully load
    await page.waitForTimeout(2000);
    
    // Should have no console errors
    expect(errors.length).toBe(0);
  });
});
