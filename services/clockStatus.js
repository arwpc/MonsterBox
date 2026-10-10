/**
 * Clock status for health reporting (mission decision D8, 2026-10-09): every Pi must sit on the same zone
 * (America/Chicago), keep NTP on and stay synchronized, because schedules, quiet hours and the half-hour fleet
 * events are compared in local time across nodes.
 *
 * `getLocalClock()` reads `timedatectl` at most once a minute (the answer changes about never) and never
 * blocks a health request for longer than its first call. `clockFromHealth()` is the pure part used by the
 * fleet-health aggregator: it turns a peer's /health answer plus the request timing into
 * `{ zone, ntp, synced, localTime, offsetMs, ok, problem }`.
 */
import { execFile } from 'child_process';

const REFRESH_MS = 60 * 1000;
const EXEC_TIMEOUT_MS = 2000;
export const WANT_ZONE = process.env.MB_TIMEZONE || 'America/Chicago';
export const MAX_OFFSET_MS = Number(process.env.MB_MAX_CLOCK_OFFSET_MS) || 2000;

let cache = null;      // { zone, ntp, synced, readAt, error }
let inflight = null;

function readTimedatectl() {
    return new Promise((resolve) => {
        execFile('timedatectl', ['show', '-p', 'Timezone', '-p', 'NTP', '-p', 'NTPSynchronized', '--value'],
            { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
                if (err) return resolve({ zone: null, ntp: null, synced: null, error: err.message, readAt: Date.now() });
                const [zone, ntp, synced] = String(stdout || '').trim().split('\n');
                resolve({ zone: zone || null, ntp: ntp === 'yes', synced: synced === 'yes', error: null, readAt: Date.now() });
            });
    });
}

/** This node's own clock facts, cached for a minute. Never throws. */
export async function getLocalClock() {
    if (cache && Date.now() - cache.readAt < REFRESH_MS) return cache;
    if (!inflight) inflight = readTimedatectl().then((r) => { cache = r; inflight = null; return r; });
    return inflight;
}

/** For tests and callers that want the last answer without waiting. */
export function peekLocalClock() { return cache; }

/**
 * Pure: a peer's /health body plus when the request left and when its answer arrived.
 * The peer stamps its clock while answering, so its time is compared with the round trip's midpoint.
 */
export function clockFromHealth(health, sentAt, receivedAt, wantZone = WANT_ZONE, maxOffsetMs = MAX_OFFSET_MS) {
    if (!health) return null;
    const clock = health.clock || {};
    const epochMs = Number.isFinite(Number(health.epochMs)) ? Number(health.epochMs)
        : (health.time ? Date.parse(health.time) : NaN);
    const offsetMs = Number.isFinite(epochMs) ? Math.round(epochMs - (sentAt + receivedAt) / 2) : null;
    const problems = [];
    if (clock.zone != null && clock.zone !== wantZone) problems.push(`zone ${clock.zone}`);
    if (clock.ntp === false) problems.push('NTP off');
    if (clock.synced === false) problems.push('not synchronized');
    if (offsetMs != null && Math.abs(offsetMs) > maxOffsetMs) problems.push(`offset ${offsetMs} ms`);
    return {
        zone: clock.zone ?? null,
        ntpSynced: clock.synced ?? null,
        ntp: clock.ntp ?? null,
        localTime: health.time || null,
        offsetMs,
        reported: clock.zone != null,          // false on a build whose /health has no clock block yet
        ok: problems.length === 0,
        problem: problems.length ? problems.join(', ') : null
    };
}
