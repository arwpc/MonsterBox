/**
 * Media Player Service - OPTIMIZED FOR RASPBERRY PI 3B+
 * Handles video and audio playback using MPV with hardware acceleration
 *
 * TARGET: Smooth 1080p@30fps output on Pi3 with hardware acceleration
 * RESOLUTION: Supports all common formats (MP4, AVI, MKV, MOV)
 * CODECS: H.264, MPEG4 (hardware accelerated via DRM)
 * PLAYER: MPV (primary) - best for headless DRM output, VLC (fallback)
 *
 * MPV uses DRM (Direct Rendering Manager) for Pi3 hardware acceleration
 * Works reliably as a systemd service without X/Wayland session requirements
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class MediaPlayer {
  constructor(goblinServer) {
    this.goblin = goblinServer;
    this.activeProcesses = new Map();
    this.playbackStatus = {
      video: { playing: false, file: null, process: null, player: null },
      audio: { playing: [], processes: new Map() }
    };
    this.videoPlayer = null;  // Will be detected

    console.log(`🎬 Media player initialized for Goblin ${this.goblin.goblinId}`);
  }

  /**
   * Initialize media player
   */
  async initialize() {
    try {
      // Detect best available video player
      await this.checkDependencies();

      // Setup audio system for HDMI output
      await this.setupAudio();

      console.log(`🎬 Media player ready (using ${this.videoPlayer})`);

    } catch (error) {
      console.error('❌ Media player initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check required dependencies and select best player
   */
  async checkDependencies() {
    return new Promise((resolve, reject) => {
      // MPV is the best solution for headless DRM output on Pi3
      // VLC has DRM xlease issues when running as a service
      // MPV supports H.264, MPEG4, and all common formats (MP4, AVI, MKV, MOV)
      const searchOrder = ['mpv', 'cvlc', 'vlc'];

      const tryNext = (index) => {
        if (index >= searchOrder.length) {
          reject(new Error('No video player found - please install: sudo apt-get install mpv'));
          return;
        }

        const candidate = searchOrder[index];
        exec(`which ${candidate}`, (err) => {
          if (!err) {
            this.videoPlayer = candidate;
            if (candidate === 'mpv') {
              console.log('✅ MPV found - using DRM output with hardware acceleration (supports H.264, MPEG4, MP4, AVI, MKV, MOV)');
            } else {
              console.log('✅ VLC found - using MMAL hardware acceleration (supports H.264, MPEG4, MP4, AVI, MKV, MOV)');
            }
            resolve();
          } else {
            tryNext(index + 1);
          }
        });
      };

      tryNext(0);
    });
  }

  /**
   * Setup audio system for HDMI output
   */
  async setupAudio() {
    return new Promise((resolve) => {
      // Set audio output to HDMI (for Pi connected to projector/TV)
      exec('amixer cset numid=3 2', (error) => {
        if (error) {
          console.warn('⚠️  Could not set HDMI audio output:', error.message);
        } else {
          console.log('🔊 Audio output set to HDMI');
        }

        // Set volume to 80%
        exec('amixer set PCM 80%', (volumeError) => {
          if (volumeError) {
            console.warn('⚠️  Could not set volume:', volumeError.message);
          } else {
            console.log('🔊 Volume set to 80%');
          }
          resolve();
        });
      });
    });
  }

  /**
   * Play video file with hardware acceleration
   */
  async playVideo(filename, options = {}) {
    try {
      console.log(`🎬 Playing video: ${filename}`);

      // Stop any existing video
      if (this.playbackStatus.video.playing) {
        await this.stopVideo();
        // Wait for process to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const videoPath = path.join(__dirname, '..', 'media', 'video', filename);

      // Check if file exists
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`Video file not found: ${filename}`);
      }

      let playerProcess;
      let playerName;
      const selectedPlayer = options.player || this.videoPlayer;

      if (selectedPlayer === 'mpv') {
        // MPV with DRM output - Best solution for headless Pi 3B+
        // Supports H.264, MPEG4 hardware decoding via DRM
        // Supports all common formats: MP4, AVI, MKV, MOV
        const mpvArgs = [
          '--vo=drm',                     // DRM video output (works without X/Wayland)
          '--really-quiet',               // Minimal output
          '--no-terminal',                // No terminal control
          '--no-input-default-bindings',  // Disable keyboard controls
          '--hwdec=auto',                 // Hardware decoding
          '--audio-device=alsa',          // Use ALSA for audio
        ];

        // Loop option
        if (options.loop !== false) {
          mpvArgs.push('--loop');
        }

        // Volume control (0-100 in MPV)
        if (options.volume != null) {
          const mpvVolume = Math.max(0, Math.min(100, Math.round(options.volume * 100)));
          mpvArgs.push('--volume=' + mpvVolume.toString());
        }

        mpvArgs.push(videoPath);

        console.log('🎬 Starting MPV with DRM output and hardware acceleration');

        playerProcess = spawn(selectedPlayer, mpvArgs, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']  // Capture stderr to see errors
        });
        playerName = 'mpv';

        // Log MPV errors for debugging (filter out common warnings)
        if (playerProcess.stderr) {
          playerProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString().trim();
            // Filter out expected warnings about VT control
            if (errorMsg && !errorMsg.includes('VT control') && !errorMsg.includes('VT switcher')) {
              console.error('MPV stderr:', errorMsg);
            }
          });
        }

      } else if (selectedPlayer === 'cvlc' || selectedPlayer === 'vlc') {
        // VLC with MMAL hardware acceleration - Fallback for Pi 3B+
        // Note: VLC has DRM xlease issues when running as a service
        // Supports H.264, MPEG4 hardware decoding
        // Supports all common formats: MP4, AVI, MKV, MOV
        const vlcArgs = [
          '-I', 'dummy',                  // No interface (headless)
          '--fullscreen',                 // Fullscreen mode
          '--no-video-title-show',        // Don't show filename on screen
          '--no-osd',                     // No on-screen display
          '--aout=alsa',                  // Use ALSA for audio (not PulseAudio)
          '--alsa-audio-device=default',  // Default ALSA device
          '--play-and-exit'               // Exit after playback (for non-loop)
        ];

        // Loop option
        if (options.loop !== false) {
          vlcArgs.push('--loop');
        }

        // Volume control (0-256 in VLC, we use 0-100)
        if (options.volume != null) {
          const vlcVolume = Math.max(0, Math.min(256, Math.round(options.volume * 256)));
          vlcArgs.push('--volume', vlcVolume.toString());
        }

        // Let VLC auto-select the best video output. For Pi3 this is typically MMAL/FB/DRM depending on build.
        // We previously forced '--vout drm' which caused failures on some boots (DRM lease/xlease).
        // Removing the explicit vout improves reliability across reboots.
        // If needed, a specific vout can be supplied via options.vout ('drm' or 'fb').
        if (options.vout === 'drm') {
          vlcArgs.push('--vout', 'drm');
        } else if (options.vout === 'fb') {
          vlcArgs.push('--vout', 'fb', '--fbdev', '/dev/fb0');
        }

        vlcArgs.push(videoPath);

        console.log('🎬 Starting VLC (auto vout unless overridden) with hardware acceleration');

        playerProcess = spawn(selectedPlayer, vlcArgs, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']  // Capture stderr to see errors
        });
        playerName = 'vlc';

        // Log VLC errors for debugging
        if (playerProcess.stderr) {
          playerProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString().trim();
            if (errorMsg && !errorMsg.includes('dummy interface') && !errorMsg.includes('dbus')) {
              console.error('VLC stderr:', errorMsg);
            }
          });
        }

      } else {
        throw new Error(`Unsupported video player: ${selectedPlayer}. MPV or VLC is required.`);
      }

      // Track process for cleanup
      const processId = `video-${Date.now()}`;
      this.activeProcesses.set(processId, playerProcess);

      // Handle process events
      playerProcess.on('spawn', () => {
        console.log(`🎬 Video playback started: ${filename} (${playerName})`);
        this.playbackStatus.video = {
          playing: true,
          file: filename,
          process: playerProcess,
          player: playerName,
          processId: processId,
          startTime: Date.now()
        };
      });

      playerProcess.on('exit', (code, signal) => {
        console.log(`🎬 Video playback ended: ${filename} (exit code: ${code})`);
        this.activeProcesses.delete(processId);
        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          player: null,
          processId: null
        };
      });

      playerProcess.on('error', (error) => {
        console.error(`❌ ${playerName} error for ${filename}:`, error);
        this.activeProcesses.delete(processId);
        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          player: null,
          processId: null
        };
      });

      return {
        success: true,
        message: `Started playing video: ${filename}`,
        filename: filename,
        player: playerName,
        options: options
      };

    } catch (error) {
      console.error('❌ Video playback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop video playback
   */
  async stopVideo() {
    try {
      if (this.playbackStatus.video.playing && this.playbackStatus.video.process) {
        const process = this.playbackStatus.video.process;
        const processId = this.playbackStatus.video.processId;

        console.log(`🛑 Stopping video: ${this.playbackStatus.video.file}`);

        try {
          process.kill('SIGTERM');

          // Wait a bit, then force kill if still running
          setTimeout(() => {
            try {
              process.kill('SIGKILL');
            } catch (e) {
              // Process already dead, ignore
            }
          }, 1000);

        } catch (error) {
          console.warn('⚠️  Error killing video process:', error.message);
        }

        // Clean up
        if (processId) {
          this.activeProcesses.delete(processId);
        }

        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          player: null,
          processId: null
        };
      }

      return { success: true };

    } catch (error) {
      console.error('❌ Stop video error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop all playback (video and audio)
   */
  async stopAll() {
    console.log('🛑 Stopping all playback');

    // Stop video
    await this.stopVideo();

    // Stop all audio
    for (const [audioId, audioProcess] of this.playbackStatus.audio.processes.entries()) {
      try {
        audioProcess.kill('SIGTERM');
        setTimeout(() => {
          try {
            audioProcess.kill('SIGKILL');
          } catch (e) {
            // Already dead
          }
        }, 500);
      } catch (error) {
        console.warn(`⚠️  Error killing audio process ${audioId}:`, error.message);
      }
    }

    // Clear all active processes
    for (const [processId, process] of this.activeProcesses.entries()) {
      try {
        process.kill('SIGTERM');
        setTimeout(() => {
          try {
            process.kill('SIGKILL');
          } catch (e) {
            // Already dead
          }
        }, 500);
      } catch (error) {
        console.warn(`⚠️  Error killing process ${processId}:`, error.message);
      }
    }

    this.activeProcesses.clear();
    this.playbackStatus.audio.playing = [];
    this.playbackStatus.audio.processes.clear();

    return { success: true };
  }

  /**
   * Get current playback status
   */
  getStatus() {
    return {
      video: {
        playing: this.playbackStatus.video.playing,
        file: this.playbackStatus.video.file,
        player: this.playbackStatus.video.player,
        uptime: this.playbackStatus.video.startTime
          ? Math.floor((Date.now() - this.playbackStatus.video.startTime) / 1000)
          : 0
      },
      audio: {
        playing: this.playbackStatus.audio.playing,
        count: this.playbackStatus.audio.processes.size
      },
      activeProcesses: this.activeProcesses.size,
      videoPlayer: this.videoPlayer
    };
  }

  /**
   * Alias for getStatus() for compatibility
   */
  getPlaybackStatus() {
    return this.getStatus();
  }
}

module.exports = MediaPlayer;

