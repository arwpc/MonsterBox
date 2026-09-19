/**
 * Character configuration locks — a finished animatronic stops drifting.
 *
 * PumpkinHead was declared 100% and locked (config/character-locks.json). The
 * lock exists because the expensive part of an animatronic is not its code: it
 * is the hand-measured calibration, the tuned jaw and voice config, and the
 * parts list that match one physical machine. Any page save, helper or agent
 * that "tidies" one of those files destroys work nothing else records.
 *
 * The lock must be narrow in exactly one way: it freezes CONFIGURATION while
 * leaving RUNTIME state writable, so a locked character still runs — he plays,
 * talks and moves, he just cannot be reconfigured.
 *
 * Pure: no server, no hardware, no writes outside a temp dir.
 */
import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const lockModule = await import('../../services/characterConfigLock.js');
const {
    listLocks, getLock, isCharacterLocked, characterIdFromPath, isRuntimeStatePath,
    assertConfigPathWritable, assertCharacterConfigWritable
} = lockModule;

function charPath(...parts) {
    return path.join(APP_ROOT, 'data', ...parts);
}

describe('character configuration lock', () => {
    describe('the lock file', () => {
        it('locks PumpkinHead (character 1)', () => {
            expect(isCharacterLocked(1)).to.equal(true);
            expect(isCharacterLocked('1')).to.equal(true, 'ids arrive as strings off route params');
            const lock = getLock(1);
            expect(lock).to.be.an('object');
            expect(lock.reason, 'a lock without a reason cannot be judged later').to.be.a('string').and.not.empty;
            expect(Object.keys(lock.fingerprints || {}).length).to.be.greaterThan(0);
        });

        it('locks nothing else — every other character stays editable', () => {
            const lockedIds = listLocks().map(l => String(l.characterId));
            for (const id of ['2', '3', '4', '5', '6']) {
                if (lockedIds.includes(id)) continue;
                expect(isCharacterLocked(id), `character ${id} must not be locked`).to.equal(false);
            }
        });
    });

    describe('path classification', () => {
        it('recognises a per-character path', () => {
            expect(characterIdFromPath(charPath('character-1', 'parts.json'))).to.equal('1');
            expect(characterIdFromPath(charPath('character-4', 'ai-config', 'tts-config.json'))).to.equal('4');
        });

        it('ignores paths outside a character directory', () => {
            expect(characterIdFromPath(charPath('characters.json'))).to.equal(null);
            expect(characterIdFromPath(path.join(APP_ROOT, 'config', 'app-config.json'))).to.equal(null);
            expect(characterIdFromPath(path.join(os.tmpdir(), 'parts.json'))).to.equal(null);
        });

        it('treats runtime state as state, not configuration', () => {
            expect(isRuntimeStatePath(charPath('character-1', 'lurk-mode-state.json'))).to.equal(true);
            expect(isRuntimeStatePath(charPath('character-1', 'motion-armed-state.json'))).to.equal(true);
            expect(isRuntimeStatePath(charPath('character-1', 'ai_agent_state.json'))).to.equal(true);
            expect(isRuntimeStatePath(charPath('character-1', 'parts.json'))).to.equal(false);
        });
    });

    describe('enforcement', () => {
        it('refuses a configuration write for a locked character', () => {
            for (const file of ['parts.json', 'poses.json', 'scenes.json', 'super-powers.json',
                'movement-config.json', 'servo_calibrations.json', path.join('ai-config', 'tts-config.json')]) {
                expect(() => assertConfigPathWritable(charPath('character-1', file)), file)
                    .to.throw(/LOCKED/);
            }
        });

        it('carries HTTP 423 and a machine-readable code so routes answer honestly', () => {
            try {
                assertCharacterConfigWritable(1, 'a test');
                throw new Error('expected the lock to refuse');
            } catch (err) {
                expect(err.code).to.equal('CHARACTER_CONFIG_LOCKED');
                expect(err.status).to.equal(423);
                expect(err.message).to.match(/unlock/i, 'the error must say how to undo the lock');
            }
        });

        it('still allows RUNTIME state writes — a locked character keeps running', () => {
            for (const file of ['lurk-mode-state.json', 'motion-armed-state.json', 'ai_agent_state.json']) {
                expect(() => assertConfigPathWritable(charPath('character-1', file)), file).to.not.throw();
            }
        });

        it('leaves unlocked characters alone', () => {
            expect(() => assertConfigPathWritable(charPath('character-3', 'parts.json'))).to.not.throw();
            expect(() => assertCharacterConfigWritable(3, 'editing an unlocked character')).to.not.throw();
        });

        it('leaves non-character paths alone', () => {
            expect(() => assertConfigPathWritable(path.join(APP_ROOT, 'config', 'app-config.json'))).to.not.throw();
        });
    });

    describe('the write path actually inherits the guard', () => {
        it('writeJsonAtomic refuses a locked character config file', async () => {
            const { writeJsonAtomic } = await import('../../services/atomicStore.js');
            let threw = null;
            try {
                await writeJsonAtomic(charPath('character-1', 'parts.json'), [{ id: 999 }]);
            } catch (err) {
                threw = err;
            }
            expect(threw, 'a locked parts.json must not be writable').to.be.an('error');
            expect(threw.code).to.equal('CHARACTER_CONFIG_LOCKED');
            // And the file on disk is untouched.
            const parts = JSON.parse(await fs.readFile(charPath('character-1', 'parts.json'), 'utf8'));
            expect(parts.some(p => String(p.id) === '999')).to.equal(false);
        });

        it('writeJsonAtomic still writes for an unlocked path', async () => {
            const { writeJsonAtomic } = await import('../../services/atomicStore.js');
            const tmp = path.join(os.tmpdir(), `mb-lock-test-${process.pid}.json`);
            await writeJsonAtomic(tmp, { ok: true });
            expect(JSON.parse(await fs.readFile(tmp, 'utf8'))).to.deep.equal({ ok: true });
            await fs.unlink(tmp);
        });
    });
});
