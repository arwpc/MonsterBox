/**
 * LED Controller — addressable RGB ring state machine
 *
 * Public surface for the WS2812B eye rings. Everything above the hardware layer
 * (scenes, routes, the speech pipeline, manual controls) talks to this module
 * and nothing else.
 *
 *   await ledController.setState('thinking', { color: [0, 120, 255] });
 *   ledController.on('state', ({ state }) => ...);
 *
 * Character independence
 * ----------------------
 * The geometry is NOT hardcoded here. It is read from the character's own
 * `led_ring` part, and if the active character has no such part every call
 * becomes a no-op that reports `{ success: false, reason: 'no-led-part' }`.
 *
 * That is a safety property, not just tidiness. The pin that clocks pixels on one
 * character is, on another character in this same fleet, the direction line of a
 * linear actuator — the pin numbers genuinely overlap across characters. Code
 * deploys to every node unchanged, so a controller that assumed "this pin is
 * LEDs" would toggle a motor direction line on a node where that pin means
 * something else entirely. Resolving through the character's own part registry
 * is what keeps that from happening.
 *
 * Non-blocking
 * ------------
 * No call here waits on an animation. Frames are rendered by the Python daemon
 * on its own thread; Node sends a state and returns. The audio feed uses a
 * fire-and-forget write so speech never waits on a socket round trip.
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ledDaemon from './hardwareService/ledRingDaemonClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

export const LED_STATES = Object.freeze([
    'off', 'idle', 'listening', 'thinking', 'speaking', 'error', 'fade'
]);

// States that can carry a saved colour. 'off' is excluded on purpose: a colour
// for "dark" is a contradiction, and storing one invites a future caller to
// light the rings while the box believes it is off.
export const LED_COLORABLE_STATES = Object.freeze([
    'idle', 'listening', 'thinking', 'speaking', 'error', 'fade'
]);

export const LED_PART_TYPE = 'led_ring';

// Speaking is authoritative while the character is talking. For this long after
// the last audio level (or a setState('speaking')), interaction states
// (idle/listening/thinking/error/fade) cannot override the speaking look — so
// the eyes never fall back to the idle "purple" or thinking "blue" mid-sentence,
// no matter what the conversation lifecycle, jaw, or sway does. It expires
// shortly after speech stops so the eyes still return to listening/idle. Long
// enough to ride inter-chunk audio gaps; short enough that turn-end is snappy.
const SPEAKING_HOLD_MS = 700;
const HELD_DURING_SPEAKING = new Set(['idle', 'listening', 'thinking', 'error', 'fade']);

// Defaults describe the DIYMall X0040MB5LN pair as wired on PumpkinHead. They
// are a fallback for a part that omits a field, never a substitute for the part.
const GEOMETRY_DEFAULTS = Object.freeze({
    pixelCount: 16,
    ringSplit: 8,
    gpioPin: 18,
    dma: 10,
    pwmChannel: 0,
    brightness: 60,
    dataRateHz: 800000,
    colorOrder: 'GRB'
});

// Channel orders the daemon accepts. A part config outside this set falls back
// to GRB (the WS2812B norm) rather than failing the whole strip at spawn time.
const COLOR_ORDERS = Object.freeze(['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR']);

// Palette cross-fade timing when the part saves none. Slow on purpose: eyes
// that change colour faster than about a second read as a fault light.
const FADE_DEFAULTS = Object.freeze({ fadeMs: 1200, holdMs: 600 });

/** [r,g,b] with every channel a real 0-255 integer, or null if it is not that. */
function normalizeRgb(value) {
    if (!Array.isArray(value) || value.length !== 3) return null;
    const out = value.map((c) => {
        const n = Number(c);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.min(255, Math.round(n)));
    });
    return out.some((c) => c === null) ? null : out;
}

/** A list of valid [r,g,b], or null. One bad entry rejects the whole list —
 *  see the daemon's _coerce_palette for why partial palettes are refused. */
