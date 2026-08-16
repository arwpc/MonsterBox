/**
 * Scheduled Events — the service behind /schedule.
 *
 * MonsterBox stores scheduled events in the REAL system crontab, inside a
 * sentinel-delimited managed block. cron is what actually fires; a second
 * in-app scheduler would be a source of truth that can silently disagree with
 * the thing running the show on Halloween night.
 *
 * Safety posture (these events move heavy hardware and make loud noise
 * outdoors, near people):
 *   - disable comments the line out, never deletes it;
 *   - every write is preceded by a timestamped backup under /tmp;
 *   - every write is verified: if any unmanaged line would be lost, the write
 *     is refused rather than "fixed";
 *   - "run now" is a real, immediate execution and the API says so plainly.
 *
 * Generated commands always carry `cd <repo> &&` and a log redirect. cron runs
 * with cwd=$HOME and PATH=/usr/bin:/bin, so without the cd, node resolves the
 * script against the home directory and dies with MODULE_NOT_FOUND.
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseCrontab,
    renderCrontab,
    validateCommand,
    unmanagedLines,
    makeUniqueId,
    BLOCK_START
} from './schedule/crontabFile.js';
import {
    summariseSchedule,
    isValidCronExpression,
    parseCronExpression
} from './schedule/cronExpression.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const MOMENTS_DIR = path.join(REPO_ROOT, 'scripts', 'yard-theater', 'moments');
const LOG_DIR = path.join(os.homedir(), 'yard-theater-logs');
const DEFAULT_LOG = path.join(LOG_DIR, 'theater.log');

/**
 * Tests and MB_TEST_MODE must never touch the operator's real crontab — a test
 * run that wipes the Halloween schedule is a far worse bug than any it catches.
 */
function crontabFileOverride() {
    if (process.env.MB_SCHEDULE_CRONTAB_FILE) return process.env.MB_SCHEDULE_CRONTAB_FILE;
    if (process.env.MB_TEST_MODE === '1') {
        return path.join(os.tmpdir(), 'monsterbox-test-crontab.txt');
    }
    return null;
}

export async function readCrontabText() {
    const override = crontabFileOverride();
    if (override) {
        try {
            return await fsp.readFile(override, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') return '';
            throw error;
        }
    }

    try {
        const { stdout } = await execAsync('crontab -l', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        return stdout;
    } catch (error) {
        // `crontab -l` exits 1 with "no crontab for <user>" when none exists.
        if (/no crontab for/i.test(error.stderr || '')) return '';
        throw new Error(`Could not read crontab: ${(error.stderr || error.message || '').trim()}`);
    }
}

async function backupCrontab(text) {
    const target = path.join(os.tmpdir(), `monsterbox-crontab-${Date.now()}.bak`);
    try {
        await fsp.writeFile(target, text, 'utf8');
        return target;
    } catch (error) {
        console.error('[schedule] Could not write crontab backup:', error.message);
        return null;
    }
}

export async function writeCrontabText(text) {
    const override = crontabFileOverride();
    if (override) {
        await fsp.writeFile(override, text, 'utf8');
        return;
    }

    await new Promise((resolve, reject) => {
        const child = spawn('crontab', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`crontab write failed (exit ${code}): ${stderr.trim()}`));
        });
        child.stdin.end(text, 'utf8');
    });
}

/**
 * Persist a model, refusing the write if any line the operator owns would be
 * lost. The hand-written `@reboot /home/remote/start-audio.sh` line is the
 * canonical example — it must survive every single write.
 */
async function persist(model, previousText) {
    const nextText = renderCrontab(model);

    const before = unmanagedLines(previousText);
    const nextLines = new Set(nextText.split('\n'));

    // Lines that legitimately moved INTO the managed block on first adoption:
    // the entries themselves (enabled or commented out) and the prose that
    // documents them. Anything else disappearing is a bug, not an edit.
    const accountedFor = new Set();
    model.events.forEach((event) => {
        const entry = `${event.expression} ${event.command}`;
        accountedFor.add(entry);
        accountedFor.add(`# ${entry}`);
        String(event.description || '').split('\n').forEach((line) => {
            if (line.trim()) accountedFor.add(`# ${line.trim()}`);
        });
    });

    const missing = before.filter((line) => !nextLines.has(line) && !accountedFor.has(line.trim()));

    if (missing.length > 0) {
        throw new Error(
            `Refusing to write crontab: ${missing.length} unmanaged line(s) would be lost. `
            + `First: "${missing[0]}"`
        );
    }

    await backupCrontab(previousText);
    await writeCrontabText(nextText);
    return nextText;
}

async function loadModel() {
    const text = await readCrontabText();
    const model = parseCrontab(text, { repoRoot: REPO_ROOT });
    return { text, model };
}

/* ------------------------------------------------------------------ */
/* Command construction                                                */
/* ------------------------------------------------------------------ */

function ensureLogDir() {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch (error) {
        // Without this directory every cron line fails at the redirect and the
        // command never runs at all — cron cannot create it for you.
        console.error('[schedule] Could not create log directory:', error.message);
    }
}

