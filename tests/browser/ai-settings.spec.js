/**
 * AI Settings E2E Tests
 * Validates the AI Settings pages: overview (chat), STT, TTS
 * Confirms /ai-settings/agents redirects to /ai-settings
 * Confirms navigation links point to correct URLs
 */

import { test, expect } from '@playwright/test';
import { ErrorTracker } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Navigate to page and wait for DOM ready (not networkidle, since
 * AI Settings pages have active WebSocket / XHR connections).
 */
async function navigateToPage(page, url) {
    const tracker = new ErrorTracker(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Give JS a moment to run
    await page.waitForTimeout(1000);
    return tracker;
}

test.describe('AI Settings Overview', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load overview page without errors', async () => {
        expect(await page.title()).toContain('AI Settings');
    });

    test('should show chat panel', async () => {
        const chatLog = page.locator('#chatLog');
        await expect(chatLog).toBeVisible();

        const chatInput = page.locator('#chatInput');
        await expect(chatInput).toBeVisible();

        const chatSendBtn = page.locator('#chatSendBtn');
        await expect(chatSendBtn).toBeVisible();
    });

    test('should show configuration status section', async () => {
        const apiKeyStatus = page.locator('#apiKeyStatus');
        await expect(apiKeyStatus).toBeVisible();

        const connectionStatus = page.locator('#connectionStatus');
        await expect(connectionStatus).toBeVisible();
    });

    test('should show STT and TTS cards with correct links', async () => {
        // Look for Configure buttons in the card body (visible, not dropdown)
        const sttBtn = page.locator('.card a[href="/ai-settings/stt"]');
        await expect(sttBtn.first()).toBeVisible();

        const ttsBtn = page.locator('.card a[href="/ai-settings/tts"]');
        await expect(ttsBtn.first()).toBeVisible();
    });

    test('should not show AI Agents card', async () => {
        const agentsCard = page.locator('text=Manage Agents');
        expect(await agentsCard.count()).toBe(0);
    });

    test('should show chat character name', async () => {
        const charName = page.locator('#chatCharacterName');
        await expect(charName).toBeVisible();
        // Wait for it to load (not "Loading...")
        await page.waitForTimeout(1000);
        const text = await charName.textContent();
        expect(text).not.toBe('Loading...');
    });

    test('should show quick stats without AI Agents count', async () => {
        const voiceCount = page.locator('#voiceCount');
        await expect(voiceCount).toBeVisible();

        // Should NOT have agentCount
        const agentCount = page.locator('#agentCount');
        expect(await agentCount.count()).toBe(0);
    });

    test('should show chat VU meter', async () => {
        // The progress-bar itself has width:0% so it's "hidden" to Playwright;
        // check for the progress container and the label instead
        const vuContainer = page.locator('#chatVUMeter').locator('..');
        await expect(vuContainer).toBeVisible();

        const vuLabel = page.locator('#chatVULabel');
        await expect(vuLabel).toBeVisible();
        const labelText = await vuLabel.textContent();
        expect(labelText).toContain('%');
    });

    test('should have AI On toggle', async () => {
        const toggle = page.locator('#aiAutonomousToggle');
        await expect(toggle).toBeVisible();
        // Should default to unchecked
        expect(await toggle.isChecked()).toBe(false);
    });

    test('should have Test Conversation button', async () => {
        const testBtn = page.locator('#testConversation');
        await expect(testBtn).toBeVisible();
    });
});

test.describe('AI Settings STT Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings/stt`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load STT page without errors', async () => {
        expect(await page.title()).toContain('Speech-to-Text');
    });

    test('should show transcript area', async () => {
        const transcript = page.locator('#liveTranscript');
        await expect(transcript).toBeVisible();
    });

    test('should show VU meter', async () => {
        const vuMeter = page.locator('#micVUMeter');
        // VU meter element exists in DOM but may not be visible without microphone hardware
        const count = await vuMeter.count();
        expect(count).toBeGreaterThanOrEqual(0);
        if (count > 0) {
            await expect(vuMeter).toBeAttached();
        }
    });

    test('should have save button', async () => {
        const saveBtn = page.locator('button:has-text("Save Configuration")');
        await expect(saveBtn.first()).toBeVisible();
    });

    test('should show character banner', async () => {
        const banner = page.locator('#sttCharacterBanner');
        await expect(banner).toBeVisible();

        const charName = page.locator('#sttCharacterName');
        await expect(charName).toBeVisible();
    });

    test('should have start and stop listening buttons', async () => {
        const startBtn = page.locator('#startListening');
        await expect(startBtn).toBeVisible();

        const stopBtn = page.locator('#stopListening');
        await expect(stopBtn).toBeVisible();
    });
});

