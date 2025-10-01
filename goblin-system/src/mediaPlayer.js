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
      video: { playing: false, file: null, process: null, player: null },
      audio: { playing: [], processes: new Map() }
    };
    this.videoPlayer = 'vlc';
    this.mediaDirCache = {};
    
    console.log(`🎬 Media player initialized for Goblin ${this.goblin.goblinId}`);
  }

  /**
   * Initialize media player
   */
  async initialize() {
    try {
      // Check if generic video backends are available
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
      const forceVlc = process.env.FORCE_VLC === '1';
      const forceFfplay = process.env.FORCE_FFPLAY === '1';

      const searchOrder = forceVlc
        ? ['vlc']
        : forceFfplay
          ? ['ffplay', 'vlc']
          : ['ffplay', 'omxplayer', 'vlc'];

      const tryNext = (index) => {
        if (index >= searchOrder.length) {
          reject(new Error('No supported video player found (checked ffplay, omxplayer, vlc)'));
          return;
        }

        const candidate = searchOrder[index];
        exec(`which ${candidate}`, (err) => {
          if (!err) {
            this.videoPlayer = candidate;
            switch (candidate) {
              case 'ffplay':
                console.log('✅ ffplay found; using FFmpeg playback pipeline');
                break;
              case 'omxplayer':
                console.log('✅ omxplayer found; using legacy Raspberry Pi playback pipeline');
                break;
              default:
                console.log('✅ VLC media player found');
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

  async getMediaDir(type) {
    if (!type) throw new Error('Media type is required');

    if (this.goblin && this.goblin.fileManager && this.goblin.fileManager.mediaPaths && this.goblin.fileManager.mediaPaths[type]) {
      return this.goblin.fileManager.mediaPaths[type];
    }

    if (this.mediaDirCache[type]) {
      return this.mediaDirCache[type];
    }

    const candidates = [
      path.join(__dirname, 'media', type),
      path.join(__dirname, '..', 'media', type)
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        this.mediaDirCache[type] = candidate;
        return candidate;
      } catch (_) {
        // try next candidate
      }
    }

    const fallback = candidates[candidates.length - 1];
    this.mediaDirCache[type] = fallback;
    return fallback;
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
      
  const videoDir = await this.getMediaDir('video');
  const videoPath = path.join(videoDir, filename);
      
      // Check if file exists
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`Video file not found: ${filename}`);
      }
      
      let playerProcess;
      let playerName;
      const selectedPlayer = (options.player || this.videoPlayer || 'vlc').toLowerCase();

      if (selectedPlayer === 'ffplay') {
        const ffplayArgs = [
          '-fs',
          '-loglevel', options.ffplayLogLevel || process.env.MB_FFPLAY_LOGLEVEL || 'error'
        ];

        // Force 1080p output to avoid Pi color bars
        const scaleFilter = options.scaleFilter || 'scale=1920:1080';
        if (scaleFilter) {
          ffplayArgs.push('-vf', scaleFilter);
        }

        if (options.loop) {
          ffplayArgs.push('-loop', typeof options.loop === 'number' ? String(options.loop) : '0');
        } else {
          ffplayArgs.push('-autoexit');
        }

        if (typeof options.volume === 'number') {
          ffplayArgs.push('-volume', Math.max(0, Math.min(100, Math.round(options.volume * 100))));
        }

        if (typeof options.startTime === 'number') {
          ffplayArgs.push('-ss', String(options.startTime));
        }

        // Reduce latency by dropping initial frames if requested
        if (options.probeSize) {
          ffplayArgs.push('-probesize', String(options.probeSize));
        }

        if (options.analyseDuration) {
          ffplayArgs.push('-analyzeduration', String(options.analyseDuration));
        }

        ffplayArgs.push(videoPath);

        console.log('🎬 Starting ffplay with args:', ffplayArgs);

        const ffplayEnv = { ...process.env };
        if (!ffplayEnv.DISPLAY) {
          ffplayEnv.DISPLAY = options.display || ':0.0';
        }

        playerProcess = spawn('ffplay', ffplayArgs, {
          detached: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: ffplayEnv
        });
        playerName = 'ffplay';
      } else if (selectedPlayer === 'omxplayer') {
        const omxArgs = [
          '--no-osd',
          '--display', options.display || 'hdmi'
        ];

        if (options.loop) {
          omxArgs.push('--loop');
        }

        if (options.volume != null) {
          omxArgs.push('--vol', String(Math.round(options.volume * 3000 - 6000))); // omxplayer expects millibel
        }

        omxArgs.push(videoPath);

        console.log('🎬 Starting omxplayer with args:', omxArgs);

        playerProcess = spawn('omxplayer', omxArgs, {
          detached: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        playerName = 'omxplayer';
      } else {
        const vlcArgs = [
          '--intf', 'dummy',           // No interface
          '--no-video-title-show',     // Don't show title
          '--fullscreen',              // Fullscreen mode
          '--no-osd',                  // No on-screen display
          videoPath
        ];

        if (options.loop) {
          vlcArgs.push('--loop');
        }

        if (!options.loop) {
          vlcArgs.push('--play-and-exit');
        }

        if (options.volume != null) {
          vlcArgs.push(`--volume=${Math.max(0, Math.min(512, Math.round(options.volume * 256)))}`);
        }

        console.log('🎬 Starting VLC with args:', vlcArgs);

        playerProcess = spawn('vlc', vlcArgs, {
          detached: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        playerName = 'vlc';
      }
      
      // Handle process events
      playerProcess.on('spawn', () => {
        console.log(`🎬 Video playback started via ${playerName}: ${filename}`);
        this.playbackStatus.video = {
          playing: true,
          file: filename,
          process: playerProcess,
          player: playerName,
          startTime: Date.now()
        };
      });
      
      playerProcess.on('exit', (code) => {
        console.log(`🎬 Video playback ended: ${filename} (exit code: ${code})`);
        this.playbackStatus.video = {
          playing: false,
          file: null,
          process: null,
          player: null
        };
      });
      
      playerProcess.on('error', (error) => {
        console.error(`❌ ${playerName.toUpperCase()} error for ${filename}:`, error);
        this.playbackStatus.video.playing = false;
      });
      
      // Log VLC output for debugging
      playerProcess.stdout.on('data', (data) => {
        console.log(`${playerName.toUpperCase()}: ${data.toString().trim()}`);
      });
      
      playerProcess.stderr.on('data', (data) => {
        console.log(`${playerName.toUpperCase()}: ${data.toString().trim()}`);
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
   * Play audio file
   */
  async playAudio(filename, options = {}) {
    try {
      console.log(`🔊 Playing audio: ${filename}`);
      
  const audioDir = await this.getMediaDir('audio');
  const audioPath = path.join(audioDir, filename);
      
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

      const player = (this.playbackStatus.video.player || this.videoPlayer || '').toLowerCase();
      const processRef = this.playbackStatus.video.process;

      if (processRef.stdin && (player === 'omxplayer' || player === 'ffplay')) {
        try {
          processRef.stdin.write('q');
        } catch (error) {
          console.warn(`⚠️ Failed to send quit command to ${player}, using SIGTERM instead:`, error.message);
          processRef.kill('SIGTERM');
        }
      } else {
        processRef.kill('SIGTERM');
      }
      
      // Wait a moment for graceful shutdown
      setTimeout(() => {
        if (processRef && !processRef.killed) {
          try {
            processRef.kill('SIGKILL');
          } catch (_) { /* ignore */ }
        }
      }, 2000);
      
      this.playbackStatus.video = {
        playing: false,
        file: null,
        process: null,
        player: null
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
        player: this.playbackStatus.video.player,
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
      const player = (this.videoPlayer || 'vlc').toLowerCase();
      const args = player === 'ffplay'
        ? ['-version']
        : player === 'omxplayer'
          ? ['-h']
          : ['--help'];

      let testProcess;
      try {
        testProcess = spawn(player, args, { stdio: 'pipe' });
      } catch (error) {
        resolve({
          available: false,
          error: `${player} spawn failed: ${error.message}`
        });
        return;
      }

      const capability = player === 'ffplay' ? '1080p@60fps' : '4K@30fps';

      testProcess.on('exit', (code) => {
        resolve({
          available: code === 0,
          player,
          formats: ['mp4', 'avi', 'mkv', 'mov', 'webm'],
          maxResolution: capability
        });
      });

      testProcess.on('error', (error) => {
        resolve({
          available: false,
          error: `${player} not available: ${error.message}`
        });
      });

      setTimeout(() => {
        try { testProcess.kill(); } catch (_) { /* ignore */ }
      }, 3000);
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