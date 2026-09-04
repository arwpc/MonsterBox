/**
 * Gzip for the app's own static text assets (CSS, JS, SVG, JSON, source maps),
 * using Node's built-in zlib — no new dependency, and nothing written to the SD
 * card. Sits in front of express.static and falls through to it for anything it
 * does not handle (misses, binaries, errors), so express.static stays the
 * authority on everything else.
 *
 * Why: the dashboard's critical path is ~500 KB of stylesheets and ~250 KB of
 * scripts, and on the Pi's Wi-Fi that is 300–400 ms of pure transfer before the
 * first script can run. Gzip takes about three quarters of it off the wire.
 * Each file is compressed once per (path, mtime, size) and kept in memory
 * (~1.5 MB for everything under public/ at present), so the CPU cost is paid on
 * first request after a deploy, never per page.
 *
 * Conditional requests keep working: a weak ETag derived from size+mtime plus
 * Last-Modified, so a browser revalidating after max-age gets a 304.
 */
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';

const TEXT_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.svg', '.json', '.map', '.txt', '.html']);
const MIN_BYTES = 1024;
const DEFAULT_CACHE_LIMIT = 16 * 1024 * 1024;

function gzipAsync(buffer) {
  // Level 6: this runs once per file, so spend the CPU for the smaller body.
  return new Promise((resolve, reject) => zlib.gzip(buffer, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))));
}

/**
 * @param {string} rootDir absolute directory the URL path is resolved under
 * @param {{ maxAgeSeconds?: number, cacheLimitBytes?: number }} [opts]
 */
export function staticCompression(rootDir, { maxAgeSeconds = 0, cacheLimitBytes = DEFAULT_CACHE_LIMIT } = {}) {
  const root = path.resolve(rootDir);
  const cache = new Map(); // relative path -> { mtimeMs, size, gz, etag, lastModified }
  let cacheBytes = 0;

  async function entryFor(rel, stat) {
    const hit = cache.get(rel);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
    const raw = await fs.readFile(path.join(root, rel));
    const gz = await gzipAsync(raw);
    const entry = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      gz,
      etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-gz"`,
      lastModified: new Date(stat.mtimeMs).toUTCString()
    };
    if (hit) cacheBytes -= hit.gz.length;
    if (cacheBytes + gz.length > cacheLimitBytes) { cache.clear(); cacheBytes = 0; }
    cache.set(rel, entry);
    cacheBytes += gz.length;
    return entry;
  }

  return async function staticCompressionMiddleware(req, res, next) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
      const pathname = decodeURIComponent(req.path);
      const ext = path.extname(pathname).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) return next();

      const rel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const abs = path.resolve(root, '.' + path.sep + rel);
      if (abs !== root && !abs.startsWith(root + path.sep)) return next();

      const stat = await fs.stat(abs).catch(() => null);
      if (!stat || !stat.isFile() || stat.size < MIN_BYTES) return next();

      const entry = await entryFor(path.relative(root, abs), stat);

      res.setHeader('ETag', entry.etag);
      res.setHeader('Last-Modified', entry.lastModified);
      res.setHeader('Cache-Control', maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : 'public, max-age=0');
      res.setHeader('Vary', 'Accept-Encoding');
      if (req.fresh) { res.status(304).end(); return; }

      res.type(ext);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', entry.gz.length);
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(entry.gz);
    } catch (err) {
      // Whatever went wrong, express.static behind us can still serve the file plain.
      next();
    }
  };
}

export default staticCompression;
