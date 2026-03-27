import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTTSConfig, getTTSConfigForCharacter } from '../aiConfigStore.js';
import { readConfig } from '../configService.js';
import elevenLabsTTSService from '../elevenLabsTTSService.js';
import goblinManagerService from '../goblinManagerService.js';
import hardwareService from '../hardwareService/index.js';
import poseEngine from '../poses/poseEngine.js';
import serverPlaybackService from '../serverPlaybackService.js';
import sceneAnalytics from './sceneAnalyticsService.js';
import { getCalibrationStore } from '../../server/calibration/store.js';
import actuatorPositionStore from '../actuatorPositionStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getDataDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

async function loadParts() {
  try {
    const dataDir = await getDataDir();
    const partsPath = path.resolve(dataDir, 'parts.json');
    const raw = await fs.readFile(partsPath, 'utf8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

async function findSpeakerDeviceForCharacter(characterId) {
  const parts = await loadParts();
  const speaker = parts.find(p => String(p.type).toLowerCase() === 'speaker' && Number(p.characterId) === Number(characterId));
  if (!speaker) return 'default';
  const cfg = speaker.config || {};
  return cfg.audioDeviceId || cfg.outputDevice || 'default';
}

/**
 * Resolve a preset name to an angle for servos
 */
async function resolvePresetToAngle(partId, presetName) {
  const store = getCalibrationStore();
  const profile = await store.get(partId);
  
  if (!profile) {
    console.warn(`No calibration profile for part ${partId}, using default angle`);
    return 90;
  }
  
  const isAbsServo = profile.capability && profile.capability.kind === 'absolute-servo';

  if (isAbsServo && (profile.bounds?.minAngle != null || profile.bounds?.maxAngle != null)) {
    // Absolute servo with angle-based bounds
    if (presetName === '__MIN__') {
      return profile.bounds.minAngle ?? 0;
    } else if (presetName === '__MAX__') {
      return profile.bounds.maxAngle ?? 180;
    } else {
      const preset = profile.presets?.find(p => p.name === presetName);
      if (!preset) {
        console.warn(`Preset "${presetName}" not found for part ${partId}, using min angle`);
        return profile.bounds.minAngle ?? 0;
      }
      // Presets may store angle directly or normalized p
      return preset.angle != null ? preset.angle : Math.round((preset.p ?? 0.5) * 180);
    }
  }

  // Legacy normalized path (backward compat for old profiles)
  let targetP;
  if (presetName === '__MIN__') {
    targetP = profile.bounds?.minP ?? 0;
  } else if (presetName === '__MAX__') {
    targetP = profile.bounds?.maxP ?? 1;
  } else {
    const preset = profile.presets?.find(p => p.name === presetName);
    if (!preset) {
      console.warn(`Preset "${presetName}" not found for part ${partId}, using min position`);
      targetP = profile.bounds?.minP ?? 0;
    } else {
      targetP = preset.p;
    }
  }

  // Convert normalized position (0-1) to angle (0-180)
  return Math.round(targetP * 180);
}

/**
 * Resolve a preset name to motor parameters (speed, duration)
 */
async function resolvePresetToMotorParams(partId, presetName) {
  const store = getCalibrationStore();
  const profile = await store.get(partId);
  
  if (!profile || !profile.motion || profile.motion.type !== 'time-at-speed') {
    console.warn(`No valid motion model for motor part ${partId}, using defaults`);
    return { speed: 50, duration: 2000 };
  }
  
  let targetP;
  if (presetName === '__MIN__') {
    targetP = profile.bounds?.minP ?? 0;
  } else if (presetName === '__MAX__') {
    targetP = profile.bounds?.maxP ?? 1;
  } else {
    const preset = profile.presets?.find(p => p.name === presetName);
    if (!preset) {
      console.warn(`Preset "${presetName}" not found for motor part ${partId}, using min position`);
      targetP = profile.bounds?.minP ?? 0;
    } else {
      targetP = preset.p;
    }
  }
  
  // Calculate duration based on motion model
  const motion = profile.motion;
  const bin = motion.bins?.[0] || { pwmPct: 50, unitsPerSec: 0.2 };
  const deltaP = Math.abs(targetP - 0.5); // Assume we're moving from center
  const duration = Math.round((deltaP / bin.unitsPerSec) * 1000);
  
  return { speed: bin.pwmPct, duration: Math.max(100, duration) };
}

/**
 * Resolve a preset name to linear actuator parameters (speed, duration)
 */
async function resolvePresetToActuatorParams(partId, presetName) {
  // Linear actuators use the same motion model as motors
  return resolvePresetToMotorParams(partId, presetName);
}

async function resolveAudioFile(audioId) {
  // Allow absolute or relative; if bare filename, resolve under data/audio-library/files
  if (!audioId) return null;
  if (audioId.startsWith('/') || audioId.startsWith('./')) return path.resolve(audioId);

  // Load audio library to get the actual filename
  // Audio library is in the ROOT data directory (data/audio-library), NOT character-specific
  const appRoot = path.resolve(__dirname, '..', '..');
  const rootDataDir = path.resolve(appRoot, 'data'); // Always use root data directory for audio

  try {
    const audioLibPath = path.resolve(rootDataDir, 'audio-library', 'library.json');
    const raw = await fs.readFile(audioLibPath, 'utf8');
    const library = JSON.parse(raw);
    const audioArray = library.audio || library; // Handle both {audio: [...]} and [...] formats
    const audioFile = audioArray.find(a => a.id === audioId);
    if (audioFile && audioFile.filename) {
      return path.resolve(rootDataDir, 'audio-library', 'files', audioFile.filename);
    }
  } catch (err) {
    console.error('Error loading audio library:', err.message);
  }

  // Fallback: try to resolve directly
  const p = path.resolve(rootDataDir, 'audio-library', 'files', audioId);
  return p;
}

async function executePoseStep(step, characterId, emit) {
  const poseId = parseInt(step.poseId, 10);
  if (!poseId) throw new Error('pose.step requires poseId');
  emit && emit({ type: 'step', status: 'start', stepType: 'pose', poseId });
  const r = await poseEngine.executePose({ characterId, poseId, options: step.options || {} });
  emit && emit({ type: 'step', status: r.success ? 'complete' : 'error', stepType: 'pose', poseId, result: r });
  if (!r.success) throw new Error(r.error || 'Pose failed');
  return r;
}

async function executeAudioStep(step, characterId, emit) {
  const filename = await resolveAudioFile(step.audioId);
  if (!filename) throw new Error('audio.step requires audioId');
  const deviceId = await findSpeakerDeviceForCharacter(characterId);
  emit && emit({ type: 'step', status: 'start', stepType: 'audio', audioId: step.audioId, deviceId });

  // If jaw sync is enabled and step opts in, read file and use playWithJawSync
  if (step.jawSync !== false) {
    try {
      const jawService = await import('../jawAnimationSuperPowerService.js');
      const jawConfig = await jawService.readJawConfig(characterId);
      if (jawConfig.enabled && jawConfig.servoPartId) {
        const audioBuffer = await fs.readFile(filename);
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
        const result = await jawService.playWithJawSync(characterId, audioBuffer, contentType);
        emit && emit({ type: 'step', status: result.success ? 'complete' : 'error', stepType: 'audio', audioId: step.audioId, result });
        if (!result.success) throw new Error(result.message || 'Jaw-synced audio failed');
        return result;
      }
    } catch (jawErr) {
      if (jawErr.message && !jawErr.message.includes('disabled')) {
        console.warn('Scene audio jaw sync failed, falling back:', jawErr.message);
      }
    }
  }

  const r = await hardwareService.HARDWARE_CONTROLLERS.speaker.play({ audioDeviceId: deviceId, filename, volume: step.volume != null ? step.volume : 100 });
  emit && emit({ type: 'step', status: r.success ? 'complete' : 'error', stepType: 'audio', audioId: step.audioId, result: r });
  if (!r.success) throw new Error(r.error || 'Audio play failed');
  return r;
}

async function executePartStep(step, characterId, emit) {
  const partId = step.partId;
  const action = step.action;
  if (!partId || !action) throw new Error('part.step requires partId and action');
  emit && emit({ type: 'step', status: 'start', stepType: 'part', partId, action });
  const r = await hardwareService.controlPart(String(partId), String(action), step.params || {});
  emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'part', partId, action, result: r });
  if (!r || !r.success) throw new Error((r && r.error) || 'Part action failed');
  return r;
}

async function executeWaitStep(step, emit) {
  const d = parseInt(step.duration, 10) || parseInt(step.durationMs, 10) || 0;
  emit && emit({ type: 'step', status: 'start', stepType: 'wait', duration: d });
  await new Promise(r => setTimeout(r, d));
  emit && emit({ type: 'step', status: 'complete', stepType: 'wait', duration: d });
  return { success: true, waitedMs: d };
}

async function executeSayThisStep(step, characterId, emit) {
  const text = (step.text || step.say || '').trim();
  if (!text) throw new Error('sayThis.step requires text');
  emit && emit({ type: 'step', status: 'start', stepType: 'sayThis', text });

  const ttsCfg = await getTTSConfigForCharacter(characterId);
  const voiceId = step.voiceId || ttsCfg.voice_id;
  const gen = await elevenLabsTTSService.generateSpeech(text, voiceId, ttsCfg);
  if (!gen.success) {
    emit && emit({ type: 'step', status: 'error', stepType: 'sayThis', error: gen.error });
    throw new Error(gen.error || 'TTS generation failed');
  }

  // Use jaw-synced playback when jaw animation is enabled
  try {
    const jawService = await import('../jawAnimationSuperPowerService.js');
    const jawConfig = await jawService.readJawConfig(characterId);
    if (jawConfig.enabled && jawConfig.servoPartId) {
      const result = await jawService.playWithJawSync(characterId, gen.audioBuffer, gen.contentType);
      emit && emit({ type: 'step', status: result.success ? 'complete' : 'error', stepType: 'sayThis', result });
      if (!result.success) throw new Error(result.message || 'Jaw-synced playback failed');
      return result;
    }
  } catch (jawErr) {
    // Non-fatal: fall through to normal playback
    if (jawErr.message && !jawErr.message.includes('disabled')) {
      console.warn('Scene sayThis jaw sync failed, falling back:', jawErr.message);
    }
  }

  // Use playAIOnCharacterSpeaker (one-shot process) so the step blocks until
  // audio finishes playing.  playBufferOnCharacterSpeaker writes to a persistent
  // mpg123 stream and returns as soon as the write completes, which would let the
  // next scene step start before the audio is done.
  const play = await serverPlaybackService.playAIOnCharacterSpeaker(gen.audioBuffer, { contentType: gen.contentType, characterId });
  emit && emit({ type: 'step', status: play.success ? 'complete' : 'error', stepType: 'sayThis', result: play });
  if (!play.success) throw new Error(play.error || 'TTS playback failed');
  return play;
}

async function executeAskAIStep(step, characterId, emit) {
  const question = (step.question || step.text || '').trim();
  if (!question) throw new Error('askAI.step requires question');
  emit && emit({ type: 'step', status: 'start', stepType: 'askAI', question });

  const ttsCfg = await getTTSConfigForCharacter(characterId);

  // Try real AI conversation via ElevenLabs WebSocket agent
  let responseText;
  try {
    const { default: characterService } = await import('../characterService.js');
    const character = await characterService.getCharacterById(characterId);
    if (character && character.elevenLabsAgentId) {
      const { default: elevenLabsWebSocketService } = await import('../elevenLabsWebSocketService.js');
      const aiResponse = await elevenLabsWebSocketService.askAgentQuestion(
        character.elevenLabsAgentId,
        question,
        characterId
      );
      if (aiResponse && aiResponse.success && aiResponse.response) {
        responseText = aiResponse.response;
      }
    }
  } catch (aiErr) {
    console.warn(`⚠️ Scene askAI: AI agent unavailable for character ${characterId}:`, aiErr.message);
  }

  // Fallback if AI agent is not configured or failed
  if (!responseText) {
    responseText = `I heard your question: "${question}". I'm not able to answer right now, but I'm always listening.`;
  }

  const voiceId = step.voiceId || ttsCfg.voice_id;
  const gen = await elevenLabsTTSService.generateSpeech(responseText, voiceId, ttsCfg);
  if (!gen.success) {
    emit && emit({ type: 'step', status: 'error', stepType: 'askAI', error: gen.error });
    throw new Error(gen.error || 'TTS generation failed');
  }

  // Use jaw-synced playback when jaw animation is enabled
  try {
    const jawService = await import('../jawAnimationSuperPowerService.js');
    const jawConfig = await jawService.readJawConfig(characterId);
    if (jawConfig.enabled && jawConfig.servoPartId) {
      const result = await jawService.playWithJawSync(characterId, gen.audioBuffer, gen.contentType);
      emit && emit({ type: 'step', status: result.success ? 'complete' : 'error', stepType: 'askAI', result, response: responseText });
      if (!result.success) throw new Error(result.message || 'Jaw-synced playback failed');
      return { ...result, response: responseText };
    }
  } catch (jawErr) {
    if (jawErr.message && !jawErr.message.includes('disabled')) {
      console.warn('Scene askAI jaw sync failed, falling back:', jawErr.message);
    }
  }

  // Use playAIOnCharacterSpeaker (one-shot process) so the step blocks until
  // audio finishes playing — same rationale as executeSayThisStep.
  const play = await serverPlaybackService.playAIOnCharacterSpeaker(gen.audioBuffer, { contentType: gen.contentType, characterId });
  emit && emit({ type: 'step', status: play.success ? 'complete' : 'error', stepType: 'askAI', result: play, response: responseText });
  if (!play.success) throw new Error(play.error || 'TTS playback failed');
  return { ...play, response: responseText };
}

async function executeGoblinVideoStep(step, characterId, emit) {
  const { goblinId, videoId, options = {} } = step;

  if (!goblinId) throw new Error('goblin.step requires goblinId');
  if (!videoId) throw new Error('goblin.step requires videoId (filename)');

  emit && emit({ type: 'step', status: 'start', stepType: 'goblin', goblinId, videoId });

  try {
    // Check if Goblin exists and is online
    const goblin = await goblinManagerService.getGoblin(goblinId);
    if (!goblin.success) {
      throw new Error(`Goblin not found: ${goblinId}`);
    }

    if (goblin.goblin.status !== 'online') {
      throw new Error(`Goblin is not online: ${goblinId}`);
    }

    // Verify character lock if required
    if (step.requireLock && !goblin.goblin.lockedBy) {
      throw new Error(`Goblin must be locked to use in Scene: ${goblinId}`);
    }

    if (step.requireLock && characterId && goblin.goblin.lockedBy !== `character-${characterId}`) {
      throw new Error(`Goblin is locked by ${goblin.goblin.lockedBy}, not character-${characterId}`);
    }

    // Play video on Goblin
    const playResult = await goblinManagerService.playVideoOnGoblin(goblinId, videoId, {
      loop: options.loop !== false, // Default to loop
      volume: options.volume || 100,
      ...options
    });

    if (!playResult.success) {
      throw new Error(`Failed to play video on Goblin: ${playResult.error}`);
    }

    emit && emit({
      type: 'step',
      status: 'complete',
      stepType: 'goblin',
      goblinId,
      videoId,
      result: playResult
    });

    return playResult;
  } catch (error) {
    emit && emit({
      type: 'step',
      status: 'error',
      stepType: 'goblin',
      goblinId,
      videoId,
      error: error.message
    });
    throw error;
  }
}

async function executeServoStep(step, characterId, emit) {
  const { partId, angle, duration = 1000, usePreset, presetName } = step;
  if (!partId) throw new Error('servo.step requires partId');

  let targetAngle = angle;

  // If using preset, resolve the preset to an angle
  if (usePreset && presetName) {
    targetAngle = await resolvePresetToAngle(partId, presetName);
  }

  if (targetAngle == null) throw new Error('servo.step requires angle or valid preset');

  emit && emit({ type: 'step', status: 'start', stepType: 'servo', partId, angle: targetAngle, duration, usePreset, presetName });
  const r = await hardwareService.controlPart(String(partId), 'moveToAngle', { angleDeg: targetAngle, duration });
  emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'servo', partId, result: r });
  if (!r || !r.success) throw new Error((r && r.error) || 'Servo move failed');
  return r;
}

