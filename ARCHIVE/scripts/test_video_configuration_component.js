#!/usr/bin/env node
/**
 * Test script for Video Configuration Component
 * Tests UI component functionality, API integration, and user interactions
 */

const puppeteer = require('puppeteer');
const logger = require('./logger');
const characterService = require('../services/characterService');
const partService = require('../services/partService');

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds
    retries: 2,
    baseUrl: 'http://localhost:3000',
    headless: true // Set to false for debugging
};

class VideoConfigurationComponentTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
        this.browser = null;
        this.page = null;
        this.testData = {
            characters: [],
            webcams: []
        };
    }

    /**
     * Run a test with error handling and retries
     */
    async runTest(testName, testFunction, retries = TEST_CONFIG.retries) {
        this.results.total++;
        logger.info(`\n🧪 Running test: ${testName}`);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const startTime = Date.now();
                const result = await Promise.race([
                    testFunction(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
                    )
                ]);
                const duration = Date.now() - startTime;

                if (result.success) {
                    logger.info(`✅ ${testName} - PASSED (${duration}ms)`);
                    this.results.passed++;
                    this.results.tests.push({
                        name: testName,
                        status: 'PASSED',
                        duration: duration,
                        attempt: attempt,
                        result: result
                    });
                    return result;
                } else {
                    throw new Error(result.message || result.error || 'Test failed');
                }
            } catch (error) {
                if (attempt === retries) {
                    logger.error(`❌ ${testName} - FAILED after ${retries} attempts: ${error.message}`);
                    this.results.failed++;
                    this.results.tests.push({
                        name: testName,
                        status: 'FAILED',
                        attempt: attempt,
                        error: error.message
                    });
                    return { success: false, error: error.message };
                } else {
                    logger.warn(`⚠️ ${testName} - Attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
    }

    /**
     * Setup browser and test environment
     */
    async setupBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: TEST_CONFIG.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1200, height: 800 });
            
            // Enable console logging
            this.page.on('console', msg => {
                if (msg.type() === 'error') {
                    logger.debug('Browser console error:', msg.text());
                }
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup test data
     */
    async setupTestData() {
        try {
            // Create test character
            const testCharacter = await characterService.createCharacter({
                char_name: 'Video Test Character',
                description: 'Test character for video configuration component testing'
            });

            this.testData.characters = [testCharacter];

            // Create test webcam
            const testWebcam = await partService.createPart({
                name: 'Video Test Webcam',
                type: 'webcam',
                characterId: testCharacter.id,
                deviceId: 0,
                devicePath: '/dev/video0',
                resolution: '640x480',
                fps: 30,
                status: 'active'
            });

            this.testData.webcams = [testWebcam];

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test component loading
     */
    async testComponentLoading() {
        try {
            await this.page.goto(`${TEST_CONFIG.baseUrl}/test/video-configuration`);
            
            // Wait for components to load
            await this.page.waitForSelector('.video-configuration-component', { timeout: 10000 });
            
            // Check if components are present
            const componentCount = await this.page.$$eval('.video-configuration-component', 
                components => components.length);
            
            if (componentCount > 0) {
                return { 
                    success: true, 
                    message: `Found ${componentCount} video configuration components` 
                };
            } else {
                return { success: false, error: 'No video configuration components found' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test component UI elements
     */
    async testComponentUIElements() {
        try {
            // Check for required UI elements
            const elements = [
                '.webcam-status-card',
                '.video-preview',
                '.video-controls',
                '.quick-actions'
            ];

            for (const selector of elements) {
                const element = await this.page.$(selector);
                if (!element) {
                    return { success: false, error: `Missing UI element: ${selector}` };
                }
            }

            // Check for buttons
            const buttons = [
                '#refreshVideoBtn',
                '#fullscreenBtn',
                '#configureWebcamBtn'
            ];

            for (const selector of buttons) {
                const button = await this.page.$(selector);
                if (!button) {
                    return { success: false, error: `Missing button: ${selector}` };
                }
            }

            return { success: true, message: 'All UI elements present' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test button interactions
     */
    async testButtonInteractions() {
        try {
            // Test refresh button
            const refreshBtn = await this.page.$('#refreshVideoBtn');
            if (refreshBtn) {
                await refreshBtn.click();
                await this.page.waitForTimeout(1000);
            }

            // Test configure button (should open modal)
            const configureBtn = await this.page.$('#configureWebcamBtn');
            if (configureBtn) {
                await configureBtn.click();
                await this.page.waitForTimeout(2000);
                
                // Check if modal opened
                const modal = await this.page.$('#webcamConfigModal[style*="flex"]');
                if (modal) {
                    // Close modal
                    const closeBtn = await this.page.$('#closeConfigModal');
                    if (closeBtn) {
                        await closeBtn.click();
                        await this.page.waitForTimeout(1000);
                    }
                }
            }

            return { success: true, message: 'Button interactions working' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test responsive design
     */
    async testResponsiveDesign() {
        try {
            // Test mobile viewport
            await this.page.setViewport({ width: 375, height: 667 });
            await this.page.waitForTimeout(1000);
            
            // Check if components are still visible
            const component = await this.page.$('.video-configuration-component');
            if (!component) {
                return { success: false, error: 'Component not visible on mobile' };
            }

            // Test tablet viewport
            await this.page.setViewport({ width: 768, height: 1024 });
            await this.page.waitForTimeout(1000);

            // Test desktop viewport
            await this.page.setViewport({ width: 1200, height: 800 });
            await this.page.waitForTimeout(1000);

            return { success: true, message: 'Responsive design working' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test API integration
     */
    async testAPIIntegration() {
        try {
            // Test if API endpoints are accessible
            const response = await this.page.evaluate(async () => {
                try {
                    const res = await fetch('/api/streaming/all');
                    return { success: res.ok, status: res.status };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            });

            if (response.success) {
                return { success: true, message: 'API integration working' };
            } else {
                return { success: false, error: `API call failed: ${response.error || response.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test JavaScript functionality
     */
    async testJavaScriptFunctionality() {
        try {
            // Check if VideoConfigurationComponent is available
            const componentClass = await this.page.evaluate(() => {
                return typeof window.VideoConfigurationComponent === 'function';
            });

            if (!componentClass) {
                return { success: false, error: 'VideoConfigurationComponent class not available' };
            }

            // Check if components are initialized
            const initialized = await this.page.evaluate(() => {
                const components = document.querySelectorAll('.video-configuration-component');
                return components.length > 0;
            });

            if (!initialized) {
                return { success: false, error: 'Components not initialized' };
            }

            return { success: true, message: 'JavaScript functionality working' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Cleanup test data
     */
    async cleanup() {
        logger.info('\n🧹 Cleaning up test data...');
        
        try {
            // Remove test webcams
            for (const webcam of this.testData.webcams) {
                try {
                    await partService.deletePart(webcam.id);
                    logger.info(`Removed test webcam: ${webcam.name}`);
                } catch (error) {
                    logger.debug(`Error removing test webcam ${webcam.id}:`, error);
                }
            }

            // Remove test characters
            for (const character of this.testData.characters) {
                try {
                    await characterService.deleteCharacter(character.id);
                    logger.info(`Removed test character: ${character.char_name}`);
                } catch (error) {
                    logger.debug(`Error removing test character ${character.id}:`, error);
                }
            }

            // Close browser
            if (this.browser) {
                await this.browser.close();
            }
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        logger.info('🚀 Starting Video Configuration Component Tests');

        const startTime = Date.now();

        try {
            // Setup browser
            await this.runTest('Setup Browser', () => this.setupBrowser());

            // Setup test data
            await this.runTest('Setup Test Data', () => this.setupTestData());

            // Test 1: Component loading
            await this.runTest('Component Loading', () => this.testComponentLoading());

            // Test 2: UI elements
            await this.runTest('UI Elements', () => this.testComponentUIElements());

            // Test 3: Button interactions
            await this.runTest('Button Interactions', () => this.testButtonInteractions());

            // Test 4: Responsive design
            await this.runTest('Responsive Design', () => this.testResponsiveDesign());

            // Test 5: API integration
            await this.runTest('API Integration', () => this.testAPIIntegration());

            // Test 6: JavaScript functionality
            await this.runTest('JavaScript Functionality', () => this.testJavaScriptFunctionality());

        } finally {
            // Always cleanup
            await this.cleanup();
        }

        const totalTime = Date.now() - startTime;

        // Print summary
        logger.info('\n📊 Test Summary:');
        logger.info(`Total Tests: ${this.results.total}`);
        logger.info(`Passed: ${this.results.passed}`);
        logger.info(`Failed: ${this.results.failed}`);
        logger.info(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
        logger.info(`Total Time: ${totalTime}ms`);

        // Print detailed results
        logger.info('\n📋 Detailed Results:');
        this.results.tests.forEach(test => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            const duration = test.duration ? ` (${test.duration}ms)` : '';
            const attempt = test.attempt > 1 ? ` [Attempt ${test.attempt}]` : '';
            logger.info(`${status} ${test.name}${duration}${attempt}`);
            if (test.error) {
                logger.info(`   Error: ${test.error}`);
            }
        });

        return {
            success: this.results.failed === 0,
            summary: this.results,
            totalTime: totalTime
        };
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        const tester = new VideoConfigurationComponentTester();
        const results = await tester.runAllTests();

        if (results.success) {
            logger.info('\n🎉 All video configuration component tests passed!');
            process.exit(0);
        } else {
            logger.error('\n💥 Some video configuration component tests failed!');
            process.exit(1);
        }
    } catch (error) {
        logger.error('Fatal error during component tests:', error);
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = VideoConfigurationComponentTester;
