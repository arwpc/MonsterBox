/**
 * Media Player Service - OPTIMIZED FOR RASPBERRY PI 3B+
 * Handles video and audio playback using mpv with hardware acceleration
 * 
 * TARGET: Smooth 720p@60fps playback on Pi3 with minimal CPU usage
 * PLAYER: mpv (primary), ffmpeg (fallback), omxplayer (legacy fallback)
 * 
 * Based on GOBLIN GOLD system (commit 21713404) which had proven reliability
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
      // Prefer mpv for best hardware acceleration on Pi3
      // Then ffmpeg with h264_v4l2m2m, then omxplayer (legacy)
      const searchOrder = ['mpv', 'ffmpeg', 'omxplayer', 'ffplay', 'vlc'];

      const tryNext = (index) => {
        if (index >= searchOrder.length) {
          reject(new Error('No supported video player found (checked mpv, ffmpeg, omxplayer, ffplay, vlc)'));
          return;
        }

        const candidate = searchOrder[index];
        exec(`which ${candidate}`, (err) => {
          if (!err) {
            this.videoPlayer = candidate;
            switch (candidate) {
              case 'mpv':
                console.log('✅ mpv found - using hardware-accelerated playback (BEST for Pi3)');
                break;
              case 'ffmpeg':
                console.log('✅ ffmpeg found - using h264_v4l2m2m hardware decoder');
                break;
              case 'omxplayer':
                console.log('✅ omxplayer found - using legacy Pi hardware decoder');
                break;
              case 'ffplay':
                console.log('⚠️  ffplay found - software decoding (may be choppy)');
                break;
              case 'vlc':
                console.log('⚠️  VLC found - software decoding (may be choppy)');
                break;
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
        // mpv with hardware acceleration - BEST for Pi 3B+
        // Uses DRM/KMS for direct rendering (no X11 overhead)
        // Hardware H.264 decoding via V4L2 M2M
        const mpvArgs = [
          '--fullscreen',                 // Fullscreen mode
          '--no-osc',                     // No on-screen controller
          '--no-osd-bar',                 // No OSD bar
          '--no-terminal',                // No terminal output
          '--really-quiet',               // Suppress all console output
          '--hwdec=auto',                 // Hardware decoding (V4L2 M2M on Pi3)
          '--vo=gpu',                     // GPU video output
          '--gpu-context=drm',            // Direct rendering via DRM (no X11)
          '--drm-connector=HDMI-A-1',     // HDMI output
          '--drm-mode=1280x720@60',       // 720p @ 60fps (optimal for Pi3)
          '--vf=scale=1280:720',          // Scale to 720p
          '--video-sync=display-resample', // Smooth playback
          '--interpolation',              // Frame interpolation
          '--tscale=oversample',          // Temporal scaling
          '--cache=yes',                  // Enable cache
          '--cache-secs=10',              // 10 second cache
          '--audio-device=alsa',          // ALSA audio
          '--audio-channels=stereo'       // Stereo output
        ];

        // Loop option
        if (options.loop !== false) {
          mpvArgs.push('--loop=inf');
        }

        // Volume control
        if (options.volume != null) {
          mpvArgs.push(`--volume=${Math.max(0, Math.min(100, Math.round(options.volume * 100)))}`);
        }

        mpvArgs.push(videoPath);

        console.log('🎬 Starting mpv with hardware acceleration (720p@60fps, DRM/KMS)');

        playerProcess = spawn('mpv', mpvArgs, {
          detached: false,
          stdio: ['ignore', 'ignore', 'ignore']
        });
        playerName = 'mpv';

      } else if (selectedPlayer === 'ffmpeg') {
        // ffmpeg with hardware H.264 decoder
        // Uses h264_v4l2m2m for GPU decoding
        const ffmpegArgs = [
          '-loglevel', 'quiet',
          '-c:v', 'h264_v4l2m2m',         // Hardware H.264 decoder
          '-stream_loop', (options.loop !== false) ? '-1' : '0',
          '-i', videoPath,
          '-vf', 'scale=1280:720',        // Scale to 720p
          '-pix_fmt', 'nv12',             // NV12 format (hardware friendly)
          '-f', 'fbdev',                  // Framebuffer output
          '/dev/fb0'                      // HDMI output
        ];

        console.log('🎬 Starting ffmpeg with h264_v4l2m2m hardware decoder (720p)');

        playerProcess = spawn('ffmpeg', ffmpegArgs, {
          detached: false,
          stdio: ['ignore', 'ignore', 'ignore']
        });
        playerName = 'ffmpeg';

      } else if (selectedPlayer === 'omxplayer') {
        // omxplayer - legacy Pi hardware player
        const omxArgs = [
          '--no-osd',
          '--display', 'hdmi',
          '--blank'
        ];

        if (options.loop !== false) {
          omxArgs.push('--loop');
        }

        if (options.volume != null) {
          omxArgs.push('--vol', String(Math.round(options.volume * 3000 - 6000)));
        }

        omxArgs.push(videoPath);

        console.log('🎬 Starting omxplayer (legacy Pi hardware player)');

        playerProcess = spawn('omxplayer', omxArgs, {
          detached: false,
          stdio: ['ignore', 'ignore', 'ignore']
        });
        playerName = 'omxplayer';

      } else {
        // Fallback to ffplay or vlc (software decoding - may be choppy)
        console.warn('⚠️  Using software player - may be choppy on Pi3');

        const ffplayArgs = [
          '-fs',
          '-autoexit',
          '-loglevel', 'quiet',
          '-hide_banner',
          '-noborder',
          '-vf', 'scale=1280:720,fps=60'
        ];

        if (options.loop) {
          ffplayArgs.push('-loop', '0');
        }

        ffplayArgs.push(videoPath);

        playerProcess = spawn(selectedPlayer, ffplayArgs, {
          detached: false,
          stdio: ['ignore', 'ignore', 'ignore'],
          env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        });
        playerName = selectedPlayer;
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
}

module.exports = MediaPlayer;

