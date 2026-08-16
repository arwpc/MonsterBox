/**
 * Cron expression parser + next-fire calculator.
 *
 * WHY this exists at all: MonsterBox may not add npm dependencies, so there is
 * no cron-parser and no date library. More importantly, the whole point of the
 * Scheduled Events page is that "when does this actually fire?" must be visible.
 * A Halloween schedule dated `31 10` looks installed and correct on 16 August
 * and does nothing for 76 days. That invisibility is the bug this module kills,
 * so the next-fire maths is the one place in the feature that must be exact.
 *
 * Pure functions only — no I/O, no clock reads except the `from` you pass in.
 * That is what makes it unit-testable against fixed dates.
 *
 * Supported syntax (Vixie/Debian cron):
 *   *            every value
 *   5            a single value
 *   1-5          an inclusive range
 *   1,3,5        a list (elements may themselves be ranges/steps)
 *   *​/15         a step over the whole field
 *   0-30/10      a step over a range
 *   5/10         a step from a value to the field maximum (Vixie accepts this)
 *   JAN..DEC     month names, SUN..SAT day names (case-insensitive)
 *   @reboot      display-only: fires at boot, has NO calculable next-fire time
 *   @daily etc.  the standard nickname aliases
 *
 * The day-of-month / day-of-week quirk is implemented deliberately: when BOTH
 * fields are restricted, cron fires when EITHER matches (OR), not both (AND).
 * Following Vixie, a field is "restricted" when it does not begin with `*`, so
 * `*​/2` counts as unrestricted for this rule just as the real cron does.
 */

const FIELD_SPECS = [
    { key: 'minute', min: 0, max: 59 },
    { key: 'hour', min: 0, max: 23 },
    { key: 'dayOfMonth', min: 1, max: 31 },
    {
        key: 'month', min: 1, max: 12,
        names: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
    },
    {
        key: 'dayOfWeek', min: 0, max: 7,
        names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
    }
];

// Standard cron nicknames. @reboot is intentionally null — it has no schedule.
export const CRON_NICKNAMES = {
    '@reboot': null,
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export class CronParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CronParseError';
    }
}

function resolveToken(token, spec) {
    const lowered = String(token).toLowerCase();
    if (spec.names && Object.prototype.hasOwnProperty.call(spec.names, lowered)) {
        return spec.names[lowered];
    }
    if (!/^\d+$/.test(token)) {
        throw new CronParseError(`"${token}" is not a valid ${spec.key} value`);
    }
    return Number(token);
}

function assertInRange(value, spec) {
    if (value < spec.min || value > spec.max) {
        throw new CronParseError(`${spec.key} value ${value} is outside ${spec.min}-${spec.max}`);
    }
    return value;
}

/**
 * Expand one cron field into the set of numeric values it matches.
 * dayOfWeek 7 is normalised to 0 so Sunday has a single representation.
 */
export function parseField(raw, spec) {
    const text = String(raw).trim();
    if (text === '') throw new CronParseError(`empty ${spec.key} field`);

    const values = new Set();

    for (const part of text.split(',')) {
        const piece = part.trim();
        if (piece === '') throw new CronParseError(`empty list element in ${spec.key}`);

        let stepText = null;
        let rangeText = piece;
        const slash = piece.indexOf('/');
        if (slash !== -1) {
            rangeText = piece.slice(0, slash).trim();
            stepText = piece.slice(slash + 1).trim();
            if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
                throw new CronParseError(`invalid step "/${stepText}" in ${spec.key}`);
            }
        }
        const step = stepText === null ? 1 : Number(stepText);

        let start;
        let end;
        if (rangeText === '*') {
            start = spec.min;
            end = spec.max;
        } else if (rangeText.includes('-')) {
            const [lo, hi] = rangeText.split('-');
            if (hi === undefined || lo === '' || hi === '') {
                throw new CronParseError(`invalid range "${rangeText}" in ${spec.key}`);
            }
            start = assertInRange(resolveToken(lo.trim(), spec), spec);
            end = assertInRange(resolveToken(hi.trim(), spec), spec);
            if (end < start) {
                throw new CronParseError(`range "${rangeText}" in ${spec.key} runs backwards`);
            }
        } else {
            start = assertInRange(resolveToken(rangeText, spec), spec);
            // Vixie treats `5/10` as "from 5 to the field maximum, every 10".
            end = stepText === null ? start : spec.max;
        }

        for (let value = start; value <= end; value += step) {
            values.add(spec.key === 'dayOfWeek' && value === 7 ? 0 : value);
        }
    }

    if (values.size === 0) throw new CronParseError(`${spec.key} matches nothing`);
    return values;
}

