import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCharacterById, updateCharacter } from './characterService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function imagesDirFor(characterId) {
  const appRoot = path.resolve(__dirname, '..');
  return path.resolve(appRoot, 'data', `character-${characterId}`, 'images');
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

export async function ensureImagesDir(characterId) {
  const dir = imagesDirFor(characterId);
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
  // Validate file exists
  const safe = safeBasename(filename);
  const filePath = path.join(imagesDirFor(characterId), safe);
  try { await fs.stat(filePath); } catch (e) { throw new Error('Image not found'); }
  await updateCharacter(characterId, { activeImage: safe });
  return { filename: safe, url: `/data/character-${characterId}/images/${safe}` };
}

