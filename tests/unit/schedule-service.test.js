/**
 * scheduleService tests — command construction, the friendly schedule builder,
 * and the write-safety guard.
 *
 * Every test here runs against a TEMP crontab file via MB_SCHEDULE_CRONTAB_FILE.
 * Nothing in this file can touch the operator's real crontab: a test run that
 * wipes the Halloween schedule would be a far worse bug than any it could catch.
 */

import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMP_CRONTAB = path.join(os.tmpdir(), 'monsterbox-schedule-service-test.crontab');
process.env.MB_SCHEDULE_CRONTAB_FILE = TEMP_CRONTAB;

const { default: scheduleService } = await import('../../services/scheduleService.js');
const { unmanagedLines } = await import('../../services/schedule/crontabFile.js');

const REBOOT_LINE = '@reboot /home/remote/start-audio.sh >> /home/remote/audio-startup.log 2>&1';
const HARVEST_LINE = '0 2 1 11 * cd /home/remote/MonsterBox && (node scripts/night-memory/scrub-test.mjs '
    + '&& node scripts/night-memory/harvest.mjs --hours 12) >> /home/remote/yard-theater-logs/harvest.log 2>&1';

function seed(text) {
    fs.writeFileSync(TEMP_CRONTAB, text, 'utf8');
}

function readBack() {
    return fs.readFileSync(TEMP_CRONTAB, 'utf8');
}

function baseCrontab() {
    return [
        REBOOT_LINE,
        '',
        '# The Dusk Ceremony — the yard wakes',
        '30 18 31 10 * cd /home/remote/MonsterBox && node scripts/yard-theater/perform.mjs '
        + 'moments/dusk-ceremony.json >> /home/remote/yard-theater-logs/theater.log 2>&1',
        '',
        '# Night Memory',
        HARVEST_LINE,
        ''
    ].join('\n');
}

describe('scheduleService — command construction', function () {
    it('always prefixes cd <repo> and redirects to a log', function () {
        const command = scheduleService.buildCommand({ type: 'moment', moment: 'thomas.json' });
        expect(command).to.contain('cd ' + scheduleService.REPO_ROOT + ' &&');
        expect(command).to.contain('perform.mjs moments/thomas.json');
        expect(command).to.contain('>> ');
        expect(command).to.contain('2>&1');
    });

    it('wraps the chain in a subshell so the redirect covers ALL of it', function () {
        // `a && b >> log` binds the redirect to b only — the exact bug that would
        // have left an empty harvest.log if the PHI gate ever tripped.
        const command = scheduleService.buildCommand({
            type: 'raw',
            command: 'node scripts/night-memory/scrub-test.mjs && node scripts/night-memory/harvest.mjs'
        });
        const chain = command.slice(command.indexOf('&&') + 3);
        expect(chain.trim().startsWith('(')).to.equal(true);
        expect(command).to.match(/\)\s*>>/);
    });

    it('adds --dry-run for a rehearsal, and logs it separately', function () {
        const command = scheduleService.buildCommand({ type: 'moment', moment: 'thomas.json', dryRun: true });
        expect(command).to.contain('--dry-run');
        expect(command).to.contain('theater-rehearsal.log');
    });

    it('leaves an already-formed command alone rather than double-wrapping', function () {
        const original = 'cd /home/remote/MonsterBox && (echo hi) >> /tmp/x.log 2>&1';
        expect(scheduleService.buildCommand({ type: 'raw', command: original })).to.equal(original);
    });

    it('REFUSES a traversing moment name instead of quietly scrubbing it', function () {
        // Scrubbing would silently run some other file; refusing says what happened.
        expect(() => scheduleService.buildCommand({ type: 'moment', moment: '../../etc/passwd' }))
            .to.throw(/not a valid moment file name/);
        expect(() => scheduleService.buildCommand({ type: 'moment', moment: 'thomas.json; rm -rf /' }))
            .to.throw(/not a valid moment file name/);
        expect(scheduleService.buildCommand({ type: 'moment', moment: 'dusk-ceremony.json' }))
            .to.contain('moments/dusk-ceremony.json');
    });

    it('rejects an empty action', function () {
        expect(() => scheduleService.buildCommand({ type: 'raw', command: '  ' })).to.throw();
        expect(() => scheduleService.buildCommand({ type: 'moment' })).to.throw();
    });
});

describe('scheduleService — friendly schedule builder', function () {
    it('builds a daily expression', function () {
        expect(scheduleService.buildExpression({ mode: 'daily', time: '18:30' })).to.equal('30 18 * * *');
    });

    it('builds a specific-date expression', function () {
        expect(scheduleService.buildExpression({ mode: 'date', time: '18:30', date: '2026-10-31' }))
            .to.equal('30 18 31 10 *');
    });

    it('builds a days-of-week expression, sorted and de-duplicated', function () {
        expect(scheduleService.buildExpression({ mode: 'weekly', time: '18:30', days: [6, 5, 5] }))
            .to.equal('30 18 * * 5,6');
    });

    it('passes a raw expression through, but only if it is valid', function () {
        expect(scheduleService.buildExpression({ mode: 'raw', expression: '*/15 * * * *' })).to.equal('*/15 * * * *');
        expect(() => scheduleService.buildExpression({ mode: 'raw', expression: 'nonsense' })).to.throw();
    });

    it('rejects malformed times and dates', function () {
        expect(() => scheduleService.buildExpression({ mode: 'daily', time: '25:00' })).to.throw();
        expect(() => scheduleService.buildExpression({ mode: 'daily', time: 'evening' })).to.throw();
        expect(() => scheduleService.buildExpression({ mode: 'date', time: '18:30', date: '31/10/2026' })).to.throw();
        expect(() => scheduleService.buildExpression({ mode: 'weekly', time: '18:30', days: [] })).to.throw();
    });
});

