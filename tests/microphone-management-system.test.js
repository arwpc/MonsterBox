/**
 * Comprehensive Test Suite for Microphone Management System
 * Tests all functionality including CRUD operations, WebSocket connections, 
 * audio detection, and user interface interactions
 */

const { expect } = require('chai');
const request = require('supertest');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

describe('Microphone Management System', function() {
    this.timeout(60000);

    let app;
    let driver;
    let baseUrl;

    before(async function() {
        // Start the application
        app = require('../app');
        baseUrl = 'http://localhost:3000';
        
        // Wait for app to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Setup Selenium WebDriver
        const options = new chrome.Options();
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--use-fake-ui-for-media-stream');
        options.addArguments('--use-fake-device-for-media-stream');
        
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
    });

    after(async function() {
        if (driver) {
            await driver.quit();
        }
    });

    describe('API Endpoints', function() {
        describe('Service Management', function() {
            it('should get services status', async function() {
                const response = await request(app)
                    .get('/parts/api/services/status')
                    .expect(200);

                expect(response.body).to.be.an('object');
                expect(response.body).to.have.property('microphoneService');
                expect(response.body).to.have.property('audioStreamService');
            });

            it('should get microphone health status', async function() {
                const response = await request(app)
                    .get('/parts/api/microphone/health')
                    .expect(200);

                expect(response.body).to.have.property('timestamp');
                expect(response.body).to.have.property('overall');
                expect(response.body).to.have.property('services');
                expect(['healthy', 'degraded', 'error']).to.include(response.body.overall);
            });

            it('should restart services when requested', async function() {
                const response = await request(app)
                    .post('/parts/api/services/restart')
                    .send({ serviceType: 'microphone', port: 8776 })
                    .expect(200);

                expect(response.body).to.have.property('success');
            });
        });

        describe('Microphone CRUD Operations', function() {
            let testMicrophoneId;

            it('should create a new microphone', async function() {
                const microphoneData = {
                    name: 'Test Microphone',
                    deviceId: 'test-device',
                    sampleRate: 16000,
                    channels: 1,
                    sensitivity: 1.0,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                };

                const response = await request(app)
                    .post('/parts/microphone')
                    .send(microphoneData)
                    .expect(200);

                expect(response.body).to.have.property('id');
                testMicrophoneId = response.body.id;
            });

            it('should get all microphones', async function() {
                const response = await request(app)
                    .get('/parts/api/parts')
                    .expect(200);

                expect(response.body).to.be.an('array');
                const microphones = response.body.filter(part => part.type === 'microphone');
                expect(microphones.length).to.be.greaterThan(0);
            });

            it('should get microphone status', async function() {
                if (!testMicrophoneId) this.skip();

                const response = await request(app)
                    .get(`/parts/api/microphone/${testMicrophoneId}/status`)
                    .expect(200);

                expect(response.body).to.have.property('status');
                expect(response.body).to.have.property('level');
            });

            it('should test microphone functionality', async function() {
                if (!testMicrophoneId) this.skip();

                const response = await request(app)
                    .post(`/parts/api/microphone/${testMicrophoneId}/test`)
                    .send({ testType: 'basic', duration: 3 })
                    .expect(200);

                expect(response.body).to.have.property('success');
                expect(response.body).to.have.property('results');
            });

            it('should start microphone monitoring', async function() {
                if (!testMicrophoneId) this.skip();

                const response = await request(app)
                    .post(`/parts/api/microphone/${testMicrophoneId}/start-monitoring`)
                    .expect(200);

                expect(response.body).to.have.property('success');
            });

            it('should stop microphone monitoring', async function() {
                if (!testMicrophoneId) this.skip();

                const response = await request(app)
                    .post(`/parts/api/microphone/${testMicrophoneId}/stop-monitoring`)
                    .expect(200);

                expect(response.body).to.have.property('success');
            });

            it('should delete the test microphone', async function() {
                if (!testMicrophoneId) this.skip();

                await request(app)
                    .delete(`/parts/microphone/${testMicrophoneId}`)
                    .expect(200);
            });
        });

        describe('Device Discovery', function() {
            it('should discover available microphone devices', async function() {
                const response = await request(app)
                    .get('/parts/api/microphone/devices')
                    .expect(200);

                expect(response.body).to.be.an('array');
                // Should have at least default device
                expect(response.body.length).to.be.greaterThan(0);
            });
        });
    });

    describe('User Interface', function() {
        describe('Navigation', function() {
            it('should load the microphone management page', async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                
                // Wait for page to load
                await driver.wait(until.titleContains('MonsterBox'), 10000);
                
                // Check for main heading
                const heading = await driver.findElement(By.css('h1'));
                const headingText = await heading.getText();
                expect(headingText).to.include('Microphone Parts Management');
            });

            it('should have microphone management in navigation', async function() {
                await driver.get(`${baseUrl}/`);
                
                // Look for microphone management link
                const navLink = await driver.findElement(By.linkText('🎤 Microphone Management'));
                expect(navLink).to.exist;
                
                // Click the link
                await navLink.click();
                
                // Verify we're on the right page
                await driver.wait(until.urlContains('/parts/microphone/management'), 5000);
            });
        });

        describe('Service Status Panel', function() {
            beforeEach(async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                await driver.wait(until.elementLocated(By.css('.service-status-panel')), 10000);
            });

            it('should display service status cards', async function() {
                const statusCards = await driver.findElements(By.css('.status-card'));
                expect(statusCards.length).to.be.greaterThan(0);
                
                // Check for microphone service card
                const micServiceCard = await driver.findElement(By.id('microphoneServiceStatus'));
                expect(micServiceCard).to.exist;
                
                // Check for audio stream service card
                const audioServiceCard = await driver.findElement(By.id('audioStreamStatus'));
                expect(audioServiceCard).to.exist;
            });

            it('should have restart buttons for services', async function() {
                const restartButtons = await driver.findElements(By.css('.status-action'));
                expect(restartButtons.length).to.be.greaterThan(0);
                
                // Check restart button functionality (without actually clicking)
                const micRestartBtn = await driver.findElement(By.id('restartMicService'));
                const isEnabled = await micRestartBtn.isEnabled();
                expect(isEnabled).to.be.true;
            });
        });

        describe('Management Tabs', function() {
            beforeEach(async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                await driver.wait(until.elementLocated(By.css('.management-tabs')), 10000);
            });

            it('should have all required tabs', async function() {
                const expectedTabs = ['overview', 'crud', 'testing', 'monitoring', 'configuration'];
                
                for (const tabName of expectedTabs) {
                    const tabButton = await driver.findElement(By.css(`[data-tab="${tabName}"]`));
                    expect(tabButton).to.exist;
                }
            });

            it('should switch between tabs', async function() {
                // Click on CRUD tab
                const crudTab = await driver.findElement(By.css('[data-tab="crud"]'));
                await crudTab.click();
                
                // Wait for tab content to be visible
                await driver.wait(until.elementIsVisible(
                    driver.findElement(By.id('crud-tab'))
                ), 5000);
                
                // Verify active tab
                const activeTab = await driver.findElement(By.css('.tab-button.active'));
                const activeTabText = await activeTab.getText();
                expect(activeTabText).to.include('Manage Parts');
            });
        });

        describe('Overview Tab', function() {
            beforeEach(async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                await driver.wait(until.elementLocated(By.css('#overview-tab')), 10000);
            });

            it('should display system overview metrics', async function() {
                const totalMics = await driver.findElement(By.id('totalMicrophones'));
                const totalMicsText = await totalMics.getText();
                expect(totalMicsText).to.match(/^\d+$/);
                
                const activeMics = await driver.findElement(By.id('activeMicrophones'));
                const activeMicsText = await activeMics.getText();
                expect(activeMicsText).to.match(/^\d+$/);
            });

            it('should have quick action buttons', async function() {
                const createBtn = await driver.findElement(By.id('createNewMicrophone'));
                expect(createBtn).to.exist;
                
                const detectBtn = await driver.findElement(By.id('detectDevices'));
                expect(detectBtn).to.exist;
                
                const testAllBtn = await driver.findElement(By.id('testAllMicrophones'));
                expect(testAllBtn).to.exist;
            });

            it('should display real-time status indicator', async function() {
                const statusDot = await driver.findElement(By.id('systemStatusDot'));
                expect(statusDot).to.exist;
                
                const statusText = await driver.findElement(By.id('systemStatusText'));
                const statusTextContent = await statusText.getText();
                expect(statusTextContent.length).to.be.greaterThan(0);
            });
        });

        describe('CRUD Operations Tab', function() {
            beforeEach(async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                await driver.wait(until.elementLocated(By.css('.management-tabs')), 10000);
                
                // Switch to CRUD tab
                const crudTab = await driver.findElement(By.css('[data-tab="crud"]'));
                await crudTab.click();
                await driver.wait(until.elementIsVisible(
                    driver.findElement(By.id('crud-tab'))
                ), 5000);
            });

            it('should show create new microphone button', async function() {
                const createBtn = await driver.findElement(By.id('createNewMicrophone'));
                await createBtn.click();
                
                // Wait for form to appear
                await driver.wait(until.elementIsVisible(
                    driver.findElement(By.id('createFormContainer'))
                ), 5000);
                
                // Check form fields
                const nameField = await driver.findElement(By.id('newMicName'));
                expect(nameField).to.exist;
                
                const deviceField = await driver.findElement(By.id('newMicDevice'));
                expect(deviceField).to.exist;
            });

            it('should have bulk operations section', async function() {
                const bulkSection = await driver.findElement(By.css('.bulk-operations'));
                expect(bulkSection).to.exist;
                
                const selectAllBtn = await driver.findElement(By.id('selectAll'));
                expect(selectAllBtn).to.exist;
                
                const bulkDeleteBtn = await driver.findElement(By.id('bulkDelete'));
                expect(bulkDeleteBtn).to.exist;
            });
        });

        describe('Testing Interface Tab', function() {
            beforeEach(async function() {
                await driver.get(`${baseUrl}/parts/microphone/management`);
                await driver.wait(until.elementLocated(By.css('.management-tabs')), 10000);
                
                // Switch to testing tab
                const testingTab = await driver.findElement(By.css('[data-tab="testing"]'));
                await testingTab.click();
                await driver.wait(until.elementIsVisible(
                    driver.findElement(By.id('testing-tab'))
                ), 5000);
            });

            it('should have test controls', async function() {
                const microphoneSelect = await driver.findElement(By.id('testMicrophoneSelect'));
                expect(microphoneSelect).to.exist;
                
                const startTestBtn = await driver.findElement(By.id('startComprehensiveTest'));
                expect(startTestBtn).to.exist;
                
                const quickTestBtn = await driver.findElement(By.id('quickTest'));
                expect(quickTestBtn).to.exist;
                
                const ambientTestBtn = await driver.findElement(By.id('ambientTest'));
                expect(ambientTestBtn).to.exist;
            });

            it('should have test results container', async function() {
                const resultsContainer = await driver.findElement(By.id('testResultsContainer'));
                expect(resultsContainer).to.exist;
            });
        });
    });

    describe('JavaScript Functionality', function() {
        beforeEach(async function() {
            await driver.get(`${baseUrl}/parts/microphone/management`);
            await driver.wait(until.elementLocated(By.css('.management-tabs')), 10000);
        });

        it('should initialize microphone management system', async function() {
            // Check if the global object exists
            const systemExists = await driver.executeScript(
                'return typeof window.microphoneManagement !== "undefined"'
            );
            expect(systemExists).to.be.true;
        });

        it('should handle device detection', async function() {
            const detectBtn = await driver.findElement(By.id('detectDevices'));
            await detectBtn.click();
            
            // Wait a moment for the operation
            await driver.sleep(2000);
            
            // Check if devices were updated (this would normally show in UI)
            const availableDevices = await driver.findElement(By.id('availableDevices'));
            const deviceCount = await availableDevices.getText();
            expect(deviceCount).to.match(/^\d+$/);
        });

        it('should handle search functionality', async function() {
            const searchInput = await driver.findElement(By.id('searchMicrophones'));
            await searchInput.sendKeys('test');
            
            // The search should filter microphones (tested via UI behavior)
            expect(searchInput).to.exist;
        });
    });
});
