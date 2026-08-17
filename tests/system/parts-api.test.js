/**
 * Parts API System Tests
 * Tests /api/parts endpoints including type-aware test dispatch
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

describe('Parts API', function () {
    this.timeout(10000);

    describe('GET /api/parts', function () {
        it('should return parts with success wrapper', async function () {
            var res = await apiGet('/api/parts');
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('parts');
            expect(res.body.parts).to.be.an('array');
            expect(res.body.parts.length).to.be.greaterThan(0);
        });

        it('each part should have id, name, and type', async function () {
            var res = await apiGet('/api/parts');
            res.body.parts.forEach(function (part) {
                expect(part).to.have.property('id');
                expect(part).to.have.property('name');
                expect(part).to.have.property('type');
            });
        });
    });

    describe('GET /api/parts/:id', function () {
        it('should return a single part by ID', async function () {
            var listRes = await apiGet('/api/parts');
            var firstPart = listRes.body.parts[0];
            var res = await apiGet('/api/parts/' + firstPart.id);
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('part');
            expect(res.body.part).to.have.property('id', firstPart.id);
            expect(res.body.part).to.have.property('name', firstPart.name);
        });

        it('should return 404 for non-existent part', async function () {
            var res = await apiGet('/api/parts/99999');
            expect(res.status).to.equal(404);
        });
    });

    describe('POST /api/parts/:id/test', function () {
        it('should return 404 for non-existent part', async function () {
            var res = await apiPost('/api/parts/99999/test', {});
            expect(res.status).to.equal(404);
            expect(res.body).to.have.property('error');
        });

        it('should dispatch motion_sensor parts with testResult', async function () {
            var listRes = await apiGet('/api/parts');
            var sensor = listRes.body.parts.find(function (p) { return p.type === 'motion_sensor'; });
            if (!sensor) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + sensor.id + '/test', {});
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('testResult');
            expect(res.body.testResult).to.have.property('motionDetected');
            expect(res.body).to.have.property('part');
            expect(res.body.part.type).to.equal('motion_sensor');
        });

        it('should support detectMotion action for motion_sensor', async function () {
            var listRes = await apiGet('/api/parts');
            var sensor = listRes.body.parts.find(function (p) { return p.type === 'motion_sensor'; });
            if (!sensor) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + sensor.id + '/test', {
                action: 'detectMotion',
                params: { duration: 2 }
            });
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('testResult');
            expect(res.body.testResult).to.have.property('detections');
            expect(res.body.testResult).to.have.property('duration', 2);
        });

        it('should dispatch servo parts without testResult wrapper', async function () {
            // Pick a servo the safety config says is safe to drive on a real node.
            // Taking "the first servo" meant this suite physically commanded a
            // quarantined servo on a shared fuse rail every run.
            var safety = await import('../../services/hardwareService/safetyLimits.js');
            var cfg = await import('../../services/configService.js');
            var characterId = (await cfg.readConfig()).selectedCharacter;

            var listRes = await apiGet('/api/parts');
            var servos = listRes.body.parts.filter(function (p) { return p.type === 'servo'; });
            var servo = null;
            for (var i = 0; i < servos.length; i++) {
                if (await safety.isTestSafePart(characterId, servos[i].id)) { servo = servos[i]; break; }
            }
            if (!servo) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + servo.id + '/test', { position: 50, duration: 100 });
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success');
            expect(res.body).to.have.property('part');
            expect(res.body.part.type).to.equal('servo');
        });

        it('honours the angle in the Pose-Editor request shape', async function () {
            // The servo branch used to read only req.body.position, so the shape
            // the Pose Editor and calibration pages actually send —
            // {action:'moveToAngle', params:{angleDeg}} — silently fell through
            // to a default of 50°. Every servo went to the same place no matter
            // what was asked, and the response still claimed success. The message
            // now echoes the commanded angle, which this asserts on.
            var safety = await import('../../services/hardwareService/safetyLimits.js');
            var cfg = await import('../../services/configService.js');
            var characterId = (await cfg.readConfig()).selectedCharacter;

            var listRes = await apiGet('/api/parts');
            var servos = listRes.body.parts.filter(function (p) { return p.type === 'servo'; });
            var servo = null;
            for (var i = 0; i < servos.length; i++) {
                if (await safety.isTestSafePart(characterId, servos[i].id)) { servo = servos[i]; break; }
            }
            if (!servo) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + servo.id + '/test', {
                action: 'moveToAngle', params: { angleDeg: 77, duration: 100 }
            });
            expect(res.status).to.equal(200);
            expect(res.body.message, 'the commanded angle must reach the hardware layer')
                .to.contain('77');
        });

        it('rejects a servo test that names no angle at all', async function () {
            var listRes = await apiGet('/api/parts');
            var servo = listRes.body.parts.filter(function (p) { return p.type === 'servo'; })[0];
            if (!servo) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + servo.id + '/test', { action: 'moveToAngle' });
            // A missing angle used to become a silent move to 50°. Refusing is
            // the only honest answer: the caller's intent is unknown.
            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('success', false);
        });

        it('refuses a quarantined part and says why', async function () {
            // The safety layer is only real if it holds at the HTTP boundary. A
            // quarantined part previously returned 200 with a message that read
            // like success while discarding the reason.
            var safety = await import('../../services/hardwareService/safetyLimits.js');
            var cfg = await import('../../services/configService.js');
            var characterId = (await cfg.readConfig()).selectedCharacter;

            var listRes = await apiGet('/api/parts');
            var blocked = null;
            for (var i = 0; i < listRes.body.parts.length; i++) {
                var p = listRes.body.parts[i];
                var s = await safety.getPartSafety(characterId, p.id);
                if (s.blockAllMotion) { blocked = p; break; }
            }
            if (!blocked) { this.skip(); return; }

            var res = await apiPost('/api/parts/' + blocked.id + '/test', {});
            expect(res.status, 'a refusal must not be a 200').to.equal(409);
            expect(res.body).to.have.property('success', false);
            expect(res.body).to.have.property('blockedBySafetyLimit', true);
            expect(res.body.error, 'the operator must be told why').to.be.a('string').and.not.be.empty;
        });
    });
});

describe('Theme API', function () {
    this.timeout(5000);

    var originalTheme;

    before(async function () {
        var res = await apiGet('/api/config');
        if (res.body && res.body.config) {
            originalTheme = res.body.config.theme;
        }
    });

    after(async function () {
        if (originalTheme) {
            await apiPost('/api/config/theme', { theme: originalTheme });
        }
    });

    it('should accept valid Bootswatch theme', async function () {
        var res = await apiPost('/api/config/theme', { theme: 'solar' });
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
        expect(res.body.theme).to.equal('solar');
    });

    it('should accept default-dark theme', async function () {
        var res = await apiPost('/api/config/theme', { theme: 'default-dark' });
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
    });

    it('should map legacy dark to default-dark', async function () {
        var res = await apiPost('/api/config/theme', { theme: 'dark' });
        expect(res.status).to.equal(200);
        expect(res.body.theme).to.equal('default-dark');
    });

    it('should map legacy light to default-light', async function () {
        var res = await apiPost('/api/config/theme', { theme: 'light' });
        expect(res.status).to.equal(200);
        expect(res.body.theme).to.equal('default-light');
    });

    it('should reject invalid theme', async function () {
        var res = await apiPost('/api/config/theme', { theme: 'nonexistent' });
        expect(res.status).to.equal(400);
        expect(res.body.success).to.be.false;
    });

    it('should reject empty theme', async function () {
        var res = await apiPost('/api/config/theme', { theme: '' });
        expect(res.status).to.equal(400);
        expect(res.body.success).to.be.false;
    });
});