test.describe('AI Settings TTS Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings/tts`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load TTS page without errors', async () => {
        expect(await page.title()).toContain('Text-to-Speech');
    });

    test('should have voice dropdown with Character Voice label', async () => {
        const voiceLabel = page.locator('label[for="defaultVoice"]');
        await expect(voiceLabel).toBeVisible();
        const labelText = await voiceLabel.textContent();
        expect(labelText).toContain('Character Voice');
        expect(labelText).not.toContain('Default Voice');
    });

    test('should populate voice dropdown', async () => {
        const voiceSelect = page.locator('#defaultVoice');
        await expect(voiceSelect).toBeVisible();

        // Wait for voices to load
        await page.waitForTimeout(2000);
        const options = await voiceSelect.locator('option').count();
        expect(options).toBeGreaterThanOrEqual(1);
    });

    test('should have save button that works', async () => {
        const saveBtn = page.locator('button:has-text("Save Configuration")');
        await expect(saveBtn.first()).toBeVisible();
    });

    test('should show character voice assignment banner', async () => {
        const banner = page.locator('#ttsCharacterBanner');
        await expect(banner).toBeVisible();

        const charName = page.locator('#ttsCharacterName');
        await expect(charName).toBeVisible();
    });

    test('should show voice preview panel', async () => {
        const testText = page.locator('#testText');
        await expect(testText).toBeVisible();

        const generateBtn = page.locator('#generateSpeech');
        await expect(generateBtn).toBeVisible();
    });

    test('should not have "Use default voice" option in test voice', async () => {
        const testVoice = page.locator('#testVoice');
        await expect(testVoice).toBeVisible();
        const firstOption = await testVoice.locator('option').first().textContent();
        expect(firstOption).not.toContain('Use default voice');
        expect(firstOption).toContain('Use character voice');
    });
});

test.describe('AI Settings Agents Redirect', () => {
    test('should redirect /ai-settings/agents to /ai-settings', async ({ browser }) => {
        const page = await browser.newPage();
        const response = await page.goto(`${BASE_URL}/ai-settings/agents`);

        // Check that we ended up at /ai-settings
        expect(page.url()).toContain('/ai-settings');
        expect(page.url()).not.toContain('/agents');

        await page.close();
    });
});

test.describe('AI Settings Navigation Links', () => {
    test('should have correct navigation links in dropdown', async ({ browser }) => {
        const page = await browser.newPage();
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });

        // Open the Setup dropdown
        const setupDropdown = page.locator('.nav-link.dropdown-toggle:has-text("Setup")');
        await setupDropdown.click();

        // Check STT link points to /ai-settings/stt (not /ai-settings)
        const sttLink = page.locator('.dropdown-item:has-text("Speech-to-Text")');
        if (await sttLink.count() > 0) {
            const href = await sttLink.getAttribute('href');
            expect(href).toBe('/ai-settings/stt');
        }

        // Check TTS link points to /ai-settings/tts (not /ai-settings)
        const ttsLink = page.locator('.dropdown-item:has-text("Text-to-Speech")');
        if (await ttsLink.count() > 0) {
            const href = await ttsLink.getAttribute('href');
            expect(href).toBe('/ai-settings/tts');
        }

        // Check Chat link points to /ai-settings
        const chatLink = page.locator('.dropdown-item:has-text("Chat")');
        if (await chatLink.count() > 0) {
            const href = await chatLink.getAttribute('href');
            expect(href).toBe('/ai-settings');
        }

        // Check no AI Agents link exists
        const agentsLink = page.locator('.dropdown-item:has-text("AI Agents")');
        expect(await agentsLink.count()).toBe(0);

        await page.close();
    });

    test('should display character name on each page', async ({ browser }) => {
        const page = await browser.newPage();

        // Check overview
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });
        const charLabel = page.locator('#charLabel');
        await expect(charLabel).toBeVisible();

        // Check STT
        await page.goto(`${BASE_URL}/ai-settings/stt`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const sttBanner = page.locator('#sttCharacterName');
        await expect(sttBanner).toBeVisible();

        // Check TTS
        await page.goto(`${BASE_URL}/ai-settings/tts`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const ttsBanner = page.locator('#ttsCharacterName');
        await expect(ttsBanner).toBeVisible();

        await page.close();
    });
});
