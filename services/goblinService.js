/**
 * MonsterBox Goblin Service
 * Native service for distributed media playback - no Docker overhead
 * Optimized for Pi3B performance with 1080p+ video capability
 */

const express = require('express');
const { WebSocket } = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const os = require('os');

// Import MonsterBox services
const configService = require('./configService.js');
const { fileURLToPath } = require('url');

class MonsterBoxGoblinService {
  constructor() {
    this.goblinId = process.env.GOBLIN_ID || this.generateGoblinId();
    this.port = process.env.GOBLIN_PORT || 3001;
    this.monsterboxHost = null;
    this.monsterboxConnection = null;
    this.isConnected = false;
    this.isMonsterBoxInstance = false;
    
    // Performance optimization - minimal process tracking
    this.activeVideo = null;
    this.activeAudio = new Map(); // id -> process
    
    // Native paths (no Docker overhead)
    this.mediaPath = path.resolve(process.cwd(), 'goblin-media');
    this.configPath = path.resolve(process.cwd(), 'goblin-config');
    
    console.log(`🎃 MonsterBox Goblin ${this.goblinId} initializing (Native Mode)`);
  }

  /**
   * Generate optimized Goblin ID
   */
  generateGoblinId() {
    const hostname = os.hostname();
    const random = Math.random().toString(36).substring(2, 6);
    return `goblin-${hostname}-${random}`;
  }

