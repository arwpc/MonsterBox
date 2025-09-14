import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getModelsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
  return path.resolve(appRoot, dataDir, 'webcam_models.json');
}

async function loadModels() {
  const filePath = await getModelsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveModels(models) {
  const filePath = await getModelsFilePath();
  await fs.writeFile(filePath, JSON.stringify(models, null, 2), 'utf8');
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

