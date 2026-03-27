/**
 * Process Priority Manager
 * Elevates MonsterBox process priority for responsive hardware control.
 * Gracefully degrades if running without sufficient privileges.
 */

import os from 'os';

/**
 * Set the process priority to -15 (elevated) for responsive hardware control.
 * Requires root or CAP_SYS_NICE capability.
 * @returns {{ success: boolean, nice: number, error?: string }}
 */
function setProcessPriority() {
    try {
        const current = os.getPriority(process.pid);
        // Already elevated (e.g. by systemd Nice=) — no need to escalate further
        if (current <= -5) {
            console.log(`Process priority already elevated (nice ${current})`);
            return { success: true, nice: current };
        }
        os.setPriority(process.pid, -15);
        console.log('Process priority set to -15 (elevated)');
        return { success: true, nice: -15 };
    } catch (err) {
        const current = os.getPriority(process.pid);
        if (current < 0) {
            // Systemd set a negative nice value — good enough
            console.log(`Process priority set by systemd (nice ${current})`);
            return { success: true, nice: current };
        }
        console.warn(`Could not set process priority: ${err.message}. Running at default priority.`);
        return { success: false, nice: current, error: err.message };
    }
}

/**
 * Get the current process priority (nice value).
 * @returns {{ success: boolean, nice: number, error?: string }}
 */
function getProcessPriority() {
    try {
        const nice = os.getPriority(process.pid);
        return { success: true, nice };
    } catch (err) {
        return { success: false, nice: 0, error: err.message };
    }
}

export { setProcessPriority, getProcessPriority };
