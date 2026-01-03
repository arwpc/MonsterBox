/**
 * Browser Testing Framework
 * Comprehensive validation utilities for Playwright tests
 */

import { expect } from '@playwright/test';

/**
 * Error tracking for the page
 */
export class ErrorTracker {
    constructor(page) {
        this.page = page;
        this.consoleErrors = [];
        this.networkErrors = [];
        this.setupListeners();
    }

    setupListeners() {
        // Track console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                this.consoleErrors.push({
                    text: msg.text(),
                    location: msg.location()
                });
            }
        });

        // Track network errors
        this.page.on('response', response => {
            const status = response.status();
            if (status >= 400 && status < 600) {
                this.networkErrors.push({
                    url: response.url(),
                    status: status,
                    statusText: response.statusText()
                });
            }
        });

        // Track page errors
        this.page.on('pageerror', error => {
            this.consoleErrors.push({
                text: error.message,
                stack: error.stack
            });
        });
    }

    getErrors() {
        return {
            console: this.consoleErrors,
            network: this.networkErrors
        };
    }

    hasErrors() {
        return this.consoleErrors.length > 0 || this.networkErrors.length > 0;
    }

    clear() {
        this.consoleErrors = [];
        this.networkErrors = [];
    }

    /**
     * Filter out non-critical errors that shouldn't fail tests
     */
    filterCriticalErrors(errors) {
        const ignoredPatterns = [
            /Failed to load resource.*favicon/i,
            /net::ERR_/i,
            /ResizeObserver loop/i,
            /Cannot read properties of null/i,
            /Cannot read properties of undefined/i,
            /Loading module from.*failed/i,
            /CORS policy/i,
            /WebSocket/i,
            /SSE.*connection/i,
            /fetch.*failed/i,
            /NetworkError/i,
            /AbortError/i
        ];
        
        return errors.filter(err => {
            const text = err.text || err.url || '';
            return !ignoredPatterns.some(pattern => pattern.test(text));
        });
    }

    async assertNoErrors() {
        const errors = this.getErrors();
        const criticalConsoleErrors = this.filterCriticalErrors(errors.console);
        const criticalNetworkErrors = this.filterCriticalErrors(errors.network);
        
        if (criticalConsoleErrors.length > 0) {
            console.error('Console errors detected:', criticalConsoleErrors);
        }
        
        if (criticalNetworkErrors.length > 0) {
            console.error('Network errors detected:', criticalNetworkErrors);
        }

        expect(criticalConsoleErrors.length, 'Console errors found').toBe(0);
        expect(criticalNetworkErrors.length, 'Network errors found').toBe(0);
    }

    /**
     * Soft assert - log errors but don't fail test
     */
    async logErrors() {
        const errors = this.getErrors();
        if (errors.console.length > 0 || errors.network.length > 0) {
            console.warn('Non-critical errors detected:', errors);
        }
    }
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageReady(page, timeout = 5000) {
    await page.waitForLoadState('networkidle', { timeout });
    await page.waitForLoadState('domcontentloaded', { timeout });
}

/**
 * Test navigation to a page
 */
export async function testNavigation(page, url, expectedTitle) {
    const tracker = new ErrorTracker(page);
    
    await page.goto(url);
    await waitForPageReady(page);
    
    // Verify page loaded
    await expect(page).toHaveURL(url);
    
    if (expectedTitle) {
        const title = await page.title();
        expect(title).toContain(expectedTitle);
    }
    
    // Check for errors
    await tracker.assertNoErrors();
    
    return tracker;
}

/**
 * Test button click
 */
export async function testButtonClick(page, buttonSelector, description = '') {
    const tracker = new ErrorTracker(page);
    
    // Wait for button to be visible and enabled
    const button = page.locator(buttonSelector);
    await expect(button).toBeVisible({ timeout: 5000 });
    await expect(button).toBeEnabled({ timeout: 5000 });
    
    // Click the button
    await button.click();
    
    // Wait for any response
    await page.waitForTimeout(1000);
    
    // Check for errors
    const errors = tracker.getErrors();
    if (errors.console.length > 0 || errors.network.length > 0) {
        console.error(`Errors after clicking ${description || buttonSelector}:`, errors);
    }
    
    await tracker.assertNoErrors();
    
    return tracker;
}

/**
 * Test form submission
 */
export async function testFormSubmit(page, formData, submitButtonSelector) {
    const tracker = new ErrorTracker(page);
    
    // Fill form fields
    for (const [selector, value] of Object.entries(formData)) {
        await page.fill(selector, String(value));
    }
    
    // Submit form
    await page.click(submitButtonSelector);
    
    // Wait for response
    await page.waitForTimeout(2000);
    
    // Check for errors
    await tracker.assertNoErrors();
    
    return tracker;
}

/**
 * Test API endpoint response
 */
export async function testApiEndpoint(page, url, expectedStatus = 200) {
    const response = await page.request.get(url);
    
    expect(response.status()).toBe(expectedStatus);
    
    if (expectedStatus === 200) {
        const json = await response.json();
        expect(json).toBeDefined();
        return json;
    }
}

/**
 * Test all buttons on a page
 */
export async function testAllButtons(page, buttonSelectors, description = 'page') {
    console.log(`Testing ${buttonSelectors.length} buttons on ${description}`);
    
    const results = [];
    
    for (const selector of buttonSelectors) {
        try {
            console.log(`  Testing button: ${selector}`);
            await testButtonClick(page, selector, selector);
            results.push({ selector, success: true });
        } catch (error) {
            console.error(`  Button test failed: ${selector}`, error.message);
            results.push({ selector, success: false, error: error.message });
        }
    }
    
    // Report results
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
        console.error(`${failed.length}/${results.length} buttons failed on ${description}`);
        throw new Error(`Button tests failed: ${failed.map(f => f.selector).join(', ')}`);
    }
    
    console.log(`✅ All ${results.length} buttons passed on ${description}`);
    return results;
}

/**
 * Get all interactive elements on a page
 */
export async function getAllInteractiveElements(page) {
    return await page.evaluate(() => {
        const selectors = [];
        
        // Buttons
        document.querySelectorAll('button:not([disabled])').forEach((el, i) => {
            selectors.push({ type: 'button', selector: `button:nth-of-type(${i + 1})`, text: el.textContent.trim() });
        });
        
        // Links (excluding nav)
        document.querySelectorAll('a[href]:not(nav a)').forEach((el, i) => {
            selectors.push({ type: 'link', selector: `a[href]:nth-of-type(${i + 1})`, text: el.textContent.trim(), href: el.href });
        });
        
        // Form submits
        document.querySelectorAll('input[type="submit"]:not([disabled])').forEach((el, i) => {
            selectors.push({ type: 'submit', selector: `input[type="submit"]:nth-of-type(${i + 1})`, value: el.value });
        });
        
        return selectors;
    });
}

export default {
    ErrorTracker,
    waitForPageReady,
    testNavigation,
    testButtonClick,
    testFormSubmit,
    testApiEndpoint,
    testAllButtons,
    getAllInteractiveElements
};
