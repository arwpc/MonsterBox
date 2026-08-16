/**
 * Cron expression / next-fire unit tests.
 *
 * These carry more weight than usual. The Scheduled Events page exists because
 * a Halloween crontab dated `31 10` looked installed and correct on 16 August
 * and did nothing for 76 days. The whole fix is "show the operator when this
 * ACTUALLY fires", so an off-by-one here would reintroduce the exact bug the
 * feature was built to kill.
 *
 * All assertions use fixed `from` dates — no reliance on the wall clock.
 */

import { expect } from 'chai';
import {
    parseField,
    parseCronExpression,
    isValidCronExpression,
    getNextRun,
    describeCronExpression,
    formatRunTime,
    formatRelative,
    summariseSchedule,
    CronParseError
} from '../../services/schedule/cronExpression.js';

// Local-time constructor, matching how cron thinks about wall clock.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe('cronExpression — field parsing', function () {
    it('expands * to the whole field', function () {
        const parsed = parseCronExpression('* * * * *');
        expect(parsed.fields.minute.size).to.equal(60);
        expect(parsed.fields.hour.size).to.equal(24);
        expect(parsed.fields.dayOfMonth.size).to.equal(31);
        expect(parsed.fields.month.size).to.equal(12);
        expect(parsed.fields.dayOfWeek.size).to.equal(7);
    });

    it('expands a single value', function () {
        const parsed = parseCronExpression('30 18 31 10 *');
        expect([...parsed.fields.minute]).to.deep.equal([30]);
        expect([...parsed.fields.hour]).to.deep.equal([18]);
        expect([...parsed.fields.dayOfMonth]).to.deep.equal([31]);
        expect([...parsed.fields.month]).to.deep.equal([10]);
    });

    it('expands inclusive ranges', function () {
        const values = [...parseField('1-5', { key: 'dayOfWeek', min: 0, max: 7 })];
        expect(values.sort((a, b) => a - b)).to.deep.equal([1, 2, 3, 4, 5]);
    });

    it('expands lists', function () {
        const parsed = parseCronExpression('0 0 * * 1,3,5');
        expect([...parsed.fields.dayOfWeek].sort((a, b) => a - b)).to.deep.equal([1, 3, 5]);
    });

    it('expands mixed lists of ranges and singles', function () {
        const parsed = parseCronExpression('0,15,30-32 * * * *');
        expect([...parsed.fields.minute].sort((a, b) => a - b)).to.deep.equal([0, 15, 30, 31, 32]);
    });

    it('expands */15 steps across the whole field', function () {
        const parsed = parseCronExpression('*/15 * * * *');
        expect([...parsed.fields.minute].sort((a, b) => a - b)).to.deep.equal([0, 15, 30, 45]);
    });

    it('expands stepped ranges like 0-30/10', function () {
        const parsed = parseCronExpression('0-30/10 * * * *');
        expect([...parsed.fields.minute].sort((a, b) => a - b)).to.deep.equal([0, 10, 20, 30]);
    });

    it('expands value/step as value..max (Vixie behaviour)', function () {
        const parsed = parseCronExpression('5/20 * * * *');
        expect([...parsed.fields.minute].sort((a, b) => a - b)).to.deep.equal([5, 25, 45]);
    });

    it('accepts month and day names case-insensitively', function () {
        const parsed = parseCronExpression('0 18 * OCT fri,SAT');
        expect([...parsed.fields.month]).to.deep.equal([10]);
        expect([...parsed.fields.dayOfWeek].sort((a, b) => a - b)).to.deep.equal([5, 6]);
    });

    it('normalises day-of-week 7 to 0 (Sunday)', function () {
        const parsed = parseCronExpression('0 0 * * 7');
        expect([...parsed.fields.dayOfWeek]).to.deep.equal([0]);
    });

    it('rejects out-of-range values', function () {
        expect(() => parseCronExpression('60 * * * *')).to.throw(CronParseError);
        expect(() => parseCronExpression('* 24 * * *')).to.throw(CronParseError);
        expect(() => parseCronExpression('* * 32 * *')).to.throw(CronParseError);
        expect(() => parseCronExpression('* * * 13 *')).to.throw(CronParseError);
        expect(() => parseCronExpression('* * * * 8')).to.throw(CronParseError);
    });

    it('rejects the wrong number of fields and garbage', function () {
        expect(isValidCronExpression('* * * *')).to.equal(false);
        expect(isValidCronExpression('* * * * * *')).to.equal(false);
        expect(isValidCronExpression('The cd /home/remote/MonsterBox && on')).to.equal(false);
        expect(isValidCronExpression('')).to.equal(false);
        expect(isValidCronExpression('5-1 * * * *')).to.equal(false);
        expect(isValidCronExpression('*/0 * * * *')).to.equal(false);
    });
});

