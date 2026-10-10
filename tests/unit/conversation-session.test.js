/**
 * Mission D1 (2026-10 castle tuning): conversation-session behaviour of
 * services/elevenLabsWebSocketService.js against a FAKE agent socket.
 *
 * Nothing here touches the network, a microphone, a speaker or a servo: the
 * agent socket, the capture process, the playback service and the jaw are all
 * replaced. Character 991 does not exist on any node, so even an unstubbed
 * side path has nothing to drive.
 */

import { expect } from 'chai';
import { EventEmitter } from 'events';
import svc from '../../services/elevenLabsWebSocketService.js';
import playback from '../../services/serverPlaybackService.js';
import sttListener from '../../services/serverSTTListener.js';
import ledInteraction from '../../services/ledInteractionService.js';
import { speechSince, clearSpeech } from '../../services/speechLogService.js';

const CHAR = 991;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(pred, ms = 3000, step = 10) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(step); }
    return false;
}

class FakeAgentSocket extends EventEmitter {
    constructor() {
        super();
        this.readyState = 0;
        this.sent = [];
        setImmediate(() => { this.readyState = 1; this.emit('open'); });
    }
    send(str) { this.sent.push(JSON.parse(str)); }
    close(code = 1000, reason = '') {
        if (this.readyState >= 2) return;
        this.readyState = 3;
        setImmediate(() => this.emit('close', code, Buffer.from(reason)));
    }
    terminate() { this.close(1006, ''); }
    // server -> client
    push(obj) { this.emit('message', Buffer.from(JSON.stringify(obj))); }
    serverClose(code, reason) { this.readyState = 3; this.emit('close', code, Buffer.from(reason || '')); }
    initMeta() {
        this.push({ type: 'conversation_initiation_metadata',
            conversation_initiation_metadata_event: { conversation_id: 'conv_test', agent_output_audio_format: 'pcm_16000' } });
    }
}

const pcm = (ms, amp = 3000) => {
    const n = Math.round(16 * ms);
    const b = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) b.writeInt16LE(i % 2 ? amp : -amp, i * 2);
    return b;
};
const audioMsg = (eid, ms = 100) => ({ type: 'audio', audio_event: { audio_base_64: pcm(ms).toString('base64'), event_id: eid } });
const agentResponse = (eid, text, ids) => ({ type: 'agent_response', agent_response_event: { agent_response: text, event_id: eid, in_response_to_ids: ids } });

