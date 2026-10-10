/**
 * Scene infrastructure for the castle-tuning rebuild:
 *   - askAI speaks once (the agent's own audio; no second TTS playback)
 *   - audio steps get a timeout sized to the clip instead of the 30 s default
 *   - the sayThis TTS disk cache
 *   - Goblin casts by name, queue start-config accepting `sceneId`
 *   - cross-node fleet steps (offline/guest skips, hold/release fallbacks)
 *   - bulk replace endpoints (lock refusal → 423, validation → 400, backup + write)
 *
 * Synthetic character ids only; the one directory this suite writes is removed.
 */
import { expect } from 'chai';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { fileURLToPath } from 'url';

import { deriveAudioTimeoutMs, AUDIO_TIMEOUT_CAP_MS, resolveGoblinRef, executeStep } from '../../services/scenes/sceneExecutor.js';
import { ttsCacheKey, generateSpeechCached, getCachedSpeech } from '../../services/scenes/ttsCache.js';
import { createFleetSteps, resolveFleetNodes, isSelfNode } from '../../services/scenes/fleetSteps.js';
import { validateQueueDefinition } from '../../services/scenes/queueLibrary.js';
import { validateCharacterData } from '../../services/scenes/sceneValidator.js';
import { listLocks } from '../../services/characterConfigLock.js';
import scenesApi from '../../routes/scenes/api.js';
import posesRoutes from '../../routes/poses/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

function fnBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  expect(start, `${name} not found`).to.be.greaterThan(-1);
  const next = source.indexOf('\nasync function ', start + 10);
  const nextExport = source.indexOf('\nexport ', start + 10);
  const ends = [next, nextExport].filter(i => i > 0);
  return source.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('Scene infrastructure', function () {
  this.timeout(15000);

  describe('askAI speaks once', function () {
    it('plays nothing itself — the agent already spoke its reply', async function () {
      const body = fnBody(await read('services/scenes/sceneExecutor.js'), 'executeAskAIStep');
      expect(body).to.contain('askAgentQuestion');
      expect(body).to.not.match(/generateSpeech|playAIOnCharacterSpeaker|playWithJawSync|playBufferOnCharacterSpeaker/);
      // The reply text survives in the result and the speech log.
      expect(body).to.match(/response: responseText/);
      expect(body).to.match(/recordSpeech\(characterId/);
    });

    it('does not invent a canned line when the agent is silent', async function () {
      const body = fnBody(await read('services/scenes/sceneExecutor.js'), 'executeAskAIStep');
      expect(body).to.not.contain('I heard your question');
    });
  });

  describe('audio step timeout', function () {
    it('derives the timeout from the clip length plus a margin, capped', function () {
      expect(deriveAudioTimeoutMs(125)).to.equal(135000);
      expect(deriveAudioTimeoutMs(4.6)).to.equal(14600);
      expect(deriveAudioTimeoutMs(5000)).to.equal(AUDIO_TIMEOUT_CAP_MS);
      expect(deriveAudioTimeoutMs(null)).to.equal(AUDIO_TIMEOUT_CAP_MS);
      expect(deriveAudioTimeoutMs(0)).to.equal(AUDIO_TIMEOUT_CAP_MS);
      expect(AUDIO_TIMEOUT_CAP_MS).to.equal(15 * 60 * 1000);
    });

    it('passes that timeout to the speaker wrapper instead of the 30 s default', async function () {
      const body = fnBody(await read('services/scenes/sceneExecutor.js'), 'executeAudioStep');
      expect(body).to.match(/const timeoutMs = deriveAudioTimeoutMs\(durationSec\)/);
      expect(body).to.match(/runWrapper\('speaker_cli\.py', args, \{ timeoutMs \}\)/);
      expect(body).to.not.contain('HARDWARE_CONTROLLERS.speaker.play(');
    });
  });

  describe('sayThis TTS cache', function () {
    let root;
    let savedMode;
    beforeEach(async function () {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'mb-tts-cache-'));
      savedMode = process.env.MB_TEST_MODE;
      delete process.env.MB_TEST_MODE; // the cache refuses to store test-mode stubs
    });
    afterEach(async function () {
      if (savedMode === undefined) delete process.env.MB_TEST_MODE; else process.env.MB_TEST_MODE = savedMode;
      await fs.rm(root, { recursive: true, force: true });
    });

    const cfg = { model: 'eleven_v3', stability: 0.25, similarity_boost: 0.6, voice_id: 'v1' };
    const audio = Buffer.alloc(4096, 7);

    it('keys on text, voice, model, stability and similarity — and nothing else', function () {
      const base = { text: 'Hello', voiceId: 'v1', model: 'eleven_v3', stability: 0.25, similarity_boost: 0.6 };
      const k = ttsCacheKey(base);
      expect(k).to.match(/^[0-9a-f]{64}$/);
      expect(ttsCacheKey({ ...base })).to.equal(k);
      for (const change of [{ text: 'Hello!' }, { voiceId: 'v2' }, { model: 'eleven_flash_v2_5' }, { stability: 0.3 }, { similarity_boost: 0.7 }]) {
        expect(ttsCacheKey({ ...base, ...change }), JSON.stringify(change)).to.not.equal(k);
      }
      expect(ttsCacheKey({ ...base, speed: 0.75 })).to.equal(k);
    });

    it('renders on a miss, stores atomically, and serves the next play from disk', async function () {
      let calls = 0;
      const generate = async () => { calls++; return { success: true, audioBuffer: audio, contentType: 'audio/mpeg' }; };
      const first = await generateSpeechCached({ text: 'Hi', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate, root });
      expect(first.cached).to.equal(false);
      expect(first.stored).to.match(/9201\/[0-9a-f]{64}\.mp3$/);
      const leftovers = (await fs.readdir(path.join(root, '9201'))).filter(f => f.endsWith('.tmp'));
      expect(leftovers).to.have.length(0);
      const second = await generateSpeechCached({ text: 'Hi', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate, root });
      expect(second.cached).to.equal(true);
      expect(Buffer.compare(second.audioBuffer, audio)).to.equal(0);
      expect(calls).to.equal(1);
    });

    it('nocache:true bypasses both read and write', async function () {
      let calls = 0;
      const generate = async () => { calls++; return { success: true, audioBuffer: audio, contentType: 'audio/mpeg' }; };
      await generateSpeechCached({ text: 'Hi', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate, root });
      const r = await generateSpeechCached({ text: 'Hi', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate, root, nocache: true });
      expect(r.cached).to.equal(false);
      expect(r.bypassed).to.equal(true);
      expect(calls).to.equal(2);
      const r2 = await generateSpeechCached({ text: 'Fresh', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate, root, nocache: true });
      const key = ttsCacheKey({ text: 'Fresh', voiceId: 'v1', model: cfg.model, stability: cfg.stability, similarity_boost: cfg.similarity_boost });
      expect(r2.success).to.equal(true);
      expect(await getCachedSpeech(9201, key, root)).to.equal(null);
    });

    it('never caches a failure or a stub-sized buffer', async function () {
      const fail = async () => ({ success: false, error: 'quota_exceeded' });
      const r = await generateSpeechCached({ text: 'X', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate: fail, root });
      expect(r.success).to.equal(false);
      const stub = async () => ({ success: true, audioBuffer: Buffer.from('RIFF....WAVE'), contentType: 'audio/wav' });
      const s = await generateSpeechCached({ text: 'Y', voiceId: 'v1', ttsCfg: cfg, characterId: 9201, generate: stub, root });
      expect(s.stored).to.equal(null);
      const dir = path.join(root, '9201');
      const clips = fsSync.existsSync(dir) ? (await fs.readdir(dir)).filter(f => !f.startsWith('.')) : [];
      expect(clips).to.have.length(0);
    });

    it('is the path sayThis takes, with a nocache escape hatch', async function () {
      const body = fnBody(await read('services/scenes/sceneExecutor.js'), 'executeSayThisStep');
      expect(body).to.match(/generateSpeechCached\(\{/);
      expect(body).to.match(/nocache: step\.nocache === true/);
    });
  });

  describe('Goblin casts by name', function () {
    const manager = {
      resolveGoblin(ref) {
        const all = [{ id: 'g-1', name: 'Goblin 1' }, { id: 'g-2', name: 'Goblin 2' }];
        const hit = all.find(g => g.id === ref || g.name.toLowerCase() === String(ref).toLowerCase());
        return hit ? { success: true, id: hit.id, goblin: hit } : { success: false, error: `No Goblin with id or name "${ref}"` };
      }
    };
    it('resolves goblinName through the manager, goblinId winning when both are set', function () {
      expect(resolveGoblinRef({ goblinName: 'goblin 2' }, manager).id).to.equal('g-2');
      expect(resolveGoblinRef({ goblinId: 'g-1', goblinName: 'Goblin 2' }, manager).id).to.equal('g-1');
      expect(resolveGoblinRef({ goblinName: 'Goblin 9' }, manager).success).to.equal(false);
      expect(resolveGoblinRef({}, manager).error).to.contain('goblinId or goblinName');
    });
    it('falls back to a local case-insensitive match on builds without resolveGoblin', function () {
      const legacy = { goblins: new Map([['g-3', { id: 'g-3', name: 'Goblin 3' }]]) };
      expect(resolveGoblinRef({ goblinName: 'GOBLIN 3' }, legacy).id).to.equal('g-3');
    });
  });

  describe('queue start-config', function () {
    it('accepts sceneId (dashboard Loop All) as well as scene_id and id', function () {
      const def = validateQueueDefinition({ mode: 'loop_queue', scenes: [{ sceneId: 5 }, { scene_id: '7' }, { id: 9 }] });
      expect(def.scenes.map(s => s.scene_id)).to.deep.equal(['5', '7', '9']);
      expect(() => validateQueueDefinition({ scenes: [{}] })).to.throw('scene_id is required');
    });
  });

  describe('fleet steps', function () {
    const REG = [
      { id: 71, name: 'Count Test', characterId: 9301, hostname: 'counttest', ip: '10.9.0.71', port: 3000 },
      { id: 72, name: 'Lady Test', characterId: 9302, hostname: 'ladytest', ip: '10.9.0.72', port: 3000 },
      { id: 73, name: 'Pumpkin Test', characterId: 9303, hostname: 'pumpkintest', ip: '10.9.0.73', port: 3000 }
    ];

    function harness(behaviour = {}) {
      const calls = [];
      const http = async (node, opts) => {
        calls.push({ ip: node.ip, method: opts.method, path: opts.path, body: opts.body });
        const b = behaviour[node.ip] || {};
        if (b.offline) throw new Error('connect ECONNREFUSED');
        if (opts.path.startsWith('/conversation/api/ai-status')) return { success: true, enabled: !!b.guest };
        if (b.missing && opts.path.startsWith(b.missing)) throw new Error('Request failed with status code 404');
        return { success: true };
      };
      const fleet = createFleetSteps({ http, getRegistry: () => REG, hostname: 'counttest', log: () => {}, warn: () => {} });
      return { fleet, calls };
    }

    it('resolves names, ids, hostnames and loose fragments; refuses ambiguity', function () {
      expect(resolveFleetNodes('lady test', REG).nodes[0].id).to.equal(72);
      expect(resolveFleetNodes('9303', REG).nodes[0].id).to.equal(73);
      expect(resolveFleetNodes('pumpkintest', REG).nodes[0].id).to.equal(73);
      expect(resolveFleetNodes('pumpkin', REG).nodes[0].id).to.equal(73);
      expect(resolveFleetNodes('test', REG).error).to.contain('matches');
      expect(resolveFleetNodes('all', REG).nodes).to.have.length(3);
      expect(resolveFleetNodes('all', REG, { allowAll: false }).error).to.contain("'all'");
      expect(isSelfNode(REG[0], REG, { hostname: 'counttest' })).to.equal(true);
      expect(isSelfNode(REG[1], REG, { hostname: 'counttest' })).to.equal(false);
    });

    it('fleet-say to all skips an offline node and a node in a guest conversation, fast', async function () {
      const { fleet, calls } = harness({ '10.9.0.72': { offline: true }, '10.9.0.73': { guest: true } });
      const local = { say: async () => ({ success: true }) };
      const r = await fleet.run({ type: 'fleet-say', node: 'all', text: 'Together' }, { characterId: 9301, local });
      expect(r.success).to.equal(true);
      expect(r.succeeded).to.equal(1);
      expect(r.skipped).to.equal(2);
      expect(r.targets.find(t => t.id === 72).reason).to.equal('offline');
      expect(r.targets.find(t => t.id === 73).reason).to.equal('guest-conversation');
      // Self ran in-process (no say POST to loopback); nothing was sent to the skipped nodes.
      expect(calls.filter(c => c.method === 'post')).to.have.length(0);
    });

    it('force:true overrides the guest-conversation refusal', async function () {
      const { fleet, calls } = harness({ '10.9.0.73': { guest: true } });
      const r = await fleet.run({ type: 'fleet-audio', node: 'Pumpkin Test', audioId: 'bed', force: true }, { characterId: 9301 });
      expect(r.succeeded).to.equal(1);
      expect(calls.some(c => c.ip === '10.9.0.73' && c.path === '/audio-library/api/audio/bed/play')).to.equal(true);
    });

    it('release and stop-audio are never refused for a guest conversation', async function () {
      const { fleet } = harness({ '10.9.0.72': { guest: true } });
      const rel = await fleet.run({ type: 'fleet-mode', node: 'Lady Test', mode: 'release' }, { characterId: 9301 });
      expect(rel.succeeded).to.equal(1);
      const stop = await fleet.run({ type: 'fleet-stop-audio', node: 'Lady Test' }, { characterId: 9301 });
      expect(stop.succeeded).to.equal(1);
      const hold = await fleet.run({ type: 'fleet-mode', node: 'Lady Test', mode: 'hold' }, { characterId: 9301 });
      expect(hold.skipped).to.equal(1);
    });

    it('fleet-mode logs and continues when a node has no event-hold endpoint yet', async function () {
      const { fleet } = harness({ '10.9.0.72': { missing: '/conversation/api/lurk/event-hold' } });
      const r = await fleet.run({ type: 'fleet-mode', node: 'Lady Test', mode: 'hold' }, { characterId: 9301 });
      expect(r.success).to.equal(true);
      expect(r.targets[0].unsupported).to.equal(true);
    });

    it('fleet-scene plays a remote scene by id, and a local one in-process', async function () {
      const { fleet, calls } = harness();
      await fleet.run({ type: 'fleet-scene', node: 'Lady Test', scene: 8 }, { characterId: 9301 });
      expect(calls.some(c => c.ip === '10.9.0.72' && c.method === 'post' && c.path === '/scenes/api/8/play?characterId=9302')).to.equal(true);
      let played = null;
      const local = { playScene: async (id, cid, opts) => { played = { id, cid, depth: opts._fleetDepth }; return { success: true }; } };
      await fleet.run({ type: 'fleet-scene', node: 'Count Test', scene: 9 }, { characterId: 9301, local, opts: {} });
      expect(played).to.deep.equal({ id: 9, cid: 9301, depth: 1 });
    });

    it('refuses runaway nesting', async function () {
      const { fleet } = harness();
      let err;
      try { await fleet.run({ type: 'fleet-scene', node: 'Count Test', scene: 1 }, { characterId: 9301, opts: { _fleetDepth: 3 } }); } catch (e) { err = e; }
      expect(err && err.message).to.contain('nesting');
    });

    it('fails the step only when every reachable target failed', async function () {
      const http = async (node, opts) => {
        if (opts.path.startsWith('/conversation/api/ai-status')) return { enabled: false };
        throw new Error('HTTP 500');
      };
      const fleet = createFleetSteps({ http, getRegistry: () => REG, hostname: 'elsewhere', log: () => {}, warn: () => {} });
      let err;
      try { await fleet.run({ type: 'fleet-say', node: 'Lady Test', text: 'x' }, { characterId: 9301 }); } catch (e) { err = e; }
      expect(err && err.message).to.contain('every target failed');
    });

    it('a dry run resolves the node without sending anything', async function () {
      const r = await executeStep({ type: 'fleet-say', node: 'all', text: 'dry' }, 9301, null, { dryRun: true });
      expect(r.dryRun).to.equal(true);
      expect(r.targets.length).to.be.greaterThan(0);
    });

    it('fleet steps are non-fatal in the executor', async function () {
      const src = await read('services/scenes/sceneExecutor.js');
      const set = src.match(/const NON_FATAL_STEP_TYPES = new Set\(\[([\s\S]*?)\]\)/)[1];
      for (const t of ['fleet-scene', 'fleet-say', 'fleet-audio', 'fleet-stop-audio', 'fleet-mode']) expect(set).to.contain(`'${t}'`);
    });
  });

  describe('validator calibration window', function () {
    it('refuses a servo angle outside this node\'s calibrated window (scoped key only)', async function () {
      const store = { get: async () => ({ bounds: { minAngle: 40, maxAngle: 120 } }) };
      const ctx = {
        root: '/nonexistent', audio: [], audioFiles: new Set(), goblins: [], goblinManifests: new Map(), registry: [], faults: {}, hazards: {},
        calibrationStore: store, calibratedBoundsFn: (p) => p.bounds, calibrationAll: { '9401:1': {} }
      };
      const parts = [{ id: '1', type: 'servo' }, { id: '2', type: 'servo' }];
      const r = await validateCharacterData({ characterId: 9401, parts, ctx, scenes: [{ id: 1, name: 'S', steps: [
        { type: 'servo', partId: '1', angle: 150 }, { type: 'servo', partId: '2', angle: 150 }] }] });
      expect(r.errors).to.have.length(1);
      expect(r.errors[0].message).to.contain('outside its calibrated window 40-120°');
    });
  });

  describe('bulk replace endpoints', function () {
    const SYNTH = 99031;
    const synthDir = path.join(ROOT, 'data', `character-${SYNTH}`);
    let app;
    let lockedId = null;

    before(function () {
      if (fsSync.existsSync(synthDir)) this.skip(); // never touch a directory we did not create
      app = express();
      app.use(express.json());
      app.use('/scenes/api', scenesApi);
      app.use('/poses', posesRoutes);
      const locks = listLocks();
      lockedId = locks.length ? locks[0].characterId : null;
    });

    after(async function () {
      await fs.rm(synthDir, { recursive: true, force: true });
    });

    it('answers 423 CHARACTER_CONFIG_LOCKED for a locked character (scenes and poses)', async function () {
      if (lockedId == null) this.skip();
      const s = await request(app).post(`/scenes/api/replace?characterId=${lockedId}`).send({ scenes: [] });
      expect(s.status).to.equal(423);
      expect(s.body.code).to.equal('CHARACTER_CONFIG_LOCKED');
      const p = await request(app).post(`/poses/api/replace?characterId=${lockedId}`).send({ poses: [] });
      expect(p.status).to.equal(423);
      expect(p.body.code).to.equal('CHARACTER_CONFIG_LOCKED');
    });

    it('answers 423 (not 500/400) on single-scene and single-pose writes to a locked character', async function () {
      if (lockedId == null) this.skip();
      const s = await request(app).post(`/scenes/api?characterId=${lockedId}`).send({ name: 'ZZ lock probe', steps: [] });
      expect(s.status).to.equal(423);
      const p = await request(app).post(`/poses?characterId=${lockedId}`).send({ name: 'ZZ lock probe', parts: [{ partId: 1, type: 'servo', target: { angleDeg: 90 } }] });
      expect(p.status).to.equal(423);
    });

    it('validates without writing when asked (validateOnly), even for a locked character', async function () {
      if (lockedId == null) this.skip();
      const r = await request(app).post(`/scenes/api/replace?characterId=${lockedId}&validateOnly=1`).send({ scenes: [{ id: 1, name: 'x', steps: [{ type: 'wait', duration: 10 }] }] });
      expect(r.status).to.equal(200);
      expect(r.body.validateOnly).to.equal(true);
    });

    it('rejects an invalid set with 400 and file:scene:step messages', async function () {
      const r = await request(app).post(`/scenes/api/replace?characterId=${SYNTH}`).send({ scenes: [{ id: 1, name: 'Bad', steps: [{ type: 'pose', poseId: 4 }] }] });
      expect(r.status).to.equal(400);
      expect(r.body.errors[0]).to.match(/scenes\.json:scene 1 "Bad":step 0 — pose 4 does not exist/);
      expect(fsSync.existsSync(path.join(synthDir, 'scenes.json'))).to.equal(false);
    });

    it('backs up the old file and writes the new one', async function () {
      const v1 = [{ id: 1, name: 'First', steps: [{ type: 'wait', duration: 10 }] }];
      const v2 = [{ id: 1, name: 'Second', steps: [{ type: 'wait', duration: 20 }] }, { id: 2, name: 'Third', steps: [] }];
      const a = await request(app).post(`/scenes/api/replace?characterId=${SYNTH}`).send({ scenes: v1 });
      expect(a.status, JSON.stringify(a.body)).to.equal(200);
      expect(a.body.backup).to.equal(null);
      const b = await request(app).post(`/scenes/api/replace?characterId=${SYNTH}`).send({ scenes: v2 });
      expect(b.status).to.equal(200);
      expect(b.body.count).to.equal(2);
      expect(JSON.parse(await fs.readFile(path.join(synthDir, 'scenes.json'), 'utf8'))).to.deep.equal(v2);
      expect(JSON.parse(await fs.readFile(b.body.backup, 'utf8'))).to.deep.equal(v1);
      expect(b.body.backup).to.contain(path.join(`character-${SYNTH}`, 'backups'));

      const p = await request(app).post(`/poses/api/replace?characterId=${SYNTH}`).send({ poses: [] });
      expect(p.status, JSON.stringify(p.body)).to.equal(200);
      const posesFile = JSON.parse(await fs.readFile(path.join(synthDir, 'poses.json'), 'utf8'));
      expect(posesFile).to.deep.equal({ characterId: SYNTH, poses: [] });
    });

    it('import keeps merge semantics but refuses invalid scenes', async function () {
      const bad = await request(app).post(`/scenes/api/import?characterId=${SYNTH}`).send({ scenes: [{ id: 5, name: 'Bad', steps: [{ type: 'teleport' }] }] });
      expect(bad.status).to.equal(400);
      const ok = await request(app).post(`/scenes/api/import?characterId=${SYNTH}`).send({ scenes: [{ id: 5, name: 'Good', steps: [] }] });
      expect(ok.status).to.equal(200);
      expect(ok.body.imported).to.equal(1);
    });
  });
});
