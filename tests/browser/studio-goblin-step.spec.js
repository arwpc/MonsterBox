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
 * Nothing is played.
 *
 * v10.7.0: the scene never reaches the node's scenes.json. :3100 is the live
 * node (its show was just rebuilt and is config-locked on some nodes), so the
 * page's scene CRUD is served by an in-memory store in this spec (page.route);
 * the Goblin list and video list still come from the real device.
 */
import { test, expect } from './fixtures.js';

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

    // In-memory scene store for this page only (list = real scenes + ours).
    const fake = new Map();
    let nextId = 990001;
    await page.route(/\/scenes\/api\/?(\d+)?(\?.*)?$/, async (route) => {
      const req = route.request();
      const m = new URL(req.url()).pathname.match(/\/scenes\/api\/?(\d+)?$/);
      const id = m && m[1] ? Number(m[1]) : null;
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (id === null && req.method() === 'GET') {
        const real = await (await route.fetch()).json();
        return json({ ...real, scenes: [...(real.scenes || []), ...fake.values()] });
      }
      if (id === null && req.method() === 'POST') {
        const body = req.postDataJSON() || {};
        const scene = { id: nextId++, name: body.name, steps: body.steps || [] };
        fake.set(scene.id, scene);
        return json({ success: true, scene });
      }
      if (id !== null && fake.has(id)) {
        if (req.method() === 'GET') return json({ success: true, scene: fake.get(id) });
        if (req.method() === 'PUT') {
          const scene = { ...fake.get(id), ...(req.postDataJSON() || {}), id };
          fake.set(id, scene);
          return json({ success: true, scene });
        }
        if (req.method() === 'DELETE') { fake.delete(id); return json({ success: true }); }
      }
      return route.continue();
    });
    try {
      await page.goto(`${BASE_URL}/scenes`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.palette-action[data-step-type="goblin-video"]');
      await page.click('#btnNewScene');
      await page.waitForFunction(() => /Created:/.test(document.body.textContent));
      sceneId = ([...fake.values()].find(s => s.name === name) || {}).id;
      expect(sceneId, 'the Studio must have created the scene').toBeTruthy();

      // Add the step the way the palette does (a drop on the timeline).
      await page.evaluate(() => {
        const dt = new DataTransfer(); dt.setData('text/plain', 'step:goblin-video');
        document.getElementById('addStepZone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('.goblin-sel');
      // Before a Goblin is chosen the video select is a placeholder that must not be collected.
      expect(await page.getAttribute('.video-sel', 'data-skip')).toBe('1');

      // v10.7.0: the Studio casts by NAME (sceneExecutor resolveGoblinRef), the
      // convention every authored show uses, so the option value is the name.
      await page.selectOption('.goblin-sel', goblin.name);
      await page.waitForFunction(() => { const s = document.querySelector('.video-sel'); return s && !s.disabled && s.options.length > 1; }, null, { timeout: 30000 });
      const first = await page.$eval('.video-sel', el => el.options[1].value);
      expect(first).toMatch(/\.(mp4|mov|avi|mkv)$/i);
      await page.selectOption('.video-sel', first);

      await page.click('#btnSave');
      await page.waitForFunction(() => /Saved/i.test(document.body.textContent), null, { timeout: 15000 });
      let step = fake.get(sceneId).steps[0];
      expect(step).toMatchObject({ type: 'goblin-video', goblinName: goblin.name, videoId: first, loop: false, waitMs: 0 });
      expect(step.goblinId, 'a cast by name carries no goblinId (it would win over the name)').toBeUndefined();

      await page.reload({ waitUntil: 'networkidle' });
      await page.click(`#sceneLibrary >> text=${name}`);
      await page.waitForFunction(() => { const s = document.querySelector('.video-sel'); return s && !s.disabled && s.options.length > 1; }, null, { timeout: 30000 });
      expect(await page.$eval('.video-sel', el => el.value)).toBe(first);
      await page.click('#btnSave');
      await page.waitForFunction(() => /Saved/i.test(document.body.textContent), null, { timeout: 15000 });
      step = fake.get(sceneId).steps[0];
      expect(step.videoId, 'a re-save in the Studio must keep the video').toBe(first);
      expect(errors, 'page errors').toEqual([]);
    } finally {
      await page.close();
    }
  });
});

