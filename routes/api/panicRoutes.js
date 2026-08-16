/**
 * Panic route — one request that stops everything.
 *
 * Why this exists as a single server-side endpoint rather than a fan-out from the
 * browser: on show night the operator is on a phone, on wifi that is degrading,
 * and the dashboard already holds one of the browser's six HTTP/1.1 connections
 * open forever for the MJPEG webcam stream while several pollers occupy more. A
 * client-side panic that has to make three or four calls can find the connection
 * pool saturated and never leave the handset — while the UI cheerfully reports
 * success. One request, sent with keepalive, is far more likely to survive that.
 *
 * It also means the STOP button works identically on every page without each page
 * having to know the full list of things that can move an animatronic.
 *
 * Mounted at /api/panic.
 */

import express from 'express';
import orchestrationService from '../../services/orchestrationService.js';
import { resolveCharacter } from '../../services/characterContext.js';

const router = express.Router();

/**
 * Run one local action, never throwing — panic must not abort partway because
 * one subsystem is wedged. Returns a per-action outcome for the report.
 */
async function runLocal(label, fn) {
    try {
        await fn();
        return { action: label, success: true };
    } catch (error) {
        return { action: label, success: false, error: error && error.message };
    }
}

/**
 * POST /api/panic
 *
 * Body: { fleet?: boolean }  — when true (default), also broadcasts to other nodes.
 *
 * Always attempts every action. Responds with what actually succeeded, so the UI
 * can tell the operator the truth rather than an unconditional "stopped".
 */
router.post('/', express.json(), async (req, res) => {
    const wantFleet = !(req.body && req.body.fleet === false);
    const started = Date.now();

    // Which animatronic this node is driving. Panic must still fire if this fails.
    let characterId = null;
    try {
        const ctx = await resolveCharacter(req);
        characterId = ctx && ctx.id;
    } catch (_) { /* fall through — the queue stop below tolerates a null id */ }

    // Local first and in parallel: this node's own hardware is the one standing in
    // front of the guest, so it must not wait on a remote node's timeout.
    const [sceneQueue, audioLoop, movement] = await Promise.all([
        import('../../services/scenes/sceneQueue.js').catch(() => null),
        import('../../services/audioLoopService.js').catch(() => null),
        import('../../services/movement/idleLoopService.js').catch(() => null),
    ]);

    const localActions = [];

    const queueSvc = sceneQueue && (sceneQueue.emergencyStop ? sceneQueue : sceneQueue.default);
    if (queueSvc && typeof queueSvc.emergencyStop === 'function') {
        // The hard stop: clears the queue as well as halting playback. The soft
        // `stop()` leaves the rest of the show queued and ready to resume, which is
        // the opposite of what an operator means when they hit panic.
        localActions.push(runLocal('scene-queue', () => queueSvc.emergencyStop(characterId)));
    }
    const audioSvc = audioLoop && (audioLoop.default || audioLoop);
    if (audioSvc && typeof audioSvc.stopAll === 'function') {
        localActions.push(runLocal('audio', () => audioSvc.stopAll()));
    }
    const idleSvc = movement && (movement.stop ? movement : movement.default);
    if (idleSvc && typeof idleSvc.stop === 'function') {
        localActions.push(runLocal('idle-loop', () => idleSvc.stop()));
    }

    // Disarm the AUTONOMOUS triggers on THIS node directly. Halting playback is not
    // enough: lurk, the motion sensor and head tracking can all start motion on
    // their own, so leaving them armed means the frightened guest backing away trips
    // the sensor and fires the scare again, seconds after the operator hit stop.
    // Doing it locally rather than waiting for the fleet fan-out to reach this node
    // over its own loopback is both faster and one less thing to fail.
    if (characterId != null) {
        localActions.push(runLocal('disarm-superpowers', async () => {
            const conv = await import('../conversation.js');
            if (typeof conv.disarmLurkCompletely !== 'function') {
                throw new Error('disarmLurkCompletely unavailable');
            }
            // Full shutdown: sub-features AND the lurk master flag AND the motion
            // watcher. Disabling only the sub-features leaves the trigger armed.
            await conv.disarmLurkCompletely(characterId);
        }));
    }

    const local = await Promise.all(localActions);

    // Then the fleet, which may include unreachable nodes and therefore timeouts.
    let fleet = null;
    if (wantFleet) {
        try {
            fleet = await orchestrationService.emergencyStop();
        } catch (error) {
            fleet = { success: false, error: error && error.message };
        }
    }

    const localOk = local.filter(r => r.success).length;
    res.json({
        // Honest: this is true only if something actually stopped.
        success: localOk > 0 || !!(fleet && fleet.success),
        elapsedMs: Date.now() - started,
        local: { succeeded: localOk, total: local.length, actions: local },
        fleet,
    });
});

export default router;
