import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';
import { writeJsonAtomic, withFileLock } from '../atomicStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the scenes.json for a specific character when characterId is given
// (honoring the resolver's explicit ?characterId override), otherwise the
// node's selected character via config.dataPath. characterId must be a plain
// integer — anything else falls back to the selected character.
async function getScenesFilePath(characterId) {
  const appRoot = path.resolve(__dirname, '..', '..');
  if (characterId != null && /^\d+$/.test(String(characterId))) {
    return path.resolve(appRoot, 'data', `character-${characterId}`, 'scenes.json');
  }
  const cfg = await readConfig();
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
  return path.resolve(appRoot, dataDir, 'scenes.json');
}

export async function loadScenes(characterId) {
  const filePath = await getScenesFilePath(characterId);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function saveScenes(scenes, characterId) {
  const filePath = await getScenesFilePath(characterId);
  // Atomic write: a power loss mid-write previously left a truncated scenes.json
  // that failed to parse on next boot — losing the entire scene library.
  await writeJsonAtomic(filePath, scenes || []);
  return true;
}

/**
 * Run a load → mutate → save cycle for the current character's scenes.json under
 * a per-file lock so concurrent create/edit requests can't each read the same
 * list and clobber the other's write (which produced duplicate scene IDs and
 * lost updates). The mutator receives the scenes array and may return a value.
 * @param {(scenes: Array) => (any|Promise<any>)} mutator
 * @returns {Promise<any>} whatever the mutator returns
 */
export async function mutateScenes(mutator, characterId) {
  const filePath = await getScenesFilePath(characterId);
  return withFileLock(`scenes:${filePath}`, async () => {
    const scenes = await loadScenes(characterId);
    const result = await mutator(scenes);
    await saveScenes(scenes, characterId);
    return result;
  });
}

export async function nextSceneId(characterId) {
  const scenes = await loadScenes(characterId);
  let maxId = 0;
  for (let i = 0; i < scenes.length; i++) { maxId = Math.max(maxId, parseInt(scenes[i].id, 10) || 0); }
  return maxId + 1;
}

export async function getSceneById(sceneId, characterId) {
  const scenes = await loadScenes(characterId);
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

export default { loadScenes, saveScenes, mutateScenes, nextSceneId, getSceneById, loadTemplates };