function logPathFor(name) {
    const safe = String(name || 'theater').replace(/[^\w.-]/g, '-');
    return path.join(LOG_DIR, `${safe}.log`);
}

/**
 * Build the shell command for an action. The chain is always wrapped in a
 * subshell before the redirect: `a && b >> log` binds the redirect to `b` only,
 * so a failure in `a` leaves no trace at all.
 */
export function buildCommand(action = {}) {
    const type = action.type || 'raw';

    if (type === 'moment') {
        const file = String(action.moment || '').replace(/[^\w.-]/g, '');
        if (!file) throw new Error('No moment file selected');
        const flags = action.dryRun ? ' --dry-run' : '';
        const log = action.dryRun ? logPathFor('theater-rehearsal') : DEFAULT_LOG;
        return `cd ${REPO_ROOT} && (node scripts/yard-theater/perform.mjs moments/${file}${flags})`
            + ` >> ${log} 2>&1`;
    }

    if (type === 'scene') {
        const sceneId = String(action.sceneId || '').replace(/[^\w-]/g, '');
        const characterId = String(action.characterId || '').replace(/[^\w-]/g, '');
        if (!sceneId || !characterId) throw new Error('Scene action needs a scene and a character');
        const url = `https://localhost:3000/scenes/api/${sceneId}/play?characterId=${characterId}`;
        return `cd ${REPO_ROOT} && (curl -sk -X POST "${url}") >> ${logPathFor('scenes')} 2>&1`;
    }

    // Escape hatch: the operator's own shell, still wrapped and still logged.
    const raw = String(action.command || '').trim();
    if (!raw) throw new Error('Command is empty');
    if (raw.includes('>>') || raw.includes('2>&1') || raw.startsWith('cd ')) {
        // Already a fully-formed cron command (e.g. adopted or hand-tuned).
        return raw;
    }
    return `cd ${REPO_ROOT} && (${raw}) >> ${logPathFor(action.logName || 'custom')} 2>&1`;
}

/**
 * Build a cron expression from the friendly builder.
 * mode: 'daily' | 'date' | 'weekly' | 'raw'
 */
export function buildExpression(schedule = {}) {
    if (schedule.mode === 'raw' || schedule.expression) {
        const expression = String(schedule.expression || '').trim();
        if (!isValidCronExpression(expression)) {
            throw new Error(`"${expression}" is not a valid cron expression`);
        }
        return expression;
    }

    const time = String(schedule.time || '').trim();
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error('Time must be HH:MM');
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error('Time must be a real clock time');

    if (schedule.mode === 'daily') {
        return `${minute} ${hour} * * *`;
    }

    if (schedule.mode === 'date') {
        const date = String(schedule.date || '').trim();
        const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!dm) throw new Error('Date must be YYYY-MM-DD');
        const month = Number(dm[2]);
        const day = Number(dm[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error('Date is not a real date');
        // cron has no year field: the entry recurs every year on this date.
        return `${minute} ${hour} ${day} ${month} *`;
    }

    if (schedule.mode === 'weekly') {
        const days = Array.isArray(schedule.days) ? schedule.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
        if (days.length === 0) throw new Error('Pick at least one day of the week');
        const unique = [...new Set(days)].sort((a, b) => a - b);
        return `${minute} ${hour} * * ${unique.join(',')}`;
    }

    throw new Error(`Unknown schedule mode "${schedule.mode}"`);
}

/* ------------------------------------------------------------------ */
/* Target-node awareness                                               */
/* ------------------------------------------------------------------ */

let momentCache = null;

/** Yard-theater moments available as pickable actions. */
export function listMoments() {
    if (momentCache) return momentCache;
    let files = [];
    try {
        files = fs.readdirSync(MOMENTS_DIR).filter((f) => f.endsWith('.json'));
    } catch (error) {
        return [];
    }
    momentCache = files.map((file) => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(MOMENTS_DIR, file), 'utf8'));
            return {
                file,
                name: data.name || file,
                description: data.description || '',
                nodes: Array.isArray(data.nodes) ? data.nodes : [],
                stepCount: Array.isArray(data.steps) ? data.steps.length : 0
            };
        } catch (error) {
            return { file, name: file, description: '', nodes: [], stepCount: 0 };
        }
    });
    return momentCache;
}

/**
 * Which animatronics an event will try to talk to. Surfacing this is the point:
 * the Dusk Ceremony casts one speech per node, so with half the fleet down,
 * half its dialogue is silently dropped. perform.mjs skips unreachable nodes
 * and carries on, so the show still runs — it just quietly runs smaller.
 */