async function executeMotorStep(step, characterId, emit) {
  const { partId, direction = 'forward', speed = 50, duration = 1000, usePreset, presetName } = step;
  if (!partId) throw new Error('motor.step requires partId');

  let effectiveSpeed = speed;
  let effectiveDuration = duration;

  // If using preset, resolve the preset to movement parameters
  if (usePreset && presetName) {
    const presetParams = await resolvePresetToMotorParams(partId, presetName);
    effectiveSpeed = presetParams.speed || speed;
    effectiveDuration = presetParams.duration || duration;
  }

  // Enforce calibration bounds for motors (same open-loop problem as linear actuators)
  try {
    const store = getCalibrationStore();
    const profile = await store.get(parseInt(partId, 10));
    if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
      const posState = actuatorPositionStore.load(parseInt(partId, 10));
      const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
      const motion = profile.motion;
      if (motion && motion.bins && motion.bins.length > 0) {
        const bin = motion.bins.reduce((best, b) =>
          Math.abs(b.pwmPct - effectiveSpeed) < Math.abs(best.pwmPct - effectiveSpeed) ? b : best
        );
        const rate = bin.unitsPerSec || 0.2;
        const moveDist = rate * (effectiveDuration / 1000);
        const isForward = direction === 'forward' || direction === 'extend';
        const projectedP = isForward ? currentP + moveDist : currentP - moveDist;
        if (projectedP > profile.bounds.maxP) {
          const safeDistance = Math.max(0, profile.bounds.maxP - currentP);
          effectiveDuration = Math.max(0, Math.round((safeDistance / rate) * 1000));
        } else if (projectedP < profile.bounds.minP) {
          const safeDistance = Math.max(0, currentP - profile.bounds.minP);
          effectiveDuration = Math.max(0, Math.round((safeDistance / rate) * 1000));
        }
        // Update position estimate after move
        const actualDist = rate * (effectiveDuration / 1000);
        const newP = isForward
          ? Math.min(1, currentP + actualDist)
          : Math.max(0, currentP - actualDist);
        step._projectedP = newP;
      }
    }
  } catch (e) {
    // Non-fatal: proceed with original duration
    console.warn(`[SceneExecutor] Could not enforce bounds for motor part ${partId}:`, e.message);
  }

  emit && emit({ type: 'step', status: 'start', stepType: 'motor', partId, direction, speed: effectiveSpeed, duration: effectiveDuration, usePreset, presetName });
  const r = await hardwareService.controlPart(String(partId), 'control', { direction, speed: effectiveSpeed, duration: effectiveDuration });

  // Persist updated position estimate
  if (step._projectedP != null) {
    try { actuatorPositionStore.markStopped(parseInt(partId, 10), step._projectedP); } catch (_) {}
  }

  emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'motor', partId, result: r });
  if (!r || !r.success) throw new Error((r && r.error) || 'Motor control failed');
  return r;
}

