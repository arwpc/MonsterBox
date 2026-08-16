/**
 * Servo Daemon Client
 *
 * Talks to python_wrappers/servo_daemon.py over its Unix socket.
 *
 * This is the fast path for servo motion. The alternative — spawning
 * servo_cli.py per command — costs a Python interpreter start (~200-580ms) AND,
 * before v9.2.0, re-initialised the PCA9685 on every single command. Re-init
 * has to put the chip to sleep to write the prescaler, and sleeping stops the
 * oscillator, so every servo command blanked the PWM on all sixteen channels.
 * Measured on Orlok: 24 one-shot commands aimed at an unconnected channel
 * produced 11 chip-wide SLEEP events and 53 no-pulse reads on the head channel
 * in 8 seconds. That is the head twitch, and it is why concurrent motion was
 * impossible.
 *
 * SAFETY CONTRACT: this module is a transport. It does not know about
 * calibration profiles or config/hardware-safety.json, and it must never be the
 * place where limits are decided. Callers apply applySafetyLimits() first and
 * pass the resulting window down as min/max so the daemon can clamp again as a
 * backstop. Narrowing only — nothing here may widen a limit.
 */

import net from 'net';

const SOCKET_PATH = process.env.MB_SERVO_SOCKET || '/tmp/monsterbox-servo.sock';
const CONNECT_TIMEOUT_MS = 1000;
const REQUEST_TIMEOUT_MS = 2000;

let socket = null;
let connecting = null;
let buffer = '';
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, timer }

// Remembered failure so a dead daemon does not cost a connect attempt per
// command. Cleared on the next successful connect or by resetAvailability().
let unavailableUntil = 0;
const UNAVAILABLE_BACKOFF_MS = 3000;

const isTestMode = () =>
    String(process.env.MB_TEST_MODE || '') === '1' && String(process.env.CI || '') === 'true';

function teardown(err) {
    if (socket) {
        try { socket.destroy(); } catch (_) { /* already gone */ }
    }
    socket = null;
    buffer = '';
    for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(err || new Error('servo daemon connection closed'));
    }
    pending.clear();
}

function onLine(line) {
    let msg;
    try {
        msg = JSON.parse(line);
    } catch (_) {
        return; // daemon only ever emits JSON lines; ignore anything else
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
            reject(new Error(`servo daemon connect timeout (${SOCKET_PATH})`));
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

        sock.on('close', () => teardown(new Error('servo daemon socket closed')));
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
    if (isTestMode()) throw new Error('servo daemon disabled in CI test mode');
    if (Date.now() < unavailableUntil) throw new Error('servo daemon unavailable (backoff)');

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
            reject(new Error(`servo daemon request timeout (${payload.cmd})`));
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
 * Make sure the daemon process exists before trying to use it.
 *
 * The daemon is spawned as python_wrappers/jaw_servo_daemon.py, which since
 * v9.2.0 is the general servo daemon (it serves the jaw stdin protocol AND this
 * socket). Reusing that one lifecycle owner is deliberate: two processes each
 * "owning" the I2C bus is precisely the bug being fixed here.
 */
async function ensureDaemon() {
    if (isTestMode()) return false;
    try {
        const mod = await import('../jawServoDaemon.js');
        const jawServoDaemon = mod.default || mod;
        if (!jawServoDaemon.isRunning()) {
            await jawServoDaemon.ensureRunning();
        }
        return true;
    } catch (err) {
        console.warn('[servoDaemonClient] could not start servo daemon:', err.message);
        return false;
    }
}

/**
 * @returns {Promise<boolean>} true if the daemon answered a ping.
 */
async function isAvailable() {
    try {
        const reply = await request({ cmd: 'ping' }, 500);
        return reply && reply.status === 'pong';
    } catch (_) {
        return false;
    }
}

/**
 * Drive several channels together.
 *
 * The daemon writes every channel back-to-back while holding its bus lock, so
 * the moves land ~0.3ms apart instead of being interleaved with — or blanked
 * by — other callers. This is the call the gesture engine's concurrent motion
 * ultimately depends on.
 *
 * @param {Array<{channel:number, angle:number, min?:number, max?:number}>} moves
 * @param {{address?:number, timeoutMs?:number}} [options]
 * @returns {Promise<Array<{channel:number, angle:number, status:string}>>}
 */
async function moveMany(moves, options = {}) {
    if (!Array.isArray(moves) || moves.length === 0) return [];

    const payload = {
        cmd: 'set_angles',
        moves: moves.map((m) => {
            const move = { channel: Number(m.channel), angle: Number(m.angle) };
            if (m.min != null && Number.isFinite(Number(m.min))) move.min = Number(m.min);
            if (m.max != null && Number.isFinite(Number(m.max))) move.max = Number(m.max);
            return move;
        })
    };
    if (options.address != null) payload.address = Number(options.address);

    const reply = await request(payload, options.timeoutMs || REQUEST_TIMEOUT_MS);
    if (!reply || reply.status !== 'ok') {
        throw new Error((reply && reply.message) || 'servo daemon rejected batch');
    }
    return reply.results || [];
}

/**
 * Drive a single channel. Same guarantees as moveMany with one move.
 */
async function moveOne(channel, angle, options = {}) {
    const results = await moveMany([{ channel, angle, min: options.min, max: options.max }], options);
    const result = results[0];
    if (result && result.status === 'error') {
        throw new Error(result.error || `servo daemon failed on channel ${channel}`);
    }
    return result;
}

/**
 * Stop driving a channel. Used as the fail-safe when a command cannot be
 * trusted — a released channel holds nothing rather than holding garbage.
 */
async function release(channel, options = {}) {
    const payload = { cmd: 'release', channel: Number(channel) };
    if (options.address != null) payload.address = Number(options.address);
    const reply = await request(payload);
    return !!(reply && reply.status === 'ok');
}

/** Clear the "daemon is down" backoff, e.g. after restarting it. */
function resetAvailability() {
    unavailableUntil = 0;
}

/** Close the client connection. The daemon itself keeps running. */
function disconnect() {
    teardown(new Error('client disconnected'));
}

export default {
    SOCKET_PATH,
    ensureDaemon,
    isAvailable,
    moveMany,
    moveOne,
    release,
    request,
    resetAvailability,
    disconnect
};
