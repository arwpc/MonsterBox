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
    timeoutMs: 8000,
    pythonPath: 'python3',
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
        if (config.enableLogging) {
            console.log(`🔧 Hardware Command: ${config.pythonPath} ${args.join(' ')}`);
        }

        const process = spawn(config.pythonPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: config.scriptsPath
        });

        let stdout = '';
        let stderr = '';

        // Set up timeout
        const timeout = setTimeout(() => {
            process.kill('SIGKILL');
            reject(new Error(`Hardware command timed out after ${config.timeoutMs}ms`));
        }, config.timeoutMs);

        // Collect output
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle process completion
        process.on('exit', (code) => {
            clearTimeout(timeout);
            
            if (code === 0) {
                if (config.enableLogging && stdout.trim()) {
                    console.log(`✅ Hardware Output: ${stdout.trim()}`);
                }
                resolve(stdout.trim());
            } else {
                const errorMsg = stderr.trim() || `Process exited with code ${code}`;
                if (config.enableLogging) {
                    console.error(`❌ Hardware Error: ${errorMsg}`);
                }
                reject(new Error(errorMsg));
            }
        });

        process.on('error', (error) => {
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
    const wrapperPath = path.join(__dirname, '../../python_wrappers', wrapperScript);
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