  /**
   * Initialize Goblin service
   */
  async initialize() {
    try {
      // Check if this IS a MonsterBox instance
      await this.detectMonsterBoxInstance();
      
      if (this.isMonsterBoxInstance) {
        console.log('🎃 Running on MonsterBox instance - enabling hub mode');
        await this.initializeAsMonsterBoxHub();
      } else {
        console.log('🎃 Running on remote device - enabling goblin mode');
        await this.initializeAsGoblin();
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize Goblin service:', error);
      throw error;
    }
  }

  /**
   * Detect if running on a MonsterBox instance
   */
  async detectMonsterBoxInstance() {
    try {
      // Check for MonsterBox files
      const monsterBoxFiles = [
        'package.json',
        'server.js',
        'services/configService.js',
        'controllers/charactersController.js'
      ];
      
      for (const file of monsterBoxFiles) {
        try {
          await fs.access(path.resolve(process.cwd(), file));
        } catch {
          this.isMonsterBoxInstance = false;
          return;
        }
      }
      
      // Check if MonsterBox is running on port 3000
      try {
        const axios = require('axios');
        await axios.get('http://localhost:3000/api/system/info', { timeout: 1000 });
        this.isMonsterBoxInstance = true;
      } catch {
        this.isMonsterBoxInstance = false;
      }
      
    } catch (error) {
      this.isMonsterBoxInstance = false;
    }
  }

  /**
   * Initialize as MonsterBox hub (manages other Goblins)
   */
  async initializeAsMonsterBoxHub() {
    console.log('🏰 Initializing MonsterBox Goblin Hub');
    
    // Create hub directory structure
    await this.createHubDirectories();
    
    // Start WebSocket server for Goblin connections
    await this.startGoblinWebSocketServer();
    
    // Initialize media management
    await this.initializeMediaManagement();
    
    console.log('🏰 MonsterBox Goblin Hub ready');
  }

  /**
   * Initialize as remote Goblin
   */
  async initializeAsGoblin() {
    console.log('👹 Initializing Remote Goblin');
    
    // Create Goblin directories
    await this.createGoblinDirectories();
    
    // Setup media player (optimized for Pi)
    await this.initializeMediaPlayer();
    
    // Setup hardware optimization
    await this.optimizeForPi();
    
    // Start discovery beacon
    await this.startDiscoveryBeacon();
    
    // Start Goblin API server
    await this.startGoblinAPI();
    
    console.log('👹 Remote Goblin ready for haunting!');
  }

  /**
   * Create hub directories
   */
  async createHubDirectories() {
    const dirs = [
      path.join(this.mediaPath, 'goblin-library'),
      path.join(this.mediaPath, 'goblin-library/video'),
      path.join(this.mediaPath, 'goblin-library/audio'),
      path.join(this.configPath, 'goblins')
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    console.log('📁 Hub directories created');
  }

  /**
   * Create Goblin directories (native paths)
   */
  async createGoblinDirectories() {
    const dirs = [
      path.join(this.mediaPath, 'video'),
      path.join(this.mediaPath, 'audio'),
      path.join(this.configPath),
      '/tmp/goblin-logs'
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    console.log('📁 Goblin directories created');
  }

  /**
   * Initialize optimized media player for Pi
   */
  async initializeMediaPlayer() {
    console.log('🎬 Initializing optimized media player...');
    
    // Check VLC capability
    await this.checkVLCCapability();
    
    // Optimize audio for HDMI output (Pi specific)
    await this.optimizeAudioOutput();
    
    // Set GPU memory split for video performance
    await this.optimizeGPUMemory();
    
    console.log('🎬 Media player optimized');
  }

  /**
   * Check VLC capability
   */
  async checkVLCCapability() {
    return new Promise((resolve, reject) => {
      exec('vlc --version', (error, stdout) => {
        if (error) {
          reject(new Error('VLC not found. Install with: sudo apt-get install vlc'));
        } else {
          console.log('✅ VLC found:', stdout.split('\\n')[0]);
          resolve();
        }
      });
    });
  }

  /**
   * Optimize audio output for Pi
   */
  async optimizeAudioOutput() {
    return new Promise((resolve) => {
      // Force HDMI audio output
      exec('amixer cset numid=3 2', (error) => {
        if (error) {
          console.warn('⚠️ Could not force HDMI audio');
        } else {
          console.log('🔊 Audio output set to HDMI');
        }
        
        // Set reasonable volume
        exec('amixer set Master 80%', (volumeError) => {
          if (volumeError) {
            console.warn('⚠️ Could not set volume');
          } else {
            console.log('🔊 Volume set to 80%');
          }
          resolve();
        });
      });
    });
  }

  /**
   * Optimize GPU memory for video performance
   */
  async optimizeGPUMemory() {
    try {
      // Check current GPU memory split
      exec('vcgencmd get_mem gpu', (error, stdout) => {
        if (!error) {
          const currentMem = stdout.trim();
          console.log(`🎮 Current GPU memory: ${currentMem}`);
          
          // Recommend 128MB for 1080p video
          if (!currentMem.includes('128')) {
            console.log('💡 Tip: For optimal 1080p performance, set GPU memory to 128MB in /boot/config.txt');
            console.log('💡 Add: gpu_mem=128');
          }
        }
      });
    } catch (error) {
      console.warn('⚠️ Could not check GPU memory settings');
    }
  }

  /**
   * Pi-specific optimizations
   */
  async optimizeForPi() {
    console.log('⚡ Applying Pi performance optimizations...');
    
    // Set process priority for media playback
    process.nice = -10; // Higher priority
    
    // Disable swap to avoid video stuttering (if possible)
    exec('sudo swapoff -a', (error) => {
      if (!error) {
        console.log('⚡ Swap disabled for better video performance');
      }
    });
    
    // Enable hardware video acceleration
    process.env.VDPAU_DRIVER = 'vc4';
    
    console.log('⚡ Pi optimizations applied');
  }

  /**
   * Start discovery beacon to find MonsterBox
   */
  async startDiscoveryBeacon() {
    console.log('🔍 Starting discovery beacon...');
    
    this.beaconInterval = setInterval(async () => {
      if (!this.isConnected) {
        await this.scanForMonsterBox();
      }
    }, 10000); // Every 10 seconds
    
    // Initial scan
    await this.scanForMonsterBox();
  }

  /**
   * Scan for MonsterBox instances
   */
  async scanForMonsterBox() {
    try {
      // Get network range
      const networkBase = this.getNetworkBase();
      if (!networkBase) return;
      
      console.log(`🔍 Scanning ${networkBase}.x for MonsterBox...`);
      
      // Quick scan of common addresses first
      const commonAddresses = [
        `${networkBase}.1`,   // Router/gateway
        `${networkBase}.100`, // Common static
        `${networkBase}.150`, // Common static
        `${networkBase}.200`  // Common static
      ];
      
      for (const address of commonAddresses) {
        if (await this.testMonsterBoxAt(address)) {
          return; // Found and connected
        }
      }
      
      // If not found in common addresses, do broader scan
      await this.broadScanForMonsterBox(networkBase);
      
    } catch (error) {
      console.error('❌ Discovery scan error:', error.message);
    }
  }

  /**
   * Get network base for scanning
   */
  getNetworkBase() {
    const interfaces = os.networkInterfaces();
    
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (name === 'lo') continue; // Skip loopback
      
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const parts = addr.address.split('.');
          return `${parts[0]}.${parts[1]}.${parts[2]}`;
        }
      }
    }
    
    return null;
  }

