/**
 * Shared helpers for safe JSON persistence on the RPi's SD card.
 *
 * The codebase already used the temp-file+rename idiom in actuatorPositionStore.js
 * "to prevent corruption on SD card power loss", but only there. Every other
 * critical data file (scenes, poses, super-powers, app-config, ...) was written
 * with a plain fs.writeFile, so a power loss mid-write (routine when an
 * animatronic is unplugged) could leave truncated JSON that fails to parse on the
 * next boot. These helpers make that idiom reusable.
 */

import fs from 'fs/promises';
import path from 'path';

let _tmpCounter = 0;

/**
 * Atomically write a value as pretty-printed JSON. Writes to a unique sibling
 * temp file, then renames it over the target — rename(2) is atomic within a
 * filesystem, so a concurrent reader (or a crash) never observes a partial file.
 * @param {string} filePath - destination path
 * @param {*} value - JSON-serializable value
 * @param {{ spaces?: number }} [opts] - indentation (default 2)
 */
export async function writeJsonAtomic(filePath, value, { spaces = 2 } = {}) {
  const dir = path.dirname(filePath);
  // Unique temp name so concurrent writers don't collide on one .tmp file.
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${_tmpCounter++}.tmp`);
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, spaces), 'utf8');
    await fs.rename(tmp, filePath);
  } catch (err) {
    try { await fs.unlink(tmp); } catch (_) { /* best-effort cleanup */ }
    throw err;
  }
}

const _locks = new Map();

/**
 * Serialize async critical sections that share a key (typically a file path or a
 * `${filePath}:${characterId}` string). Callers do the full read-modify-write
 * inside `fn`; concurrent calls for the same key run one at a time, so two
 * requests can't each read the same state and clobber the other's update.
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export function withFileLock(key, fn) {
  const prev = _locks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  // Keep the chain alive even if fn rejects; don't retain rejections.
  _locks.set(key, run.then(() => {}, () => {}));
  return run;
}

/**
 * Serialized read-modify-write of a JSON file. Under a per-file lock, reads and
 * parses the file (falling back to `defaultValue` if missing/corrupt), hands the
 * parsed object to `mutate`, and — unless `mutate` returns `SKIP_WRITE` —
 * atomically writes the (possibly new) object back. Two concurrent callers for
 * the same path run one at a time, so neither can clobber the other's update.
 *
 * `mutate(obj)` may mutate `obj` in place and return it, return a fresh object to
 * write, or return `SKIP_WRITE` to leave the file untouched (e.g. a validation
 * early-out). The value ultimately returned to the caller is whatever the write
 * used, or — for SKIP_WRITE — the object as read.
 *
 * @param {string} filePath
 * @param {(obj: any) => (any | Promise<any>)} mutate
 * @param {{ defaultValue?: any, spaces?: number }} [opts]
 * @returns {Promise<any>} the object as persisted (or read, when skipped)
 */
export function updateJsonUnderLock(filePath, mutate, { defaultValue = {}, spaces = 2 } = {}) {
  return withFileLock(filePath, async () => {
    let current = defaultValue;
    try {
      current = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (_) {
      current = defaultValue;
    }
    const next = await mutate(current);
    if (next === SKIP_WRITE) return current;
    await writeJsonAtomic(filePath, next, { spaces });
    return next;
  });
}

/** Sentinel a `mutate` callback returns to skip the write entirely. */
export const SKIP_WRITE = Symbol('SKIP_WRITE');

export default { writeJsonAtomic, withFileLock, updateJsonUnderLock, SKIP_WRITE };
