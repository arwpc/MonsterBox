/**
 * LED Speaking Sync — drives a character's LED eye rings from the same audio
 * envelope that drives the jaw servo, so the eyes brighten and shift colour as
 * the mouth opens (min) and closes (max).
 *
 * This is the LED analogue of speechExpression (which co-drives the head). The
 * jaw playback loops call begin()/noteLevel()/end() and nothing else; all the
 * LED specifics — resolving whether this character has the feature on, choosing
 * the low/high colours, and restoring the prior LED state afterwards — live here.
 *
 * Character independence: every call is scoped by characterId, the colours and
 * enablement come from that character's own jaw config (super-powers.json →
 * jawAnimation.ledSync), and the LED part is resolved from that character's
 * parts.json by ledController. A character with no led_ring part, or with LED
 * sync switched off, silently no-ops — the jaw still animates.
 *
 * Cancellation safety: begin() is fired without await from the jaw loops and its
 * setState('speaking') can take up to ~2.5s if the LED daemon must be spawned. A
 * short utterance can therefore call end() BEFORE begin() has finished. Each
 * character's record is registered synchronously at the top of begin() (before
 * the await) so end() always sees it; end() arriving early marks the record
 * `ended`, and begin() — once its setState resolves — restores instead of
 * latching the eyes in 'speaking'. A newer begin() supersedes an older one by
 * epoch. Without this the eyes could stick in the speaking look forever.
 *
 * Never throws: a failure to light the eyes must never interrupt speech or the
 * jaw. Every entry point swallows its own errors.
 */

const records = new Map(); // characterId(string) -> record
let epochCounter = 0;

// Fallbacks if a jaw config stores no colours. Deep red when nearly closed →
// bright amber when wide open; deliberately warm and character-neutral.
const DEFAULT_LOW = [80, 0, 0];
const DEFAULT_HIGH = [255, 120, 0];

function rgbOrNull(value) {
    if (!Array.isArray(value) || value.length !== 3) return null;
    const out = value.map((c) => Math.max(0, Math.min(255, Math.round(Number(c)))));
    return out.some((c) => !Number.isFinite(c)) ? null : out;
}

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Shape a raw 0..1 audio level into the LED level using this session's timing:
 * sensitivity (gain), smoothing (EMA), and attack/release rate limits. This is
 * the LED analogue of the jaw's calculateJawAngle envelope, applied to a 0..1
 * intensity rather than a servo angle, and independently of the jaw so the eyes
 * can be tuned separately from the mouth.
 */
function applyEnvelope(rec, rawLevel) {
    const t = rec.timing;
    let v = Number(rawLevel);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(1, v * t.sensitivity));

    const env = rec.env;
    // Smoothing (EMA): higher smoothing = slower, steadier response.
    if (t.smoothing > 0) {
        env.smoothed = env.smoothed == null ? v : (1 - t.smoothing) * v + t.smoothing * env.smoothed;
    } else {
        env.smoothed = v;
    }
    const target = env.smoothed;

    const now = Date.now();
    let dt = env.t ? now - env.t : 16;
    if (dt < 0) dt = 0;
    if (dt > 500) dt = 500;   // a long stall must not snap the level open/closed

    let level = target;
    if (target > env.level) {
        level = Math.min(target, env.level + dt / t.attackMs);   // rise rate-limited
    } else if (target < env.level) {
        level = Math.max(target, env.level - dt / t.releaseMs);  // fall rate-limited
    }
    env.level = level;
    env.t = now;
    return Math.max(0, Math.min(1, level));
}

/**
 * Pure, hardware-free version of the envelope over a whole amplitude sequence,
 * with a FIXED per-frame dt. Used by the LED Animation page to draw the level
 * the eyes WILL show against the audio amplitude, so the operator can match
 * timing (sensitivity/smoothing/attack/release) without driving the ring. Same
 * math as applyEnvelope so the preview matches the live behaviour.
 * @param {number[]} amplitudes 0..1 per frame
 * @param {number} frameMs frame interval
 * @param {object} timing {sensitivity, smoothing, attackMs, releaseMs}
 * @returns {number[]} 0..1 LED levels, one per input frame
 */
function computeLedLevels(amplitudes, frameMs, timing) {
    const t = {
        sensitivity: num(timing && timing.sensitivity, 1.0),
        smoothing: Math.max(0, Math.min(0.95, num(timing && timing.smoothing, 0.5))),
        attackMs: Math.max(1, num(timing && timing.attackMs, 40)),
        releaseMs: Math.max(1, num(timing && timing.releaseMs, 120))
    };
    const dt = Math.max(1, num(frameMs, 20));
    const out = [];
    let level = 0;
    let smoothed = null;
    for (let i = 0; i < amplitudes.length; i++) {
        let v = Number(amplitudes[i]);
        if (!Number.isFinite(v)) v = 0;
        v = Math.max(0, Math.min(1, v * t.sensitivity));
        smoothed = (t.smoothing > 0)
            ? (smoothed == null ? v : (1 - t.smoothing) * v + t.smoothing * smoothed)
            : v;
        if (smoothed > level) level = Math.min(smoothed, level + dt / t.attackMs);
        else if (smoothed < level) level = Math.max(smoothed, level - dt / t.releaseMs);
        out.push(Math.max(0, Math.min(1, level)));
    }
    return out;
}

