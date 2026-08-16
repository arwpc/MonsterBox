import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomic } from './atomicStore.js';

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

const CHARACTERS_FILE = path.resolve(__dirname, '../data/characters.json');

// Whether `id` names a character that actually exists in the registry.
// Returns null (rather than false) when the registry itself is unreadable, so a
// caller can tell "definitely not a character" from "cannot currently tell".
async function isRegisteredCharacter(id) {
  try {
    const raw = await fs.readFile(CHARACTERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.characters || []);
    return list.some(c => String(c.id) === String(id));
  } catch (err) {
    return null;
  }
}

export async function updateSelectedCharacter(id) {
  const config = await readConfig();

  // Refuse to persist an id that names no character. This used to write anything
  // it was handed, which is how `selectedCharacter: 999999` reached app-config.json
  // and pointed dataPath at a directory that does not exist. We refuse rather than
  // throw: this runs on the startup path, and a hard failure here would leave the
  // node unable to boot on show night over a config typo. Refusing is loud in the
  // log, leaves the previous good value in place, and returns the config that is
  // actually in effect, so callers report the truth rather than the request.
  const registered = await isRegisteredCharacter(id);
  if (registered === false) {
    console.error(
      `[config] REFUSED to select character ${id}: no such character in data/characters.json. ` +
      `Keeping ${config.selectedCharacter}.`
    );
    return config;
  }

  const next = Object.assign({}, config, {
    selectedCharacter: id,
    dataPath: `data/character-${id}`  // Dynamic data path for character isolation
  });
  await writeJsonAtomic(CONFIG_FILE, next);
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

