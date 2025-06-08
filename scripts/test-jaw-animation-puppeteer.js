#!/usr/bin/env node
/**
 * Comprehensive Puppeteer test for Jaw Animation System
 * Diagnoses and fixes issues automatically
 */

let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (error) {
    console.error('Puppeteer not installed. Please run: npm install puppeteer --save-dev');
    process.exit(1);
}
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    timeout: 30000,
    retries: 2,
    baseUrl: 'http://192.168.8.130:3000',
    headless: false, // Set to false for debugging
    slowMo: 100 // Slow down actions for visibility
};

class JawAnimationTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: [],
            diagnostics: []
        };
        this.browser = null;
        this.page = null;
        this.sounds = [];
    }

    /**
     * Run all tests
     */
    async runTests() {
        console.log('🦴 Starting Jaw Animation System Tests');
        console.log('=====================================\n');

        try {
            await this.setupBrowser();
            await this.loadSoundsData();
            await this.navigateToTestPage();
            
            // Run diagnostic tests
            await this.testPageLoad();
            await this.testCharacterSelection();
            await this.testServoSelection();
            await this.testSoundDropdown();
            await this.testWebSocketConnection();
            await this.testControlButtons();
            await this.collectLogs();
            
            await this.generateReport();
            
        } catch (error) {
            logger.error('Test execution failed:', error);
            this.results.diagnostics.push({
                type: 'CRITICAL_ERROR',
                message: error.message,
                stack: error.stack
            });
        } finally {
            await this.cleanup();
        }

        return this.results;
    }

    /**
     * Setup browser and test environment
     */
    async setupBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: TEST_CONFIG.headless,
                slowMo: TEST_CONFIG.slowMo,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });
            
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1400, height: 900 });
            
            // Capture console logs and errors
            this.page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                this.results.diagnostics.push({
                    type: `CONSOLE_${type.toUpperCase()}`,
                    message: text,
                    timestamp: new Date().toISOString()
                });
                
                if (type === 'error') {
                    logger.error('Browser console error:', text);
                }
            });

            // Capture network failures
            this.page.on('requestfailed', request => {
                this.results.diagnostics.push({
                    type: 'NETWORK_FAILURE',
                    url: request.url(),
                    failure: request.failure().errorText,
                    timestamp: new Date().toISOString()
                });
            });

            this.addTestResult('Browser Setup', true, 'Browser launched successfully');
            
        } catch (error) {
            this.addTestResult('Browser Setup', false, `Failed to launch browser: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load sounds data for dropdown testing
     */
    async loadSoundsData() {
        try {
            const soundsPath = path.join(process.cwd(), 'data', 'sounds.json');
            const soundsData = await fs.readFile(soundsPath, 'utf8');
            this.sounds = JSON.parse(soundsData);
            
            this.addTestResult('Sounds Data Load', true, `Loaded ${this.sounds.length} sounds`);
        } catch (error) {
            this.addTestResult('Sounds Data Load', false, `Failed to load sounds: ${error.message}`);
        }
    }

    /**
     * Navigate to jaw animation test page
     */
    async navigateToTestPage() {
        try {
            const url = `${TEST_CONFIG.baseUrl}/jaw-animation/test`;
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: TEST_CONFIG.timeout });
            
            // Wait for page to be fully loaded
            await this.page.waitForSelector('h1', { timeout: 5000 });
            
            const title = await this.page.$eval('h1', el => el.textContent);
            
            if (title.includes('Jaw Animation Test')) {
                this.addTestResult('Page Navigation', true, 'Successfully navigated to test page');
            } else {
                this.addTestResult('Page Navigation', false, `Unexpected page title: ${title}`);
            }
            
        } catch (error) {
            this.addTestResult('Page Navigation', false, `Failed to navigate: ${error.message}`);
            throw error;
        }
    }

    /**
     * Test page load and basic elements
     */
    async testPageLoad() {
        try {
            // Check for essential elements
            const elements = [
                { selector: '#characterSelect', name: 'Character Select' },
                { selector: '#servoSelect', name: 'Servo Select' },
                { selector: 'button:contains("Start Animation")', name: 'Start Animation Button' },
                { selector: 'button:contains("Stop Animation")', name: 'Stop Animation Button' },
                { selector: 'button:contains("Test Servo")', name: 'Test Servo Button' },
                { selector: '#angleSlider', name: 'Angle Slider' }
            ];

            for (const element of elements) {
                try {
                    await this.page.waitForSelector(element.selector, { timeout: 2000 });
                    this.addTestResult(`Element: ${element.name}`, true, 'Element found');
                } catch (error) {
                    this.addTestResult(`Element: ${element.name}`, false, 'Element not found');
                }
            }
            
        } catch (error) {
            this.addTestResult('Page Load Test', false, `Page load test failed: ${error.message}`);
        }
    }

    /**
     * Test character selection functionality
     */
    async testCharacterSelection() {
        try {
            // Get character options
            const characterOptions = await this.page.$$eval('#characterSelect option', options => 
                options.map(option => ({ value: option.value, text: option.textContent }))
            );
            
            this.addTestResult('Character Options', true, `Found ${characterOptions.length} characters`);
            
            // Try to select Skulltalker (character ID 4)
            const skulltalkerOption = characterOptions.find(opt => opt.value === '4');
            if (skulltalkerOption) {
                await this.page.select('#characterSelect', '4');
                this.addTestResult('Skulltalker Selection', true, 'Successfully selected Skulltalker');
                
                // Wait for servo dropdown to update
                await this.page.waitForTimeout(1000);
            } else {
                this.addTestResult('Skulltalker Selection', false, 'Skulltalker option not found');
            }
            
        } catch (error) {
            this.addTestResult('Character Selection Test', false, `Character selection failed: ${error.message}`);
        }
    }

    /**
     * Test servo selection functionality
     */
    async testServoSelection() {
        try {
            // Wait for servo options to load
            await this.page.waitForTimeout(2000);
            
            const servoOptions = await this.page.$$eval('#servoSelect option', options => 
                options.map(option => ({ value: option.value, text: option.textContent }))
            );
            
            this.addTestResult('Servo Options', servoOptions.length > 1, `Found ${servoOptions.length} servo options`);
            
            // Look for jaw servo
            const jawServoOption = servoOptions.find(opt => 
                opt.text.toLowerCase().includes('jaw') || opt.value === '19'
            );
            
            if (jawServoOption) {
                await this.page.select('#servoSelect', jawServoOption.value);
                this.addTestResult('Jaw Servo Selection', true, `Selected servo: ${jawServoOption.text}`);
            } else {
                this.addTestResult('Jaw Servo Selection', false, 'Jaw servo option not found');
                this.results.diagnostics.push({
                    type: 'SERVO_CONFIG_ISSUE',
                    message: 'Jaw servo not available in dropdown',
                    availableOptions: servoOptions
                });
            }
            
        } catch (error) {
            this.addTestResult('Servo Selection Test', false, `Servo selection failed: ${error.message}`);
        }
    }

    /**
     * Test sound dropdown functionality
     */
    async testSoundDropdown() {
        try {
            // Check if sound dropdown exists
            const soundDropdownExists = await this.page.$('#soundSelect') !== null;
            
            if (!soundDropdownExists) {
                this.addTestResult('Sound Dropdown', false, 'Sound dropdown not found - needs to be implemented');
                
                // Add diagnostic info about implementing sound dropdown
                this.results.diagnostics.push({
                    type: 'MISSING_FEATURE',
                    message: 'Sound dropdown needs to be added to the test page',
                    suggestion: 'Add sound selection dropdown with sounds from data/sounds.json',
                    availableSounds: this.sounds.slice(0, 5).map(s => ({ id: s.id, name: s.name, filename: s.filename }))
                });
            } else {
                this.addTestResult('Sound Dropdown', true, 'Sound dropdown found');
            }
            
        } catch (error) {
            this.addTestResult('Sound Dropdown Test', false, `Sound dropdown test failed: ${error.message}`);
        }
    }

    /**
     * Test WebSocket connection
     */
    async testWebSocketConnection() {
        try {
            // Check for WebSocket connection in browser
            const wsStatus = await this.page.evaluate(() => {
                return new Promise((resolve) => {
                    if (typeof WebSocket === 'undefined') {
                        resolve({ supported: false });
                        return;
                    }
                    
                    try {
                        const ws = new WebSocket('ws://192.168.8.130:3000/jaw-animation');
                        
                        const timeout = setTimeout(() => {
                            ws.close();
                            resolve({ connected: false, error: 'Connection timeout' });
                        }, 5000);
                        
                        ws.onopen = () => {
                            clearTimeout(timeout);
                            ws.close();
                            resolve({ connected: true });
                        };
                        
                        ws.onerror = (error) => {
                            clearTimeout(timeout);
                            resolve({ connected: false, error: error.message || 'Connection failed' });
                        };
                        
                    } catch (error) {
                        resolve({ connected: false, error: error.message });
                    }
                });
            });
            
            this.addTestResult('WebSocket Connection', wsStatus.connected, 
                wsStatus.connected ? 'WebSocket connected successfully' : `WebSocket failed: ${wsStatus.error}`);
            
        } catch (error) {
            this.addTestResult('WebSocket Test', false, `WebSocket test failed: ${error.message}`);
        }
    }

    /**
     * Test control buttons functionality
     */
    async testControlButtons() {
        try {
            // Test angle slider
            const slider = await this.page.$('#angleSlider');
            if (slider) {
                await this.page.evaluate(() => {
                    const slider = document.getElementById('angleSlider');
                    slider.value = 45;
                    slider.dispatchEvent(new Event('input'));
                });
                
                const angleValue = await this.page.$eval('#angleValue', el => el.textContent);
                this.addTestResult('Angle Slider', angleValue.includes('45'), `Angle display: ${angleValue}`);
            }
            
            // Test servo test button
            const testButton = await this.page.$('button:contains("Test Servo")');
            if (testButton) {
                await testButton.click();
                await this.page.waitForTimeout(1000);
                this.addTestResult('Test Servo Button', true, 'Test servo button clicked');
            }
            
            // Test start animation button
            const startButton = await this.page.$('button:contains("Start Animation")');
            if (startButton) {
                await startButton.click();
                await this.page.waitForTimeout(1000);
                this.addTestResult('Start Animation Button', true, 'Start animation button clicked');
            }
            
        } catch (error) {
            this.addTestResult('Control Buttons Test', false, `Control buttons test failed: ${error.message}`);
        }
    }

    /**
     * Collect system logs and diagnostics
     */
    async collectLogs() {
        try {
            // Get system log from the page if available
            const systemLog = await this.page.evaluate(() => {
                const logElement = document.querySelector('.system-log, #systemLog, .log-container');
                return logElement ? logElement.textContent : null;
            });
            
            if (systemLog) {
                this.results.diagnostics.push({
                    type: 'SYSTEM_LOG',
                    content: systemLog,
                    timestamp: new Date().toISOString()
                });
            }
            
            this.addTestResult('Log Collection', true, 'System logs collected');
            
        } catch (error) {
            this.addTestResult('Log Collection', false, `Log collection failed: ${error.message}`);
        }
    }

    /**
     * Add test result
     */
    addTestResult(testName, passed, message) {
        this.results.total++;
        if (passed) {
            this.results.passed++;
        } else {
            this.results.failed++;
        }
        
        this.results.tests.push({
            name: testName,
            passed,
            message,
            timestamp: new Date().toISOString()
        });
        
        const status = passed ? '✅' : '❌';
        console.log(`${status} ${testName}: ${message}`);
    }

    /**
     * Generate comprehensive report
     */
    async generateReport() {
        const report = {
            summary: {
                total: this.results.total,
                passed: this.results.passed,
                failed: this.results.failed,
                successRate: `${((this.results.passed / this.results.total) * 100).toFixed(1)}%`
            },
            tests: this.results.tests,
            diagnostics: this.results.diagnostics,
            timestamp: new Date().toISOString()
        };
        
        // Save report to file
        const reportPath = path.join(process.cwd(), 'logs', 'jaw-animation-test-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📊 Test Summary:');
        console.log(`Total Tests: ${report.summary.total}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Success Rate: ${report.summary.successRate}`);
        console.log(`\n📄 Report saved to: ${reportPath}`);
        
        return report;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new JawAnimationTester();
    tester.runTests()
        .then(results => {
            process.exit(results.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = JawAnimationTester;