/**
 * Parse a whole 5-field expression (or a nickname).
 * Returns null-scheduled metadata for @reboot rather than throwing, because
 * @reboot is a legitimate entry the page must still display.
 */
export function parseCronExpression(expression) {
    const text = String(expression == null ? '' : expression).trim();
    if (text === '') throw new CronParseError('empty cron expression');

    if (text.startsWith('@')) {
        const nickname = text.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(CRON_NICKNAMES, nickname)) {
            throw new CronParseError(`unknown cron nickname "${text}"`);
        }
        const expanded = CRON_NICKNAMES[nickname];
        if (expanded === null) {
            return { expression: text, nickname, schedulable: false, fields: null };
        }
        const parsed = parseCronExpression(expanded);
        return { ...parsed, expression: text, nickname };
    }

    const tokens = text.split(/\s+/);
    if (tokens.length !== 5) {
        throw new CronParseError(`expected 5 fields, got ${tokens.length}: "${text}"`);
    }

    const fields = {};
    const raw = {};
    FIELD_SPECS.forEach((spec, index) => {
        raw[spec.key] = tokens[index];
        fields[spec.key] = parseField(tokens[index], spec);
    });

    // Vixie sets the "star" flag for any field beginning with '*', which is why
    // `*/2` is NOT considered restricted for the dom/dow OR rule.
    const domRestricted = !raw.dayOfMonth.startsWith('*');
    const dowRestricted = !raw.dayOfWeek.startsWith('*');

    return {
        expression: text,
        nickname: null,
        schedulable: true,
        fields,
        raw,
        domRestricted,
        dowRestricted,
        // Documented for the UI so the OR quirk is never a surprise.
        dayMatchMode: domRestricted && dowRestricted ? 'or' : 'and'
    };
}

/** True when the given cron expression is syntactically valid. */
export function isValidCronExpression(expression) {
    try {
        parseCronExpression(expression);
        return true;
    } catch (error) {
        return false;
    }
}

function dateMatches(parsed, date) {
    if (!parsed.fields.month.has(date.getMonth() + 1)) return false;
    const domOk = parsed.fields.dayOfMonth.has(date.getDate());
    const dowOk = parsed.fields.dayOfWeek.has(date.getDay());
    if (parsed.domRestricted && parsed.dowRestricted) return domOk || dowOk;
    return domOk && dowOk;
}

/**
 * Next wall-clock time this expression fires, strictly after `from`.
 * Returns null for @reboot and for expressions that can never fire
 * (e.g. `0 0 31 2 *` — 31 February).
 *
 * Walks day by day and only then scans hours/minutes, so a schedule 76 days out
 * costs ~76 iterations, not ~110,000.
 */
export function getNextRun(expression, from = new Date(), options = {}) {
    const parsed = typeof expression === 'object' && expression !== null
        ? expression
        : parseCronExpression(expression);
    if (!parsed.schedulable) return null;

    const horizonDays = options.horizonDays || 366 * 5;

    // Cron has one-minute resolution and never fires in the past, so start at
    // the top of the NEXT minute.
    let cursor = new Date(from.getTime());
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    const firstHour = cursor.getHours();
    const firstMinute = cursor.getMinutes();

    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset += 1) {
        if (dateMatches(parsed, cursor)) {
            const startHour = dayOffset === 0 ? firstHour : 0;
            for (let hour = startHour; hour <= 23; hour += 1) {
                if (!parsed.fields.hour.has(hour)) continue;
                const startMinute = (dayOffset === 0 && hour === firstHour) ? firstMinute : 0;
                for (let minute = startMinute; minute <= 59; minute += 1) {
                    if (parsed.fields.minute.has(minute)) {
                        return new Date(
                            cursor.getFullYear(), cursor.getMonth(), cursor.getDate(),
                            hour, minute, 0, 0
                        );
                    }
                }
            }
        }
        // Rebuilding from Y/M/D handles month and year rollover, and leap years,
        // without any manual day-count arithmetic.
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
    }

    return null;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

