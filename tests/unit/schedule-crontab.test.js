/**
 * Crontab round-trip tests for Scheduled Events.
 *
 * The load-bearing guarantee: MonsterBox owns a delimited block and NOTHING
 * else. The operator's hand-written `@reboot /home/remote/start-audio.sh` line
 * must survive every single write, byte for byte. If that ever breaks, this
 * feature silently kills the audio stack on the next reboot — so it is proven
 * here against the real installed crontab shape, not a toy fixture.
 *
 * Pure text in, pure text out. Nothing in this file touches the real crontab.
 */

import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseCrontab,
    renderCrontab,
    parseCrontabLine,
    validateCommand,
    unmanagedLines,
    makeUniqueId,
    BLOCK_START,
    BLOCK_END
} from '../../services/schedule/crontabFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The operator's own line — nothing to do with MonsterBox, must never be touched.
const REBOOT_LINE = '@reboot /home/remote/start-audio.sh >> /home/remote/audio-startup.log 2>&1';

/**
 * The real installed crontab: the operator's @reboot line, then the shipped
 * Halloween schedule. Read from the shipped example so this test tracks what
 * we actually install rather than a copy that can drift.
 */
function installedCrontab() {
    const example = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'yard-theater', 'crontab.example'),
        'utf8'
    );
    return `${REBOOT_LINE}\n\n${example}`;
}

describe('crontabFile — line parsing', function () {
    it('parses a 5-field entry into expression and command', function () {
        const parsed = parseCrontabLine('30 18 31 10 * cd /repo && node x.mjs >> log 2>&1');
        expect(parsed.expression).to.equal('30 18 31 10 *');
        expect(parsed.command).to.equal('cd /repo && node x.mjs >> log 2>&1');
    });

    it('parses @reboot entries', function () {
        const parsed = parseCrontabLine(REBOOT_LINE);
        expect(parsed.expression).to.equal('@reboot');
        expect(parsed.command).to.equal('/home/remote/start-audio.sh >> /home/remote/audio-startup.log 2>&1');
    });

    it('does not mistake prose comments for schedule lines', function () {
        expect(parseCrontabLine('# The `cd /home/remote/MonsterBox &&` on every line is REQUIRED.')).to.equal(null);
        expect(parseCrontabLine('#   mkdir -p /home/remote/yard-theater-logs')).to.equal(null);
        expect(parseCrontabLine('')).to.equal(null);
        expect(parseCrontabLine('30 18 31 10 *')).to.equal(null); // no command
    });
});

describe('crontabFile — command validation', function () {
    it('rejects line breaks, which would corrupt the crontab', function () {
        expect(validateCommand('echo a\necho b')).to.contain('line breaks');
    });

    it('rejects an unescaped % — cron reads it as a newline and truncates', function () {
        expect(validateCommand('date +%Y')).to.contain('%');
        expect(validateCommand('date +\\%Y')).to.equal(null);
    });

    it('rejects empty commands', function () {
        expect(validateCommand('   ')).to.contain('empty');
    });
});

