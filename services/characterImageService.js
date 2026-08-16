import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCharacterById, updateCharacter } from './characterService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.resolve(APP_ROOT, 'data');

/**
 * Resolve the images directory for a character id, refusing anything that is not
 * literally data/character-<digits>/images. The id reaches here straight off a
 * route param; without this an id like "../../.." would resolve outside data/
 * and the image-streaming route would happily sendFile from it.
 */
function imagesDirFor(characterId) {
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid character id: ${JSON.stringify(characterId)}`);
  }
  const charDir = path.resolve(DATA_ROOT, `character-${id}`);
  if (path.dirname(charDir) !== DATA_ROOT) {
    throw new Error(`Refusing to resolve a path outside data/: ${charDir}`);
  }
  return path.join(charDir, 'images');
}

/**
 * A character exists only if data/characters.json says so.
 *
 * Nothing on disk may be created for an id that is not registered. The image
 * routes validate only that :id parses as an integer, so an unauthenticated
 * GET /api/characters/<any-integer>/images used to scaffold a whole character
 * directory — that is how a phantom data/character-999999/ (the sentinel id from
 * the movement tests) appeared on this node, invisible to git because it held
 * only empty directories.
 */
async function findRegisteredCharacter(characterId) {
  const id = Number(characterId);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    return await getCharacterById(id);
  } catch (_) {
    return null;
  }
}

/**
 * Write paths must refuse unregistered characters outright rather than quietly
 * creating a home for them.
 */
async function requireRegisteredCharacter(characterId) {
  const character = await findRegisteredCharacter(characterId);
  if (!character) {
    const err = new Error(`Character ${characterId} is not registered`);
    err.code = 'CHARACTER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return character;
}

/**
 * Reject any filename that is not a bare, single-segment basename. Express
 * decodes route params, so a percent-encoded "..%2f.." arrives as "../..";
 * without this guard path.join would collapse it to a location outside the
 * images dir, letting fs.unlink/stat/sendFile touch arbitrary files.
 */
function safeBasename(filename) {
  const name = String(filename == null ? '' : filename);
  const base = path.basename(name);
  if (!base || base === '.' || base === '..' || base !== name || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid filename');
  }
  return base;
}

/**
 * Return the images directory for a character, creating it ONLY for characters
 * that are actually registered.
 *
 * For an unregistered id the path is still returned but nothing is created, so
 * the read paths degrade naturally to "not found" — listImages yields an empty
 * list and the streaming route falls through to its placeholder, preserving its
 * no-404 contract. Behaviour for real characters is unchanged.
 */
export async function ensureImagesDir(characterId) {
  const dir = imagesDirFor(characterId);
  const character = await findRegisteredCharacter(characterId);
  if (!character) return dir;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listImages(characterId) {
  const charObj = await getCharacterById(characterId);
  const dir = await ensureImagesDir(characterId);
  const files = await fs.readdir(dir).catch(() => []);
  const items = [];
  for (const f of files) {
    // basic image extension filter
    if (!/\.(png|jpe?g|gif|webp)$/i.test(f)) continue;
    items.push({ filename: f, url: `/data/character-${characterId}/images/${f}` });
  }
  return { images: items, active: (charObj && charObj.activeImage) || null };
}

export async function saveImage(characterId, originalName, buffer) {
  await requireRegisteredCharacter(characterId);
  await ensureImagesDir(characterId);
  const safe = String(originalName || 'image').replace(/[^a-z0-9_\-\.]+/gi, '_');
  const filePath = path.join(imagesDirFor(characterId), safe);
  await fs.writeFile(filePath, buffer);
  return { filename: safe, url: `/data/character-${characterId}/images/${safe}` };
}

export async function deleteImage(characterId, filename) {
  const safe = safeBasename(filename);
  const filePath = path.join(imagesDirFor(characterId), safe);
  try { await fs.unlink(filePath); } catch (_) { /* ignore */ }
  // If it was active, clear it
  const charObj = await getCharacterById(characterId);
  if (charObj && charObj.activeImage === safe) {
    await updateCharacter(characterId, { activeImage: null });
  }
  return true;
}

export async function setActiveImage(characterId, filename) {
  await requireRegisteredCharacter(characterId);
  // Validate file exists
  const safe = safeBasename(filename);
  const filePath = path.join(imagesDirFor(characterId), safe);
  try { await fs.stat(filePath); } catch (e) { throw new Error('Image not found'); }
  await updateCharacter(characterId, { activeImage: safe });
  return { filename: safe, url: `/data/character-${characterId}/images/${safe}` };
}

