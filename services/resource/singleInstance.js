/**
 * Single Instance Manager
 * Prevents multiple MonsterBox processes from running simultaneously,
 * which would cause GPIO/I2C conflicts on the Raspberry Pi.
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', '..', 'data');
const pidFile = path.join(dataDir, 'monsterbox.pid');

/**
 * Check if a process with the given PID is currently running.
 * @param {number} pid - Process ID to check
 * @returns {boolean} true if the process exists
 */
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // EPERM means the process exists but is owned by another user — it IS
        // running. Only ESRCH (and other errors) mean the process is gone.
        return err.code === 'EPERM';
    }
}

/**
 * Verify a live PID actually belongs to a MonsterBox server, not an unrelated
 * program that happened to reuse the PID after a reboot/crash (which would make
 * a stale lock look live and block startup forever). Reads /proc/<pid>/cmdline;
 * if that can't be read (non-Linux, permissions, race), conservatively assume it
 * IS ours so we never start a second instance against a real running server.
 * @param {number} pid
 * @returns {Promise<boolean>}
 */
async function isMonsterBoxProcess(pid) {
    try {
        const raw = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
        const cmdline = raw.replace(/\0/g, ' ');
        return /node/.test(cmdline) && /(server\.js|MonsterBox)/i.test(cmdline);
    } catch (_) {
        return true;
    }
}

/**
 * Acquire the PID lock file. If another instance is running, exit.
 * If a stale PID file exists from a crash, remove it and proceed.
 * @returns {Promise<boolean>} true if lock was acquired
 */
async function acquireLock() {
    try {
        const content = await fs.readFile(pidFile, 'utf8');
        const existingPid = parseInt(content.trim(), 10);

        if (!isNaN(existingPid) && isProcessRunning(existingPid) && await isMonsterBoxProcess(existingPid)) {
            console.error(`MonsterBox already running (PID ${existingPid}). Exiting.`);
            process.exit(1);
        } else {
            console.warn(`Removing stale PID file (PID ${existingPid} not a running MonsterBox process)`);
            await fs.unlink(pidFile);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`Error reading PID file: ${err.message}`);
        }
        // No PID file exists, proceed
    }

    await fs.writeFile(pidFile, String(process.pid));
    console.log(`PID file created: ${process.pid}`);
    return true;
}

/**
 * Remove the PID lock file during shutdown.
 */
async function removeLock() {
    try {
        await fs.unlink(pidFile);
        console.log('PID file removed');
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`Could not remove PID file: ${err.message}`);
        }
    }
}

/**
 * Kill any orphaned Python hardware processes left over from a previous crash.
 * Non-fatal — failures are silently ignored.
 */
async function cleanupOrphanedProcesses() {
    const patterns = ['jaw_servo_daemon', 'head_tracking_cli', 'servo_cli'];
    for (const pattern of patterns) {
        try {
            execSync(`pkill -f "${pattern}.py"`, { timeout: 2000 });
            console.log(`Cleaned up orphaned ${pattern}.py process`);
        } catch {
            // No matching process or pkill not available — fine
        }
    }
}

export { acquireLock, removeLock, cleanupOrphanedProcesses, isProcessRunning };
