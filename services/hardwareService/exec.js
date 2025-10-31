/**
 * Hardware Service Execution Helper
 * Centralized child_process wrapper for Python hardware scripts
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const DEFAULT_CONFIG = {
    timeoutMs: 30000,  // 30 seconds to allow long-duration hardware movements
    pythonPath: '/usr/bin/python3',
    scriptsPath: path.resolve(__dirname, '../../../../scripts/hardware'),
    enableLogging: true
};

/**
 * Execute Python hardware script with timeout and error handling
 * @param {string[]} args - Command arguments (script path and parameters)
 * @param {Object} options - Execution options
 * @returns {Promise<string>} - Command output
 */
export function runPy(args, options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        if (config.enableLogging) {
            console.log(`🔧 Hardware Command: ${config.pythonPath} ${args.join(' ')}`);
        }

        const childProcess = spawn(config.pythonPath, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // Set up timeout
        const timeout = setTimeout(() => {
            childProcess.kill('SIGKILL');
            reject(new Error(`Hardware command timed out after ${config.timeoutMs}ms`));
        }, config.timeoutMs);

        // Collect output
        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle process completion
        childProcess.on('exit', (code) => {
            clearTimeout(timeout);

            console.log(`🔧 Process exited with code ${code} after ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

            if (code === 0) {
                // Success - log stdout as success, stderr as info (not error)
                const out = stdout.trim();
                const err = stderr.trim();
                if (config.enableLogging && out) {
                    console.log(`✅ Hardware Output: ${out}`);
                }
                if (config.enableLogging && err) {
                    // Filter noisy ALSA/JACK lines from info logs
                    const dropPatterns = [
                        /^ALSA lib/i,
                        /Cannot connect to server socket/i,
                        /Cannot connect to server request channel/i,
                        /jack server is not running/i,
                        /JackShmReadWritePtr/i,
                        /Unknown PCM/i,
                        /pcm_oss/i,
                        /pcm_a52/i,
                        /Invalid card/i,
                        /unable to open slave/i
                    ];
                    const filtered = err.split(/\r?\n/).filter(l => !dropPatterns.some(r => r.test(l))).join('\n').trim();
                    if (filtered) {
                        console.log(`ℹ️ Hardware Info: ${filtered}`);
                    }
                }
                resolve(out);
            } else {
                const errorMsg = stderr.trim() || `Process exited with code ${code}`;
                if (config.enableLogging) {
                    console.error(`❌ Hardware Error: ${errorMsg}`);
                }
                reject(new Error(errorMsg));
            }
        });

        childProcess.on('error', (error) => {
            clearTimeout(timeout);
            if (config.enableLogging) {
                console.error(`❌ Hardware Process Error: ${error.message}`);
            }
            reject(error);
        });
    });
}

/**
 * Execute hardware command with wrapper script
 * @param {string} wrapperScript - Python wrapper script name
 * @param {string[]} scriptArgs - Arguments for the wrapper script
 * @param {Object} options - Execution options
 * @returns {Promise<string>} - Command output
 */
export function runWrapper(wrapperScript, scriptArgs = [], options = {}) {
    // In CI or UI tests, short-circuit hardware calls to avoid I/O errors
    // Allow explicit override when running on real hardware by setting MONSTERBOX_HARDWARE_AVAILABLE=1
    const inTestMode = String(process.env.MB_TEST_MODE || '') === '1';
    const hardwareAvailable = String(process.env.MONSTERBOX_HARDWARE_AVAILABLE || '') === '1';
    if (inTestMode && !hardwareAvailable) {
        const payload = {
            status: 'success',
            message: `Simulated ${wrapperScript}`,
            args: scriptArgs
        };
        // Mirror runPy() contract by resolving a string output
        return Promise.resolve(JSON.stringify(payload));
    }
    const wrapperPath = path.resolve(__dirname, '../../python_wrappers', wrapperScript);
    const args = [wrapperPath, ...scriptArgs];
    return runPy(args, options);
}

/**
 * Test hardware connectivity
 * @returns {Promise<boolean>} - True if hardware is accessible
 */
export async function testHardware() {
    try {
        await runPy(['--version'], { timeoutMs: 3000 });
        return true;
    } catch (error) {
        console.warn('⚠️ Hardware test failed, running in simulation mode');
        return false;
    }
}

/**
 * Validate command arguments
 * @param {string[]} args - Arguments to validate
 * @param {number} minArgs - Minimum required arguments
 * @throws {Error} - If validation fails
 */
export function validateArgs(args, minArgs = 1) {
    if (!Array.isArray(args) || args.length < minArgs) {
        throw new Error(`Invalid arguments: expected at least ${minArgs} arguments`);
    }

    // Basic sanitization
    for (const arg of args) {
        if (typeof arg !== 'string' && typeof arg !== 'number') {
            throw new Error(`Invalid argument type: ${typeof arg}`);
        }

        const argStr = String(arg);
        if (argStr.includes('..') || argStr.includes(';') || argStr.includes('|')) {
            throw new Error(`Unsafe argument detected: ${argStr}`);
        }
    }
}

export default { runPy, runWrapper, testHardware, validateArgs };
