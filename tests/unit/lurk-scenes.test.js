/**
 * Lurk scenes — rotation, gating and config validation.
 *
 * Everything is in-memory with injected deps: no scene runs, no file is written
 * and no real timer is left running.
 */

import { expect } from 'chai';
import {
    LurkSceneService,
    STATE_FILE,
    decideLurkScene,
    nextSceneId,
    normalizeLurkSceneState,
    validateLurkScenePatch
} from '../../services/lurkSceneService.js';
import { isRuntimeStatePath } from '../../services/characterConfigLock.js';

const at = (hh, mm) => new Date(2026, 9, 31, hh, mm, 0).getTime();

function makeService({ now = at(19, 0), probe = {}, stored = null } = {}) {
    const played = [];
    const svc = new LurkSceneService({
        now: () => now,
        random: () => 0,
        setTimeout: () => ({ unref() {} }),
        clearTimeout: () => {},
        readState: async () => stored,
        writeState: async (id, st) => { stored = st; },
        probe: async () => ({ lurking: true, guestsPresent: false, ...probe }),
        playScene: async (id, sceneId) => { played.push(sceneId); return { success: sceneId !== 'gone' }; }
    });
    return { svc, played };
}

describe('Lurk scenes', () => {
    it('keeps its state file writable on a locked character', () => {
        expect(isRuntimeStatePath(`data/character-1/${STATE_FILE}`)).to.equal(true);
    });

    it('normalizes ids to strings and clamps the interval', () => {
        const st = normalizeLurkSceneState({ enabled: true, sceneIds: [1, ' 2 ', ''], intervalMs: 5 });
        expect(st.sceneIds).to.deep.equal(['1', '2']);
        expect(st.intervalMs).to.equal(60000);
        expect(normalizeLurkSceneState(null).enabled).to.equal(false);
    });

    it('rejects a malformed patch', () => {
        expect(validateLurkScenePatch({ sceneIds: 'nope' })).to.have.length(1);
        expect(validateLurkScenePatch({ intervalMs: 10 })).to.have.length(1);
        expect(validateLurkScenePatch({ quietHours: { start: '25:00', end: '08:00' } })).to.have.length(1);
        expect(validateLurkScenePatch({ enabled: true, sceneIds: [1, 2], quietHours: null })).to.deep.equal([]);
    });

    it('rotates round-robin and wraps', () => {
        expect(nextSceneId(['a', 'b', 'c'], null)).to.equal('a');
        expect(nextSceneId(['a', 'b', 'c'], 'a')).to.equal('b');
        expect(nextSceneId(['a', 'b', 'c'], 'c')).to.equal('a');
        expect(nextSceneId(['a', 'b'], 'removed')).to.equal('a');
        expect(nextSceneId([], 'a')).to.equal(null);
    });

    it('stands aside for guests, conversations, callouts, scenes, audio and quiet hours', () => {
        const base = { enabled: true, hasScenes: true, lurking: true };
        expect(decideLurkScene(base).go).to.equal(true);
        expect(decideLurkScene({ ...base, lurking: false }).reason).to.equal('not-lurking');
        expect(decideLurkScene({ ...base, guestsPresent: true }).reason).to.equal('guests-present');
        expect(decideLurkScene({ ...base, conversationActive: true }).reason).to.equal('conversation');
        expect(decideLurkScene({ ...base, calloutInFlight: true }).reason).to.equal('callout');
        expect(decideLurkScene({ ...base, queueRunning: true }).reason).to.equal('scene-queue');
        expect(decideLurkScene({ ...base, otherAudioActive: true }).reason).to.equal('other-audio');
        expect(decideLurkScene({ ...base, inQuietHours: true }).reason).to.equal('quiet-hours');
        expect(decideLurkScene({ ...base, inQuietHours: true, force: true }).go).to.equal(true);
        expect(decideLurkScene({ ...base, muted: true }).reason).to.equal('muted');
        expect(decideLurkScene({ ...base, enabled: false }).reason).to.equal('disabled');
        expect(decideLurkScene({ ...base, hasScenes: false }).reason).to.equal('no-scenes');
    });

    it('plays the rotation in order, one scene per turn', async () => {
        const { svc, played } = makeService();
        await svc.writeState(3, { enabled: true, sceneIds: ['10', '11'] });
        await svc.playNext(3);
        await svc.playNext(3);
        await svc.playNext(3);
        expect(played).to.deep.equal(['10', '11', '10']);
    });

    it('moves past a scene that no longer exists', async () => {
        const { svc, played } = makeService();
        await svc.writeState(3, { enabled: true, sceneIds: ['gone', '11'] });
        const first = await svc.playNext(3);
        expect(first.reason).to.equal('scene-missing');
        await svc.playNext(3);
        expect(played).to.deep.equal(['gone', '11']);
    });

    it('does not play during quiet hours', async () => {
        const { svc, played } = makeService({ now: at(23, 30) });
        await svc.writeState(3, { enabled: true, sceneIds: ['10'] });
        const r = await svc.playNext(3);
        expect(r.reason).to.equal('quiet-hours');
        expect(played).to.deep.equal([]);
    });

    it('an operator test plays even when not lurking, but still respects quiet hours', async () => {
        const { svc, played } = makeService({ now: at(23, 30), probe: { lurking: false } });
        await svc.writeState(3, { enabled: false, sceneIds: ['10'] });
        expect((await svc.playNext(3, { test: true })).reason).to.equal('quiet-hours');
        expect((await svc.playNext(3, { test: true, force: true })).played).to.equal(true);
        expect(played).to.deep.equal(['10']);
    });
});
