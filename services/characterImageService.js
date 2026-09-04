import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
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
  // A same-name re-upload must not keep showing the old face in the chrome.
  await dropThumbnails(characterId, safe);
  return { filename: safe, url: `/data/character-${characterId}/images/${safe}` };
}

export async function deleteImage(characterId, filename) {
  const safe = safeBasename(filename);
  const filePath = path.join(imagesDirFor(characterId), safe);
  try { await fs.unlink(filePath); } catch (_) { /* ignore */ }
  await dropThumbnails(characterId, safe);
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


/* ---------------------------------------------------------------------------
 * Avatar thumbnails
 *
 * The layout paints the active portrait at 28–48px on every page, and portraits
 * are whatever was uploaded (one live node's: 800x800, 316 KB, a 2.5 MB bitmap to
 * decode). A 96px thumbnail is ~2.5 KB. Thumbnails live beside the originals in
 * images/.thumbs/ (listImages ignores the directory: no image extension), are
 * generated once per (image, size) by python_wrappers/image_thumb.py — Pillow,
 * present on every node — and regenerated when the source is newer. Any failure
 * yields null and the caller serves the original: never a broken avatar, only a
 * heavier one.
 * ------------------------------------------------------------------------- */
export const THUMBNAIL_SIZES = new Set([64, 96, 128, 256]);
const THUMB_DIR = '.thumbs';
const THUMB_SCRIPT = path.resolve(APP_ROOT, 'python_wrappers', 'image_thumb.py');
const thumbInflight = new Map();

function thumbBase(characterId, safe, size) {
  return path.join(imagesDirFor(characterId), THUMB_DIR, `${size}-${safe}`);
}

async function dropThumbnails(characterId, safe) {
  const dir = path.join(imagesDirFor(characterId), THUMB_DIR);
  const files = await fs.readdir(dir).catch(() => []);
  await Promise.all(files
    .filter(f => /^\d+-/.test(f) && f.slice(f.indexOf('-') + 1).replace(/\.(jpg|png)$/, '') === safe)
    .map(f => fs.unlink(path.join(dir, f)).catch(() => {})));
}

async function freshThumbnail(base, sourceMtimeMs) {
  for (const ext of ['.jpg', '.png']) {
    const candidate = base + ext;
    const st = await fs.stat(candidate).catch(() => null);
    if (st && st.isFile() && st.mtimeMs >= sourceMtimeMs) return candidate;
  }
  return null;
}

/**
 * Path of a thumbnail no wider/taller than `size` for an existing image, or null
 * when one cannot be produced. Concurrent requests for the same thumbnail (six
 * cards loading at once) share a single generation.
 */
export async function thumbnailPath(characterId, filename, size) {
  const edge = Number(size);
  if (!THUMBNAIL_SIZES.has(edge)) return null;
  let safe;
  try { safe = safeBasename(filename); } catch (_) { return null; }
  const source = path.join(imagesDirFor(characterId), safe);
  const sourceStat = await fs.stat(source).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) return null;

  const base = thumbBase(characterId, safe, edge);
  const cached = await freshThumbnail(base, sourceStat.mtimeMs);
  if (cached) return cached;

  const key = base;
  if (thumbInflight.has(key)) return thumbInflight.get(key);
  const job = (async () => {
    try {
      await fs.mkdir(path.dirname(base), { recursive: true });
      const produced = await new Promise((resolve) => {
        execFile('python3', [THUMB_SCRIPT, source, base, String(edge)], { timeout: 15000 }, (err, stdout, stderr) => {
          if (err) {
            console.warn(`[characterImages] thumbnail failed for character ${characterId}/${safe}: ${String(stderr || err.message).trim()}`);
            return resolve(null);
          }
          resolve(String(stdout || '').trim() || null);
        });
      });
      if (!produced) return null;
      const st = await fs.stat(produced).catch(() => null);
      return st && st.isFile() ? produced : null;
    } finally {
      thumbInflight.delete(key);
    }
  })();
  thumbInflight.set(key, job);
  return job;
}

/** URL of the avatar-sized rendition of a character image (falls back to the original server-side). */
/**
 * The avatar a node draws for a portrait it does not have.
 *
 * Portraits are node-local: data/characters.json (shared) can name an
 * activeImage that only the character's own node holds, so a request for its
 * ?w= rendition here has nothing to scale. Answering 404 made every page that
 * lists the fleet (the character menu, first-run, the characters list) log a
 * failed request for a state that is normal; answering with the webcam's
 * "no stream" picture drew a broken camera as somebody's face. This is the
 * same initials-on-gradient the CSS fallback draws, as a real image, so the
 * URL contract stays "an avatar for this character" whether or not the file is
 * on this node. Same initials rule as views/components/character-avatar.ejs.
 */
export function avatarInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function initialsAvatarSvg(name, size = 96) {
  const px = THUMBNAIL_SIZES.has(Number(size)) ? Number(size) : 96;
  const text = avatarInitials(name).replace(/[<>&"]/g, '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + px + ' ' + px + '">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#6f42c1"/><stop offset="1" stop-color="#5a359a"/></linearGradient></defs>' +
    '<rect width="' + px + '" height="' + px + '" fill="url(#g)"/>' +
    '<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" ' +
    'font-weight="700" font-size="' + Math.floor(px * 0.4) + '" fill="#fff">' + text + '</text></svg>';
}

/** Name of a registered character, or null — for the initials avatar above. */
export async function characterDisplayName(characterId) {
  const character = await findRegisteredCharacter(characterId);
  return character ? (character.name || null) : null;
}

export function avatarUrl(characterId, filename, size = 96) {
  if (!filename) return null;
  return `/api/characters/${characterId}/images/${encodeURIComponent(filename)}?w=${size}`;
}
