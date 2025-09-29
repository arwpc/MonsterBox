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
      exec('which vlc', (error) => {
        if (error) {
          reject(new Error('VLC media player not found. Install with: apt-get install vlc'));
        } else {
          console.log('✅ VLC media player found');
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
      
      const videoPath = path.join('/app/media/video', filename);
      
      // Check if file exists
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`Video file not found: ${filename}`);
      }
      
      const vlcArgs = [
        '--intf', 'dummy',           // No interface
        '--no-video-title-show',     // Don't show title
        '--fullscreen',              // Fullscreen mode
        '--no-osd',                  // No on-screen display
        videoPath
      ];
      
      // Add loop option if specified
      if (options.loop) {
        vlcArgs.push('--loop');
      }
      
      // Add quit option if not looping
      if (!options.loop) {
        vlcArgs.push('--play-and-exit');
      }
      
      console.log('🎬 Starting VLC with args:', vlcArgs);
      
      const vlcProcess = spawn('vlc', vlcArgs, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Handle process events
      vlcProcess.on('spawn', () => {
        console.log(`🎬 Video playback started: ${filename}`);
        this.playbackStatus.video = {
          playing: true,
          file: filename,
          process: vlcProcess,
          startTime: Date.now()
        };
      });
      
      vlcProcess.on('exit', (code) => {
        console.log(`🎬 Video playback ended: ${filename} (exit code: ${code})`);
        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null
        };
      });
      
      vlcProcess.on('error', (error) => {
        console.error(`❌ VLC error for ${filename}:`, error);
        this.playbackStatus.video.playing = false;
      });
      
      // Log VLC output for debugging
      vlcProcess.stdout.on('data', (data) => {
        console.log(`VLC: ${data.toString().trim()}`);
      });
      
      vlcProcess.stderr.on('data', (data) => {
        console.log(`VLC: ${data.toString().trim()}`);
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
      
      const audioPath = path.join('/app/media/audio', filename);
      
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