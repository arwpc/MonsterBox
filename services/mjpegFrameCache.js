/**
 * Newest-frame cache for peer MJPEG streams.
 *
 * Why this exists: the Fleet Command Center drew six live MJPEG <img> streams at
 * once. An MJPEG response never ends, so each card permanently occupied one of the
 * browser's SIX per-host HTTP/1.1 connections — the whole pool. Every fetch the
 * page made afterwards (fleet-health, nodes, system/info) sat in the connection
 * queue behind them. Measured on one node, same page, only difference being whether
 * the streams ran:
 *
 *     cameras ON : fleet-health 9146ms max / 6355ms avg, pill read "1 / 6 online"
 *     cameras OFF: fleet-health 3621ms max / 1875ms avg, pill read "6 / 6 online"
 *
 * The server was never the problem — under the same six streams it answered
 * fleet-health in 0.3s to curl. The nodes were "offline" only in the browser's
 * queue. That is why the wall now pulls SNAPSHOTS (short requests that release
 * their connection) instead of holding six endless ones.
 *
 * Snapshots must not cost a TLS handshake each, so this cache keeps exactly one
 * upstream stream per node — the same single connection the old relay held — and
 * answers every snapshot request from the newest frame already in memory. Upstream
 * connections idle out when nobody has asked for a while, so a closed tab stops
 * pulling video from the yard.
 */

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const MAX_PARSE_BUFFER = 4 * 1024 * 1024;
const TAIL_KEEP = 65536;

class MjpegFrameCache {
    constructor() {
        /** key -> { latest, latestAt, upstream, idleTimer, waiters, opening, error } */
        this.entries = new Map();
    }

    _entry(key) {
        let e = this.entries.get(key);
        if (!e) {
            e = { latest: null, latestAt: 0, upstream: null, idleTimer: null, waiters: [], opening: null, error: null };
            this.entries.set(key, e);
        }
        return e;
    }

    _armIdle(key, idleMs) {
        const e = this.entries.get(key);
        if (!e) return;
        if (e.idleTimer) clearTimeout(e.idleTimer);
        e.idleTimer = setTimeout(() => this.close(key), idleMs);
        // A pending idle timer must never hold the process open.
        if (typeof e.idleTimer.unref === 'function') e.idleTimer.unref();
    }

    /** Attach the frame parser to a fresh upstream body. */
    _consume(key, upstream) {
        const e = this._entry(key);
        e.upstream = upstream;
        let buf = Buffer.alloc(0);

        upstream.on('data', (chunk) => {
            buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
            let newest = null;
            for (;;) {
                const soi = buf.indexOf(SOI);
                if (soi === -1) { buf = Buffer.alloc(0); break; }
                const eoi = buf.indexOf(EOI, soi + 2);
                if (eoi === -1) {
                    if (soi > 0) buf = buf.subarray(soi);
                    break;
                }
                newest = buf.subarray(soi, eoi + 2);
                buf = buf.subarray(eoi + 2);
            }
            if (buf.length > MAX_PARSE_BUFFER) buf = buf.subarray(buf.length - TAIL_KEEP);
            if (newest) {
                // Copy: subarray shares the chunk's memory, which would pin whole
                // network buffers alive for as long as the frame is cached.
                e.latest = Buffer.from(newest);
                e.latestAt = Date.now();
                const waiters = e.waiters;
                e.waiters = [];
                waiters.forEach(w => w.resolve(e.latest));
            }
        });

        const fail = (err) => {
            const waiters = e.waiters;
            e.waiters = [];
            e.upstream = null;
            waiters.forEach(w => w.reject(err || new Error('Upstream stream ended')));
        };
        upstream.once('end', () => fail(new Error('Upstream stream ended')));
        upstream.once('error', (err) => fail(err));
    }

    /**
     * Newest JPEG frame for `key`, opening the upstream stream on first use.
     *
     * @param {string} key                       cache identity (node id)
     * @param {() => Promise<import('stream').Readable>} openUpstream
     * @param {{ idleMs?: number, waitMs?: number, maxAgeMs?: number }} [opts]
     * @returns {Promise<Buffer>} a complete JPEG
     */
    async getFrame(key, openUpstream, opts = {}) {
        const { idleMs = 30000, waitMs = 8000, maxAgeMs = 10000 } = opts;
        const e = this._entry(key);
        this._armIdle(key, idleMs);

        // Fresh enough to serve straight from memory — the common case.
        if (e.latest && (Date.now() - e.latestAt) <= maxAgeMs) return e.latest;

        if (!e.upstream && !e.opening) {
            e.opening = (async () => {
                const stream = await openUpstream();
                this._consume(key, stream);
            })()
                .catch((err) => { e.error = err; throw err; })
                .finally(() => { e.opening = null; });
        }
        if (e.opening) {
            try { await e.opening; }
            catch (err) {
                // A stale frame beats an error page while a camera is flapping.
                if (e.latest) return e.latest;
                throw err;
            }
        }

        if (e.latest && (Date.now() - e.latestAt) <= maxAgeMs) return e.latest;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                e.waiters = e.waiters.filter(w => w.timer !== timer);
                if (e.latest) return resolve(e.latest);
                reject(new Error(`No frame from ${key} within ${waitMs}ms`));
            }, waitMs);
            if (typeof timer.unref === 'function') timer.unref();
            const waiter = {
                timer,
                resolve: (f) => { clearTimeout(timer); resolve(f); },
                reject: (err) => {
                    clearTimeout(timer);
                    if (e.latest) return resolve(e.latest);
                    reject(err);
                },
            };
            e.waiters.push(waiter);
        });
    }

    /** Drop the upstream connection and cached frame for one key. */
    close(key) {
        const e = this.entries.get(key);
        if (!e) return;
        if (e.idleTimer) clearTimeout(e.idleTimer);
        if (e.upstream) { try { e.upstream.destroy(); } catch (_) { /* already gone */ } }
        const waiters = e.waiters;
        e.waiters = [];
        waiters.forEach(w => w.reject(new Error('Frame cache closed')));
        this.entries.delete(key);
    }

    closeAll() {
        [...this.entries.keys()].forEach(k => this.close(k));
    }

    stats() {
        return [...this.entries.entries()].map(([key, e]) => ({
            key,
            hasFrame: !!e.latest,
            frameBytes: e.latest ? e.latest.length : 0,
            ageMs: e.latestAt ? Date.now() - e.latestAt : null,
            upstreamOpen: !!e.upstream,
        }));
    }
}

const mjpegFrameCache = new MjpegFrameCache();
export default mjpegFrameCache;
export { MjpegFrameCache };