/** Restore the eyes to `previous` (idle for the transient/speaking states). */
async function restore(controller, characterId, previous) {
    try {
        // Settle to the closed-mouth look, then leave 'speaking'. Restore to the
        // prior state EXCEPT the transient ones: 'thinking' (processing — you are
        // no longer thinking once you've finished talking) and 'manual'/'speaking'
        // fall back to 'idle' so the eyes never latch on a processing colour.
        controller.pushAudioLevel(0, { replace: true });
        const transient = { manual: 1, speaking: 1, thinking: 1 };
        const target = (!previous || transient[previous]) ? 'idle' : previous;
        if (target === 'off') await controller.off();
        else await controller.setState(target, { characterId: Number(characterId) });
    } catch (_) {
        // Best effort — the next state change corrects the eyes.
    }
}

/**
 * Begin LED sync for a spoken utterance.
 * @param {string|number} characterId
 * @param {{enabled?:boolean, partId?:(string|number), colorLow?:number[], colorHigh?:number[]}} ledSync
 * @returns {Promise<boolean>} true if the eyes are now under speaking sync
 */
async function begin(characterId, ledSync) {
    const cid = String(characterId);
    try {
        if (!ledSync || !ledSync.enabled || ledSync.partId == null) {
            records.delete(cid);
            return false;
        }
        const colorLow = rgbOrNull(ledSync.colorLow) || DEFAULT_LOW;
        const colorHigh = rgbOrNull(ledSync.colorHigh) || DEFAULT_HIGH;
        const timing = {
            sensitivity: num(ledSync.sensitivity, 1.0),
            smoothing: Math.max(0, Math.min(0.95, num(ledSync.smoothing, 0.5))),
            attackMs: Math.max(1, num(ledSync.attackMs, 40)),
            releaseMs: Math.max(1, num(ledSync.releaseMs, 120)),
            speed: num(ledSync.speed, 1.0)
        };

        // Register synchronously BEFORE any await so a racing end() sees us.
        const epoch = ++epochCounter;
        const record = { epoch, active: false, ended: false, previous: null, controller: null, timing, env: { level: 0, smoothed: null, t: 0 } };
        records.set(cid, record);

        const { default: ledController } = await import('./ledController.js');
        record.previous = ledController.currentState;

        const result = await ledController.setState('speaking', {
            characterId: Number(characterId),
            // color seeds the closed-mouth look; colorLow/colorHigh drive the
            // amplitude crossfade in the daemon's speaking render; speed sets the
            // animation rate.
            color: colorLow,
            colorLow,
            colorHigh,
            speed: timing.speed
        });

        // Superseded by a newer begin() while we awaited — that one owns the
        // eyes now; do not touch them.
        if (records.get(cid) !== record) return false;

        if (!result || !result.success) {
            // No led_ring on this character, or the daemon is down. Nothing was
            // lit, so nothing to restore.
            records.delete(cid);
            return false;
        }

        if (record.ended) {
            // end() arrived while we were awaiting the (possibly slow) daemon
            // spawn. Our setState('speaking') has only just landed, so restore
            // now — this is what keeps the eyes from sticking on a short first
            // utterance with a cold daemon.
            records.delete(cid);
            await restore(ledController, characterId, record.previous);
            return false;
        }

        record.active = true;
        record.controller = ledController;
        return true;
    } catch (_) {
        records.delete(cid);
        return false;
    }
}

/**
 * Feed the current jaw openness (0..1) to the eyes. Fire-and-forget, safe to
 * call every frame. Uses replace semantics so the eyes fall with the jaw, not
 * just rise with it.
 */
function noteLevel(characterId, rawLevel) {
    const record = records.get(String(characterId));
    if (!record || !record.active || !record.controller) return;
    try {
        // rawLevel is the un-shaped 0..1 audio amplitude; the LED applies its own
        // sensitivity/smoothing/attack/release so the eyes are tuned separately
        // from the jaw.
        record.controller.pushAudioLevel(applyEnvelope(record, rawLevel), { replace: true });
    } catch (_) {
        // Never let an eye update disturb the jaw loop.
    }
}

/**
 * End LED sync and restore the eyes to whatever they showed before.
 * @param {string|number} characterId
 */
async function end(characterId) {
    const cid = String(characterId);
    const record = records.get(cid);
    if (!record) return;

    if (!record.active) {
        // begin() is still awaiting its setState. Flag it so begin() restores
        // once its 'speaking' actually lands — restoring here could race ahead
        // of that and leave the eyes stuck speaking.
        record.ended = true;
        return;
    }

    records.delete(cid);
    await restore(record.controller, characterId, record.previous);
}

/** True if a character currently has LED speaking sync active. */
function isActive(characterId) {
    const record = records.get(String(characterId));
    return !!(record && record.active);
}

export default { begin, noteLevel, end, isActive, computeLedLevels };
