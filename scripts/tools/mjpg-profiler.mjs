#!/usr/bin/env node
/**
 * mjpg-profiler.mjs
 * Lightweight MJPEG stream FPS/latency sampler for mjpg-streamer (or any MJPEG HTTP source)
 *
 * Usage:
 *   node scripts/tools/mjpg-profiler.mjs --url http://localhost:8090/?action=stream --seconds 5
 *   MJPG_URL=http://localhost:8090/?action=stream DURATION=8 node scripts/tools/mjpg-profiler.mjs
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

function parseArgs() {
  const out = { url: process.env.MJPG_URL || 'http://localhost:8090/?action=stream', seconds: Number(process.env.DURATION || 5) };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--url' && process.argv[i + 1]) { out.url = process.argv[++i]; continue; }
    if ((a === '--seconds' || a === '--duration') && process.argv[i + 1]) { out.seconds = Number(process.argv[++i]); continue; }
  }
  if (!Number.isFinite(out.seconds) || out.seconds <= 0) out.seconds = 5;
  return out;
}

function nowMs() { return Date.now(); }

function profiler({ url, seconds }) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const client = u.protocol === 'https:' ? https : http;

    const resStats = {
      startedAt: nowMs(),
      boundary: null,
      bytes: 0,
      frames: 0,
      frameSizes: [],
      firstByteAt: null,
      lastByteAt: null,
      firstFrameAt: null,
      lastFrameAt: null,
      frameDurationsMs: [],
    };

    let buffer = Buffer.alloc(0);
    let currentFrameStartTime = null;

    const req = client.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { 'User-Agent': 'MonsterBox-mjpg-profiler/1.0' },
      timeout: 4000,
    }, (res) => {
      resStats.firstByteAt = nowMs();
      const ct = res.headers['content-type'] || '';
      // Try to detect boundary from header if provided
      const bMatch = /boundary=([^;\s]+)/i.exec(ct);
      if (bMatch) {
        resStats.boundary = bMatch[1];
      }

      res.on('data', (chunk) => {
        resStats.bytes += chunk.length;
        resStats.lastByteAt = nowMs();
        if (currentFrameStartTime == null) currentFrameStartTime = resStats.lastByteAt;

        // Append chunk to buffer
        buffer = Buffer.concat([buffer, chunk]);

        // Scan for JPEG SOI/EOI markers to count frames
        // SOI: 0xFF 0xD8, EOI: 0xFF 0xD9
        let soi = buffer.indexOf('\xff\xd8', 0, 'binary');
        while (soi !== -1) {
          const eoi = buffer.indexOf('\xff\xd9', soi + 2, 'binary');
          if (eoi === -1) {
            // Need more data for a complete frame
            break;
          }
          const frameBuf = buffer.slice(soi, eoi + 2);
          // Remove consumed portion from buffer
          buffer = buffer.slice(eoi + 2);

          // Record frame
          resStats.frames += 1;
          resStats.frameSizes.push(frameBuf.length);
          const ts = nowMs();
          if (!resStats.firstFrameAt) resStats.firstFrameAt = ts;
          if (currentFrameStartTime != null) {
            resStats.frameDurationsMs.push(ts - currentFrameStartTime);
          }
          resStats.lastFrameAt = ts;
          currentFrameStartTime = ts; // next frame starts now

          // Look for another SOI in the remaining buffer
          soi = buffer.indexOf('\xff\xd8', 0, 'binary');
        }
      });

      res.on('end', () => {
        finalize();
      });

      res.on('error', () => finalize());
    });

    req.on('timeout', () => {
      try { req.destroy(new Error('request timeout')); } catch {}
    });

    req.on('error', () => finalize());

    req.end();

    const stopTimer = setTimeout(() => finalize(), Math.max(1000, seconds * 1000));

    function finalize() {
      clearTimeout(stopTimer);
      const endedAt = nowMs();
      const elapsedMs = Math.max(1, endedAt - resStats.startedAt);
      const streamMs = resStats.lastByteAt ? (resStats.lastByteAt - (resStats.firstByteAt || resStats.startedAt)) : 0;
      const obsMs = resStats.lastFrameAt && resStats.firstFrameAt ? (resStats.lastFrameAt - resStats.firstFrameAt) : 0;
      const fps = resStats.frames > 1 ? (resStats.frames - 1) / (obsMs / 1000 || 1) : resStats.frames / (elapsedMs / 1000);
      const avgFrameSize = resStats.frameSizes.length ? Math.round(resStats.frameSizes.reduce((a,b)=>a+b,0) / resStats.frameSizes.length) : 0;
      const avgInterFrameMs = resStats.frameDurationsMs.length ? Math.round(resStats.frameDurationsMs.reduce((a,b)=>a+b,0) / resStats.frameDurationsMs.length) : 0;

      const summary = {
        url,
        secondsObserved: Math.round(elapsedMs / 1000),
        bytesReceived: resStats.bytes,
        frames: resStats.frames,
        estimatedFPS: Number.isFinite(fps) ? Number(fps.toFixed(2)) : 0,
        avgFrameBytes: avgFrameSize,
        avgInterFrameMs,
        boundaryFromHeader: resStats.boundary || null,
        firstByteDelayMs: resStats.firstByteAt ? (resStats.firstByteAt - resStats.startedAt) : null,
        streamActiveMs: streamMs,
      };

      console.log(JSON.stringify(summary, null, 2));
      resolve(summary);
    }
  });
}

async function main() {
  const args = parseArgs();
  console.error(`[mjpg-profiler] Sampling ${args.url} for ${args.seconds}s...`);
  try {
    await profiler(args);
  } catch (e) {
    console.error('[mjpg-profiler] Error:', e && e.message || e);
    process.exitCode = 1;
  }
}

main();