describe('crontabFile — adopting the installed schedule', function () {
    let parsed;

    before(function () {
        parsed = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
    });

    it('adopts exactly the four MonsterBox entries', function () {
        expect(parsed.adopted).to.equal(true);
        expect(parsed.events).to.have.length(4);
    });

    it('leaves the operator\'s @reboot audio line unmanaged', function () {
        expect(parsed.events.some((e) => e.command.includes('start-audio.sh'))).to.equal(false);
        expect(parsed.pre).to.include(REBOOT_LINE);
    });

    it('preserves each adopted command exactly', function () {
        const dusk = parsed.events.find((e) => e.command.includes('dusk-ceremony') && e.enabled);
        expect(dusk.expression).to.equal('30 18 31 10 *');
        expect(dusk.command).to.equal(
            'cd /home/remote/MonsterBox && node scripts/yard-theater/perform.mjs '
            + 'moments/dusk-ceremony.json >> /home/remote/yard-theater-logs/theater.log 2>&1'
        );
    });

    it('names entries from their own comments', function () {
        const names = parsed.events.map((e) => e.name);
        expect(names).to.include('The Dusk Ceremony');
        expect(names).to.include('Thomas');
        expect(names).to.include('Night Memory');
    });

    it('adopts the commented-out rehearsal line as DISABLED, not as garbage', function () {
        const rehearsal = parsed.events.find((e) => !e.enabled);
        expect(rehearsal, 'the commented-out October rehearsal line').to.exist;
        expect(rehearsal.expression).to.equal('30 18 * 10 5,6');
        expect(rehearsal.command).to.contain('dusk-ceremony.json');
    });

    it('does not adopt the explanatory header as an entry', function () {
        // Every adopted command must be a real MonsterBox invocation.
        parsed.events.forEach((event) => {
            expect(event.command).to.contain('/home/remote/MonsterBox');
        });
    });

    it('classifies yard-theater entries as moments', function () {
        const moments = parsed.events.filter((e) => e.kind === 'moment');
        expect(moments).to.have.length(3);
    });
});

