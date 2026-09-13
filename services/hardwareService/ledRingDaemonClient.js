/**
 * LED Ring Daemon Client
 *
 * Talks to python_wrappers/led_ring_daemon.py over its Unix socket.
 *
 * Why a daemon and not a CLI spawn (the short version — the long one is in the
 * daemon's own header): WS2812B needs root for PWM/DMA, has no latch so an
 * animation is a continuous frame stream rather than a command, and the PWM
 * channel can only have one owner. monsterbox.service runs as User=remote, so
 * the daemon is spawned under sudo and Node reaches it through this socket.
 *
 * SCOPE CONTRACT: this module is a transport. It does not know about parts,
 * characters, or which pixels belong to which eye — services/ledController.js
 * owns all of that. Keeping the split means a caller cannot accidentally drive
 * the strip without going through the part resolution that keeps GPIO18 off
 * characters that use that pin for something else entirely.
 */

import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOCKET_PATH = process.env.MB_LED_SOCKET || '/tmp/monsterbox-led.sock';
const DAEMON_SCRIPT = path.resolve(__dirname, '../../python_wrappers/led_ring_daemon.py');
const CONNECT_TIMEOUT_MS = 1000;
const REQUEST_TIMEOUT_MS = 2000;
const SPAWN_SETTLE_MS = 2500;

let socket = null;
let connecting = null;
let buffer = '';
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, timer }

let daemonProcess = null;
let spawning = null;

// Remembered failure so a dead daemon does not cost a connect attempt per
// command. The speaking state pushes an audio level many times a second; without
// this, a stopped daemon would mean a socket connect per sample.
let unavailableUntil = 0;
const UNAVAILABLE_BACKOFF_MS = 3000;

const isTestMode = () => String(process.env.MB_TEST_MODE || '') === '1';

function teardown(err) {
    if (socket) {
        try { socket.destroy(); } catch (_) { /* already gone */ }
    }
    socket = null;
    buffer = '';
    for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(err || new Error('led daemon connection closed'));
    }
    pending.clear();
}

function onLine(line) {
    let msg;
    try {
        msg = JSON.parse(line);
    } catch (_) {
        return; // the daemon only ever emits JSON lines
    }
    const entry = msg.id != null ? pending.get(msg.id) : null;
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve(msg);
}

function connect() {
    if (socket) return Promise.resolve(socket);
    if (connecting) return connecting;

    connecting = new Promise((resolve, reject) => {
        const sock = net.createConnection({ path: SOCKET_PATH });
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { sock.destroy(); } catch (_) {}
            reject(new Error(`led daemon connect timeout (${SOCKET_PATH})`));
        }, CONNECT_TIMEOUT_MS);

        sock.once('connect', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket = sock;
            unavailableUntil = 0;
            resolve(sock);
        });

        sock.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx).trim();
                buffer = buffer.slice(idx + 1);
                if (line) onLine(line);
            }
        });

        sock.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
            teardown(err);
        });

        sock.on('close', () => teardown(new Error('led daemon socket closed')));
    }).finally(() => {
        connecting = null;
    });

    return connecting;
}

/**
 * Send one command and await its reply.
 * @throws if the daemon is unreachable, times out, or reports an error.
 */
async function request(payload, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (isTestMode()) throw new Error('led daemon disabled in test mode');
    if (Date.now() < unavailableUntil) throw new Error('led daemon unavailable (backoff)');

    let sock;
    try {
        sock = await connect();
    } catch (err) {
        unavailableUntil = Date.now() + UNAVAILABLE_BACKOFF_MS;
        throw err;
    }

    const id = nextId++;
    const message = JSON.stringify({ ...payload, id }) + '\n';

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`led daemon request timeout (${payload.cmd})`));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });

        try {
            sock.write(message);
        } catch (err) {
            pending.delete(id);
            clearTimeout(timer);
            teardown(err);
            reject(err);
        }
    });
}

/**
 * Fire-and-forget write. Used by the audio-level feed, which runs at speech
 * rate and must never make the caller wait for a reply — a dropped brightness
 * sample is invisible, a stalled TTS pipeline is not.
 */
function send(payload) {
    if (isTestMode()) return false;
    if (!socket) return false;
    try {
        socket.write(JSON.stringify(payload) + '\n');
        return true;
    } catch (_) {
        return false;
    }
}

/** @returns {Promise<boolean>} true if the daemon answered a ping. */
async function isAvailable() {
    try {
        const reply = await request({ cmd: 'ping' }, 500);
        return !!(reply && reply.status === 'pong');
    } catch (_) {
        return false;
    }
}

