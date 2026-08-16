/**
 * Crontab text <-> Scheduled Events model. Pure string handling, no I/O, so the
 * "unmanaged lines survive byte-for-byte" guarantee can be unit tested without
 * touching the real crontab.
 *
 * WHY the real crontab is the store: cron is what actually fires. An in-app
 * scheduler would be a second source of truth that can silently disagree with
 * the thing that runs the show. So MonsterBox owns a delimited block inside the
 * operator's own crontab and treats everything outside it as untouchable.
 *
 * Layout written back:
 *
 *   ...operator's own lines, preserved verbatim...
 *   # >>> MONSTERBOX MANAGED ... <<<
 *   #MB {"id":"dusk-ceremony","name":"The Dusk Ceremony",...}
 *   # The Dusk Ceremony — the yard wakes
 *   30 18 31 10 * cd /home/remote/MonsterBox && node ...
 *   # <<< MONSTERBOX MANAGED END >>>
 *   ...operator's own lines, preserved verbatim...
 *
 * A DISABLED event keeps its line, commented out, so it stays editable and
 * recoverable. Disabling never deletes: these entries drive tens of kilograms
 * of servo-driven hardware outdoors, and an operator who wants it quiet tonight
 * should not lose the schedule he spent the season building.
 */

import { isValidCronExpression, CRON_NICKNAMES } from './cronExpression.js';

export const BLOCK_START = '# >>> MONSTERBOX MANAGED — do not edit by hand; use /schedule <<<';
export const BLOCK_END = '# <<< MONSTERBOX MANAGED END >>>';
export const META_PREFIX = '#MB ';

/** Commands cron cannot store safely. `%` is cron's newline/stdin metacharacter. */
export function validateCommand(command) {
    const text = String(command == null ? '' : command);
    if (!text.trim()) return 'Command is empty';
    if (/[\r\n]/.test(text)) return 'Command may not contain line breaks — cron stores one line per entry';
    // An unescaped % ends the command and feeds the rest to the job on stdin,
    // which silently truncates whatever the operator typed.
    if (/(^|[^\\])%/.test(text)) return 'Command contains an unescaped "%" — cron treats it as a newline. Use \\% instead.';
    return null;
}

/**
 * Split a crontab line into { expression, command }, or null if it is not a
 * schedule line at all. Accepts 5-field expressions and @nicknames.
 */
export function parseCrontabLine(line) {
    const text = String(line == null ? '' : line).trim();
    if (!text || text.startsWith('#')) return null;

    if (text.startsWith('@')) {
        const match = text.match(/^(@\w+)\s+(.+)$/);
        if (!match) return null;
        const nickname = match[1].toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(CRON_NICKNAMES, nickname)) return null;
        return { expression: match[1], command: match[2].trim() };
    }

    const tokens = text.split(/\s+/);
    if (tokens.length < 6) return null;
    const expression = tokens.slice(0, 5).join(' ');
    if (!isValidCronExpression(expression)) return null;
    const command = tokens.slice(5).join(' ').trim();
    if (!command) return null;
    return { expression, command };
}

/** Same, but for a line that has been commented out (a disabled entry). */
function parseCommentedCrontabLine(line) {
    const text = String(line == null ? '' : line);
    if (!text.trimStart().startsWith('#')) return null;
    const stripped = text.trimStart().replace(/^#+\s?/, '');
    // Guard against our own metadata being mistaken for a disabled entry.
    if (stripped.startsWith('MB ') || stripped.startsWith('{')) return null;
    return parseCrontabLine(stripped);
}

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 48) || 'event';
}

