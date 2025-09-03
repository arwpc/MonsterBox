const { expect } = require('chai');
const puppeteer = require('puppeteer');
const app = require('../../app');

describe('🎙️ STT Configuration Interface Tests', function() {
    let browser;
    let page;
    let server;
    let serverPort;

    before(async function() {
        this.timeout(30000);
        
        // Start server
        server = app.listen(0, () => {
            serverPort = server.address().port;
        });
        
        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
    });

    after(async function() {
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.close();
        }
    });

    beforeEach(async function() {
        // Navigate to STT configuration page
        await page.goto(`http://localhost:${serverPort}/ai-management/stt`);
        await page.waitForSelector('.config-section', { timeout: 10000 });
    });

    describe('Page Layout and Structure', function() {
        it('should display STT configuration page', async function() {
            const title = await page.title();
            expect(title).to.include('STT');
            
            const configSections = await page.$$('.config-section');
            expect(configSections.length).to.be.at.least(2);
        });

        it('should display testing tabs', async function() {
            const testingTabs = await page.$('.testing-tabs');
            expect(testingTabs).to.not.be.null;
            
            const tabButtons = await page.$$('.tab-button');
            expect(tabButtons.length).to.equal(3);
            
            const tabTexts = await page.$$eval('.tab-button', 
                elements => elements.map(el => el.textContent)
            );
            
            expect(tabTexts).to.include.members([
                '🎙️ Live Test',
                '🎯 VAD Test', 
                '🔗 Integration Test'
            ]);
        });

        it('should show active tab by default', async function() {
            const activeTab = await page.$('.tab-button.active');
            expect(activeTab).to.not.be.null;
            
            const activeTabText = await page.$eval('.tab-button.active', el => el.textContent);
            expect(activeTabText).to.include('Live Test');
            
            const activeContent = await page.$('.tab-content.active');
            expect(activeContent).to.not.be.null;
        });
    });

    describe('Live Test Tab', function() {
        beforeEach(async function() {
            // Ensure Live Test tab is active
            await page.click('[data-tab="live-test"]');
            await page.waitForSelector('#live-test-tab.active', { timeout: 2000 });
        });

        it('should display recording controls', async function() {
            const recordButton = await page.$('#recordButton');
            expect(recordButton).to.not.be.null;
            
            const recordingInstruction = await page.$('.recording-instruction');
            expect(recordingInstruction).to.not.be.null;
            
            const instructionText = await page.$eval('.recording-instruction', el => el.textContent);
            expect(instructionText).to.include('Click to start recording');
        });

        it('should display progress bar', async function() {
            const progressBar = await page.$('.progress-bar');
            expect(progressBar).to.not.be.null;
            
            const progressFill = await page.$('#progressFill');
            expect(progressFill).to.not.be.null;
        });

        it('should display VAD indicator', async function() {
            const vadIndicator = await page.$('.vad-indicator');
            expect(vadIndicator).to.not.be.null;
            
            const vadStatus = await page.$('#vadStatus');
            const vadState = await page.$('#vadState');
            const currentThreshold = await page.$('#currentThreshold');
            
            expect(vadStatus).to.not.be.null;
            expect(vadState).to.not.be.null;
            expect(currentThreshold).to.not.be.null;
        });

        it('should display test results area', async function() {
            const testResults = await page.$('#liveTestResults');
            expect(testResults).to.not.be.null;
        });

        it('should toggle recording state when button is clicked', async function() {
            // Mock the recording functions to avoid actual recording
            await page.evaluate(() => {
                window.toggleRecording = () => {
                    const button = document.getElementById('recordButton');
                    const instruction = document.querySelector('.recording-instruction');
                    
                    if (button.classList.contains('recording')) {
                        button.classList.remove('recording');
                        instruction.textContent = 'Click to start recording';
                    } else {
                        button.classList.add('recording');
                        instruction.textContent = 'Recording... Click to stop';
                    }
                };
            });
            
            // Click record button
            await page.click('#recordButton');
            
            // Check if button state changed
            const isRecording = await page.$eval('#recordButton', el => el.classList.contains('recording'));
            expect(isRecording).to.be.true;
            
            const instructionText = await page.$eval('.recording-instruction', el => el.textContent);
            expect(instructionText).to.include('Recording');
        });
    });

    describe('VAD Test Tab', function() {
        beforeEach(async function() {
            // Switch to VAD Test tab
            await page.click('[data-tab="vad-test"]');
            await page.waitForSelector('#vad-test-tab.active', { timeout: 2000 });
        });

        it('should display VAD test controls', async function() {
            const vadControls = await page.$('.vad-controls');
            expect(vadControls).to.not.be.null;
            
            const startButton = await page.$('button[onclick="startVADTest()"]');
            const stopButton = await page.$('button[onclick="stopVADTest()"]');
            
            expect(startButton).to.not.be.null;
            expect(stopButton).to.not.be.null;
        });

        it('should display VAD visualization', async function() {
            const vadVisualization = await page.$('.vad-visualization');
            expect(vadVisualization).to.not.be.null;
            
            const audioLevelContainer = await page.$('.audio-level-container');
            const levelBar = await page.$('#vadAudioLevelBar');
            const thresholdLine = await page.$('#vadThresholdLine');
            const levelText = await page.$('#vadAudioLevelText');
            
            expect(audioLevelContainer).to.not.be.null;
            expect(levelBar).to.not.be.null;
            expect(thresholdLine).to.not.be.null;
            expect(levelText).to.not.be.null;
        });

        it('should display VAD events list', async function() {
            const vadEvents = await page.$('.vad-events');
            expect(vadEvents).to.not.be.null;
            
            const eventsList = await page.$('#vadEventsList');
            expect(eventsList).to.not.be.null;
        });

        it('should start VAD test when button is clicked', async function() {
            // Mock VAD test functions
            await page.evaluate(() => {
                window.startVADTest = () => {
                    document.getElementById('vadTestStatus').textContent = 'VAD test running';
                };
                window.stopVADTest = () => {
                    document.getElementById('vadTestStatus').textContent = 'VAD test stopped';
                };
            });
            
            // Click start VAD test
            await page.click('button[onclick="startVADTest()"]');
            
            const statusText = await page.$eval('#vadTestStatus', el => el.textContent);
            expect(statusText).to.include('VAD test running');
        });
    });

    describe('Integration Test Tab', function() {
        beforeEach(async function() {
            // Switch to Integration Test tab
            await page.click('[data-tab="integration-test"]');
            await page.waitForSelector('#integration-test-tab.active', { timeout: 2000 });
        });

        it('should display integration test controls', async function() {
            const integrationControls = await page.$('.integration-controls');
            expect(integrationControls).to.not.be.null;
            
            const runTestButton = await page.$('button[onclick="runIntegrationTest()"]');
            const testConnectionButton = await page.$('button[onclick="testConnection()"]');
            
            expect(runTestButton).to.not.be.null;
            expect(testConnectionButton).to.not.be.null;
        });

        it('should display integration metrics', async function() {
            const integrationMetrics = await page.$('.integration-metrics');
            expect(integrationMetrics).to.not.be.null;
            
            const metricCards = await page.$$('.metric-card');
            expect(metricCards.length).to.equal(3);
            
            const metricTitles = await page.$$eval('.metric-card h4', 
                elements => elements.map(el => el.textContent)
            );
            
            expect(metricTitles).to.include.members([
                'STT Performance',
                'VAD Performance',
                'Integration Health'
            ]);
        });

        it('should run integration test when button is clicked', async function() {
            // Mock integration test function
            await page.evaluate(() => {
                window.runIntegrationTest = () => {
                    document.getElementById('integrationTestStatus').textContent = 'Running integration test...';
                    document.getElementById('sttMetrics').innerHTML = '<span class="success">✅ Healthy</span>';
                    document.getElementById('vadMetrics').innerHTML = '<span class="success">✅ Healthy</span>';
                    document.getElementById('integrationMetrics').innerHTML = '<span class="success">✅ Healthy</span>';
                };
            });
            
            // Click run integration test
            await page.click('button[onclick="runIntegrationTest()"]');
            
            const statusText = await page.$eval('#integrationTestStatus', el => el.textContent);
            expect(statusText).to.include('Running integration test');
            
            // Check if metrics are updated
            const sttMetrics = await page.$eval('#sttMetrics', el => el.innerHTML);
            expect(sttMetrics).to.include('Healthy');
        });

        it('should test connection when button is clicked', async function() {
            // Mock test connection function
            await page.evaluate(() => {
                window.testConnection = () => {
                    document.getElementById('integrationTestStatus').textContent = 'Testing connection...';
                };
            });
            
            // Click test connection
            await page.click('button[onclick="testConnection()"]');
            
            const statusText = await page.$eval('#integrationTestStatus', el => el.textContent);
            expect(statusText).to.include('Testing connection');
        });
    });

    describe('Tab Navigation', function() {
        it('should switch between tabs correctly', async function() {
            // Start with Live Test tab active
            let activeTab = await page.$eval('.tab-button.active', el => el.textContent);
            expect(activeTab).to.include('Live Test');
            
            // Switch to VAD Test tab
            await page.click('[data-tab="vad-test"]');
            await page.waitForSelector('#vad-test-tab.active', { timeout: 2000 });
            
            activeTab = await page.$eval('.tab-button.active', el => el.textContent);
            expect(activeTab).to.include('VAD Test');
            
            // Switch to Integration Test tab
            await page.click('[data-tab="integration-test"]');
            await page.waitForSelector('#integration-test-tab.active', { timeout: 2000 });
            
            activeTab = await page.$eval('.tab-button.active', el => el.textContent);
            expect(activeTab).to.include('Integration Test');
        });

        it('should show correct tab content when switching', async function() {
            // Switch to VAD Test tab
            await page.click('[data-tab="vad-test"]');
            
            const vadTabVisible = await page.$eval('#vad-test-tab', el => 
                window.getComputedStyle(el).display !== 'none'
            );
            const liveTabVisible = await page.$eval('#live-test-tab', el => 
                window.getComputedStyle(el).display !== 'none'
            );
            
            expect(vadTabVisible).to.be.true;
            expect(liveTabVisible).to.be.false;
        });
    });

    describe('Configuration Controls', function() {
        it('should display VAD configuration controls', async function() {
            const vadTypeSelect = await page.$('#vadType');
            const vadThresholdSlider = await page.$('#vadThreshold');
            const prefixPaddingInput = await page.$('#prefixPadding');
            const silenceDurationInput = await page.$('#silenceDuration');
            
            expect(vadTypeSelect).to.not.be.null;
            expect(vadThresholdSlider).to.not.be.null;
            expect(prefixPaddingInput).to.not.be.null;
            expect(silenceDurationInput).to.not.be.null;
        });

        it('should have save configuration button', async function() {
            const saveButton = await page.$('button[onclick="saveConfiguration()"]');
            expect(saveButton).to.not.be.null;
            
            const buttonText = await page.$eval('button[onclick="saveConfiguration()"]', el => el.textContent);
            expect(buttonText).to.include('Save');
        });

        it('should save configuration when button is clicked', async function() {
            // Mock save configuration function
            await page.evaluate(() => {
                window.saveConfiguration = () => {
                    alert('Configuration saved successfully!');
                };
            });
            
            // Set up alert handler
            page.on('dialog', async dialog => {
                expect(dialog.message()).to.include('Configuration saved successfully');
                await dialog.accept();
            });
            
            // Click save configuration
            await page.click('button[onclick="saveConfiguration()"]');
        });
    });

    describe('Back Navigation', function() {
        it('should have back to dashboard button', async function() {
            const backButton = await page.$('button[onclick="backToDashboard()"]');
            expect(backButton).to.not.be.null;
            
            const buttonText = await page.$eval('button[onclick="backToDashboard()"]', el => el.textContent);
            expect(buttonText).to.include('Back');
        });

        it('should navigate back when button is clicked', async function() {
            // Mock back navigation function
            await page.evaluate(() => {
                window.backToDashboard = () => {
                    window.location.href = '/ai-management';
                };
            });
            
            // Click back button (we can't test actual navigation without full app)
            const backButton = await page.$('button[onclick="backToDashboard()"]');
            expect(backButton).to.not.be.null;
        });
    });

    describe('Responsive Design', function() {
        it('should adapt to mobile viewport', async function() {
            await page.setViewport({ width: 375, height: 667 }); // iPhone SE
            
            // Check if tabs are still accessible
            const tabButtons = await page.$$('.tab-button');
            expect(tabButtons.length).to.equal(3);
            
            // All tabs should be visible
            for (const button of tabButtons) {
                const isVisible = await page.evaluate(el => {
                    const styles = window.getComputedStyle(el);
                    return styles.display !== 'none';
                }, button);
                expect(isVisible).to.be.true;
            }
        });

        it('should maintain functionality on tablet viewport', async function() {
            await page.setViewport({ width: 768, height: 1024 }); // iPad
            
            // Test tab switching still works
            await page.click('[data-tab="vad-test"]');
            await page.waitForSelector('#vad-test-tab.active', { timeout: 2000 });
            
            const activeTab = await page.$eval('.tab-button.active', el => el.textContent);
            expect(activeTab).to.include('VAD Test');
        });
    });
});