/** "Sat 31 Oct 2026, 18:30" — stable regardless of server locale. */
export function formatRunTime(date) {
    if (!date) return null;
    return `${WEEKDAY_LABELS[date.getDay()]} ${date.getDate()} ${MONTH_LABELS[date.getMonth()]} `
        + `${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "in 76 days" / "in 3 hours" / "in 12 minutes". */
export function formatRelative(target, from = new Date()) {
    if (!target) return null;
    const deltaMs = target.getTime() - from.getTime();
    if (deltaMs <= 0) return 'now';

    const minutes = Math.round(deltaMs / 60000);
    if (minutes < 1) return 'in under a minute';
    if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
        const restMinutes = minutes % 60;
        if (hours < 6 && restMinutes > 0) {
            return `in ${hours}h ${restMinutes}m`;
        }
        return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    const days = Math.round(hours / 24);
    return `in ${days} day${days === 1 ? '' : 's'}`;
}

function joinList(items) {
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describeSet(values, total, formatter) {
    const list = [...values].sort((a, b) => a - b);
    if (list.length === total) return null; // every value — nothing to say
    if (list.length > 6) return `${list.length} selected values`;
    return joinList(list.map(formatter));
}

/**
 * Plain-language rendering of an expression, so the raw cron string is never
 * the only explanation the operator gets.
 */
export function describeCronExpression(expression) {
    let parsed;
    try {
        parsed = typeof expression === 'object' && expression !== null
            ? expression
            : parseCronExpression(expression);
    } catch (error) {
        return 'Unrecognised schedule';
    }

    if (!parsed.schedulable) return 'At every system boot';

    const minutes = [...parsed.fields.minute].sort((a, b) => a - b);
    const hours = [...parsed.fields.hour].sort((a, b) => a - b);

    let timePart;
    if (minutes.length === 60 && hours.length === 24) {
        timePart = 'Every minute';
    } else if (minutes.length === 60) {
        timePart = `Every minute during ${joinList(hours.map((h) => `${pad2(h)}:00`))}`;
    } else if (hours.length === 24) {
        timePart = minutes.length === 1
            ? `Every hour at :${pad2(minutes[0])}`
            : `Every hour at ${joinList(minutes.map((m) => `:${pad2(m)}`))}`;
    } else if (minutes.length === 1 && hours.length === 1) {
        timePart = `At ${pad2(hours[0])}:${pad2(minutes[0])}`;
    } else if (minutes.length === 1) {
        timePart = `At ${joinList(hours.map((h) => `${pad2(h)}:${pad2(minutes[0])}`))}`;
    } else {
        timePart = `At ${hours.length} hour(s) x ${minutes.length} minute(s)`;
    }

    const monthPart = describeSet(parsed.fields.month, 12, (m) => MONTH_LONG[m - 1]);
    const domPart = describeSet(parsed.fields.dayOfMonth, 31, (d) => `the ${d}${ordinalSuffix(d)}`);
    const dowPart = describeSet(parsed.fields.dayOfWeek, 7, (d) => WEEKDAY_LONG[d]);

    const dayClauses = [];
    if (domPart && dowPart) {
        // The OR quirk, spelled out — this is exactly where silent surprises live.
        dayClauses.push(parsed.dayMatchMode === 'or'
            ? `on ${domPart} OR on ${dowPart}`
            : `on ${domPart} and ${dowPart}`);
    } else if (domPart) {
        dayClauses.push(`on ${domPart}`);
    } else if (dowPart) {
        dayClauses.push(`on ${dowPart}`);
    } else {
        dayClauses.push('every day');
    }
    if (monthPart) dayClauses.push(`in ${monthPart}`);

    return `${timePart}, ${dayClauses.join(' ')}`;
}

function ordinalSuffix(value) {
    if (value % 100 >= 11 && value % 100 <= 13) return 'th';
    switch (value % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

/**
 * Everything the UI needs about "when next", in one call.
 * `neverFires` distinguishes an impossible schedule (a real bug in the entry)
 * from @reboot (a legitimate boot-time entry).
 */
export function summariseSchedule(expression, from = new Date()) {
    let parsed;
    try {
        parsed = parseCronExpression(expression);
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            description: 'Unrecognised schedule',
            nextRun: null,
            nextRunText: null,
            nextRunRelative: null,
            bootOnly: false,
            neverFires: false
        };
    }

    const bootOnly = !parsed.schedulable;
    const next = bootOnly ? null : getNextRun(parsed, from);

    return {
        valid: true,
        error: null,
        description: describeCronExpression(parsed),
        dayMatchMode: parsed.dayMatchMode || null,
        nextRun: next ? next.toISOString() : null,
        nextRunText: bootOnly ? 'At next reboot' : formatRunTime(next),
        nextRunRelative: bootOnly ? null : formatRelative(next, from),
        bootOnly,
        neverFires: !bootOnly && next === null
    };
}

export default {
    parseField,
    parseCronExpression,
    isValidCronExpression,
    getNextRun,
    describeCronExpression,
    formatRunTime,
    formatRelative,
    summariseSchedule,
    CronParseError,
    CRON_NICKNAMES
};
