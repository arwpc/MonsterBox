/**
 * Jaw Animation Super Power Comprehensive Test Suite
 * Tests service functionality, API endpoints, audio integration, and UI components
 * Following MonsterBox testing patterns with ES5 compatibility
 */

import { expect } from 'chai';
import axios from 'axios';
import sinon from 'sinon';

const BASE_URL = 'http://localhost:3000';

// Helper function to create a test servo for jaw animation
async function createTestServo(characterId, name = 'Test Jaw Servo') {
  const servoData = {
    name: name,
    type: 'servo',
    pin: 18,
    description: 'Test servo for jaw animation',
    config: {
      servoType: 'standard',
      controllerType: 'pca9685',
      channel: 0,
      minAngle: 0,
      maxAngle: 180,
      neutralAngle: 90
    }
  };

  const response = await axios.post(`${BASE_URL}/setup/parts/api/parts`, servoData, { 
    validateStatus: () => true 
  });
  
  expect(response.status).to.equal(201);
  expect(response.data).to.have.property('success', true);
  return response.data.part;
}

// Helper function to create test character
async function createTestCharacter(name = 'Test Jaw Character') {
  const characterData = {
    name: name,
    description: 'Test character for jaw animation',
    isActive: true
  };

  const response = await axios.post(`${BASE_URL}/characters`, characterData, {
    validateStatus: () => true
  });
  
  if (response.status === 201) {
    return response.data.character;
  }
  // Character might already exist, try to find it
  const getResponse = await axios.get(`${BASE_URL}/characters`, {
    validateStatus: () => true
  });
  
  if (getResponse.status === 200) {
    const existingCharacter = getResponse.data.characters.find(char => char.name === name);
    if (existingCharacter) {
      return existingCharacter;
    }
  }
  
  throw new Error('Failed to create or find test character');
}

// Cleanup helper
async function cleanupTestData(characterId, servoId) {
  try {
    if (servoId) {
      await axios.delete(`${BASE_URL}/setup/parts/api/parts/${servoId}`, { 
        validateStatus: () => true 
      });
    }
    if (characterId) {
      await axios.delete(`${BASE_URL}/characters/${characterId}`, { 
        validateStatus: () => true 
      });
    }
  } catch (error) {
    console.warn('Cleanup error:', error.message);
  }
}

