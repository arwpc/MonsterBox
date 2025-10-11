import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to recursively copy directory contents
async function copyDirectory(src, dest) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not copy directory:', error.message);
  }
}

// Resolve characters.json path - always global, not character-specific
async function resolveCharactersPath() {
  const appRoot = path.resolve(__dirname, '..');
  return path.resolve(appRoot, 'data', 'characters.json');
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

  // Add optional fields if provided
  if (data && data.elevenLabsAgentId) {
    newChar.elevenLabsAgentId = data.elevenLabsAgentId;
  }

  // Create character data directory
  const appRoot = path.resolve(__dirname, '..');
  const characterDataDir = path.resolve(appRoot, 'data', `character-${newChar.id}`);
  await fs.mkdir(characterDataDir, { recursive: true });
  await fs.mkdir(path.join(characterDataDir, 'ai-config'), { recursive: true });

  // Copy template files
  const templateDir = path.resolve(appRoot, 'data', 'character-templates', 'default');
  await copyDirectory(templateDir, characterDataDir);

  // Update character-specific configuration files with correct character ID
  try {
    // Update audio-config.json with character ID
    const audioConfigPath = path.join(characterDataDir, 'audio-config.json');
    const audioConfigData = await fs.readFile(audioConfigPath, 'utf8');
    const audioConfig = JSON.parse(audioConfigData);
    audioConfig.characterId = newChar.id;
    audioConfig.created = new Date().toISOString();
    audioConfig.lastUpdated = new Date().toISOString();
    audioConfig.lastModified = new Date().toISOString();
    await fs.writeFile(audioConfigPath, JSON.stringify(audioConfig, null, 2), 'utf8');

    // Update microphones.json with character ID
    const microphonesPath = path.join(characterDataDir, 'microphones.json');
    const microphonesData = await fs.readFile(microphonesPath, 'utf8');
    const microphones = JSON.parse(microphonesData);
    if (microphones.length > 0) {
      microphones[0].id = newChar.id;
      microphones[0].characterId = newChar.id;
      microphones[0].name = `${newChar.name} Microphone`;
      microphones[0].created = new Date().toISOString();
      microphones[0].lastModified = new Date().toISOString();
      await fs.writeFile(microphonesPath, JSON.stringify(microphones, null, 2), 'utf8');
    }
  } catch (error) {
    console.warn('Warning: Could not update character-specific audio configuration:', error.message);
  }

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
