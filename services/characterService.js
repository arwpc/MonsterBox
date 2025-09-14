import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve characters.json path with optional override from config.dataPath.
// dataPath is resolved relative to the app root (apps/monsterbox4), not process.cwd().
async function resolveCharactersPath() {
  try {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    if (cfg && cfg.dataPath) {
      return path.resolve(appRoot, cfg.dataPath, 'characters.json');
    }
    return path.resolve(appRoot, 'data', 'characters.json');
  } catch (e) {
    const appRoot = path.resolve(__dirname, '..');
    return path.resolve(appRoot, 'data', 'characters.json');
  }
}

function getDefaultCharacters() {
  return [
    { id: 1, name: 'Orlok' },
    { id: 4, name: 'Skulltalker' }
  ];
}

export async function loadCharacters() {
  try {
    const file = await resolveCharactersPath();
    const data = await fs.readFile(file, 'utf8');
    const characters = JSON.parse(data);
    if (Array.isArray(characters)) return characters;
    return getDefaultCharacters();
  } catch (err) {
    console.warn('⚠️ Could not load characters:', err.message);
    return getDefaultCharacters();
  }
}

export async function saveCharacters(characters) {
  const file = await resolveCharactersPath();
  const json = JSON.stringify(characters, null, 2);
  // Ensure directory exists
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json, 'utf8');
}

export async function getCharacterById(id) {
  const characters = await loadCharacters();
  return characters.find(function (c) { return c.id === id; }) || null;
}

export async function createCharacter(data) {
  const characters = await loadCharacters();
  var maxId = 0;
  for (var i = 0; i < characters.length; i++) {
    if (characters[i].id > maxId) maxId = characters[i].id;
  }
  var newChar = {
    id: maxId + 1,
    name: data && data.name ? String(data.name) : 'New Character'
  };
  characters.push(newChar);
  await saveCharacters(characters);
  return newChar;
}

export async function updateCharacter(id, updates) {
  const characters = await loadCharacters();
  for (var i = 0; i < characters.length; i++) {
    if (characters[i].id === id) {
      characters[i] = Object.assign({}, characters[i], updates, { id: id });
      await saveCharacters(characters);
      return characters[i];
    }
  }
  return null;
}

export async function deleteCharacter(id) {
  const characters = await loadCharacters();
  var idx = -1;
  for (var i = 0; i < characters.length; i++) {
    if (characters[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return false;
  characters.splice(idx, 1);
  await saveCharacters(characters);
  return true;
}

export default {
  loadCharacters,
  saveCharacters,
  getCharacterById,
  createCharacter,
  updateCharacter,
  deleteCharacter
};
