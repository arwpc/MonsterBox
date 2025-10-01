/**
 * ElevenLabs API Key Loader
 * Provides a consistent way to retrieve the ElevenLabs API key across the app.
 *
 * Resolution order (first non-empty wins):
 * 1) process.env.ELEVENLABS_API_KEY
 * 2) data/ai-config/stt-config.json -> apiKey
 * 3) data/ai-config/elevenlabs-config.json -> apiKey
 * 4) data/elevenlabs-config.json -> apiKey
 * 5) .env file (ELEVENLABS_API_KEY=...)
 * 6) .env.backup file (ELEVENLABS_API_KEY=...)
 * 7) /etc/monsterbox/elevenlabs.key (raw key)
 */

const fs = require('fs');
const path = require('path');

function isUsableKey(value) {
  if (!value) return false;
  const v = String(value).trim();
  if (!v) return false;
  // Filter placeholders like 'your_xxx_here'
  if (v.includes('your_') || v.includes('_here')) return false;
  return v.length >= 20; // ElevenLabs keys are long enough; avoid logging exact value
}

function tryReadJson(filePath, field) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const val = field ? json[field] : json.apiKey;
    return isUsableKey(val) ? String(val).trim() : null;
  } catch (_) {
    return null;
  }
}

function tryReadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().startsWith('ELEVENLABS_API_KEY=')) {
        const val = line.split('=')[1]?.trim().replace(/^['"]|['"]$/g, '');
        if (isUsableKey(val)) return val;
      }
    }
  } catch (_) {}
  return null;
}

function tryReadRawFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const val = fs.readFileSync(filePath, 'utf8').trim();
    return isUsableKey(val) ? val : null;
  } catch (_) {
    return null;
  }
}

function getElevenLabsApiKeySync() {
  // 1) Environment
  if (isUsableKey(process.env.ELEVENLABS_API_KEY)) {
    return process.env.ELEVENLABS_API_KEY.trim();
  }

  // 2) data/ai-config/stt-config.json
  const sttConfig = path.join(process.cwd(), 'data', 'ai-config', 'stt-config.json');
  const keyFromStt = tryReadJson(sttConfig, 'apiKey');
  if (keyFromStt) return keyFromStt;

  // 3) data/ai-config/elevenlabs-config.json
  const aiElevenCfg = path.join(process.cwd(), 'data', 'ai-config', 'elevenlabs-config.json');
  const keyFromAiCfg = tryReadJson(aiElevenCfg, 'apiKey');
  if (keyFromAiCfg) return keyFromAiCfg;

  // 4) data/elevenlabs-config.json
  const rootElevenCfg = path.join(process.cwd(), 'data', 'elevenlabs-config.json');
  const keyFromRootCfg = tryReadJson(rootElevenCfg, 'apiKey');
  if (keyFromRootCfg) return keyFromRootCfg;

  // 5) .env
  const envPath = path.join(process.cwd(), '.env');
  const fromEnvFile = tryReadEnvFile(envPath);
  if (fromEnvFile) return fromEnvFile;

  // 6) .env.backup
  const envBackup = path.join(process.cwd(), '.env.backup');
  const fromEnvBackup = tryReadEnvFile(envBackup);
  if (fromEnvBackup) return fromEnvBackup;

  // 7) /etc/monsterbox/elevenlabs.key
  const systemKey = '/etc/monsterbox/elevenlabs.key';
  const fromSystem = tryReadRawFile(systemKey);
  if (fromSystem) return fromSystem;

  return null;
}

function getMaskedKey(key) {
  if (!key) return 'not set';
  const v = String(key);
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

module.exports = {
  getElevenLabsApiKeySync,
  getMaskedKey,
};

