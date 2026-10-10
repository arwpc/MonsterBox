/**
 * Animation Studio Tests
 * Validates all functionality on /scenes (Animation Studio) page
 */

import { test, expect } from './fixtures.js';
import { testNavigation, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Animation Studio Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/scenes`, 'Animation Studio');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load Animation Studio without errors', async () => {
        expect(await page.title()).toContain('Animation Studio');
    });

    test('should display three-panel layout', async () => {
        tracker.clear();

        // Left panel - scene/pose library
        const leftPanel = page.locator('#leftPanel, .studio-left');
        if (await leftPanel.count() > 0) {
            await expect(leftPanel.first()).toBeVisible();
        }

        // Center panel - timeline editor
        const centerPanel = page.locator('#centerPanel, .studio-center');
        if (await centerPanel.count() > 0) {
            await expect(centerPanel.first()).toBeVisible();
        }

        // Right panel - preview/palette
        const rightPanel = page.locator('#rightPanel, .studio-right');
        if (await rightPanel.count() > 0) {
            await expect(rightPanel.first()).toBeVisible();
        }

        await tracker.logErrors();
    });

    test('should display toolbar with action buttons', async () => {
        tracker.clear();

        // Check for toolbar buttons
        const toolbar = page.locator('.studio-toolbar, #studioToolbar');
        if (await toolbar.count() > 0) {
            await expect(toolbar.first()).toBeVisible();
        }

        // New Scene button
        const newSceneBtn = page.locator('button:has-text("New Scene"), #btnNewScene');
        if (await newSceneBtn.count() > 0) {
            await expect(newSceneBtn.first()).toBeVisible();
        }

        // Save button
        const saveBtn = page.locator('button:has-text("Save"), #btnSave');
        if (await saveBtn.count() > 0) {
            await expect(saveBtn.first()).toBeVisible();
        }

        await tracker.assertNoErrors();
    });

    test('should display scene library', async () => {
        tracker.clear();

        // Wait for scene list section to be present
        await page.waitForSelector('#scenesSection', { timeout: 5000 });

        await tracker.logErrors();
    });

    test('should display pose library', async () => {
        tracker.clear();

        // Pose library section
        const poseLib = page.locator('#poseLibrary, .pose-library, [data-poses]');
        if (await poseLib.count() > 0) {
            await expect(poseLib.first()).toBeVisible();
        }

        await tracker.logErrors();
    });

    test('should have emergency stop button', async () => {
        tracker.clear();

        const estopBtn = page.locator('#btnEstop, button:has-text("E-STOP"), .e-stop-btn');
        if (await estopBtn.count() > 0) {
            await expect(estopBtn.first()).toBeVisible();
        }

        await tracker.assertNoErrors();
    });

    test('should load scene into editor on click', async () => {
        tracker.clear();

        // Click first scene in list
        const sceneItem = page.locator('.scene-item, [data-scene-id]').first();
        if (await sceneItem.count() > 0) {
            await sceneItem.click();
            await page.waitForTimeout(1000);

            // Timeline should populate
            const timeline = page.locator('#timeline, .timeline-container');
            if (await timeline.count() > 0) {
                await expect(timeline.first()).toBeVisible();
            }
        }

        await tracker.logErrors();
    });

    test('should open add step modal', async () => {
        tracker.clear();

        const addStepBtn = page.locator('button:has-text("Add Step"), #btnAddStep, .add-step-btn').first();
        if (await addStepBtn.count() > 0) {
            await addStepBtn.click();
            await page.waitForTimeout(500);

            // Modal should appear
            const modal = page.locator('#addStepModal, .modal.show');
            if (await modal.count() > 0) {
                await expect(modal.first()).toBeVisible();
            }
        }

        await tracker.assertNoErrors();
    });

    test('should have play and stop buttons', async () => {
        tracker.clear();

        // Play button exists but starts disabled (no scene loaded)
        const playButton = page.locator('#btnPlay');
        await expect(playButton).toBeVisible();
        // Should be disabled when no scene is loaded
        await expect(playButton).toBeDisabled();

        const stopButton = page.locator('#btnStop');
        await expect(stopButton).toBeVisible();

        await tracker.assertNoErrors();
    });

    test('should enable play after loading a scene', async () => {
        tracker.clear();

        // Click first scene to load it
        const sceneItem = page.locator('.scene-item, [data-scene-id]').first();
        if (await sceneItem.count() > 0) {
            await sceneItem.click();
            await page.waitForTimeout(1500);

            // Play button should now be enabled
            const playButton = page.locator('#btnPlay');
            await expect(playButton).toBeEnabled({ timeout: 3000 });
        }

        await tracker.assertNoErrors();
    });

    // v10.7.0: the library is the node's own scene file (ten show scenes per
    // character, plus any conductor scenes the node holds). Character-independent:
    // the expected set is whatever GET /scenes/api/ returns for this node.
    test('library lists exactly the scenes the API returns', async () => {
        const api = await (await page.request.get(`${BASE_URL}/scenes/api/`)).json();
        expect(api.success).toBe(true);
        const apiIds = api.scenes.map(s => String(s.id)).sort();
        await page.waitForSelector('#scenesSection', { timeout: 5000 });
        await expect.poll(async () => page.locator('#scenesSection [data-scene-id]').count(), { timeout: 8000 })
            .toBe(apiIds.length);
        const shown = await page.locator('#scenesSection [data-scene-id]')
            .evaluateAll(els => els.map(e => e.getAttribute('data-scene-id')));
        expect(shown.map(String).sort()).toEqual(apiIds);
    });

    // :3100 is the live node. The hazard guard (fixtures.js) rewrites the Studio's
    // play call to ?dryRun=1, so this proves the Play path end to end without the
    // node moving or speaking.
    test('Play from the Studio runs the scene dry on the live node', async () => {
        const api = await (await page.request.get(`${BASE_URL}/scenes/api/`)).json();
        const playable = api.scenes.filter(s => Array.isArray(s.steps) && s.steps.length > 0)
            .sort((a, b) => a.steps.length - b.steps.length)[0];
        test.skip(!playable, 'this node has no scenes with steps');
        await page.locator(`#scenesSection [data-scene-id="${playable.id}"]`).first().click();
        await expect(page.locator('#btnPlay')).toBeEnabled({ timeout: 5000 });
        const resPromise = page.waitForResponse(r => /\/scenes\/api\/[^/]+\/play/.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60000 });
        await page.locator('#btnPlay').click();
        const res = await resPromise;
        expect(res.url()).toContain('dryRun=1');
        const j = await res.json();
        expect(j.dryRun, 'the live node must have run the scene dry').toBe(true);
        expect(j.success).toBe(true);
    });

    test('should redirect /setup/poses to Animation Studio', async () => {
        tracker.clear();

        const response = await page.goto(`${BASE_URL}/setup/poses`);
        // Should redirect to /scenes
        expect(page.url()).toContain('/scenes');

        await tracker.logErrors();
    });

    test('should redirect /scenes/edit/:id to Animation Studio', async () => {
        tracker.clear();

        await page.goto(`${BASE_URL}/scenes/edit/test-scene`);
        // Should redirect to /scenes?edit=test-scene
        expect(page.url()).toContain('/scenes');

        await tracker.logErrors();
    });

    test('should have jaw animation toggle in toolbar', async () => {
        tracker.clear();

        const jawToggle = page.locator('#jawToggle');
        await expect(jawToggle).toBeVisible();

        await tracker.assertNoErrors();
    });

    test('should have head tracking toggle in toolbar', async () => {
        tracker.clear();

        const headTrackToggle = page.locator('#headTrackToggle');
        await expect(headTrackToggle).toBeVisible();

        await tracker.assertNoErrors();
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();

        const elements = await getAllInteractiveElements(page);
        console.log('Found ' + elements.length + ' interactive elements');

        expect(elements.length).toBeGreaterThan(0);
        await tracker.assertNoErrors();
    });

    test('should display navigation with Animation Studio link', async () => {
        tracker.clear();

        // Check navigation has Animation Studio instead of separate Poses/Scenes
        const studioLink = page.locator('a:has-text("Animation Studio")');
        expect(await studioLink.count()).toBeGreaterThan(0);

        await tracker.assertNoErrors();
    });

    test('should serve poses API as JSON', async () => {
        const response = await page.request.get(`${BASE_URL}/poses/api/poses`);
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json).toBeDefined();
    });

    test('should serve scenes API as JSON', async () => {
        const response = await page.request.get(`${BASE_URL}/scenes/api`);
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json).toBeDefined();
    });
});
