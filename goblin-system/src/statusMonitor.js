/**
 * Status Monitor Service
 * Monitors system health, performance, and hardware status
 */

const os = require('os');
const { exec } = require('child_process');
const fs = require('fs').promises;

class StatusMonitor {
  constructor(goblinServer) {
    this.goblin = goblinServer;
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.status = {
      system: {
        uptime: 0,
        loadAvg: [0, 0, 0],
        memoryUsage: { used: 0, total: 0, percent: 0 },
        diskUsage: { used: 0, total: 0, percent: 0 },
        temperature: 0
      },
      network: {
        connected: false,
        ip: null,
        interfaces: {}
      },
      hardware: {
        model: 'Unknown',
        gpu: 'Unknown',
        audioDevices: []
      },
      services: {
        vlc: false,
        audio: false,
        display: false
      }
    };
    
    console.log(`📊 Status monitor initialized for Goblin ${this.goblin.goblinId}`);
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    console.log('📊 Starting status monitoring...');
    
    // Initial hardware detection
    await this.detectHardware();
    
    // Start periodic monitoring
    this.updateStatus();
    this.monitorInterval = setInterval(() => {
      this.updateStatus();
    }, 10000); // Update every 10 seconds
    
    console.log('📊 Status monitoring active');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    console.log('📊 Status monitoring stopped');
  }

  /**
   * Update system status
   */
  async updateStatus() {
    try {
      // System metrics
      this.status.system.uptime = os.uptime();
      this.status.system.loadAvg = os.loadavg();
      
      // Memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      this.status.system.memoryUsage = {
        used: usedMem,
        total: totalMem,
        percent: Math.round((usedMem / totalMem) * 100)
      };
      
      // Network status
      await this.updateNetworkStatus();
      
      // System temperature (Pi specific)
      await this.updateTemperature();
      
      // Disk usage
      await this.updateDiskUsage();
      
      // Service status
      await this.updateServiceStatus();
      
    } catch (error) {
      console.error('❌ Status update error:', error);
    }
  }

  /**
   * Update network status
   */
  async updateNetworkStatus() {
    const interfaces = os.networkInterfaces();
    this.status.network.interfaces = {};
    this.status.network.connected = false;
    this.status.network.ip = null;
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      this.status.network.interfaces[name] = addrs;
      
      // Find primary IP (not loopback, IPv4)
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          this.status.network.connected = true;
          this.status.network.ip = addr.address;
        }
      }
    }
  }

  /**
   * Update system temperature (Raspberry Pi specific)
   */
  async updateTemperature() {
    return new Promise((resolve) => {
      exec('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', (error, stdout) => {
        if (!error && stdout.trim()) {
          // Pi reports temperature in millidegrees
          this.status.system.temperature = parseInt(stdout.trim()) / 1000;
        }
        resolve();
      });
    });
  }

  /**
   * Update disk usage
   */
  async updateDiskUsage() {
    return new Promise((resolve) => {
      exec("df -h / | tail -1 | awk '{print $3,$2,$5}'", (error, stdout) => {
        if (!error && stdout.trim()) {
          const parts = stdout.trim().split(' ');
          if (parts.length >= 3) {
            this.status.system.diskUsage = {
              used: parts[0],
              total: parts[1],
              percent: parseInt(parts[2].replace('%', ''))
            };
          }
        }
        resolve();
      });
    });
  }

  /**
   * Update service status
   */
  async updateServiceStatus() {
    // Check VLC
    this.status.services.vlc = await this.checkCommand('vlc --version');
    
    // Check audio system
    this.status.services.audio = await this.checkCommand('aplay -l');
    
    // Check display
    this.status.services.display = await this.checkDisplayStatus();
  }

  /**
   * Check if command is available
   */
  async checkCommand(command) {
    return new Promise((resolve) => {
      exec(command, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check display status
   */
  async checkDisplayStatus() {
    return new Promise((resolve) => {
      exec('tvservice -s 2>/dev/null', (error, stdout) => {
        if (!error && stdout.includes('HDMI')) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Detect hardware capabilities
   */
  async detectHardware() {
    console.log('🔍 Detecting hardware capabilities...');
    
    // Detect Pi model
    await this.detectPiModel();
    
    // Detect GPU capabilities
    await this.detectGPU();
    
    // Detect audio devices
    await this.detectAudioDevices();
    
    console.log('🔍 Hardware detection complete');
  }

  /**
   * Detect Raspberry Pi model
   */
  async detectPiModel() {
    return new Promise((resolve) => {
      exec('cat /proc/cpuinfo | grep "Model"', (error, stdout) => {
        if (!error && stdout.trim()) {
          this.status.hardware.model = stdout.split(':')[1]?.trim() || 'Unknown Pi';
        } else {
          this.status.hardware.model = 'Unknown';
        }
        resolve();
      });
    });
  }

  /**
   * Detect GPU capabilities
   */
  async detectGPU() {
    return new Promise((resolve) => {
      exec('vcgencmd get_mem gpu 2>/dev/null', (error, stdout) => {
        if (!error && stdout.trim()) {
          this.status.hardware.gpu = stdout.trim();
        } else {
          this.status.hardware.gpu = 'Unknown';
        }
        resolve();
      });
    });
  }

  /**
   * Detect audio devices
   */
  async detectAudioDevices() {
    return new Promise((resolve) => {
      exec('aplay -l 2>/dev/null', (error, stdout) => {
        if (!error && stdout.trim()) {
          const devices = [];
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (line.includes('card')) {
              devices.push(line.trim());
            }
          }
          this.status.hardware.audioDevices = devices;
        }
        resolve();
      });
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      ...this.status,
      monitoring: this.isMonitoring,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Get hardware info summary
   */
  getHardwareInfo() {
    return {
      model: this.status.hardware.model,
      gpu: this.status.hardware.gpu,
      audioDevices: this.status.hardware.audioDevices,
      services: this.status.services,
      capabilities: {
        video: this.status.services.vlc,
        audio: this.status.services.audio,
        display: this.status.services.display
      }
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      uptime: this.status.system.uptime,
      loadAvg: this.status.system.loadAvg,
      memory: this.status.system.memoryUsage,
      disk: this.status.system.diskUsage,
      temperature: this.status.system.temperature,
      network: {
        connected: this.status.network.connected,
        ip: this.status.network.ip
      }
    };
  }

  /**
   * Check if system is healthy
   */
  isHealthy() {
    const metrics = this.getPerformanceMetrics();
    
    // Health criteria
    const healthChecks = {
      network: metrics.network.connected,
      memory: metrics.memory.percent < 90,
      temperature: metrics.temperature < 80, // Celsius
      services: this.status.services.vlc && this.status.services.audio
    };
    
    const healthy = Object.values(healthChecks).every(check => check);
    
    return {
      healthy: healthy,
      checks: healthChecks,
      metrics: metrics
    };
  }
}

module.exports = StatusMonitor;