describe('crontabFile — writes preserve unmanaged lines byte-for-byte', function () {
    it('loses NOTHING: every non-blank line of the original survives verbatim', function () {
        // The strongest form of the guarantee. Adoption may move a line into
        // the managed block, but it may never alter or drop one — including the
        // prose comments that explain what each entry is for.
        const original = installedCrontab();
        const model = parseCrontab(original, { repoRoot: '/home/remote/MonsterBox' });
        const written = renderCrontab(model).split('\n');

        const originalLines = original.split('\n').filter((line) => line.trim() !== '');
        originalLines.forEach((line) => {
            expect(written, `lost line: ${line}`).to.include(line);
        });

        // ...and in the same relative order. Scanned as a subsequence because
        // the file legitimately repeats bare "#" separator lines.
        let cursor = 0;
        originalLines.forEach((line) => {
            const found = written.indexOf(line, cursor);
            expect(found, `out of order or missing: ${line}`).to.be.greaterThan(-1);
            cursor = found + 1;
        });
    });

    it('keeps every unmanaged line outside the managed block', function () {
        const original = installedCrontab();
        const model = parseCrontab(original, { repoRoot: '/home/remote/MonsterBox' });
        const written = renderCrontab(model);

        const before = unmanagedLines(original);
        const after = unmanagedLines(written);
        const adopted = new Set(model.events.map((e) => `${e.expression} ${e.command}`));
        const prose = new Set(model.events.flatMap((e) => (e.description || '').split('\n')));

        const shouldStayOutside = before.filter((line) => {
            const bare = line.trimStart().replace(/^#+\s?/, '').trim();
            return !adopted.has(bare) && !adopted.has(line.trim()) && !prose.has(bare);
        });

        expect(shouldStayOutside.length).to.be.greaterThan(0);
        shouldStayOutside.forEach((line) => {
            expect(after, `unmanaged line was swallowed: ${line}`).to.include(line);
        });
    });

    it('THE CRITICAL ONE: the hand-written @reboot audio line survives verbatim', function () {
        let text = installedCrontab();

        // Ten rounds of realistic churn: toggle, add, rename, delete.
        for (let round = 0; round < 10; round += 1) {
            const model = parseCrontab(text, { repoRoot: '/home/remote/MonsterBox' });
            model.events.forEach((event, index) => {
                if (index % 2 === round % 2) event.enabled = !event.enabled;
            });
            model.events.push({
                id: `churn-${round}`,
                name: `Churn ${round}`,
                enabled: round % 2 === 0,
                kind: 'raw',
                expression: `${round} 3 * * *`,
                command: `cd /home/remote/MonsterBox && (echo ${round}) >> /tmp/x.log 2>&1`
            });
            if (model.events.length > 6) model.events.shift();
            text = renderCrontab(model);

            expect(text.split('\n'), `round ${round}`).to.include(REBOOT_LINE);
        }

        // Exactly once — never duplicated, never rewritten.
        const occurrences = text.split('\n').filter((line) => line === REBOOT_LINE);
        expect(occurrences).to.have.length(1);
    });

    it('never pulls the @reboot audio line into the managed block', function () {
        const model = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
        const written = renderCrontab(model);
        const lines = written.split('\n');
        const start = lines.indexOf(BLOCK_START);
        const end = lines.indexOf(BLOCK_END);
        expect(start).to.be.greaterThan(-1);
        expect(end).to.be.greaterThan(start);
        expect(lines.slice(start, end + 1).join('\n')).to.not.contain('start-audio.sh');
        expect(lines.indexOf(REBOOT_LINE)).to.be.lessThan(start);
    });

    it('preserves an unmanaged line that sits AFTER the managed block', function () {
        const model = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
        const trailing = '15 4 * * * /usr/bin/some-unrelated-job.sh';
        model.post.push(trailing);
        const written = renderCrontab(model);

        const reparsed = parseCrontab(written, { repoRoot: '/home/remote/MonsterBox' });
        expect(reparsed.hadBlock).to.equal(true);
        expect(reparsed.post).to.include(trailing);
        // ...and it is not swallowed into the managed set.
        expect(reparsed.events.some((e) => e.command.includes('some-unrelated-job'))).to.equal(false);
        expect(renderCrontab(reparsed).split('\n')).to.include(trailing);
    });
});

describe('crontabFile — round-trip stability', function () {
    it('is idempotent: parse -> render -> parse gives the same events', function () {
        const first = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
        const text = renderCrontab(first);
        const second = parseCrontab(text, { repoRoot: '/home/remote/MonsterBox' });

        expect(second.hadBlock).to.equal(true);
        expect(second.adopted).to.equal(false);
        expect(second.events.map((e) => [e.id, e.expression, e.command, e.enabled]))
            .to.deep.equal(first.events.map((e) => [e.id, e.expression, e.command, e.enabled]));

        // And rendering again changes nothing at all.
        expect(renderCrontab(second)).to.equal(text);
    });

    it('a disabled entry keeps its full line, commented out and recoverable', function () {
        const model = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
        const dusk = model.events.find((e) => e.name === 'The Dusk Ceremony');
        const originalCommand = dusk.command;
        dusk.enabled = false;

        const text = renderCrontab(model);
        expect(text).to.contain(`# ${dusk.expression} ${originalCommand}`);

        const reparsed = parseCrontab(text, { repoRoot: '/home/remote/MonsterBox' });
        const again = reparsed.events.find((e) => e.name === 'The Dusk Ceremony');
        expect(again.enabled).to.equal(false);
        expect(again.command).to.equal(originalCommand); // nothing lost

        // ...and re-enabling restores the exact original line.
        again.enabled = true;
        expect(renderCrontab(reparsed)).to.contain(`${again.expression} ${originalCommand}`);
    });

    it('always ends with a newline — crontab(1) drops the last entry otherwise', function () {
        const model = parseCrontab(installedCrontab(), { repoRoot: '/home/remote/MonsterBox' });
        expect(renderCrontab(model).endsWith('\n')).to.equal(true);
    });

    it('handles an empty crontab without inventing anything', function () {
        const model = parseCrontab('', { repoRoot: '/home/remote/MonsterBox' });
        expect(model.events).to.have.length(0);
        expect(renderCrontab(model)).to.equal('\n');
    });

    it('generates unique ids for duplicate names', function () {
        const taken = new Set(['the-dusk-ceremony']);
        expect(makeUniqueId('The Dusk Ceremony', taken)).to.equal('the-dusk-ceremony-2');
    });
});