async function executeLinearActuatorStep(step, characterId, emit) {
  const { partId, direction = 'extend', speed = 50, duration = 1000, usePreset, presetName } = step;
  if (!partId) throw new Error('linear-actuator.step requires partId');

  let effectiveSpeed = speed;
  let effectiveDuration = duration;

  // If using preset, resolve the preset to movement parameters
  if (usePreset && presetName) {
    const presetParams = await resolvePresetToActuatorParams(partId, presetName);
    effectiveSpeed = presetParams.speed || speed;
    effectiveDuration = presetParams.duration || duration;
  }

  // Enforce calibration bounds: clamp duration so actuator cannot exceed min/max range
  try {
    const store = getCalibrationStore();
    const profile = await store.get(parseInt(partId, 10));
    if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
      const posState = actuatorPositionStore.load(parseInt(partId, 10));
      const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
      const motion = profile.motion;
      // Estimate how far the motor would move in effectiveDuration
      if (motion && motion.bins && motion.bins.length > 0) {
        // Find the closest speed bin
        const bin = motion.bins.reduce((best, b) =>
          Math.abs(b.pwmPct - effectiveSpeed) < Math.abs(best.pwmPct - effectiveSpeed) ? b : best
        );
        const rate = bin.unitsPerSec || 0.2;
        const moveDist = rate * (effectiveDuration / 1000);
        const projectedP = direction === 'retract' ? currentP - moveDist : currentP + moveDist;
        // Clamp: if projected position would exceed bounds, shorten duration
        if (projectedP > profile.bounds.maxP) {
          const safeDistance = Math.max(0, profile.bounds.maxP - currentP);
          effectiveDuration = Math.max(0, Math.round((safeDistance / rate) * 1000));
        } else if (projectedP < profile.bounds.minP) {
          const safeDistance = Math.max(0, currentP - profile.bounds.minP);
          effectiveDuration = Math.max(0, Math.round((safeDistance / rate) * 1000));
        }
        // Update persisted position after move
        const actualDist = rate * (effectiveDuration / 1000);
        const newP = direction === 'retract'
          ? Math.max(0, currentP - actualDist)
          : Math.min(1, currentP + actualDist);
        // Defer position update to after the move
        step._projectedP = newP;
      }
    }
  } catch (e) {
    // Non-fatal: if calibration lookup fails, proceed with original duration
    console.warn(`[SceneExecutor] Could not enforce bounds for part ${partId}:`, e.message);
  }

  // Linear actuators use 'extend' or 'retract' actions, not 'control'
  const action = direction === 'retract' ? 'retract' : 'extend';

  emit && emit({ type: 'step', status: 'start', stepType: 'linear-actuator', partId, direction, speed: effectiveSpeed, duration: effectiveDuration, usePreset, presetName });
  const r = await hardwareService.controlPart(String(partId), action, { speed: effectiveSpeed, duration: effectiveDuration });

  // Persist updated position estimate
  if (step._projectedP != null) {
    try { actuatorPositionStore.markStopped(parseInt(partId, 10), step._projectedP); } catch (_) {}
  }

  emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'linear-actuator', partId, result: r });
  if (!r || !r.success) throw new Error((r && r.error) || 'Linear actuator control failed');
  return r;
}

