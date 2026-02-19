/**
 * Jaw Servo Daemon Manager
 * Manages a persistent Python process that controls PCA9685 servos.
 * Replaces per-frame Python spawn (~580ms) with fire-and-forget writes (<1ms).
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAEMON_SCRIPT = path.resolve(__dirname, '..', 'python_wrappers', 'jaw_servo_daemon.py');
const READY_TIMEOUT_MS = 5000;

let daemonProcess = null;
let readyPromise = null;
let readyResolve = null;
let isReady = false;
let isShuttingDown = false;

// Test/CI mode — don't spawn Python
const isTestMode = () =>
  (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') &&
  (process.env.CI === 'true' || process.env.CI === '1');

/**
 * Ensure the daemon process is running and ready.
 * Lazy-starts on first call; auto-restarts on crash.
 */
async function ensureRunning() {
  if (isTestMode()) return;
  if (daemonProcess && isReady) return;
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    isReady = false;
    isShuttingDown = false;

    try {
      daemonProcess = spawn('python3', [DAEMON_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });
    } catch (err) {
      readyPromise = null;
      readyResolve = null;
      reject(new Error(`Failed to spawn jaw servo daemon: ${err.message}`));
      return;
    }

    const rl = createInterface({ input: daemonProcess.stdout });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.status === 'ready' && !isReady) {
          isReady = true;
          console.log('🦷 Jaw servo daemon ready');
          if (readyResolve) readyResolve();
        }
        // We don't await individual ok/error responses — fire-and-forget
      } catch (_) {
        // Non-JSON output, ignore
      }
    });

    daemonProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.warn('🦷 Jaw daemon stderr:', msg);
    });

    daemonProcess.on('error', (err) => {
      console.error('🦷 Jaw daemon process error:', err.message);
      cleanup();
      if (readyResolve) {
        readyResolve = null;
        reject(new Error(`Jaw daemon error: ${err.message}`));
      }
    });

    daemonProcess.on('close', (code) => {
      if (!isShuttingDown) {
        console.warn(`🦷 Jaw daemon exited unexpectedly (code ${code})`);
      }
      cleanup();
    });

    // Timeout if daemon doesn't send ready
    setTimeout(() => {
      if (!isReady) {
        console.error('🦷 Jaw daemon ready timeout');
        cleanup();
        if (readyResolve) {
          readyResolve = null;
          reject(new Error('Jaw daemon ready timeout'));
        }
      }
    }, READY_TIMEOUT_MS);
  });

  return readyPromise;
}

function cleanup() {
  isReady = false;
  readyPromise = null;
  readyResolve = null;
  daemonProcess = null;
}

/**
 * Send an angle command to the daemon. Fire-and-forget — does NOT await response.
 * If daemon is not running, this is a no-op (call ensureRunning() first).
 */
function sendAngle(channel, angle, address) {
  if (isTestMode()) return;
  if (!daemonProcess || !isReady) return;

  const cmd = { cmd: 'set_angle', channel: Number(channel), angle: Number(angle) };
  if (address != null) cmd.address = Number(address);

  try {
    daemonProcess.stdin.write(JSON.stringify(cmd) + '\n');
  } catch (err) {
    console.warn('🦷 Jaw daemon write error:', err.message);
    cleanup();
  }
}

/**
 * Graceful shutdown of the daemon process.
 */
async function shutdown() {
  if (!daemonProcess) return;
  isShuttingDown = true;

  try {
    daemonProcess.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n');
  } catch (_) {
    // stdin may already be closed
  }

  // Give it 2 seconds to exit cleanly, then SIGTERM
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (daemonProcess) {
        try { daemonProcess.kill('SIGTERM'); } catch (_) {}
      }
      resolve();
    }, 2000);

    if (daemonProcess) {
      daemonProcess.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
    } else {
      clearTimeout(timer);
      resolve();
    }
  });

  cleanup();
  console.log('🦷 Jaw servo daemon shut down');
}

/**
 * Check if the daemon is currently running and ready.
 */
function isRunning() {
  return !!(daemonProcess && isReady);
}

export default {
  ensureRunning,
  sendAngle,
  shutdown,
  isRunning
};
