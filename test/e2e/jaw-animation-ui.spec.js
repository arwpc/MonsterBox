/**
 * Jaw Animation Super Power UI Integration Tests
 * Playwright tests for Halloween-themed Bootstrap interface
 * Tests character selection, configuration, real-time monitoring, and servo testing
 */

const { test, expect } = require('@playwright/test');

test.describe('Jaw Animation Super Power Interface', () => {
    
    test.beforeEach(async ({ page }) => {
        // Navigate to super powers page
        await page.goto('/setup/super-powers');
        
        // Wait for page to load completely
        await page.waitForLoadState('networkidle');
    });

    test.describe('Page Layout and Theme', () => {
        test('should display Halloween-themed super powers page', async ({ page }) => {
            // Check page title
            await expect(page).toHaveTitle(/Super Powers Configuration/);
            
            // Check main heading with spooky theming
            await expect(page.locator('h1')).toContainText('Super Powers Configuration');
            await expect(page.locator('.header-icon')).toHaveClass(/fa-magic/);
            
            // Check for Halloween color scheme
            const headerCard = page.locator('.card-header');
            await expect(headerCard).toHaveCSS('background-color', 'rgb(255, 69, 0)'); // Orange theme
            
            // Check breadcrumb navigation
            await expect(page.locator('.breadcrumb-item.active')).toContainText('Super Powers');
        });

        test('should show responsive Bootstrap layout', async ({ page }) => {
            // Check Bootstrap container classes
            await expect(page.locator('.container-fluid')).toBeVisible();
            await expect(page.locator('.row')).toBeVisible();
            await expect(page.locator('.col-md-4')).toBeVisible(); // Character selection column
            await expect(page.locator('.col-md-8')).toBeVisible(); // Configuration column
        });

        test('should display spooky styling elements', async ({ page }) => {
            // Check for Halloween decorative elements
            await expect(page.locator('.spooky-border')).toBeVisible();
            await expect(page.locator('.halloween-text')).toHaveCSS('color', 'rgb(255, 69, 0)');
            
            // Check for animated elements
            const glowEffect = page.locator('.glow-effect');
            if (await glowEffect.count() > 0) {
                await expect(glowEffect).toBeVisible();
            }
        });
    });

    test.describe('Character Selection', () => {
        test('should load character selection panel', async ({ page }) => {
            // Check character selection card
            await expect(page.locator('#character-selection-card')).toBeVisible();
            await expect(page.locator('h3')).toContainText('Select Character');
            
            // Check for character dropdown
            await expect(page.locator('#character-select')).toBeVisible();
            
            // Wait for characters to load
            await page.waitForTimeout(2000);
            
            // Should have at least one character option
            const options = await page.locator('#character-select option').count();
            expect(options).toBeGreaterThan(1); // Default option + actual characters
        });

        test('should handle character selection', async ({ page }) => {
            // Wait for characters to load
            await page.waitForTimeout(2000);
            
            // Select first available character
            await page.selectOption('#character-select', { index: 1 });
            
            // Should show configuration panel
            await expect(page.locator('#jaw-config-panel')).toBeVisible();
            await expect(page.locator('#jaw-config-panel')).not.toHaveClass(/d-none/);
            
            // Should display character name in panel
            const selectedText = await page.locator('#character-select').inputValue();
            if (selectedText) {
                await expect(page.locator('#jaw-config-panel h4')).toContainText('Jaw Animation Configuration');
            }
        });

        test('should show character status indicators', async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            
            // Should show jaw animation status
            const statusIndicator = page.locator('.jaw-status-indicator');
            if (await statusIndicator.count() > 0) {
                await expect(statusIndicator).toBeVisible();
            }
        });
    });

    test.describe('Jaw Animation Configuration Panel', () => {
        test.beforeEach(async ({ page }) => {
            // Select a character to enable configuration
            await page.waitForTimeout(2000);
            const characterOptions = await page.locator('#character-select option').count();
            if (characterOptions > 1) {
                await page.selectOption('#character-select', { index: 1 });
                await page.waitForTimeout(1000);
            }
        });

        test('should display configuration form elements', async ({ page }) => {
            // Check for servo selection dropdown
            await expect(page.locator('#servo-select')).toBeVisible();
            
            // Check for calibration inputs
            await expect(page.locator('#min-angle')).toBeVisible();
            await expect(page.locator('#max-angle')).toBeVisible();
            await expect(page.locator('#neutral-angle')).toBeVisible();
            
            // Check for audio sensitivity controls
            await expect(page.locator('#amplitude-threshold')).toBeVisible();
            await expect(page.locator('#smoothing-factor')).toBeVisible();
            
            // Check for enable/disable toggle
            await expect(page.locator('#jaw-enabled')).toBeVisible();
        });

        test('should validate input ranges', async ({ page }) => {
            // Test angle inputs
            await page.fill('#min-angle', '200'); // Invalid high value
            await page.fill('#max-angle', '250'); // Invalid high value
            
            // Try to save (should show validation error)
            await page.click('#save-config-btn');
            
            // Should show error message
            await expect(page.locator('.alert-danger')).toBeVisible();
            await expect(page.locator('.alert-danger')).toContainText('Invalid');
        });

        test('should save valid configuration', async ({ page }) => {
            // Fill valid configuration
            await page.selectOption('#servo-select', { index: 1 }); // Select first servo
            await page.fill('#min-angle', '10');
            await page.fill('#max-angle', '170');
            await page.fill('#neutral-angle', '90');
            await page.fill('#amplitude-threshold', '0.2');
            await page.fill('#smoothing-factor', '0.3');
            await page.check('#jaw-enabled');
            
            // Save configuration
            await page.click('#save-config-btn');
            
            // Should show success message
            await expect(page.locator('.alert-success')).toBeVisible();
            await expect(page.locator('.alert-success')).toContainText('Configuration saved successfully');
        });

        test('should load existing configuration', async ({ page }) => {
            // After saving a configuration, reload page
            await page.reload();
            await page.waitForTimeout(2000);
            
            // Select same character
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
            
            // Configuration should be loaded
            const minAngle = await page.inputValue('#min-angle');
            const maxAngle = await page.inputValue('#max-angle');
            
            // Values should be populated (not empty)
            expect(minAngle).not.toBe('');
            expect(maxAngle).not.toBe('');
        });
    });

    test.describe('Real-Time Audio Monitoring', () => {
        test.beforeEach(async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
        });

        test('should display audio level meter', async ({ page }) => {
            // Check for audio level visualization
            await expect(page.locator('#audio-level-meter')).toBeVisible();
            await expect(page.locator('.progress')).toBeVisible(); // Bootstrap progress bar
            await expect(page.locator('.progress-bar')).toBeVisible();
            
            // Check for numeric display
            await expect(page.locator('#audio-level-value')).toBeVisible();
        });

        test('should show real-time amplitude updates', async ({ page }) => {
            // Start monitoring
            await page.click('#start-monitoring-btn');
            
            // Wait for updates
            await page.waitForTimeout(3000);
            
            // Check that values are updating
            const initialValue = await page.textContent('#audio-level-value');
            await page.waitForTimeout(1000);
            const updatedValue = await page.textContent('#audio-level-value');
            
            // Values should be numeric
            expect(parseFloat(initialValue)).not.toBeNaN();
            expect(parseFloat(updatedValue)).not.toBeNaN();
        });

        test('should display jaw angle calculation', async ({ page }) => {
            await page.click('#start-monitoring-btn');
            await page.waitForTimeout(2000);
            
            // Should show calculated jaw angle
            await expect(page.locator('#calculated-jaw-angle')).toBeVisible();
            
            const angleText = await page.textContent('#calculated-jaw-angle');
            expect(angleText).toMatch(/\d+°/); // Should show angle with degree symbol
        });

        test('should handle monitoring toggle', async ({ page }) => {
            // Start monitoring
            await page.click('#start-monitoring-btn');
            await expect(page.locator('#start-monitoring-btn')).toContainText('Stop Monitoring');
            
            // Stop monitoring
            await page.click('#start-monitoring-btn');
            await expect(page.locator('#start-monitoring-btn')).toContainText('Start Monitoring');
        });
    });

    test.describe('Servo Testing Controls', () => {
        test.beforeEach(async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
        });

        test('should display test controls', async ({ page }) => {
            // Check for test button section
            await expect(page.locator('#test-controls')).toBeVisible();
            
            // Check for specific test buttons
            await expect(page.locator('#test-jaw-btn')).toBeVisible();
            await expect(page.locator('#test-neutral-btn')).toBeVisible();
            await expect(page.locator('#test-min-btn')).toBeVisible();
            await expect(page.locator('#test-max-btn')).toBeVisible();
        });

        test('should execute jaw movement tests', async ({ page }) => {
            // Test neutral position
            await page.click('#test-neutral-btn');
            
            // Should show test feedback
            await expect(page.locator('.test-feedback')).toBeVisible();
            await expect(page.locator('.test-feedback')).toContainText('Testing', { timeout: 5000 });
        });

        test('should handle custom angle testing', async ({ page }) => {
            // Fill custom test angle
            await page.fill('#test-angle-input', '45');
            await page.click('#test-custom-angle-btn');
            
            // Should show test execution
            await expect(page.locator('.test-feedback')).toContainText('45', { timeout: 5000 });
        });

        test('should validate test angle inputs', async ({ page }) => {
            // Test with invalid angle
            await page.fill('#test-angle-input', '300');
            await page.click('#test-custom-angle-btn');
            
            // Should show validation error
            await expect(page.locator('.alert-warning')).toBeVisible();
        });

        test('should show test progress indicators', async ({ page }) => {
            await page.click('#test-jaw-btn');
            
            // Should show loading/progress indicator
            const testBtn = page.locator('#test-jaw-btn');
            await expect(testBtn).toHaveClass(/disabled/);
            
            // Wait for test completion
            await page.waitForTimeout(3000);
            
            // Button should be re-enabled
            await expect(testBtn).not.toHaveClass(/disabled/);
        });
    });

    test.describe('Error Handling and Edge Cases', () => {
        test('should handle no characters available', async ({ page }) => {
            // If no characters are available
            const characterOptions = await page.locator('#character-select option').count();
            
            if (characterOptions === 1) { // Only default option
                await expect(page.locator('#jaw-config-panel')).toHaveClass(/d-none/);
                await expect(page.locator('.no-characters-message')).toBeVisible();
            }
        });

        test('should handle no servos available', async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
            
            const servoOptions = await page.locator('#servo-select option').count();
            
            if (servoOptions === 1) { // Only default option
                await expect(page.locator('.no-servos-warning')).toBeVisible();
                await expect(page.locator('#save-config-btn')).toBeDisabled();
            }
        });

        test('should handle network errors gracefully', async ({ page }) => {
            // Simulate network issue by navigating away from server briefly
            await page.route('**/super-powers/api/**', route => {
                route.abort('failed');
            });
            
            // Try to save configuration
            await page.click('#save-config-btn');
            
            // Should show error message
            await expect(page.locator('.alert-danger')).toBeVisible();
            await expect(page.locator('.alert-danger')).toContainText('Error');
        });

        test('should maintain state during page refresh', async ({ page }) => {
            // Configure and save
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
            await page.fill('#min-angle', '15');
            await page.click('#save-config-btn');
            await page.waitForTimeout(1000);
            
            // Refresh page
            await page.reload();
            await page.waitForTimeout(2000);
            
            // Select same character
            await page.selectOption('#character-select', { index: 1 });
            await page.waitForTimeout(1000);
            
            // Configuration should persist
            const minAngleValue = await page.inputValue('#min-angle');
            expect(minAngleValue).toBe('15');
        });
    });

    test.describe('Bootstrap Component Integration', () => {
        test('should use proper Bootstrap classes', async ({ page }) => {
            // Check for Bootstrap card components
            await expect(page.locator('.card')).toHaveCount({ min: 2 });
            await expect(page.locator('.card-header')).toBeVisible();
            await expect(page.locator('.card-body')).toBeVisible();
            
            // Check for Bootstrap form classes
            await expect(page.locator('.form-group')).toBeVisible();
            await expect(page.locator('.form-control')).toBeVisible();
            await expect(page.locator('.btn')).toBeVisible();
        });

        test('should display proper alert components', async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            
            // Trigger a validation error
            await page.fill('#min-angle', '-10');
            await page.click('#save-config-btn');
            
            // Check Bootstrap alert styling
            await expect(page.locator('.alert')).toBeVisible();
            await expect(page.locator('.alert')).toHaveClass(/alert-danger/);
        });

        test('should show proper progress bars', async ({ page }) => {
            await page.waitForTimeout(2000);
            await page.selectOption('#character-select', { index: 1 });
            await page.click('#start-monitoring-btn');
            
            // Check Bootstrap progress bar
            await expect(page.locator('.progress')).toBeVisible();
            await expect(page.locator('.progress-bar')).toHaveClass(/bg-warning/); // Halloween orange theme
        });
    });

    test.describe('Halloween Theme Integration', () => {
        test('should display spooky icons and colors', async ({ page }) => {
            // Check for Halloween-themed FontAwesome icons
            await expect(page.locator('.fa-magic')).toBeVisible();
            await expect(page.locator('.fa-volume-up')).toBeVisible();
            await expect(page.locator('.fa-cog')).toBeVisible();
            
            // Check for Halloween color scheme
            const primaryColors = await page.locator('.btn-warning'); // Orange buttons
            if (await primaryColors.count() > 0) {
                await expect(primaryColors.first()).toBeVisible();
            }
        });

        test('should show Halloween-themed text styling', async ({ page }) => {
            // Check for spooky text effects
            const spookyText = page.locator('.halloween-text');
            if (await spookyText.count() > 0) {
                await expect(spookyText).toHaveCSS('color', 'rgb(255, 69, 0)');
            }
            
            // Check for text shadows/effects
            const glowText = page.locator('.glow-text');
            if (await glowText.count() > 0) {
                await expect(glowText).toBeVisible();
            }
        });

        test('should maintain theme consistency', async ({ page }) => {
            // All primary buttons should use Halloween theme
            const buttons = page.locator('.btn-primary, .btn-warning');
            const buttonCount = await buttons.count();
            
            if (buttonCount > 0) {
                for (let i = 0; i < buttonCount; i++) {
                    const button = buttons.nth(i);
                    const buttonClass = await button.getAttribute('class');
                    expect(buttonClass).toMatch(/btn-(warning|primary)/);
                }
            }
        });
    });
});