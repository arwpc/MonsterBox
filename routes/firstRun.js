import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCharacters() {
  const file = path.join(__dirname, '..', 'data', 'characters.json');
  const data = await fs.readFile(file, 'utf8');
  return JSON.parse(data);
}

async function loadAppConfig() {
  try {
    const file = path.join(__dirname, '..', 'config', 'app-config.json');
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (_) {
    return { selectedCharacter: null, theme: 'dark' };
  }
}

async function loadPartsCount(characterId) {
  try {
    const file = path.join(__dirname, '..', 'data', `character-${characterId}`, 'parts.json');
    const data = await fs.readFile(file, 'utf8');
    const parts = JSON.parse(data);
    return parts.length;
  } catch (_) {
    return 0;
  }
}

function suggestCharacterByHostname(characters) {
  try {
    const hostname = os.hostname().toLowerCase();
    // Look for character name in hostname
    for (const char of characters) {
      if (hostname.includes(char.name.toLowerCase().replace(/\s+/g, '-')) ||
          hostname.includes(char.name.toLowerCase().replace(/\s+/g, ''))) {
        return char;
      }
    }
  } catch (_) {
    // Ignore hostname errors
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const [characters, config] = await Promise.all([loadCharacters(), loadAppConfig()]);
    
    // Load parts count for each character
    const charactersWithInfo = await Promise.all(
      characters.map(async (ch) => ({
        ...ch,
        partsCount: await loadPartsCount(ch.id)
      }))
    );
    
    const suggestedCharacter = suggestCharacterByHostname(characters);
    
    res.renderWithLayout('first-run/index', {
      title: 'First Run - Select Your Character',
      page: 'first-run',
      characters: charactersWithInfo,
      selectedCharacter: config.selectedCharacter,
      suggestedCharacter,
      styles: ['/css/first-run.css'],
      scripts: ['/js/first-run.js']
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Error', error: 'Failed to load first-run', message: err.message });
  }
});

export default router;

