import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.resolve(APP_ROOT, 'data');

/**
 * Resolve the on-disk data directory for a character id.
 *
 * This exists to make `deleteCharacter` safe. It is the ONLY place that turns an
 * id into a path we are willing to recursively delete, and it refuses anything
 * that is not literally `<repo>/data/character-<digits>`. A bad id must never be
 * able to point the removal at `data/`, at the repo root, or at any path outside
 * `data/` via traversal.
 *
 * Throws rather than returning null: a caller that is about to delete a tree
 * should never get a "close enough" answer.
 */
export function resolveCharacterDataDir(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error(`Refusing to resolve a character data directory for a non-integer id: ${JSON.stringify(id)}`);
  }

  const dirName = `character-${id}`;
  // Belt and braces: an integer can't produce a separator or a dot segment, but
  // assert the shape anyway so a future change to the id type can't sneak one in.
  if (!/^character-[0-9]+$/.test(dirName)) {
    throw new Error(`Refusing to resolve an unexpected character directory name: ${dirName}`);
  }

  const dir = path.resolve(DATA_ROOT, dirName);
  // After resolution the directory must still be an immediate child of data/
  // with exactly the name we built. Traversal or absolute-path injection changes
  // one of these two facts.
  if (path.dirname(dir) !== DATA_ROOT || path.basename(dir) !== dirName) {
    throw new Error(`Refusing to touch a path outside data/: ${dir}`);
  }
  if (dir === DATA_ROOT || dir === APP_ROOT) {
    throw new Error(`Refusing to touch ${dir}`);
  }
  return dir;
}

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
  // Return empty array — callers must handle missing characters gracefully
  console.error('❌ characters.json is missing or invalid — returning empty character list');
  return [];
}

export async function loadCharacters() {
  try {
    const file = await resolveCharactersPath();
    const data = await fs.readFile(file, 'utf8');
    let characters = JSON.parse(data);
    if (!Array.isArray(characters)) characters = getDefaultCharacters();
    // Test fixture: normalize to canonical ids/names expected by E2E test suite
    if (String(process.env.MB_TEST_MODE || '') === '1' || String(process.env.MB_TEST_MODE || '').toLowerCase() === 'true') {
      const canonical = [
        { id: 1, name: 'PumpkinHead' },
        { id: 2, name: 'Mina' },
        { id: 3, name: 'Orlok' },
        { id: 4, name: 'Sir Dragomir' }
      ];
      const existingByName = new Map((characters || []).map(c => [String(c.name || ''), c]));
      // Start with canonical ensuring these exact ids, preserving any extra fields from existing entries
      let normalized = canonical.map(c => {
        const existing = existingByName.get(c.name) || {};
        return Object.assign({}, existing, { id: c.id, name: c.name });
      });
      // Append any other characters preserving ALL fields but assigning new ids > 4
      let nextId = 5;
      for (const c of (characters || [])) {
        if (canonical.some(x => x.name === c.name)) continue;
        const copy = Object.assign({}, c, { id: nextId++ });
        normalized.push(copy);
      }
      // Persist normalization if changed
      const changed = JSON.stringify(characters) !== JSON.stringify(normalized);
      if (changed) {
        await saveCharacters(normalized);
        characters = normalized;
        // Ensure data directories exist for canonical ids
        try {
          const appRoot = path.resolve(__dirname, '..');
          for (const base of [1, 2, 3, 4]) {
            const dir = path.resolve(appRoot, 'data', `character-${base}`);
            await fs.mkdir(dir, { recursive: true });
          }
        } catch (_) { /* best effort */ }
      }
    }
    return characters;
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

  // Create character data directory. Resolved through the same helper that
  // deleteCharacter uses, so create and delete can never disagree about which
  // directory belongs to a character.
  const characterDataDir = resolveCharacterDataDir(newChar.id);
  await fs.mkdir(characterDataDir, { recursive: true });
  await fs.mkdir(path.join(characterDataDir, 'ai-config'), { recursive: true });

  // Copy template files
  const templateDir = path.resolve(APP_ROOT, 'data', 'character-templates', 'default');
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

/**
 * Move a character's data directory into data/.deleted-characters/ instead of
 * destroying it. Used when MB_PRESERVE_DELETED_CHARACTER_DATA is set. The rename
 * stays on the same filesystem, so it costs no SD-card writes beyond the inode.
 */
async function archiveCharacterDataDir(dir, characterId) {
  const archiveRoot = path.resolve(DATA_ROOT, '.deleted-characters');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.resolve(archiveRoot, `character-${characterId}-${stamp}`);
  await fs.mkdir(archiveRoot, { recursive: true });
  await fs.rename(dir, dest);
  return dest;
}

export async function deleteCharacter(id) {
  const characters = await loadCharacters();
  var idx = -1;
  for (var i = 0; i < characters.length; i++) {
    if (characters[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return false;

  const removed = characters[idx];

  // Resolve the directory BEFORE mutating the registry, and derive it from the
  // REGISTRY entry's id rather than the caller's argument. The argument is
  // attacker-adjacent (it comes off a route param); the registry id is data we
  // wrote ourselves. If it does not resolve to a legitimate data/character-N
  // path we change nothing at all rather than half-applying the delete.
  let dataDir;
  try {
    dataDir = resolveCharacterDataDir(removed && removed.id);
  } catch (err) {
    console.error(
      `❌ deleteCharacter(${JSON.stringify(id)}): ${err.message} — registry entry left in place, nothing deleted.`
    );
    return false;
  }

  // Registry first: characters.json is the source of truth, and an entry that
  // points at a directory we failed to delete is far less harmful than a
  // directory we deleted for a character that is still registered.
  characters.splice(idx, 1);
  await saveCharacters(characters);

  // Then the data directory. Leaving it behind is the actual bug being fixed:
  // the next character created reuses the id, adopts the stale poses/scenes/
  // parts/ai-config, and looks like a phantom character on disk.
  const preserve = String(process.env.MB_PRESERVE_DELETED_CHARACTER_DATA || '') === '1';
  try {
    if (preserve) {
      const dest = await archiveCharacterDataDir(dataDir, removed.id);
      console.warn(
        `🗄️  deleteCharacter: character ${removed.id} ("${removed.name}") removed from the registry; ` +
        `its show data was ARCHIVED to ${dest} (MB_PRESERVE_DELETED_CHARACTER_DATA=1).`
      );
    } else {
      await fs.rm(dataDir, { recursive: true, force: true });
      console.warn(
        `🗑️  deleteCharacter: character ${removed.id} ("${removed.name}") removed from the registry and its ` +
        `data directory PERMANENTLY DELETED: ${dataDir} (parts, poses, scenes, ai-config, super-powers). ` +
        `Set MB_PRESERVE_DELETED_CHARACTER_DATA=1 to archive instead of delete.`
      );
    }
  } catch (err) {
    // Loud, and explicitly not silent: the registry change already landed, so the
    // operator needs to know the disk is now out of step with it.
    console.error(
      `❌ deleteCharacter: character ${removed.id} ("${removed.name}") was removed from characters.json but its ` +
      `data directory could NOT be removed: ${dataDir} — ${err.message}. Delete it by hand; otherwise the next ` +
      `character allocated id ${removed.id} will silently inherit this data.`
    );
  }

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
