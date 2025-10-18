/**
 * Media Player Service
 * Handles video and audio playback using ffplay (from ffmpeg suite)
 *
 * IMPORTANT: All videos are automatically scaled to 720p@60Hz for Raspberry Pi 3B+ compatibility
 * ffplay handles real-time transcoding, so no pre-conversion is needed
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class MediaPlayer {
  constructor(goblinServer) {
    this.goblin = goblinServer;
    this.activeProcesses = new Map();
    this.playbackStatus = {
      video: { playing: false, file: null, process: null },
      audio: { playing: [], processes: new Map() }
    };

    console.log(`🎬 Media player initialized for Goblin ${this.goblin.goblinId}`);
  }

  /**
   * Initialize media player
   */
  async initialize() {
    try {
      // Check if ffplay is available
      await this.checkDependencies();

      // Setup audio system
      await this.setupAudio();

      console.log('🎬 Media player ready (using ffplay)');

    } catch (error) {
      console.error('❌ Media player initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check required dependencies
   */
  async checkDependencies() {
    return new Promise((resolve, reject) => {
      exec('which ffplay', (error, stdout) => {
        if (error) {
          reject(new Error('ffplay not found. Install with: apt-get install ffmpeg'));
        } else {
          console.log('✅ ffplay found at:', stdout.trim());

          // Verify ffplay version
          exec('ffplay -version', (err, version) => {
            if (!err) {
              const versionLine = version.split('\n')[0];
              console.log('✅ ffplay version:', versionLine);
            }
            resolve();
          });
        }
      });
    });
  }

  /**
   * Setup audio system
   */
  async setupAudio() {
    return new Promise((resolve) => {
      // Set audio output to HDMI (for Pi connected to TV)
      exec('amixer cset numid=3 2', (error) => {
        if (error) {
          console.warn('⚠️ Could not set HDMI audio output:', error.message);
        } else {
          console.log('🔊 Audio output set to HDMI');
        }
        
        // Set volume to 80%
        exec('amixer set PCM 80%', (volumeError) => {
          if (volumeError) {
            console.warn('⚠️ Could not set volume:', volumeError.message);
          } else {
            console.log('🔊 Volume set to 80%');
          }
          resolve();
        });
      });
    });
  }

  /**
   * Play video file
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
      
      // Use ffplay with real-time scaling to 720p@60Hz and fade transitions
      // This ensures ALL videos play at the correct resolution regardless of source
      const ffplayArgs = [
        '-fs',                       // Fullscreen
        '-autoexit',                 // Exit when done
        '-loglevel', 'quiet',        // Suppress all console output
        '-hide_banner',              // Hide ffmpeg banner
        '-noborder',                 // No window border
        '-left', '0',                // Position at left edge
        '-top', '0',                 // Position at top edge
        '-x', '1280',                // Force width to 1280 (720p)
        '-y', '720',                 // Force height to 720
      ];

      // Build video filter chain:
      // 1. Scale to 720p (1280x720) maintaining aspect ratio
      // 2. Pad to exact 720p if needed (black bars)
      // 3. Set output framerate to 60fps
      // 4. Add fade in at start (fade out handled by queue manager between videos)
      const videoFilters = [
        'scale=1280:720:force_original_aspect_ratio=decrease',  // Scale down to fit 720p
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2',                     // Center with black bars if needed
        'fps=60',                                                 // Force 60fps output
        'fade=in:0:15'                                           // Fade in (15 frames = 0.25s at 60fps)
      ].join(',');

      ffplayArgs.push('-vf', videoFilters);

      // Add loop option if specified
      if (options.loop) {
        ffplayArgs.push('-loop', '0');  // Loop forever
      }

      // Disable audio if not needed (can be controlled via options)
      if (options.noAudio) {
        ffplayArgs.push('-an');
      }

      // Add the video file
      ffplayArgs.push(videoPath);

      console.log('🎬 Starting ffplay with 720p@60Hz transcoding');

      // Ensure DISPLAY is set for X11
      const displayEnv = process.env.DISPLAY || ':0';

      const ffplayProcess = spawn('ffplay', ffplayArgs, {
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore'],  // Completely suppress all output
        env: { ...process.env, DISPLAY: displayEnv }
      });

      // Track process for cleanup
      const processId = `video-${Date.now()}`;
      this.activeProcesses.set(processId, ffplayProcess);

      // Handle process events
      ffplayProcess.on('spawn', () => {
        console.log(`🎬 Video playback started: ${filename}`);
        this.playbackStatus.video = {
          playing: true,
          file: filename,
          process: ffplayProcess,
          processId: processId,
          startTime: Date.now()
        };
      });

      ffplayProcess.on('exit', (code, signal) => {
        console.log(`🎬 Video playback ended: ${filename} (exit code: ${code}, signal: ${signal})`);

        // Clean up process tracking
        this.activeProcesses.delete(processId);

        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          processId: null
        };
      });

      ffplayProcess.on('error', (error) => {
        console.error(`❌ ffplay error for ${filename}:`, error);

        // Clean up on error
        this.activeProcesses.delete(processId);

        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          processId: null
        };
      });
      
      return {
        success: true,
        message: `Started playing video: ${filename}`,
        filename: filename,
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
   * Play audio file
   */
  async playAudio(filename, options = {}) {
    try {
      console.log(`🔊 Playing audio: ${filename}`);
      
      const audioPath = path.join(__dirname, '..', 'media', 'audio', filename);
      
      // Check if file exists
      try {
        await fs.access(audioPath);
      } catch {
        throw new Error(`Audio file not found: ${filename}`);
      }
      
      const volume = options.volume || 0.8;
      const audioId = `audio-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Use ffplay for audio playback (consistent with video)
      const ffplayArgs = [
        '-nodisp',                   // No video display
        '-autoexit',                 // Exit when done
        '-loglevel', 'quiet',        // Suppress console output
        '-hide_banner',              // Hide banner
        '-volume', Math.floor(volume * 100).toString(), // Set volume (0-100)
        audioPath
      ];

      console.log('🔊 Starting audio playback with ffplay');

      const audioProcess = spawn('ffplay', ffplayArgs, {
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore']  // Suppress all output
      });
      
      // Handle process events
      audioProcess.on('spawn', () => {
        console.log(`🔊 Audio playback started: ${filename}`);
        this.playbackStatus.audio.playing.push({
          id: audioId,
          filename: filename,
          startTime: Date.now(),
          volume: volume
        });
        this.playbackStatus.audio.processes.set(audioId, audioProcess);
      });
      
      audioProcess.on('exit', (code) => {
        console.log(`🔊 Audio playback ended: ${filename} (exit code: ${code})`);
        this.playbackStatus.audio.playing = this.playbackStatus.audio.playing.filter(a => a.id !== audioId);
        this.playbackStatus.audio.processes.delete(audioId);
      });
      
      audioProcess.on('error', (error) => {
        console.error(`❌ Audio VLC error for ${filename}:`, error);
        this.playbackStatus.audio.playing = this.playbackStatus.audio.playing.filter(a => a.id !== audioId);
        this.playbackStatus.audio.processes.delete(audioId);
      });
      
      return {
        success: true,
        message: `Started playing audio: ${filename}`,
        filename: filename,
        audioId: audioId,
        options: options
      };
      
    } catch (error) {
      console.error('❌ Audio playback error:', error);
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
    if (this.playbackStatus.video.playing && this.playbackStatus.video.process) {
      console.log('⏹️ Stopping video playback');

      const processId = this.playbackStatus.video.processId;
      const process = this.playbackStatus.video.process;

      try {
        process.kill('SIGTERM');

        // Wait a moment for graceful shutdown, then force kill if needed
        setTimeout(() => {
          if (process && !process.killed) {
            console.warn('⚠️ Force killing video process');
            process.kill('SIGKILL');
          }
        }, 2000);

      } catch (error) {
        console.warn('⚠️ Error stopping video:', error.message);
      }

      // Clean up process tracking
      if (processId) {
        this.activeProcesses.delete(processId);
      }

      this.playbackStatus.video = {
        playing: false,
        file: null,
        process: null,
        processId: null
      };

      return { success: true, message: 'Video playback stopped' };
    }

    return { success: true, message: 'No video playing' };
  }

  /**
   * Stop all audio playback
   */
  async stopAllAudio() {
    console.log(`⏹️ Stopping ${this.playbackStatus.audio.playing.length} audio streams`);
    
    for (const [audioId, process] of this.playbackStatus.audio.processes) {
      try {
        process.kill('SIGTERM');
        
        // Force kill if needed
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 1000);
        
      } catch (error) {
        console.warn(`⚠️ Error stopping audio ${audioId}:`, error.message);
      }
    }
    
    this.playbackStatus.audio = {
      playing: [],
      processes: new Map()
    };
    
    return { success: true, message: 'All audio playback stopped' };
  }

  /**
   * Stop all playback
   */
  async stopAll() {
    console.log('⏹️ Stopping all media playback');

    const videoResult = await this.stopVideo();
    const audioResult = await this.stopAllAudio();

    // Clean up any orphaned processes
    for (const [processId, process] of this.activeProcesses) {
      try {
        if (process && !process.killed) {
          console.warn(`⚠️ Cleaning up orphaned process: ${processId}`);
          process.kill('SIGTERM');
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      } catch (error) {
        console.warn(`⚠️ Error cleaning up process ${processId}:`, error.message);
      }
    }

    // Clear all process tracking
    this.activeProcesses.clear();

    return {
      success: true,
      message: 'All playback stopped',
      video: videoResult,
      audio: audioResult
    };
  }

  /**
   * Get current playback status
   */
  getPlaybackStatus() {
    return {
      video: {
        playing: this.playbackStatus.video.playing,
        file: this.playbackStatus.video.file,
        startTime: this.playbackStatus.video.startTime
      },
      audio: {
        count: this.playbackStatus.audio.playing.length,
        streams: this.playbackStatus.audio.playing.map(a => ({
          id: a.id,
          filename: a.filename,
          startTime: a.startTime,
          volume: a.volume
        }))
      }
    };
  }

  /**
   * Test media playback capability
   */
  async testPlayback() {
    try {
      console.log('🧪 Testing media playback capability...');
      
      // Test video capability
      const testVideoResult = await this.testVideo();
      
      // Test audio capability  
      const testAudioResult = await this.testAudio();
      
      return {
        success: true,
        video: testVideoResult,
        audio: testAudioResult
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test video playback
   */
  async testVideo() {
    return new Promise((resolve) => {
      // Test VLC video capability
      const testProcess = spawn('vlc', ['--help'], { stdio: 'pipe' });
      
      testProcess.on('exit', (code) => {
        resolve({
          available: code === 0,
          formats: ['mp4', 'avi', 'mkv', 'mov', 'webm'],
          maxResolution: '4K@30fps'
        });
      });
      
      testProcess.on('error', () => {
        resolve({
          available: false,
          error: 'VLC not available'
        });
      });
      
      setTimeout(() => testProcess.kill(), 3000);
    });
  }

  /**
   * Test audio playback
   */
  async testAudio() {
    return new Promise((resolve) => {
      // Test ALSA audio
      exec('aplay --help', (error) => {
        resolve({
          available: !error,
          formats: ['wav', 'mp3', 'aac', 'ogg', 'flac'],
          concurrentStreams: true,
          output: 'HDMI'
        });
      });
    });
  }
}

module.exports = MediaPlayer;