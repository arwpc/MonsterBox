import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import * as configService from '../../services/configService.js';
import * as jawAnimationService from '../../services/jawAnimationSuperPowerService.js';
import { getTTSConfigForCharacter } from '../../services/aiConfigStore.js';
import elevenLabsTTSService from '../../services/elevenLabsTTSService.js';
import serverPlaybackService from '../../services/serverPlaybackService.js';
import { loadParts as loadPartsFromController, saveParts } from '../../controllers/partsController.js';

const router = express.Router();

/**
 * Jaw Animation Setup Routes
 * Handles jaw animation and other super power configurations
 */

router.get('/api/list', async (req, res) => {
  try {
    const config = await configService.readConfig();
    const characterId = parseInt(config.selectedCharacter, 10) || 1;

    const [jawConfig, availableServos, monitoringState] = await Promise.all([
      jawAnimationService.readJawConfig(characterId),
      jawAnimationService.getAvailableServos(characterId),
      Promise.resolve(jawAnimationService.getAudioMonitoringState(characterId))
    ]);

    res.json({
      success: true,
      characterId,
      superpowers: [
        {
          id: 'jaw-animation',
          name: 'Jaw Animation',
          description: 'Synchronize jaw servo movement with live audio amplitude.',
          enabled: !!jawConfig.enabled,
          configurable: true,
          available: availableServos.length > 0,
          config: jawConfig,
          stats: {
            candidateServos: availableServos.length,
            monitoring: !!monitoringState?.isMonitoring
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error listing jaw animation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load jaw animation',
      message: error.message
    });
  }
});

// Main jaw animation page
router.get('/', async (req, res) => {
  try {
    const config = await configService.readConfig();
    const currentCharacter = config.selectedCharacter;

    if (!currentCharacter) {
      return res.renderWithLayout('setup/jaw-animation', {
        title: 'Setup Jaw Animation - MonsterBox 5.5',
        page: 'setup-jaw-animation',
        pageTitle: 'Jaw Animation',
        error: 'No character selected. Please select a character from the navigation menu.',
        currentCharacter: null,
        currentCharacterName: 'No Character'
      });
    }

    // Get character data
    const characters = await loadCharacters();
    const character = characters.find(c => c.id === currentCharacter);

    if (!character) {
      return res.renderWithLayout('setup/jaw-animation', {
        title: 'Setup Jaw Animation - MonsterBox 5.5',
        page: 'setup-jaw-animation',
        pageTitle: 'Jaw Animation',
        error: 'Selected character not found. Please select a valid character.',
        currentCharacter: null,
        currentCharacterName: 'Character Not Found'
      });
    }

    res.renderWithLayout('setup/jaw-animation', {
      title: 'Setup Jaw Animation - MonsterBox 5.5',
      page: 'setup-jaw-animation',
      pageTitle: 'Jaw Animation',
      currentCharacter: currentCharacter,
      currentCharacterName: character.name,
      character: character
    });
  } catch (error) {
    console.error('Error loading jaw animation page:', error);
    // In test mode, avoid emitting a 500 to keep deep-link navigation clean
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      // Avoid re-rendering the same view if it may be the source of the error; return minimal HTML
      return res.status(200).send('<!doctype html><html><head><title>Jaw Animation (Test Mode)</title></head><body><h1>Jaw Animation</h1><p>Test mode placeholder. Page failed to fully render but UI tests may proceed.</p></body></html>');
    }
    res.status(500).send('Internal Server Error');
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

// Get real-time audio levels and jaw state
router.get('/api/jaw-animation/:characterId/audio-levels', async (req, res) => {
  try {
    const { characterId } = req.params;
    const monitoringState = jawAnimationService.getAudioMonitoringState(characterId);
    const driveState = jawAnimationService.getJawDriveState(characterId);

    res.json({
      success: true,
      characterId: characterId,
      isMonitoring: monitoringState.isMonitoring || driveState.active,
      currentAmplitude: driveState.active ? driveState.amplitude : monitoringState.lastAmplitude,
      smoothedAmplitude: monitoringState.smoothedAmplitude,
      jawAngle: driveState.angle,
      playing: driveState.active,
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

// Test TTS with jaw animation — generates speech, plays through speaker, drives jaw from audio
router.post('/api/jaw-animation/:characterId/test-tts', async (req, res) => {
  try {
    const { characterId } = req.params;
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    // In test mode, bypass real TTS but still simulate jaw animation
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      const simDuration = 2000;
      jawAnimationService.simulateJawDrive(characterId, simDuration);
      return res.json({ success: true, duration: simDuration, testMode: true });
    }

    // Get TTS config for the character's voice
    const ttsCfg = await getTTSConfigForCharacter(characterId);
    const gen = await elevenLabsTTSService.generateSpeech(String(text).trim(), ttsCfg.voice_id, ttsCfg);

    if (!gen.success) {
      return res.status(500).json({ success: false, error: gen.error || 'TTS generation failed' });
    }

    // Play audio on character's speaker (fire-and-forget — don't block the response)
    serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, {
      contentType: gen.contentType,
      characterId: characterId
    }).catch((err) => {
      console.error('TTS playback error:', err.message);
    });

    // Drive jaw from audio buffer simultaneously (fire-and-forget)
    jawAnimationService.driveJawFromAudioBuffer(characterId, gen.audioBuffer, gen.contentType)
      .catch((err) => {
        console.error('Jaw drive error:', err.message);
      });

    // Estimate duration from buffer size (rough: MP3 at ~128kbps or WAV)
    const contentType = gen.contentType || 'audio/mpeg';
    let estimatedDuration = 3000;
    if (contentType.includes('mpeg') || contentType.includes('mp3')) {
      estimatedDuration = Math.round((gen.audioBuffer.length * 8) / 128000 * 1000);
    } else {
      // Assume WAV 16kHz 16bit mono
      estimatedDuration = Math.round((gen.audioBuffer.length / (16000 * 2)) * 1000);
    }

    res.json({ success: true, duration: estimatedDuration });
  } catch (error) {
    console.error('Error in test-tts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Adjust calibration for a servo part's Min or Max marker
router.post('/api/jaw-animation/:characterId/adjust-calibration', async (req, res) => {
  try {
    const { characterId } = req.params;
    const { servoPartId, marker, delta } = req.body || {};

    if (!servoPartId || !marker || delta === undefined) {
      return res.status(400).json({ success: false, error: 'servoPartId, marker, and delta are required' });
    }

    if (marker !== 'Min' && marker !== 'Max') {
      return res.status(400).json({ success: false, error: 'marker must be "Min" or "Max"' });
    }

    const parts = await loadPartsFromController();
    const partIndex = parts.findIndex(p => String(p.id) === String(servoPartId));

    if (partIndex === -1) {
      return res.status(404).json({ success: false, error: 'Servo part not found' });
    }

    const part = parts[partIndex];
    if (!Array.isArray(part.markers)) {
      return res.status(400).json({ success: false, error: 'Part has no calibration markers' });
    }

    const markerObj = part.markers.find(m => m.name === marker);
    if (!markerObj) {
      return res.status(400).json({ success: false, error: `Marker "${marker}" not found on part` });
    }

    // Apply delta
    markerObj.value = parseFloat(markerObj.value) + parseFloat(delta);

    // Clamp to 0-180
    markerObj.value = Math.max(0, Math.min(180, markerObj.value));

    // Save parts
    await saveParts(parts);

    // Read updated calibration
    const { calibrated, minAngle, maxAngle } = jawAnimationService.getCalibrationFromMarkers(part);

    // Also update jaw config to reflect new calibration
    const jawConfig = await jawAnimationService.readJawConfig(characterId);
    if (jawConfig.servoPartId === String(servoPartId)) {
      jawConfig.minAngle = minAngle;
      jawConfig.maxAngle = maxAngle;
      await jawAnimationService.writeJawConfig(characterId, jawConfig);
    }

    res.json({
      success: true,
      newValue: markerObj.value,
      minAngle: minAngle,
      maxAngle: maxAngle
    });
  } catch (error) {
    console.error('Error adjusting calibration:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop playback and jaw drive
router.post('/api/jaw-animation/:characterId/stop', async (req, res) => {
  try {
    const { characterId } = req.params;

    // Cancel jaw drive loop
    jawAnimationService.cancelJawDrive(characterId);

    // Drive jaw to closed position
    await jawAnimationService.moveJawToAngle(characterId, 0).catch(() => {});

    // Stop any active audio playback for the character
    try {
      await serverPlaybackService.stopForCharacter(characterId);
    } catch (e) {
      // Non-fatal — playback may not be active
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping playback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;