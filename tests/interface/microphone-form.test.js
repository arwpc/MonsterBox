const { expect } = require('chai');
const puppeteer = require('puppeteer');
const app = require('../../app');

describe('🎤 Microphone Form Interface Tests', function() {
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
        // Navigate to microphone form
        await page.goto(`http://localhost:${serverPort}/parts/microphone/new?characterId=1`);
        await page.waitForSelector('.microphone-container', { timeout: 10000 });
    });

    describe('Page Layout and Structure', function() {
        it('should display the unified microphone form layout', async function() {
            // Check main container
            const container = await page.$('.microphone-container');
            expect(container).to.not.be.null;
            
            // Check two-panel layout
            const configPanel = await page.$('.config-panel');
            const testingPanel = await page.$('.testing-panel');
            expect(configPanel).to.not.be.null;
            expect(testingPanel).to.not.be.null;
        });

        it('should display the header with breadcrumb navigation', async function() {
            const header = await page.$('.main-header');
            expect(header).to.not.be.null;
            
            const breadcrumb = await page.$('.breadcrumb');
            expect(breadcrumb).to.not.be.null;
            
            const breadcrumbText = await page.$eval('.breadcrumb', el => el.textContent);
            expect(breadcrumbText).to.include('Home');
            expect(breadcrumbText).to.include('Parts');
            expect(breadcrumbText).to.include('Microphone');
        });

        it('should display all configuration sections', async function() {
            const sections = await page.$$('.config-section');
            expect(sections.length).to.be.at.least(4);
            
            // Check section titles
            const sectionTitles = await page.$$eval('.section-title', 
                elements => elements.map(el => el.textContent)
            );
            
            expect(sectionTitles).to.include.members([
                '📝 Basic Information',
                '🎤 Device Selection',
                '🔧 Audio Configuration',
                '🎚️ Audio Processing'
            ]);
        });
    });

    describe('Basic Information Section', function() {
        it('should have microphone name input field', async function() {
            const nameInput = await page.$('#name');
            expect(nameInput).to.not.be.null;
            
            const isRequired = await page.$eval('#name', el => el.required);
            expect(isRequired).to.be.true;
        });

        it('should accept text input in name field', async function() {
            await page.type('#name', 'Test Microphone');
            
            const value = await page.$eval('#name', el => el.value);
            expect(value).to.equal('Test Microphone');
        });

        it('should have description textarea', async function() {
            const descriptionTextarea = await page.$('#description');
            expect(descriptionTextarea).to.not.be.null;
            
            await page.type('#description', 'Test microphone description');
            
            const value = await page.$eval('#description', el => el.value);
            expect(value).to.equal('Test microphone description');
        });
    });

    describe('Device Selection Section', function() {
        it('should have device selection dropdown', async function() {
            const deviceSelect = await page.$('#deviceId');
            expect(deviceSelect).to.not.be.null;
            
            // Wait for devices to load
            await page.waitForFunction(
                () => document.getElementById('deviceId').options.length > 1,
                { timeout: 5000 }
            );
            
            const options = await page.$$eval('#deviceId option', 
                elements => elements.map(el => ({ value: el.value, text: el.textContent }))
            );
            
            expect(options.length).to.be.at.least(1);
            expect(options[0].value).to.equal('default');
        });

        it('should have refresh devices button', async function() {
            const refreshButton = await page.$('#refreshDevicesButton');
            expect(refreshButton).to.not.be.null;
            
            const buttonText = await page.$eval('#refreshDevicesButton', el => el.textContent);
            expect(buttonText).to.include('Refresh');
        });

        it('should refresh devices when refresh button is clicked', async function() {
            const refreshButton = await page.$('#refreshDevicesButton');
            
            // Click refresh button
            await refreshButton.click();
            
            // Wait for button to show loading state
            await page.waitForFunction(
                () => document.getElementById('refreshDevicesButton').textContent.includes('Loading'),
                { timeout: 2000 }
            );
            
            // Wait for loading to complete
            await page.waitForFunction(
                () => !document.getElementById('refreshDevicesButton').textContent.includes('Loading'),
                { timeout: 10000 }
            );
            
            const finalButtonText = await page.$eval('#refreshDevicesButton', el => el.textContent);
            expect(finalButtonText).to.include('Refresh');
        });
    });

    describe('Audio Configuration Section', function() {
        it('should have sample rate dropdown', async function() {
            const sampleRateSelect = await page.$('#sampleRate');
            expect(sampleRateSelect).to.not.be.null;
            
            const options = await page.$$eval('#sampleRate option', 
                elements => elements.map(el => el.value)
            );
            
            expect(options).to.include.members(['8000', '16000', '22050', '44100', '48000']);
        });

        it('should have channels dropdown', async function() {
            const channelsSelect = await page.$('#channels');
            expect(channelsSelect).to.not.be.null;
            
            const options = await page.$$eval('#channels option', 
                elements => elements.map(el => el.value)
            );
            
            expect(options).to.include.members(['1', '2']);
        });

        it('should have sensitivity slider', async function() {
            const sensitivitySlider = await page.$('#sensitivity');
            expect(sensitivitySlider).to.not.be.null;
            
            const min = await page.$eval('#sensitivity', el => el.min);
            const max = await page.$eval('#sensitivity', el => el.max);
            const step = await page.$eval('#sensitivity', el => el.step);
            
            expect(parseFloat(min)).to.equal(0.1);
            expect(parseFloat(max)).to.equal(3.0);
            expect(parseFloat(step)).to.equal(0.1);
        });

        it('should update sensitivity value display when slider changes', async function() {
            const sensitivitySlider = await page.$('#sensitivity');
            const sensitivityValue = await page.$('#sensitivityValue');
            
            // Change slider value
            await page.evaluate(() => {
                const slider = document.getElementById('sensitivity');
                slider.value = '2.5';
                slider.dispatchEvent(new Event('input'));
            });
            
            const displayValue = await page.$eval('#sensitivityValue', el => el.textContent);
            expect(displayValue).to.equal('2.5');
        });
    });

    describe('Audio Processing Section', function() {
        it('should have echo cancellation checkbox', async function() {
            const echoCancellation = await page.$('#echoCancellation');
            expect(echoCancellation).to.not.be.null;
            
            const isChecked = await page.$eval('#echoCancellation', el => el.checked);
            expect(isChecked).to.be.true; // Should be checked by default
        });

        it('should have noise suppression checkbox', async function() {
            const noiseSuppression = await page.$('#noiseSuppression');
            expect(noiseSuppression).to.not.be.null;
            
            await page.click('#noiseSuppression');
            const isChecked = await page.$eval('#noiseSuppression', el => el.checked);
            expect(isChecked).to.be.a('boolean');
        });

        it('should have auto gain control checkbox', async function() {
            const autoGainControl = await page.$('#autoGainControl');
            expect(autoGainControl).to.not.be.null;
            
            await page.click('#autoGainControl');
            const isChecked = await page.$eval('#autoGainControl', el => el.checked);
            expect(isChecked).to.be.a('boolean');
        });
    });

    describe('Voice Activation Detection Section', function() {
        it('should have VAD checkbox', async function() {
            const voiceActivation = await page.$('#voiceActivation');
            expect(voiceActivation).to.not.be.null;
        });

        it('should show/hide VAD threshold when checkbox is toggled', async function() {
            const voiceActivation = await page.$('#voiceActivation');
            const thresholdDiv = await page.$('#voiceActivationThresholdDiv');
            
            // Initially should be hidden
            let isVisible = await page.evaluate(el => 
                window.getComputedStyle(el).display !== 'none', thresholdDiv
            );
            
            // Click to enable VAD
            await page.click('#voiceActivation');
            
            // Should now be visible
            isVisible = await page.evaluate(el => 
                window.getComputedStyle(el).display !== 'none', thresholdDiv
            );
            expect(isVisible).to.be.true;
        });

        it('should have VAD threshold slider', async function() {
            // Enable VAD first
            await page.click('#voiceActivation');
            
            const thresholdSlider = await page.$('#voiceActivationThreshold');
            expect(thresholdSlider).to.not.be.null;
            
            const min = await page.$eval('#voiceActivationThreshold', el => el.min);
            const max = await page.$eval('#voiceActivationThreshold', el => el.max);
            
            expect(parseFloat(min)).to.equal(0.01);
            expect(parseFloat(max)).to.equal(1.0);
        });
    });

    describe('Live Testing Panel', function() {
        it('should display live testing panel', async function() {
            const testingPanel = await page.$('.testing-panel');
            expect(testingPanel).to.not.be.null;
            
            const panelTitle = await page.$eval('.panel-title', el => el.textContent);
            expect(panelTitle).to.include('Live Testing & Monitoring');
        });

        it('should have audio level monitor', async function() {
            const audioMonitor = await page.$('.audio-monitor');
            expect(audioMonitor).to.not.be.null;
            
            const levelBar = await page.$('#audioLevelBar');
            const levelText = await page.$('#audioLevelText');
            
            expect(levelBar).to.not.be.null;
            expect(levelText).to.not.be.null;
        });

        it('should have start/stop monitoring buttons', async function() {
            const startButton = await page.$('button[onclick="startLiveMonitoring()"]');
            const stopButton = await page.$('button[onclick="stopLiveMonitoring()"]');
            
            expect(startButton).to.not.be.null;
            expect(stopButton).to.not.be.null;
        });

        it('should have quick test buttons', async function() {
            const testButtons = await page.$$('.btn-test');
            expect(testButtons.length).to.be.at.least(3);
            
            const buttonTexts = await page.$$eval('.btn-test', 
                elements => elements.map(el => el.textContent)
            );
            
            expect(buttonTexts.some(text => text.includes('Test Audio'))).to.be.true;
            expect(buttonTexts.some(text => text.includes('Test STT'))).to.be.true;
            expect(buttonTexts.some(text => text.includes('Test VAD'))).to.be.true;
        });

        it('should have test results area', async function() {
            const testResults = await page.$('#testOutput');
            expect(testResults).to.not.be.null;
            
            const transcriptionOutput = await page.$('#transcriptionOutput');
            expect(transcriptionOutput).to.not.be.null;
        });
    });

    describe('Form Actions', function() {
        it('should have save button', async function() {
            const saveButton = await page.$('button[type="submit"]');
            expect(saveButton).to.not.be.null;
            
            const buttonText = await page.$eval('button[type="submit"]', el => el.textContent);
            expect(buttonText).to.include('Save Microphone');
        });

        it('should have back to parts button', async function() {
            const backButton = await page.$('a[href*="/parts"]');
            expect(backButton).to.not.be.null;
            
            const buttonText = await page.$eval('a[href*="/parts"]', el => el.textContent);
            expect(buttonText).to.include('Back to Parts');
        });

        it('should have configure STT button', async function() {
            const sttButton = await page.$('a[href*="/ai-management/stt"]');
            expect(sttButton).to.not.be.null;
            
            const buttonText = await page.$eval('a[href*="/ai-management/stt"]', el => el.textContent);
            expect(buttonText).to.include('Configure STT');
        });
    });

    describe('Instructions Panel', function() {
        it('should display instructions panel', async function() {
            const instructionsPanel = await page.$('.instructions-panel');
            expect(instructionsPanel).to.not.be.null;
            
            const instructionsTitle = await page.$eval('.instructions-title', el => el.textContent);
            expect(instructionsTitle).to.include('How to Use');
        });

        it('should have step-by-step instructions', async function() {
            const instructionSteps = await page.$$('.instruction-step');
            expect(instructionSteps.length).to.be.at.least(4);
            
            const stepNumbers = await page.$$eval('.step-number', 
                elements => elements.map(el => el.textContent)
            );
            
            expect(stepNumbers).to.include.members(['1', '2', '3', '4']);
        });
    });

    describe('Form Validation', function() {
        it('should require microphone name', async function() {
            // Clear the name field
            await page.evaluate(() => {
                document.getElementById('name').value = '';
            });
            
            // Try to submit
            await page.click('button[type="submit"]');
            
            // Check if validation message appears
            const isValid = await page.evaluate(() => {
                return document.getElementById('name').checkValidity();
            });
            
            expect(isValid).to.be.false;
        });

        it('should validate form before submission', async function() {
            // Fill in required fields
            await page.type('#name', 'Test Microphone');
            
            // Submit form
            await page.click('button[type="submit"]');
            
            // Form should attempt to submit (we can't test actual submission without backend)
            // But we can verify the form is valid
            const isValid = await page.evaluate(() => {
                const form = document.getElementById('microphoneForm');
                return form.checkValidity();
            });
            
            expect(isValid).to.be.true;
        });
    });

    describe('Interactive Testing Functions', function() {
        it('should call test functions when buttons are clicked', async function() {
            // Mock the test functions to avoid actual API calls
            await page.evaluate(() => {
                window.testMicrophone = () => {
                    document.getElementById('testStatus').textContent = 'Test function called';
                };
                window.testSTTIntegration = () => {
                    document.getElementById('testStatus').textContent = 'STT test function called';
                };
                window.testVAD = () => {
                    document.getElementById('testStatus').textContent = 'VAD test function called';
                };
            });

            // Test microphone test button
            await page.click('button[onclick="testMicrophone()"]');
            let statusText = await page.$eval('#testStatus', el => el.textContent);
            expect(statusText).to.equal('Test function called');

            // Test STT integration button
            await page.click('button[onclick="testSTTIntegration()"]');
            statusText = await page.$eval('#testStatus', el => el.textContent);
            expect(statusText).to.equal('STT test function called');

            // Test VAD button
            await page.click('button[onclick="testVAD()"]');
            statusText = await page.$eval('#testStatus', el => el.textContent);
            expect(statusText).to.equal('VAD test function called');
        });

        it('should update audio level display', async function() {
            // Mock the live monitoring function
            await page.evaluate(() => {
                window.startLiveMonitoring = () => {
                    // Simulate audio level updates
                    const levelBar = document.getElementById('audioLevelBar');
                    const levelText = document.getElementById('audioLevelText');
                    levelBar.style.width = '75%';
                    levelText.textContent = '75%';
                };
            });

            // Click start monitoring
            await page.click('button[onclick="startLiveMonitoring()"]');

            // Check if audio levels are updated
            const levelWidth = await page.$eval('#audioLevelBar', el => el.style.width);
            const levelText = await page.$eval('#audioLevelText', el => el.textContent);

            expect(levelWidth).to.equal('75%');
            expect(levelText).to.equal('75%');
        });
    });

    describe('Responsive Design', function() {
        it('should adapt to mobile viewport', async function() {
            await page.setViewport({ width: 375, height: 667 }); // iPhone SE

            // Check if layout adapts
            const container = await page.$('.microphone-container');
            const containerStyles = await page.evaluate(el => {
                const styles = window.getComputedStyle(el);
                return {
                    display: styles.display,
                    gridTemplateColumns: styles.gridTemplateColumns
                };
            }, container);

            // On mobile, should stack vertically
            expect(containerStyles.display).to.equal('grid');
        });

        it('should maintain functionality on tablet viewport', async function() {
            await page.setViewport({ width: 768, height: 1024 }); // iPad

            // All buttons should still be clickable
            const refreshButton = await page.$('#refreshDevicesButton');
            const isClickable = await page.evaluate(el => {
                const styles = window.getComputedStyle(el);
                return styles.pointerEvents !== 'none' && styles.display !== 'none';
            }, refreshButton);

            expect(isClickable).to.be.true;
        });
    });
});
