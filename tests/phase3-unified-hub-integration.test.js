/**
 * Phase 3: Unified Hub Integration Tests
 * 
 * Tests the complete Phase 3 implementation including:
 * - Service integration (microphone, webcam, AI)
 * - Hub API endpoints
 * - Services monitor page updates
 * - Character-based service loading
 */

const { expect } = require('chai');
const request = require('supertest');
const app = require('../app');

describe('Phase 3: Unified Hub Integration', function() {
    this.timeout(30000);

    let server;
    const testPort = 3001;

    before(async function() {
        // Start test server
        server = app.listen(testPort, () => {
            console.log(`Test server running on port ${testPort}`);
        });
        
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    after(function(done) {
        if (server) {
            server.close(done);
        } else {
            done();
        }
    });

    describe('Hub Status and Health', function() {
        it('should return hub status', async function() {
            const response = await request(app)
                .get('/api/hub/status')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('status');
            expect(response.body).to.have.property('services');
            expect(response.body.services).to.have.property('registered');
        });

        it('should return hub health information', async function() {
            const response = await request(app)
                .get('/api/hub/health')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('status');
            expect(response.body).to.have.property('timestamp');
        });

        it('should return hub information', async function() {
            const response = await request(app)
                .get('/api/hub/info')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('hub');
            expect(response.body.hub).to.have.property('version');
            expect(response.body.hub).to.have.property('uptime');
        });
    });

    describe('Phase 3: Integrated Services', function() {
        it('should return microphone service status', async function() {
            const response = await request(app)
                .get('/api/hub/microphone/status')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('microphone');
            expect(response.body.microphone).to.have.property('available');
            expect(response.body).to.have.property('timestamp');
        });

        it('should return webcam service status', async function() {
            const response = await request(app)
                .get('/api/hub/webcam/status')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('webcam');
            expect(response.body.webcam).to.have.property('available');
            expect(response.body).to.have.property('timestamp');
        });

        it('should return AI service status', async function() {
            const response = await request(app)
                .get('/api/hub/ai/status')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('ai');
            expect(response.body.ai).to.have.property('available');
            expect(response.body).to.have.property('timestamp');
        });

        it('should handle microphone recording start', async function() {
            const response = await request(app)
                .post('/api/hub/microphone/start_recording')
                .send({ microphoneId: 'test-mic' })
                .expect(200);

            expect(response.body).to.have.property('success');
            expect(response.body).to.have.property('message');
            expect(response.body).to.have.property('timestamp');
        });

        it('should handle microphone recording stop', async function() {
            const response = await request(app)
                .post('/api/hub/microphone/stop_recording')
                .send({ microphoneId: 'test-mic' })
                .expect(200);

            expect(response.body).to.have.property('success');
            expect(response.body).to.have.property('message');
            expect(response.body).to.have.property('timestamp');
        });
    });

    describe('Services Monitor Page Integration', function() {
        it('should load services monitor page', async function() {
            const response = await request(app)
                .get('/configuration/services-monitor')
                .expect(200);

            expect(response.text).to.include('Services Monitor');
            expect(response.text).to.include('Character Services Overview');
            expect(response.text).to.include('Phase 3');
        });

        it('should include Phase 3 services in expected services list', async function() {
            const response = await request(app)
                .get('/configuration/services-monitor')
                .expect(200);

            // Check for Phase 3 services in the page
            expect(response.text).to.include('ElevenLabs Conversational AI');
            expect(response.text).to.include('Microphone Service');
            expect(response.text).to.include('Audio Stream Service');
            expect(response.text).to.include('Unified Animatronic Hub');
        });

        it('should show correct service count for characters', async function() {
            const response = await request(app)
                .get('/configuration/services-monitor')
                .expect(200);

            // Should show 12 services (Phase 1-3 services)
            expect(response.text).to.include('12'); // Updated service count
        });
    });

    describe('Hub API Endpoint Discovery', function() {
        it('should list all available endpoints', async function() {
            const response = await request(app)
                .get('/api/hub/')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('availableEndpoints');
            
            const endpoints = response.body.availableEndpoints;
            
            // Check for Phase 3 endpoints
            expect(endpoints).to.include('/api/hub/microphone/status');
            expect(endpoints).to.include('/api/hub/microphone/start_recording');
            expect(endpoints).to.include('/api/hub/microphone/stop_recording');
            expect(endpoints).to.include('/api/hub/webcam/status');
            expect(endpoints).to.include('/api/hub/webcam/snapshot');
            expect(endpoints).to.include('/api/hub/webcam/stream');
            expect(endpoints).to.include('/api/hub/ai/status');
            expect(endpoints).to.include('/api/hub/ai/agents');
        });
    });

    describe('Error Handling', function() {
        it('should handle 404 for unknown hub endpoints', async function() {
            const response = await request(app)
                .get('/api/hub/nonexistent')
                .expect(404);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error');
        });

        it('should handle service unavailable gracefully', async function() {
            // Test when services are not available
            const response = await request(app)
                .get('/api/hub/microphone/status');

            // Should either return 200 with service info or 503 if unavailable
            expect([200, 503]).to.include(response.status);
            
            if (response.status === 503) {
                expect(response.body).to.have.property('success', false);
                expect(response.body).to.have.property('error');
            }
        });
    });

    describe('Integration with Character Loading', function() {
        it('should work with character-based service loading', async function() {
            // Test that hub works with dynamic character loading
            const hubResponse = await request(app)
                .get('/api/hub/status')
                .expect(200);

            const charactersResponse = await request(app)
                .get('/api/characters')
                .expect(200);

            expect(hubResponse.body.success).to.be.true;
            expect(charactersResponse.body).to.be.an('array');
        });
    });
});
