#!/usr/bin/env node

/**
 * MonsterBox Goblin Server
 * Lightweight media playback node with auto-discovery and remote control
 */

const express = require('express');
const { WebSocket } = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// Import Goblin modules
const BeaconService = require('./beacon');
const MediaPlayer = require('./mediaPlayer');
const StatusMonitor = require('./statusMonitor');
const FileManager = require('./fileManager');

class GoblinServer {
  constructor() {
    this.goblinId = process.env.GOBLIN_ID || this.generateGoblinId();
    this.port = process.env.GOBLIN_PORT || 3001;
    this.monsterboxHost = null;
    this.monsterboxConnection = null;
    this.isConnected = false;
    this.monsterboxEndpoint = process.env.MONSTERBOX_ENDPOINT || 'http://192.168.8.200:3000';
    this.heartbeatInterval = null;

    // Default settings
    this.settings = {
      videoDirectory: '/home/remote/goblin/media/video',
      framerate: 60,
      resolution: '1280x720'
    };

    // Load persisted settings if available
    try {
      const settingsPath = path.join('/home/remote/goblin', 'config', 'settings.json');
      const raw = require('fs').readFileSync(settingsPath, 'utf8');
      const persisted = JSON.parse(raw);
      this.settings = { ...this.settings, ...persisted };
      console.log('⚙️ Loaded persisted settings from', settingsPath, this.settings);
    } catch (e) {
      // No persisted settings yet; safe to continue with defaults
    }

    // Initialize components
    this.app = express();
    this.beacon = new BeaconService(this);
    this.mediaPlayer = new MediaPlayer(this);
    this.statusMonitor = new StatusMonitor(this);
    this.fileManager = new FileManager(this);

    // Bind methods
    this.handleMonsterBoxConnection = this.handleMonsterBoxConnection.bind(this);
    this.handleMonsterBoxMessage = this.handleMonsterBoxMessage.bind(this);
    this.handleConnectionLost = this.handleConnectionLost.bind(this);

    console.log(`🎃 MonsterBox Goblin ${this.goblinId} initializing...`);
  }

  /**
   * Generate unique Goblin ID
   */
  generateGoblinId() {
    const hostname = process.env.HOSTNAME || 'unknown';
    const random = Math.random().toString(36).substring(2, 8);
    return `goblin-${hostname}-${random}`;
  }

  /**
   * Initialize and start the Goblin server
   */
  async start() {
    try {
      // Setup Express middleware
      this.setupExpress();
      
      // Setup API routes
      this.setupRoutes();
      
      // Start HTTP server
      this.server = this.app.listen(this.port, () => {
        console.log(`👹 Goblin ${this.goblinId} listening on port ${this.port}`);
      });
      
      // Initialize components
      await this.mediaPlayer.initialize();
      await this.statusMonitor.start();
      await this.fileManager.initialize();
      
      // Start beacon to find MonsterBox
      console.log(`🔍 Starting network beacon to find MonsterBox...`);
      this.beacon.start();

      // Start HTTP heartbeat to MonsterBox
      this.startHeartbeat();

      console.log(`✅ Goblin ${this.goblinId} ready for haunting! 👻`);

    } catch (error) {
      console.error('❌ Failed to start Goblin:', error);
      process.exit(1);
    }
  }

