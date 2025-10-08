import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Readable } from 'stream';

import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';

// mjpg-streamer service configuration
const MJPG_STREAMER_URL = 'http://localhost:8090';
const MJPG_STREAM_ENDPOINT = `${MJPG_STREAMER_URL}/?action=stream`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getPartsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'parts.json');
}

async function loadParts() {
  const filePath = await getPartsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
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

    const result = await hardwareService.HARDWARE_CONTROLLERS.webcam.setControls({ deviceId, controls });
    if (!result.success) return res.status(400).json({ success: false, error: result.error || 'Failed to set controls', rawOutput: result.rawOutput });

    // Persist to part config if requested
    if (persist) {
      const nextCfg = Object.assign({}, part.config || {}, { controls: Object.assign({}, (part.config && part.config.controls) || {}, controls) });
      parts[idx] = Object.assign({}, part, { config: nextCfg, updated: new Date().toISOString() });
      const filePath = await getPartsFilePath();
      await fs.writeFile(filePath, JSON.stringify(parts, null, 2));
    }

    res.json({ success: true, applied: controls, message: result.message || 'Controls applied', rawOutput: result.rawOutput });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Health check for mjpg-streamer service
async function checkMjpgStreamerHealth() {
  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 3000); // Reduced timeout to 3 seconds

    const response = await fetch(MJPG_STREAMER_URL, {
      method: 'GET',
      signal: abortController.signal
    });

    clearTimeout(timeoutId);
    // mjpg-streamer is running if we get any response (even 400/500)
    return response.status !== 0;
  } catch (error) {
    // Only log non-timeout/abort errors to reduce noise
    if (error.name !== 'TimeoutError' && error.name !== 'AbortError') {
      console.warn('mjpg-streamer health check failed:', error.message);
    }
    return false;
  }
}

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

    // Proxy the stream from mjpg-streamer with retry logic
    let retryCount = 0;
    const maxRetries = 5;
    let streamResponse = null;
    // Hoisted controller and timeout for proper cleanup
    let abortController = null;
    let timeoutId = null;


    while (retryCount < maxRetries && !streamResponse) {
      try {
        // Create an AbortController for better timeout management
        abortController = new AbortController();
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 60000); // 60 second timeout for streaming data

        streamResponse = await fetch(MJPG_STREAM_ENDPOINT, {
          signal: abortController.signal,
          headers: {
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=60, max=100'
          }
        });

        // Clear timeout if fetch succeeds
        clearTimeout(timeoutId);
        break;
      } catch (fetchErr) {
        retryCount++;
        if (retryCount < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const backoffMs = Math.pow(2, retryCount - 1) * 1000;
          console.log(`mjpg-streamer connection attempt ${retryCount} failed, retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
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
      const nodeReadable = (typeof Readable !== 'undefined' && Readable.fromWeb)
        ? Readable.fromWeb(streamResponse.body)
        : streamResponse.body;

      nodeReadable.on?.('error', (error) => {
        // Handle specific undici body timeout errors
        if (error.code === 'UND_ERR_BODY_TIMEOUT' || error.name === 'BodyTimeoutError') {
          console.warn('Stream body timeout detected, connection will auto-reconnect on next request');
        } else if (error.name !== 'TimeoutError' && error.name !== 'AbortError') {
          console.error('Stream piping error:', error);
        }
        cleanup();
      });

      // Pipe to response
      if (nodeReadable.pipe) {
        nodeReadable.pipe(res);
        nodeReadable.on?.('end', () => cleanup());
      } else {
        // Fallback to manual reads (very old Node/webstreams)
        streamResponse.body.pipeTo(new WritableStream({
          write(chunk) {
            if (!closed && !res.destroyed) {
              try { res.write(chunk); } catch (_) { cleanup(); }
            }
          },
          close() { cleanup(); },
          abort() { cleanup(); }
        })).catch((error) => {
          // Handle specific undici body timeout errors
          if (error.code === 'UND_ERR_BODY_TIMEOUT' || error.name === 'BodyTimeoutError') {
            console.warn('Stream body timeout detected, connection will auto-reconnect on next request');
          } else if (error.name !== 'TimeoutError' && error.name !== 'AbortError') {
            console.error('Stream piping error:', error);
          }
          cleanup();
        });
      }

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
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (!res.headersSent) {
      if (inTest) return res.json({ success: false, error: err.message, testMode: true });
      res.status(500).json({ success: false, error: err.message });
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
      return res.json({ success: active, devicePath, flags: { resolution, fps, quality }, overridePath, dryRun: false, steps, results, logs, needsSudo: false });
    }

    // Dry-run response
    return res.json({ success: true, devicePath, flags: { resolution, fps, quality }, overridePath, dryRun: true, steps, preview: overrideContent });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const needsSudo = /EACCES|permission|denied|root|systemctl|journalctl/i.test(msg);
    return res.status(500).json({ success: false, error: msg, needsSudo, guidance: 'Writing systemd drop-ins and restarting services usually requires root. See README for sudoers wrapper instructions.' });
  }
};


export default { listControls, setControls, streamMJPEG, listDevices, probeDevices, devicesInUse, applyDeviceToService };

