import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getPartsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
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

function probeDeviceFFmpeg(devPath, timeoutMs) {
  return new Promise(function (resolve) {
    let done = false;
    let proc;
    function finish(ok, info) { if (done) return; done = true; try { proc && proc.kill('SIGTERM'); } catch (_) { } resolve({ path: devPath, ok: !!ok, info: info || null }); }
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 'video4linux2', '-i', devPath, '-frames:v', '1', '-f', 'mjpeg', '-'];
    try {
      proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return finish(false, 'ffmpeg not found');
    }
    const to = setTimeout(function () { finish(false, 'timeout'); }, Math.max(500, timeoutMs || 1500));
    proc.stdout.once('data', function () { clearTimeout(to); finish(true, 'ok'); });
    proc.stderr.on('data', function (d) {
      const msg = String(d || '');
      if (/No such file or directory/i.test(msg) || /Device or resource busy/i.test(msg)) {
        clearTimeout(to); finish(false, msg.trim());
      }
    });
    proc.on('error', function (e) { clearTimeout(to); finish(false, e && e.message); });
    proc.on('close', function () { /* if not already finished, leave timeout to fire */ });
  });
}

async function chooseFirstWorkingDevice(timeoutMs) {
  const list = await listVideoDevices();
  for (let i = 0; i < list.length; i++) {
    const res = await probeDeviceFFmpeg(list[i], timeoutMs);
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
      const probe = await probeDeviceFFmpeg(devices[i], timeoutMs);
      results.push({ path: devices[i], name: name, ok: probe.ok, info: probe.info });
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

export const streamMJPEG = async (req, res) => {
  try {
    const { id } = req.params;
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });

    // Determine device path
    var deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;
    var devicePath = (part.config && part.config.devicePath) ? String(part.config.devicePath) : null;
    if (!devicePath) {
      var n = parseInt(deviceId, 10);
      if (!isNaN(n)) devicePath = '/dev/video' + String(n);
    }
    // Optional auto-detect: pick the first working /dev/video* if requested or missing
    var auto = (String(req.query.auto || '').toLowerCase() === '1' || String(req.query.auto || '').toLowerCase() === 'true');
    if (!devicePath || auto) {
      const autoPath = await chooseFirstWorkingDevice(1500);
      if (autoPath) {
        devicePath = autoPath;
      } else if (!devicePath) {
        return res.status(404).json({ success: false, error: 'No working video device found' });
      }
    }

    // Write MJPEG headers
    res.writeHead(200, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Connection': 'close',
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame'
    });

    // Spawn ffmpeg to produce multipart MJPEG stream on stdout
    // Note: -f mpjpeg makes ffmpeg write proper multipart boundaries
    const ffArgs = ['-hide_banner', '-loglevel', 'error', '-f', 'video4linux2', '-i', devicePath, '-f', 'mpjpeg', '-q:v', '7', '-r', '15', '-'];
    const proc = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let closed = false;
    const closeAll = function () {
      if (closed) return; closed = true;
      try { proc.kill('SIGTERM'); } catch (e) { /* ignore */ }
      try { res.end(); } catch (e) { /* ignore */ }
    };

    proc.stdout.on('data', function (chunk) {
      try { res.write(chunk); } catch (e) { closeAll(); }
    });
    proc.stderr.on('data', function (data) {
      // Surface initial error if ffmpeg cannot open device
      const msg = data.toString();
      if (msg && msg.toLowerCase().indexOf('no such file or directory') !== -1) {
        // Send a friendly error frame once, then close
        try {
          res.write(`--frame\r\nContent-Type: text/plain\r\n\r\nWebcam device not found: ${devicePath}\r\n`);
        } catch (_) { }
        closeAll();
      }
    });
    proc.on('error', function () { closeAll(); });
    proc.on('close', function () { closeAll(); });


    req.on('close', function () { closeAll(); });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      try { res.end(); } catch (e) { /* ignore */ }
    }
  }
};

// --- WebRTC (beta) ---
const _webrtcSessions = new Map();
async function _ensureWrtc() { try { const mod = await import('wrtc'); return mod; } catch (e) { return null; } }
function _startFFmpegRaw(devicePath, width, height, fps) {
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'video4linux2', '-i', devicePath, '-vf', `scale=${width}:${height}`, '-pix_fmt', 'yuv420p', '-r', String(fps || 15), '-f', 'rawvideo', '-'];
  return spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}
export const webrtcOffer = async (req, res) => {
  try {
    const wrtc = await _ensureWrtc();
    if (!wrtc) return res.status(501).json({ success: false, error: 'WebRTC server dependency (wrtc) not installed', install: 'cd apps/monsterbox4 && npm install wrtc' });
    const { id } = req.params; const { sdp } = req.body || {}; if (!sdp) return res.status(400).json({ success: false, error: 'Missing SDP offer' });
    const parts = await loadParts(); const part = parts.find(p => String(p.id) === String(id));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    if (part.type !== 'webcam') return res.status(400).json({ success: false, error: 'Part is not a webcam' });
    var deviceId = (part.config && (part.config.deviceId || part.config.cameraId)) != null ? (part.config.deviceId || part.config.cameraId) : 0;
    var devicePath = (part.config && part.config.devicePath) ? String(part.config.devicePath) : null;
    if (!devicePath) { var n = parseInt(deviceId, 10); if (!isNaN(n)) devicePath = '/dev/video' + String(n); }
    var auto = (String(req.query.auto || '').toLowerCase() === '1' || String(req.query.auto || '') === 'true');
    if (!devicePath || auto) { const autoPath = await chooseFirstWorkingDevice(1500); if (autoPath) devicePath = autoPath; else if (!devicePath) return res.status(404).json({ success: false, error: 'No working video device found' }); }
    const pc = new wrtc.RTCPeerConnection({});
    const source = new wrtc.nonstandard.RTCVideoSource(); const track = source.createTrack(); pc.addTrack(track);
    pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') { try { track.stop(); } catch (_) { } const sess = _webrtcSessions.get(pc); if (sess && sess.proc) { try { sess.proc.kill('SIGTERM'); } catch (_) { } } _webrtcSessions.delete(pc); } };
    await pc.setRemoteDescription({ type: 'offer', sdp }); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
    const width = 640, height = 480, fps = 15; const frameSize = Math.floor(width * height * 1.5);
    const proc = _startFFmpegRaw(devicePath, width, height, fps); let buffer = Buffer.alloc(0);
    proc.stdout.on('data', function (chunk) { buffer = Buffer.concat([buffer, chunk]); while (buffer.length >= frameSize) { const frameData = buffer.subarray(0, frameSize); buffer = buffer.subarray(frameSize); try { source.onFrame({ width: width, height: height, data: frameData }); } catch (_) { } } });
    proc.stderr.on('data', function () { }); proc.on('close', function () { try { track.stop(); } catch (_) { } });
    _webrtcSessions.set(pc, { proc, track });
    res.json({ success: true, sdp: pc.localDescription.sdp });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

export default { listControls, setControls, streamMJPEG, listDevices, probeDevices, webrtcOffer };

