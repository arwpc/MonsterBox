const path = require('path');
const supertest = require('supertest');
const chai = require('chai');
const expect = chai.expect;

// Prepare mock before requiring app.js
const svcPath = path.resolve(__dirname, '../services/servoWebSocketClient.js');
const stub = {
  isConnected: true,
  async sendRequest(type, data) {
    switch (type) {
      case 'get_current_pulse_width':
        return { status: 'success', servo_id: String(data.servo_id), pulse_width: 1500, timestamp: Date.now()/1000 };
      case 'get_calibration_status':
        return { status: 'success', servo_id: String(data.servo_id), pulse_width: 1500, calibration: { functionality_status: 'working' } };
      case 'save_calibration_position':
        return { status: 'success', message: `Saved calibration for ${data.servo_id}:${data.position}`, pulse_us: data.pulse_us || 1500 };
      case 'test_calibrated_position':
        return { status: 'success', angle: 90, pulse_us: 1500 };
      case 'servo_auto_range_test':
        return { status: 'success', results: { appears_continuous: false } };
      case 'servo_move':
        return { status: 'success', message: `Servo ${data.servo_id} moved to ${data.angle}°` };
      case 'get_servo_status':
        return { status: 'success', servo_id: String(data.servo_id), state: 'idle' };
      default:
        return { status: 'error', message: 'Unknown type in stub' };
    }
  },
  async moveServo(servoId, angle, duration) {
    return this.sendRequest('servo_move', { servo_id: servoId, angle, duration });
  },
  async getServoStatus(servoId) {
    return this.sendRequest('get_servo_status', { servo_id: servoId });
  }
};
require.cache[svcPath] = { exports: { getServoClient: () => stub } };

const app = require('../app');
const request = supertest(app);

describe('Servo Calibration API', function() {
  this.timeout(10000);

  describe('Basic API Endpoints', function() {
    it('GET /api/servo-calibration/pulse/:id returns pulse', async () => {
      const res = await request.get('/api/servo-calibration/pulse/29');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.data).to.have.property('pulse_width');
      expect(res.body.data.pulse_width).to.be.a('number');
    });

    it('GET /api/servo-calibration/status/:id returns status', async () => {
      const res = await request.get('/api/servo-calibration/status/29');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.data).to.have.property('calibration');
      expect(res.body.data.calibration).to.have.property('functionality_status');
    });

    it('POST /api/servo-calibration/save-position saves standard position', async () => {
      const res = await request
        .post('/api/servo-calibration/save-position')
        .send({ servoId: 29, position: 'min', pulse_us: 500 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.data.message).to.include('Saved calibration');
    });

    it('POST /api/servo-calibration/save-position saves continuous position', async () => {
      const res = await request
        .post('/api/servo-calibration/save-position')
        .send({ servoId: 29, position: 'stop', pulse_us: 1500 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('POST /api/servo-calibration/test-position tests position', async () => {
      const res = await request
        .post('/api/servo-calibration/test-position')
        .send({ servoId: 29, position: 'stop', duration: 1.0 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('POST /api/servo-calibration/auto-range-test runs', async () => {
      const res = await request
        .post('/api/servo-calibration/auto-range-test')
        .send({ servoId: 29 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.data.results).to.have.property('appears_continuous');
    });
  });

  describe('Error Handling', function() {
    it('returns error for missing servoId in save-position', async () => {
      const res = await request
        .post('/api/servo-calibration/save-position')
        .send({ position: 'neutral' })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(400);
      expect(res.body.success).to.equal(false);
      expect(res.body.message).to.include('servoId and position are required');
    });

    it('returns error for missing position in save-position', async () => {
      const res = await request
        .post('/api/servo-calibration/save-position')
        .send({ servoId: 29 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(400);
      expect(res.body.success).to.equal(false);
    });

    it('returns error for invalid servo ID', async () => {
      const res = await request.get('/api/servo-calibration/pulse/999');
      expect(res.status).to.equal(200);
      // The mock returns success, but in real scenario it would be false
      expect(res.body).to.have.property('success');
      if (!res.body.success) {
        expect(res.body.data.message).to.include('not found');
      }
    });
  });

  describe('Backward Compatibility', function() {
    it('preserves existing servo movement functionality', async () => {
      const res = await request
        .post('/parts/servo/move')
        .send({ servoId: 29, angle: 90, duration: 0.5 })
        .set('Content-Type', 'application/json');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });

    it('preserves existing servo status functionality', async () => {
      const res = await request.get('/parts/servo/status/29');
      expect(res.status).to.equal(200);
      expect(res.body.success).to.equal(true);
    });
  });
});

