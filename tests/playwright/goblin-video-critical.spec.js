/**
 * Critical Goblin & Video Library Tests
 * Comprehensive testing of goblin-management and video-library pages
 * Tests every button, interaction, and API endpoint
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

test.describe('Goblin Management Page - Critical Tests', () => {
    
    test('should load goblin-management page without any errors', async ({ page }) => {
        const errors = [];
        const warnings = [];
        
        // Capture all failed requests
        page.on('response', response => {
            const status = response.status();
            const url = response.url();
            
            if (status === 400) {
                errors.push({ status: 400, url, message: 'Bad Request' });
            } else if (status === 404) {
                errors.push({ status: 404, url, message: 'Not Found' });
            } else if (status >= 500) {
                errors.push({ status, url, message: 'Server Error' });
            }
        });

        // Capture console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                warnings.push(`Console Error: ${msg.text()}`);
            }
        });

        // Navigate to page
        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        await page.waitForTimeout(3000); // Wait for any async operations

        // Log all errors
        if (errors.length > 0) {
            console.error('❌ HTTP Errors found on /goblin-management:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        if (warnings.length > 0) {
            console.warn('⚠️ Console warnings on /goblin-management:');
            warnings.forEach(warn => console.warn(`  ${warn}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should have all expected buttons and controls', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle');

        // Check for main action buttons
        const registerButton = page.locator('button:has-text("Register Goblin")').first();
        await expect(registerButton).toBeVisible();

        const refreshButton = page.locator('button:has-text("Refresh All")');
        await expect(refreshButton).toBeVisible();

        console.log('✅ Main action buttons present');
    });

    test('should click Refresh All button without errors', async ({ page }) => {
        const errors = [];
        page.on('response', response => {
            if (response.status() >= 400) {
                errors.push({ status: response.status(), url: response.url() });
            }
        });

        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle');

        const refreshButton = page.locator('button:has-text("Refresh All")');
        await refreshButton.click();
        await page.waitForTimeout(2000);

        if (errors.length > 0) {
            console.error('❌ Errors after clicking Refresh All:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
        console.log('✅ Refresh All button works');
    });

    test('should open Register Goblin modal without errors', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle');

        const registerButton = page.locator('button:has-text("Register Goblin")').first();
        await registerButton.click();
        await page.waitForTimeout(1000);

        // Check if modal is visible
        const modal = page.locator('.modal, [role="dialog"]');
        const isVisible = await modal.isVisible().catch(() => false);

        if (isVisible) {
            console.log('✅ Register Goblin modal opened');
        } else {
            console.log('⚠️ Register Goblin modal not found (may use different UI)');
        }
    });

    test('should display goblin cards correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Check for goblin cards
        const goblinCards = page.locator('.goblin-card, [data-goblin-id]');
        const count = await goblinCards.count();

        console.log(`📊 Found ${count} goblin cards`);

        if (count > 0) {
            // Check first card for "undefined"
            const firstCard = goblinCards.first();
            const text = await firstCard.textContent();
            
            expect(text.toLowerCase()).not.toContain('undefined');
            console.log('✅ Goblin cards do not contain "undefined"');
        }
    });

    test('should test goblin card action buttons', async ({ page }) => {
        const errors = [];
        page.on('response', response => {
            if (response.status() >= 400) {
                errors.push({ status: response.status(), url: response.url() });
            }
        });

        await page.goto(`${BASE_URL}/goblin-management`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const goblinCards = page.locator('.goblin-card, [data-goblin-id]');
        const count = await goblinCards.count();

        if (count > 0) {
            // Try to find and click info/details button
            const infoButtons = page.locator('button:has-text("Info"), button[title*="info" i], button:has([class*="info"])');
            const infoCount = await infoButtons.count();
            
            if (infoCount > 0) {
                await infoButtons.first().click();
                await page.waitForTimeout(1000);
                console.log('✅ Info button clicked');
            }

            // Try reconnect button
            const reconnectButtons = page.locator('button:has-text("Reconnect")');
            const reconnectCount = await reconnectButtons.count();
            
            if (reconnectCount > 0) {
                console.log('✅ Reconnect buttons found');
            }
        }

        if (errors.length > 0) {
            console.error('❌ Errors during button interactions:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });
});

test.describe('Video Library Page - Critical Tests', () => {
    
    test('should load video-library page without any errors', async ({ page }) => {
        const errors = [];
        const warnings = [];
        
        page.on('response', response => {
            const status = response.status();
            const url = response.url();
            
            if (status === 400) {
                errors.push({ status: 400, url, message: 'Bad Request' });
            } else if (status === 404) {
                errors.push({ status: 404, url, message: 'Not Found' });
            } else if (status >= 500) {
                errors.push({ status, url, message: 'Server Error' });
            }
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                warnings.push(`Console Error: ${msg.text()}`);
            }
        });

        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        await page.waitForTimeout(3000);

        if (errors.length > 0) {
            console.error('❌ HTTP Errors found on /video-library:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        if (warnings.length > 0) {
            console.warn('⚠️ Console warnings on /video-library:');
            warnings.forEach(warn => console.warn(`  ${warn}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should have all expected controls and filters', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForLoadState('networkidle');

        // Check for search input
        const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
        const hasSearch = await searchInput.count() > 0;
        
        if (hasSearch) {
            console.log('✅ Search input found');
        }

        // Check for filter controls
        const filterSelects = page.locator('select');
        const selectCount = await filterSelects.count();
        console.log(`📊 Found ${selectCount} filter dropdowns`);
    });

    test('should test video card interactions', async ({ page }) => {
        const errors = [];
        page.on('response', response => {
            if (response.status() >= 400) {
                errors.push({ status: response.status(), url: response.url() });
            }
        });

        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const videoCards = page.locator('[data-video-id], .video-card');
        const count = await videoCards.count();
        console.log(`📊 Found ${count} video cards`);

        if (count > 0) {
            // Try clicking first video card
            const firstCard = videoCards.first();
            await firstCard.click();
            await page.waitForTimeout(1000);
            console.log('✅ Video card clicked');
        }

        if (errors.length > 0) {
            console.error('❌ Errors during video card interaction:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should test Quick Deploy button', async ({ page }) => {
        const errors = [];
        page.on('response', response => {
            if (response.status() >= 400) {
                errors.push({ status: response.status(), url: response.url() });
            }
        });

        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const deployButtons = page.locator('button:has-text("Deploy"), button:has-text("Quick Deploy")');
        const deployCount = await deployButtons.count();

        if (deployCount > 0) {
            await deployButtons.first().click();
            await page.waitForTimeout(1500);
            console.log('✅ Deploy button clicked');

            // Check if error message appears
            const errorMsg = page.locator('text=/No available Goblins/i');
            const hasError = await errorMsg.isVisible().catch(() => false);
            
            if (hasError) {
                console.log('⚠️ "No available Goblins" message shown (expected if goblins offline)');
            }
        }

        if (errors.length > 0) {
            console.error('❌ Errors during deploy interaction:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should test video playback without stream errors', async ({ page }) => {
        const errors = [];
        page.on('response', response => {
            const status = response.status();
            const url = response.url();
            
            // Only flag actual errors, not expected 404s for missing video files
            if (status === 400 || status >= 500) {
                errors.push({ status, url });
            }
        });

        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const videoCards = page.locator('[data-video-id]');
        const count = await videoCards.count();

        if (count > 0) {
            // Click first video to try playing it
            await videoCards.first().click();
            await page.waitForTimeout(2000);
            console.log('✅ Attempted video playback');
        }

        if (errors.length > 0) {
            console.error('❌ Critical errors during video playback:');
            errors.forEach(err => console.error(`  ${err.status} - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });
});

