/**
 * Audio Setup Page System Tests
 * Tests /setup/audio API endpoints for audio configuration, testing, and VU monitoring
 */

import { expect } from 'chai';
import http from 'http';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function apiGet(path) {
    return new Promise(function (resolve, reject) {
        http.get(BASE + path, { headers: { Accept: 'application/json' } }, function (res) {
            var body = '';
            res.on('data', function (c) { body += c; });
            res.on('end', function () {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch (e) { resolve({ status: res.statusCode, body: body }); }
            });
        }).on('error', reject);
    });
}

function apiPost(path, data) {
    return new Promise(function (resolve, reject) {
        var payload = JSON.stringify(data || {});
        var opts = new URL(BASE + path);
        var req = http.request({
            hostname: opts.hostname,
            port: opts.port,
            path: opts.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        }, function (res) {
            var body = '';
            res.on('data', function (c) { body += c; });
            res.on('end', function () {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch (e) { resolve({ status: res.statusCode, body: body }); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

describe('Audio Setup API', function () {
    this.timeout(10000);

    describe('GET /setup/audio (page)', function () {
        it('should serve the audio setup page', async function () {
            const res = await apiGet('/setup/audio');
            expect(res.status).to.equal(200);
        });
    });

    describe('GET /setup/audio/api/system-config', function () {
        it('should return system audio configuration', async function () {
            const res = await apiGet('/setup/audio/api/system-config');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.config).to.be.an('object');
            expect(res.body.config).to.have.property('defaultSink');
            expect(res.body.config).to.have.property('defaultSource');
            expect(res.body.config).to.have.property('availableSinks');
            expect(res.body.config).to.have.property('availableSources');
            expect(res.body.config.availableSinks).to.be.an('array');
            expect(res.body.config.availableSources).to.be.an('array');
        });

        it('should include pipewire status in config', async function () {
            const res = await apiGet('/setup/audio/api/system-config');
            expect(res.body.config).to.have.property('pipewireStatus');
            expect(res.body.config.pipewireStatus).to.be.an('object');
        });
    });

    describe('POST /setup/audio/api/system-config', function () {
        it('should accept valid sink and source configuration', async function () {
            const res = await apiPost('/setup/audio/api/system-config', {
                defaultSink: 'default',
                defaultSource: 'default'
            });
            expect(res.status).to.equal(200);
            // success may be false if pactl/wpctl not installed — that's OK, 200 is the key assertion
            expect(res.body).to.have.property('success');
        });

        it('should handle auto values without error', async function () {
            const res = await apiPost('/setup/audio/api/system-config', {
                defaultSink: 'auto',
                defaultSource: 'auto'
            });
            expect(res.status).to.equal(200);
            // 'auto' is skipped by the server — should still succeed
            expect(res.body.success).to.equal(true);
        });
    });

    describe('GET /setup/audio/api/outputs', function () {
        it('should return available audio outputs', async function () {
            const res = await apiGet('/setup/audio/api/outputs');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.outputs).to.be.an('array');
            expect(res.body.outputs.length).to.be.greaterThan(0);
            // Each output should have id and name
            res.body.outputs.forEach(function (output) {
                expect(output).to.have.property('id');
                expect(output).to.have.property('name');
            });
        });
    });

    describe('GET /setup/audio/api/inputs', function () {
        it('should return available audio inputs', async function () {
            const res = await apiGet('/setup/audio/api/inputs');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.inputs).to.be.an('array');
            expect(res.body.inputs.length).to.be.greaterThan(0);
            // Each input should have id and name
            res.body.inputs.forEach(function (input) {
                expect(input).to.have.property('id');
                expect(input).to.have.property('name');
            });
        });
    });

    describe('GET /setup/audio/api/hardware-devices', function () {
        it('should return hardware devices with inputs and outputs', async function () {
            const res = await apiGet('/setup/audio/api/hardware-devices');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body.devices).to.be.an('object');
            expect(res.body.devices).to.have.property('outputs');
            expect(res.body.devices).to.have.property('inputs');
            expect(res.body.devices.outputs).to.be.an('array');
            expect(res.body.devices.inputs).to.be.an('array');
        });
    });

    describe('POST /setup/audio/api/test-system', function () {
        it('should handle microphone test', async function () {
            const res = await apiPost('/setup/audio/api/test-system', {
                testType: 'microphone',
                deviceId: 'default'
            });
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success');
            expect(res.body).to.have.property('testType', 'microphone');
            expect(res.body).to.have.property('deviceId');
        });

        it('should handle speaker test', async function () {
            const res = await apiPost('/setup/audio/api/test-system', {
                testType: 'speaker',
                deviceId: 'default'
            });
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success');
            expect(res.body).to.have.property('testType', 'speaker');
        });

        it('should reject invalid test type', async function () {
            const res = await apiPost('/setup/audio/api/test-system', {
                testType: 'invalid',
                deviceId: 'default'
            });
            expect(res.status).to.equal(400);
            expect(res.body.success).to.equal(false);
        });
    });

    describe('GET /setup/audio/api/audio-levels', function () {
        it('should return input audio level for VU meter', async function () {
            const res = await apiGet('/setup/audio/api/audio-levels?deviceId=default&deviceType=input');
            expect(res.status).to.equal(200);
            // Accept both success and failure — hardware mic may not be available
            if (res.body.success) {
                expect(res.body).to.have.property('level');
                expect(res.body.level).to.be.a('number');
                expect(res.body.level).to.be.at.least(0);
                expect(res.body).to.have.property('type', 'input');
            } else {
                expect(res.body).to.have.property('error');
            }
        });

        it('should return device ID in response', async function () {
            const res = await apiGet('/setup/audio/api/audio-levels?deviceId=default&deviceType=input');
            if (res.body.success) {
                expect(res.body).to.have.property('deviceId');
            }
        });
    });

    describe('GET /setup/audio/api/input-level', function () {
        it('should return quick input level test result', async function () {
            const res = await apiGet('/setup/audio/api/input-level?device=default');
            expect(res.status).to.equal(200);
            // Accept both success and failure — hardware may not have a working mic
            // When success: response has level (number) and device
            // When failure: response has error (string)
            if (res.body.success) {
                expect(res.body).to.have.property('level');
                expect(res.body.level).to.be.a('number');
                expect(res.body).to.have.property('device');
            } else {
                expect(res.body).to.have.property('error');
            }
        });
    });

    describe('GET /setup/audio/api/active-streams', function () {
        it('should return active streams list', async function () {
            const res = await apiGet('/setup/audio/api/active-streams');
            expect(res.status).to.equal(200);
            expect(res.body.success).to.equal(true);
            expect(res.body).to.have.property('streams');
            expect(res.body.streams).to.be.an('array');
        });
    });

    describe('POST /setup/audio/api/set-input-gain', function () {
        it('should reject request without sourceId', async function () {
            const res = await apiPost('/setup/audio/api/set-input-gain', {
                gainPercent: 100
            });
            expect(res.status).to.equal(400);
            expect(res.body.success).to.equal(false);
        });

        it('should reject request without gain value', async function () {
            const res = await apiPost('/setup/audio/api/set-input-gain', {
                sourceId: 'default'
            });
            expect(res.status).to.equal(400);
            expect(res.body.success).to.equal(false);
        });
    });

    describe('POST /api/elevenlabs/stt/testSample (Mic Calibration)', function () {
        it('should capture audio sample in dry-run mode', async function () {
            const res = await apiPost('/api/elevenlabs/stt/testSample?duration=1&dryRun=1', {
                deviceId: 'default'
            });
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('sizeBytes').that.is.a('number');
            expect(res.body.sizeBytes).to.be.greaterThan(0);
            expect(res.body).to.have.property('usedPath').that.is.a('string');
        });

        it('should capture and attempt transcription', async function () {
            this.timeout(15000);
            const res = await apiPost('/api/elevenlabs/stt/testSample?duration=1', {
                deviceId: 'default'
            });
            // May succeed or fail depending on ElevenLabs API key and ambient audio
            expect(res.status).to.be.oneOf([200, 400, 500]);
            expect(res.body).to.have.property('success').that.is.a('boolean');
        });
    });
});
