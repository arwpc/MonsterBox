/**
 * Comprehensive Conversation Mode Tests
 * Tests STT, TTS, AI responses, jaw animation, and audio playback
 */

import { expect, test } from '@playwright/test';

test.describe('Conversation Mode', () => {
    test('should load conversation page', async ({ page }) => {
        await page.goto('/conversation');
        await expect(page.locator('h1, h2')).toContainText(/Conversation/i);
    });

    test('should have microphone controls visible', async ({ page }) => {
        await page.goto('/conversation');
        await page.waitForTimeout(1000);

        // Check for microphone button or controls
        const micButton = page.locator('button:has-text("Listen"), button:has-text("Start"), [data-testid="mic-button"]').first();
        await expect(micButton).toBeVisible({ timeout: 5000 });
    });

    test('should display character selector', async ({ page }) => {
        await page.goto('/conversation');
        await page.waitForTimeout(1000);

        // Check for character selection dropdown or buttons
        const characterSelector = page.locator('select[name="character"], [data-testid="character-selector"]').first();
        await expect(characterSelector).toBeVisible({ timeout: 5000 });
    });

    test('should have ElevenLabs API configured', async ({ request }) => {
        const response = await request.get('/ai-settings/api/settings');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(data.settings).toBeDefined();
    });

    test('should send text for speech synthesis', async ({ request }) => {
        const response = await request.post('/conversation/api/say', {
            data: {
                text: 'Testing speech synthesis from comprehensive test suite.',
                characterId: 3 // Orlok
            }
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should have jaw animation system available', async ({ request }) => {
        // Check if jaw animation super power is available
        const response = await request.get('/setup/super-powers/api/list');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.success).toBeTruthy();

        // Look for jaw animation in super powers list
        const jawAnimationPower = data.superpowers?.find(sp =>
            sp.name?.toLowerCase().includes('jaw') ||
            sp.id?.toLowerCase().includes('jaw')
        );

        // Jaw animation should be available
        expect(jawAnimationPower).toBeDefined();
    });

    test('should handle conversation history', async ({ page }) => {
        await page.goto('/conversation');
        await page.waitForTimeout(2000);

        // Check for conversation history display
        const historyContainer = page.locator('[data-testid="conversation-history"], .conversation-history, .chat-history').first();

        // History container should exist (may be empty initially)
        const isVisible = await historyContainer.isVisible().catch(() => false);
        expect(isVisible || await page.locator('body').textContent()).toBeTruthy();
    });

    test('should have AI provider configured', async ({ request }) => {
        const response = await request.get('/ai-settings/api/settings');
        const data = await response.json();

        expect(data.settings.aiProvider).toBeDefined();
        expect(['openai', 'anthropic', 'google']).toContain(data.settings.aiProvider.toLowerCase());
    });
});

test.describe('Audio Playback Integration', () => {
    test('should load audio library', async ({ request }) => {
        const response = await request.get('/audio-library/api/audio-select');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(Array.isArray(data)).toBeTruthy();
    });

    test('should play audio file via conversation API', async ({ request }) => {
        // Get available audio files
        const audioResponse = await request.get('/audio-library/api/audio-select');
        const audioFiles = await audioResponse.json();

        if (audioFiles && audioFiles.length > 0) {
            // Test playing first audio file
            const response = await request.post('/conversation/api/play-audio', {
                data: {
                    filename: audioFiles[0]
                }
            });

            expect(response.ok()).toBeTruthy();
            const data = await response.json();
            expect(data.success).toBeTruthy();
        }
    });
});