describe('Jaw Animation Super Power System', () => {
  let testCharacter;
  let testServo;
  
  before(async () => {
    // Create test data for the entire suite
    testCharacter = await createTestCharacter('Jaw Test Character');
    testServo = await createTestServo(testCharacter.id, 'Jaw Test Servo');
  });

  after(async () => {
    // Cleanup test data
    await cleanupTestData(testCharacter?.id, testServo?.id);
  });

  describe('Jaw Animation Service', () => {
    it('should handle jaw configuration creation', async () => {
      const configData = {
        servoId: testServo.id,
        minAngle: 10,
        maxAngle: 170,
        neutralAngle: 90,
        amplitudeThreshold: 0.1,
        smoothingFactor: 0.3,
        enabled: true
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`, 
        configData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('message', 'Jaw animation configuration saved successfully');
      expect(response.data.config).to.deep.include(configData);
    });

    it('should retrieve jaw configuration', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('config');
      expect(response.data.config).to.have.property('servoId', testServo.id);
      expect(response.data.config).to.have.property('enabled', true);
    });

    it('should handle jaw configuration updates', async () => {
      const updateData = {
        minAngle: 15,
        maxAngle: 165,
        amplitudeThreshold: 0.15,
        smoothingFactor: 0.4
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`, 
        updateData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data.config).to.deep.include(updateData);
    });

    it('should handle missing character gracefully', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/nonexistent-id`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(404);
      expect(response.data).to.have.property('success', false);
      expect(response.data).to.have.property('error');
    });

    it('should validate configuration parameters', async () => {
      const invalidData = {
        servoId: 'invalid-id',
        minAngle: -10, // Invalid negative angle
        maxAngle: 200, // Invalid high angle
        amplitudeThreshold: -0.1 // Invalid negative threshold
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`, 
        invalidData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(400);
      expect(response.data).to.have.property('success', false);
      expect(response.data).to.have.property('error');
    });
  });

  describe('Jaw Animation Testing Endpoints', () => {
    it('should test jaw movement with valid parameters', async () => {
      const testData = {
        angle: 45,
        duration: 1000
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}/test`, 
        testData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('testResult');
      expect(response.data.testResult).to.have.property('angle', testData.angle);
    });

    it('should handle test with invalid angle', async () => {
      const testData = {
        angle: 250, // Invalid angle
        duration: 1000
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}/test`, 
        testData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(400);
      expect(response.data).to.have.property('success', false);
      expect(response.data).to.have.property('error');
    });

    it('should test amplitude-based jaw movement', async () => {
      const testData = {
        amplitude: 0.75,
        duration: 500
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}/test`, 
        testData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data.testResult).to.have.property('amplitude', testData.amplitude);
    });
  });

  describe('Audio Level Monitoring', () => {
    it('should provide current audio levels', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/audio-levels`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('levels');
      expect(response.data.levels).to.have.property('amplitude');
      expect(response.data.levels).to.have.property('timestamp');
      expect(response.data.levels.amplitude).to.be.a('number');
      expect(response.data.levels.amplitude).to.be.at.least(0);
      expect(response.data.levels.amplitude).to.be.at.most(1);
    });

    it('should include smoothed amplitude values', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/audio-levels`,
        { validateStatus: () => true }
      );

      expect(response.data.levels).to.have.property('smoothedAmplitude');
      expect(response.data.levels.smoothedAmplitude).to.be.a('number');
    });

    it('should provide jaw angle calculations', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/audio-levels/${testCharacter.id}`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('levels');
      expect(response.data.levels).to.have.property('calculatedJawAngle');
      expect(response.data.levels.calculatedJawAngle).to.be.a('number');
    });
  });

  describe('Character Integration', () => {
    it('should list characters with jaw animation status', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/super-powers/api/characters`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('characters');
      expect(response.data.characters).to.be.an('array');
      
      const testChar = response.data.characters.find(char => char.id === testCharacter.id);
      expect(testChar).to.exist;
      expect(testChar).to.have.property('jawAnimationEnabled');
    });

    it('should handle character deletion with jaw config cleanup', async () => {
      // Create a temporary character for deletion test
      const tempCharacter = await createTestCharacter('Temp Delete Test');
      const tempServo = await createTestServo(tempCharacter.id, 'Temp Delete Servo');
      
      // Configure jaw animation for temp character
      const configData = {
        servoId: tempServo.id,
        enabled: true
      };
      
      await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${tempCharacter.id}`, 
        configData,
        { validateStatus: () => true }
      );

      // Delete the character
      const deleteResponse = await axios.delete(
        `${BASE_URL}/characters/${tempCharacter.id}`,
        { validateStatus: () => true }
      );

      expect(deleteResponse.status).to.equal(200);

      // Verify jaw config is cleaned up
      const configResponse = await axios.get(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${tempCharacter.id}`,
        { validateStatus: () => true }
      );

      expect(configResponse.status).to.equal(404);
      
      // Cleanup servo
      await cleanupTestData(null, tempServo.id);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing servo gracefully', async () => {
      const configData = {
        servoId: 'nonexistent-servo-id',
        enabled: true
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`, 
        configData,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(400);
      expect(response.data).to.have.property('success', false);
      expect(response.data).to.have.property('error');
    });

    it('should handle servo configuration without calibration', async () => {
      // Create servo without min/max calibration
      const uncalibratedServo = await createTestServo(testCharacter.id, 'Uncalibrated Servo');
      // Remove calibration data
      delete uncalibratedServo.config.minAngle;
      delete uncalibratedServo.config.maxAngle;

      const configData = {
        servoId: uncalibratedServo.id,
        enabled: true
      };

      const response = await axios.post(
        `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`, 
        configData,
        { validateStatus: () => true }
      );

      // Should use default calibration values
      expect(response.status).to.equal(200);
      expect(response.data.config).to.have.property('minAngle');
      expect(response.data.config).to.have.property('maxAngle');
      
      // Cleanup
      await cleanupTestData(null, uncalibratedServo.id);
    });

    it('should handle concurrent audio processing', async () => {
      // Test multiple simultaneous audio level requests
      const promises = Array(5).fill().map(() => 
        axios.get(`${BASE_URL}/setup/super-powers/api/audio-levels`, { 
          validateStatus: () => true 
        })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
      });
    });

    it('should handle rapid configuration updates', async () => {
      const updates = [
        { amplitudeThreshold: 0.2 },
        { smoothingFactor: 0.5 },
        { minAngle: 20 }
      ];

      const promises = updates.map(update =>
        axios.post(
          `${BASE_URL}/setup/super-powers/api/jaw-animation/${testCharacter.id}`,
          update,
          { validateStatus: () => true }
        )
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
      });
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high-frequency audio level polling', async () => {
      const startTime = Date.now();
      const iterations = 20;
      
      const promises = Array(iterations).fill().map(() =>
        axios.get(`${BASE_URL}/setup/super-powers/api/audio-levels`, {
          validateStatus: () => true
        })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      const avgResponseTime = (endTime - startTime) / iterations;
      
      responses.forEach(response => {
        expect(response.status).to.equal(200);
      });
      
      // Should handle 20 requests in reasonable time (< 100ms average)
      expect(avgResponseTime).to.be.lessThan(100);
    });

    it('should maintain audio smoothing accuracy under load', async () => {
      const response1 = await axios.get(`${BASE_URL}/setup/super-powers/api/audio-levels`);
      const response2 = await axios.get(`${BASE_URL}/setup/super-powers/api/audio-levels`);
      
      expect(response1.data.levels.smoothedAmplitude).to.be.a('number');
      expect(response2.data.levels.smoothedAmplitude).to.be.a('number');
      
      // Smoothed values should be stable (not wildly different)
      const diff = Math.abs(response1.data.levels.smoothedAmplitude - response2.data.levels.smoothedAmplitude);
      expect(diff).to.be.lessThan(0.5); // Reasonable smoothing variation
    });
  });

  describe('Integration with Hardware Service', () => {
    it('should validate servo compatibility', async () => {
      const response = await axios.get(
        `${BASE_URL}/setup/parts/api/parts`,
        { validateStatus: () => true }
      );

      expect(response.status).to.equal(200);
      
      // Find servo parts that could work with jaw animation
      const servoParts = response.data.parts.filter(part => part.type === 'servo');
      expect(servoParts.length).to.be.greaterThan(0);
      
      const jawCompatibleServos = servoParts.filter(servo => 
        servo.config.servoType === 'standard' || servo.config.servoType === 'feedback'
      );
      expect(jawCompatibleServos.length).to.be.greaterThan(0);
    });

    it('should verify servo test integration', async () => {
      const testResponse = await axios.post(
        `${BASE_URL}/setup/parts/api/parts/${testServo.id}/test`,
        { action: 'moveToAngle', params: { angleDeg: 90 } },
        { validateStatus: () => true }
      );

      expect(testResponse.status).to.equal(200);
      expect(testResponse.data).to.have.property('testResult');
    });
  });
});