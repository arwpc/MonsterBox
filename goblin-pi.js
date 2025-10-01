#!/usr/bin/env node

/**
 * MonsterBox Goblin - Native Launch Script
 * Lightweight launcher for Pi3B - no Docker overhead
 */

console.log('🎃 Starting MonsterBox Goblin (Native Mode)...');

// Set environment for optimal performance
process.env.NODE_ENV = 'production';
process.env.UV_THREADPOOL_SIZE = '2'; // Limit thread pool for Pi
process.env.GOBLIN_ID = process.env.GOBLIN_ID || 'chestwound-window-1';

// Performance monitoring
const startTime = Date.now();
const startMem = process.memoryUsage();

console.log(`🎮 Goblin ID: ${process.env.GOBLIN_ID}`);
console.log(`🎮 Node.js: ${process.version}`);
console.log(`🎮 Platform: ${process.platform} ${process.arch}`);
console.log(`🎮 Memory: ${Math.round(startMem.rss / 1024 / 1024)}MB RSS`);

// Basic dependency checks
const requiredModules = ['express', 'axios'];
for (const mod of requiredModules) {
  try {
    require(mod);
    console.log(`✅ ${mod} loaded`);
  } catch (error) {
    console.error(`❌ Missing module: ${mod}`);
    console.log(`Install with: npm install ${mod}`);
    process.exit(1);
  }
}