async function executeLightStep(step, characterId, emit) {
  const { partId, state = 'on', brightness = 100, duration = 0 } = step;
  if (!partId) throw new Error('light.step requires partId');

  // Light parts use 'turnOn' and 'turnOff' actions
  const action = state === 'on' ? 'turnOn' : 'turnOff';
  emit && emit({ type: 'step', status: 'start', stepType: 'light', partId, state, brightness, duration });
  const r = await hardwareService.controlPart(String(partId), action, { brightness, duration });
  emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'light', partId, result: r });
  if (!r || !r.success) throw new Error((r && r.error) || 'Light control failed');
  return r;
}


async function executeSensorStep(step, characterId, emit) {
  const { sensorId, partId, action = 'read', waitForMotion = false, timeout = 30000, threshold } = step;

  // Support both sensorId and partId for flexibility
  const id = sensorId || partId;
  if (!id) throw new Error('sensor.step requires sensorId or partId');

  emit && emit({ type: 'step', status: 'start', stepType: 'sensor', sensorId: id, action, waitForMotion });

  try {
    // Load parts to get sensor details
    const parts = await loadParts();
    const sensor = parts.find(p => String(p.id) === String(id));

    if (!sensor) {
      throw new Error(`Sensor not found: ${id}`);
    }

    if (sensor.type !== 'motion_sensor') {
      throw new Error(`Part ${id} is not a motion sensor (type: ${sensor.type})`);
    }

    const pin = sensor.pin;
    if (!pin) {
      throw new Error(`Sensor ${id} has no pin configured`);
    }

    // If waitForMotion is true, wait for motion to be detected
    if (waitForMotion) {
      emit && emit({ type: 'step', status: 'waiting', stepType: 'sensor', sensorId: id, message: 'Waiting for motion...' });

      const startTime = Date.now();
      const checkInterval = 500; // Check every 500ms

      while (Date.now() - startTime < timeout) {
        const result = await hardwareService.HARDWARE_CONTROLLERS.motion_sensor.read({ pin });

        if (result.success && result.motionDetected) {
          emit && emit({
            type: 'step',
            status: 'complete',
            stepType: 'sensor',
            sensorId: id,
            motionDetected: true,
            result
          });
          return { success: true, motionDetected: true, waitedMs: Date.now() - startTime };
        }

        // Wait before next check
        await new Promise(r => setTimeout(r, checkInterval));
      }

      // Timeout reached without motion
      throw new Error(`Timeout waiting for motion on sensor ${id} (${timeout}ms)`);
    }

    // Otherwise, just read the current sensor value
    const result = await hardwareService.HARDWARE_CONTROLLERS.motion_sensor.read({ pin });

    emit && emit({
      type: 'step',
      status: result.success ? 'complete' : 'error',
      stepType: 'sensor',
      sensorId: id,
      result
    });

    if (!result.success) {
      throw new Error(result.error || 'Sensor read failed');
    }

    // If threshold is specified, check if motion meets threshold
    if (threshold !== undefined) {
      const meetsThreshold = result.motionDetected === threshold;
      if (!meetsThreshold) {
        throw new Error(`Sensor value (${result.motionDetected}) does not meet threshold (${threshold})`);
      }
    }

    return result;
  } catch (error) {
    emit && emit({
      type: 'step',
      status: 'error',
      stepType: 'sensor',
      sensorId: id,
      error: error.message
    });
    throw error;
  }
}

