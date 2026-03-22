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
        os.setPriority(process.pid, -15);
        console.log('Process priority set to -15 (elevated)');
        return { success: true, nice: -15 };
    } catch (err) {
        console.warn(`Could not set process priority: ${err.message}. Running at default priority.`);
        return { success: false, nice: os.getPriority(process.pid), error: err.message };
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
