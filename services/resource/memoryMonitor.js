/**
 * Memory Monitor
 * Watches RSS memory usage and warns before OOM on Raspberry Pi 4B.
 * Uses configurable thresholds with cooldown to avoid log spam.
 */

import os from 'os';

class MemoryMonitor {
    /**
     * @param {Object} options
     * @param {number} [options.warningThresholdMB=512] - RSS MB threshold for warning level
     * @param {number} [options.criticalThresholdMB=1024] - RSS MB threshold for critical level
     * @param {number} [options.checkIntervalMs=30000] - Check interval in milliseconds
     */
    constructor(options = {}) {
        this.warningThresholdMB = options.warningThresholdMB || 512;
        this.criticalThresholdMB = options.criticalThresholdMB || 1024;
        this.checkIntervalMs = options.checkIntervalMs || 30000;
        this.intervalHandle = null;
        this.lastWarning = 0;
        this.warningCooldownMs = 300000; // 5 minutes between warning logs
        this.lastReading = null;
    }

    /**
     * Start the periodic memory check interval.
     * Uses .unref() so the timer does not prevent process exit.
     */
    start() {
        this.intervalHandle = setInterval(() => this.check(), this.checkIntervalMs);
        this.intervalHandle.unref();
        console.log(`Memory monitor started (warning: ${this.warningThresholdMB}MB, critical: ${this.criticalThresholdMB}MB, interval: ${this.checkIntervalMs}ms)`);
    }

    /**
     * Perform a memory usage check.
     * @returns {{ rssMB: number, heapUsedMB: number, heapTotalMB: number, systemFreeMB: number, systemTotalMB: number, level: string }}
     */
    check() {
        const usage = process.memoryUsage();
        const rssMB = usage.rss / (1024 * 1024);
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        const heapTotalMB = usage.heapTotal / (1024 * 1024);

        const result = {
            rssMB: Math.round(rssMB * 10) / 10,
            heapUsedMB: Math.round(heapUsedMB * 10) / 10,
            heapTotalMB: Math.round(heapTotalMB * 10) / 10,
            systemFreeMB: Math.round(os.freemem() / (1024 * 1024)),
            systemTotalMB: Math.round(os.totalmem() / (1024 * 1024)),
            level: 'normal'
        };

        const now = Date.now();
        if (rssMB > this.criticalThresholdMB) {
            result.level = 'critical';
            if (now - this.lastWarning > this.warningCooldownMs) {
                console.error(`CRITICAL: Memory RSS ${rssMB.toFixed(0)}MB exceeds ${this.criticalThresholdMB}MB threshold`);
                this.lastWarning = now;
            }
        } else if (rssMB > this.warningThresholdMB) {
            result.level = 'warning';
            if (now - this.lastWarning > this.warningCooldownMs) {
                console.warn(`WARNING: Memory RSS ${rssMB.toFixed(0)}MB exceeds ${this.warningThresholdMB}MB threshold`);
                this.lastWarning = now;
            }
        }

        this.lastReading = result;
        return result;
    }

    /**
     * Get the most recent memory reading, or perform a fresh check if none cached.
     * @returns {{ rssMB: number, heapUsedMB: number, heapTotalMB: number, systemFreeMB: number, systemTotalMB: number, level: string }}
     */
    getLastReading() {
        return this.lastReading || this.check();
    }

    /**
     * Stop the periodic memory check.
     */
    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }
}

export { MemoryMonitor };
