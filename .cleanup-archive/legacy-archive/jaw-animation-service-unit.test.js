/**
 * Jaw Animation Service Unit Tests
 * Tests individual service methods and audio integration functionality
 * Includes mocking for hardware dependencies
 */

import { expect } from 'chai';
import sinon from 'sinon';
import path from 'path';
import fs from 'fs';

// Mock the hardware service and other dependencies
const mockHardwareService = {
  moveServoToAngle: sinon.stub(),
  getServoPosition: sinon.stub(),
  testServo: sinon.stub()
};

const mockConfigService = {
  loadConfig: sinon.stub(),
  saveConfig: sinon.stub(),
  getCharacterData: sinon.stub()
};

const mockPartsController = {
  getPartById: sinon.stub(),
  getAllParts: sinon.stub()
};

// Import service after mocking dependencies
let jawAnimationSuperPowerService;

describe('Jaw Animation Super Power Service Unit Tests', () => {
  
  before(async () => {
    // Mock the require paths
    const mockModules = {
      '../services/hardwareService': mockHardwareService,
      '../config/configService': mockConfigService,
      '../controllers/partsController': mockPartsController
    };
    
    // Create a test version of the service with mocked dependencies
    const serviceCode = await fs.promises.readFile(
      path.join(process.cwd(), 'services/jawAnimationSuperPowerService.js'), 
      'utf8'
    );
    
    // Load service (in real implementation, this would use proper module mocking)
    // For this test, we'll import the actual service and override its dependencies
    jawAnimationSuperPowerService = await import('../services/jawAnimationSuperPowerService.js');
  });

  beforeEach(() => {
    // Reset all mocks before each test
    sinon.resetHistory();
    
    // Set up default mock responses
    mockConfigService.loadConfig.resolves({});
    mockConfigService.saveConfig.resolves(true);
    mockConfigService.getCharacterData.resolves({ id: 'test-character', name: 'Test' });
    
    mockPartsController.getPartById.resolves({
      id: 'test-servo',
      type: 'servo',
      config: {
        servoType: 'standard',
        minAngle: 0,
        maxAngle: 180,
        neutralAngle: 90
      }
    });
    
    mockHardwareService.moveServoToAngle.resolves({ success: true });
    mockHardwareService.testServo.resolves({ success: true, angle: 90 });
  });

  describe('Configuration Management', () => {
    it('should read jaw configuration with defaults', async () => {
      const characterId = 'test-character';
      
      // Mock config service to return empty config
      mockConfigService.loadConfig.resolves({});
      
      const config = await jawAnimationSuperPowerService.readJawConfig(characterId);
      
      expect(config).to.be.an('object');
      expect(config).to.have.property('enabled', false);
      expect(config).to.have.property('amplitudeThreshold', 0.1);
      expect(config).to.have.property('smoothingFactor', 0.2);
      expect(config).to.have.property('minAngle', 0);
      expect(config).to.have.property('maxAngle', 180);
      expect(config).to.have.property('neutralAngle', 90);
    });

    it('should save jaw configuration', async () => {
      const characterId = 'test-character';
      const config = {
        servoId: 'test-servo',
        enabled: true,
        minAngle: 10,
        maxAngle: 170,
        amplitudeThreshold: 0.15
      };
      
      const result = await jawAnimationSuperPowerService.saveJawConfig(characterId, config);
      
      expect(result).to.be.true;
      expect(mockConfigService.saveConfig.calledOnce).to.be.true;
      
      const savedData = mockConfigService.saveConfig.firstCall.args[1];
      expect(savedData.jawAnimation).to.deep.include(config);
    });

    it('should validate servo exists before saving', async () => {
      const characterId = 'test-character';
      const config = {
        servoId: 'nonexistent-servo',
        enabled: true
      };
      
      mockPartsController.getPartById.resolves(null);
      
      try {
        await jawAnimationSuperPowerService.saveJawConfig(characterId, config);
        expect.fail('Should have thrown error for nonexistent servo');
      } catch (error) {
        expect(error.message).to.contain('Servo not found');
      }
    });

    it('should merge configuration with existing data', async () => {
      const characterId = 'test-character';
      const existingConfig = {
        jawAnimation: {
          enabled: true,
          servoId: 'old-servo',
          minAngle: 5
        }
      };
      const newConfig = {
        maxAngle: 175,
        amplitudeThreshold: 0.25
      };
      
      mockConfigService.loadConfig.resolves(existingConfig);
      
      await jawAnimationSuperPowerService.saveJawConfig(characterId, newConfig);
      
      const savedData = mockConfigService.saveConfig.firstCall.args[1];
      expect(savedData.jawAnimation).to.deep.include({
        enabled: true,
        servoId: 'old-servo',
        minAngle: 5,
        maxAngle: 175,
        amplitudeThreshold: 0.25
      });
    });
  });

  describe('Audio Amplitude Processing', () => {
    beforeEach(() => {
      // Set up a test configuration
      jawAnimationSuperPowerService.currentAmplitude = 0;
      jawAnimationSuperPowerService.smoothedAmplitude = 0;
    });

    it('should calculate jaw angle from amplitude', () => {
      const config = {
        minAngle: 10,
        maxAngle: 170,
        neutralAngle: 90
      };
      
      // Test minimum amplitude (should be neutral)
      let angle = jawAnimationSuperPowerService.calculateJawAngle(0, config);
      expect(angle).to.equal(90);
      
      // Test maximum amplitude
      angle = jawAnimationSuperPowerService.calculateJawAngle(1, config);
      expect(angle).to.equal(170);
      
      // Test mid amplitude
      angle = jawAnimationSuperPowerService.calculateJawAngle(0.5, config);
      expect(angle).to.be.within(120, 140);
    });

    it('should apply smoothing to amplitude values', () => {
      const smoothingFactor = 0.3;
      
      // Start with zero amplitude
      jawAnimationSuperPowerService.smoothedAmplitude = 0;
      
      // Apply high amplitude
      const smoothed = jawAnimationSuperPowerService.applySmoothingToAmplitude(0.8, smoothingFactor);
      
      // Should be between 0 and 0.8, closer to 0 due to smoothing
      expect(smoothed).to.be.within(0, 0.8);
      expect(smoothed).to.be.lessThan(0.8);
      expect(smoothed).to.be.greaterThan(0);
    });

    it('should handle rapid amplitude changes with smoothing', () => {
      const smoothingFactor = 0.2;
      jawAnimationSuperPowerService.smoothedAmplitude = 0.5;
      
      // Apply sudden high amplitude
      const smooth1 = jawAnimationSuperPowerService.applySmoothingToAmplitude(1.0, smoothingFactor);
      
      // Apply sudden low amplitude
      const smooth2 = jawAnimationSuperPowerService.applySmoothingToAmplitude(0.0, smoothingFactor);
      
      // Changes should be gradual
      expect(smooth1).to.be.greaterThan(0.5);
      expect(smooth1).to.be.lessThan(1.0);
      expect(smooth2).to.be.lessThan(smooth1);
      expect(smooth2).to.be.greaterThan(0);
    });

    it('should respect amplitude threshold', () => {
      const config = {
        minAngle: 10,
        maxAngle: 170,
        neutralAngle: 90,
        amplitudeThreshold: 0.2
      };
      
      // Test below threshold
      let angle = jawAnimationSuperPowerService.calculateJawAngle(0.1, config);
      expect(angle).to.equal(90); // Should be neutral
      
      // Test above threshold
      angle = jawAnimationSuperPowerService.calculateJawAngle(0.3, config);
      expect(angle).to.be.greaterThan(90); // Should open jaw
    });
  });

  describe('Servo Control Integration', () => {
    it('should drive jaw servo from amplitude', async () => {
      const characterId = 'test-character';
      const amplitude = 0.6;
      
      // Mock configuration
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo',
          minAngle: 10,
          maxAngle: 170,
          neutralAngle: 90,
          amplitudeThreshold: 0.1,
          smoothingFactor: 0.2
        }
      });
      
      const result = await jawAnimationSuperPowerService.driveJawFromAmplitude(characterId, amplitude);
      
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('angle');
      expect(result.angle).to.be.a('number');
      expect(result.angle).to.be.within(10, 170);
      
      // Should have called hardware service
      expect(mockHardwareService.moveServoToAngle.calledOnce).to.be.true;
    });

    it('should skip servo movement when disabled', async () => {
      const characterId = 'test-character';
      const amplitude = 0.6;
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: false,
          servoId: 'test-servo'
        }
      });
      
      const result = await jawAnimationSuperPowerService.driveJawFromAmplitude(characterId, amplitude);
      
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('message', 'Jaw animation disabled');
      
      // Should not call hardware service
      expect(mockHardwareService.moveServoToAngle.called).to.be.false;
    });

    it('should handle hardware service errors gracefully', async () => {
      const characterId = 'test-character';
      const amplitude = 0.6;
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo',
          minAngle: 10,
          maxAngle: 170
        }
      });
      
      // Mock hardware service to fail
      mockHardwareService.moveServoToAngle.rejects(new Error('Hardware error'));
      
      const result = await jawAnimationSuperPowerService.driveJawFromAmplitude(characterId, amplitude);
      
      expect(result).to.have.property('success', false);
      expect(result).to.have.property('error');
    });

    it('should validate angle bounds before servo movement', async () => {
      const characterId = 'test-character';
      const amplitude = 1.5; // Extreme amplitude
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo',
          minAngle: 10,
          maxAngle: 170,
          neutralAngle: 90
        }
      });
      
      await jawAnimationSuperPowerService.driveJawFromAmplitude(characterId, amplitude);
      
      // Should have clamped angle to max
      const calledAngle = mockHardwareService.moveServoToAngle.firstCall.args[1];
      expect(calledAngle).to.be.at.most(170);
      expect(calledAngle).to.be.at.least(10);
    });
  });

  describe('Character Management Integration', () => {
    it('should get jaw status for character', async () => {
      const characterId = 'test-character';
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo'
        }
      });
      
      const status = await jawAnimationSuperPowerService.getJawAnimationStatus(characterId);
      
      expect(status).to.have.property('enabled', true);
      expect(status).to.have.property('configured', true);
      expect(status).to.have.property('servoId', 'test-servo');
    });

    it('should handle character without jaw configuration', async () => {
      const characterId = 'unconfigured-character';
      
      mockConfigService.loadConfig.resolves({});
      
      const status = await jawAnimationSuperPowerService.getJawAnimationStatus(characterId);
      
      expect(status).to.have.property('enabled', false);
      expect(status).to.have.property('configured', false);
    });

    it('should list all characters with jaw status', async () => {
      const characters = [
        { id: 'char1', name: 'Character 1' },
        { id: 'char2', name: 'Character 2' }
      ];
      
      // Mock character controller (would need to be mocked in real implementation)
      mockConfigService.loadConfig.onFirstCall().resolves({
        jawAnimation: { enabled: true, servoId: 'servo1' }
      });
      mockConfigService.loadConfig.onSecondCall().resolves({});
      
      // This would require additional mocking of the character service
      // For now, test the logic that would be used
      const char1Status = await jawAnimationSuperPowerService.getJawAnimationStatus('char1');
      const char2Status = await jawAnimationSuperPowerService.getJawAnimationStatus('char2');
      
      expect(char1Status.enabled).to.be.true;
      expect(char2Status.enabled).to.be.false;
    });
  });

  describe('Servo Testing Functions', () => {
    it('should test jaw movement to specific angle', async () => {
      const characterId = 'test-character';
      const testAngle = 45;
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo'
        }
      });
      
      const result = await jawAnimationSuperPowerService.testJawMovement(characterId, testAngle);
      
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('angle', testAngle);
      expect(mockHardwareService.moveServoToAngle.calledWith('test-servo', testAngle)).to.be.true;
    });

    it('should test jaw movement with amplitude simulation', async () => {
      const characterId = 'test-character';
      const testAmplitude = 0.7;
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'test-servo',
          minAngle: 10,
          maxAngle: 170,
          neutralAngle: 90
        }
      });
      
      const result = await jawAnimationSuperPowerService.testJawMovementFromAmplitude(characterId, testAmplitude);
      
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('amplitude', testAmplitude);
      expect(result).to.have.property('calculatedAngle');
      expect(result.calculatedAngle).to.be.a('number');
    });

    it('should validate test parameters', async () => {
      const characterId = 'test-character';
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: { enabled: true, servoId: 'test-servo' }
      });
      
      // Test invalid angle
      try {
        await jawAnimationSuperPowerService.testJawMovement(characterId, 250);
        expect.fail('Should have thrown error for invalid angle');
      } catch (error) {
        expect(error.message).to.contain('Invalid angle');
      }
      
      // Test invalid amplitude
      try {
        await jawAnimationSuperPowerService.testJawMovementFromAmplitude(characterId, -0.1);
        expect.fail('Should have thrown error for invalid amplitude');
      } catch (error) {
        expect(error.message).to.contain('Invalid amplitude');
      }
    });
  });

  describe('Audio Level Monitoring', () => {
    it('should return current audio levels', () => {
      // Set up test amplitude values
      jawAnimationSuperPowerService.currentAmplitude = 0.45;
      jawAnimationSuperPowerService.smoothedAmplitude = 0.42;
      
      const levels = jawAnimationSuperPowerService.getCurrentAudioLevels();
      
      expect(levels).to.have.property('amplitude', 0.45);
      expect(levels).to.have.property('smoothedAmplitude', 0.42);
      expect(levels).to.have.property('timestamp');
      expect(levels.timestamp).to.be.a('number');
    });

    it('should calculate jaw angle in audio levels', async () => {
      const characterId = 'test-character';
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          minAngle: 10,
          maxAngle: 170,
          neutralAngle: 90,
          amplitudeThreshold: 0.1
        }
      });
      
      jawAnimationSuperPowerService.smoothedAmplitude = 0.6;
      
      const levels = await jawAnimationSuperPowerService.getCurrentAudioLevelsForCharacter(characterId);
      
      expect(levels).to.have.property('calculatedJawAngle');
      expect(levels.calculatedJawAngle).to.be.a('number');
      expect(levels.calculatedJawAngle).to.be.within(10, 170);
    });

    it('should handle character without jaw configuration in audio levels', async () => {
      const characterId = 'unconfigured-character';
      
      mockConfigService.loadConfig.resolves({});
      
      const levels = await jawAnimationSuperPowerService.getCurrentAudioLevelsForCharacter(characterId);
      
      expect(levels).to.have.property('calculatedJawAngle', null);
      expect(levels).to.have.property('jawConfigured', false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined inputs gracefully', async () => {
      try {
        await jawAnimationSuperPowerService.readJawConfig(null);
        expect.fail('Should have thrown error for null character ID');
      } catch (error) {
        expect(error.message).to.contain('Character ID is required');
      }
      
      try {
        await jawAnimationSuperPowerService.saveJawConfig('test-character', null);
        expect.fail('Should have thrown error for null config');
      } catch (error) {
        expect(error.message).to.contain('Configuration is required');
      }
    });

    it('should handle config service failures', async () => {
      const characterId = 'test-character';
      
      mockConfigService.loadConfig.rejects(new Error('Config load failed'));
      
      try {
        await jawAnimationSuperPowerService.readJawConfig(characterId);
        expect.fail('Should have thrown error when config service fails');
      } catch (error) {
        expect(error.message).to.contain('Config load failed');
      }
    });

    it('should handle extreme amplitude values', () => {
      const config = {
        minAngle: 10,
        maxAngle: 170,
        neutralAngle: 90
      };
      
      // Test negative amplitude
      let angle = jawAnimationSuperPowerService.calculateJawAngle(-0.5, config);
      expect(angle).to.equal(90); // Should default to neutral
      
      // Test very high amplitude
      angle = jawAnimationSuperPowerService.calculateJawAngle(10, config);
      expect(angle).to.equal(170); // Should clamp to max
    });

    it('should handle missing servo configuration', async () => {
      const characterId = 'test-character';
      
      mockConfigService.loadConfig.resolves({
        jawAnimation: {
          enabled: true,
          servoId: 'missing-servo'
        }
      });
      
      mockPartsController.getPartById.resolves(null);
      
      const result = await jawAnimationSuperPowerService.driveJawFromAmplitude(characterId, 0.5);
      
      expect(result).to.have.property('success', false);
      expect(result).to.have.property('error');
    });
  });
});