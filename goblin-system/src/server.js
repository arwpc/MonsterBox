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
const VideoQueue = require('./videoQueue');

class GoblinServer {
  constructor() {
    this.goblinId = process.env.GOBLIN_ID || this.generateGoblinId();
    this.port = process.env.GOBLIN_PORT || 3001;
    this.monsterboxHost = null;
    this.monsterboxConnection = null;
    this.isConnected = false;

    // Initialize components
    this.app = express();
    this.beacon = new BeaconService(this);
    this.mediaPlayer = new MediaPlayer(this);
    this.statusMonitor = new StatusMonitor(this);
    this.fileManager = new FileManager(this);
    this.videoQueue = new VideoQueue(this.mediaPlayer);

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

      // Start heartbeat if MONSTERBOX_URL is set
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
    this.app.use(express.json({ limit: '10mb' }));
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
    this.app.get('/info', async (req, res) => {
      res.json({
        goblinId: this.goblinId,
        version: require('../package.json').version,
        capabilities: {
          video: ['mp4', 'avi', 'mkv', 'mov'],
          audio: ['mp3', 'wav', 'aac', 'ogg'],
          maxResolution: '4K@30fps',
          concurrentAudio: true
        },
        hardware: this.statusMonitor.getHardwareInfo(),
        status: this.statusMonitor.getStatus(),
        mediaFiles: await this.fileManager.getMediaList()
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
    this.app.get('/media', (req, res) => {
      res.json({
        success: true,
        media: this.fileManager.getMediaList()
      });
    });

    this.app.delete('/media/:filename', async (req, res) => {
      try {
        const result = await this.fileManager.deleteFile(req.params.filename);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Status and monitoring
    this.app.get('/status', (req, res) => {
      res.json({
        success: true,
        status: this.statusMonitor.getStatus(),
        hardware: this.statusMonitor.getHardwareInfo(),
        playback: this.mediaPlayer.getPlaybackStatus(),
        queue: this.videoQueue.getStatus()
      });
    });

    // Video Queue endpoints
    this.app.get('/queue', (req, res) => {
      res.json({
        success: true,
        queue: this.videoQueue.getStatus()
      });
    });

    this.app.post('/queue/start', async (req, res) => {
      try {
        const { videos, mode = 'sequential' } = req.body;

        if (!videos || !Array.isArray(videos) || videos.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'videos array is required'
          });
        }

        const status = await this.videoQueue.startQueue(videos, mode);
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/enqueue', (req, res) => {
      try {
        const { filename, options = {} } = req.body;

        if (!filename) {
          return res.status(400).json({
            success: false,
            error: 'filename is required'
          });
        }

        const status = this.videoQueue.enqueue(filename, options);
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/enqueue-priority', (req, res) => {
      try {
        const { filename, options = {} } = req.body;

        if (!filename) {
          return res.status(400).json({
            success: false,
            error: 'filename is required'
          });
        }

        const status = this.videoQueue.enqueuePriority(filename, options);
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/pause', (req, res) => {
      try {
        const status = this.videoQueue.pause();
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/resume', (req, res) => {
      try {
        const status = this.videoQueue.resume();
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/skip', (req, res) => {
      try {
        const status = this.videoQueue.skip();
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/stop', async (req, res) => {
      try {
        const status = await this.videoQueue.stop();
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/clear', (req, res) => {
      try {
        const status = this.videoQueue.clear();
        res.json({ success: true, queue: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Start heartbeat to MonsterBox
   */
  startHeartbeat() {
    const monsterboxUrl = process.env.MONSTERBOX_URL;

    if (!monsterboxUrl) {
      console.log('⚠️  MONSTERBOX_URL not set - heartbeat disabled');
      return;
    }

    console.log(`💓 Starting heartbeat to ${monsterboxUrl}`);

    // Send initial heartbeat
    this.sendHeartbeat(monsterboxUrl);

    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat(monsterboxUrl);
    }, 30000);
  }

  /**
   * Send heartbeat to MonsterBox
   */
  async sendHeartbeat(monsterboxUrl) {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${monsterboxUrl}/goblin-management/api/goblin/${this.goblinId}/heartbeat`,
        {},
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        }
      );

      if (response.status === 200) {
        console.log(`💓 Heartbeat sent to ${monsterboxUrl}`);
      } else {
        console.warn(`⚠️  Heartbeat failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Heartbeat error:`, error.message);
    }
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

    if (this.monsterboxConnection) {
      this.monsterboxConnection.close();
    }

    await this.mediaPlayer.stopAll();
    this.statusMonitor.stop();

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