  /**
   * Setup Express middleware
   */
  setupExpress() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '100mb' })); // Increased for video deployment
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📡 ${req.method} ${req.path} from ${req.ip}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        goblinId: this.goblinId,
        connected: this.isConnected,
        monsterbox: this.monsterboxHost,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Goblin info
    this.app.get('/info', (req, res) => {
      res.json({
        goblinId: this.goblinId,
        version: require('./package.json').version,
        capabilities: {
          video: ['mp4', 'avi', 'mkv', 'mov'],
          audio: ['mp3', 'wav', 'aac', 'ogg'],
          maxResolution: '4K@30fps',
          concurrentAudio: true
        },
        hardware: this.statusMonitor.getHardwareInfo(),
        status: this.statusMonitor.getStatus(),
        mediaFiles: this.fileManager.getMediaList()
      });
    });

    // Media playback control
    this.app.post('/play-video', async (req, res) => {
      try {
        const { filename, loop = false } = req.body;
        const result = await this.mediaPlayer.playVideo(filename, { loop });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/play-audio', async (req, res) => {
      try {
        const { filename, volume = 0.8 } = req.body;
        const result = await this.mediaPlayer.playAudio(filename, { volume });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/stop-all', async (req, res) => {
      try {
        const result = await this.mediaPlayer.stopAll();
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Media file management
    this.app.get('/media', async (req, res) => {
      res.json({
        success: true,
        media: await this.fileManager.getMediaList()
      });
    });

    // Force rescan of media files
    this.app.post('/media/rescan', async (req, res) => {
      try {
        const media = await this.fileManager.rescanMedia();
        res.json({
          success: true,
          message: 'Media library rescanned',
          media: media,
          counts: {
            video: media.video.length,
            audio: media.audio.length
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/media/:filename', async (req, res) => {
      try {
        const result = await this.fileManager.deleteFile(req.params.filename);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Video deployment endpoint
    this.app.post('/deploy-video', async (req, res) => {
      try {
        const { filename, title, data } = req.body;

        if (!filename || !data) {
          return res.status(400).json({
            success: false,
            error: 'filename and data are required'
          });
        }

        console.log(`📹 Deploying video: ${filename} (${title || 'No title'})`);

        // Save the video file using the file manager
        const result = await this.fileManager.saveFile(filename, data, 'video');

        if (result.success) {
          console.log(`✅ Video deployed successfully: ${filename}`);
          res.json({
            success: true,
            filename: filename,
            title: title,
            size: result.size,
            message: 'Video deployed successfully'
          });
        } else {
          console.error(`❌ Video deployment failed: ${result.error}`);
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('❌ Deploy video error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });


    // Video Library - serve local video library via web interface
    this.app.get('/video-library/api/videos', async (req, res) => {
      try {
        const videoDir = path.join(__dirname, 'media', 'video');
        const videos = await this.scanVideoDirectory(videoDir);
        
        res.json({
          success: true,
          videos: videos,
          count: videos.length,
          goblinId: this.goblinId
        });
      } catch (error) {
        console.error('Error getting video list:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Settings endpoints
    this.app.get('/settings', (req, res) => {
      res.json({
        success: true,
        settings: this.settings
      });
    });

    this.app.post('/settings', (req, res) => {
      try {
        const { videoDirectory, framerate, resolution } = req.body;

        if (videoDirectory) this.settings.videoDirectory = videoDirectory;
        if (framerate) this.settings.framerate = parseInt(framerate);
        if (resolution) this.settings.resolution = resolution;

        console.log('⚙️ Settings updated:', this.settings);

        res.json({
          success: true,
          settings: this.settings,
          message: 'Settings updated successfully'
        });
      } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/settings/apply', async (req, res) => {
      try {
        const { directory, framerate, resolution } = req.body;

        // Update settings
        if (directory) this.settings.videoDirectory = directory;
        if (framerate) this.settings.framerate = parseInt(framerate);
        if (resolution) this.settings.resolution = resolution;

        console.log('⚙️ Applying settings:', this.settings);

        // Update media player settings
        this.mediaPlayer.framerate = this.settings.framerate;
        this.mediaPlayer.resolution = this.settings.resolution;

        // Get current video if playing
        const currentVideo = this.mediaPlayer.playbackStatus?.video?.file;

        if (currentVideo) {
          console.log('⚙️ Restarting current video with new settings:', currentVideo);
          // Stop current video
          await this.mediaPlayer.stopVideo();
          // Restart with new settings
          await this.mediaPlayer.playVideo(currentVideo, { loop: true });
        }

        res.json({
          success: true,
          settings: this.settings,
          message: currentVideo ? 'Settings applied and video restarted' : 'Settings applied'
        });
      } catch (error) {
        console.error('Error applying settings:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Status and monitoring
    this.app.get('/status', (req, res) => {
      res.json({
        success: true,
        status: this.statusMonitor.getStatus(),
        hardware: this.statusMonitor.getHardwareInfo(),
        playback: this.mediaPlayer.getPlaybackStatus()
      });
    });
  }


  /**
   * Send heartbeat to MonsterBox
   */
  async sendHeartbeat() {
    if (!this.monsterboxEndpoint) {
      return;
    }

    try {
      const response = await fetch(`${this.monsterboxEndpoint}/goblin-management/api/goblin/${this.goblinId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uptime: process.uptime(),
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          status: 'healthy'
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log(`💓 Heartbeat sent to MonsterBox`);
        }
      }
    } catch (error) {
      console.error(`❌ Heartbeat failed:`, error.message);
    }
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);

    // Send initial heartbeat immediately
    this.sendHeartbeat();
    console.log(`💓 Heartbeat started (30s interval)`);
  }

  /**
   * Scan video directory recursively
   */
  async scanVideoDirectory(dir, category = '') {
    const videos = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subVideos = await this.scanVideoDirectory(fullPath, entry.name);
          videos.push(...subVideos);
        } else if (entry.isFile() && /\.(mp4|mpg|mpeg|avi|mkv|mov)$/i.test(entry.name)) {
          const stats = await fs.stat(fullPath);
          const relativePath = fullPath.replace(path.join(__dirname, 'media', 'video') + path.sep, '');
          videos.push({
            name: entry.name,
            path: relativePath,
            category: category,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            modified: stats.mtime
          });
        }
      }
    } catch (error) {
      console.error('Error scanning video directory:', error);
    }
    return videos;
  }

  /**
   * Handle connection to MonsterBox
   */
  async handleMonsterBoxConnection(host, port) {
    try {
      console.log(`🔌 Connecting to MonsterBox at ${host}:${port}`);
      
      this.monsterboxHost = `${host}:${port}`;
      
      // Create WebSocket connection to MonsterBox
      const ws = new WebSocket(`ws://${host}:${port}/goblin-websocket`);
      
      ws.on('open', () => {
        console.log(`✅ Connected to MonsterBox at ${this.monsterboxHost}`);
        this.isConnected = true;
        this.monsterboxConnection = ws;
        
        // Stop beacon once connected
        this.beacon.stop();
        
        // Send registration message
        this.sendToMonsterBox({
          type: 'register',
          goblinId: this.goblinId,
          info: {
            capabilities: {
              video: ['mp4', 'avi', 'mkv', 'mov'],
              audio: ['mp3', 'wav', 'aac', 'ogg'],
              maxResolution: '4K@30fps',
              concurrentAudio: true
            },
            hardware: this.statusMonitor.getHardwareInfo(),
            endpoint: `http://${this.getLocalIP()}:${this.port}`
          }
        });
      });
      
      ws.on('message', this.handleMonsterBoxMessage);
      ws.on('close', this.handleConnectionLost);
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.handleConnectionLost();
      });
      
    } catch (error) {
      console.error('❌ Failed to connect to MonsterBox:', error);
      this.handleConnectionLost();
    }
  }

  /**
   * Handle messages from MonsterBox
   */
  async handleMonsterBoxMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log(`📨 Received from MonsterBox:`, message.type);
      
      switch (message.type) {
        case 'ping':
          this.sendToMonsterBox({ type: 'pong', goblinId: this.goblinId });
          break;
          
        case 'play-media':
          await this.handlePlayMedia(message);
          break;
          
        case 'stop-playback':
          await this.handleStopPlayback(message);
          break;
          
        case 'upload-media':
          await this.handleMediaUpload(message);
          break;
          
        case 'get-status':
          this.sendToMonsterBox({
            type: 'status-report',
            goblinId: this.goblinId,
            status: this.statusMonitor.getStatus(),
            playback: this.mediaPlayer.getPlaybackStatus()
          });
          break;
          
        default:
          console.warn('❓ Unknown message type:', message.type);
      }
      
    } catch (error) {
      console.error('❌ Error handling MonsterBox message:', error);
    }
  }

  /**
   * Handle media playback command
   */
  async handlePlayMedia(message) {
    const { video, audio, options = {} } = message.payload;
    const results = {};
    
    try {
      if (video) {
        results.video = await this.mediaPlayer.playVideo(video, options);
      }
      
      if (audio) {
        if (Array.isArray(audio)) {
          results.audio = [];
          for (const audioFile of audio) {
            const result = await this.mediaPlayer.playAudio(audioFile, options);
            results.audio.push(result);
          }
        } else {
          results.audio = await this.mediaPlayer.playAudio(audio, options);
        }
      }
      
      this.sendToMonsterBox({
        type: 'playback-result',
        goblinId: this.goblinId,
        success: true,
        results: results
      });
      
    } catch (error) {
      console.error('❌ Playback error:', error);
      this.sendToMonsterBox({
        type: 'playback-result',
        goblinId: this.goblinId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle stop playback command
   */
  async handleStopPlayback(message) {
    try {
      const result = await this.mediaPlayer.stopAll();
      this.sendToMonsterBox({
        type: 'stop-result',
        goblinId: this.goblinId,
        success: result.success
      });
    } catch (error) {
      console.error('❌ Stop playback error:', error);
      this.sendToMonsterBox({
        type: 'stop-result',
        goblinId: this.goblinId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle media file upload
   */
  async handleMediaUpload(message) {
    try {
      const { filename, data, type } = message.payload;
      const result = await this.fileManager.saveFile(filename, data, type);
      
      this.sendToMonsterBox({
        type: 'upload-result',
        goblinId: this.goblinId,
        success: result.success,
        filename: filename
      });
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      this.sendToMonsterBox({
        type: 'upload-result',
        goblinId: this.goblinId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Send message to MonsterBox
   */
  sendToMonsterBox(message) {
    if (this.monsterboxConnection && this.isConnected) {
      this.monsterboxConnection.send(JSON.stringify(message));
    }
  }

  /**
   * Handle connection lost
   */
  handleConnectionLost() {
    console.log(`💔 Lost connection to MonsterBox`);
    this.isConnected = false;
    this.monsterboxConnection = null;
    this.monsterboxHost = null;
    
    // Restart beacon to find MonsterBox again
    console.log(`🔍 Restarting beacon to find MonsterBox...`);
    this.beacon.start();
  }

  /**
   * Get local IP address
   */
  getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    
    return '127.0.0.1';
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(`👋 Shutting down Goblin ${this.goblinId}`);

    this.beacon.stop();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.monsterboxConnection) {
      this.monsterboxConnection.close();
    }

    await this.mediaPlayer.stopAll();
    this.statusMonitor.stop();
    this.fileManager.cleanup();

    if (this.server) {
      this.server.close();
    }

    console.log(`💀 Goblin ${this.goblinId} has departed`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  if (global.goblinServer) {
    await global.goblinServer.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (global.goblinServer) {
    await global.goblinServer.shutdown();
  }
  process.exit(0);
});

// Start the Goblin server
if (require.main === module) {
  global.goblinServer = new GoblinServer();
  global.goblinServer.start();
}

module.exports = GoblinServer;