function normalizePalette(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    const out = [];
    for (const entry of value) {
        const rgb = normalizeRgb(entry);
        if (!rgb) return null;
        out.push(rgb);
    }
    return out;
}

class LedController extends EventEmitter {
    constructor() {
        super();
        this.activeCharacterId = null;
        this.part = null;
        this.geometry = null;
        this.currentState = 'off';
        this.currentOptions = {};
        this._speakingUntil = 0;   // epoch ms until which 'speaking' is authoritative
        this._pendingState = null; // interaction state requested while speaking-held
        this._holdTimer = null;    // one-shot that applies _pendingState after the hold
        this.available = false;
        this._partCache = new Map();   // characterId -> part | null
        this._starting = null;
    }

    /**
     * Emit a failure without ever taking the process down.
     *
     * Node throws if an 'error' event is emitted with no listener attached, so a
     * bare this.emit('error', ...) here turns a mistyped state name or a daemon
     * hiccup into a crashed web server. Callers already get the failure in the
     * returned result; the event is for observers, and an unobserved failure
     * belongs in the log rather than in an exception.
     */
    _emitError(err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('led:error', error);
        if (this.listenerCount('error') > 0) this.emit('error', error);
        else console.warn('[ledController]', error.message);
        return error;
    }

    /**
     * Point the controller at a character. Called at boot and whenever the
     * selected character changes; safe to call repeatedly.
     * @returns {Promise<boolean>} true if that character has a usable LED part
     */
    async initialize(characterId) {
        const id = Number(characterId);
        if (!Number.isFinite(id)) return false;

        if (this.activeCharacterId !== id) {
            // Different character: whatever is lit belongs to the old one.
            await this.off().catch(() => {});
            this.activeCharacterId = id;
            this.part = null;
            this.geometry = null;
        }

        const part = await this._resolvePart(id);
        if (!part) {
            this.available = false;
            this.emit('unavailable', { characterId: id, reason: 'no-led-part' });
            return false;
        }

        this.part = part;
        this.geometry = this._geometryFor(part);
        const up = await ledDaemon.ensureDaemon({
            count: this.geometry.pixelCount,
            split: this.geometry.ringSplit,
            pin: this.geometry.gpioPin,
            dma: this.geometry.dma,
            channel: this.geometry.pwmChannel,
            freq: this.geometry.dataRateHz,
            colorOrder: this.geometry.colorOrder
        });

        this.available = up;
        if (up) {
            await this.setBrightness(this.geometry.brightness).catch(() => {});
            this.emit('available', { characterId: id, geometry: this.geometry });
        } else {
            this.emit('unavailable', { characterId: id, reason: 'daemon-unreachable' });
        }
        return up;
    }

