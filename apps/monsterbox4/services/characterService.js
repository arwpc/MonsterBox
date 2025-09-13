import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHARACTERS_FILE = path.resolve(__dirname, '../../../data/characters.json');

function getDefaultCharacters() {
  return [
    { id: 1, name: 'Orlok' },
    { id: 4, name: 'Skulltalker' }
  ];
}

export async function loadCharacters() {
  try {
    const data = await fs.readFile(CHARACTERS_FILE, 'utf8');
    const characters = JSON.parse(data);
    if (Array.isArray(characters)) return characters;
    return getDefaultCharacters();
  } catch (err) {
    console.warn('⚠️ Could not load characters:', err.message);
    return getDefaultCharacters();
  }
}

export async function saveCharacters(characters) {
  const json = JSON.stringify(characters, null, 2);
  await fs.writeFile(CHARACTERS_FILE, json, 'utf8');
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

