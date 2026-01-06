/**
 * Audio Health Monitor Service
 * Monitors WirePlumber/PipeWire health and automatically restarts if needed
 *
 * This service runs periodic health checks on the audio system to ensure
 * WirePlumber is running and responsive. If issues are detected, it attempts
 * automatic recovery.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

class AudioHealthMonitor {
  constructor() {
    this.checkInterval = 30000; // Check every 30 seconds
    this.intervalId = null;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3;
    this.lastCheckTime = null;
    this.lastCheckStatus = null;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 5;
    this.isMonitoring = false;

    console.log('🔊 Audio Health Monitor initialized');
  }

  /**
   * Start monitoring audio system health
   */
  start() {
    if (this.isMonitoring) {
      console.log('⚠️ Audio Health Monitor already running');
      return;
    }

    console.log('🔊 Starting Audio Health Monitor...');
    this.isMonitoring = true;

    // Run initial check
    this.checkHealth();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkHealth();
    }, this.checkInterval);

    console.log(`🔊 Audio Health Monitor started (checking every ${this.checkInterval / 1000}s)`);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    console.log('🔊 Stopping Audio Health Monitor...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isMonitoring = false;
    console.log('🔊 Audio Health Monitor stopped');
  }

  /**
   * Check audio system health
   */
  async checkHealth() {
    this.lastCheckTime = new Date();

    try {
      // Check if WirePlumber is responding
      const { stdout, stderr } = await execAsync('wpctl status', {
        timeout: 5000,
        env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1000' }
      });

      // If we got here, WirePlumber is responding
      if (this.consecutiveFailures > 0) {
        console.log('✅ Audio system recovered');
      }

      this.consecutiveFailures = 0;
      this.lastCheckStatus = 'healthy';

      // Parse output to check for audio devices
      const hasAudioDevices = stdout.includes('Sinks:') || stdout.includes('Sources:');
      if (!hasAudioDevices) {
        console.warn('⚠️ WirePlumber running but no audio devices detected');
        this.lastCheckStatus = 'no-devices';
      }

    } catch (error) {
      this.consecutiveFailures++;
      this.lastCheckStatus = 'unhealthy';

      console.error(`❌ Audio health check failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}):`, error.message);

      // Attempt recovery if we've had multiple consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        await this.attemptRecovery();
      }
    }
  }

  /**
   * Attempt to recover audio system
   */
  async attemptRecovery() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`❌ Maximum restart attempts (${this.maxRestartAttempts}) reached. Manual intervention required.`);
      return;
    }

    this.restartAttempts++;
    console.log(`🔄 Attempting audio system recovery (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);

    try {
      // Try restarting WirePlumber
      await execAsync('systemctl --user restart wireplumber', {
        timeout: 10000,
        env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1000' }
      });

      console.log('🔄 WirePlumber restart command sent');

      // Wait a bit for service to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if it worked
      try {
        await execAsync('wpctl status', {
          timeout: 5000,
          env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1000' }
        });

        console.log('✅ Audio system recovery successful');
        this.consecutiveFailures = 0;
        this.restartAttempts = 0;
        this.lastCheckStatus = 'recovered';

      } catch (checkError) {
        console.error('❌ Recovery attempt failed - WirePlumber still not responding');
        this.lastCheckStatus = 'recovery-failed';
      }

    } catch (error) {
      console.error('❌ Failed to restart WirePlumber:', error.message);
      this.lastCheckStatus = 'recovery-error';
    }
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      lastCheckTime: this.lastCheckTime,
      lastCheckStatus: this.lastCheckStatus,
      consecutiveFailures: this.consecutiveFailures,
      restartAttempts: this.restartAttempts,
      checkInterval: this.checkInterval
    };
  }

  /**
   * Get detailed audio system information
   */
  async getAudioInfo() {
    try {
      const { stdout } = await execAsync('wpctl status', {
        timeout: 5000,
        env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1000' }
      });

      return {
        available: true,
        output: stdout,
        timestamp: new Date()
      };

    } catch (error) {
      return {
        available: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Test audio playback
   */
  async testAudio() {
    try {
      // Try to play a test sound
      const testSoundPath = '/usr/share/sounds/alsa/Front_Center.wav';

      await execAsync(`aplay ${testSoundPath}`, {
        timeout: 10000,
        env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1000' }
      });

      return {
        success: true,
        message: 'Audio test successful'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reset restart attempt counter
   * Useful after manual intervention
   */
  resetRestartAttempts() {
    this.restartAttempts = 0;
    this.consecutiveFailures = 0;
    console.log('🔄 Restart attempt counter reset');
  }

  /**
   * Set check interval
   */
  setCheckInterval(intervalMs) {
    if (intervalMs < 5000) {
      console.warn('⚠️ Check interval too short, minimum is 5000ms');
      return false;
    }

    this.checkInterval = intervalMs;

    // Restart monitoring with new interval if currently running
    if (this.isMonitoring) {
      this.stop();
      this.start();
    }

    console.log(`🔊 Check interval set to ${intervalMs}ms`);
    return true;
  }
}

// Create singleton instance
const audioHealthMonitor = new AudioHealthMonitor();

export default audioHealthMonitor;

