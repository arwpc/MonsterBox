/**
 * Movement & Resource API System Tests
 * Tests /api/movement and /api/resource endpoints
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Movement API', function () {
    this.timeout(10000);

    // Use character 1 (default in test mode)
    const testCharId = 1;

    describe('GET /api/movement/config/:characterId', () => {
        it('should return a config object with idle and microMovement sections', async () => {
            const res = await request(BASE_URL)
                .get(`/api/movement/config/${testCharId}`)
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('config');
            const config = res.body.config;
            expect(config).to.have.property('idle');
            expect(config).to.have.property('microMovement');
            expect(config.idle).to.have.property('enabled');
            expect(config.microMovement).to.have.property('enabled');
        });

        it('should return default config for non-existent character', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/config/99999')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body.config).to.have.property('idle');
            expect(res.body.config).to.have.property('microMovement');
        });
    });

    describe('PUT /api/movement/config/:characterId', () => {
        let originalConfig;

        before(async () => {
            const res = await request(BASE_URL)
                .get(`/api/movement/config/${testCharId}`);
            originalConfig = res.body.config;
        });

        after(async () => {
            // Restore original config
            if (originalConfig) {
                await request(BASE_URL)
                    .put(`/api/movement/config/${testCharId}`)
                    .send(originalConfig);
            }
        });

        it('should update movement config and return success', async () => {
            const updatedConfig = {
                ...originalConfig,
                characterPersonality: 'test-personality',
                idle: { ...originalConfig.idle, minHoldMs: 5000 }
            };
            const res = await request(BASE_URL)
                .put(`/api/movement/config/${testCharId}`)
                .send(updatedConfig)
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('message');
        });

        it('should persist the updated config', async () => {
            const res = await request(BASE_URL)
                .get(`/api/movement/config/${testCharId}`)
                .expect(200);
            expect(res.body.config).to.have.property('characterPersonality', 'test-personality');
            expect(res.body.config.idle).to.have.property('minHoldMs', 5000);
        });
    });

    describe('POST /api/movement/idle/start', () => {
        it('should return success or 503 if service unavailable', async () => {
            const res = await request(BASE_URL)
                .post('/api/movement/idle/start')
                .send({});
            // In test mode, idle loop service may or may not be available
            expect([200, 503]).to.include(res.status);
            expect(res.body).to.have.property('success');
        });
    });

    describe('POST /api/movement/idle/stop', () => {
        it('should return success or 503 if service unavailable', async () => {
            const res = await request(BASE_URL)
                .post('/api/movement/idle/stop')
                .send({});
            expect([200, 503]).to.include(res.status);
            expect(res.body).to.have.property('success');
        });
    });

    describe('GET /api/movement/idle/status', () => {
        it('should return a status object', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/idle/status')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('status');
            // Status should indicate running state
            if (res.body.status.available === false) {
                expect(res.body.status).to.have.property('running', false);
            } else {
                expect(res.body.status).to.have.property('running');
            }
        });
    });

    describe('GET /api/movement/telemetry', () => {
        it('should return telemetry data', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/telemetry')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('telemetry');
            // Telemetry may be empty object if service not loaded, or have metrics
            expect(res.body.telemetry).to.be.an('object');
        });

        it('should accept period query parameter', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/telemetry?period=60000')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('periodMs', 60000);
        });
    });

    describe('GET /api/movement/claims', () => {
        it('should return claims object', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/claims')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('claims');
            expect(res.body.claims).to.be.an('object');
        });
    });

    describe('POST /api/movement/transition/test', () => {
        it('should return 503 or positions for a test transition', async () => {
            const res = await request(BASE_URL)
                .post('/api/movement/transition/test')
                .send({
                    partId: 'test-servo',
                    fromAngle: 0,
                    toAngle: 90,
                    easing: 'ease_in_out',
                    durationMs: 500
                });
            // Transition engine may not be available in test mode
            expect([200, 503]).to.include(res.status);
            if (res.status === 200) {
                expect(res.body).to.have.property('success', true);
                expect(res.body).to.have.property('positions');
                expect(res.body.positions).to.be.an('array');
                expect(res.body).to.have.property('count');
                expect(res.body.count).to.be.greaterThan(0);
            }
        });

        it('should return 400 when missing required angles', async () => {
            const res = await request(BASE_URL)
                .post('/api/movement/transition/test')
                .send({ partId: 'test-servo' });
            // 400 if engine available, 503 if not
            expect([400, 503]).to.include(res.status);
            expect(res.body).to.have.property('success', false);
        });
    });

    describe('GET /api/movement/telemetry/servo/:partId', () => {
        it('should return servo health for a given part', async () => {
            const res = await request(BASE_URL)
                .get('/api/movement/telemetry/servo/1')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('health');
            expect(res.body.health).to.be.an('object');
            expect(res.body.health).to.have.property('status');
        });
    });
});

describe('Resource API', function () {
    this.timeout(10000);

    describe('GET /api/resource/status', () => {
        it('should return full resource status', async () => {
            const res = await request(BASE_URL)
                .get('/api/resource/status')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('status');
            const status = res.body.status;
            expect(status).to.have.property('pid').that.is.a('number');
            expect(status).to.have.property('uptime').that.is.a('number');
            expect(status).to.have.property('uptimeFormatted').that.is.a('string');
            expect(status).to.have.property('environment').that.is.a('string');
            expect(status).to.have.property('memory');
            expect(status.memory).to.have.property('rssMB').that.is.a('number');
            expect(status.memory).to.have.property('heapUsedMB').that.is.a('number');
            expect(status.memory).to.have.property('systemFreeMB').that.is.a('number');
            expect(status.memory).to.have.property('systemTotalMB').that.is.a('number');
            expect(status).to.have.property('cpu');
            expect(status.cpu).to.have.property('cores').that.is.a('number');
            expect(status).to.have.property('nodeVersion').that.is.a('string');
            expect(status).to.have.property('platform').that.is.a('string');
        });
    });

    describe('GET /api/resource/memory', () => {
        it('should return current memory reading', async () => {
            const res = await request(BASE_URL)
                .get('/api/resource/memory')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('memory');
            const mem = res.body.memory;
            expect(mem).to.have.property('rssMB').that.is.a('number');
            expect(mem).to.have.property('heapUsedMB').that.is.a('number');
            expect(mem).to.have.property('heapTotalMB').that.is.a('number');
            expect(mem).to.have.property('systemFreeMB').that.is.a('number');
            expect(mem).to.have.property('systemTotalMB').that.is.a('number');
            expect(mem).to.have.property('level').that.is.a('string');
        });

        it('memory values should be positive', async () => {
            const res = await request(BASE_URL)
                .get('/api/resource/memory')
                .expect(200);
            const mem = res.body.memory;
            expect(mem.rssMB).to.be.greaterThan(0);
            expect(mem.heapUsedMB).to.be.greaterThan(0);
            expect(mem.systemTotalMB).to.be.greaterThan(0);
        });
    });

    describe('GET /api/resource/health', () => {
        it('should return health data or null message', async () => {
            const res = await request(BASE_URL)
                .get('/api/resource/health')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            // health may be null if no startup health check file exists
            if (res.body.health === null) {
                expect(res.body).to.have.property('message');
            } else {
                expect(res.body.health).to.be.an('object');
            }
        });
    });

    describe('GET /api/resource/pid', () => {
        it('should return PID info', async () => {
            const res = await request(BASE_URL)
                .get('/api/resource/pid')
                .expect(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('pid').that.is.a('number');
            expect(res.body).to.have.property('startedAt').that.is.a('string');
            expect(res.body).to.have.property('uptimeSeconds').that.is.a('number');
            expect(res.body.pid).to.be.greaterThan(0);
        });
    });
});