/**
 * Make sure a daemon owning the right geometry is running.
 *
 * Geometry comes from the caller (ultimately from the character's part config),
 * not from a constant here, so a build with a different pixel count or data pin
 * needs no code change. If a daemon is already listening we use it as-is rather
 * than restarting it — it may be mid-animation, and stealing the PWM channel is
 * the failure this whole design avoids.
 *
 * @param {{count:number, split:number, pin:number, dma?:number, channel?:number,
 *          freq?:number, colorOrder?:string}} geometry
 * @returns {Promise<boolean>} true if a daemon is reachable afterwards
 */
async function ensureDaemon(geometry) {
    if (isTestMode()) return false;
    // Clear any active backoff BEFORE probing: request() short-circuits during
    // the 3s unavailable window without ever touching the socket, so a live
    // daemon would false-negative and we would spawn a SECOND root daemon that
    // seizes the same PWM/DMA channel. The probe must actually reach the socket.
    resetAvailability();
    if (await isAvailable()) return true;
    if (spawning) return spawning;

    spawning = (async () => {
        if (!fs.existsSync(DAEMON_SCRIPT)) {
            console.warn('[ledRingDaemonClient] daemon script missing:', DAEMON_SCRIPT);
            return false;
        }

        const args = [
            '-n', '/usr/bin/python3', DAEMON_SCRIPT,
            '--count', String(geometry.count),
            '--split', String(geometry.split),
            '--pin', String(geometry.pin),
            '--socket', SOCKET_PATH
        ];
        if (geometry.dma != null) args.push('--dma', String(geometry.dma));
        if (geometry.channel != null) args.push('--channel', String(geometry.channel));
        if (geometry.freq != null) args.push('--freq', String(geometry.freq));
        if (geometry.colorOrder) args.push('--color-order', String(geometry.colorOrder));

        // sudo -n: the strip needs root, the web server does not run as root, and
        // a password prompt here would hang the request that triggered it.
        try {
            daemonProcess = spawn('sudo', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: false });
        } catch (err) {
            console.warn('[ledRingDaemonClient] spawn failed:', err.message);
            return false;
        }

        // An unhandled 'error' on a ChildProcess is an uncaught exception that
        // takes the whole web server down. spawn reports ENOENT/EAGAIN/ENOMEM
        // asynchronously via this event (not the synchronous try/catch above) —
        // fork failure under memory pressure is realistic on an RPi4B.
        daemonProcess.on('error', (err) => {
            console.warn('[ledRingDaemonClient] daemon process error:', err.message);
            daemonProcess = null;
        });
        daemonProcess.stderr.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.log('[led-daemon]', line);
        });
        daemonProcess.on('exit', (code) => {
            if (code !== 0 && code != null) {
                console.warn(`[ledRingDaemonClient] daemon exited with code ${code}`);
            }
            daemonProcess = null;
        });

        // Wait for the socket to answer rather than sleeping a fixed interval —
        // PixelStrip.begin() timing varies and a fixed guess is either slow or wrong.
        const deadline = Date.now() + SPAWN_SETTLE_MS;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 150));
            resetAvailability();
            if (await isAvailable()) return true;
        }
        console.warn('[ledRingDaemonClient] daemon did not answer within', SPAWN_SETTLE_MS, 'ms');
        return false;
    })().finally(() => {
        spawning = null;
    });

    return spawning;
}

/** Clear the "daemon is down" backoff, e.g. right after starting it. */
function resetAvailability() {
    unavailableUntil = 0;
}

/**
 * Blackout, then stop the daemon we spawned.
 *
 * Order matters: the shutdown command clears the pixels while the process is
 * still alive. Killing first would leave the strip holding its last frame,
 * because WS2812B latches whatever was clocked into it and keeps emitting it
 * with no host attached at all.
 */
async function shutdown() {
    try {
        await request({ cmd: 'off' }, 500);
        await request({ cmd: 'shutdown' }, 500);
    } catch (_) {
        // Daemon already gone or unreachable; the kill below is the fallback.
    }
    teardown(new Error('client shutting down'));
    if (daemonProcess) {
        try { daemonProcess.kill('SIGTERM'); } catch (_) { /* already dead */ }
        daemonProcess = null;
    }
}

/** Close the client connection. The daemon itself keeps running. */
function disconnect() {
    teardown(new Error('client disconnected'));
}

export default {
    SOCKET_PATH,
    DAEMON_SCRIPT,
    request,
    send,
    isAvailable,
    ensureDaemon,
    resetAvailability,
    shutdown,
    disconnect
};
