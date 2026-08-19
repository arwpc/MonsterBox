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
import { execFile } from 'child_process';
import { promisify } from 'util';
import orchestrationService from '../../services/orchestrationService.js';
import { resolveCharacter } from '../../services/characterContext.js';

const execFileAsync = promisify(execFile);

const router = express.Router();

/**
 * Anything that can still make noise or motion after the queue has been stopped.
 *
 * Halting the scene queue stops MonsterBox from ISSUING new commands; it does not
 * touch the child processes already running. An mpg123 mid-track keeps playing,
 * an ffmpeg filter keeps piping, the jaw daemon keeps driving its servo, and the
 * microphone capture keeps holding the array. To the operator standing in front of
 * a guest, a panic button that leaves audio playing has not worked.
 */
const NOISE_AND_MOTION = [
    'mpg123', 'ffmpeg', 'ffplay', 'pw-play', 'paplay', 'aplay', 'mpv', 'vlc', 'cvlc',
];

/**
 * Kill every media/hardware child process this node has spawned, without killing
 * ourselves.
 *
 * Deliberately NOT `pkill -f <pattern>`: the pattern matches the shell running the
 * pkill, and it can match this very node process because the repo path appears in
 * its command line. That has killed the command mid-panic twice. Enumerate with ps,
 * exclude our own process and its ancestors, then signal by PID.
 *
 * SIGTERM first so a player can close its sink cleanly; anything still alive after
 * a moment gets SIGKILL, because panic must not wait on a wedged process.
 */
async function killNoiseAndMotion() {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid,args', '--no-headers']);
    const self = process.pid;
    const parent = process.ppid;
    const victims = [];

    for (const line of stdout.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!m) continue;
        const pid = Number(m[1]);
        const args = m[3];
        if (pid === self || pid === parent || pid === 1) continue;
        // Never kill the app itself — that is the one service that must survive, or
        // the operator loses the very UI they just hit STOP on.
        if (/node\s+server\.js/.test(args) || /monsterbox\.service/.test(args)) continue;

        const isPlayer = NOISE_AND_MOTION.some(n => new RegExp(`(^|/)${n}( |$)`).test(args));
        // Our own hardware wrappers: servo/motor/LED drivers, the jaw daemon and the
        // microphone capture. Scoped to this repo's python_wrappers so we cannot
        // reach into an unrelated python process on the box.
        const isWrapper = /python3?\s+\S*python_wrappers\/\S+\.py/.test(args);
        if (isPlayer || isWrapper) victims.push({ pid, args: args.slice(0, 80) });
    }

    for (const v of victims) {
        try { process.kill(v.pid, 'SIGTERM'); } catch (_) { /* already gone */ }
    }
    if (victims.length) {
        await new Promise(r => setTimeout(r, 300));
        for (const v of victims) {
            try { process.kill(v.pid, 0); process.kill(v.pid, 'SIGKILL'); } catch (_) { /* gone, good */ }
        }
        console.warn(`🛑 PANIC killed ${victims.length} media/hardware process(es): ${victims.map(v => v.pid).join(', ')}`);
    }
    return victims.length;
}

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

    // Turn AI OFF. Stopping playback does not stop a live agent: an open ElevenLabs
    // session keeps listening and will answer the next thing it hears, so the
    // animatronic starts talking again on its own after the operator hit STOP.
    // The operator's requirement is explicit — panic disables ALL AI capability.
    if (characterId != null) {
        localActions.push(runLocal('disable-ai', async () => {
            const mod = await import('../../services/elevenLabsWebSocketService.js');
            const svc = mod.default || mod;
            if (typeof svc.setAgentEnabledForCharacter === 'function') {
                await svc.setAgentEnabledForCharacter(characterId, false);
            }
            // Persist it, so ai_agent_state.json and /conversation/api/ai-status
            // cannot keep claiming the agent is live after a panic.
            // There is no shared getDataDir export — each module builds this path
            // itself (services/scenes/sceneExecutor.js:18, routes/setup/calibration.js:693).
            // Match the layout rather than inventing an import that does not exist.
            const fs = (await import('fs/promises')).default;
            const path = (await import('path')).default;
            const file = path.resolve(process.cwd(), 'data', `character-${characterId}`, 'ai_agent_state.json');
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, JSON.stringify({ characterId, enabled: false, timestamp: Date.now() }, null, 2), 'utf8');
        }));
    }

    // Last locally: kill whatever is still making noise or moving. Done after the
    // graceful stops so a player that shut itself down cleanly is already gone.
    localActions.push(runLocal('kill-media-processes', killNoiseAndMotion));

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