    /**
     * Drive a named state.
     *
     * @param {string} state one of LED_STATES
     * @param {object} [options]
     * @param {number[]} [options.color]       [r,g,b] 0-255, primary ring
     * @param {number[]} [options.colorRight]  [r,g,b] for the second ring
     * @param {number}   [options.speed]       animation rate multiplier (1 = nominal)
     * @param {number}   [options.brightness]  master brightness 0-100
     * @param {string}   [options.target]      'left' | 'right' | 'both'
     * @param {number}   [options.characterId] override the active character
     * @returns {Promise<{success:boolean, state?:string, reason?:string}>}
     */
    async setState(state, options = {}) {
        const wanted = String(state || '').toLowerCase();
        if (!LED_STATES.includes(wanted)) {
            const err = `unknown LED state '${state}'; expected one of ${LED_STATES.join(', ')}`;
            this._emitError(err);
            return { success: false, reason: 'unknown-state', error: err };
        }

        // Speaking wins while audio is flowing: refuse to demote the eyes to an
        // interaction state until the speaking hold expires. 'speaking', 'off',
        // and an explicit { force:true } (e.g. the operator disabling LED, or a
        // deliberate restore) always pass.
        if (wanted !== 'speaking' && wanted !== 'off' && !options.force
            && HELD_DURING_SPEAKING.has(wanted) && Date.now() < this._speakingUntil) {
            // Remember the most recent request so the eyes still transition to it
            // (e.g. 'listening') once speaking actually stops, instead of sticking.
            this._pendingState = { state: wanted, characterId: options.characterId };
            this._scheduleHoldRelease();
            return { success: true, held: true, state: this.currentState, reason: 'speaking-active' };
        }

        const ready = await this._ensureReady(options.characterId);
        if (!ready.ok) return { success: false, reason: ready.reason };

        const { characterId, force, ...explicit } = options;
        // Saved colours are DEFAULTS, not overrides: an explicit colour from a
        // scene step or the live picker must still win, or the operator could
        // never preview anything that differs from what is stored on the part.
        const daemonOptions = { ...this.paletteFor(wanted), ...explicit };
        try {
            const reply = await ledDaemon.request({
                cmd: 'set_state',
                state: wanted,
                options: daemonOptions
            });
            if (!reply || reply.status !== 'ok') {
                const message = (reply && reply.message) || 'led daemon rejected state';
                this._emitError(message);
                return { success: false, reason: 'daemon-error', error: message };
            }
            this.currentState = wanted;
            // Engage the speaking hold on 'speaking'; any other applied state ends it.
            this._speakingUntil = (wanted === 'speaking') ? Date.now() + SPEAKING_HOLD_MS : 0;
            if (wanted !== 'speaking') this._pendingState = null;   // an applied state supersedes any pending one
            this.currentOptions = daemonOptions;
            this.emit('state', { state: wanted, options: daemonOptions, characterId: this.activeCharacterId });
            return { success: true, state: wanted };
        } catch (err) {
            this.available = false;
            this._emitError(err);
            return { success: false, reason: 'unreachable', error: err.message };
        }
    }

    /**
     * After the speaking hold expires (audio has actually stopped, not just a
     * brief inter-chunk gap), apply whatever interaction state was requested
     * while we were holding — so the eyes transition to 'listening'/'idle'
     * instead of sticking on the speaking look. If audio resumed (the hold was
     * refreshed), wait again.
     */
    _scheduleHoldRelease() {
        if (this._holdTimer) return;
        const delay = Math.max(50, this._speakingUntil - Date.now() + 40);
        this._holdTimer = setTimeout(() => {
            this._holdTimer = null;
            if (Date.now() < this._speakingUntil) { this._scheduleHoldRelease(); return; }
            const pend = this._pendingState;
            this._pendingState = null;
            if (pend && this.currentState === 'speaking') {
                this.setState(pend.state, { characterId: pend.characterId, force: true }).catch(() => {});
            }
        }, delay);
        if (this._holdTimer && typeof this._holdTimer.unref === 'function') this._holdTimer.unref();
    }

    /** Blackout. Always safe, even with no part and no daemon. */
    async off() {
        this._speakingUntil = 0;   // blackout ends any speaking hold
        this._pendingState = null;
        if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
        if (!this.available) {
            this.currentState = 'off';
            return { success: true, state: 'off', reason: 'already-dark' };
        }
        try {
            await ledDaemon.request({ cmd: 'off' });
            this.currentState = 'off';
            this.emit('state', { state: 'off', characterId: this.activeCharacterId });
            return { success: true, state: 'off' };
        } catch (err) {
            this._emitError(err);
            return { success: false, reason: 'unreachable', error: err.message };
        }
    }

