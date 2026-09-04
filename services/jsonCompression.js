/**
 * Gzip for JSON responses, using Node's built-in zlib — no new dependency.
 *
 * Why only res.json(): the streaming endpoints (MJPEG relay, audio proxies,
 * console tail) write their own bodies and must never be re-encoded; JSON is
 * where the weight is. The audio library payload is 233 KB on the wire and
 * 27 KB gzipped (3.6 ms at level 1 on a Pi 4B, measured) — the dashboard
 * fetches it on every load, over Wi-Fi, into the browser's six-connection pool.
 * Bodies under the threshold are left alone: the gzip header costs more than
 * it saves there.
 *
 * Level 1 on purpose: level 6 buys another 15% for twice the CPU, and this box
 * also runs servos.
 *
 * Node-to-node calls (orchestrationService's https.request) send no
 * Accept-Encoding and keep receiving plain JSON; browsers, undici fetch and
 * supertest all advertise gzip and decode transparently.
 */
import zlib from 'zlib';

const DEFAULT_THRESHOLD = 1024;

export function jsonCompression({ threshold = DEFAULT_THRESHOLD, level = 1 } = {}) {
  return function jsonCompressionMiddleware(req, res, next) {
    const originalJson = res.json;

    res.json = function compressedJson(body) {
      // Express's legacy res.json(status, body) signature — hand it through untouched.
      if (arguments.length === 2) return originalJson.apply(res, arguments);

      const accept = String(req.headers['accept-encoding'] || '');
      if (req.method === 'HEAD' || !/\bgzip\b/.test(accept) || res.getHeader('Content-Encoding')) {
        return originalJson.call(res, body);
      }

      const app = req.app;
      // Any non-default JSON formatting setting means Express's own serializer
      // must produce the bytes; we only shortcut the plain case.
      if (app.get('json escape') || app.get('json replacer') || app.get('json spaces')) {
        return originalJson.call(res, body);
      }

      let text;
      try { text = JSON.stringify(body); } catch (_) { return originalJson.call(res, body); }
      if (typeof text !== 'string' || Buffer.byteLength(text) < threshold) {
        return originalJson.call(res, body);
      }

      zlib.gzip(text, { level }, (err, gz) => {
        if (res.headersSent) return;
        if (err) { originalJson.call(res, body); return; }
        // Type before send(): res.send(Buffer) would otherwise default to octet-stream.
        if (!res.getHeader('Content-Type')) res.type('application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.vary('Accept-Encoding');
        // res.send(Buffer) sets Content-Length and the ETag over the compressed
        // bytes — deterministic for the same input, so 304s keep working.
        res.send(gz);
      });
      return res;
    };

    next();
  };
}

export default jsonCompression;
