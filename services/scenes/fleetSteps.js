/**
 * Cross-node scene steps (mission decision D7).
 *
 * A scene on one animatronic can drive the others: run one of their scenes,
 * speak a line in their own voice, start or stop the same library track on
 * them (a shared music bed), and hold/release their lurk services so idle
 * loops, head tracking and background music step aside for a fleet event.
 *
 *   fleet-scene      {node, scene, wait=true, timeoutMs, force}
 *   fleet-say        {node|'all', text, wait=true, force}
 *   fleet-audio      {node|'all', audioId, volume, loop, force}
 *   fleet-stop-audio {node|'all'}
 *   fleet-mode       {mode:'hold'|'release', node|'all', maxMs, reason, force}
 *
 * Every step is non-fatal and never blocks on a dead node: each target gets a
 * short reachability probe first (GET ai-status, which doubles as the guest
 * conversation check) and an unreachable node is skipped with a warning, the
 * way scripts/yard-theater/perform.mjs preflights. A node whose agent session
 * is live (a guest is talking to it) is skipped too unless the step says
 * force:true; stopping audio and releasing a hold are never refused, because
 * they are how a show gives a node back.
 *
 * Nodes resolve through the orchestration registry (config/animatronics.json
 * overlaid with mDNS discovery), so a discovered IP wins over the static one.
 * All HTTP goes through orchestrationService.httpNode — the audited egress
 * point that also refuses writes in test mode.
 */
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import orchestrationService from '../orchestrationService.js';
import { FLEET_STEP_TYPES, looseKey, resolveFleetNodes, isSelfNode } from './fleetNodes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

export { FLEET_STEP_TYPES, looseKey, resolveFleetNodes, isSelfNode };

// 2.5 s skipped two healthy nodes mid-show (a Pi answering slowly under its own event part); a show
// that waits six seconds for a probe loses less than one that leaves a character out.
const PROBE_TIMEOUT_MS = 6000;
const DEFAULT_SCENE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SCENE_TIMEOUT_MS = 15 * 60 * 1000;
const SAY_TIMEOUT_MS = 90 * 1000;
const AUDIO_TIMEOUT_MS = 15 * 1000;
// A scene that fleet-scenes itself (directly or round a ring of nodes) would
// recurse forever; three hops is more than any show needs.
export const MAX_FLEET_DEPTH = 3;

function describe(node) {
  return `${node.name || node.id} (${node.ip || 'no ip'})`;
}

function clampTimeout(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(1000, n), max);
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return null; }
}

/**
 * Factory so tests can inject the registry, the HTTP egress and the local
 * runners. Production uses the default instance below.
 */