export function targetNodesFor(command) {
    const match = String(command || '').match(/moments\/([\w.-]+\.json)/);
    if (!match) return null;
    const moment = listMoments().find((m) => m.file === match[1]);
    return moment ? moment.nodes : null;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

function decorate(event, now) {
    const summary = summariseSchedule(event.expression, now);
    return {
        ...event,
        schedule: summary,
        targetNodes: targetNodesFor(event.command),
        dryRun: /--dry-run/.test(event.command)
    };
}

export async function listEvents(now = new Date()) {
    const { text, model } = await loadModel();

    // First visit: fold the schedule the operator already has into the managed
    // block so the page shows reality instead of an empty list.
    if (model.adopted) {
        try {
            await persist(model, text);
        } catch (error) {
            console.error('[schedule] Adoption write failed, continuing read-only:', error.message);
        }
    }

    return {
        events: model.events.map((event) => decorate(event, now)),
        managed: model.hadBlock || model.adopted,
        adoptedNow: model.adopted,
        blockMarker: BLOCK_START
    };
}

function normaliseInput(input, existing) {
    const name = String(input.name || existing?.name || '').trim();
    if (!name) throw new Error('Name is required');

    const expression = input.expression
        ? (() => {
            const value = String(input.expression).trim();
            if (!isValidCronExpression(value)) throw new Error(`"${value}" is not a valid cron expression`);
            return value;
        })()
        : buildExpression(input.schedule || {});

    const command = input.command ? String(input.command).trim() : buildCommand(input.action || {});
    const commandError = validateCommand(command);
    if (commandError) throw new Error(commandError);

    // Fail loudly on an expression that can never fire (e.g. 31 February),
    // instead of shipping an entry that looks installed and never runs.
    const summary = summariseSchedule(expression, new Date());
    if (summary.neverFires) {
        throw new Error(`"${expression}" can never fire — check the day and month`);
    }

    return {
        name,
        description: String(input.description || existing?.description || '').trim(),
        kind: input.action?.type || existing?.kind || 'raw',
        enabled: input.enabled === undefined ? (existing ? existing.enabled : true) : Boolean(input.enabled),
        expression,
        command
    };
}

export async function createEvent(input) {
    const { text, model } = await loadModel();
    ensureLogDir();

    const taken = new Set(model.events.map((event) => event.id));
    const draft = normaliseInput(input, null);
    const event = { id: makeUniqueId(draft.name, taken), ...draft };

    model.events.push(event);
    await persist(model, text);
    return decorate(event, new Date());
}

export async function updateEvent(id, input) {
    const { text, model } = await loadModel();
    const index = model.events.findIndex((event) => event.id === id);
    if (index === -1) throw new Error(`No scheduled event with id "${id}"`);
    ensureLogDir();

    const existing = model.events[index];
    const updated = { id: existing.id, ...normaliseInput(input, existing) };
    model.events[index] = updated;
    await persist(model, text);
    return decorate(updated, new Date());
}

export async function deleteEvent(id) {
    const { text, model } = await loadModel();
    const index = model.events.findIndex((event) => event.id === id);
    if (index === -1) throw new Error(`No scheduled event with id "${id}"`);

    const [removed] = model.events.splice(index, 1);
    await persist(model, text);
    return { id: removed.id, name: removed.name };
}

/** Enable/disable. Disabling comments the line out; the entry stays editable. */
export async function toggleEvent(id, enabled) {
    const { text, model } = await loadModel();
    const event = model.events.find((item) => item.id === id);
    if (!event) throw new Error(`No scheduled event with id "${id}"`);

    event.enabled = enabled === undefined ? !event.enabled : Boolean(enabled);
    await persist(model, text);
    return decorate(event, new Date());
}

/**
 * Fire an event immediately, for real.
 *
 * Deliberately run under cron's environment (cwd=$HOME, PATH=/usr/bin:/bin) so
 * "Run now" is a genuine rehearsal of what cron will do at 18:30 on the 31st,
 * not a friendlier version of it that hides a MODULE_NOT_FOUND.
 */
export async function runEventNow(id) {
    const { model } = await loadModel();
    const event = model.events.find((item) => item.id === id);
    if (!event) throw new Error(`No scheduled event with id "${id}"`);
    ensureLogDir();

    const child = spawn('/bin/sh', ['-c', event.command], {
        cwd: os.homedir(),
        env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), SHELL: '/bin/sh' },
        detached: true,
        stdio: 'ignore'
    });
    child.unref();

    return {
        id: event.id,
        name: event.name,
        pid: child.pid,
        command: event.command,
        startedAt: new Date().toISOString()
    };
}

/** Preview a schedule + command without saving anything. */
export function previewEvent(input, now = new Date()) {
    const expression = input.expression && String(input.expression).trim()
        ? String(input.expression).trim()
        : buildExpression(input.schedule || {});
    const command = input.command ? String(input.command).trim() : buildCommand(input.action || {});

    return {
        expression,
        command,
        commandError: validateCommand(command),
        schedule: summariseSchedule(expression, now),
        targetNodes: targetNodesFor(command)
    };
}

export default {
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleEvent,
    runEventNow,
    previewEvent,
    listMoments,
    buildCommand,
    buildExpression,
    targetNodesFor,
    readCrontabText,
    writeCrontabText,
    REPO_ROOT,
    LOG_DIR
};

export { REPO_ROOT, LOG_DIR, parseCronExpression };
