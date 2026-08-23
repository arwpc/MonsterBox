/**
 * Latest-frame MJPEG relay — the cure for "the video is always N seconds behind".
 *
 * A naive proxy (`upstream.pipe(res)`) is FIFO: any stall anywhere in the chain
 * (busy CPU, slow client, TCP hiccup) queues frames in kernel buffers, and since
 * MJPEG produces and plays at the same rate, that backlog NEVER drains — the
 * stream stays exactly as far behind as its worst moment, forever. Measured at
 * the bench: a persistent ~5-second lag across every animatronic, surviving
 * into full idle.
 *
 * This relay instead:
 *  - reads the upstream at full speed, ALWAYS (no backpressure to the source,
 *    so nothing accumulates behind us),
 *  - extracts complete JPEG frames (SOI/EOI scan — upstream boundary names and
 *    part headers are irrelevant and discarded),
 *  - keeps only the NEWEST frame,
 *  - writes to the viewer only when their socket has drained, re-authoring the
 *    multipart framing itself.
 *
 * A fast viewer sees every frame; a slow viewer sees fewer, fresher frames.
 * Latency is bounded at roughly one frame in flight regardless of load.
 * Operator ruling (2026-08-23): real-time beats complete — drop, never queue.
 */

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const MAX_PARSE_BUFFER = 4 * 1024 * 1024; // corrupt/never-terminated frame guard
const TAIL_KEEP = 65536;

/**
 * Relay an MJPEG upstream to an HTTP response, dropping stale frames.
 *
 * @param {import('stream').Readable} upstream  the source MJPEG body stream
 * @param {import('http').ServerResponse} res   the viewer's response
 * @param {{ boundary?: string, onClose?: () => void }} [opts]
 * @returns {{ stop: () => void }} stop() detaches and ends the response once.
 */
export function relayMjpegLatest(upstream, res, opts = {}) {
    const boundary = opts.boundary || 'mbframe';
    const onClose = typeof opts.onClose === 'function' ? opts.onClose : () => { };

    if (!res.headersSent) {
        res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${boundary}`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Connection', 'close');
    }

    let buf = Buffer.alloc(0);
    let latest = null;       // newest complete JPEG not yet delivered
    let writeReady = true;   // viewer socket drained?
    let closed = false;

    let stopFlushing = false;
    const stop = () => {
        if (closed) return;
        // An ended upstream should leave the viewer on the freshest picture,
        // not one frame shy — deliver the pending newest if the socket can
        // take it right now (live streams never end; this is teardown polish).
        if (!stopFlushing && latest && writeReady) {
            stopFlushing = true;
            try { sendLatest(); } catch (_) { /* viewer already gone */ }
        }
        closed = true;
        upstream.removeListener('data', onData);
        try { res.end(); } catch (_) { /* viewer already gone */ }
        onClose();
    };

    const sendLatest = () => {
        if (closed || !writeReady || !latest) return;
        const frame = latest;
        latest = null;
        const head = Buffer.from(
            `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
        );
        try {
            writeReady = res.write(Buffer.concat([head, frame, Buffer.from('\r\n')]));
        } catch (_) {
            return stop();
        }
        if (!writeReady) {
            res.once('drain', () => {
                writeReady = true;
                sendLatest(); // deliver whatever is newest NOW, not what was queued
            });
        }
    };

    const onData = (chunk) => {
        if (closed) return;
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;

        // Keep only the newest complete JPEG; older completes are stale by definition.
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
            latest = newest;
            sendLatest();
        }
    };

    upstream.on('data', onData);
    upstream.once('end', stop);
    upstream.once('error', stop);
    res.once('close', stop);
    res.once('error', stop);

    return { stop };
}

export default { relayMjpegLatest };