async function executeHardwareStep(step, characterId, emit) {
  const { action, params = {} } = step;
  if (!action) throw new Error('hardware.step requires action');
  
  emit && emit({ type: 'step', status: 'start', stepType: 'hardware', action, params });
  
  // Map hardware actions to appropriate handlers
  switch (action) {
    case 'move_servo':
      // Convert hardware step to servo step format
      let partId = params.partId;
      if (!partId && (params.channel !== undefined)) {
        // In test mode, use a well-known servo part ID
        if (process.env.MB_TEST_MODE === '1') {
          partId = '63'; // Use existing servo part
        } else {
          partId = `servo_${params.channel}`;
        }
      }
      if (!partId) partId = '63'; // Default fallback
      
      const servoStep = {
        type: 'servo',
        partId: partId,
        angle: params.position || params.angle,
        duration: params.duration || 1000
      };
      return executeServoStep(servoStep, characterId, emit);
      
    case 'move_motor':
      // Convert hardware step to motor step format
      const motorStep = {
        type: 'motor',
        partId: params.channel || params.partId,
        speed: params.speed || 50,
        direction: params.direction || 'cw',
        duration: params.duration || 1000
      };
      return executeMotorStep(motorStep, characterId, emit);
      
    case 'move_actuator':
      // Convert hardware step to linear actuator step format
      const actuatorStep = {
        type: 'linear-actuator',
        partId: params.channel || params.partId,
        position: params.position || 0.5,
        speed: params.speed || 50,
        duration: params.duration || 1000
      };
      return executeLinearActuatorStep(actuatorStep, characterId, emit);
      
    case 'turn_light':
    case 'set_light':
      // Convert hardware step to light step format
      const lightStep = {
        type: 'light',
        partId: params.channel || params.partId,
        state: params.state || 'on',
        brightness: params.brightness || 100,
        duration: params.duration || 0
      };
      return executeLightStep(lightStep, characterId, emit);
      
    default:
      // For unrecognized actions, try to use the part control directly
      const defaultPartId = params.channel || params.partId || params.id;
      if (defaultPartId) {
        emit && emit({ type: 'step', status: 'start', stepType: 'hardware', action, partId: defaultPartId });
        const r = await hardwareService.controlPart(String(defaultPartId), String(action), params);
        emit && emit({ type: 'step', status: r && r.success ? 'complete' : 'error', stepType: 'hardware', action, partId: defaultPartId, result: r });
        if (!r || !r.success) throw new Error((r && r.error) || `Hardware action '${action}' failed`);
        return r;
      }
      throw new Error(`Unknown hardware action: ${action}`);
  }
}

