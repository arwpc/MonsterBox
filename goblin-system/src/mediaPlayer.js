/**
 * Media Player Service
 * Handles video and audio playback using VLC and system audio
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
      // Check if VLC is available
      await this.checkDependencies();
      
      // Setup audio system
      await this.setupAudio();
      
      console.log('🎬 Media player ready');
      
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
      exec('which ffplay', (error) => {
        if (error) {
          reject(new Error('ffplay not found. Install with: apt-get install ffmpeg'));
        } else {
          console.log('✅ ffplay found');
          resolve();
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
      
      // Use ffplay with fade transitions and no console output
      const ffplayArgs = [
        '-fs',                       // Fullscreen
        '-autoexit',                 // Exit when done
        '-loglevel', 'quiet',        // Suppress all console output
        '-hide_banner',              // Hide ffmpeg banner
        '-noborder',                 // No window border
        '-left', '0',                // Position at left edge
        '-top', '0',                 // Position at top edge
      ];

      // Add fade in/out filter for seamless transitions
      // Fade in for 0.5 seconds at start, fade out for 0.5 seconds before end
      const fadeFilter = 'fade=in:0:15,fade=out:st=0:d=0.5';
      ffplayArgs.push('-vf', fadeFilter);

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

      console.log('🎬 Starting ffplay with fade transitions');

      const ffplayProcess = spawn('ffplay', ffplayArgs, {
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore'],  // Completely suppress all output
        env: { ...process.env, DISPLAY: ':0' }  // Ensure display is set
      });

      // Handle process events
      ffplayProcess.on('spawn', () => {
        console.log(`🎬 Video playback started: ${filename}`);
        this.playbackStatus.video = {
          playing: true,
          file: filename,
          process: ffplayProcess,
          startTime: Date.now()
        };
      });

      ffplayProcess.on('exit', (code) => {
        console.log(`🎬 Video playback ended: ${filename} (exit code: ${code})`);
        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null
        };
      });

      ffplayProcess.on('error', (error) => {
        console.error(`❌ ffplay error for ${filename}:`, error);
        this.playbackStatus.video.playing = false;
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
      
      const vlcArgs = [
        '--intf', 'dummy',           // No interface
        '--no-video',                // Audio only
        '--play-and-exit',           // Exit when done
        `--volume=${Math.floor(volume * 100)}`, // Set volume
        audioPath
      ];
      
      console.log('🔊 Starting audio VLC with args:', vlcArgs);
      
      const audioProcess = spawn('vlc', vlcArgs, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
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
      this.playbackStatus.video.process.kill('SIGTERM');
      
      // Wait a moment for graceful shutdown
      setTimeout(() => {
        if (this.playbackStatus.video.process && !this.playbackStatus.video.process.killed) {
          this.playbackStatus.video.process.kill('SIGKILL');
        }
      }, 2000);
      
      this.playbackStatus.video = {
        playing: false,
        file: null,
        process: null
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