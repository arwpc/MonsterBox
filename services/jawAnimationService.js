import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from './hardwareService/index.js';
import { readConfig } from './configService.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getDataDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

async function readJawSettings() {
  try { const p = await getDataDir(); const f = path.resolve(p, 'jaw_settings.json'); const txt = await fs.readFile(f, 'utf8'); return JSON.parse(txt) || {}; } catch (_) { return {}; }
}

async function loadPartsSafe() {
  try { return await loadPartsFromController(); } catch (_) { return []; }
}

function estimateAmplitudeFromText(text) {
  // Very rough heuristic: more letters and punctuation -> more "energy"
  const len = Math.min(String(text || '').length, 400);
  const vowels = (text.match(/[aeiou]/gi) || []).length;
  const punct = (text.match(/[!?,.]/g) || []).length;
  const score = len * 0.4 + vowels * 0.8 + punct * 2;
  return Math.max(10, Math.min(100, Math.round(score / 8)));
}

async function findJawServoForCharacter(characterId) {
  const parts = await loadPartsSafe();
  const servos = parts.filter(p => String(p.type).toLowerCase() === 'servo');
  // Prefer servo explicitly named Jaw for this character
  let jaw = servos.find(s => (String(s.name || '').toLowerCase().includes('jaw')) && Number(s.characterId) === Number(characterId));
  if (!jaw) jaw = servos.find(s => String(s.name || '').toLowerCase().includes('jaw'));
  return jaw || null;
}

async function driveFromText({ characterId, text }) {
  try {
    // Respect per-character enable setting
    const settings = await readJawSettings();
    if (!characterId || !settings[String(characterId)] || settings[String(characterId)].enabled !== true) return;

    const jawServo = await findJawServoForCharacter(characterId);
    if (!jawServo) return;

    // Use PWM speed proportional to estimated amplitude; drive briefly
    const speed = estimateAmplitudeFromText(text); // 10..100

    // Use a simple open/close pulse pattern for ~0.8s total
    const seq = [
      { direction: 'cw', duration: 250 },
      { direction: 'ccw', duration: 300 },
      { direction: 'cw', duration: 180 }
    ];

    for (const step of seq) {
      await hardwareService.controlPart(jawServo, 'rotateContinuous', {
        direction: step.direction,
        speed,
        duration: step.duration
      });
    }

    // Stop servo (if supported)
    try { await hardwareService.controlPart(jawServo, 'stop', {}); } catch (_) {}
  } catch (_) {
    // Best-effort only
  }
}

export async function driveFromAmplitude({ characterId, amplitude }) {
  try {
    const settings = await readJawSettings();
    if (!characterId || !settings[String(characterId)] || settings[String(characterId)].enabled !== true) return;
    const jawServo = await findJawServoForCharacter(characterId);
    if (!jawServo) return;

    // amplitude expected 0..1; map to 10..100 speed
    const speed = Math.max(10, Math.min(100, Math.round((amplitude || 0) * 100)));

    // Alternate direction per call time to create chatter
    const cw = (Date.now() % 400) < 200;
    await hardwareService.controlPart(jawServo, 'rotateContinuous', {
      direction: cw ? 'cw' : 'ccw',
      speed,
      duration: 120
    });
  } catch (_) { /* ignore */ }
}

export default { driveFromText, driveFromAmplitude };