describe('scheduleService — preview', function () {
    it('answers "when will this actually fire" before anything is saved', function () {
        const preview = scheduleService.previewEvent(
            { schedule: { mode: 'date', time: '18:30', date: '2026-10-31' }, action: { type: 'moment', moment: 'dusk-ceremony.json' } },
            new Date(2026, 7, 16, 12, 0)
        );
        expect(preview.expression).to.equal('30 18 31 10 *');
        expect(preview.schedule.nextRunText).to.equal('Sat 31 Oct 2026, 18:30');
        expect(preview.schedule.nextRunRelative).to.equal('in 76 days');
        expect(preview.commandError).to.equal(null);
    });

    it('reports the moment\'s target nodes so offline ones can be flagged', function () {
        const preview = scheduleService.previewEvent(
            { schedule: { mode: 'daily', time: '18:30' }, action: { type: 'moment', moment: 'dusk-ceremony.json' } }
        );
        expect(preview.targetNodes).to.be.an('array').that.is.not.empty;
    });
});

describe('scheduleService — CRUD against a temp crontab', function () {
    beforeEach(function () {
        seed(baseCrontab());
    });

    after(function () {
        try { fs.unlinkSync(TEMP_CRONTAB); } catch (error) { /* already gone */ }
    });

    it('adopts existing entries on first read, then stops adopting', async function () {
        const first = await scheduleService.listEvents();
        expect(first.adoptedNow).to.equal(true);
        expect(first.events).to.have.length(2);

        const second = await scheduleService.listEvents();
        expect(second.adoptedNow).to.equal(false);
        expect(second.events).to.have.length(2);
    });

    it('every event carries a computed next run', async function () {
        const { events } = await scheduleService.listEvents();
        events.forEach(function (event) {
            expect(event.schedule.valid, event.name).to.equal(true);
            expect(event.schedule.nextRunText, event.name).to.be.a('string');
            expect(event.schedule.nextRunRelative, event.name).to.be.a('string');
        });
    });

    it('creates, toggles and deletes without ever losing the @reboot line', async function () {
        await scheduleService.listEvents();

        const created = await scheduleService.createEvent({
            name: 'Test Rehearsal',
            schedule: { mode: 'weekly', time: '19:15', days: [5, 6] },
            action: { type: 'moment', moment: 'thomas.json', dryRun: true }
        });
        expect(created.expression).to.equal('15 19 * * 5,6');
        expect(readBack().split('\n')).to.include(REBOOT_LINE);

        const off = await scheduleService.toggleEvent(created.id, false);
        expect(off.enabled).to.equal(false);
        // Disabled means commented out, NOT deleted — the line must still be there.
        expect(readBack()).to.contain('# ' + created.expression + ' ' + created.command);

        const on = await scheduleService.toggleEvent(created.id, true);
        expect(on.enabled).to.equal(true);
        expect(readBack()).to.contain(created.expression + ' ' + created.command);

        await scheduleService.deleteEvent(created.id);
        const after = await scheduleService.listEvents();
        expect(after.events.some(function (e) { return e.id === created.id; })).to.equal(false);
        expect(readBack().split('\n')).to.include(REBOOT_LINE);
    });

    it('preserves the operator\'s unmanaged lines across every operation', async function () {
        await scheduleService.listEvents();
        const before = unmanagedLines(readBack());

        const created = await scheduleService.createEvent({
            name: 'Churn',
            schedule: { mode: 'daily', time: '03:00' },
            action: { type: 'raw', command: 'echo hello' }
        });
        await scheduleService.toggleEvent(created.id, false);
        await scheduleService.deleteEvent(created.id);

        const after = unmanagedLines(readBack());
        before.forEach(function (line) {
            expect(after, 'lost unmanaged line: ' + line).to.include(line);
        });
    });

    it('refuses an entry that can never fire', async function () {
        await scheduleService.listEvents();
        let threw = null;
        try {
            await scheduleService.createEvent({
                name: 'Impossible',
                expression: '0 0 31 2 *',
                action: { type: 'raw', command: 'echo nope' }
            });
        } catch (error) {
            threw = error;
        }
        expect(threw, 'should refuse 31 February').to.be.an('error');
        expect(threw.message).to.contain('never fire');
    });

    it('refuses a command containing an unescaped %', async function () {
        await scheduleService.listEvents();
        let threw = null;
        try {
            await scheduleService.createEvent({
                name: 'Percent',
                schedule: { mode: 'daily', time: '04:00' },
                command: 'cd /repo && (date +%Y) >> /tmp/x.log 2>&1'
            });
        } catch (error) {
            threw = error;
        }
        expect(threw).to.be.an('error');
        expect(threw.message).to.contain('%');
    });

    it('reports a clear error for an unknown id rather than silently doing nothing', async function () {
        await scheduleService.listEvents();
        let threw = null;
        try {
            await scheduleService.toggleEvent('does-not-exist', false);
        } catch (error) {
            threw = error;
        }
        expect(threw).to.be.an('error');
        expect(threw.message).to.contain('does-not-exist');
    });
});