async function executeJawAnimationStep(step, characterId, emit) {
  const action = step.action || 'enable';
  emit && emit({ type: 'step', status: 'start', stepType: 'jaw-animation', action });

  try {
    const jawService = await import('../jawAnimationSuperPowerService.js');
    if (action === 'enable') {
      // Read jaw config to verify it's configured
      const config = await jawService.readJawConfig(characterId);
      if (!config || !config.enabled) {
        emit && emit({ type: 'step', status: 'complete', stepType: 'jaw-animation', action, warning: 'Jaw animation not configured for this character' });
        return { success: true, action, warning: 'Jaw not configured' };
      }
      // Pre-warm the daemon so subsequent speech steps don't have startup delay
      try { await jawService.jawServoDaemon.ensureRunning(); } catch (_) {}
      emit && emit({ type: 'step', status: 'complete', stepType: 'jaw-animation', action });
      return { success: true, action: 'enable' };
    } else {
      // Disable - just signal it
      emit && emit({ type: 'step', status: 'complete', stepType: 'jaw-animation', action });
      return { success: true, action: 'disable' };
    }
  } catch (err) {
    // Non-fatal: jaw animation is optional
    emit && emit({ type: 'step', status: 'complete', stepType: 'jaw-animation', action, warning: err.message });
    return { success: true, action, warning: err.message };
  }
}

