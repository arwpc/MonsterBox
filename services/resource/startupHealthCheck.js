/**
 * Startup Health Check
 * Runs at server start to validate system resources (RAM, CPU, disk, I2C, Python).
 * Results are logged and saved to data/startup-health.json for dashboard display.
 * Non-blocking: warnings are logged but never prevent startup.
 */

import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { isTestMode, getEnvironment } from './environment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', '..', 'data');

/**
 * Promisified exec with timeout.
 * @param {string} command
 * @param {Object} [options]
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 2000, ...options }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

/**
 * Run all startup health checks and return results.
 * Checks: memory, CPU load, disk space, I2C bus (skipped in test mode), Python3.
 * @returns {Promise<Object>} Health check results with overallStatus
 */
async function runStartupHealthCheck() {
    const results = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        environment: getEnvironment(),
        checks: {}
    };

    // 1. Free RAM
    const freeMB = Math.round(os.freemem() / (1024 * 1024));
    const totalMB = Math.round(os.totalmem() / (1024 * 1024));
    results.checks.memory = {
        freeMB,
        totalMB,
        percentFree: Math.round(freeMB / totalMB * 100),
        status: freeMB > 500 ? 'ok' : freeMB > 200 ? 'warning' : 'critical'
    };

    // 2. CPU load
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    results.checks.cpu = {
        load1m: loadAvg[0],
        load5m: loadAvg[1],
        load15m: loadAvg[2],
        cores: cpuCount,
        status: loadAvg[0] < cpuCount * 0.8 ? 'ok' :
                loadAvg[0] < cpuCount * 1.5 ? 'warning' : 'critical'
    };

    // 3. Disk space
    try {
        const { stdout } = await execAsync('df -BM --output=avail / | tail -1');
        const availMB = parseInt(stdout.trim(), 10);
        results.checks.disk = {
            availableMB: availMB,
            status: availMB > 1000 ? 'ok' : availMB > 500 ? 'warning' : 'critical'
        };
    } catch {
        results.checks.disk = { status: 'unknown', error: 'Could not check disk' };
    }

    // 4. I2C bus (for PCA9685 servo driver) — skip in test mode
    if (!isTestMode()) {
        try {
            await execAsync('i2cdetect -y 1 2>/dev/null | head -1', { timeout: 2000 });
            results.checks.i2c = { status: 'ok' };
        } catch {
            results.checks.i2c = { status: 'warning', error: 'I2C bus not accessible' };
        }
    }

    // 5. Python3 availability
    try {
        const { stdout } = await execAsync('python3 --version', { timeout: 2000 });
        results.checks.python = { status: 'ok', version: stdout.trim() };
    } catch {
        results.checks.python = { status: 'critical', error: 'Python3 not found' };
    }

    // Determine overall status
    const statuses = Object.values(results.checks).map(c => c.status);
    const overallStatus = statuses.includes('critical') ? 'CRITICAL' :
                          statuses.includes('warning') ? 'WARNING' : 'OK';

    // Log results with status icons
    console.log(`Startup health check: ${overallStatus}`);
    for (const [name, check] of Object.entries(results.checks)) {
        const icon = check.status === 'ok' ? '\u2713' :
                     check.status === 'warning' ? '\u26A0' : '\u2717';
        console.log(`  ${icon} ${name}: ${check.status}${check.error ? ` (${check.error})` : ''}`);
    }

    // Save for dashboard display
    results.overallStatus = overallStatus;
    try {
        await fs.writeFile(
            path.join(dataDir, 'startup-health.json'),
            JSON.stringify(results, null, 2)
        );
    } catch (err) {
        console.warn(`Could not save startup health results: ${err.message}`);
    }

    return results;
}

export { runStartupHealthCheck };