describe('cronExpression — @reboot and nicknames', function () {
    it('treats @reboot as display-only with no next-fire time', function () {
        const parsed = parseCronExpression('@reboot');
        expect(parsed.schedulable).to.equal(false);
        expect(getNextRun('@reboot', at(2026, 8, 16, 12, 0))).to.equal(null);

        const summary = summariseSchedule('@reboot', at(2026, 8, 16, 12, 0));
        expect(summary.valid).to.equal(true);
        expect(summary.bootOnly).to.equal(true);
        expect(summary.nextRun).to.equal(null);
        expect(summary.nextRunText).to.equal('At next reboot');
        expect(summary.neverFires).to.equal(false);
    });

    it('expands the standard nicknames', function () {
        expect(getNextRun('@daily', at(2026, 8, 16, 12, 0)).getHours()).to.equal(0);
        expect(getNextRun('@hourly', at(2026, 8, 16, 12, 30))).to.deep.equal(at(2026, 8, 16, 13, 0));
        expect(isValidCronExpression('@nonsense')).to.equal(false);
    });
});

describe('cronExpression — next run', function () {
    it('never returns a time in the past and rounds up to the next minute', function () {
        const from = new Date(2026, 7, 16, 12, 0, 30, 0); // 12:00:30
        expect(getNextRun('* * * * *', from)).to.deep.equal(at(2026, 8, 16, 12, 1));
    });

    it('finds a time later the same day', function () {
        expect(getNextRun('30 18 * * *', at(2026, 8, 16, 12, 0)))
            .to.deep.equal(at(2026, 8, 16, 18, 30));
    });

    it('rolls to tomorrow when today has already passed', function () {
        expect(getNextRun('30 18 * * *', at(2026, 8, 16, 19, 0)))
            .to.deep.equal(at(2026, 8, 17, 18, 30));
    });

    it('THE MOTIVATING BUG: a 31 Oct entry seen on 16 Aug is 76 days out', function () {
        const now = at(2026, 8, 16, 12, 0);
        const next = getNextRun('30 18 31 10 *', now);
        expect(next).to.deep.equal(at(2026, 10, 31, 18, 30));
        expect(formatRunTime(next)).to.equal('Sat 31 Oct 2026, 18:30');
        expect(formatRelative(next, now)).to.equal('in 76 days');
    });

    it('computes the harvest entry (02:00 on 1 Nov) across the month boundary', function () {
        const now = at(2026, 8, 16, 12, 0);
        const next = getNextRun('0 2 1 11 *', now);
        expect(next).to.deep.equal(at(2026, 11, 1, 2, 0));
        expect(formatRunTime(next)).to.equal('Sun 1 Nov 2026, 02:00');
    });

    it('handles month rollover', function () {
        expect(getNextRun('0 0 1 * *', at(2026, 8, 16, 12, 0)))
            .to.deep.equal(at(2026, 9, 1, 0, 0));
    });

    it('handles year rollover', function () {
        // Asked on 1 Nov 2026, the 31 Oct entry is next YEAR.
        expect(getNextRun('30 18 31 10 *', at(2026, 11, 1, 0, 0)))
            .to.deep.equal(at(2027, 10, 31, 18, 30));
    });

    it('handles year rollover across New Year', function () {
        expect(getNextRun('0 0 1 1 *', at(2026, 12, 31, 23, 59)))
            .to.deep.equal(at(2027, 1, 1, 0, 0));
    });

    it('skips months that do not have the requested day, and finds leap days', function () {
        // 29 February exists in 2028, not 2026 or 2027.
        expect(getNextRun('0 12 29 2 *', at(2026, 3, 1, 0, 0)))
            .to.deep.equal(at(2028, 2, 29, 12, 0));
    });

    it('returns null for a schedule that can never fire', function () {
        expect(getNextRun('0 0 31 2 *', at(2026, 8, 16, 12, 0))).to.equal(null);
        const summary = summariseSchedule('0 0 31 2 *', at(2026, 8, 16, 12, 0));
        expect(summary.neverFires).to.equal(true);
    });

    it('steps through */15 correctly, including the wrap to the next hour', function () {
        expect(getNextRun('*/15 * * * *', at(2026, 8, 16, 12, 0)))
            .to.deep.equal(at(2026, 8, 16, 12, 15));
        expect(getNextRun('*/15 * * * *', at(2026, 8, 16, 12, 46)))
            .to.deep.equal(at(2026, 8, 16, 13, 0));
    });

    it('honours restricted hour sets', function () {
        expect(getNextRun('0 9-17 * * *', at(2026, 8, 16, 20, 0)))
            .to.deep.equal(at(2026, 8, 17, 9, 0));
    });
});

