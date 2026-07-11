import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomic } from '../services/atomicStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getModelsFilePath() {
  // Webcam models are global/shared — resolve the SAME file modelsController
  // uses (data/models/webcam_models.json). This previously used cfg.dataPath
  // (character-scoped), so the two live controllers managed different files and
  // the webcam-models list depended on which controller/route you hit (split-brain).
  const appRoot = path.resolve(__dirname, '..');
  return path.resolve(appRoot, 'data', 'models', 'webcam_models.json');
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function loadModels() {
  const filePath = await getModelsFilePath();
  // Migrate from legacy root path if needed
  try {
    await fs.access(filePath);
  } catch (e) {
    try {
      const appRoot = path.resolve(__dirname, '..');
      const legacyPath = path.resolve(appRoot, 'data', 'webcam_models.json');
      const legacyData = await fs.readFile(legacyPath, 'utf8');
      await ensureDir(filePath);
      await fs.writeFile(filePath, legacyData, 'utf8');
    } catch (_) { /* ignore */ }
  }
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveModels(models) {
  const filePath = await getModelsFilePath();
  await ensureDir(filePath);
  await writeJsonAtomic(filePath, models);
}

function toId(v) { return String(v); }

export const getAllModels = async (req, res) => {
  try {
    const models = await loadModels();
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getModelById = async (req, res) => {
  try {
    const models = await loadModels();
    const model = models.find(m => toId(m.id) === toId(req.params.id));
    if (!model) return res.status(404).json({ success: false, error: 'Model not found' });
    res.json({ success: true, model });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createModel = async (req, res) => {
  try {
    const { name, description, defaults, controlsSchema } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const models = await loadModels();
    const id = Date.now().toString();
    const model = { id, name, description: description || '', defaults: defaults || {}, controlsSchema: controlsSchema || {} };
    models.push(model);
    await saveModels(models);
    res.json({ success: true, message: 'Model created', model });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateModel = async (req, res) => {
  try {
    const { id } = req.params;
    const models = await loadModels();
    const idx = models.findIndex(m => toId(m.id) === toId(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Model not found' });
    const cur = models[idx];
    const { name, description, defaults, controlsSchema } = req.body || {};
    const next = Object.assign({}, cur, {
      name: typeof name === 'string' ? name : cur.name,
      description: typeof description === 'string' ? description : cur.description,
      defaults: typeof defaults === 'object' && defaults != null ? defaults : cur.defaults,
      controlsSchema: typeof controlsSchema === 'object' && controlsSchema != null ? controlsSchema : cur.controlsSchema,
      updated: new Date().toISOString()
    });
    models[idx] = next;
    await saveModels(models);
    res.json({ success: true, message: 'Model updated', model: next });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteModel = async (req, res) => {
  try {
    const { id } = req.params;
    const models = await loadModels();
    const next = models.filter(m => toId(m.id) !== toId(id));
    if (next.length === models.length) return res.status(404).json({ success: false, error: 'Model not found' });
    await saveModels(next);
    res.json({ success: true, message: 'Model deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export default { getAllModels, getModelById, createModel, updateModel, deleteModel };

