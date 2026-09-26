const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Standardized 720p30 video directory for all Goblins
const DEFAULT_MEDIA_ROOT = '/home/remote/media/video';
const LOG_DIR = '/home/remote/goblin/logs';
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) { }

// Optimized MPV configuration for Raspberry Pi 3B+ with 720p30 videos
// Testing shows --vo=drm DOES work on Pi3, --vo=gpu --gpu-context=drm does NOT
// All videos are standardized to 1280x720 @ 30fps H.264
const DEFAULT_HWDEC = process.env.GOBLIN_HWDEC || 'v4l2m2m-copy';
const ENV_EXTRA_ARGS = (process.env.GOBLIN_MPV_EXTRA_ARGS || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const DEFAULT_VO = process.env.GOBLIN_VO || 'drm';

const MPV_BASE_ARGS = [
  `--vo=${DEFAULT_VO}`,
  `--hwdec=${DEFAULT_HWDEC}`,
  '--fs',
  '--no-audio',  // Disable audio for video displays
  // Back to original working settings - slight judder is normal for 30fps on 60Hz
  '--video-sync=display-resample',
  '--interpolation=no',
  '--msg-level=all=error',
  '--no-terminal',
  '--no-input-default-bindings',
  '--no-osc',  // No on-screen controller
  '--no-osd-bar',  // No OSD bar
  ...ENV_EXTRA_ARGS,
];

class MPVController {
  constructor(options = {}) {
    this.process = null;
    this.currentVideo = null;
    this.mediaRoot = options.mediaRoot || DEFAULT_MEDIA_ROOT;
    this.extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
    this.onEnd = null; // Callback when current video exits

    // Periodic health check to ensure no zombie processes
    this.healthCheckInterval = setInterval(() => {
      this._healthCheck();
    }, 30000); // Check every 30 seconds
  }

  _healthCheck() {
    // If we think we have a process but it's actually dead, clean up
    if (this.process && this.process.exitCode !== null) {
      console.log('Health check: cleaning up dead MPV process reference');
      this.process = null;
      this.currentVideo = null;
    }
  }

  destroy() {
    // Clean shutdown of controller
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    return this.stop();
  }

  async play(filename, options = {}) {
    // Only stop if there's actually a running process
    // Don't try to kill already-exited processes (causes kernel panic)
    if (this.process && !this.process.killed) {
      await this.stop();
    }

    // CRITICAL FIX: Blank console before spawning MPV to prevent CLI visibility
    // This ensures no terminal output leaks to tty1 during process spawn
    // Issue: User reported seeing CLI briefly during video transitions
    try {
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec('setterm -blank force -cursor off >/dev/tty1 2>/dev/null && printf "\\033[2J\\033[H\\033[?25l" >/dev/tty1 2>/dev/null',
          () => resolve());
      });
    } catch (e) { /* ignore blanking errors */ }

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
      stdio: ['ignore', 'ignore', 'pipe'], // capture only stderr for diagnostics
      env: process.env // explicitly pass environment
    });

    // Handle spawn errors
    this.process.on('error', (err) => {
      console.error('MPV spawn error:', err);
      this.process = null;
      this.currentVideo = null;
    });

    try {
      const logPath = path.join('/home/remote/goblin', 'logs', 'mpv.stderr.log');
      this.process.stderr.on('data', (buf) => {
        try { fs.appendFile(logPath, buf, () => { }); } catch (_) { }
      });
    } catch (_) { }

    this.currentVideo = filename;

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`MPV exited with code ${code}, signal ${signal}`);
      }
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
    // CRITICAL: Only try to kill if process exists and hasn't been killed already
    // Killing already-dead MPV processes causes kernel panic on some Pi systems
    if (!this.process) {
      return; // Already stopped
    }

    // Check if process is actually running
    if (this.process.killed || this.process.exitCode !== null) {
      this.process = null;
      this.currentVideo = null;
      return; // Process already exited
    }

    try {
      // Use SIGTERM only - never SIGKILL (causes kernel panic with DRM)
      this.process.kill('SIGTERM');

      // Wait for graceful shutdown
      const timeout = 1000; // 1 second max wait
      const start = Date.now();
      while (this.process && this.process.exitCode === null && (Date.now() - start) < timeout) {
        await new Promise(r => setTimeout(r, 50));
      }

      // If still running after timeout, log warning but DON'T use SIGKILL
      if (this.process && this.process.exitCode === null) {
        console.warn('MPV did not exit gracefully within timeout, leaving it to exit naturally');
        // Process will be cleaned up by exit handler
      }
    } catch (err) {
      // Ignore errors from killing already-dead process
      console.error('Error stopping MPV (non-fatal):', err.message);
    }

    this.process = null;
    this.currentVideo = null;
  }
}

module.exports = MPVController;

