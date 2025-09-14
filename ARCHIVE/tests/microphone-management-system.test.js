/**
 * Comprehensive Test Suite for Microphone Management System
 * Tests API functionality including CRUD operations, service management,
 * and microphone health monitoring
 */

const { expect } = require('chai');
const request = require('supertest');

describe('Microphone Management System - API Testing', function() {
    this.timeout(60000);

    let app;
    let baseUrl;
    let testResults = {
        apiTests: [],
        serviceTests: [],
        errors: []
    };

    before(async function() {
        console.log('🚀 Starting Microphone Management API Tests...');

        // Start the application
        app = require('../app');
        baseUrl = 'http://localhost:3000';

        // Wait for app to be ready
        console.log('⏳ Waiting for application to initialize...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('✅ Test environment initialized');
    });

    after(async function() {
        console.log('\n📊 API Test Results Summary:');
        console.log(`API Tests: ${testResults.apiTests.length}`);
        console.log(`Service Tests: ${testResults.serviceTests.length}`);
        console.log(`Errors: ${testResults.errors.length}`);

        if (testResults.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            testResults.errors.forEach(error => console.log(`  - ${error}`));
        }
    });

    describe('🔌 API Endpoints Testing', function() {
        describe('Service Management APIs', function() {
            it('should get services status', async function() {
                console.log('🧪 Testing services status API...');
                try {
                    const response = await request(app)
                        .get('/parts/api/services/status')
                        .expect(200);

                    expect(response.body).to.be.an('object');
                    // The actual response structure has 'microphone' instead of 'microphoneService'
                    expect(response.body).to.have.property('microphone');
                    expect(response.body).to.have.property('audioStream');

                    testResults.apiTests.push('✅ Services status API working');
                    console.log('✅ Services status API test passed');
                } catch (error) {
                    testResults.errors.push(`Services status API: ${error.message}`);
                    throw error;
                }
            });

            it('should get microphone health status', async function() {
                console.log('🧪 Testing microphone health API...');
                try {
                    const response = await request(app)
                        .get('/parts/api/microphone/health')
                        .expect(200);

                    expect(response.body).to.have.property('timestamp');
                    expect(response.body).to.have.property('overall');
                    expect(response.body).to.have.property('services');
                    expect(['healthy', 'degraded', 'error']).to.include(response.body.overall);

                    testResults.apiTests.push('✅ Microphone health API working');
                    console.log('✅ Microphone health API test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone health API: ${error.message}`);
                    throw error;
                }
            });

            it('should restart services when requested', async function() {
                console.log('🧪 Testing service restart API...');
                try {
                    const response = await request(app)
                        .post('/parts/api/services/restart')
                        .send({ serviceType: 'microphone', port: 8776 })
                        .expect(200);

                    expect(response.body).to.have.property('success');

                    testResults.serviceTests.push('✅ Service restart API working');
                    console.log('✅ Service restart API test passed');
                } catch (error) {
                    testResults.errors.push(`Service restart API: ${error.message}`);
                    throw error;
                }
            });
        });

        describe('Microphone CRUD Operations', function() {
            let testMicrophoneId;

            it('should create a new microphone', async function() {
                console.log('🧪 Testing microphone creation...');
                try {
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
                        .expect(302); // Expecting redirect after creation

                    // The microphone should be created successfully (redirect indicates success)
                    expect(response.headers.location).to.contain('/parts');

                    // Get the created microphone from the parts list
                    const partsResponse = await request(app)
                        .get('/parts/api/parts')
                        .expect(200);

                    const microphones = partsResponse.body.filter(part =>
                        part.type === 'microphone' && part.name === 'Test Microphone'
                    );

                    expect(microphones.length).to.be.greaterThan(0);
                    testMicrophoneId = microphones[0].id;

                    testResults.apiTests.push('✅ Microphone creation working');
                    console.log(`✅ Created test microphone with ID: ${testMicrophoneId}`);
                } catch (error) {
                    testResults.errors.push(`Microphone creation: ${error.message}`);
                    throw error;
                }
            });

            it('should get all microphones', async function() {
                console.log('🧪 Testing microphone listing...');
                try {
                    const response = await request(app)
                        .get('/parts/api/parts')
                        .expect(200);

                    expect(response.body).to.be.an('array');
                    const microphones = response.body.filter(part => part.type === 'microphone');
                    expect(microphones.length).to.be.greaterThan(0);

                    testResults.apiTests.push(`✅ Microphone listing working (${microphones.length} found)`);
                    console.log(`✅ Found ${microphones.length} microphones`);
                } catch (error) {
                    testResults.errors.push(`Microphone listing: ${error.message}`);
                    throw error;
                }
            });

            it('should get microphone status', async function() {
                if (!testMicrophoneId) this.skip();

                console.log('🧪 Testing microphone status...');
                try {
                    const response = await request(app)
                        .get(`/parts/api/microphone/${testMicrophoneId}/status`)
                        .expect(200);

                    expect(response.body).to.have.property('status');
                    expect(response.body).to.have.property('level');

                    testResults.apiTests.push('✅ Microphone status API working');
                    console.log('✅ Microphone status API test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone status: ${error.message}`);
                    throw error;
                }
            });

            it('should test microphone functionality', async function() {
                if (!testMicrophoneId) this.skip();

                console.log('🧪 Testing microphone test functionality...');
                try {
                    const response = await request(app)
                        .post(`/parts/api/microphone/${testMicrophoneId}/test`)
                        .send({ testType: 'basic', duration: 3 })
                        .expect(200);

                    expect(response.body).to.have.property('success');
                    // The actual response structure may have different properties
                    expect(response.body).to.have.property('microphoneId');

                    testResults.apiTests.push('✅ Microphone testing API working');
                    console.log('✅ Microphone testing API test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone testing: ${error.message}`);
                    throw error;
                }
            });

            it('should start microphone monitoring', async function() {
                if (!testMicrophoneId) this.skip();

                console.log('🧪 Testing microphone monitoring start...');
                try {
                    const response = await request(app)
                        .post(`/parts/api/microphone/${testMicrophoneId}/start-monitoring`)
                        .expect(200);

                    expect(response.body).to.have.property('success');

                    testResults.apiTests.push('✅ Microphone monitoring start working');
                    console.log('✅ Microphone monitoring start test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone monitoring start: ${error.message}`);
                    throw error;
                }
            });

            it('should stop microphone monitoring', async function() {
                if (!testMicrophoneId) this.skip();

                console.log('🧪 Testing microphone monitoring stop...');
                try {
                    const response = await request(app)
                        .post(`/parts/api/microphone/${testMicrophoneId}/stop-monitoring`)
                        .expect(200);

                    expect(response.body).to.have.property('success');

                    testResults.apiTests.push('✅ Microphone monitoring stop working');
                    console.log('✅ Microphone monitoring stop test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone monitoring stop: ${error.message}`);
                    throw error;
                }
            });

            it('should delete the test microphone', async function() {
                if (!testMicrophoneId) this.skip();

                console.log('🧪 Testing microphone deletion...');
                try {
                    await request(app)
                        .delete(`/parts/${testMicrophoneId}`)
                        .expect(200);

                    testResults.apiTests.push('✅ Microphone deletion working');
                    console.log('✅ Microphone deletion test passed');
                } catch (error) {
                    testResults.errors.push(`Microphone deletion: ${error.message}`);
                    throw error;
                }
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

    // UI tests are handled by comprehensive Playwright tests in 09-microphone-management-comprehensive.spec.js
    // This test file focuses on API functionality only
});
