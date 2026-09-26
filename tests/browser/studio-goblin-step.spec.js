/**
 * Animation Studio — a goblin-video step can be authored entirely in the Studio.
 *
 * The step's video <select> used to be a static "Select goblin first" placeholder
 * that nothing filled, and collectStepData() copied that placeholder's empty
 * value over any videoId the step already carried — so a scene saved in the
 * Studio lost its video on every save. This spec drives the real page against
 * the real Goblins: choose a Goblin, the list comes from the device, pick a
 * video, save, reload, re-save — the video must survive all of it.
 *
 * Skips (does not fail) when no Goblin is online: the list is the device's.
 * Nothing is played; the scene is deleted afterwards.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Studio goblin-video step', () => {
  test('is authored from the device list and survives save → reload → save', async ({ browser, request }) => {
    const reg = await (await request.get(`${BASE_URL}/goblin-management/api/goblins`)).json();
    const online = ((reg && reg.goblins) || []).filter(g => g.status === 'online');
    test.skip(online.length === 0, 'no Goblin online to list videos from');
    const goblin = online[0];

    const name = 'ZZ Studio Goblin Step ' + Date.now();
    const errors = [];
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept(name));
    let sceneId = null;
    try {
      await page.goto(`${BASE_URL}/scenes`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.palette-action[data-step-type="goblin-video"]');
      await page.click('#btnNewScene');
      await page.waitForFunction(() => /Created:/.test(document.body.textContent));
      const scenes = await (await request.get(`${BASE_URL}/scenes/api/`)).json();
      sceneId = (scenes.scenes.find(s => s.name === name) || {}).id;
      expect(sceneId, 'the scene must exist on the server').toBeTruthy();

      // Add the step the way the palette does (a drop on the timeline).
      await page.evaluate(() => {
        const dt = new DataTransfer(); dt.setData('text/plain', 'step:goblin-video');
        document.getElementById('addStepZone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('.goblin-sel');
      // Before a Goblin is chosen the video select is a placeholder that must not be collected.
      expect(await page.getAttribute('.video-sel', 'data-skip')).toBe('1');

      await page.selectOption('.goblin-sel', goblin.id);
      await page.waitForFunction(() => { const s = document.querySelector('.video-sel'); return s && !s.disabled && s.options.length > 1; }, null, { timeout: 30000 });
      const first = await page.$eval('.video-sel', el => el.options[1].value);
      expect(first).toMatch(/\.(mp4|mov|avi|mkv)$/i);
      await page.selectOption('.video-sel', first);

      await page.click('#btnSave');
      await page.waitForFunction(() => /Saved/i.test(document.body.textContent), null, { timeout: 15000 });
      let saved = await (await request.get(`${BASE_URL}/scenes/api/${sceneId}`)).json();
      let step = (saved.scene || saved).steps[0];
      expect(step).toMatchObject({ type: 'goblin-video', goblinId: goblin.id, videoId: first, loop: false });

      await page.reload({ waitUntil: 'networkidle' });
      await page.click(`#sceneLibrary >> text=${name}`);
      await page.waitForFunction(() => { const s = document.querySelector('.video-sel'); return s && !s.disabled && s.options.length > 1; }, null, { timeout: 30000 });
      expect(await page.$eval('.video-sel', el => el.value)).toBe(first);
      await page.click('#btnSave');
      await page.waitForFunction(() => /Saved/i.test(document.body.textContent), null, { timeout: 15000 });
      saved = await (await request.get(`${BASE_URL}/scenes/api/${sceneId}`)).json();
      step = (saved.scene || saved).steps[0];
      expect(step.videoId, 'a re-save in the Studio must keep the video').toBe(first);
      expect(errors, 'page errors').toEqual([]);
    } finally {
      if (sceneId) await request.delete(`${BASE_URL}/scenes/api/${sceneId}`);
      await page.close();
    }
  });
});
