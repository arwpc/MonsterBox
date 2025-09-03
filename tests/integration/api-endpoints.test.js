const { expect } = require('chai');
const request = require('supertest');
const app = require('../../app');

describe('🔗 API Endpoints Integration Tests', function() {
    let server;
    const testCharacterId = '1';

    before(function(done) {
        server = app.listen(0, () => {
            done();
        });
    });

    after(function(done) {
        server.close(done);
    });

    describe('Speaker Device Discovery API', function() {
        it('GET /parts/api/speaker/devices - should return available speaker devices', function(done) {
            request(server)
                .get('/parts/api/speaker/devices')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', true);
                    expect(res.body).to.have.property('speakers');
                    expect(res.body.speakers).to.be.an('array');
                    expect(res.body.speakers.length).to.be.greaterThan(0);
                    
                    // Check for USB Audio Device
                    const usbDevice = res.body.speakers.find(s => 
                        s.name.includes('USB Audio Device')
                    );
                    expect(usbDevice).to.exist;
                    expect(usbDevice).to.have.property('id');
                    expect(usbDevice).to.have.property('name');
                    expect(usbDevice).to.have.property('description');
                    
                    done();
                });
        });

        it('should handle speaker device discovery errors gracefully', function(done) {
            // This test would require mocking the underlying service
            // For now, we test that the endpoint exists and returns proper structure
            request(server)
                .get('/parts/api/speaker/devices')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    if (!res.body.success) {
                        expect(res.body).to.have.property('error');
                    }
                    
                    done();
                });
        });
    });

    describe('Microphone Device Discovery API', function() {
        it('GET /parts/microphone/devices - should return available microphone devices', function(done) {
            request(server)
                .get('/parts/microphone/devices')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', true);
                    expect(res.body).to.have.property('microphones');
                    expect(res.body.microphones).to.be.an('array');
                    
                    // Should at least have default device
                    expect(res.body.microphones.length).to.be.greaterThan(0);
                    
                    const defaultDevice = res.body.microphones.find(m => m.name === 'default');
                    expect(defaultDevice).to.exist;
                    
                    done();
                });
        });
    });

    describe('Microphone Testing API', function() {
        it('POST /parts/api/microphone/test - should test microphone functionality', function(done) {
            const testConfig = {
                config: {
                    deviceId: 'default',
                    sampleRate: 16000,
                    channels: 1,
                    sensitivity: 1.0
                },
                duration: 2
            };
            
            request(server)
                .post('/parts/api/microphone/test')
                .send(testConfig)
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('results');
                        expect(res.body.results).to.have.property('levels');
                        expect(res.body.results.levels).to.have.property('average');
                        expect(res.body.results.levels).to.have.property('peak');
                    }
                    
                    done();
                });
        });

        it('POST /parts/api/microphone/test-levels - should test audio levels', function(done) {
            const testConfig = {
                config: {
                    deviceId: 'default'
                },
                duration: 1
            };
            
            request(server)
                .post('/parts/api/microphone/test-levels')
                .send(testConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('levels');
                        expect(res.body.levels).to.have.property('average');
                        expect(res.body.levels).to.have.property('peak');
                    }
                    
                    done();
                });
        });

        it('POST /parts/api/microphone/test-stt - should test STT integration', function(done) {
            const testConfig = {
                config: {
                    deviceId: 'default',
                    vadEnabled: true,
                    vadThreshold: 0.5
                },
                characterId: testCharacterId,
                duration: 3,
                includeVAD: true
            };
            
            request(server)
                .post('/parts/api/microphone/test-stt')
                .send(testConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('transcription');
                        expect(res.body).to.have.property('confidence');
                        expect(res.body).to.have.property('language');
                        expect(res.body).to.have.property('vadDetected');
                    }
                    
                    done();
                });
        });

        it('POST /parts/api/microphone/test-vad - should test VAD functionality', function(done) {
            const testConfig = {
                config: {
                    deviceId: 'default',
                    vadThreshold: 0.5,
                    voiceActivation: true
                },
                duration: 3
            };
            
            request(server)
                .post('/parts/api/microphone/test-vad')
                .send(testConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('vadEvents');
                        expect(res.body).to.have.property('threshold');
                        expect(res.body.vadEvents).to.be.an('array');
                    }
                    
                    done();
                });
        });
    });

    describe('STT Configuration API', function() {
        it('GET /ai-management/api/stt/live-transcription-info - should return WebSocket info', function(done) {
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('websocketUrl');
                        expect(res.body.websocketUrl).to.be.a('string');
                        expect(res.body.websocketUrl).to.include('ws');
                    }
                    
                    done();
                });
        });

        it('POST /ai-management/api/stt/test - should test STT connection', function(done) {
            request(server)
                .post('/ai-management/api/stt/test')
                .send({})
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('provider');
                        expect(res.body).to.have.property('responseTime');
                        expect(res.body.responseTime).to.be.a('number');
                    }
                    
                    done();
                });
        });
    });

    describe('VAD Configuration API', function() {
        it('GET /ai-management/api/vad/config - should return VAD configuration', function(done) {
            request(server)
                .get('/ai-management/api/vad/config')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('vadThreshold');
                    expect(res.body).to.have.property('vadType');
                    expect(res.body).to.have.property('prefixPadding');
                    expect(res.body).to.have.property('silenceDuration');
                    
                    done();
                });
        });

        it('POST /ai-management/api/vad/config - should update VAD configuration', function(done) {
            const newConfig = {
                vadType: 'webrtcvad',
                vadThreshold: 0.6,
                prefixPadding: 400,
                silenceDuration: 1200
            };
            
            request(server)
                .post('/ai-management/api/vad/config')
                .send(newConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', true);
                    
                    done();
                });
        });

        it('POST /ai-management/api/vad/test-levels - should test VAD levels', function(done) {
            const testConfig = {
                duration: 2
            };
            
            request(server)
                .post('/ai-management/api/vad/test-levels')
                .send(testConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('level');
                        expect(res.body).to.have.property('vadDetected');
                        expect(res.body.level).to.be.a('number');
                        expect(res.body.vadDetected).to.be.a('boolean');
                    }
                    
                    done();
                });
        });

        it('POST /ai-management/api/vad/test-performance - should test VAD performance', function(done) {
            request(server)
                .post('/ai-management/api/vad/test-performance')
                .send({})
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('sensitivity');
                        expect(res.body).to.have.property('falsePositives');
                        expect(res.body).to.have.property('responseTime');
                    }
                    
                    done();
                });
        });
    });

    describe('Health Check API', function() {
        it('GET /ai-management/api/health - should return system health', function(done) {
            request(server)
                .get('/ai-management/api/health')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    expect(res.body).to.have.property('sttStatus');
                    expect(res.body).to.have.property('vadStatus');
                    expect(res.body).to.have.property('overallHealth');
                    
                    done();
                });
        });
    });

    describe('Integration Test API', function() {
        it('POST /ai-management/api/test/stt - should run comprehensive STT test', function(done) {
            const testConfig = {
                includePerformanceMetrics: true
            };
            
            request(server)
                .post('/ai-management/api/test/stt')
                .send(testConfig)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('responseTime');
                        expect(res.body).to.have.property('provider');
                        expect(res.body).to.have.property('accuracy');
                    }
                    
                    done();
                });
        });
    });

    describe('Error Handling', function() {
        it('should handle invalid JSON in POST requests', function(done) {
            request(server)
                .post('/parts/api/microphone/test')
                .set('Content-Type', 'application/json')
                .send('invalid json')
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('error');
                    
                    done();
                });
        });

        it('should handle missing required parameters', function(done) {
            request(server)
                .post('/parts/api/microphone/test')
                .send({}) // Missing required config
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('error');
                    
                    done();
                });
        });

        it('should handle non-existent endpoints', function(done) {
            request(server)
                .get('/api/non-existent-endpoint')
                .expect(404)
                .end(done);
        });
    });

    describe('Rate Limiting and Security', function() {
        it('should handle multiple concurrent requests', function(done) {
            const requests = Array(5).fill().map(() => 
                request(server)
                    .get('/parts/api/speaker/devices')
                    .expect(200)
            );
            
            Promise.all(requests)
                .then(responses => {
                    responses.forEach(res => {
                        expect(res.body).to.have.property('success');
                    });
                    done();
                })
                .catch(done);
        });

        it('should validate request content types', function(done) {
            request(server)
                .post('/parts/api/microphone/test')
                .set('Content-Type', 'text/plain')
                .send('not json')
                .expect(400)
                .end(done);
        });
    });
});