  /**
   * Test if address hosts MonsterBox
   */
  async testMonsterBoxAt(address) {
    try {
      const axios = require('axios');
      
      const response = await axios.get(`http://${address}:3000/api/system/info`, {
        timeout: 2000,
        headers: {
          'User-Agent': `MonsterBox-Goblin-${this.goblinId}`
        }
      });
      
      if (response.data && response.data.system) {
        console.log(`🎃 Found MonsterBox at ${address}:3000!`);
        await this.connectToMonsterBox(address, 3000);
        return true;
      }
      
    } catch (error) {
      // Not MonsterBox or not accessible
    }
    
    return false;
  }

  /**
   * Connect to MonsterBox
   */
  async connectToMonsterBox(host, port) {
    try {
      console.log(`🔌 Connecting to MonsterBox at ${host}:${port}`);
      
      this.monsterboxHost = `${host}:${port}`;
      
      // Use HTTP for initial registration (simpler than WebSocket for now)
      const axios = require('axios');
      
      const registrationData = {
        goblinId: this.goblinId,
        hostname: os.hostname(),
        capabilities: {
          video: ['mp4', 'avi', 'mkv', 'mov'],
          audio: ['mp3', 'wav', 'aac', 'ogg'],
          maxResolution: '1080p@30fps', // Realistic for Pi3B
          concurrentAudio: true,
          hardwareAcceleration: true
        },
        hardware: {
          platform: 'raspberry-pi',
          model: 'Pi3B',
          cpu: os.cpus()[0].model,
          memory: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
          architecture: os.arch()
        },
        endpoint: `http://${this.getLocalIP()}:${this.port}`,
        version: '1.0.0'
      };
      
      await axios.post(`http://${host}:${port}/api/goblins/register`, registrationData, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `MonsterBox-Goblin-${this.goblinId}`
        }
      });
      
      this.isConnected = true;
      console.log(`✅ Successfully registered with MonsterBox!`);
      
