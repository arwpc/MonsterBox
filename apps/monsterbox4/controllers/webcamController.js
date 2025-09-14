import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getPartsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
  return path.resolve(appRoot, dataDir, 'parts.json');
}

async function loadParts() {
  const filePath = await getPartsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export const listControls = async (req, res) => {
  try {
    const { id } = req.params;
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });
    const deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;

    const result = await hardwareService.HARDWARE_CONTROLLERS.webcam.listControls({ deviceId });
    res.json({ success: !!result.success, controls: result.controls, rawOutput: result.rawOutput, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const setControls = async (req, res) => {
  try {
    const { id } = req.params;
    const { controls, persist } = req.body || {};
    if (!controls || typeof controls !== 'object') {
      return res.status(400).json({ success: false, error: 'controls object required' });
    }
    const parts = await loadParts();
    const idx = parts.findIndex(p => String(p.id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
    const part = parts[idx];
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });
    const deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;

    const result = await hardwareService.HARDWARE_CONTROLLERS.webcam.setControls({ deviceId, controls });
    if (!result.success) return res.status(400).json({ success: false, error: result.error || 'Failed to set controls', rawOutput: result.rawOutput });

    // Persist to part config if requested
    if (persist) {
      const nextCfg = Object.assign({}, part.config || {}, { controls: Object.assign({}, (part.config && part.config.controls) || {}, controls) });
      parts[idx] = Object.assign({}, part, { config: nextCfg, updated: new Date().toISOString() });
      const filePath = await getPartsFilePath();
      await fs.writeFile(filePath, JSON.stringify(parts, null, 2));
    }

    res.json({ success: true, applied: controls, message: result.message || 'Controls applied', rawOutput: result.rawOutput });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export default { listControls, setControls };

