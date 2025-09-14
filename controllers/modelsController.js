import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TYPE_TO_FILE = {
  servo: 'servo_models.json',
  led: 'led_models.json',
  linear_actuator: 'linear_actuator_models.json',
  webcam: 'webcam_models.json'
};

async function getDataDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : '../data');
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function getModelsFilePath(type) {
  const dataDir = await getDataDir();
  const fname = TYPE_TO_FILE[type];
  if (!fname) throw new Error(`Unsupported model type: ${type}`);
  return path.resolve(dataDir, fname);
}

async function seedServoModelsIfNeeded(filePath) {
  try {
    await fs.access(filePath);
    const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (Array.isArray(content) && content.length > 0) return; // already seeded
  } catch (_) {
    // proceed to seed
  }
  // Read legacy rich models from data/servos.json if present
  try {
    const dataDir = await getDataDir();
    const legacyPath = path.resolve(dataDir, 'servos.json');
    const legacyRaw = await fs.readFile(legacyPath, 'utf8');
    const legacy = JSON.parse(legacyRaw);
    const models = (legacy.servos || []).map((s, i) => ({
      id: String(i + 1),
      name: s.name || s.model || 'Servo',
      manufacturer: s.manufacturer || '',
      defaults: {
        minPulse: s.min_pulse_width_us ?? s.minPulse ?? 500,
        maxPulse: s.max_pulse_width_us ?? s.maxPulse ?? 2500,
        neutralPulse: s.neutral_pulse_us ?? s.neutralPulse ?? 1500,
        rotationRangeDeg: s.rotation_range_deg ?? s.rotationRangeDeg ?? 180,
        servoType: s.feedback ? 'feedback' : (Array.isArray(s.mode) && s.mode.includes('Continuous') ? 'continuous' : 'standard')
      },
      meta: {
        notes: s.notes || '',
        controlType: s.control_type || s.controlType || ['PWM']
      }
    }));
    await ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(models, null, 2), 'utf8');
  } catch (err) {
    // fallback: write empty array
    await ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify([], null, 2), 'utf8');
  }
}

async function loadModels(type) {
  const filePath = await getModelsFilePath(type);
  if (type === 'servo') await seedServoModelsIfNeeded(filePath);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveModels(type, models) {
  const filePath = await getModelsFilePath(type);
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(models, null, 2), 'utf8');
}

function toId(v) { return String(v); }

export const getAllModels = async (req, res) => {
  try {
    const { type } = req.params;
    const models = await loadModels(type);
    res.json({ success: true, type, models });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const getModelById = async (req, res) => {
  try {
    const { type, id } = req.params;
    const models = await loadModels(type);
    const model = models.find(m => toId(m.id) === toId(id));
    if (!model) return res.status(404).json({ success: false, error: 'Model not found' });
    res.json({ success: true, type, model });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const createModel = async (req, res) => {
  try {
    const { type } = req.params;
    const { name, description, defaults, controlsSchema, meta } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const models = await loadModels(type);
    const id = Date.now().toString();
    const model = { id, name, description: description || '', defaults: defaults || {}, controlsSchema: controlsSchema || {}, meta: meta || {} };
    models.push(model);
    await saveModels(type, models);
    res.json({ success: true, message: 'Model created', type, model });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const updateModel = async (req, res) => {
  try {
    const { type, id } = req.params;
    const models = await loadModels(type);
    const idx = models.findIndex(m => toId(m.id) === toId(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Model not found' });
    const cur = models[idx];
    const { name, description, defaults, controlsSchema, meta } = req.body || {};
    const next = Object.assign({}, cur, {
      name: typeof name === 'string' ? name : cur.name,
      description: typeof description === 'string' ? description : cur.description,
      defaults: (defaults && typeof defaults === 'object') ? defaults : cur.defaults,
      controlsSchema: (controlsSchema && typeof controlsSchema === 'object') ? controlsSchema : cur.controlsSchema,
      meta: (meta && typeof meta === 'object') ? meta : cur.meta,
      updated: new Date().toISOString()
    });
    models[idx] = next;
    await saveModels(type, models);
    res.json({ success: true, message: 'Model updated', type, model: next });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const deleteModel = async (req, res) => {
  try {
    const { type, id } = req.params;
    const models = await loadModels(type);
    const next = models.filter(m => toId(m.id) !== toId(id));
    if (next.length === models.length) return res.status(404).json({ success: false, error: 'Model not found' });
    await saveModels(type, next);
    res.json({ success: true, message: 'Model deleted', type });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export default { getAllModels, getModelById, createModel, updateModel, deleteModel };