describe('cronExpression — the day-of-month / day-of-week OR quirk', function () {
    // 2026-08-16 is a Sunday. 2026-08-17 is a Monday.

    it('ANDs when only one of dom/dow is restricted', function () {
        // dom=* (unrestricted), dow=1 -> next Monday
        expect(getNextRun('0 12 * * 1', at(2026, 8, 16, 0, 0)))
            .to.deep.equal(at(2026, 8, 17, 12, 0));
        // dom=20, dow=* -> the 20th
        expect(getNextRun('0 12 20 * *', at(2026, 8, 16, 0, 0)))
            .to.deep.equal(at(2026, 8, 20, 12, 0));
    });

    it('ORs when BOTH dom and dow are restricted', function () {
        // "the 20th OR any Monday" — Monday the 17th comes first, even though
        // it is not the 20th. AND semantics would wrongly give 2032.
        const parsed = parseCronExpression('0 12 20 * 1');
        expect(parsed.dayMatchMode).to.equal('or');
        expect(getNextRun('0 12 20 * 1', at(2026, 8, 16, 0, 0)))
            .to.deep.equal(at(2026, 8, 17, 12, 0));
    });

    it('ORs so a dom match still fires on a non-matching weekday', function () {
        // The 20th of August 2026 is a Thursday, not a Monday, but dom matches.
        expect(getNextRun('0 12 20 * 1', at(2026, 8, 18, 0, 0)))
            .to.deep.equal(at(2026, 8, 20, 12, 0));
    });

    it('treats */n in a day field as UNrestricted, exactly as Vixie cron does', function () {
        const parsed = parseCronExpression('0 12 */2 * 1');
        expect(parsed.dayMatchMode).to.equal('and');
    });

    it('matches the real rehearsal line: Fri+Sat evenings in October', function () {
        // `30 18 * 10 5,6` — dom is *, so this is a plain AND: Fridays and
        // Saturdays in October only. 2026-10-02 is the first Friday.
        expect(getNextRun('30 18 * 10 5,6', at(2026, 8, 16, 12, 0)))
            .to.deep.equal(at(2026, 10, 2, 18, 30));
    });
});

describe('cronExpression — plain-language description', function () {
    it('describes the installed Halloween entries', function () {
        expect(describeCronExpression('30 18 31 10 *'))
            .to.equal('At 18:30, on the 31st in October');
        expect(describeCronExpression('0 2 1 11 *'))
            .to.equal('At 02:00, on the 1st in November');
    });

    it('describes daily and weekly schedules', function () {
        expect(describeCronExpression('0 9 * * *')).to.equal('At 09:00, every day');
        expect(describeCronExpression('30 18 * 10 5,6'))
            .to.equal('At 18:30, on Friday and Saturday in October');
    });

    it('spells out the OR quirk rather than hiding it', function () {
        expect(describeCronExpression('0 12 20 * 1')).to.contain('OR');
    });

    it('describes @reboot', function () {
        expect(describeCronExpression('@reboot')).to.equal('At every system boot');
    });

    it('never throws on garbage', function () {
        expect(describeCronExpression('not a cron line')).to.equal('Unrecognised schedule');
    });
});

describe('cronExpression — relative formatting', function () {
    const base = at(2026, 8, 16, 12, 0);

    it('formats minutes, hours and days', function () {
        expect(formatRelative(at(2026, 8, 16, 12, 30), base)).to.equal('in 30 minutes');
        expect(formatRelative(at(2026, 8, 16, 13, 0), base)).to.equal('in 1 hour');
        expect(formatRelative(at(2026, 8, 16, 22, 0), base)).to.equal('in 10 hours');
        expect(formatRelative(at(2026, 8, 20, 12, 0), base)).to.equal('in 4 days');
        expect(formatRelative(at(2026, 10, 31, 18, 30), base)).to.equal('in 76 days');
    });

    it('handles the singular and the null case', function () {
        expect(formatRelative(at(2026, 8, 16, 12, 1), base)).to.equal('in 1 minute');
        expect(formatRelative(null, base)).to.equal(null);
    });
});

describe('cronExpression — summariseSchedule', function () {
    it('returns everything the UI needs in one call', function () {
        const summary = summariseSchedule('30 18 31 10 *', at(2026, 8, 16, 12, 0));
        expect(summary.valid).to.equal(true);
        expect(summary.nextRunText).to.equal('Sat 31 Oct 2026, 18:30');
        expect(summary.nextRunRelative).to.equal('in 76 days');
        expect(summary.description).to.contain('18:30');
        expect(summary.bootOnly).to.equal(false);
        expect(summary.neverFires).to.equal(false);
    });

    it('reports invalid expressions without throwing', function () {
        const summary = summariseSchedule('99 99 * * *', at(2026, 8, 16, 12, 0));
        expect(summary.valid).to.equal(false);
        expect(summary.error).to.be.a('string');
        expect(summary.nextRun).to.equal(null);
    });
});
