/**
 * MonsterBox 5.5 Browser/UI Tests using Playwright
 * Tests the web interface functionality in a real browser environment
 */

import { expect, test } from '../test.setup';

// @smoke @core
test.describe('MonsterBox 5.5 Web Interface', () => {

    test.beforeAll(async () => {
        // Ensure server is running before tests
        console.log('Testing MonsterBox 5.5 web interface using Playwright baseURL');
    });

    test('Main Dashboard loads correctly', async ({ page }) => {
        await page.goto('/');

        // Check page title
        await expect(page).toHaveTitle(/MonsterBox/);

        // Check main heading
        await expect(page.locator('h1')).toContainText('Dashboard');

        // Check Bootstrap dark theme is applied
        await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');

        // Check navigation is present
        await expect(page.locator('.navbar')).toBeVisible();
        await expect(page.locator('.navbar-brand')).toContainText('MonsterBox');
    });

    test('Setup → Poses page loads and functions', async ({ page }) => {
        await page.goto('/setup/poses');

        // Check page loads
        await expect(page.locator('h1')).toContainText('Setup Poses');

        // Check poses container is present
        await expect(page.locator('#poses-list')).toBeVisible();

        // Check create pose button is present (choose specific label to avoid strict-mode)
        const createPoseBtn = page.getByRole('button', { name: /Create Pose/ }).first();
        await expect(createPoseBtn).toBeVisible();

        // Test modal functionality
        await createPoseBtn.click();
        await expect(page.locator('#createPoseModal')).toBeVisible();
    });

    test('Setup → Parts page loads and functions', async ({ page }) => {
        await page.goto('/setup/parts');

        // Check page loads
        await expect(page.locator('h1')).toContainText('Parts');

        // Check parts container is present
        await expect(page.locator('#parts-list')).toBeVisible();

        // Parts page has Refresh and Test actions; no create modal in 5.3
        await expect(page.locator('#refreshBtn')).toBeVisible();
    });

    test('Dashboard shows Quick Poses and basic UI', async ({ page }) => {
        await page.goto('/');

        // Check page title and heading
        await expect(page).toHaveTitle(/MonsterBox/);
        await expect(page.locator('h5.card-title:has-text("Quick Poses")')).toBeVisible();
        // Manage button should link to setup/poses
        const manageBtn = page.locator('a.btn.btn-sm.btn-outline-primary[href="/setup/poses"]').first();
        await expect(manageBtn).toBeVisible();
    });

    test('Navigation links work correctly', async ({ page }) => {
        await page.goto('/');

        // Test Dashboard link
        await page.locator('a.navbar-brand[href="/"]').first().click();
        await expect(page).toHaveURL(/\/$/);

        // Test Setup dropdown
        await page.click('.dropdown-toggle:has-text("Setup")');
        await expect(page.locator('#navbarNav .dropdown-menu.show')).toBeVisible();

        // Test Setup → System link (stable, no external API calls)
        await page.click('#navbarNav .dropdown-menu a[href="/setup/system"]');
        await page.waitForURL(/\/setup\/system$/);

        // Navigate to Orchestration instead of deprecated Live
        await page.goto('/orchestration');
        await expect(page.locator('h1')).toContainText('Orchestration Control Center');
    });

    test('Bootstrap 5 styling and dark theme are applied', async ({ page }) => {
        await page.goto('/');

        // Check Bootstrap CSS is loaded
        const bootstrapCSS = await page.locator('link[href*="bootstrap"]').count();
        expect(bootstrapCSS).toBeGreaterThan(0);

        // Check Bootstrap Icons are loaded
        const bootstrapIcons = await page.locator('link[href*="bootstrap-icons"]').count();
        expect(bootstrapIcons).toBeGreaterThan(0);

        // Check dark theme is applied
        await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');

        // Check dark theme colors are applied (body should have dark background)
        const bodyBgColor = await page.locator('body').evaluate(el =>
            window.getComputedStyle(el).backgroundColor
        );
        // Dark theme should have a dark background color
        expect(bodyBgColor).not.toBe('rgb(255, 255, 255)'); // Not white
    });

    test('Error handling works correctly', async ({ page }) => {
        // Test 404 page
        const response = await page.goto('/non-existent-page');
        expect(response.status()).toBe(404);

        // Check error page content
        await expect(page.locator('h1')).toContainText('Page not found');
        await expect(page.locator('button[onclick="history.back()"]')).toBeVisible();
        await expect(page.locator('a.btn[href="/"]')).toBeVisible();
    });
});

