import { test, expect } from '@playwright/test';

/**
 * Comprehensive Navigation Test for MonsterBox 4.0
 * Tests every single link and route in the updated navigation structure
 */

const BASE_URL = 'http://localhost:3000';

// All routes to test based on the updated navigation structure
const ROUTES = {
    dashboard: '/',
    
    // Setup > Hardware
    parts: '/setup/parts',
    webcam: '/setup/webcam',
    
    // Setup > Media
    audioConfig: '/setup/audio',
    audioLibrary: '/audio-library',
    
    // Setup > AI Settings
    aiOverview: '/ai-settings',
    aiStt: '/ai-settings/stt',
    aiAgents: '/ai-settings/agents',
    aiTts: '/ai-settings/tts',
    
    // Setup > Character Management
    characters: '/setup/characters',
    characterAudio: '/setup/character-audio',
    characterAssignment: '/ai-settings/character-assignment',
    superPowers: '/setup/super-powers',
    
    // Setup > System
    models: '/setup/models',
    system: '/setup/system',
    
    // Activities
    live: '/live',
    poses: '/setup/poses',
    scenes: '/scenes'
};

test.describe('MonsterBox Navigation Complete Test', () => {
    test.beforeEach(async ({ page }) => {
        // Start from dashboard
        await page.goto(BASE_URL);
        await expect(page).toHaveTitle(/MonsterBox/);
    });

    test('Dashboard loads correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.dashboard}`);
        
        // Check page loads
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('.navbar-brand')).toContainText('MonsterBox 4.0');
        
        // Check for webcam stream or placeholder
        const hasWebcamStream = await page.locator('img[src*="8090"]').count() > 0;
        const hasWebcamPlaceholder = await page.locator('text=/webcam/i').count() > 0;
        expect(hasWebcamStream || hasWebcamPlaceholder).toBeTruthy();
        
        console.log('✅ Dashboard: Navigation and webcam elements present');
    });

    test('Setup > Hardware > Parts & Calibration', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.parts}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/parts/i);
        
        // Check for parts-specific content
        const hasPartsContent = await page.locator('text=/hardware/i, text=/calibration/i, text=/servo/i, text=/motor/i').count() > 0;
        expect(hasPartsContent).toBeTruthy();
        
        console.log('✅ Parts & Calibration: Page loads with expected content');
    });

    test('Setup > Hardware > Webcam', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.webcam}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/webcam/i);
        
        console.log('✅ Webcam: Page loads correctly');
    });

    test('Setup > Media > Audio Configuration', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.audioConfig}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/audio/i);
        
        console.log('✅ Audio Configuration: Page loads correctly');
    });

    test('Setup > Media > Audio Library', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.audioLibrary}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/audio.*library/i);
        
        console.log('✅ Audio Library: Page loads correctly');
    });

    test('Setup > AI Settings > Overview', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.aiOverview}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/ai.*settings/i);
        
        console.log('✅ AI Settings Overview: Page loads correctly');
    });

    test('Setup > AI Settings > Speech-to-Text', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.aiStt}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/speech.*text|stt/i);
        
        console.log('✅ Speech-to-Text: Page loads correctly');
    });

    test('Setup > AI Settings > AI Agents', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.aiAgents}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/agents/i);
        
        console.log('✅ AI Agents: Page loads correctly');
    });

    test('Setup > AI Settings > Text-to-Speech', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.aiTts}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/text.*speech|tts/i);
        
        console.log('✅ Text-to-Speech: Page loads correctly');
    });

    test('Setup > Character Management > Characters', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.characters}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/characters/i);
        
        console.log('✅ Characters: Page loads correctly');
    });

    test('Setup > Character Management > Character Audio', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.characterAudio}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/character.*audio/i);
        
        console.log('✅ Character Audio: Page loads correctly');
    });

    test('Setup > Character Management > Character AI Assignment', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.characterAssignment}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/character.*assignment|assignment/i);
        
        console.log('✅ Character AI Assignment: Page loads correctly');
    });

    test('Setup > Character Management > Super Powers', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.superPowers}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/super.*powers/i);
        
        console.log('✅ Super Powers: Page loads correctly');
    });

    test('Setup > System > Models', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.models}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/models/i);
        
        console.log('✅ Models: Page loads correctly');
    });

    test('Setup > System > System', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.system}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/system/i);
        
        console.log('✅ System: Page loads correctly');
    });

    test('Activities > Live Mode', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.live}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/live.*mode/i);
        
        console.log('✅ Live Mode: Page loads correctly');
    });

    test('Activities > Poses', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.poses}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/poses/i);
        
        console.log('✅ Poses: Page loads correctly');
    });

    test('Activities > Scenes', async ({ page }) => {
        await page.goto(`${BASE_URL}${ROUTES.scenes}`);
        
        await expect(page.locator('nav.navbar')).toBeVisible();
        await expect(page.locator('h1, h2, h3')).toContainText(/scenes/i);
        
        console.log('✅ Scenes: Page loads correctly');
    });

    test('Navigation Links - Setup Dropdown Navigation', async ({ page }) => {
        await page.goto(`${BASE_URL}`);
        
        // Test Setup dropdown
        await page.locator('a:has-text("Setup")').click();
        await expect(page.locator('.dropdown-menu')).toBeVisible();
        
        // Test Hardware section
        await page.locator('a:has-text("Parts & Calibration")').click();
        await expect(page).toHaveURL(`${BASE_URL}/setup/parts`);
        await expect(page.locator('nav.navbar')).toBeVisible();
        
        console.log('✅ Setup dropdown navigation works correctly');
    });

    test('Navigation Links - Activities Dropdown Navigation', async ({ page }) => {
        await page.goto(`${BASE_URL}`);
        
        // Test Activities dropdown
        await page.locator('a:has-text("Activities")').click();
        await expect(page.locator('.dropdown-menu')).toBeVisible();
        
        // Test Live Mode
        await page.locator('a:has-text("Live Mode")').click();
        await expect(page).toHaveURL(`${BASE_URL}/live`);
        await expect(page.locator('nav.navbar')).toBeVisible();
        
        console.log('✅ Activities dropdown navigation works correctly');
    });
});