async function executeHeadTrackingStep(step, characterId, emit) {
  const action = step.action || 'start';
  emit && emit({ type: 'step', status: 'start', stepType: 'head-tracking', action });

  try {
    const { startMotionTracking, stopMotionTracking } = await import('../../controllers/motionTrackingController.js');
    if (action === 'start') {
      // Create a mock req/res to call the controller
      const mockReq = {
        body: { webcamId: step.webcamId || 'webcam-auto', params: step.params || {} }
      };
      let result = { success: true, action: 'start' };
      const mockRes = {
        status: function() { return mockRes; },
        json: function(data) { result = data; }
      };
      await startMotionTracking(mockReq, mockRes);
      // Controller may return success:false if webcam not found — non-fatal
      if (!result.success) {
        emit && emit({ type: 'step', status: 'complete', stepType: 'head-tracking', action, warning: result.error || 'Head tracking unavailable' });
        return { success: true, action, warning: result.error || 'Head tracking unavailable' };
      }
      emit && emit({ type: 'step', status: 'complete', stepType: 'head-tracking', action, result });
      return result;
    } else {
      // Stop
      const mockReq = { body: { webcamId: step.webcamId || 'webcam-auto' } };
      let result = { success: true, action: 'stop' };
      const mockRes = {
        status: function() { return mockRes; },
        json: function(data) { result = data; }
      };
      await stopMotionTracking(mockReq, mockRes);
      if (!result.success) {
        emit && emit({ type: 'step', status: 'complete', stepType: 'head-tracking', action, warning: result.error || 'Stop failed' });
        return { success: true, action, warning: result.error || 'Stop failed' };
      }
      emit && emit({ type: 'step', status: 'complete', stepType: 'head-tracking', action, result });
      return result;
    }
  } catch (err) {
    // Non-fatal: head tracking is optional
    emit && emit({ type: 'step', status: 'complete', stepType: 'head-tracking', action, warning: err.message });
    return { success: true, action, warning: err.message };
  }
}