export function makeUniqueId(name, taken) {
    const base = slugify(name);
    if (!taken.has(base)) return base;
    for (let n = 2; n < 1000; n += 1) {
        const candidate = `${base}-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${Date.now()}`;
}

/**
 * Name derived from an adopted entry's own comment, e.g.
 * "# The Dusk Ceremony — the yard wakes (sunset ...)" -> "The Dusk Ceremony".
 */
function deriveName(descriptionLines, command) {
    const first = (descriptionLines[0] || '').trim();
    if (first) {
        let name = first.split(/\s+[—–-]\s+/)[0];
        name = name.split(' (')[0].trim();
        if (name.length > 3) return name.slice(0, 70);
    }
    const moment = command.match(/moments\/([\w.-]+)\.json/);
    if (moment) return moment[1].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const script = command.match(/([\w-]+)\.mjs/);
    if (script) return script[1].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return 'Adopted schedule';
}

function stripCommentMarker(line) {
    return String(line).trimStart().replace(/^#+\s?/, '').trim();
}

function findBlock(lines) {
    const start = lines.findIndex((line) => line.trim() === BLOCK_START.trim());
    if (start === -1) return null;
    const end = lines.findIndex((line, index) => index > start && line.trim() === BLOCK_END.trim());
    if (end === -1) return null;
    return { start, end };
}

function parseManagedBody(bodyLines) {
    const events = [];
    let pendingMeta = null;

    for (const line of bodyLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(META_PREFIX.trim())) {
            const json = trimmed.slice(META_PREFIX.trim().length).trim();
            try {
                pendingMeta = JSON.parse(json);
            } catch (error) {
                pendingMeta = null;
            }
            continue;
        }
        if (!pendingMeta) continue;

        // The metadata's `enabled` flag decides which form we are looking for.
        // Without that, a description comment that happens to look like a cron
        // line would be mistaken for the entry itself.
        const wantEnabled = pendingMeta.enabled !== false;
        const parsed = wantEnabled ? parseCrontabLine(line) : parseCommentedCrontabLine(line);
        if (!parsed) continue;

        events.push({
            id: pendingMeta.id || slugify(pendingMeta.name),
            name: pendingMeta.name || deriveName([], parsed.command),
            description: pendingMeta.description || '',
            kind: pendingMeta.kind || 'raw',
            enabled: wantEnabled,
            expression: parsed.expression,
            command: parsed.command
        });
        pendingMeta = null;
    }

    return events;
}

/**
 * Adopt pre-existing MonsterBox cron entries so the operator's first visit
 * shows the schedule he already has instead of an empty page. Only lines whose
 * command references the MonsterBox install are taken; anything else (notably
 * the hand-written `@reboot /home/remote/start-audio.sh` line) stays unmanaged
 * and is never rewritten.
 */
function adoptExistingEntries(lines, repoRoot) {
    const marker = repoRoot || 'MonsterBox';
    const isOurs = (command) => command.includes(marker) || /MonsterBox/i.test(command);

    const consumed = new Set();
    const events = [];
    const taken = new Set();

    lines.forEach((line, index) => {
        const active = parseCrontabLine(line);
        const disabled = active ? null : parseCommentedCrontabLine(line);
        const parsed = active || disabled;
        if (!parsed || !isOurs(parsed.command)) return;

        // Walk back over the contiguous comment block that documents this entry
        // and take it as the description. A blank line ends the association, so
        // the file's big header (separated by a blank line) is left alone.
        const descriptionLines = [];
        for (let back = index - 1; back >= 0; back -= 1) {
            const prev = lines[back];
            if (!prev.trim()) break;
            if (!prev.trimStart().startsWith('#')) break;
            if (consumed.has(back)) break;
            if (parseCommentedCrontabLine(prev)) break; // another disabled entry
            descriptionLines.unshift(stripCommentMarker(prev));
            consumed.add(back);
        }

        consumed.add(index);
        const name = deriveName(descriptionLines, parsed.command);
        const id = makeUniqueId(name, taken);
        taken.add(id);

        events.push({
            id,
            name,
            description: descriptionLines.join('\n'),
            kind: parsed.command.includes('yard-theater/perform.mjs') ? 'moment' : 'raw',
            enabled: Boolean(active),
            expression: parsed.expression,
            command: parsed.command,
            adopted: true
        });
    });

    return { events, consumed };
}

/**
 * Parse a crontab into { pre, events, post }.
 * `pre` and `post` are the operator's own lines, kept exactly as found.
 */
export function parseCrontab(text, options = {}) {
    const source = String(text == null ? '' : text);
    const lines = source.length ? source.replace(/\n$/, '').split('\n') : [];

    const block = findBlock(lines);
    if (block) {
        return {
            pre: lines.slice(0, block.start),
            post: lines.slice(block.end + 1),
            events: parseManagedBody(lines.slice(block.start + 1, block.end)),
            adopted: false,
            hadBlock: true
        };
    }

    const { events, consumed } = adoptExistingEntries(lines, options.repoRoot);
    if (events.length === 0) {
        return { pre: lines, post: [], events: [], adopted: false, hadBlock: false };
    }

    // The block takes the position of the first entry it absorbed, so the
    // schedule stays roughly where the operator left it in the file.
    const firstConsumed = Math.min(...consumed);
    const pre = [];
    const post = [];
    lines.forEach((line, index) => {
        if (consumed.has(index)) return;
        if (index < firstConsumed) pre.push(line);
        else post.push(line);
    });

    return { pre, post, events, adopted: true, hadBlock: false };
}

function renderEvent(event) {
    const meta = {
        id: event.id,
        name: event.name,
        enabled: Boolean(event.enabled),
        kind: event.kind || 'raw'
    };
    if (event.description) meta.description = event.description;

    const lines = [`${META_PREFIX}${JSON.stringify(meta)}`];
    // Re-emit the entry's own prose as comments, so the crontab still reads
    // exactly as the operator wrote it when he opens it over SSH — adopting an
    // entry must not quietly swallow the notes that explain it.
    const prose = String(event.description || '').split('\n').filter((line) => line.trim() !== '');
    if (prose.length) {
        prose.forEach((line) => lines.push(`# ${line}`));
    } else {
        lines.push(`# ${event.name}`);
    }
    if (!event.enabled) lines.push('# [DISABLED — enable again from /schedule]');
    const entry = `${event.expression} ${event.command}`;
    lines.push(event.enabled ? entry : `# ${entry}`);
    return lines;
}

/** Rebuild the full crontab text from a parsed model. */
export function renderCrontab(model) {
    const out = [...(model.pre || [])];

    if ((model.events || []).length > 0) {
        if (out.length && out[out.length - 1].trim() !== '') out.push('');
        out.push(BLOCK_START);
        model.events.forEach((event, index) => {
            if (index > 0) out.push('');
            out.push(...renderEvent(event));
        });
        out.push(BLOCK_END);
    }

    const post = model.post || [];
    if (post.length) {
        if (out.length && out[out.length - 1].trim() !== '' && post[0].trim() !== '') out.push('');
        out.push(...post);
    }

    // crontab(1) requires a trailing newline or it drops the last entry.
    return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * Every line the operator wrote that MonsterBox does not manage. Used by the
 * preservation test and by the service's own paranoia check before each write.
 */
export function unmanagedLines(text) {
    const source = String(text == null ? '' : text);
    const lines = source.length ? source.replace(/\n$/, '').split('\n') : [];
    const block = findBlock(lines);
    const outside = block
        ? [...lines.slice(0, block.start), ...lines.slice(block.end + 1)]
        : lines;
    return outside.filter((line) => line.trim() !== '');
}

export default {
    BLOCK_START,
    BLOCK_END,
    META_PREFIX,
    parseCrontab,
    renderCrontab,
    parseCrontabLine,
    validateCommand,
    unmanagedLines,
    makeUniqueId
};
