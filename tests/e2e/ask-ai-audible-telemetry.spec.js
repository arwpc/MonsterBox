/**
 * Ask AI audible path validation using diagnostics endpoints
 * Ensures server-side playback telemetry is recorded after Ask AI
 */

import { expect, test } from '@playwright/test';

test.describe('Ask AI audible telemetry', () => {
    test('Ask AI triggers last-play telemetry', async ({ request, page }) => {
        // Navigate to conversation page to ensure character context is loaded
        await page.goto('/conversation');
        await page.waitForLoadState('domcontentloaded');

        // 1) Active device should resolve
        const active = await request.get('/__audio/active-device');
        expect(active.ok()).toBeTruthy();
        const activeJson = await active.json();
        expect(activeJson.success).toBeTruthy();
        // Character may be null on first-run, but test server sets default in test mode
        expect(activeJson.device).toBeTruthy();

        // 2) Trigger Ask AI
        const askRes = await request.post('/conversation/api/ask-ai', {
            data: { question: 'Hello, can you hear me?' }
        });
        expect(askRes.ok()).toBeTruthy();
        const askJson = await askRes.json();
        expect(askJson.success).toBeTruthy();

        // 3) Verify last-play telemetry present and recent
        const last = await request.get('/__audio/last-play');
        expect(last.ok()).toBeTruthy();
        const lastJson = await last.json();
        expect(lastJson.success).toBeTruthy();
        expect(lastJson.lastPlay).toBeTruthy();
        const lp = lastJson.lastPlay;
        // ts should be within the last 5 seconds
        expect(Date.now() - lp.ts).toBeLessThan(5000);
        expect(lp.deviceId).toBeTruthy();
        // In test mode, we mark simulated and set player based on contentType (mpg123 for mpeg)
        expect(lp.simulated).toBeTruthy();
        expect(lp.player === 'mpg123' || lp.player === 'pw-play').toBeTruthy();
        expect(typeof lp.volume).toBe('number');
    });
});