export function createFleetSteps(deps = {}) {
  const orch = deps.orchestration || orchestrationService;
  const hostname = deps.hostname || os.hostname();
  const log = deps.log || ((...a) => console.log(...a));
  const warn = deps.warn || ((...a) => console.warn(...a));
  const getRegistry = deps.getRegistry || (() => orch.getAnimatronics());
  const http = deps.http || ((node, opts) => orch.httpNode(node, opts));

  // A self call goes to loopback: the node's advertised IP may be the Wi-Fi
  // address of an interface that is mid-reassociation.
  const target = (node, self) => (self ? Object.assign({}, node, { ip: '127.0.0.1' }) : node);

  async function probe(node, self, { force = false, guestCheck = true } = {}) {
    try {
      const cid = node.characterId != null ? node.characterId : node.id;
      const st = await http(target(node, self), {
        method: 'get',
        path: `/conversation/api/ai-status?characterId=${encodeURIComponent(cid)}`,
        timeout: PROBE_TIMEOUT_MS
      });
      // Busy = a guest spoke to this node in the last minute (ai-status.conversing); an older build without
      // that field falls back to "agent session up". The node running this scene is never skipped: the show
      // is already playing here, and its PIR-woken agent is exactly what the hold puts to sleep.
      const busy = st && (st.conversing === true || (st.conversing === undefined && st.enabled === true));
      if (guestCheck && !force && !self && busy) {
        return { ok: false, skipped: true, reason: 'guest-conversation', warning: `${describe(node)} is in a live conversation — skipped (force:true overrides)` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, skipped: true, reason: 'offline', warning: `${describe(node)} unreachable (${e.message}) — skipped` };
    }
  }

  function resolveOrThrow(step, ctx, opts) {
    const registry = getRegistry() || [];
    const r = resolveFleetNodes(step.node, registry, opts);
    if (r.error) throw new Error(`${step.type}: ${r.error}`);
    return r.nodes.map(n => ({ node: n, self: isSelfNode(n, registry, { hostname, characterId: ctx.characterId }) }));
  }

  /**
   * Run one action on every resolved node, in parallel. A skipped node is a
   * warning; a reachable node that errors is a failure. The step fails only when
   * there was something to do and nothing succeeded.
   */
  async function fanOut(step, ctx, targets, action, { guestCheck = true } = {}) {
    const outcomes = await Promise.all(targets.map(async ({ node, self }) => {
      const p = await probe(node, self, { force: step.force === true, guestCheck });
      if (!p.ok) { warn(`⚠️ [fleet] ${step.type}: ${p.warning}`); return { node: node.name, id: node.id, skipped: true, reason: p.reason, warning: p.warning }; }
      try {
        const result = await action(node, self);
        return Object.assign({ node: node.name, id: node.id, self, success: true }, result || {});
      } catch (e) {
        warn(`⚠️ [fleet] ${step.type} on ${describe(node)} failed: ${e.message}`);
        return { node: node.name, id: node.id, self, success: false, error: e.message };
      }
    }));
    const failed = outcomes.filter(o => o.success === false);
    const succeeded = outcomes.filter(o => o.success === true);
    const skipped = outcomes.filter(o => o.skipped);
    const summary = { success: failed.length === 0 || succeeded.length > 0, type: step.type, targets: outcomes, succeeded: succeeded.length, skipped: skipped.length, failed: failed.length };
    if (skipped.length) summary.warnings = skipped.map(s => s.warning);
    if (!summary.success) {
      const err = new Error(`${step.type}: every target failed — ${failed.map(f => `${f.node}: ${f.error}`).join('; ')}`);
      err.result = summary;
      throw err;
    }
    return summary;
  }

  async function sceneIdFor(step, node, self) {
    const raw = step.scene != null ? step.scene : (step.sceneId != null ? step.sceneId : step.sceneName);
    if (raw == null || String(raw).trim() === '') throw new Error('fleet-scene: scene is required');
    if (/^\d+$/.test(String(raw).trim())) return parseInt(raw, 10);
    // By name: ask the node for its own library (scenes are node-local).
    const cid = node.characterId != null ? node.characterId : node.id;
    const list = await http(target(node, self), { method: 'get', path: `/scenes/api/?characterId=${encodeURIComponent(cid)}`, timeout: 5000 });
    const scenes = (list && Array.isArray(list.scenes)) ? list.scenes : [];
    const want = String(raw).trim().toLowerCase();
    const hit = scenes.filter(s => String(s.name || '').trim().toLowerCase() === want);
    if (hit.length !== 1) throw new Error(`fleet-scene: ${hit.length ? 'more than one' : 'no'} scene named "${raw}" on ${node.name}`);
    return parseInt(hit[0].id, 10);
  }

  async function fleetScene(step, ctx) {
    const depth = (ctx.opts && ctx.opts._fleetDepth) || 0;
    if (depth >= MAX_FLEET_DEPTH) throw new Error(`fleet-scene: nesting deeper than ${MAX_FLEET_DEPTH} refused (a scene is calling itself)`);
    const targets = resolveOrThrow(step, ctx, { allowAll: false });
    const wait = step.wait !== false;
    const timeout = clampTimeout(step.timeoutMs, DEFAULT_SCENE_TIMEOUT_MS, MAX_SCENE_TIMEOUT_MS);
    return fanOut(step, ctx, targets, async (node, self) => {
      const sceneId = await sceneIdFor(step, node, self);
      const cid = node.characterId != null ? node.characterId : node.id;
      let run;
      if (self && ctx.local && typeof ctx.local.playScene === 'function') {
        run = ctx.local.playScene(sceneId, cid, Object.assign({}, ctx.opts || {}, { _fleetDepth: depth + 1 }));
      } else {
        run = http(target(node, self), { method: 'post', path: `/scenes/api/${sceneId}/play?characterId=${encodeURIComponent(cid)}`, body: {}, timeout });
      }
      if (!wait) {
        Promise.resolve(run).catch(e => warn(`⚠️ [fleet] fleet-scene ${sceneId} on ${node.name} (not awaited) failed: ${e.message}`));
        log(`🎬 [fleet] fleet-scene ${sceneId} started on ${node.name} (not waiting)`);
        return { sceneId, waited: false };
      }
      const r = await run;
      const inner = r && (r.result || r);
      log(`🎬 [fleet] fleet-scene ${sceneId} finished on ${node.name}${inner && inner.success === false ? ' with step errors' : ''}`);
      return { sceneId, waited: true, sceneSuccess: inner ? inner.success !== false : true };
    });
  }

  async function fleetSay(step, ctx) {
    const text = String(step.text || step.say || '').trim();
    if (!text) throw new Error('fleet-say: text is required');
    const targets = resolveOrThrow(step, ctx, { allowAll: true });
    const wait = step.wait !== false;
    return fanOut(step, ctx, targets, async (node, self) => {
      const cid = node.characterId != null ? node.characterId : node.id;
      let run;
      if (self && ctx.local && typeof ctx.local.say === 'function') {
        run = ctx.local.say(text, cid);
      } else {
        // The node's own scene path: its own voice, its TTS cache, its jaw.
        // Older builds without the step endpoint fall back to the orchestration
        // say path (generate-and-play).
        run = http(target(node, self), { method: 'post', path: `/scenes/api/test-step?characterId=${encodeURIComponent(cid)}`, body: { type: 'sayThis', text }, timeout: SAY_TIMEOUT_MS })
          .catch(e => {
            if (!/404|not found/i.test(e.message)) throw e;
            return http(target(node, self), { method: 'post', path: '/api/elevenlabs/generate-and-play', body: { text, characterId: cid }, timeout: SAY_TIMEOUT_MS });
          });
      }
      if (!wait) {
        Promise.resolve(run).catch(e => warn(`⚠️ [fleet] fleet-say on ${node.name} (not awaited) failed: ${e.message}`));
        return { waited: false };
      }
      const r = await run;
      const inner = r && r.result ? r.result : r;
      if (inner && inner.success === false) throw new Error(inner.error || 'say failed');
      return { waited: true, muted: !!(inner && inner.muted) };
    });
  }

  async function fleetAudio(step, ctx) {
    const audioId = step.audioId != null ? String(step.audioId) : '';
    if (!audioId) throw new Error('fleet-audio: audioId is required');
    const targets = resolveOrThrow(step, ctx, { allowAll: true });
    const volume = Number.isFinite(Number(step.volume)) ? Number(step.volume) : 100;
    const loop = step.loop === true;
    return fanOut(step, ctx, targets, async (node, self) => {
      const cid = node.characterId != null ? node.characterId : node.id;
      const t = target(node, self);
      let r;
      try {
        r = await http(t, { method: 'post', path: `/audio-library/api/audio/${encodeURIComponent(audioId)}/play`, body: { characterId: cid, volume, loop, background: true }, timeout: AUDIO_TIMEOUT_MS });
        if (r && r.success === false) throw new Error(r.error || r.message || 'device refused');
      } catch (primary) {
        // Same fallback the orchestration play-audio route uses: the conversation
        // player resolves by id, title or filename on older builds.
        r = await http(t, { method: 'post', path: '/conversation/api/play-audio', body: { audioId, audio: { id: audioId }, characterId: cid, volume, loop, background: true }, timeout: AUDIO_TIMEOUT_MS });
        if (r && r.success === false) throw new Error(r.error || primary.message);
      }
      return { audioId, muted: !!(r && r.muted), loop };
    });
  }

  async function fleetStopAudio(step, ctx) {
    const targets = resolveOrThrow(step, ctx, { allowAll: true });
    return fanOut(step, ctx, targets, async (node, self) => {
      const t = target(node, self);
      try {
        return { data: await http(t, { method: 'post', path: '/audio-library/api/audio/stop-all', body: {}, timeout: 8000 }) };
      } catch (e) {
        return { data: await http(t, { method: 'post', path: '/api/audio/stop-all', body: {}, timeout: 8000 }) };
      }
    }, { guestCheck: false });
  }

  async function fleetMode(step, ctx) {
    const mode = String(step.mode || '').toLowerCase();
    if (mode !== 'hold' && mode !== 'release') throw new Error("fleet-mode: mode must be 'hold' or 'release'");
    const targets = resolveOrThrow(step, ctx, { allowAll: true });
    const apiPath = mode === 'hold' ? '/conversation/api/lurk/event-hold' : '/conversation/api/lurk/event-release';
    return fanOut(step, ctx, targets, async (node, self) => {
      const cid = node.characterId != null ? node.characterId : node.id;
      const body = { characterId: cid, reason: step.reason || 'fleet-event' };
      if (mode === 'hold' && Number.isFinite(Number(step.maxMs))) body.maxMs = Number(step.maxMs);
      try {
        const r = await http(target(node, self), { method: 'post', path: `${apiPath}?characterId=${encodeURIComponent(cid)}`, body, timeout: 8000 });
        return { mode, data: r };
      } catch (e) {
        // The lurk service's hold API may not be on every node yet: log and go on.
        if (/404|not found/i.test(e.message)) {
          warn(`⚠️ [fleet] ${node.name} has no ${apiPath} yet — continuing without ${mode}`);
          return { mode, unsupported: true };
        }
        throw e;
      }
    }, { guestCheck: mode === 'hold' });
  }

  /** Dry run: resolve every target without touching the network. */
  function dryResolve(step, ctx) {
    const registry = getRegistry() || [];
    const allowAll = step.type !== 'fleet-scene';
    const r = resolveFleetNodes(step.node, registry, { allowAll });
    if (r.error) return { success: false, dryRun: true, error: `${step.type}: ${r.error}` };
    return {
      success: true,
      dryRun: true,
      type: step.type,
      targets: r.nodes.map(n => ({ id: n.id, node: n.name, ip: n.ip, characterId: n.characterId, self: isSelfNode(n, registry, { hostname, characterId: ctx.characterId }) }))
    };
  }

  async function run(step, ctx = {}) {
    switch (step.type) {
      case 'fleet-scene': return fleetScene(step, ctx);
      case 'fleet-say': return fleetSay(step, ctx);
      case 'fleet-audio': return fleetAudio(step, ctx);
      case 'fleet-stop-audio': return fleetStopAudio(step, ctx);
      case 'fleet-mode': return fleetMode(step, ctx);
      default: throw new Error(`not a fleet step: ${step.type}`);
    }
  }

  return { run, dryResolve, probe };
}

/** The registry as checked into this repo (for the offline validator). */
export async function loadStaticRegistry(root = APP_ROOT) {
  const cfg = await readJson(path.join(root, 'config', 'animatronics.json'));
  return (cfg && Array.isArray(cfg.animatronics)) ? cfg.animatronics : [];
}

const defaultFleetSteps = createFleetSteps();
export default defaultFleetSteps;
