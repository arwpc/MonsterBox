import { expect, test } from '@playwright/test';

const ORCHESTRATION_URL = '/orchestration';

test.describe('LIVE Orchestration AI Audio Check', () => {
    test('Ask AI on Orlok triggers AI audio telemetry', async ({ page }) => {
        test.setTimeout(150000);
        await page.goto(ORCHESTRATION_URL);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('h1:has-text("Orchestration Control Center")')).toBeVisible();

        // Find Orlok card
        const card = page.locator('.card.animatronic-card:has-text("Orlok")').first();
        await expect(card).toBeVisible();

        const input = card.locator('input[type="text"]').first();
        const askBtn = card.locator('button:has-text("Ask AI")').first();

        const question = 'Test immediate AI audio from Orlok at ' + Date.now();
        await input.fill(question);

        // Click Ask AI and then poll telemetry endpoint for AI last-play
        await askBtn.click();

        // Record start time to validate fresh events
        const t0 = Date.now();
        // Poll /__audio/last-ai, fallback to /__audio/last-play if needed, for up to 60s
        const deadline = Date.now() + 60000;
        let seen = null;
        while (Date.now() < deadline) {
            // Primary: last-ai
            const aiResp = await page.request.get('/__audio/last-ai');
            if (aiResp.ok()) {
                const body = await aiResp.json();
                if (body && body.lastAI) {
                    const ai = body.lastAI;
                    const fresh = ai.ts && (Date.now() - ai.ts < 60000);
                    if (fresh && ((ai.kind || '').toLowerCase() === 'ai')) {
                        seen = ai;
                        break;
                    }
                }
            }
            // Fallback: last-play with kind ai
            const lpResp = await page.request.get('/__audio/last-play');
            if (lpResp.ok()) {
                const lb = await lpResp.json();
                if (lb && lb.lastPlay) {
                    const lp = lb.lastPlay;
                    const fresh = lp.ts && (Date.now() - lp.ts < 60000);
                    if (fresh && ((lp.kind || '').toLowerCase() === 'ai')) {
                        seen = lp;
                        break;
                    }
                    // Final fallback for older servers: accept any fresh last-play newer than click time
                    if (fresh && lp.ts > t0) {
                        seen = Object.assign({ kind: 'ai-compat' }, lp);
                        break;
                    }
                }
            }
            await page.waitForTimeout(1000);
        }

        expect(seen).not.toBeNull();
        console.log('AI play telemetry seen:', seen);
    });
});
