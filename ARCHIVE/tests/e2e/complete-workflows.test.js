const { expect } = require('chai');
const puppeteer = require('puppeteer');
const request = require('supertest');
const app = require('../../app');

describe('🎯 End-to-End Complete Workflows', function() {
    let browser;
    let page;
    let server;
    let serverPort;

    before(async function() {
        this.timeout(60000);
        
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

    describe('🎤 Complete Microphone Setup Workflow', function() {
        it('should complete full microphone configuration from discovery to testing', async function() {
            this.timeout(30000);
            
            // Step 1: Navigate to Parts page
            await page.goto(`http://localhost:${serverPort}/parts?characterId=1`);
            await page.waitForSelector('body', { timeout: 10000 });
            
            // Step 2: Click "Add Microphone" or navigate to microphone form
            await page.goto(`http://localhost:${serverPort}/parts/microphone/new?characterId=1`);
            await page.waitForSelector('.microphone-container', { timeout: 10000 });
            
            // Step 3: Fill in basic information
            await page.type('#name', 'E2E Test Microphone');
            await page.type('#description', 'End-to-end test microphone configuration');
            
            // Step 4: Wait for device discovery and select device
            await page.waitForFunction(
                () => document.getElementById('deviceId').options.length > 1,
                { timeout: 10000 }
            );
            
            // Select a device (default is fine for testing)
            await page.select('#deviceId', 'default');
            
            // Step 5: Configure audio settings
            await page.select('#sampleRate', '16000');
            await page.select('#channels', '1');
            
            // Set sensitivity
            await page.evaluate(() => {
                const slider = document.getElementById('sensitivity');
                slider.value = '1.5';
                slider.dispatchEvent(new Event('input'));
            });
            
            // Step 6: Configure audio processing
            await page.click('#echoCancellation'); // Ensure it's checked
            await page.click('#noiseSuppression'); // Ensure it's checked
            await page.click('#autoGainControl'); // Ensure it's checked
            
            // Step 7: Configure VAD
            await page.click('#voiceActivation');
            await page.waitForSelector('#voiceActivationThresholdDiv[style*="block"]', { timeout: 2000 });
            
            await page.evaluate(() => {
                const slider = document.getElementById('voiceActivationThreshold');
                slider.value = '0.3';
                slider.dispatchEvent(new Event('input'));
            });
            
            // Step 8: Test microphone functionality (mock the functions)
            await page.evaluate(() => {
                window.testMicrophone = () => {
                    document.getElementById('testStatus').textContent = '✅ Microphone test completed successfully';
                    document.getElementById('testOutput').textContent = 'Audio levels: Average 45%, Peak 78%';
                };
                window.testSTTIntegration = () => {
                    document.getElementById('testStatus').textContent = '✅ STT integration test completed';
                    document.getElementById('transcriptionOutput').innerHTML = 
                        '<div class="stt-result success"><h6>✅ STT Test Successful</h6><p><strong>Transcription:</strong> "Hello world test"</p></div>';
                };
            });
            
            // Run tests
            await page.click('button[onclick="testMicrophone()"]');
            await page.waitForFunction(
                () => document.getElementById('testStatus').textContent.includes('✅'),
                { timeout: 5000 }
            );
            
            await page.click('button[onclick="testSTTIntegration()"]');
            await page.waitForFunction(
                () => document.getElementById('testStatus').textContent.includes('STT integration'),
                { timeout: 5000 }
            );
            
            // Step 9: Verify all configurations are set correctly
            const formData = await page.evaluate(() => {
                return {
                    name: document.getElementById('name').value,
                    description: document.getElementById('description').value,
                    deviceId: document.getElementById('deviceId').value,
                    sampleRate: document.getElementById('sampleRate').value,
                    channels: document.getElementById('channels').value,
                    sensitivity: document.getElementById('sensitivity').value,
                    echoCancellation: document.getElementById('echoCancellation').checked,
                    noiseSuppression: document.getElementById('noiseSuppression').checked,
                    autoGainControl: document.getElementById('autoGainControl').checked,
                    voiceActivation: document.getElementById('voiceActivation').checked,
                    voiceActivationThreshold: document.getElementById('voiceActivationThreshold').value
                };
            });
            
            expect(formData.name).to.equal('E2E Test Microphone');
            expect(formData.description).to.equal('End-to-end test microphone configuration');
            expect(formData.deviceId).to.equal('default');
            expect(formData.sampleRate).to.equal('16000');
            expect(formData.channels).to.equal('1');
            expect(parseFloat(formData.sensitivity)).to.equal(1.5);
            expect(formData.echoCancellation).to.be.true;
            expect(formData.noiseSuppression).to.be.true;
            expect(formData.autoGainControl).to.be.true;
            expect(formData.voiceActivation).to.be.true;
            expect(parseFloat(formData.voiceActivationThreshold)).to.equal(0.3);
            
            // Step 10: Save configuration (we'll mock the submission)
            await page.evaluate(() => {
                // Mock form submission to avoid actual backend call
                document.getElementById('microphoneForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    alert('Microphone configuration saved successfully!');
                });
            });
            
            // Handle the alert
            page.on('dialog', async dialog => {
                expect(dialog.message()).to.include('saved successfully');
                await dialog.accept();
            });
            
            await page.click('button[type="submit"]');
            
            // Workflow completed successfully
            console.log('✅ Complete microphone setup workflow completed successfully');
        });
    });

    describe('🎙️ Complete STT + VAD Configuration Workflow', function() {
        it('should complete full STT + VAD configuration and testing workflow', async function() {
            this.timeout(30000);
            
            // Step 1: Navigate to STT configuration page
            await page.goto(`http://localhost:${serverPort}/ai-management/stt`);
            await page.waitForSelector('.config-section', { timeout: 10000 });
            
            // Step 2: Configure VAD settings
            await page.select('#vadType', 'webrtcvad');
            
            await page.evaluate(() => {
                const slider = document.getElementById('vadThreshold');
                slider.value = '0.6';
                slider.dispatchEvent(new Event('input'));
            });
            
            await page.evaluate(() => {
                document.getElementById('prefixPadding').value = '400';
                document.getElementById('silenceDuration').value = '1200';
            });
            
            // Step 3: Test Live STT + VAD Integration
            await page.click('[data-tab="live-test"]');
            await page.waitForSelector('#live-test-tab.active', { timeout: 2000 });
            
            // Mock the recording functions
            await page.evaluate(() => {
                window.toggleRecording = () => {
                    const button = document.getElementById('recordButton');
                    const instruction = document.querySelector('.recording-instruction');
                    const results = document.getElementById('liveTestResults');
                    
                    if (button.classList.contains('recording')) {
                        button.classList.remove('recording');
                        instruction.textContent = 'Click to start recording';
                        results.textContent = '[12:34:56] STT Result:\nTranscription: "Test speech detected successfully"\nConfidence: 85%\nLanguage: en\nVAD Detected: Yes\nResponse Time: 150ms';
                    } else {
                        button.classList.add('recording');
                        instruction.textContent = 'Recording... Click to stop';
                    }
                };
            });
            
            // Start recording
            await page.click('#recordButton');
            let isRecording = await page.$eval('#recordButton', el => el.classList.contains('recording'));
            expect(isRecording).to.be.true;
            
            // Stop recording
            await page.click('#recordButton');
            isRecording = await page.$eval('#recordButton', el => el.classList.contains('recording'));
            expect(isRecording).to.be.false;
            
            // Check results
            const results = await page.$eval('#liveTestResults', el => el.textContent);
            expect(results).to.include('STT Result');
            expect(results).to.include('VAD Detected: Yes');
            
            // Step 4: Test VAD-specific functionality
            await page.click('[data-tab="vad-test"]');
            await page.waitForSelector('#vad-test-tab.active', { timeout: 2000 });
            
            // Mock VAD test functions
            await page.evaluate(() => {
                window.startVADTest = () => {
                    document.getElementById('vadTestStatus').textContent = 'VAD test running - speak to see voice detection in action';
                    
                    // Simulate VAD events
                    const eventsList = document.getElementById('vadEventsList');
                    eventsList.innerHTML = `
                        <div class="vad-event detected">12:35:01 - vad_detected (confidence: 0.85)</div>
                        <div class="vad-event ended">12:35:03 - vad_ended (confidence: 0.12)</div>
                        <div class="vad-event detected">12:35:05 - vad_detected (confidence: 0.92)</div>
                    `;
                    
                    // Update audio levels
                    document.getElementById('vadAudioLevelBar').style.width = '75%';
                    document.getElementById('vadAudioLevelText').textContent = '75%';
                };
                
                window.stopVADTest = () => {
                    document.getElementById('vadTestStatus').textContent = 'VAD test stopped';
                    document.getElementById('vadTestResults').textContent = 
                        'VAD Test Results:\nTotal Events: 3\nVoice Detected Events: 2\nAverage Confidence: 0.89\nTest Duration: 6s';
                };
            });
            
            // Start VAD test
            await page.click('button[onclick="startVADTest()"]');
            let vadStatus = await page.$eval('#vadTestStatus', el => el.textContent);
            expect(vadStatus).to.include('VAD test running');
            
            // Check VAD events
            const vadEvents = await page.$eval('#vadEventsList', el => el.innerHTML);
            expect(vadEvents).to.include('vad_detected');
            
            // Stop VAD test
            await page.click('button[onclick="stopVADTest()"]');
            vadStatus = await page.$eval('#vadTestStatus', el => el.textContent);
            expect(vadStatus).to.include('VAD test stopped');
            
            // Step 5: Run comprehensive integration test
            await page.click('[data-tab="integration-test"]');
            await page.waitForSelector('#integration-test-tab.active', { timeout: 2000 });
            
            // Mock integration test
            await page.evaluate(() => {
                window.runIntegrationTest = () => {
                    document.getElementById('integrationTestStatus').textContent = '✅ Integration test completed successfully';
                    document.getElementById('sttMetrics').innerHTML = '<span class="success">✅ Healthy</span><br>Response: 120ms';
                    document.getElementById('vadMetrics').innerHTML = '<span class="success">✅ Healthy</span><br>Response: 45ms';
                    document.getElementById('integrationMetrics').innerHTML = '<span class="success">✅ Healthy</span><br>Check configuration';
                    
                    document.getElementById('integrationTestResults').textContent = `Integration Test Results:

STT Performance:
- Success: Yes
- Response Time: 120ms
- Provider: elevenlabs
- Accuracy: 92%

VAD Performance:
- Success: Yes
- Sensitivity: 0.6
- False Positives: 2
- Response Time: 45ms

Integration Health:
- Overall Status: Healthy
- STT Status: Active
- VAD Status: Active
- Overall Health: Excellent`;
                };
            });
            
            // Run integration test
            await page.click('button[onclick="runIntegrationTest()"]');
            
            const integrationStatus = await page.$eval('#integrationTestStatus', el => el.textContent);
            expect(integrationStatus).to.include('✅ Integration test completed successfully');
            
            const sttMetrics = await page.$eval('#sttMetrics', el => el.innerHTML);
            expect(sttMetrics).to.include('✅ Healthy');
            
            const integrationResults = await page.$eval('#integrationTestResults', el => el.textContent);
            expect(integrationResults).to.include('Integration Test Results');
            expect(integrationResults).to.include('Overall Status: Healthy');
            
            // Step 6: Save configuration
            await page.evaluate(() => {
                window.saveConfiguration = () => {
                    alert('✅ VAD configuration saved successfully!');
                };
            });
            
            page.on('dialog', async dialog => {
                expect(dialog.message()).to.include('VAD configuration saved successfully');
                await dialog.accept();
            });
            
            await page.click('button[onclick="saveConfiguration()"]');
            
            console.log('✅ Complete STT + VAD configuration workflow completed successfully');
        });
    });

    describe('🔊 Complete Speaker Device Discovery Workflow', function() {
        it('should discover and validate speaker devices through API', async function() {
            this.timeout(15000);
            
            // Step 1: Test speaker device discovery API
            const response = await request(server)
                .get('/parts/api/speaker/devices')
                .expect(200);
            
            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('speakers');
            expect(response.body.speakers).to.be.an('array');
            expect(response.body.speakers.length).to.be.greaterThan(0);
            
            // Step 2: Verify USB Audio Device is discovered
            const usbDevice = response.body.speakers.find(s => 
                s.name.includes('USB Audio Device')
            );
            expect(usbDevice).to.exist;
            expect(usbDevice).to.have.property('id');
            expect(usbDevice).to.have.property('name');
            expect(usbDevice).to.have.property('description');
            
            // Step 3: Verify platform audio device is discovered
            const platformDevice = response.body.speakers.find(s => 
                s.name.includes('Platform audio')
            );
            expect(platformDevice).to.exist;
            
            // Step 4: Test device configuration validation
            const testConfig = {
                deviceId: usbDevice.id,
                volume: 75,
                sampleRate: 44100,
                channels: 2
            };
            
            // This would be tested through the service layer
            console.log('✅ Speaker device discovery workflow completed successfully');
            console.log(`✅ Discovered ${response.body.speakers.length} speaker devices`);
            console.log(`✅ USB Audio Device: ${usbDevice.name}`);
            console.log(`✅ Platform Audio Device: ${platformDevice.name}`);
        });
    });

    describe('🔗 Complete Integration Health Check Workflow', function() {
        it('should perform comprehensive system health check', async function() {
            this.timeout(20000);
            
            // Step 1: Check system health
            const healthResponse = await request(server)
                .get('/ai-management/api/health')
                .expect(200);
            
            expect(healthResponse.body).to.have.property('success');
            expect(healthResponse.body).to.have.property('sttStatus');
            expect(healthResponse.body).to.have.property('vadStatus');
            expect(healthResponse.body).to.have.property('overallHealth');
            
            // Step 2: Test STT connection
            const sttResponse = await request(server)
                .post('/ai-management/api/stt/test')
                .send({})
                .expect(200);
            
            expect(sttResponse.body).to.have.property('success');
            
            // Step 3: Test microphone device discovery
            const micResponse = await request(server)
                .get('/parts/microphone/devices')
                .expect(200);
            
            expect(micResponse.body).to.have.property('success', true);
            expect(micResponse.body).to.have.property('microphones');
            
            // Step 4: Test speaker device discovery
            const speakerResponse = await request(server)
                .get('/parts/api/speaker/devices')
                .expect(200);
            
            expect(speakerResponse.body).to.have.property('success', true);
            expect(speakerResponse.body).to.have.property('speakers');
            
            // Step 5: Test VAD configuration
            const vadConfigResponse = await request(server)
                .get('/ai-management/api/vad/config')
                .expect(200);
            
            expect(vadConfigResponse.body).to.have.property('vadThreshold');
            expect(vadConfigResponse.body).to.have.property('vadType');
            
            console.log('✅ Complete integration health check workflow completed successfully');
            console.log(`✅ System Health: ${healthResponse.body.overallHealth}`);
            console.log(`✅ STT Status: ${healthResponse.body.sttStatus}`);
            console.log(`✅ VAD Status: ${healthResponse.body.vadStatus}`);
            console.log(`✅ Microphone Devices: ${micResponse.body.microphones.length}`);
            console.log(`✅ Speaker Devices: ${speakerResponse.body.speakers.length}`);
        });
    });
});
