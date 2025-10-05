import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

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

router.get('/', async (req, res) => {
  try {
    const [characters, config] = await Promise.all([loadCharacters(), loadAppConfig()]);
    res.render('first-run/index', {
      title: 'First Run - Select Your Character',
      page: 'first-run',
      characters,
      selectedCharacter: config.selectedCharacter,
      styles: ['/css/first-run.css'],
      scripts: ['/js/first-run.js']
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Error', error: 'Failed to load first-run', message: err.message });
  }
});

export default router;