// Simple Goblin implementation for Pi3B
const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PiGoblin {
  constructor() {
    this.goblinId = process.env.GOBLIN_ID;
    this.port = 3001;
    this.mediaPath = path.resolve(__dirname, 'media');
    this.isConnected = false;
    this.activeVideo = null;
    this.activeAudio = new Map();
    this.audioEnabled = true;
    this.audioVolume = 80;
  }

  async start() {
    console.log('🎬 Initializing Pi Goblin...');
    
    // Create media directories
    await this.createDirectories();
    
    // Setup optimized VLC
    await this.setupMediaPlayer();
    
    // Start API server
    await this.startAPI();
    
    // Start discovery
    this.startDiscovery();
    
    console.log(`✅ Pi Goblin ready on port ${this.port}!`);
  }

  async createDirectories() {
    const dirs = [
      path.join(this.mediaPath, 'video'),
      path.join(this.mediaPath, 'audio')
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async setupMediaPlayer() {
    return new Promise((resolve) => {
      // Optimize audio for HDMI
      exec('amixer cset numid=3 2 2>/dev/null', () => {
        exec('amixer set Master 80% 2>/dev/null', () => {
          console.log('🔊 Audio optimized for HDMI');
          resolve();
        });
      });
    });
  }

  async startAPI() {
    const app = express();
    app.use(express.json({ limit: '100mb' })); // Increased for video deployment

    app.get('/health', (req, res) => {
      const mem = process.memoryUsage();
      res.json({
        status: 'healthy',
        goblinId: this.goblinId,
        connected: this.isConnected,
        uptime: process.uptime(),
        memory: Math.round(mem.rss / 1024 / 1024) + 'MB',
        platform: `${os.platform()} ${os.arch()}`,
        video: this.activeVideo ? 'playing' : 'idle',
        audio: this.activeAudio.size + ' streams'
      });
    });

    app.post('/play-video', async (req, res) => {
      try {
        const { filename, loop = true } = req.body;
        const result = await this.playVideo(filename, { loop });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/play-audio', async (req, res) => {
      try {
        const { filename } = req.body;
        const result = await this.playAudio(filename);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/stop-all', async (req, res) => {
      await this.stopAll();
      res.json({ success: true, message: 'All playback stopped' });
    });

    app.post('/audio/toggle', async (req, res) => {
      this.audioEnabled = !this.audioEnabled;
      res.json({ 
        success: true, 
        audioEnabled: this.audioEnabled,
        message: `Audio ${this.audioEnabled ? 'enabled' : 'disabled'}` 
      });
    });

    app.post('/audio/volume', async (req, res) => {
      try {
        const { volume } = req.body;
        if (volume >= 0 && volume <= 100) {
          this.audioVolume = volume;
          // Apply volume change immediately
          exec(`amixer set Master ${volume}% 2>/dev/null`, () => {});
          res.json({
            success: true,
            volume: this.audioVolume,
            message: `Volume set to ${volume}%`
          });
        } else {
          res.status(400).json({ success: false, error: 'Volume must be between 0-100' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Video deployment endpoint
    app.post('/deploy-video', async (req, res) => {
      try {
        const { filename, title, data } = req.body;

        if (!filename || !data) {
          return res.status(400).json({
            success: false,
            error: 'filename and data are required'
          });
        }

        console.log(`📹 Deploying video: ${filename} (${title || 'No title'})`);

        // Ensure video directory exists
        const videoDir = path.join(this.mediaPath, 'video');
        await fs.mkdir(videoDir, { recursive: true });

        // Save the video file
        const videoPath = path.join(videoDir, filename);

        // Convert base64 data to buffer
        let fileData;
        if (typeof data === 'string' && data.startsWith('data:')) {
          // Data URL format
          const base64Data = data.split(',')[1];
          fileData = Buffer.from(base64Data, 'base64');
        } else if (typeof data === 'string') {
          // Assume base64 string
          fileData = Buffer.from(data, 'base64');
        } else {
          // Assume buffer or binary data
          fileData = data;
        }

        // Write file
        await fs.writeFile(videoPath, fileData);

        // Get file stats
        const stats = await fs.stat(videoPath);

        console.log(`✅ Video deployed successfully: ${filename} (${stats.size} bytes)`);

        res.json({
          success: true,
          filename: filename,
          title: title,
          size: stats.size,
          message: 'Video deployed successfully'
        });

      } catch (error) {
        console.error('❌ Deploy video error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    app.get('/audio/status', (req, res) => {
      res.json({
        success: true,
        audioEnabled: this.audioEnabled,
        volume: this.audioVolume
      });
    });

    app.get('/media', async (req, res) => {
      try {
        const videoFiles = await fs.readdir(path.join(this.mediaPath, 'video')).catch(() => []);
        const audioFiles = await fs.readdir(path.join(this.mediaPath, 'audio')).catch(() => []);
        
        res.json({
          success: true,
          video: videoFiles.filter(f => f.endsWith('.mp4') || f.endsWith('.avi')),
          audio: audioFiles.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return new Promise((resolve) => {
      this.server = app.listen(this.port, () => {
        console.log(`🌐 API server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async playVideo(filename, options = {}) {
    console.log(`🎬 Playing video: ${filename}`);
    
    // Stop existing video
    if (this.activeVideo) {
      this.activeVideo.kill('SIGTERM');
    }

    const videoPath = path.join(this.mediaPath, 'video', filename);
    
    try {
      await fs.access(videoPath);
    } catch {
      throw new Error(`Video not found: ${filename}`);
    }

    // Use ffplay with audio controls for better Pi3B compatibility
    const args = [
      '-fs',           // Fullscreen
      '-loop', '0',    // Loop forever
      '-autoexit',     // Exit when done
      '-loglevel', 'quiet',
      '-vf', 'scale=1920:1080',  // Scale to 1080p
    ];
    
    // Add audio settings based on current state
    if (this.audioEnabled) {
      args.push('-volume', this.audioVolume.toString());
    } else {
      args.push('-an');  // Disable audio
    }
    
    args.push(videoPath);

    // If explicit looping requested, remove play-and-exit
    if (options.loop !== false) {
      const exitIndex = args.indexOf('--play-and-exit');
      if (exitIndex > -1) args.splice(exitIndex, 1);
    }

    this.activeVideo = spawn('ffplay', args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DISPLAY: ':0.0' }
    });
    
    // Log ffplay output for debugging
    this.activeVideo.stdout.on('data', (data) => {
      console.log(`ffplay stdout: ${data.toString().trim()}`);
    });
    
    this.activeVideo.stderr.on('data', (data) => {
      console.log(`ffplay stderr: ${data.toString().trim()}`);
    });
    
    this.activeVideo.on('exit', (code, signal) => {
      this.activeVideo = null;
      console.log(`🎬 Video finished: ${filename} (exit code: ${code}, signal: ${signal})`);
    });

    this.activeVideo.on('error', (error) => {
      console.error(`🎬 Video error: ${error.message}`);
      this.activeVideo = null;
    });

    return {
      success: true,
      message: `Playing video: ${filename} (looped)`,
      filename,
      looping: options.loop !== false
    };
  }

  async playAudio(filename) {
    console.log(`🔊 Playing audio: ${filename}`);
    
    const audioPath = path.join(this.mediaPath, 'audio', filename);
    
    try {
      await fs.access(audioPath);
    } catch {
      throw new Error(`Audio not found: ${filename}`);
    }

    const audioId = Date.now().toString();
    const args = [
      '--intf', 'dummy',
      '--no-video',
      '--play-and-exit',
      '--volume=80',
      audioPath
    ];

    const process = spawn('vlc', args, { stdio: 'ignore' });
    this.activeAudio.set(audioId, process);
    
    process.on('exit', () => {
      this.activeAudio.delete(audioId);
    });

    return {
      success: true,
      message: `Playing audio: ${filename}`,
      audioId,
      filename
    };
  }

  async stopAll() {
    console.log('⏹️ Stopping all playback');
    
    if (this.activeVideo) {
      this.activeVideo.kill('SIGTERM');
      this.activeVideo = null;
    }
    
    for (const [id, process] of this.activeAudio) {
      process.kill('SIGTERM');
    }
    this.activeAudio.clear();
  }

  startDiscovery() {
    console.log('🔍 Starting MonsterBox discovery...');
    
    const discoverMonsterBox = async () => {
      if (this.isConnected) return;
      
      try {
        const axios = require('axios');
        
        // Try common addresses
        const addresses = [
          '192.168.1.100', '192.168.1.150', '192.168.1.200',
          '192.168.8.100', '192.168.8.150', '192.168.8.200'
        ];
        
        for (const addr of addresses) {
          try {
            const response = await axios.get(`http://${addr}:3000/api/system/info`, {
              timeout: 1000
            });
            
            if (response.data && response.data.system) {
              console.log(`🎃 Found MonsterBox at ${addr}:3000!`);
              
              // Register with MonsterBox
              await axios.post(`http://${addr}:3000/api/goblins/register`, {
                goblinId: this.goblinId,
                endpoint: `http://${this.getLocalIP()}:${this.port}`,
                capabilities: ['video', 'audio'],
                platform: 'pi3b'
              }, { timeout: 3000 });
              
              this.isConnected = true;
              console.log('✅ Registered with MonsterBox!');
              return;
            }
          } catch (error) {
            // Continue searching
          }
        }
      } catch (error) {
        // Continue searching
      }
    };

    // Initial discovery
    discoverMonsterBox();
    
    // Periodic discovery
    setInterval(discoverMonsterBox, 15000);
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const [name, addresses] of Object.entries(interfaces)) {
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    return '127.0.0.1';
  }

  async shutdown() {
    console.log('👋 Shutting down Goblin...');
    await this.stopAll();
    if (this.server) this.server.close();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  if (global.goblin) {
    await global.goblin.shutdown();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  if (global.goblin) {
    await global.goblin.shutdown();
  } else {
    process.exit(0);
  }
});

// Start the Goblin
async function main() {
  try {
    global.goblin = new PiGoblin();
    await global.goblin.start();
    
    const elapsed = Date.now() - startTime;
    const mem = process.memoryUsage();
    
    console.log(`🚀 Goblin startup completed in ${elapsed}ms`);
    console.log(`🧠 Memory usage: ${Math.round(mem.rss / 1024 / 1024)}MB`);
    console.log(`👹 Ready to haunt windows! 🎃`);
    
  } catch (error) {
    console.error('❌ Failed to start Goblin:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PiGoblin;