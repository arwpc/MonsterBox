import { expect, test } from '@playwright/test';
import { exec } from 'child_process';

// Use Playwright baseURL

function playFrontCenterWav() {
    return new Promise((resolve) => {
        const cmd = 'paplay /usr/share/sounds/alsa/Front_Center.wav || aplay -D pulse /usr/share/sounds/alsa/Front_Center.wav || aplay /usr/share/sounds/alsa/Front_Center.wav || true';
        const child = exec(cmd, { env: process.env });
        child.on('exit', () => resolve());
        child.on('error', () => resolve());
    });
}

test.describe('Conversation Parrot Mode (WAV feed)', () => {
    test('Detects speech from WAV and triggers /conversation/api/say', async ({ page }) => {
        await page.goto('/conversation');
        await page.waitForFunction(() => !!window.__conv, null, { timeout: 20000 });

        const toggle = page.locator('#parrotToggle');
        await expect(toggle).toBeVisible();
        if (!(await toggle.isChecked())) await toggle.check();
        await page.evaluate(() => {
            const t = document.getElementById('parrotToggle');
            if (t && !t.checked) t.checked = true;
            if (t) t.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Play twice with a short gap to give STT multiple chances
        setTimeout(() => { playFrontCenterWav(); }, 500);
        setTimeout(() => { playFrontCenterWav(); }, 2500);

        const resp = await page.waitForResponse(
            (res) => res.url().endsWith('/conversation/api/say') && res.request().method() === 'POST',
            { timeout: 45000 }
        );
        expect(resp.ok()).toBeTruthy();

        await expect(page.locator('#sayStatus')).toContainText(/Parrot (spoke|failed|error)/i, { timeout: 15000 });
    });
});
