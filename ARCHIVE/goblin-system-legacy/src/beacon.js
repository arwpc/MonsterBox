/**
 * Beacon Service - Auto-discovery of MonsterBox instances
 * Scans the local network for MonsterBox instances on port 3000
 */

const dgram = require('dgram');
const { spawn } = require('child_process');

class BeaconService {
  constructor(goblinServer) {
    this.goblin = goblinServer;
    this.isActive = false;
    this.scanInterval = null;
    this.broadcastSocket = null;
    this.scanFrequency = 10000; // 10 seconds
    this.discoveredHosts = new Set();
    
    console.log(`🔍 Beacon service initialized for Goblin ${this.goblin.goblinId}`);
  }

  /**
   * Start the beacon service
   */
  start() {
    if (this.isActive) {
      console.log('🔍 Beacon already active');
      return;
    }
    
    this.isActive = true;
    console.log('🔍 Starting beacon service...');
    
    // Start periodic network scan
    this.scanForMonsterBox();
    this.scanInterval = setInterval(() => {
      this.scanForMonsterBox();
    }, this.scanFrequency);
    
    console.log(`🔍 Beacon active - scanning every ${this.scanFrequency/1000} seconds`);
  }

  /**
   * Stop the beacon service
   */
  stop() {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    if (this.broadcastSocket) {
      this.broadcastSocket.close();
      this.broadcastSocket = null;
    }
    
    console.log('🔍 Beacon service stopped');
  }

  /**
   * Scan local network for MonsterBox instances
   */
  async scanForMonsterBox() {
    try {
      console.log('🔍 Scanning for MonsterBox instances...');
      
      // Get local network range
      const networkRange = await this.getNetworkRange();
      if (!networkRange) {
        console.warn('⚠️ Could not determine network range');
        return;
      }
      
      console.log(`🔍 Scanning network range: ${networkRange}`);
      
      // Scan for MonsterBox on port 3000
      const hosts = await this.scanRange(networkRange, 3000);
      
      // Test discovered hosts for MonsterBox API
      for (const host of hosts) {
        if (!this.discoveredHosts.has(host)) {
          await this.testMonsterBoxHost(host);
        }
      }
      
    } catch (error) {
      console.error('❌ Network scan error:', error);
    }
  }

  /**
   * Get local network range for scanning
   */
  async getNetworkRange() {
    return new Promise((resolve) => {
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            // Calculate network range (assuming /24 subnet)
            const ip = net.address;
            const parts = ip.split('.');
            const networkBase = `${parts[0]}.${parts[1]}.${parts[2]}`;
            resolve(networkBase);
            return;
          }
        }
      }
      
      resolve(null);
    });
  }

  /**
   * Scan IP range for open ports
   */
  async scanRange(networkBase, port) {
    const promises = [];
    const openHosts = [];
    
    // Scan 192.168.x.1 to 192.168.x.254
    for (let i = 1; i <= 254; i++) {
      const host = `${networkBase}.${i}`;
      promises.push(this.testPort(host, port));
    }
    
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const host = `${networkBase}.${index + 1}`;
        openHosts.push(host);
      }
    });
    
    return openHosts;
  }

  /**
   * Test if a host has an open port
   */
  async testPort(host, port, timeout = 1000) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);
      
      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  /**
   * Test if host is running MonsterBox
   */
  async testMonsterBoxHost(host) {
    try {
      console.log(`🔍 Testing ${host} for MonsterBox...`);
      
      const axios = require('axios');
      
      // Test MonsterBox API endpoint - use goblin management stats
      const response = await axios.get(`http://${host}:3000/goblin-management/api/stats`, {
        timeout: 3000,
        headers: {
          'User-Agent': `MonsterBox-Goblin-${this.goblin.goblinId}`
        }
      });
      
      if (response.data && response.data.success !== undefined) {
        console.log(`🎃 Found MonsterBox at ${host}:3000!`);
        console.log(`📋 MonsterBox info: ${response.data.stats.total} goblins managed`);
        
        this.discoveredHosts.add(host);
        
        // Attempt to connect
        await this.goblin.handleMonsterBoxConnection(host, 3000);
        return true;
      }
      
    } catch (error) {
      // Not a MonsterBox or not accessible
      if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT') {
        console.log(`❓ ${host}:3000 - ${error.message}`);
      }
    }
    
    return false;
  }

  /**
   * Send UDP broadcast to find MonsterBox (alternative method)
   */
  async broadcastDiscover() {
    try {
      console.log('📡 Broadcasting discovery message...');
      
      if (!this.broadcastSocket) {
        this.broadcastSocket = dgram.createSocket('udp4');
        this.broadcastSocket.bind();
        
        this.broadcastSocket.on('message', (msg, rinfo) => {
          this.handleBroadcastResponse(msg, rinfo);
        });
      }
      
      const message = JSON.stringify({
        type: 'goblin-discover',
        goblinId: this.goblin.goblinId,
        timestamp: Date.now()
      });
      
      this.broadcastSocket.setBroadcast(true);
      this.broadcastSocket.send(message, 3001, '255.255.255.255');
      
    } catch (error) {
      console.error('❌ Broadcast error:', error);
    }
  }

  /**
   * Handle broadcast response
   */
  handleBroadcastResponse(message, rinfo) {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'monsterbox-response') {
        console.log(`📡 MonsterBox responded from ${rinfo.address}:${rinfo.port}`);
        this.goblin.handleMonsterBoxConnection(rinfo.address, data.port || 3000);
      }
      
    } catch (error) {
      // Ignore invalid responses
    }
  }

  /**
   * Get beacon status
   */
  getStatus() {
    return {
      active: this.isActive,
      discoveredHosts: Array.from(this.discoveredHosts),
      scanFrequency: this.scanFrequency,
      lastScan: this.lastScan
    };
  }
}

module.exports = BeaconService;