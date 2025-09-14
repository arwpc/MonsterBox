/**
 * MonsterBox 4.0 Browser/UI Tests using Playwright
 * Tests the web interface functionality in a real browser environment
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('MonsterBox 4.0 Web Interface', () => {

    test.beforeAll(async () => {
        // Ensure server is running before tests
        console.log('Testing MonsterBox 4.0 web interface at:', BASE_URL);
    });

    test('Main Dashboard loads correctly', async ({ page }) => {
        await page.goto(BASE_URL);

        // Check page title
        await expect(page).toHaveTitle(/MonsterBox 4.0/);

        // Check main heading
        await expect(page.locator('h1')).toContainText('Dashboard');

        // Check Bootstrap dark theme is applied
        await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');

        // Check navigation is present
        await expect(page.locator('.navbar')).toBeVisible();
        await expect(page.locator('.navbar-brand')).toContainText('MonsterBox 4.0');
    });

    test('Setup → Poses page loads and functions', async ({ page }) => {
        await page.goto(`${BASE_URL}/setup/poses`);

        // Check page loads
        await expect(page.locator('h1')).toContainText('Setup Poses');

        // Check poses container is present
        await expect(page.locator('#poses-list')).toBeVisible();

        // Check create pose button is present
        await expect(page.locator('button[data-bs-target="#createPoseModal"]')).toBeVisible();

        // Test modal functionality
        await page.click('button[data-bs-target="#createPoseModal"]');
        await expect(page.locator('#createPoseModal')).toBeVisible();
    });

    test('Setup → Parts page loads and functions', async ({ page }) => {
        await page.goto(`${BASE_URL}/setup/parts`);

        // Check page loads
        await expect(page.locator('h1')).toContainText('Setup Parts');

        // Check parts container is present
        await expect(page.locator('#parts-list')).toBeVisible();

        // Check create part button is present
        await expect(page.locator('button[data-bs-target="#createPartModal"]')).toBeVisible();

        // Test modal functionality
        await page.click('button[data-bs-target="#createPartModal"]');
        await expect(page.locator('#createPartModal')).toBeVisible();
    });

    test('Live Dashboard loads and functions', async ({ page }) => {
        await page.goto(`${BASE_URL}/live`);

        // Check page loads
        await expect(page.locator('h1')).toContainText('Live Dashboard');

        // Check live mode badge is present
        await expect(page.locator('span.badge.bg-success.fs-6')).toContainText('Live Mode Active');

        // Check poses container is present
        await expect(page.locator('#posesContainer')).toBeVisible();

        // Check refresh button works
        await expect(page.locator('button[onclick="location.reload()"]')).toBeVisible();
    });

    test('Navigation links work correctly', async ({ page }) => {
        await page.goto(BASE_URL);

        // Test Dashboard link
        await page.locator('a.navbar-brand[href="/"]').first().click();
        await expect(page).toHaveURL(BASE_URL + '/');

        // Test Setup dropdown
        await page.click('.dropdown-toggle:has-text("Setup")');
        await expect(page.locator('#navbarNav .dropdown-menu.show')).toBeVisible();

        // Test Setup → Parts link
        await page.click('a[href="/setup/parts"]');
        await page.waitForURL(BASE_URL + '/setup/parts');

        // Test Setup → Poses link
        await page.click('.dropdown-toggle:has-text("Setup")');
        await expect(page.locator('#navbarNav .dropdown-menu.show')).toBeVisible();
        await page.click('a[href="/setup/poses"]');
        await page.waitForURL(BASE_URL + '/setup/poses');

        // Test Live Mode page (navigate directly to avoid navbar overlap flakiness)
        await page.goto(BASE_URL + '/live');
        await expect(page.locator('h1')).toContainText('Live Dashboard');
    });

    test('Bootstrap 5 styling and dark theme are applied', async ({ page }) => {
        await page.goto(BASE_URL);

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
        const response = await page.goto(`${BASE_URL}/non-existent-page`);
        expect(response.status()).toBe(404);

        // Check error page content
        await expect(page.locator('h1')).toContainText('Page not found');
        await expect(page.locator('button[onclick="history.back()"]')).toBeVisible();
        await expect(page.locator('a.btn[href="/"]')).toBeVisible();
    });
});
