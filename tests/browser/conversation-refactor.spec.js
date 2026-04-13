/**
 * Comprehensive tests for refactored Conversation Control page (now the Dashboard)
 * Tests accordion-based layout and features inline (no modals)
 * Note: /conversation redirects to / — conversation IS the dashboard
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 60000;

test.describe('Conversation Control - Accordion Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  test('should render page with accordion and panel elements', async ({ page }) => {
    // Check page title is shown in navbar (headers removed in v6.1.2)
    await expect(page.locator('#currentPageName')).toContainText('Dashboard');

    // Verify accordion container exists
    const accordion = page.locator('#dashboardAccordion');
    await expect(accordion).toBeVisible();

    // Verify accordion items exist
    const accordionItems = accordion.locator('.accordion-item[data-panel-id]');
    const accordionCount = await accordionItems.count();
    expect(accordionCount).toBeGreaterThan(0);

    // Verify top-level panel elements exist (webcam, chat, monster-features are outside accordion)
    const topPanels = page.locator('[data-panel-id]');
    const totalCount = await topPanels.count();
    expect(totalCount).toBeGreaterThanOrEqual(7);
  });

  test('should have Chat panel', async ({ page }) => {
    // Chat log area
    await expect(page.locator('#chatLog')).toBeVisible();

    // AI On toggle
    const aiToggle = page.locator('#chatAiOnToggle');
    await expect(aiToggle).toBeVisible();
    await expect(aiToggle).toHaveAttribute('type', 'checkbox');

    // Unified chat input and send button (handles both Ask AI and Say This modes)
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();

    // VU meter (label badge is always visible; bar itself starts at 0% width)
    await expect(page.locator('#chatVULabel')).toBeVisible();

    // Audio controls — mute is in superpowers strip, browser spk/mic in chat panel
    await expect(page.locator('#speakerMuteToggle')).toBeVisible();
    await expect(page.locator('#chatBrowserSpeaker')).toBeVisible();
    await expect(page.locator('#chatBrowserMic')).toBeVisible();

    // Speaker select
    await expect(page.locator('#chatSpeakerSelect')).toBeVisible();
  });

  test('should have unified input with Ask AI / Say This modes', async ({ page }) => {
    // Unified input replaces separate Chat and Say panels
    // The AI toggle switches between Ask AI (on) and Say This (off) modes
    const aiToggle = page.locator('#chatAiOnToggle');
    await expect(aiToggle).toBeVisible();

    // Chat input serves both modes
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();
  });

  test('should have Monster Features panel', async ({ page }) => {
    const monsterFeatures = page.locator('[data-panel-id="monster-features"]');
    await expect(monsterFeatures).toBeVisible();

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

  test('should have Scenes panel in accordion', async ({ page }) => {
    // Expand the Scenes accordion panel
    await page.locator('[data-bs-target="#collapseScenes"]').click();
    await page.waitForTimeout(500);

    // Check for scenes container
    await expect(page.locator('#scenesContainer')).toBeVisible();
  });

  test('should have Poses panel in accordion', async ({ page }) => {
    // Expand the Poses accordion panel
    await page.locator('[data-bs-target="#collapsePoses"]').click();
    await page.waitForTimeout(500);

    // Check for poses container
    await expect(page.locator('#posesContainer')).toBeVisible();
  });

  test('should have Webcam panel', async ({ page }) => {
    // Check for webcam image and status directly
    await expect(page.locator('#webcamImg')).toBeVisible();

    // Check for status text
    await expect(page.locator('#webcamStatus')).toBeVisible();
  });
});

test.describe('Conversation Control - Unified Input (Say This mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should send text via unified input in Say This mode', async ({ page }) => {
    // Ensure AI toggle is OFF (Say This mode)
    const aiToggle = page.locator('#chatAiOnToggle');
    if (await aiToggle.isChecked()) {
      await aiToggle.click();
      await page.waitForTimeout(300);
    }

    const input = page.locator('#chatInput');
    const button = page.locator('#chatSendBtn');

    // Type test message
    await input.fill('Test message from Playwright');

    // Click Send button
    await button.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Just verify no error was thrown
  });

  test('should handle empty text without crashing', async ({ page }) => {
    const button = page.locator('#chatSendBtn');

    // Click without entering text - just verify it doesn't crash
    await button.click();
    await page.waitForTimeout(500);
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

test.describe('Conversation Control - Chat Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should have Chat panel inline (no modal)', async ({ page }) => {
    const chatLog = page.locator('#chatLog');

    // Chat log should be visible inline
    await expect(chatLog).toBeVisible();

    // Should NOT be in a modal
    const modal = page.locator('.modal');
    await expect(modal).toHaveCount(0);
  });

  test('should toggle AI On via Chat panel', async ({ page }) => {
    const toggle = page.locator('#chatAiOnToggle');

    // Initially off
    await expect(toggle).not.toBeChecked();

    // Try to turn on — in CI without AI services the handler may prevent state change
    await toggle.click();
    await page.waitForTimeout(500);

    const isNowChecked = await toggle.isChecked();
    if (isNowChecked) {
      // Toggle succeeded — turn off
      await toggle.click();
    } else {
      // Toggle was prevented (no AI service in CI) — just verify no crash
      await expect(toggle).toBeAttached();
    }
  });

  test('should have chat input with send button', async ({ page }) => {
    const input = page.locator('#chatInput');
    const sendBtn = page.locator('#chatSendBtn');

    await expect(input).toBeVisible();
    await expect(sendBtn).toBeVisible();

    // Type a test message
    await input.fill('Hello from Playwright');
    const val = await input.inputValue();
    expect(val).toBe('Hello from Playwright');
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

    // Accordion layout is inherently responsive
    await expect(page.locator('#dashboardAccordion')).toBeVisible();

    // Core elements should still be accessible
    await expect(page.locator('#chatLog')).toBeVisible();
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Core panels should still be visible
    await expect(page.locator('#chatAiOnToggle')).toBeVisible();
    await expect(page.locator('#webcamImg')).toBeVisible();
  });
});

test.describe('Conversation Control - No Errors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test('should not have critical console errors on load', async ({ page }) => {
    const criticalErrors = [];
    const ignoredPatterns = [
      /ResizeObserver/i,
      /net::ERR_/i,
      /WebSocket/i,
      /fetch.*failed/i
    ];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!ignoredPatterns.some(p => p.test(text))) {
          criticalErrors.push(text);
        }
      }
    });

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Should have no critical console errors
    expect(criticalErrors.length).toBe(0);
  });
});
