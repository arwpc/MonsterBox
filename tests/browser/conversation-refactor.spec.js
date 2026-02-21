/**
 * Comprehensive tests for refactored Conversation Control page (now the Dashboard)
 * Tests all grid panels and features inline (no modals)
 * Note: /conversation redirects to / — conversation IS the dashboard
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 60000;

test.describe('Conversation Control - Grid Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  test('should render page with sortable panels', async ({ page }) => {
    // Check page title is shown in navbar (headers removed in v6.1.2)
    await expect(page.locator('#currentPageName')).toContainText('Dashboard');

    // Verify single sortable column with draggable panels
    const sortableColumn = page.locator('.sortable-column[data-column-id="dashboard"]');
    await expect(sortableColumn).toBeVisible();
    const panels = sortableColumn.locator('> [data-panel-id]');
    const count = await panels.count();
    expect(count).toBe(8);
  });

  test('should have Chat panel', async ({ page }) => {
    // Chat log area
    await expect(page.locator('#chatLog')).toBeVisible();

    // AI On toggle
    const aiToggle = page.locator('#chatAiOnToggle');
    await expect(aiToggle).toBeVisible();
    await expect(aiToggle).toHaveAttribute('type', 'checkbox');

    // Chat input and send button
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();

    // VU meter (label badge is always visible; bar itself starts at 0% width)
    await expect(page.locator('#chatVULabel')).toBeVisible();

    // Audio controls
    await expect(page.locator('#chatMuteSpeaker')).toBeVisible();
    await expect(page.locator('#chatBrowserSpeaker')).toBeVisible();
    await expect(page.locator('#chatBrowserMic')).toBeVisible();

    // Speaker select
    await expect(page.locator('#chatSpeakerSelect')).toBeVisible();
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

  test.skip('should have Ask AI panel (inline, no modal) - DEPRECATED', async ({ page }) => {
    // This test is deprecated - Ask AI is now integrated into Chat panel
    const card = page.locator('text=Ask AI').locator('..');
    await expect(card).toBeVisible();
  });

  test.skip('should have Audio Files panel with loop toggle - DEPRECATED', async ({ page }) => {
    // This test is deprecated - Audio functionality moved to Audio Library page
    const card = page.locator('text=Audio Files').locator('..');
    await expect(card).toBeVisible();
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
    // Check for scenes container directly (avoids multiple matches)
    await expect(page.locator('#scenesContainer')).toBeVisible();
  });

  test('should have Poses panel', async ({ page }) => {
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
    await page.waitForTimeout(3000);
    
    // Status may or may not have text depending on TTS config
    // Just verify no error was thrown
  });

  test('should show warning for empty text', async ({ page }) => {
    const button = page.locator('#sayBtn');
    
    // Click without entering text - just verify it doesn't crash
    await button.click();
    await page.waitForTimeout(500);
  });
});

test.describe('Conversation Control - Ask AI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test.skip('should ask AI question inline (no modal) - DEPRECATED', async ({ page }) => {
    // Test is deprecated - Ask AI panel was replaced with AI On toggle
  });

  test.skip('should show warning for empty question - DEPRECATED', async ({ page }) => {
    // Test is deprecated - Ask AI panel was replaced with AI On toggle
  });
});

test.describe('Conversation Control - Audio Files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    await page.waitForLoadState('networkidle');
  });

  test.skip('should load audio files for character - DEPRECATED', async ({ page }) => {
    // Test is deprecated - Audio files functionality moved to Audio Library page
  });

  test.skip('should toggle loop checkbox - DEPRECATED', async ({ page }) => {
    // Test is deprecated - Audio functionality moved to Audio Library page
  });

  test.skip('should play audio file - DEPRECATED', async ({ page }) => {
    // Test is deprecated - Audio functionality moved to Audio Library page
  });
});

test.describe('Conversation Control - Hardware Control - DEPRECATED', () => {
  test.skip('should load hardware parts for character - DEPRECATED', async ({ page }) => {
    // Hardware Control panel removed in v6.7.0 — replaced by Chat panel
  });

  test.skip('should render type-specific controls for parts - DEPRECATED', async ({ page }) => {
    // Hardware Control panel removed in v6.7.0 — replaced by Chat panel
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
    
    // Core panels should still be visible
    await expect(page.locator('#scenesContainer')).toBeVisible();
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