    /** @param {number} brightness 0-100 */
    async setBrightness(brightness) {
        const value = Number(brightness);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
            return { success: false, reason: 'invalid-brightness' };
        }
        const ready = await this._ensureReady();
        if (!ready.ok) return { success: false, reason: ready.reason };
        try {
            await ledDaemon.request({ cmd: 'set_brightness', brightness: value });
            this.emit('brightness', { brightness: value });
            return { success: true, brightness: value };
        } catch (err) {
            this._emitError(err);
            return { success: false, reason: 'unreachable', error: err.message };
        }
    }

    /**
     * Feed the speaking animation an amplitude.
     *
     * Deliberately synchronous and unawaited: this is called at speech rate from
     * the audio pipeline, and a dropped sample costs one frame of brightness
     * while a blocked call would stall playback. Rise is immediate and decay is
     * handled in the daemon, so a stalled feed fades out instead of freezing.
     *
     * @param {number} level 0..1
     * @param {{replace?:boolean}} [options] replace:true tracks the level
     *        directly (down as well as up) instead of latching the peak — used
     *        by jaw sync, which feeds an already-enveloped openness at frame rate.
     */
    pushAudioLevel(level, options = {}) {
        if (!this.available || this.currentState !== 'speaking') return false;
        const value = Number(level);
        if (!Number.isFinite(value)) return false;
        // Every level keeps speaking authoritative while audio is flowing.
        this._speakingUntil = Date.now() + SPEAKING_HOLD_MS;
        return ledDaemon.send({
            cmd: 'audio_level',
            level: Math.max(0, Math.min(1, value)),
            set: options.replace === true
        });
    }

    /**
     * Write explicit pixel colours — manual control, part testing, and the
     * calibration UI. Leaves the animator and re-enters it on the next setState.
     * @param {Array<number[]>} pixels array of [r,g,b]
     * @param {{target?:string, characterId?:number}} [options]
     */
    async setPixels(pixels, options = {}) {
        if (!Array.isArray(pixels)) return { success: false, reason: 'invalid-pixels' };
        const ready = await this._ensureReady(options.characterId);
        if (!ready.ok) return { success: false, reason: ready.reason };
        try {
            const reply = await ledDaemon.request({
                cmd: 'set_pixels',
                pixels,
                target: options.target || 'both'
            });
            if (!reply || reply.status !== 'ok') {
                return { success: false, reason: 'daemon-error', error: reply && reply.message };
            }
            this.currentState = 'manual';
            this.emit('state', { state: 'manual', characterId: this.activeCharacterId });
            return { success: true, pixels: reply.pixels };
        } catch (err) {
            this._emitError(err);
            return { success: false, reason: 'unreachable', error: err.message };
        }
    }

    /** Current state as the daemon sees it, falling back to the local view. */
    async getStatus() {
        const base = {
            characterId: this.activeCharacterId,
            available: this.available,
            state: this.currentState,
            options: this.currentOptions,
            part: this.part ? { id: this.part.id, name: this.part.name } : null,
            geometry: this.geometry,
            states: LED_STATES
        };
        if (!this.available) return base;
        try {
            const reply = await ledDaemon.request({ cmd: 'state' }, 800);
            if (reply && reply.status === 'ok') {
                return {
                    ...base,
                    state: reply.state,
                    options: reply.options,
                    brightness: reply.brightness,
                    audioLevel: reply.audioLevel,
                    pixels: reply.pixels,
                    split: reply.split
                };
            }
        } catch (_) {
            this.available = false;
        }
        return base;
    }

    /**
     * Clear the strip and stop the daemon. Wired into server.js gracefulShutdown.
     *
     * WS2812B holds its last frame with no host attached, so "the process died"
     * does not mean "the lights went out" — without this the eyes stay lit after
     * the service stops.
     */
    async shutdown() {
        try {
            await ledDaemon.shutdown();
            this.available = false;
            this.currentState = 'off';
            this.emit('shutdown');
            return true;
        } catch (err) {
            this._emitError(err);
            return false;
        }
    }

    /**
     * The saved look for a state, as daemon options.
     *
     * Returns `{}` when the part stores nothing, which leaves the daemon on its
     * own built-in defaults — so an un-configured ring still animates rather
     * than going dark.
     *
     * @param {string} state
     * @returns {{color?:number[], colorRight?:number[], palette?:number[][],
     *            paletteRight?:number[][], fadeMs?:number, holdMs?:number}}
     */
    paletteFor(state) {
        const cfg = (this.part && this.part.config) || {};
        const out = {};

        const saved = (cfg.colors && cfg.colors[state]) || null;
        if (saved) {
            const left = normalizeRgb(saved.left);
            const right = normalizeRgb(saved.right);
            if (left) out.color = left;
            if (right) out.colorRight = right;
        }

        if (state === 'fade') {
            const palette = normalizePalette(cfg.palette);
            const paletteRight = normalizePalette(cfg.paletteRight);
            if (palette) out.palette = palette;
            if (paletteRight) out.paletteRight = paletteRight;
            out.fadeMs = Number.isFinite(Number(cfg.fadeMs)) ? Number(cfg.fadeMs) : FADE_DEFAULTS.fadeMs;
            out.holdMs = Number.isFinite(Number(cfg.holdMs)) ? Number(cfg.holdMs) : FADE_DEFAULTS.holdMs;
        }
        return out;
    }

    /** The colour block as the UI wants to render it, with defaults filled in,
     *  for the CURRENTLY active part. */
    colorConfig() {
        return this._colorConfigFor(this.part, this.geometry);
    }

    /** Same, but for an explicit part/geometry — so a save for a non-active
     *  character returns THAT character's config rather than the active one's. */
    _colorConfigFor(part, geometry) {
        const cfg = (part && part.config) || {};
        const colors = {};
        for (const state of LED_COLORABLE_STATES) {
            const saved = (cfg.colors && cfg.colors[state]) || {};
            colors[state] = {
                left: normalizeRgb(saved.left),
                right: normalizeRgb(saved.right)
            };
        }
        return {
            colors,
            palette: normalizePalette(cfg.palette) || [],
            paletteRight: normalizePalette(cfg.paletteRight) || [],
            fadeMs: Number.isFinite(Number(cfg.fadeMs)) ? Number(cfg.fadeMs) : FADE_DEFAULTS.fadeMs,
            holdMs: Number.isFinite(Number(cfg.holdMs)) ? Number(cfg.holdMs) : FADE_DEFAULTS.holdMs,
            defaultState: cfg.defaultState || 'idle',
            brightness: geometry ? geometry.brightness : GEOMETRY_DEFAULTS.brightness,
            states: LED_COLORABLE_STATES
        };
    }

    /**
     * Persist the colour block onto the character's led_ring part.
     *
     * Merges into the existing config rather than replacing it: geometry
     * (pin, pixel count, split, dma) is wiring truth and must survive a colour
     * edit. Rewrites parts.json in place and drops the cached part so the very
     * next setState picks the new colours up without a restart.
     */
    async saveColorConfig(patch, characterId) {
        const id = characterId != null ? Number(characterId) : this.activeCharacterId;
        if (id == null || !Number.isFinite(id)) return { success: false, reason: 'no-character' };

        const file = path.join(DATA_DIR, `character-${id}`, 'parts.json');
        let parts;
        try {
            parts = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (err) {
            return { success: false, reason: 'no-parts-file', error: err.message };
        }

        const index = parts.findIndex((p) =>
            String(p.type || '').toLowerCase() === LED_PART_TYPE && p.enabled !== false);
        if (index < 0) return { success: false, reason: 'no-led-part' };

        const config = { ...(parts[index].config || {}) };

        if (patch && patch.colors && typeof patch.colors === 'object') {
            const colors = { ...(config.colors || {}) };
            for (const state of LED_COLORABLE_STATES) {
                const entry = patch.colors[state];
                if (!entry) continue;
                const left = normalizeRgb(entry.left);
                const right = normalizeRgb(entry.right);
                const merged = {};
                if (left) merged.left = left;
                if (right) merged.right = right;
                if (Object.keys(merged).length) colors[state] = merged;
                else delete colors[state];
            }
            config.colors = colors;
        }

        if (patch && 'palette' in patch) config.palette = normalizePalette(patch.palette) || [];
        if (patch && 'paletteRight' in patch) config.paletteRight = normalizePalette(patch.paletteRight) || [];
        for (const key of ['fadeMs', 'holdMs', 'brightness']) {
            if (patch && key in patch) {
                const value = Number(patch[key]);
                if (Number.isFinite(value) && value >= 0) config[key] = value;
            }
        }
        if (patch && patch.defaultState && LED_STATES.includes(String(patch.defaultState))) {
            config.defaultState = String(patch.defaultState);
        }

        parts[index] = { ...parts[index], config, updated: new Date().toISOString() };
        try {
            await fs.writeFile(file, JSON.stringify(parts, null, 2) + '\n', 'utf8');
        } catch (err) {
            return { success: false, reason: 'write-failed', error: err.message };
        }

        this.invalidatePartCache(id);
        const geometry = this._geometryFor(parts[index]);
        // Only touch the LIVE controller state (and the running daemon) when the
        // saved character is the active one. Every data/character-N dir ships to
        // every node, so a POST /api/led/config?characterId=5 while character 1
        // is active must not repoint the controller at 5's part or push 5's
        // brightness to the daemon driving 1's rings.
        if (id === this.activeCharacterId) {
            this.part = parts[index];
            this.geometry = geometry;
            if (Number.isFinite(Number(config.brightness))) {
                await this.setBrightness(Number(config.brightness)).catch(() => {});
            }
        }
        this.emit('config', { characterId: id, config });
        return { success: true, config: this._colorConfigFor(parts[index], geometry) };
    }

    // -- internals ---------------------------------------------------------

    async _ensureReady(characterIdOverride) {
        const id = characterIdOverride != null ? Number(characterIdOverride) : this.activeCharacterId;
        if (id == null || !Number.isFinite(id)) return { ok: false, reason: 'no-character' };

        if (id !== this.activeCharacterId || !this.part) {
            const ok = await this.initialize(id);
            return ok ? { ok: true } : { ok: false, reason: this.part ? 'daemon-unreachable' : 'no-led-part' };
        }
        if (!this.available) {
            if (this._starting) return this._starting;
            this._starting = (async () => {
                const ok = await this.initialize(id);
                return ok ? { ok: true } : { ok: false, reason: 'daemon-unreachable' };
            })().finally(() => { this._starting = null; });
            return this._starting;
        }
        return { ok: true };
    }

    async _resolvePart(characterId) {
        if (this._partCache.has(characterId)) return this._partCache.get(characterId);
        let part = null;
        try {
            const file = path.join(DATA_DIR, `character-${characterId}`, 'parts.json');
            const parts = JSON.parse(await fs.readFile(file, 'utf8'));
            part = parts.find((p) =>
                String(p.type || '').toLowerCase() === LED_PART_TYPE && p.enabled !== false
            ) || null;
        } catch (_) {
            part = null;   // no parts file, or unreadable — treated as "no LED part"
        }
        this._partCache.set(characterId, part);
        return part;
    }

    /** Forget cached part lookups after a parts.json edit. */
    invalidatePartCache(characterId) {
        if (characterId == null) this._partCache.clear();
        else this._partCache.delete(Number(characterId));
    }

    _geometryFor(part) {
        const cfg = (part && part.config) || {};
        const pick = (key) => {
            const value = Number(cfg[key]);
            return Number.isFinite(value) ? value : GEOMETRY_DEFAULTS[key];
        };
        const order = String(cfg.colorOrder || GEOMETRY_DEFAULTS.colorOrder).toUpperCase();
        return {
            pixelCount: pick('pixelCount'),
            ringSplit: pick('ringSplit'),
            gpioPin: pick('gpioPin'),
            dma: pick('dma'),
            pwmChannel: pick('pwmChannel'),
            brightness: pick('brightness'),
            dataRateHz: pick('dataRateHz'),
            colorOrder: COLOR_ORDERS.includes(order) ? order : GEOMETRY_DEFAULTS.colorOrder,
            rings: Array.isArray(cfg.rings) ? cfg.rings : null
        };
    }
}

const ledController = new LedController();
export default ledController;