describe('Conversation D1: sessions against a fake agent', function () {
    this.timeout(15000);

    let sockets, calls, captures, saved;

    beforeEach(() => {
        sockets = [];
        calls = { write: [], stop: [], interrupt: [], stopPcm: [], stopAll: 0 };
        captures = [];
        saved = {
            open: svc._openAgentSocket, jaw: svc._jaw, fo: svc._followOrdersHook, fom: svc._followOrdersMicSignal,
            write: playback.writePcmStream, stop: playback.stopStream, interrupt: playback.interruptPlayback,
            stopPcm: playback.stopPcmStream, stopAll: playback.stopAll, resolve: playback.resolveSpeakerDevice,
            horizon: playback.getPlaybackHorizon, capture: sttListener.startContinuousCapture
        };
        svc._openAgentSocket = async () => { const s = new FakeAgentSocket(); sockets.push(s); return s; };
        svc._jaw = {
            driveJawFromPcmStream: async () => ({}), stopPcmJawStream() {}, cancelJawDrive() {},
            driveJawFromAmplitude: async () => ({})
        };
        svc._followOrdersHook = () => {};
        svc._followOrdersMicSignal = () => {};
        saved.led = ledInteraction.setInteractionState;
        ledInteraction.setInteractionState = async () => ({});
        let horizon = 0;
        playback.writePcmStream = (buf, opts) => {
            const now = Date.now();
            const startsAtMs = Math.max(now, horizon);
            horizon = startsAtMs + (buf.length / 32);
            calls.write.push({ bytes: buf.length, ...opts });
            return Promise.resolve({ success: true, startsAtMs, playsUntilMs: horizon, coldStart: calls.write.length === 1 });
        };
        playback.stopStream = async (opts) => { calls.stop.push(opts); return { success: true }; };
        playback.interruptPlayback = async (opts) => { calls.interrupt.push(opts); return { success: true }; };
        playback.stopPcmStream = async (opts) => { calls.stopPcm.push(opts); return { success: true }; };
        playback.stopAll = async () => { calls.stopAll += 1; return { success: true }; };
        playback.resolveSpeakerDevice = async () => 'fake-sink';
        playback.getPlaybackHorizon = () => horizon;
        sttListener.startContinuousCapture = (deviceId, onPcm) => { const h = { onPcm, stopped: false, stop() { this.stopped = true; } }; captures.push(h); return h; };
    });

    afterEach(async () => {
        for (const [key, sid] of [...svc.headlessSessions.entries()]) {
            if (key === String(CHAR)) { svc.headlessSessions.delete(key); await svc._teardownHeadlessSession(sid); }
        }
        for (const [sid, c] of [...svc.activeConnections.entries()]) {
            if (c.characterId === CHAR) { svc._cancelReconnect(c); c._wanted = false; svc.activeConnections.delete(sid); }
        }
        svc.removeAllListeners('activity');
        svc._turnHistory.delete(String(CHAR));
        svc._playbackEnvelope.delete(String(CHAR));
        svc._agentActivityAt.delete(String(CHAR));
        svc._firstMessageRefusedAt.clear();
        svc._openAgentSocket = saved.open; svc._jaw = saved.jaw;
        svc._followOrdersHook = saved.fo; svc._followOrdersMicSignal = saved.fom;
        Object.assign(playback, {
            writePcmStream: saved.write, stopStream: saved.stop, interruptPlayback: saved.interrupt,
            stopPcmStream: saved.stopPcm, stopAll: saved.stopAll, resolveSpeakerDevice: saved.resolve,
            getPlaybackHorizon: saved.horizon
        });
        sttListener.startContinuousCapture = saved.capture;
        ledInteraction.setInteractionState = saved.led;
    });

    // A headless session for CHAR, initiated, mic loop running.
    async function headless({ duplexMode = 'half' } = {}) {
        const sid = svc.generateSessionId();
        const c = svc._createConnectionRecord(sid, null);
        c.characterId = CHAR;
        c.headless = true;
        c._wanted = true;
        c.useRealtimeSTT = false;
        c.duplexMode = duplexMode;
        c.duplexReason = 'test';
        svc.activeConnections.set(sid, c);
        svc.headlessSessions.set(String(CHAR), sid);
        expect(await svc.startConversation(sid, 'agent_test')).to.equal(true);
        await until(() => c.isActive);
        sockets[sockets.length - 1].initMeta();
        await until(() => captures.length > 0);
        return { sid, c, sock: sockets[sockets.length - 1] };
    }

    function browserSession() {
        const sid = svc.generateSessionId();
        const c = svc._createConnectionRecord(sid, null);
        c.characterId = CHAR;
        c.isActive = true;
        svc.activeConnections.set(sid, c);
        return { sid, c };
    }

    it('reconnects after the agent\'s max-duration close, without a greeting, and keeps AI mode on', async () => {
        const { sid, sock } = await headless();
        sock.serverClose(1000, 'Max call duration exceeded');
        // The closed socket's player drains (own player only), it is not killed.
        expect(calls.stop.some(o => o.owner === sid && o.drain === true)).to.equal(true);
        expect(calls.stop.some(o => !o.owner)).to.equal(false);
        // Still "on" while the socket is being reopened.
        expect(svc.isAgentEnabledForCharacter(CHAR)).to.equal(true);
        expect(await until(() => sockets.length === 2, 3000)).to.equal(true);
        await until(() => sockets[1].sent.length > 0);
        const init = sockets[1].sent[0];
        expect(init.type).to.equal('conversation_initiation_client_data');
        expect(init.conversation_config_override).to.deep.equal({ agent: { first_message: '' } });
        // Same session, same capture process: the mic was not respawned.
        expect(svc.headlessSessions.get(String(CHAR))).to.equal(sid);
        expect(captures.length).to.equal(1);
    });

    it('degrades when the agent refuses the override: reconnects without it and drops the replayed greeting', async () => {
        const { c, sock } = await headless();
        sock.serverClose(1000, 'Max call duration exceeded');
        await until(() => sockets.length === 2, 3000);
        sockets[1].initMeta();
        sockets[1].serverClose(1008, "Override for field 'first_message' is not allowed by config.");
        expect(await until(() => sockets.length === 3, 2000)).to.equal(true);
        await until(() => sockets[2].sent.length > 0);
        expect(sockets[2].sent[0].conversation_config_override).to.deep.equal({});
        sockets[2].initMeta();
        await until(() => c.isActive && c.conversationReady);
        const before = calls.write.length;
        // Greeting: audio first, then its unprompted agent_response.
        sockets[2].push(audioMsg(1));
        sockets[2].push(agentResponse(1, 'Good evening, wanderer...', []));
        // ...and a late chunk of the same greeting after it was classified.
        sockets[2].push(audioMsg(1));
        await sleep(30);
        expect(calls.write.length).to.equal(before);
        // A real answer afterwards plays.
        sockets[2].push(agentResponse(3, 'You asked well.', [2]));
        sockets[2].push(audioMsg(3));
        await until(() => calls.write.length > before);
        expect(calls.write.length).to.be.greaterThan(before);
    });

    it('honours the agent\'s interruption for THIS session only and drops late chunks of the cut response', async () => {
        const { sid, sock } = await headless({ duplexMode: 'full' });
        const other = browserSession();
        sock.push(audioMsg(5));
        await until(() => calls.write.length === 1);
        expect(calls.write[0].owner).to.equal(sid);
        expect(calls.write[0].deviceId).to.equal('fake-sink');

        sock.push({ type: 'interruption', interruption_event: { event_id: 6 } });
        expect(calls.interrupt).to.deep.equal([{ characterId: CHAR, owner: sid }]);
        expect(calls.stopAll).to.equal(0);
        expect(calls.stop.filter(o => !o.owner)).to.have.length(0);
        expect(calls.stop.some(o => o.owner === other.sid)).to.equal(false);

        // Late chunk of the interrupted response: dropped.
        sock.push(audioMsg(5));
        await sleep(20);
        expect(calls.write.length).to.equal(1);
        // The next response plays.
        sock.push(audioMsg(6));
        await until(() => calls.write.length === 2);
        expect(calls.write.length).to.equal(2);

        await sleep(700);
        const lat = svc.getTurnLatency(CHAR);
        expect(lat.turns.some(t => t.interrupted)).to.equal(true);
    });

    it('AI off drains this session\'s player and never reconnects; immediate (panic) cuts it', async () => {
        const { sid } = await headless();
        await svc.setAgentEnabledForCharacter(CHAR, false);
        expect(calls.stop.some(o => o.owner === sid && o.drain === true)).to.equal(true);
        expect(calls.stop.some(o => o.drain === false || o.drain === undefined)).to.equal(false);
        await sleep(1300);
        expect(sockets).to.have.length(1); // no reconnect after a deliberate stop

        calls.stop.length = 0;
        const second = await headless();
        await svc.setAgentEnabledForCharacter(CHAR, false, { immediate: true });
        expect(calls.stop.some(o => o.owner === second.sid && !o.drain)).to.equal(true);
    });

    it('a browser session disconnecting never touches the headless player', async () => {
        const { sid } = await headless();
        const other = browserSession();
        svc.handleClientDisconnect(other.sid);
        expect(calls.stop.every(o => o.owner === other.sid)).to.equal(true);
        expect(calls.stop.some(o => o.owner === sid)).to.equal(false);
        expect(calls.stopAll).to.equal(0);
    });

    it('reports guest speech and agent speech as activity, but not ASR noise', async () => {
        const { sock } = await headless();
        const events = [];
        const off = svc.onActivity(e => events.push(e));
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: '...' } });
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: 'Who goes there?' } });
        sock.push(audioMsg(9));
        sock.push(audioMsg(9));
        await sleep(20);
        expect(events.map(e => e.kind)).to.deep.equal(['guest_speech', 'agent_speech']);
        expect(events[0]).to.include({ characterId: CHAR, headless: true, text: 'Who goes there?' });
        // A reply to a real guest is prompted activity.
        expect(events[1].prompted).to.equal(true);
        off();
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: 'Again?' } });
        expect(events).to.have.length(2);
    });

    it('agent speech after ASR noise (the agent re-engaging an empty room) is NOT prompted', async () => {
        const { sock } = await headless();
        const events = [];
        svc.onActivity(e => events.push(e));
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: '...' } });
        sock.push(audioMsg(12));
        await sleep(20);
        expect(events.map(e => [e.kind, e.prompted])).to.deep.equal([['agent_speech', false]]);
    });

    it('a throwing activity handler cannot break the conversation', async () => {
        const { sock } = await headless();
        svc.onActivity(() => { throw new Error('boom'); });
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: 'Hello' } });
        sock.push(audioMsg(2));
        await until(() => calls.write.length === 1);
        expect(calls.write.length).to.equal(1);
    });

    it('records one latency turn per reply, with a getter', async () => {
        const { sock } = await headless();
        sock.push({ type: 'user_transcript', user_transcription_event: { user_transcript: 'Tell me a secret.' } });
        await sleep(40);
        sock.push(agentResponse(4, 'Secrets cost blood.', [3]));
        sock.push(audioMsg(4, 100));
        sock.push(audioMsg(4, 100));
        await until(() => svc.getTurnLatency(CHAR).count === 1, 3000);
        const lat = svc.getTurnLatency(CHAR);
        expect(lat.count).to.equal(1);
        const t = lat.turns[0];
        expect(t.source).to.equal('speech');
        expect(t.transcriptToFirstAudioMs).to.be.at.least(30);
        expect(t.firstAudioToPlaybackMs).to.be.a('number');
        expect(t.interrupted).to.equal(false);
        expect(lat.summary.transcriptToFirstAudioMs.n).to.equal(1);
    });

    it('a late write callback of the previous reply does not drop the turn that just started', async () => {
        // Found live on an XVF3800 node 2026-10-09: the greeting's last write resolved
        // after an ask-ai turn began and armed ITS finalize timer, which then
        // discarded it; the answer was logged as an unprompted 'agent' turn.
        const { c, sock } = await headless();
        const fast = playback.writePcmStream;
        playback.writePcmStream = (buf, opts) => new Promise(r => setTimeout(() => r(fast(buf, opts)), 60));
        sock.push(audioMsg(1, 50));                       // greeting
        svc._startTurn(c, { source: 'ask-ai', transcriptAtMs: Date.now(), text: 'q' });
        await sleep(900);                                   // greeting write resolves, timers run
        sock.push(audioMsg(3, 50));                         // the answer, a new utterance
        await until(() => svc.getTurnLatency(CHAR).turns.some(t => t.source === 'ask-ai'), 3000);
        expect(svc.getTurnLatency(CHAR).turns.map(t => t.source)).to.include('ask-ai');
    });

    it('chunks reach the player in arrival order on the session\'s own player', async () => {
        const { sid, sock } = await headless();
        for (let i = 0; i < 6; i++) sock.push({ type: 'audio', audio_event: { audio_base_64: pcm(20 + i * 10).toString('base64'), event_id: 11 } });
        await until(() => calls.write.length === 6);
        expect(calls.write.map(w => w.bytes)).to.deep.equal([0, 1, 2, 3, 4, 5].map(i => Math.round(16 * (20 + i * 10)) * 2));
        expect(calls.write.every(w => w.owner === sid && w.deviceId === 'fake-sink')).to.equal(true);
    });

    describe('microphone gating', () => {
        const quiet = () => pcm(250, 150);   // rms ~0.005
        const loud = () => pcm(250, 9000);   // rms ~0.27
        const lastChunk = (sock) => {
            const m = [...sock.sent].reverse().find(x => x.user_audio_chunk !== undefined);
            return Buffer.from(m.user_audio_chunk, 'base64');
        };
        async function feed(c, sock, frame) {
            const n = sock.sent.length;
            captures[0].onPcm(frame);
            await until(() => sock.sent.length > n, 500);
        }

        it('FULL duplex: the guest reaches the agent while the character is speaking', async () => {
            const { c, sock } = await headless({ duplexMode: 'full' });
            for (let i = 0; i < 3; i++) await feed(c, sock, quiet());
            c.suppressMicUntilMs = Date.now() + 10000; // character "speaking"
            await feed(c, sock, loud());
            expect(lastChunk(sock).some(b => b !== 0)).to.equal(true);
        });

        it('FULL duplex: the character\'s own echo is held back, a louder guest gets through', async () => {
            // Measured live on an XVF3800 node: the array leaves ~0.4 x the
            // playback level; without this the agent transcribed and
            // interrupted the character's own lines.
            const { c, sock } = await headless({ duplexMode: 'full' });
            for (let i = 0; i < 3; i++) await feed(c, sock, quiet());
            sock.push(audioMsg(31, 4000));               // character speaking, rms ~0.09
            await until(() => calls.write.length === 1);
            const echo = () => pcm(250, 1200);          // ~0.4 x playback
            for (let i = 0; i < 5; i++) await feed(c, sock, echo());
            expect(lastChunk(sock).every(b => b === 0)).to.equal(true);
            await feed(c, sock, pcm(250, 1700));        // louder echo swing, still echo
            expect(lastChunk(sock).every(b => b === 0)).to.equal(true);
            await feed(c, sock, loud());                 // guest talking over it
            expect(lastChunk(sock).some(b => b !== 0)).to.equal(true);
        });

        it('HALF duplex: silence goes to the agent while the character is speaking', async () => {
            const { c, sock } = await headless({ duplexMode: 'half' });
            for (let i = 0; i < 3; i++) await feed(c, sock, quiet());
            c.suppressMicUntilMs = Date.now() + 10000;
            await feed(c, sock, loud());
            expect(lastChunk(sock).every(b => b === 0)).to.equal(true);
        });

        it('HALF duplex: the mic reopens at most 400 ms after the modelled end of playback', async () => {
            const { c, sock } = await headless({ duplexMode: 'half' });
            sock.push(audioMsg(21, 200));
            await until(() => calls.write.length === 1);
            const tail = c.suppressMicUntilMs - c.playbackEndsAtMs;
            expect(tail).to.be.at.most(400);
        });
    });

    describe('askAgentQuestion contract (scene askAI step)', () => {
        it('live session: resolves only after the reply has PLAYED, with viaSession', async () => {
            const { sid, sock } = await headless();
            const t0 = Date.now();
            let resolvedAt = 0;
            const p = svc.askAgentQuestion('agent_test', 'Speak.', CHAR).then(r => { resolvedAt = Date.now(); return r; });
            await until(() => sock.sent.some(m => m.type === 'user_message'));
            sock.push(agentResponse(7, 'Begone.', [6]));
            sock.push(audioMsg(7, 700));
            sock.push(audioMsg(7, 700));            // ~1.4 s of reply, delivered instantly
            sock.push({ type: 'agent_response_complete', agent_response_complete_event: { event_id: 7 } });
            const r = await p;
            expect(r.viaSession).to.equal(sid);
            expect(r.response).to.equal('Begone.');
            expect(r.playedOut).to.equal(true);
            // agent_response_complete settles at ~300 ms; the line plays ~1.4 s.
            expect(resolvedAt - t0).to.be.at.least(1300);
        });

        it('live session: a reply that has started is answered by the settle path, not the no-reply ceiling', async () => {
            const { sock } = await headless();
            const p = svc.askAgentQuestion('agent_test', 'Speak.', CHAR);
            await until(() => sock.sent.some(m => m.type === 'user_message'));
            sock.push(audioMsg(8, 100));
            const c = [...svc.activeConnections.values()].find(x => x.characterId === CHAR && x._pendingAsk);
            expect(c && c._pendingAsk && c._pendingAsk.sawAudio).to.equal(true);
            const r = await p;
            expect(r.timedOut).to.equal(undefined);
        });

        it('one-shot: no viaSession and nothing written to the speech log (the caller logs)', async () => {
            clearSpeech(CHAR);
            const p = svc._askAgentQuestionEphemeral('agent_test', 'Speak.', CHAR);
            await until(() => sockets.length === 1 && sockets[0].sent.length > 0);
            const s = sockets[0];
            s.initMeta();
            await until(() => s.sent.some(m => m.type === 'user_message'));
            s.push(agentResponse(2, 'Leave now.', [1]));
            s.push(audioMsg(2, 200));
            const r = await p;
            expect(r.response).to.equal('Leave now.');
            expect(r.viaSession).to.equal(undefined);
            expect(speechSince(CHAR).entries).to.have.length(0);
        });
    });

    describe('one-shot asks', () => {
        it('ask for no greeting, end when the reply has PLAYED (not at 30 s), drain own player', async () => {
            const t0 = Date.now();
            const p = svc._askAgentQuestionEphemeral('agent_test', 'Speak.', CHAR);
            await until(() => sockets.length === 1 && sockets[0].sent.length > 0);
            const s = sockets[0];
            expect(s.sent[0].conversation_config_override).to.deep.equal({ agent: { first_message: '' } });
            s.initMeta();
            await until(() => s.sent.some(m => m.type === 'user_message'));
            s.push(agentResponse(2, 'Leave.', [1]));
            s.push(audioMsg(2, 300));
            s.push(audioMsg(2, 300));
            const r = await p;
            const elapsed = Date.now() - t0;
            expect(r.success).to.equal(true);
            expect(r.response).to.equal('Leave.');
            expect(elapsed).to.be.below(5000);
            expect(elapsed).to.be.at.least(600); // waited for ~600 ms of audio to play out
            expect(calls.write.every(w => w.owner && w.deviceId === 'fake-sink')).to.equal(true);
            expect(calls.stopPcm.some(o => o.drain === true && o.owner)).to.equal(true);
            expect(s.readyState).to.equal(3);
        });

        it('falls back when the override is refused, filtering the greeting by turn', async () => {
            const p = svc._askAgentQuestionEphemeral('agent_test', 'Speak.', CHAR);
            await until(() => sockets.length === 1 && sockets[0].sent.length > 0);
            sockets[0].initMeta();
            sockets[0].serverClose(1008, "Override for field 'first_message' is not allowed by config.");
            await until(() => sockets.length === 2 && sockets[1].sent.length > 0);
            const s = sockets[1];
            expect(s.sent[0].conversation_config_override).to.deep.equal({});
            s.initMeta();
            await until(() => s.sent.some(m => m.type === 'user_message'));
            s.push(audioMsg(1, 200));
            s.push(agentResponse(1, 'Welcome to my castle.', []));
            s.push(agentResponse(3, 'Go away.', [2]));
            s.push(audioMsg(3, 200));
            const r = await p;
            expect(r.response).to.equal('Go away.');
            const bytes = calls.write.reduce((a, w) => a + w.bytes, 0);
            expect(bytes).to.equal(Math.round(16 * 200) * 2); // only the answer
            expect(svc._firstMessageRefusedRecently('agent_test')).to.equal(true);
        });
    });

    describe('body-state bridge', () => {
        it('never sends context to a one-shot socket', async () => {
            const { sock } = await headless();
            const fake = new FakeAgentSocket(); fake.readyState = 1;
            svc.activeConnections.set('oneshot_x', { characterId: CHAR, ephemeralAsk: true, elevenLabsWs: fake });
            const n = svc.sendContextualUpdate(CHAR, 'Your arm is up.', 'body_state_change');
            svc.activeConnections.delete('oneshot_x');
            expect(n).to.equal(1);
            expect(fake.sent).to.have.length(0);
            expect(sock.sent.some(m => m.type === 'contextual_update')).to.equal(true);
        });

        it('at most one update per 5 s, merged, and only when the text changed', async () => {
            const { sock } = await headless();
            const texts = { 1: 'Your arm is up.', 2: 'Your head is left.' };
            svc._bodyStateModule = {
                describePose: () => null,
                describeChange: (cid, pid) => ({ text: texts[pid], contextId: 'x' })
            };
            if (!svc._bodyStatePending) svc._bodyStatePending = new Map();
            const key = String(CHAR);
            svc._bodyStateSent.delete(key);
            const countUpdates = () => sock.sent.filter(m => m.type === 'contextual_update' && m.context_id === 'body_state_change').length;

            svc._noteBodyStateChange(CHAR, 'part', 1);
            svc._noteBodyStateChange(CHAR, 'part', 2);
            svc._noteBodyStateChange(CHAR, 'part', 1);
            await until(() => countUpdates() === 1, 2000);
            expect(countUpdates()).to.equal(1);
            const sent = sock.sent.filter(m => m.context_id === 'body_state_change')[0];
            expect(sent.text).to.equal('Your arm is up. Your head is left.');

            // A change right after: scheduled no sooner than 5 s after the last send.
            svc._noteBodyStateChange(CHAR, 'part', 2);
            const pending = svc._bodyStatePending.get(key);
            expect(pending && pending.timer).to.be.ok;
            clearTimeout(pending.timer);
            // ...and identical text is never resent.
            svc._bodyStateSent.set(key, { at: 0, text: 'Your head is left.' });
            svc._flushBodyState(CHAR);
            expect(countUpdates()).to.equal(1);
            svc._bodyStateSent.delete(key);
        });
    });
});
