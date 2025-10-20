const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_MEDIA_ROOT = '/home/remote/goblin/media/video';
const LOG_DIR = '/home/remote/goblin/logs';
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) { }

// Proven-good MPV configuration for Raspberry Pi 3B+
// Allow tuning via environment without code changes
const DEFAULT_HWDEC = process.env.GOBLIN_HWDEC || 'v4l2m2m';
const ENV_EXTRA_ARGS = (process.env.GOBLIN_MPV_EXTRA_ARGS || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const DEFAULT_VO = process.env.GOBLIN_VO || 'drm';

const MPV_BASE_ARGS = [
  `--vo=${DEFAULT_VO}`,
  `--hwdec=${DEFAULT_HWDEC}`,
  '--fs',
  // Smooth frame pacing to 60Hz output
  '--video-sync=display-resample',
  '--msg-level=all=error',
  '--no-terminal',
  '--no-input-default-bindings',
  ...ENV_EXTRA_ARGS,
];

class MPVController {
  constructor(options = {}) {
    this.process = null;
    this.currentVideo = null;
    this.mediaRoot = options.mediaRoot || DEFAULT_MEDIA_ROOT;
    this.extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
    this.onEnd = null; // Callback when current video exits
  }

  async play(filename, options = {}) {
    await this.stop();

    const videoPath = path.isAbsolute(filename)
      ? filename
      : path.join(this.mediaRoot, filename);

    const args = [...MPV_BASE_ARGS, ...this.extraArgs];
    if (options.loop) args.push('--loop');
    if (options.audioDevice) args.push(`--audio-device=${options.audioDevice}`);
    if (options.displayFps) args.push(`--display-fps=${options.displayFps}`);
    const envConnector = process.env.GOBLIN_DRM_CONNECTOR;
    const envMode = process.env.GOBLIN_DRM_MODE;
    if (options.connector) args.push(`--drm-connector=${options.connector}`);
    else if (envConnector) args.push(`--drm-connector=${envConnector}`);
    if (options.mode) args.push(`--drm-mode=${options.mode}`);
    else if (envMode) args.push(`--drm-mode=${envMode}`);
    args.push(videoPath);

    this.process = spawn('mpv', args, {
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe'] // capture only stderr for diagnostics
    });

    try {
      const logPath = path.join('/home/remote/goblin', 'logs', 'mpv.stderr.log');
      this.process.stderr.on('data', (buf) => {
        try { fs.appendFile(logPath, buf, () => { }); } catch (_) { }
      });
    } catch (_) { }

    this.currentVideo = filename;

    this.process.on('exit', () => {
      this.process = null;
      const finished = this.currentVideo;
      this.currentVideo = null;
      if (typeof this.onEnd === 'function') {
        try { this.onEnd(finished); } catch (_) { }
      }
    });

    return { success: true, playing: filename };
  }

  async stop() {
    if (this.process) {
      try { this.process.kill('SIGTERM'); } catch (_) { }
      await new Promise(r => setTimeout(r, 400));
      if (this.process) {
        try { this.process.kill('SIGKILL'); } catch (_) { }
      }
      this.process = null;
      this.currentVideo = null;
    }
  }
}

module.exports = MPVController;