// v10.7.0 (D7): the five fleet step types are in the palette and their editors
// write exactly the fields services/scenes/fleetSteps.js reads. Nothing is
// played or saved to the node: the scene store is in memory (page.route).
import { FLEET_STEP_TYPES } from '../../services/scenes/fleetNodes.js';

test.describe('Studio fleet steps', () => {
  test('palette offers every fleet step type and the editors write the fleetSteps fields', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const name = 'ZZ Studio Fleet Steps ' + Date.now();
    page.on('dialog', d => d.accept(name));
    const fake = new Map();
    let nextId = 991001;
    await page.route(/\/scenes\/api\/?(\d+)?(\?.*)?$/, async (route) => {
      const req = route.request();
      const m = new URL(req.url()).pathname.match(/\/scenes\/api\/?(\d+)?$/);
      const id = m && m[1] ? Number(m[1]) : null;
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (id === null && req.method() === 'GET') {
        const real = await (await route.fetch()).json();
        return json({ ...real, scenes: [...(real.scenes || []), ...fake.values()] });
      }
      if (id === null && req.method() === 'POST') {
        const body = req.postDataJSON() || {};
        const scene = { id: nextId++, name: body.name, steps: body.steps || [] };
        fake.set(scene.id, scene);
        return json({ success: true, scene });
      }
      if (id !== null && fake.has(id)) {
        if (req.method() === 'GET') return json({ success: true, scene: fake.get(id) });
        if (req.method() === 'PUT') { const scene = { ...fake.get(id), ...(req.postDataJSON() || {}), id }; fake.set(id, scene); return json({ success: true, scene }); }
        if (req.method() === 'DELETE') { fake.delete(id); return json({ success: true }); }
      }
      return route.continue();
    });

    await page.goto(`${BASE_URL}/scenes`, { waitUntil: 'networkidle' });
    for (const type of FLEET_STEP_TYPES) {
      await expect(page.locator(`#fleetPalette .palette-action[data-step-type="${type}"]`), `${type} in the palette`).toHaveCount(1);
    }
    await page.click('#btnNewScene');
    await page.waitForFunction(() => /Created:/.test(document.body.textContent));
    const sceneId = ([...fake.values()].find(s => s.name === name) || {}).id;
    expect(sceneId).toBeTruthy();

    const drop = (type) => page.evaluate((t) => {
      const dt = new DataTransfer(); dt.setData('text/plain', 'step:' + t);
      document.getElementById('addStepZone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, type);
    const field = (f) => page.locator(`.step-block.expanded .sf-input[data-field="${f}"]`);

    await drop('fleet-scene');
    await field('node').fill('NodeA'); await field('node').dispatchEvent('change');
    await field('scene').fill('Night Watch'); await field('scene').dispatchEvent('change');
    await field('timeoutMs').fill('120000'); await field('timeoutMs').dispatchEvent('change');
    await field('wait').uncheck();
    await field('force').check();

    await drop('fleet-say');
    await field('text').fill('Good evening.'); await field('text').dispatchEvent('change');

    await drop('fleet-audio');
    await field('audioId').fill('some-track'); await field('audioId').dispatchEvent('change');
    await field('volume').fill('35'); await field('volume').dispatchEvent('change');
    await field('loop').check();

    await drop('fleet-stop-audio');

    await drop('fleet-mode');
    await field('maxMs').fill('90000'); await field('maxMs').dispatchEvent('change');
    await field('reason').fill('rehearsal'); await field('reason').dispatchEvent('change');
    await field('mode').selectOption('release');
    await expect(field('maxMs'), 'release has no maxMs field').toHaveCount(0);

    await page.click('#btnSave');
    await page.waitForFunction(() => /Saved/i.test(document.body.textContent), null, { timeout: 15000 });
    const steps = fake.get(sceneId).steps;
    expect(steps.map(s => s.type)).toEqual(['fleet-scene', 'fleet-say', 'fleet-audio', 'fleet-stop-audio', 'fleet-mode']);
    expect(steps[0]).toMatchObject({ node: 'NodeA', scene: 'Night Watch', timeoutMs: 120000, wait: false, force: true });
    expect(steps[1]).toMatchObject({ node: 'all', text: 'Good evening.', wait: true });
    expect(steps[2]).toMatchObject({ node: 'all', audioId: 'some-track', volume: 35, loop: true });
    expect(steps[3]).toMatchObject({ node: 'all' });
    expect(steps[4]).toMatchObject({ node: 'all', mode: 'release', reason: 'rehearsal' });
    expect(errors, 'page errors').toEqual([]);
  });
});
