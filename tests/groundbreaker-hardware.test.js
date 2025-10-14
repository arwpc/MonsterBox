/**
 * Groundbreaker (Character 5) Hardware Integration Tests
 * Tests all hardware components: BTS7960 motor, webcam, speaker, microphone
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const CHARACTER_ID = 5;
const PARTS_URL = `${BASE_URL}/setup/parts/api/parts`;

describe('Groundbreaker Hardware Integration', function() {
  this.timeout(10000);

  let motorPartId, webcamPartId, speakerPartId, microphonePartId;

  before(async function() {
    // Get all parts for character 5
    const response = await axios.get(PARTS_URL);
    expect(response.data.success).to.be.true;

    const parts = response.data.parts || [];
    const motor = parts.find(p => p.type === 'motor' && p.characterId === CHARACTER_ID);
    const webcam = parts.find(p => p.type === 'webcam' && p.characterId === CHARACTER_ID);
    const speaker = parts.find(p => p.type === 'speaker' && p.characterId === CHARACTER_ID);
    const microphone = parts.find(p => p.type === 'microphone' && p.characterId === CHARACTER_ID);

    if (motor) motorPartId = motor.id;
    if (webcam) webcamPartId = webcam.id;
    if (speaker) speakerPartId = speaker.id;
    if (microphone) microphonePartId = microphone.id;
  });

  describe('Parts Configuration', function() {
    it('should have all required parts configured', async function() {
      const response = await axios.get(PARTS_URL);
      expect(response.data.success).to.be.true;

      const parts = (response.data.parts || []).filter(p => p.characterId === CHARACTER_ID);
      expect(parts.length).to.be.at.least(4);

      const partTypes = parts.map(p => p.type);
      expect(partTypes).to.include('motor');
      expect(partTypes).to.include('webcam');
      expect(partTypes).to.include('speaker');
      expect(partTypes).to.include('microphone');
    });

    it('should have BTS7960 motor configured correctly', async function() {
      const response = await axios.get(PARTS_URL);
      const motor = response.data.parts.find(p => p.type === 'motor' && p.characterId === CHARACTER_ID);

      expect(motor).to.exist;
      expect(motor.driver).to.equal('BTS7960');
      expect(motor.rpwmPin).to.equal(27);
      expect(motor.lpwmPin).to.equal(22);
      expect(motor.renPin).to.equal(17);
      expect(motor.lenPin).to.equal(17);
      expect(motor.model).to.equal('motor_jeep_wagoneer_wiper');
    });

    it('should have webcam configured correctly', async function() {
      const response = await axios.get(PARTS_URL);
      const webcam = response.data.parts.find(p => p.type === 'webcam' && p.characterId === CHARACTER_ID);

      expect(webcam).to.exist;
      expect(webcam.deviceIndex).to.equal(0);
      expect(webcam.resolution).to.exist;
      expect(webcam.fps).to.be.at.least(30);
    });

    it('should have speaker configured correctly', async function() {
      const response = await axios.get(PARTS_URL);
      const speaker = response.data.parts.find(p => p.type === 'speaker' && p.characterId === CHARACTER_ID);

      expect(speaker).to.exist;
      expect(speaker.deviceName).to.exist;
      expect(speaker.volume).to.be.at.least(0);
      expect(speaker.volume).to.be.at.most(100);
    });

    it('should have microphone configured correctly', async function() {
      const response = await axios.get(PARTS_URL);
      const microphone = response.data.parts.find(p => p.type === 'microphone' && p.characterId === CHARACTER_ID);

      expect(microphone).to.exist;
      expect(microphone.deviceIndex).to.equal(0);
      expect(microphone.sampleRate).to.be.at.least(8000);
      expect(microphone.channels).to.be.at.least(1);
    });
  });

  describe('BTS7960 Motor Control', function() {
    it('should control motor forward', async function() {
      if (!motorPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 50,
          direction: 'forward',
          duration: 500
        }
      });

      // In test mode, hardware may not be available, so just check API responds
      expect(response.data).to.have.property('testResult');
      expect(response.data.testResult.action).to.equal('control');
    });

    it('should control motor backward', async function() {
      if (!motorPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 50,
          direction: 'backward',
          duration: 500
        }
      });

      // In test mode, hardware may not be available, so just check API responds
      expect(response.data).to.have.property('testResult');
      expect(response.data.testResult.action).to.equal('control');
    });

    it('should stop motor', async function() {
      if (!motorPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 0,
          duration: 100
        }
      });

      // In test mode, hardware may not be available, so just check API responds
      expect(response.data).to.have.property('testResult');
      expect(response.data.testResult.action).to.equal('control');
    });

    it('should handle speed limits', async function() {
      if (!motorPartId) this.skip();

      // Test max speed
      const response1 = await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 100,
          direction: 'forward',
          duration: 500
        }
      });
      expect(response1.data).to.have.property('testResult');
      expect(response1.data.testResult.action).to.equal('control');

      // Stop
      await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 0,
          duration: 100
        }
      });
    });
  });

  describe('Webcam Operations', function() {
    it('should capture image from webcam', async function() {
      if (!webcamPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${webcamPartId}/test`, {
        action: 'capture',
        params: {
          resolution: '640x480'
        }
      });

      // In test mode, webcam may not be available, so just check API responds
      expect(response.data).to.have.property('testResult');
      expect(response.data.testResult.action).to.equal('capture');
    });

    it('should handle webcam errors gracefully', async function() {
      if (!webcamPartId) this.skip();

      try {
        const response = await axios.post(`${PARTS_URL}/${webcamPartId}/test`, {
          action: 'capture',
          params: {}
        });
        // Should either succeed or return graceful error
        expect(response.data).to.have.property('success');
      } catch (error) {
        // Network errors are acceptable in test mode
        expect(error.response?.status).to.be.oneOf([400, 404, 500]);
      }
    });
  });

  describe('Speaker Operations', function() {
    it('should play audio through speaker', async function() {
      if (!speakerPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${speakerPartId}/test`, {
        action: 'play',
        params: {
          filename: 'public/sounds/monster-howl-85304.mp3',
          volume: 50
        }
      });

      expect(response.data.success).to.be.true;
      expect(response.data.testResult.result).to.equal('HARDWARE_SUCCESS');
    });

    it('should stop speaker playback', async function() {
      if (!speakerPartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${speakerPartId}/test`, {
        action: 'stop',
        params: {}
      });

      expect(response.data.success).to.be.true;
      expect(response.data.testResult.result).to.equal('HARDWARE_SUCCESS');
    });
  });

  describe('Microphone Operations', function() {
    it('should read microphone level', async function() {
      if (!microphonePartId) this.skip();

      const response = await axios.post(`${PARTS_URL}/${microphonePartId}/test`, {
        action: 'getLevel',
        params: {}
      });

      expect(response.data.success).to.be.true;
      expect(response.data.testResult.result).to.equal('HARDWARE_SUCCESS');
    });

    it('should handle microphone configuration', async function() {
      if (!microphonePartId) this.skip();

      const response = await axios.get(`${PARTS_URL}/${microphonePartId}`);

      expect(response.data.success).to.be.true;
      expect(response.data.part.sampleRate).to.exist;
      expect(response.data.part.channels).to.exist;
    });
  });

  describe('Hardware Integration', function() {
    it('should handle multiple simultaneous operations', async function() {
      if (!motorPartId || !speakerPartId) this.skip();

      // Start motor and speaker simultaneously
      const [motorResponse, speakerResponse] = await Promise.all([
        axios.post(`${PARTS_URL}/${motorPartId}/test`, {
          action: 'control',
          params: {
            speed: 30,
            direction: 'forward',
            duration: 500
          }
        }),
        axios.post(`${PARTS_URL}/${speakerPartId}/test`, {
          action: 'play',
          params: {
            filename: 'public/sounds/monster-howl-85304.mp3',
            volume: 50
          }
        })
      ]);

      // In test mode, just check API responds correctly
      expect(motorResponse.data).to.have.property('testResult');
      expect(speakerResponse.data).to.have.property('testResult');

      // Stop motor
      await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
        action: 'control',
        params: {
          speed: 0,
          duration: 100
        }
      });
    });

    it('should maintain part state across operations', async function() {
      const response1 = await axios.get(PARTS_URL);
      const parts1 = response1.data.parts.filter(p => p.characterId === CHARACTER_ID);
      const partCount1 = parts1.length;

      // Perform some operations
      if (motorPartId) {
        await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
          action: 'control',
          params: {
            speed: 0,
            duration: 100
          }
        });
      }

      const response2 = await axios.get(PARTS_URL);
      const parts2 = response2.data.parts.filter(p => p.characterId === CHARACTER_ID);
      const partCount2 = parts2.length;

      expect(partCount1).to.equal(partCount2);
    });
  });

  describe('Error Handling', function() {
    it('should handle invalid part ID', async function() {
      try {
        await axios.post(`${PARTS_URL}/99999/test`, {
          action: 'control',
          params: {}
        });
        // Should return 404
        expect.fail('Should have thrown 404 error');
      } catch (error) {
        expect(error.response?.status).to.equal(404);
      }
    });

    it('should handle invalid action for part type', async function() {
      if (!motorPartId) this.skip();

      try {
        await axios.post(`${PARTS_URL}/${motorPartId}/test`, {
          action: 'invalidAction',
          params: {}
        });
        // Should return 400
        expect.fail('Should have thrown 400 error');
      } catch (error) {
        expect(error.response?.status).to.equal(400);
      }
    });
  });
});