export async function executeStep(step, characterId, emit, options) {
  const dryRun = options && options.dryRun;
  const t = (step.type || (step.poseId != null ? 'pose' : null));
  if (dryRun) {
    // Simulate success for all step types without side effects
    emit && emit({ type: 'step', status: 'start', stepType: t, dryRun: true });
    // small wait for wait step to preserve timing intent
    if (t === 'wait') {
      const d = parseInt(step.duration, 10) || parseInt(step.durationMs, 10) || 0;
      if (d > 0) { await new Promise(r => setTimeout(r, Math.min(d, 50))); }
    }
    emit && emit({ type: 'step', status: 'complete', stepType: t, dryRun: true });
    return { success: true, dryRun: true };
  }
  switch (t) {
    case 'pose':
      return executePoseStep(step, characterId, emit);
    case 'audio':
      return executeAudioStep(step, characterId, emit);
    case 'part':
      return executePartStep(step, characterId, emit);
    case 'wait':
      return executeWaitStep(step, emit);
    case 'sayThis':
      return executeSayThisStep(step, characterId, emit);
    case 'askAI':
      return executeAskAIStep(step, characterId, emit);
    case 'goblin':
    case 'goblin-video':
      return executeGoblinVideoStep(step, characterId, emit);
    case 'sensor':
      return executeSensorStep(step, characterId, emit);
    case 'servo':
      // Servo step: move servo to angle
      return executeServoStep(step, characterId, emit);
    case 'motor':
      // Motor step: control DC motor
      return executeMotorStep(step, characterId, emit);
    case 'linear-actuator':
      // Linear actuator step: extend/retract
      return executeLinearActuatorStep(step, characterId, emit);
    case 'light':
    case 'led':
      // Light/LED step: turn on/off with brightness
      return executeLightStep(step, characterId, emit);
    case 'hardware':
      // Generic hardware control step
      return executeHardwareStep(step, characterId, emit);
    case 'jaw-animation':
      return executeJawAnimationStep(step, characterId, emit);
    case 'head-tracking':
      return executeHeadTrackingStep(step, characterId, emit);
    default:
      throw new Error('Unknown step type: ' + t);
  }
}

/**
 * Fire-and-forget concurrent execution model:
 * - Steps with concurrent:true fire off without waiting, proceeding immediately to next step
 * - Steps without concurrent flag execute sequentially (await)
 * - After all steps processed, await all background promises for cleanup
 */
async function executeStepsWithConcurrency(steps, characterId, emit, opts) {
  const results = [];
  const backgroundPromises = [];
  let stepsExecuted = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};

    if (step.concurrent) {
      // Fire and forget — don't await, push to background
      emit && emit({ type: 'concurrent-started', index: i, stepType: step.type });
      const promise = executeStep(step, characterId, emit, opts)
        .then(r => { results.push(r); return r; })
        .catch(err => { console.error(`Background step ${i} (${step.type}) failed:`, err.message); return { success: false, error: err.message }; });
      backgroundPromises.push(promise);
      stepsExecuted++;
    } else {
      // Sequential — await normally
      const r = await executeStep(step, characterId, emit, opts);
      results.push(r);
      stepsExecuted++;
    }
  }

  // Wait for all background promises to settle for cleanup
  if (backgroundPromises.length > 0) {
    await Promise.allSettled(backgroundPromises);
  }

  return { results, stepsExecuted };
}

export async function executeScene(scene, characterId, emit, options) {
  const steps = Array.isArray(scene.steps) ? scene.steps : [];
  const results = [];
  const opts = options || {};
  const startTime = new Date().toISOString();
  const startTs = Date.now();
  let stepsExecuted = 0;

  emit && emit({ type: 'scene', status: 'start', id: scene.id, name: scene.name, totalSteps: steps.length, dryRun: !!opts.dryRun });

  try {
    const execResult = await executeStepsWithConcurrency(steps, characterId, emit, opts);
    results.push(...execResult.results);
    stepsExecuted = execResult.stepsExecuted;

    emit && emit({ type: 'scene', status: 'complete', id: scene.id, name: scene.name, resultsCount: results.length });

    // Log analytics (don't fail scene execution if analytics fails)
    if (!opts.dryRun && scene.id && characterId) {
      try {
        await sceneAnalytics.logSceneExecution(scene.id, characterId, {
          startTime,
          endTime: new Date().toISOString(),
          duration: Date.now() - startTs,
          stepsExecuted,
          totalSteps: steps.length,
          success: true,
          errors: [],
          performance: {}
        });
        await sceneAnalytics.updateSceneUsageStats(scene.id, characterId);
      } catch (analyticsError) {
        console.error('Failed to log scene analytics:', analyticsError);
      }
    }

    return { success: true, results };
  } catch (error) {
    // Log failed execution
    if (!opts.dryRun && scene.id && characterId) {
      try {
        await sceneAnalytics.logSceneExecution(scene.id, characterId, {
          startTime,
          endTime: new Date().toISOString(),
          duration: Date.now() - startTs,
          stepsExecuted,
          totalSteps: steps.length,
          success: false,
          errors: [{ message: error.message }],
          performance: {}
        });
      } catch (analyticsError) {
        console.error('Failed to log scene analytics:', analyticsError);
      }
    }
    throw error;
  }
}

export default { executeScene, executeStep };