      // Stop beacon
      if (this.beaconInterval) {
        clearInterval(this.beaconInterval);
        this.beaconInterval = null;
      }
      
    } catch (error) {
      console.error('❌ Failed to connect to MonsterBox:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Get local IP address
   */
  getLocalIP() {
    const interfaces = os.networkInterfaces();
    
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (name === 'lo') continue;
      
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    
    return '127.0.0.1';
  }

  /**
   * Start Goblin API server
   */
  async startGoblinAPI() {
    const app = express();
    
    app.use(cors());
    app.use(express.json({ limit: '50mb' })); // For media uploads
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        goblinId: this.goblinId,
        connected: this.isConnected,
        monsterbox: this.monsterboxHost,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: os.platform(),
        arch: os.arch()
      });
    });

    // Media playback endpoints (optimized)
    app.post('/play-video', async (req, res) => {
      try {
        const { filename, options = {} } = req.body;
        const result = await this.playVideoOptimized(filename, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/play-audio', async (req, res) => {
      try {
        const { filename, options = {} } = req.body;
        const result = await this.playAudioOptimized(filename, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/stop-all', async (req, res) => {
      try {
        await this.stopAllPlayback();
        res.json({ success: true, message: 'All playback stopped' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Start server
    return new Promise((resolve) => {
      this.server = app.listen(this.port, () => {
        console.log(`👹 Goblin API listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Optimized video playback for Pi3B
   */
  async playVideoOptimized(filename, options = {}) {
    try {
      console.log(`🎬 Playing video: ${filename} (Pi3B Optimized)`);
      
      // Stop any existing video
      if (this.activeVideo) {
        this.activeVideo.kill('SIGTERM');
        this.activeVideo = null;
      }
      
      const videoPath = path.join(this.mediaPath, 'video', filename);
      
      // Check file exists
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`Video file not found: ${filename}`);
      }
      
      // Optimized VLC arguments for Pi3B performance
      const vlcArgs = [
        '--intf', 'dummy',
        '--no-video-title-show',
        '--fullscreen',
        '--no-osd',
        '--no-audio-display',
        '--no-sout-video-sync',
        '--network-caching=300',
        '--file-caching=300',
        '--live-caching=300',
        '--clock-jitter=0',
        '--clock-synchro=0',
        '--drop-late-frames',
        '--skip-frames',
        videoPath
      ];
      
      // Add hardware acceleration if available
      vlcArgs.push('--codec=avcodec,all');
      vlcArgs.push('--avcodec-hw=any');
      
      if (options.loop) {
        vlcArgs.push('--loop');
      } else {
        vlcArgs.push('--play-and-exit');
      }
      
      console.log('🎬 Starting optimized VLC playback');
      
      this.activeVideo = spawn('vlc', vlcArgs, {
        stdio: ['ignore', 'ignore', 'pipe'], // Only capture errors
        detached: false
      });
      
      this.activeVideo.on('exit', (code) => {
        console.log(`🎬 Video playback ended: ${filename}`);
        this.activeVideo = null;
      });
      
      this.activeVideo.on('error', (error) => {
        console.error(`❌ Video playback error:`, error.message);
        this.activeVideo = null;
      });
      
      return {
        success: true,
        message: `Started optimized video playback: ${filename}`,
        filename,
        optimization: 'Pi3B-tuned'
      };
      
    } catch (error) {
      console.error('❌ Video playback failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Optimized audio playback
   */
  async playAudioOptimized(filename, options = {}) {
    try {
      console.log(`🔊 Playing audio: ${filename}`);
      
      const audioPath = path.join(this.mediaPath, 'audio', filename);
      
      try {
        await fs.access(audioPath);
      } catch {
        throw new Error(`Audio file not found: ${filename}`);
      }
      
      const audioId = `audio-${Date.now()}`;
      const volume = Math.floor((options.volume || 0.8) * 100);
      
      // Lightweight audio playback
      const vlcArgs = [
        '--intf', 'dummy',
        '--no-video',
        '--play-and-exit',
        `--volume=${volume}`,
        '--no-audio-display',
        audioPath
      ];
      
      const audioProcess = spawn('vlc', vlcArgs, {
        stdio: 'ignore',
        detached: false
      });
      
      this.activeAudio.set(audioId, audioProcess);
      
      audioProcess.on('exit', () => {
        this.activeAudio.delete(audioId);
      });
      
      return {
        success: true,
        message: `Started audio playback: ${filename}`,
        audioId,
        filename
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop all playback
   */
  async stopAllPlayback() {
    console.log('⏹️ Stopping all media playback');
    
    // Stop video
    if (this.activeVideo) {
      this.activeVideo.kill('SIGTERM');
      this.activeVideo = null;
    }
    
    // Stop all audio
    for (const [id, process] of this.activeAudio) {
      try {
        process.kill('SIGTERM');
      } catch (error) {
        console.warn(`Failed to stop audio ${id}:`, error.message);
      }
    }
    this.activeAudio.clear();
    
    console.log('⏹️ All playback stopped');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(`👋 Shutting down Goblin ${this.goblinId}`);
    
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
    }
    
    await this.stopAllPlayback();
    
    if (this.server) {
      this.server.close();
    }
    
    console.log(`💀 Goblin ${this.goblinId} departed`);
  }
}

// Singleton instance
let goblinServiceInstance = null;

/**
 * Get or create Goblin service instance
 */
function getGoblinService() {
  if (!goblinServiceInstance) {
    goblinServiceInstance = new MonsterBoxGoblinService();
  }
  return goblinServiceInstance;
}

/**
 * Initialize Goblin service
 */
async function initializeGoblinService() {
  const goblin = getGoblinService();
  await goblin.initialize();
  return goblin;
}

module.exports = {
  MonsterBoxGoblinService,
  getGoblinService,
  initializeGoblinService
};