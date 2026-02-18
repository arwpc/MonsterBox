import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.resolve(__dirname, '../config/app-config.json');

export async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { port: 3000, theme: 'dark', selectedCharacter: null };
  }
}

export async function updateSelectedCharacter(id) {
  const config = await readConfig();
  const next = Object.assign({}, config, {
    selectedCharacter: id,
    dataPath: `data/character-${id}`  // Dynamic data path for character isolation
  });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

const ANIMATRONICS_FILE = path.resolve(__dirname, '../config/animatronics.json');

export async function getHostnameCharacterId() {
  try {
    const hostname = os.hostname().toLowerCase();
    const data = await fs.readFile(ANIMATRONICS_FILE, 'utf8');
    const { animatronics } = JSON.parse(data);
    const match = animatronics.find(a => a.hostname === hostname);
    return match ? match.characterId : null;
  } catch (err) {
    return null;
  }
}

export default { readConfig, updateSelectedCharacter, getHostnameCharacterId };

