import { spawn, execFileSync } from 'child_process';
import fsSync from 'fs';
import fs from 'fs/promises';
import nodeFetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

import { readConfig } from '../services/configService.js';
import hardwareService from '../services/hardwareService/index.js';
import { writeJsonAtomic, withFileLock } from '../services/atomicStore.js';

// mjpg-streamer service configuration
// Use 127.0.0.1 instead of localhost to avoid DNS resolution issues
const MJPG_STREAMER_URL = 'http://127.0.0.1:8090';
const MJPG_STREAM_ENDPOINT = `${MJPG_STREAMER_URL}/?action=stream`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getPartsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const charId = cfg && cfg.selectedCharacter;
  if (charId) {
    const charPath = path.resolve(appRoot, `data/character-${charId}`, 'parts.json');
    try {
      await fs.access(charPath);
      return charPath;
    } catch (_) { /* fall through */ }
  }
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'parts.json');
}

async function loadParts() {
  try {
    const filePath = await getPartsFilePath();
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (_) {
    return [];
  }
}
// Device discovery helpers (module scope)
async function listVideoDevices() {
  try {
    const devs = await fs.readdir('/dev');
    const vids = devs.filter(function (n) { return /^video\d+$/.test(n); }).map(function (n) { return '/dev/' + n; });
    vids.sort();
    return vids;
  } catch (e) {
    return [];
  }
}

async function getVideoDeviceName(devPath) {
  try {
    var base = path.basename(devPath);
    var sysPath = path.join('/sys/class/video4linux', base, 'name');
    const data = await fs.readFile(sysPath, 'utf8');
    return data.trim();
  } catch (e) {
    return null;
  }
}

function scanVideoUsage() {
  try {
    const procDir = '/proc';
    const pids = require('fs').readdirSync(procDir).filter(function (d) { return /^\d+$/.test(d); });
    const results = [];
    for (let i = 0; i < pids.length; i++) {
      const pid = pids[i];
      const fdDir = path.join(procDir, pid, 'fd');
      let fds;
      try { fds = require('fs').readdirSync(fdDir); } catch (_) { continue; }
      for (let j = 0; j < fds.length; j++) {
        const fd = fds[j];
        const linkPath = path.join(fdDir, fd);
        let target;
        try { target = require('fs').readlinkSync(linkPath); } catch (_) { continue; }
        if (/^\/dev\/video\d+$/.test(target)) {
          let cmd = '';
          try { cmd = require('fs').readFileSync(path.join(procDir, pid, 'cmdline'), 'utf8').replace(/\0/g, ' ').trim(); } catch (_) { }
          results.push({ device: target, pid: parseInt(pid, 10), cmd: cmd });
        }
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

export const devicesInUse = async (req, res) => {
  try {
    const usage = scanVideoUsage();
    res.json({ success: true, usage: usage });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

function probeDeviceSimple(devPath, timeoutMs) {
  return new Promise(function (resolve) {
    // Check if device file exists and is accessible
    try {
      const stats = fsSync.statSync(devPath);
      if (!stats.isCharacterDevice()) {
        return resolve({ path: devPath, ok: false, info: 'Not a character device' });
      }
    } catch (e) {
      return resolve({ path: devPath, ok: false, info: 'Device not found' });
    }

    // Use v4l2-ctl to check if device is a valid video device
    let done = false;
    let proc;
    function finish(ok, info) {
      if (done) return;
      done = true;
      try { proc && proc.kill('SIGTERM'); } catch (_) { }
      resolve({ path: devPath, ok: !!ok, info: info || null });
    }

    try {
      proc = spawn('v4l2-ctl', ['--device', devPath, '--list-formats-ext'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (e) {
      // Fallback: just check if device exists and is readable
      try {
        fsSync.accessSync(devPath, fsSync.constants.R_OK);
        return resolve({ path: devPath, ok: true, info: 'Device accessible' });
      } catch (accessErr) {
        return resolve({ path: devPath, ok: false, info: 'Device not accessible' });
      }
    }

    const timeout = setTimeout(function () { finish(false, 'timeout'); }, Math.max(500, timeoutMs || 1500));

    let hasOutput = false;
    proc.stdout.on('data', function () { hasOutput = true; });

    proc.on('close', function (code) {
      clearTimeout(timeout);
      if (hasOutput && code === 0) {
        finish(true, 'Valid video device');
      } else {
        finish(false, `v4l2-ctl failed (code: ${code})`);
      }
    });

    proc.on('error', function (e) {
      clearTimeout(timeout);
      // Fallback: just check if device exists
      try {
        fsSync.accessSync(devPath, fsSync.constants.R_OK);
        finish(true, 'Device accessible (fallback)');
      } catch (accessErr) {
        finish(false, e && e.message);
      }
    });
  });
}

async function chooseFirstWorkingDevice(timeoutMs) {
  const list = await listVideoDevices();
  for (let i = 0; i < list.length; i++) {
    const res = await probeDeviceSimple(list[i], timeoutMs);
    if (res.ok) return res.path;
  }
  return null;
}

export const listDevices = async (req, res) => {
  try {
    const devices = await listVideoDevices();
    const items = [];
    for (let i = 0; i < devices.length; i++) {
      const name = await getVideoDeviceName(devices[i]);
      items.push({ path: devices[i], name: name });
    }
    res.json({ success: true, devices: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const probeDevices = async (req, res) => {
  try {
    const timeoutMs = parseInt(req.query.timeoutMs || '1500', 10);
    const devices = await listVideoDevices();
    const results = [];
    for (let i = 0; i < devices.length; i++) {
      const name = await getVideoDeviceName(devices[i]);
      const probe = await probeDeviceSimple(devices[i], timeoutMs);
      const inUse = (typeof _activeVideoUse !== 'undefined' && _activeVideoUse && _activeVideoUse.has(devices[i])) ? _activeVideoUse.get(devices[i]) : null;
      const extra = inUse ? { inUseBy: inUse.kind, pid: inUse.pid, startedAt: inUse.startedAt } : {};
      results.push(Object.assign({ path: devices[i], name: name, ok: probe.ok, info: probe.info }, extra));
    }
    res.json({ success: true, results: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


export const listControls = async (req, res) => {
  try {
    const { id } = req.params;
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });
    const deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;

    // Fast check: verify device file exists before calling slow Python script
    const devPath = '/dev/video' + String(parseInt(deviceId, 10) || 0);
    try {
      await fs.access(devPath);
    } catch (_) {
      return res.json({ success: false, error: 'Device ' + devPath + ' not available', controls: {} });
    }

    const result = await hardwareService.HARDWARE_CONTROLLERS.webcam.listControls({ deviceId });
    res.json({ success: !!result.success, controls: result.controls, rawOutput: result.rawOutput, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const setControls = async (req, res) => {
  try {
    const { id } = req.params;
    const { controls, persist } = req.body || {};
    if (!controls || typeof controls !== 'object') {
      return res.status(400).json({ success: false, error: 'controls object required' });
    }
    const parts = await loadParts();
    const idx = parts.findIndex(p => String(p.id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
    const part = parts[idx];
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });
    const deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;

    // Strip UI-only flags (nightMode) before sending to V4L2
    const v4l2Controls = Object.assign({}, controls);
    delete v4l2Controls.nightMode;

    let hardwareOk = false;
    let hardwareError = null;
    let rawOutput = null;

    // Fast check: verify device file exists before calling slow Python script
    const devPath = '/dev/video' + String(parseInt(deviceId, 10) || 0);
    let deviceExists = false;
    try { await fs.access(devPath); deviceExists = true; } catch (_) { }

    if (deviceExists && Object.keys(v4l2Controls).length > 0) {
      try {
        const result = await hardwareService.HARDWARE_CONTROLLERS.webcam.setControls({ deviceId, controls: v4l2Controls });
        hardwareOk = !!result.success;
        hardwareError = result.error || null;
        rawOutput = result.rawOutput || null;
      } catch (hwErr) {
        hardwareError = hwErr.message || String(hwErr);
      }
    } else if (!deviceExists) {
      hardwareError = 'Device ' + devPath + ' not available';
    }

    // Persist to part config if requested (include nightMode flag for UI state)
    // Always persist when requested, even if hardware is unavailable — settings apply on next startup
    if (persist) {
      const filePath = await getPartsFilePath();
      // Serialize the read-modify-write so a concurrent parts.json writer can't
      // clobber this update (lost-update race), and re-read inside the lock so the
      // merge lands on the latest on-disk state. Atomic write prevents torn files.
      await withFileLock(filePath, async () => {
        const fresh = await loadParts();
        const fidx = fresh.findIndex(p => String(p.id) === String(id));
        if (fidx !== -1) {
          const target = fresh[fidx];
          const nextCfg = Object.assign({}, target.config || {}, { controls: Object.assign({}, (target.config && target.config.controls) || {}, controls) });
          fresh[fidx] = Object.assign({}, target, { config: nextCfg, updated: new Date().toISOString() });
          await writeJsonAtomic(filePath, fresh);
        } else {
          // Part vanished from disk between the initial read and the lock; persist
          // the in-memory version rather than dropping the user's change silently.
          const nextCfg = Object.assign({}, part.config || {}, { controls: Object.assign({}, (part.config && part.config.controls) || {}, controls) });
          parts[idx] = Object.assign({}, part, { config: nextCfg, updated: new Date().toISOString() });
          await writeJsonAtomic(filePath, parts);
        }
      });
    }

    if (!hardwareOk) {
      return res.json({ success: true, applied: controls, hardwareApplied: false, persisted: !!persist, message: 'Controls saved' + (persist ? ' (will apply when device is available)' : '') + ': ' + (hardwareError || 'hardware unavailable'), rawOutput });
    }

    res.json({ success: true, applied: controls, hardwareApplied: true, persisted: !!persist, message: 'Controls applied', rawOutput });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Health check for mjpg-streamer service
/**
 * Is the camera actually delivering frames?
 *
 * This used to GET mjpg-streamer's ROOT url and return true for any response. That
 * is the static index page served by output_http.so, which keeps answering happily
 * when the INPUT plugin is dead — so the health field read `running: true` while the
 * camera delivered nothing at all. Observed on 2026-08-21 with the journal showing
 * "libv4l2: error turning on stream: Protocol error / Can't enable video in first
 * time": device node present, v4l2-ctl able to read the format, port 8090 listening,
 * output plugin serving, and zero frames. A health check that reports healthy while
 * the camera is dead is worse than no health check.
 *
 * So probe the SNAPSHOT endpoint, which cannot answer without a real frame, and
 * report the two facts separately. The snapshot HANGS rather than erroring when the
 * input plugin is down, so the timeout is load-bearing, not belt-and-braces.
 *
 * @returns {Promise<{streaming:boolean, httpResponding:boolean, reason:string|null}>}
 */
async function probeMjpgStreamer() {
  const withTimeout = async (url, ms) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), ms);
    try {
      return await fetch(url, { method: 'GET', signal: abortController.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let httpResponding = false;
  try {
    const res = await withTimeout(MJPG_STREAMER_URL, 3000);
    httpResponding = res.status !== 0;
  } catch (_) {
    return { streaming: false, httpResponding: false, reason: 'no HTTP response on port 8090' };
  }

  try {
    const snap = await withTimeout(`${MJPG_STREAMER_URL}/?action=snapshot`, 4000);
    if (!snap.ok) {
      return { streaming: false, httpResponding, reason: `snapshot returned HTTP ${snap.status}` };
    }
    const buf = Buffer.from(await snap.arrayBuffer());
    if (buf.length < 1024) {
      return { streaming: false, httpResponding, reason: `snapshot was only ${buf.length} bytes — not a real frame` };
    }
    return { streaming: true, httpResponding, reason: null };
  } catch (error) {
    const aborted = error.name === 'AbortError' || error.name === 'TimeoutError';
    return {
      streaming: false,
      httpResponding,
      // This is the signature of a dead input plugin: the web server answers, the
      // snapshot never does. Almost always a USB/power fault on this fleet.
      reason: aborted
        ? 'HTTP is up but the snapshot never returned — input plugin is not capturing (check USB power)'
        : `snapshot failed: ${error.message}`
    };
  }
}

async function checkMjpgStreamerHealth() {
  const probe = await probeMjpgStreamer();
  return probe.streaming;
}

/**
 * Find the running mjpg_streamer's full command line, as an unprivileged process.
 *
 * scanVideoUsage() cannot be used for this and never could: it walks /proc/PID/fd,
 * and mjpg-streamer runs as root while this app runs as `remote`, so those symlinks
 * are unreadable and the scan returns []. That is also why the health endpoint's
 * `pid` field has always been null on a node where the stream is plainly running.
 *
 * /proc/PID/cmdline IS world-readable, so match on that instead. systemd's MainPID
 * is tried first because it is one read instead of a full /proc walk.
 */

function readMjpgStreamerPid() {
  try {
    const shown = execFileSync('systemctl', ['show', 'mjpg-streamer', '-p', 'MainPID'],
      { encoding: 'utf8', timeout: 3000 });
    const m = /MainPID=(\d+)/.exec(shown);
    return (m && m[1] !== '0') ? parseInt(m[1], 10) : null;
  } catch (_) { return null; }
}

function findMjpgStreamerCmdline() {
  const readCmdline = (pid) => {
    try {
      return fsSync.readFileSync(path.join('/proc', String(pid), 'cmdline'), 'utf8')
        .replace(/\0/g, ' ').trim();
    } catch (_) { return ''; }
  };

  try {
    const shown = execFileSync('systemctl', ['show', 'mjpg-streamer', '-p', 'MainPID'],
      { encoding: 'utf8', timeout: 3000 });
    const m = /MainPID=(\d+)/.exec(shown);
    if (m && m[1] !== '0') {
      const line = readCmdline(m[1]);
      if (/mjpg_streamer/i.test(line)) return line;
    }
  } catch (_) { /* systemd may not own it (a hand-started stream) — fall through */ }

  try {
    for (const entry of fsSync.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      const line = readCmdline(entry);
      if (/mjpg_streamer/i.test(line)) return line;
    }
  } catch (_) { /* nothing readable */ }
  return '';
}

/**
 * What geometry is the camera ACTUALLY streaming at, right now?
 *
 * Read from the running mjpg_streamer's own argv, because that is the only source
 * that cannot be stale. Four different places used to claim to describe webcam
 * geometry and none of them was consulted by the camera:
 *
 *   1. scripts/mjpg-launcher.sh — the REAL one. Its defaults (640x480 @ 15fps q60)
 *      are the operator's spec: remote monitoring happens on a phone, so motion
 *      matters more than detail and USB bandwidth matters more than both. Overridable
 *      per node via /etc/default/monsterbox-cam.
 *   2. data/models/webcam_models.json `defaults` — the camera's SENSOR MAXIMUM, which
 *      the UI displayed as though it were the operational setting. One node's camera
 *      is an Arducam B0205, so the UI advertised 1920x1080@30 while the stream was
 *      and always had been 640x480@15. That is the "it's still running high
 *      resolution video" report: the number on screen, not the camera.
 *   3. controllers/webcamController.applyDeviceToService — writes a systemd drop-in.
 *      Unreachable in practice: the app runs as an unprivileged user and the drop-in
 *      directory is root-owned, so the write fails with EACCES.
 *   4. views/setup/calibration.ejs Edit-Part width/height — read by nothing.
 *
 * So the fix is not to add a fifth source. It is to report the truth and stop
 * presenting a sensor maximum as a live setting.
 *
 * @returns {{resolution:string|null, fps:number|null, quality:number|null,
 *            devicePath:string|null, source:string}}
 */
export function readActiveStreamGeometry() {
  try {
    const line = findMjpgStreamerCmdline();
    if (line) {
      const res = /-r\s+(\d+x\d+)/.exec(line);
      const fps = /-f\s+(\d+)/.exec(line);
      const q = /-q\s+(\d+)/.exec(line);
      const dev = /-d\s+(\S+)/.exec(line);
      if (res || fps || q) {
        return {
          resolution: res ? res[1] : null,
          fps: fps ? parseInt(fps[1], 10) : null,
          quality: q ? parseInt(q[1], 10) : null,
          devicePath: dev ? dev[1] : null,
          source: 'running mjpg_streamer process'
        };
      }
    }
  } catch (_) { /* fall through to the file, then to the documented defaults */ }

  // Not running: report what it WOULD start with, and say so, rather than guessing.
  try {
    const raw = fsSync.readFileSync('/etc/default/monsterbox-cam', 'utf8');
    const pick = (key) => {
      const m = new RegExp('^\\s*' + key + '\\s*=\\s*"?([^"\\s#]+)', 'm').exec(raw);
      return m ? m[1] : null;
    };
    const resolution = pick('MB_CAM_RES');
    const fps = pick('MB_CAM_FPS');
    const quality = pick('MB_CAM_Q');
    if (resolution || fps || quality) {
      return {
        resolution: resolution || '640x480',
        fps: fps ? parseInt(fps, 10) : 15,
        quality: quality ? parseInt(quality, 10) : 60,
        devicePath: pick('MB_CAM_DEV'),
        source: '/etc/default/monsterbox-cam (stream not running)'
      };
    }
  } catch (_) { /* no override file is the normal case */ }

  return {
    resolution: '640x480',
    fps: 15,
    quality: 60,
    devicePath: null,
    source: 'scripts/mjpg-launcher.sh defaults (stream not running)'
  };
}

export const getHealthStatus = async (req, res) => {
  try {
    const [probe, devices] = await Promise.all([
      probeMjpgStreamer(),
      listVideoDevices()
    ]);

    const usage = scanVideoUsage();

    res.json({
      success: true,
      mjpgStreamer: {
        // `running` now means FRAMES ARE FLOWING, not "the web server answered".
        // output_http.so keeps serving its index page with a dead input plugin, so
        // the old meaning reported a healthy camera that was delivering nothing.
        running: probe.streaming,
        httpResponding: probe.httpResponding,
        notStreamingReason: probe.reason,
        url: MJPG_STREAMER_URL,
        // Was ALWAYS null: it searched scanVideoUsage(), which walks /proc/PID/fd and
        // cannot see a root-owned process from this unprivileged app. Ask systemd.
        pid: readMjpgStreamerPid(),
        // The geometry actually in effect, read from the running process — NOT a
        // model default. A model's `defaults` is the sensor maximum; showing it as
        // the live setting is what made one node appear to stream 1080p30 while it
        // had always been 640x480@15. `source` names where the number came from so a
        // reader can never mistake a fallback for a measurement.
        activeGeometry: readActiveStreamGeometry()
      },
      devices: {
        total: devices.length,
        entries: devices
      },
      processes: usage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrieving webcam health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webcam health',
      message: error.message
    });
  }
};

export const streamMJPEG = async (req, res) => {
  try {
    // In test mode, avoid touching hardware or external services; return OK JSON to prevent 5xx
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (inTest) {
      return res.status(200).json({ success: true, testMode: true, message: 'Webcam stream disabled in test mode' });
    }

    const { id } = req.params;
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });

    // Check if mjpg-streamer service is available
    const isHealthy = await checkMjpgStreamerHealth();
    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'mjpg-streamer service is not available. Please check if the service is running.'
      });
    }

    // Determine device path for tracking purposes
    var deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;
    var devicePath = (part.config && part.config.devicePath) ? String(part.config.devicePath) : null;
    if (!devicePath) {
      var n = parseInt(deviceId, 10);
      if (!isNaN(n)) devicePath = '/dev/video' + String(n);
    }
    // Default to /dev/video0 if still not determined
    if (!devicePath) {
      devicePath = '/dev/video0';
    }

    // Set MJPEG headers for proxying
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Connection', 'close');
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=--myboundary');

    // Proxy the stream from mjpg-streamer with minimal retry (health check already passed)
    let retryCount = 0;
    const maxRetries = 2;
    let streamResponse = null;
    let abortController = null;
    let timeoutId = null;

    while (retryCount < maxRetries && !streamResponse) {
      try {
        abortController = new AbortController();
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 5000); // 5 second connect timeout

        streamResponse = await nodeFetch(MJPG_STREAM_ENDPOINT, {
          signal: abortController.signal,
          headers: {
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=60, max=100'
          }
        });

        clearTimeout(timeoutId);
        break;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw fetchErr;
        }
      }
    }

    try {

      if (!streamResponse.ok) {
        throw new Error(`mjpg-streamer returned ${streamResponse.status}: ${streamResponse.statusText}`);
      }

      // Forward the content type from mjpg-streamer
      const contentType = streamResponse.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Track active stream usage
      try {
        _activeVideoUse.set(devicePath, {
          kind: 'mjpeg-proxy',
          pid: process.pid,
          startedAt: Date.now(),
          service: 'mjpg-streamer'
        });
      } catch (_) { }

      // Handle cleanup on request close
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          abortController.abort();
          clearTimeout(timeoutId);
        } catch (_) { }
        try { _activeVideoUse.delete(devicePath); } catch (_) { }
        try { res.end(); } catch (_) { }
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);

      // Pipe using Node.js streams to minimize buffering/latency
      // node-fetch returns a Node.js stream directly, no conversion needed
      const nodeReadable = streamResponse.body;

      nodeReadable.on('error', (error) => {
        // Handle specific undici body timeout errors
        if (error.code === 'UND_ERR_BODY_TIMEOUT' || error.name === 'BodyTimeoutError') {
          console.warn('Stream body timeout detected, connection will auto-reconnect on next request');
        } else if (error.name !== 'TimeoutError' && error.name !== 'AbortError') {
          console.error('Stream piping error:', error);
        }
        cleanup();
      });

      // Pipe to response
      nodeReadable.pipe(res);
      nodeReadable.on('end', () => cleanup());

    } catch (fetchError) {
      console.error('mjpg-streamer fetch error:', fetchError);

      if (!res.headersSent) {
        return res.status(502).json({
          success: false,
          error: `Failed to connect to mjpg-streamer: ${fetchError.message}. Please ensure mjpg-streamer service is running.`
        });
      } else {
        // Send error frame in MJPEG format
        try {
          res.write(`--myboundary\r\nContent-Type: text/plain\r\n\r\nStream error: ${fetchError.message}\r\n`);
        } catch (_) { }
        try { res.end(); } catch (_) { }
      }
    }
  } catch (err) {
    console.error('❌ Webcam stream error:', err);
    console.error('Error stack:', err.stack);
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (!res.headersSent) {
      if (inTest) return res.json({ success: false, error: err.message, testMode: true });
      res.status(500).json({ success: false, error: err.message, details: err.stack });
    } else {
      try { res.end(); } catch (e) { /* ignore */ }
    }
  }
};

// Track active usage of video devices by this server
const _activeVideoUse = new Map(); // key: devicePath, val: { kind: 'mjpeg', pid, startedAt }


// Apply selected webcam device to mjpg-streamer via systemd drop-in override
export const applyDeviceToService = async (req, res) => {
  try {
    const { id } = req.params;
    const dryRun = (req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true')) || (req.body && (req.body.dryRun === true)) || (process.env.MONSTERBOX_DRY_RUN === 'true');

    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });

    // Determine devicePath
    let devicePath = (part.config && part.config.devicePath) ? String(part.config.devicePath) : null;
    if (!devicePath) {
      const deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;
      const n = parseInt(deviceId, 10);
      if (!isNaN(n)) devicePath = '/dev/video' + String(n);
    }
    if (!devicePath) devicePath = '/dev/video0';

    // Flags (defaults, can later be model/part configurable)
    const resolution = (part.config && part.config.resolution) || '640x480';
    const fps = (part.config && part.config.fps) || 15;
    const quality = (part.config && part.config.quality) || 85;

    const overrideDir = '/etc/systemd/system/mjpg-streamer.service.d';
    const overridePath = path.join(overrideDir, 'override.conf');
    const mjpgBin = '/usr/local/bin/mjpg_streamer';
    const wwwPath = '/usr/local/share/mjpg-streamer/www';

    const overrideContent = [
      '[Service]',
      'ExecStart=',
      'ExecStart=' + mjpgBin + ' -i "input_uvc.so -d ' + devicePath + ' -r ' + resolution + ' -f ' + fps + ' -q ' + quality + '" -o "output_http.so -p 8090 -w ' + wwwPath + '"',
      ''
    ].join('\n');

    const steps = [];
    if (!dryRun) {
      await fs.mkdir(overrideDir, { recursive: true }).catch(() => { /* ignore */ });
      await fs.writeFile(overridePath, overrideContent);
      steps.push('Wrote drop-in override: ' + overridePath);
    } else {
      steps.push('Dry-run: would write override at ' + overridePath);
    }

    // Helper to run a command and capture output
    function runCmd(cmd, args) {
      return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.stderr.on('data', (d) => { err += d.toString(); });
        proc.on('error', (e) => reject(e));
        proc.on('close', (code) => resolve({ cmd: cmd + ' ' + (args || []).join(' '), code, stdout: out, stderr: err }));
      });
    }

    let results = [];
    let logs = '';
    if (!dryRun) {
      // Reload and restart service
      const r1 = await runCmd('systemctl', ['daemon-reload']);
      const r2 = await runCmd('systemctl', ['restart', 'mjpg-streamer']);
      const r3 = await runCmd('systemctl', ['is-active', 'mjpg-streamer']);
      results.push(r1, r2, r3);
      try {
        const jl = await runCmd('journalctl', ['-u', 'mjpg-streamer', '-n', '50', '--no-pager']);
        logs = jl.stdout || jl.stderr || '';
      } catch (_) { /* ignore */ }
      const active = (r3.stdout || '').trim() === 'active';

      // Reapply saved V4L2 controls after service restart
      let controlsReapplied = false;
      if (active && part.config && part.config.controls) {
        try {
          const savedControls = Object.assign({}, part.config.controls);
          delete savedControls.nightMode; // UI-only flag
          if (Object.keys(savedControls).length > 0) {
            // Brief delay for mjpg-streamer to fully initialize the device
            await new Promise(resolve => setTimeout(resolve, 1500));
            await hardwareService.HARDWARE_CONTROLLERS.webcam.setControls({ deviceId, controls: savedControls });
            controlsReapplied = true;
            steps.push('Reapplied saved V4L2 controls after restart');
          }
        } catch (ctrlErr) {
          steps.push('Warning: failed to reapply controls: ' + (ctrlErr.message || ctrlErr));
        }
      }

      return res.json({ success: active, devicePath, flags: { resolution, fps, quality }, overridePath, dryRun: false, steps, results, logs, needsSudo: false, controlsReapplied });
    }

    // Dry-run response
    return res.json({ success: true, devicePath, flags: { resolution, fps, quality }, overridePath, dryRun: true, steps, preview: overrideContent });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const needsSudo = /EACCES|permission|denied|root|systemctl|journalctl/i.test(msg);
    return res.status(500).json({ success: false, error: msg, needsSudo, guidance: 'Writing systemd drop-ins and restarting services usually requires root. See README for sudoers wrapper instructions.' });
  }
};


export default {
  listControls,
  setControls,
  streamMJPEG,
  listDevices,
  probeDevices,
  devicesInUse,
  applyDeviceToService,
  getHealthStatus
};

