import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getScenesFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..', '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
  return path.resolve(appRoot, dataDir, 'scenes.json');
}

export async function loadScenes() {
  const filePath = await getScenesFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function saveScenes(scenes) {
  const filePath = await getScenesFilePath();
  await fs.writeFile(filePath, JSON.stringify(scenes || [], null, 2));
  return true;
}

export async function nextSceneId() {
  const scenes = await loadScenes();
  let maxId = 0;
  for (let i = 0; i < scenes.length; i++) { maxId = Math.max(maxId, parseInt(scenes[i].id, 10) || 0); }
  return maxId + 1;
}

export async function getSceneById(sceneId, characterId) {
  const scenes = await loadScenes();
  const scene = scenes.find(s => parseInt(s.id, 10) === parseInt(sceneId, 10));
  return scene || null;
}

export async function loadTemplates() {
  const appRoot = path.resolve(__dirname, '..', '..');
  const templatesPath = path.resolve(appRoot, 'data', 'scene-templates.json');
  try {
    const data = await fs.readFile(templatesPath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export default { loadScenes, saveScenes, nextSceneId, getSceneById, loadTemplates };

