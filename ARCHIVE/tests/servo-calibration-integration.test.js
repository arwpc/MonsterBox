const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const WebSocket = require('ws');

describe('Servo Calibration WebSocket Integration', function() {
  this.timeout(15000);
  
  let ws;
  const WS_URL = 'ws://127.0.0.1:8406';
  
  before(function(done) {
    // Connect to the servo WebSocket service
    ws = new WebSocket(WS_URL);
    ws.on('open', () => done());
    ws.on('error', (err) => {
      console.log('WebSocket connection failed - servo service may not be running');
      this.skip();
    });
  });

  after(function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
      let responseReceived = false;

      const handler = (data) => {
        try {
          const response = JSON.parse(data);
          // Skip welcome and status update messages, wait for actual response
          if (response.type === 'welcome' || response.type === 'servo_status_update') {
            return;
          }
          if (!responseReceived) {
            responseReceived = true;
            clearTimeout(timeout);
            ws.off('message', handler);
            resolve(response);
          }
        } catch (e) {
          if (!responseReceived) {
            responseReceived = true;
            clearTimeout(timeout);
            ws.off('message', handler);
            reject(e);
          }
        }
      };

      ws.on('message', handler);
      ws.send(JSON.stringify(message));
    });
  }

  describe('New Calibration Message Types', function() {
    it('should handle get_current_pulse_width message', async function() {
      const message = {
        type: 'get_current_pulse_width',
        servo_id: '29'
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status', 'success');
      expect(response).to.have.property('servo_id', '29');
      expect(response).to.have.property('pulse_width');
      expect(response.pulse_width).to.be.a('number');
    });

    it('should handle save_calibration_position message', async function() {
      const message = {
        type: 'save_calibration_position',
        servo_id: '29',
        position: 'test_position',
        pulse_us: 1500
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status', 'success');
      expect(response.message).to.include('Saved calibration');
    });

    it('should handle get_calibration_status message', async function() {
      const message = {
        type: 'get_calibration_status',
        servo_id: '29'
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status', 'success');
      expect(response).to.have.property('calibration');
      expect(response.calibration).to.have.property('functionality_status');
    });

    it('should handle test_calibrated_position message', async function() {
      const message = {
        type: 'test_calibrated_position',
        servo_id: '29',
        position: 'stop',
        duration: 0.5
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status');
      // May succeed or fail depending on servo type, but should respond
    });
  });

  describe('Error Handling', function() {
    it('should return error for invalid servo ID', async function() {
      const message = {
        type: 'get_current_pulse_width',
        servo_id: '999'
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status', 'error');
      expect(response.message).to.include('not found');
    });

    it('should return error for missing required fields', async function() {
      const message = {
        type: 'save_calibration_position',
        servo_id: '29'
        // Missing position
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status', 'error');
      expect(response.message).to.include('required');
    });
  });

  describe('Backward Compatibility', function() {
    it('should still handle existing servo_move messages', async function() {
      const message = {
        type: 'servo_move',
        servo_id: '29',
        angle: 90,
        duration: 0.5
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status');
      // Should respond (success or error based on hardware availability)
    });

    it('should still handle existing get_servo_status messages', async function() {
      const message = {
        type: 'get_servo_status',
        servo_id: '29'
      };
      
      const response = await sendMessage(message);
      expect(response).to.have.property('status');
    });
  });
});
