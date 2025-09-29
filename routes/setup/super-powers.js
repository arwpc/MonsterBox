import express from 'express';
import * as jawAnimationService from '../../services/jawAnimationSuperPowerService.js';
import { readConfig } from '../../services/configService.js';
import { loadCharacters } from '../../services/characterService.js';

const router = express.Router();

/**
 * Super Powers Setup Routes
 * Handles jaw animation and other super power configurations
 */

// Main super powers page
router.get('/', async (req, res) => {
  try {
    const config = await readConfig();
    const characters = await loadCharacters();
    const selectedCharacterId = config.selectedCharacter || (characters[0] ? characters[0].id : null);
    
    res.render('setup/super-powers', {
      title: 'Setup Super Powers - MonsterBox 4.0',
      page: 'setup-super-powers',
      characters,
      selectedCharacterId
    });
  } catch (error) {
    console.error('Error loading super powers page:', error);
    res.status(500).render('error', { error: error.message });
  }
});

// Get jaw animation configuration for a character
router.get('/api/jaw-animation/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    
    const config = await jawAnimationService.readJawConfig(characterId);
    const servos = await jawAnimationService.getAvailableServos(characterId);
    const monitoringState = jawAnimationService.getAudioMonitoringState(characterId);
    
    res.json({
      success: true,
      config,
      availableServos: servos,
      monitoringState
    });
  } catch (error) {
    console.error('Error getting jaw animation config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save jaw animation configuration for a character
router.post('/api/jaw-animation/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    const jawConfig = req.body;
    
    // Validate required fields
    if (jawConfig.enabled && !jawConfig.servoPartId) {
      return res.status(400).json({
        success: false,
        error: 'Servo part ID is required when jaw animation is enabled'
      });
    }
    
    // Get servo calibration data if servo is selected
    if (jawConfig.servoPartId) {
      const servos = await jawAnimationService.getAvailableServos(characterId);
      const selectedServo = servos.find(s => s.id === jawConfig.servoPartId);
      
      if (!selectedServo) {
        return res.status(400).json({
          success: false,
          error: 'Selected servo not found'
        });
      }
      
      if (!selectedServo.calibrated) {
        return res.status(400).json({
          success: false,
          error: 'Selected servo must be calibrated before use'
        });
      }
      
      // Use servo calibration data
      jawConfig.minAngle = selectedServo.minAngle;
      jawConfig.maxAngle = selectedServo.maxAngle;
    }
    
    await jawAnimationService.writeJawConfig(characterId, jawConfig);
    
    res.json({ success: true, message: 'Jaw animation configuration saved' });
  } catch (error) {
    console.error('Error saving jaw animation config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test jaw servo movement
router.post('/api/jaw-animation/:characterId/test', async (req, res) => {
  try {
    const { characterId } = req.params;
    const result = await jawAnimationService.testJawMovement(characterId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error testing jaw movement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get real-time audio levels (simulated for now)
router.get('/api/jaw-animation/:characterId/audio-levels', async (req, res) => {
  try {
    const { characterId } = req.params;
    const monitoringState = jawAnimationService.getAudioMonitoringState(characterId);
    
    // Add some simulated audio level for demonstration
    const simulatedLevel = Math.random() * 0.3; // Low level simulation
    
    res.json({
      success: true,
      characterId: characterId,
      isMonitoring: monitoringState.isMonitoring,
      currentAmplitude: monitoringState.lastAmplitude,
      smoothedAmplitude: monitoringState.smoothedAmplitude,
      simulatedLevel: simulatedLevel,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting audio levels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start audio monitoring
router.post('/api/jaw-animation/:characterId/start-monitoring', async (req, res) => {
  try {
    const { characterId } = req.params;
    const result = await jawAnimationService.startAudioMonitoring(characterId);
    res.json(result);
  } catch (error) {
    console.error('Error starting audio monitoring:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop audio monitoring
router.post('/api/jaw-animation/:characterId/stop-monitoring', async (req, res) => {
  try {
    const { characterId } = req.params;
    const result = await jawAnimationService.stopAudioMonitoring(characterId);
    res.json(result);
  } catch (error) {
    console.error('Error stopping audio monitoring:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Drive jaw from amplitude (used by audio processing hooks)
router.post('/api/jaw-animation/:characterId/drive', async (req, res) => {
  try {
    const { characterId } = req.params;
    const { amplitude } = req.body;
    
    if (typeof amplitude !== 'number' || amplitude < 0 || amplitude > 1) {
      return res.status(400).json({
        success: false,
        error: 'Amplitude must be a number between 0 and 1'
      });
    }
    
    const result = await jawAnimationService.driveJawFromAmplitude(characterId, amplitude);
    res.json(result);
  } catch (error) {
    console.error('Error driving jaw from amplitude:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available servos for jaw animation
router.get('/api/jaw-animation/:characterId/servos', async (req, res) => {
  try {
    const { characterId } = req.params;
    const servos = await jawAnimationService.getAvailableServos(characterId);
    
    res.json({
      success: true,
      servos: servos
    });
  } catch (error) {
    console.error('Error getting available servos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;