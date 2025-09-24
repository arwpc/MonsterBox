import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';
import poseEngine from '../poses/poseEngine.js';
import hardwareService from '../hardwareService/index.js';
import elevenLabsTTSService from '../elevenLabsTTSService.js';
import serverPlaybackService from '../serverPlaybackService.js';
import { getTTSConfig } from '../aiConfigStore.js';

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

async function resolveAudioFile(audioId) {
  // Allow absolute or relative; if bare filename, resolve under data/audio-library
  if (!audioId) return null;
  if (audioId.startsWith('/') || audioId.startsWith('./')) return path.resolve(audioId);
  const dataDir = await getDataDir();
  const p = path.resolve(dataDir, 'audio-library', audioId);
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
  const r = await hardwareService.speaker.play({ audioDeviceId: deviceId, filename, volume: step.volume != null ? step.volume : 80 });
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

  const ttsCfg = await getTTSConfig();
  const voiceId = step.voiceId || ttsCfg.voice_id;
  const gen = await elevenLabsTTSService.generateSpeech(text, voiceId, ttsCfg);
  if (!gen.success) {
    emit && emit({ type: 'step', status: 'error', stepType: 'sayThis', error: gen.error });
    throw new Error(gen.error || 'TTS generation failed');
  }

  const play = await serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, { contentType: gen.contentType, characterId });
  emit && emit({ type: 'step', status: play.success ? 'complete' : 'error', stepType: 'sayThis', result: play });
  if (!play.success) throw new Error(play.error || 'TTS playback failed');
  return play;
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
    default:
      throw new Error('Unknown step type: ' + t);
  }
}

function groupStepsForConcurrency(steps) {
  const groups = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] || {};
    if (s.concurrent && i + 1 < steps.length) {
      groups.push([s, steps[i + 1]]);
      i += 1; // skip next (paired)
    } else {
      groups.push([s]);
    }
  }
  return groups;
}

export async function executeScene(scene, characterId, emit, options) {
  const steps = Array.isArray(scene.steps) ? scene.steps : [];
  const groups = groupStepsForConcurrency(steps);
  const results = [];
  const opts = options || {};

  emit && emit({ type: 'scene', status: 'start', id: scene.id, name: scene.name, totalSteps: steps.length, dryRun: !!opts.dryRun });

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const startTs = Date.now();
    emit && emit({ type: 'group', status: 'start', index: gi, size: group.length });

    if (group.length === 1) {
      const r = await executeStep(group[0], characterId, emit, opts);
      results.push(r);
    } else {
      // concurrent pair
      const proms = group.map(s => executeStep(s, characterId, emit, opts));
      const settled = await Promise.allSettled(proms);
      results.push(settled);
      const anyRejected = settled.some(p => p.status === 'rejected');
      if (anyRejected) {
        emit && emit({ type: 'group', status: 'error', index: gi, durationMs: Date.now() - startTs });
        throw new Error('Concurrent step failed at group ' + gi);
      }
    }

    emit && emit({ type: 'group', status: 'complete', index: gi, durationMs: Date.now() - startTs });
  }

  emit && emit({ type: 'scene', status: 'complete', id: scene.id, name: scene.name, resultsCount: results.length });
  return { success: true, results };
}

export default { executeScene, executeStep };

