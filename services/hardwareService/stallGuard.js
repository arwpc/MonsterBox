/**
 * Stall guard — clear PWM that is being held with no useful purpose.
 *
 * WHY THIS EXISTS
 *
 * A PCA9685 latches its own LEDn registers. Once a channel is given a pulse it
 * keeps emitting that pulse until something explicitly stops it, so a held
 * position outlives the Node process that asked for it: it survives an app
 * restart, a service restart, and a full reboot. Before this module, nothing in
 * the codebase ever released a channel automatically.
 *
 * That is the mechanism behind a recurring hardware failure on this fleet. A servo
 * commanded to an angle it cannot physically reach — because its channel mapping,
 * its model's pulse range, or its calibration window is wrong — does not fail and
 * stop. It buzzes against its mechanical stop indefinitely, drawing stall current,
 * until a fuse opens. Two live examples found on 2026-08-21: one node's
 * electrically dead elbow was holding 1308.6us on the fused rail that has blown
 * repeatedly, and a peer's ch0 was holding 2089.8us, near a standard servo's travel
 * extreme. The operator had independently observed the same sequence: "Locked up
 * and then fuse goes."
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not release every servo, and it is not a timeout-based auto-detach.
 * Animatronic servos are supposed to hold position; a blanket release would drop
 * every rig limp on every restart and mid-show if the service bounced. It also is
 * not a revival of the retired per-part safety-limit system (config/hardware-safety.json,
 * emptied by operator ruling 2026-08-20) — it refuses no command and clamps nothing.
 *
 * It clears only the two cases where holding a pulse has risk and no upside:
 *
 *   1. Channels owned by a part the operator has declared physically broken in
 *      config/physical-faults.json. A broken part cannot hold a useful position,
 *      so energizing it is pure stall risk.
 *   2. Channels being actively driven with no part mapped to them at all. Nothing
 *      is steering these and nothing will ever release them.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPhysicalFault } from './safetyLimits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVO_CLI = path.resolve(__dirname, '../../python_wrappers/servo_cli.py');

const PYTHON = process.env.PYTHON_BIN || '/usr/bin/python3';

function runServoCli(args, timeoutMs = 20000) {
    return new Promise((resolve) => {
        let out = '';
        let err = '';
        let done = false;
        const child = spawn(PYTHON, [SERVO_CLI, ...args.map(String)], { stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => {
            if (!done) { try { child.kill('SIGKILL'); } catch (_) { /* already gone */ } }
        }, timeoutMs);
        // Drain both pipes: an undrained pipe can block a child on a full buffer.
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { err += d.toString(); });
        child.on('error', e => { done = true; clearTimeout(timer); resolve({ ok: false, error: e.message }); });
        child.on('close', () => {
            done = true;
            clearTimeout(timer);
            try {
                resolve(JSON.parse(out.trim().split('\n').filter(Boolean).pop() || '{}'));
            } catch (e) {
                resolve({ ok: false, error: `unparseable servo_cli output: ${err.slice(-200) || out.slice(-200)}` });
            }
        });
    });
}

/**
 * Release channels that are held with no useful purpose.
 *
 * @param {string|number} characterId - character whose parts.json maps the channels
 * @param {string} phase - free-text label for the log ('startup', 'shutdown', ...)
 * @param {Object} [opts]
 * @param {string} [opts.address='0x40'] - PCA9685 I2C address
 * @returns {Promise<{released: number[], skipped: number[], reason: string|null}>}
 */
export async function releaseStalledChannels(characterId, phase = 'manual', opts = {}) {
    const address = opts.address || '0x40';
    const result = { released: [], skipped: [], reason: null };

    // reconcile reads the chip and joins it to this node's own parts.json. It masks
    // the LEDn_OFF full-off flag (bit 12) correctly — a naive smbus read treats that
    // 0x1000 as a tick count and reports a bogus 20ms pulse on every idle channel.
    const audit = await runServoCli(['reconcile', address]);
    if (!audit || audit.ok !== true || !audit.data || !Array.isArray(audit.data.channels)) {
        result.reason = `chip audit unavailable (${(audit && audit.error) || 'no data'})`;
        return result;
    }

    for (const ch of audit.data.channels) {
        if (!ch.driven) continue;

        let why = null;
        if (ch.partId == null) {
            why = 'no part is mapped to this channel';
        } else {
            let fault = { broken: false };
            try {
                fault = await getPhysicalFault(characterId, ch.partId);
            } catch (e) {
                // A lookup failure must never turn into an unintended release.
                result.skipped.push(ch.channel);
                continue;
            }
            if (fault.broken) why = `part ${ch.partId} is declared physically broken — ${fault.reason}`;
        }

        if (!why) { result.skipped.push(ch.channel); continue; }

        const rel = await runServoCli(['release', ch.channel, address]);
        if (rel && rel.ok === true) {
            result.released.push(ch.channel);
            console.warn(`🧯 Stall guard (${phase}): released ch${ch.channel} held at ${ch.pulse_us}us — ${why}`);
        } else {
            result.skipped.push(ch.channel);
            console.warn(`⚠️  Stall guard (${phase}): could not release ch${ch.channel} — ${(rel && rel.error) || 'unknown error'}`);
        }
    }

    if (result.released.length === 0) {
        console.log(`🧯 Stall guard (${phase}): nothing needed releasing (${result.skipped.length} channel(s) legitimately held)`);
    }
    return result;
}

export default { releaseStalledChannels };
