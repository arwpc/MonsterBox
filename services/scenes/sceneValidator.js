/**
 * Scene and pose validator.
 *
 * The schema check (scripts/validate-schemas.mjs) and the pact suite only prove
 * a scenes.json is an array of objects with known step types. A scene set could
 * pass every gate and still fail on its first play: a pose id that does not
 * exist, an `audioFile` key the executor never reads, a Goblin clip that is not
 * on that Goblin, a 90 s motor pulse the 30 s wrapper kills, a step type with no
 * dispatcher (`linear_actuator`). This walks every step and pose against the
 * character's own parts, poses, the audio library, the Goblin registry and clip
 * manifests, the node's calibration windows, and the physical hazard rules in
 * config/scene-hazards.json, and reports `file:scene:step` messages.
 *
 * Errors block (non-zero exit, HTTP 400 on the replace endpoints). Warnings do
 * not: a step on a part listed in config/physical-faults.json is a warning,
 * because the executor already skips it at play time.
 *
 * Character-independent: every rule is data — parts.json, poses.json and the
 * hazard config — never a name or id in this file.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveFleetNodes, FLEET_STEP_TYPES } from './fleetNodes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

// Step types the executor dispatches (services/scenes/sceneExecutor.js executeStep).
// `linear_actuator` and `goblin`/`part` are deliberately absent: the first has no
// dispatcher, the other two are not in the schema.
export const DISPATCHABLE_STEP_TYPES = new Set([
  'servo', 'motor', 'linear-actuator', 'light', 'led', 'audio', 'sayThis', 'askAI',
  'goblin-video', 'wait', 'delay', 'sensor', 'pose', 'hardware', 'jaw-animation', 'head-tracking',
  ...FLEET_STEP_TYPES
]);

const PART_TYPES_FOR_STEP = {
  servo: ['servo', 'continuous-servo', 'continuous_servo'],
  motor: ['motor'],
  'linear-actuator': ['linear_actuator', 'linear-actuator'],
  light: ['light', 'led'],
  led: ['light', 'led'],
  sensor: ['motion_sensor']
};

const POSE_PART_TYPES = new Set(['servo', 'motor', 'linear_actuator', 'light', 'led']);
const TRANSITION_PROFILES = new Set(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'overshoot', 'bounce']);

// Wrapper processes run under a 30 s timeout (services/hardwareService/exec.js);
// a longer blocking pulse is killed mid-move.
const WRAPPER_CAP_MS = 30000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const MAX_FLEET_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_GOBLIN_WAIT_MS = 10 * 60 * 1000;
const MAX_SAY_CHARS = 400;

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return null; }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch (_) { return false; }
}

function partsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.parts)) return raw.parts;
  return [];
}

/** Parse a TSV manifest (first column = filename, header row "filename"). */
function parseManifestTsv(text) {
  const out = new Set();
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const name = line.split('\t')[0].trim();
    if (!name || (i === 0 && name.toLowerCase() === 'filename')) return;
    out.add(name);
  });
  return out;
}

/**
 * Clip manifests per Goblin id. Sources, later ones winning: the gold snapshot
 * (backups/goblins-gold-*\/<goblinId>/videos.manifest.tsv) and any manifest the
 * goblin service publishes under data/goblin-manifests/<goblinId>.(tsv|json)
 * (JSON: an array of filenames or {files:[...]} / {clips:[{filename}]}).
 */
async function loadGoblinManifests(root) {
  const manifests = new Map();
  try {
    const backups = path.join(root, 'backups');
    const dirs = (await fs.readdir(backups)).filter(d => d.startsWith('goblins-gold-')).sort();
    for (const d of dirs) {
      let subs = [];
      try { subs = await fs.readdir(path.join(backups, d)); } catch (_) { continue; }
      for (const sub of subs) {
        try {
          const text = await fs.readFile(path.join(backups, d, sub, 'videos.manifest.tsv'), 'utf8');
          manifests.set(sub, parseManifestTsv(text));
        } catch (_) { /* not a goblin dir */ }
      }
    }
  } catch (_) { /* no backups */ }
  try {
    const dir = path.join(root, 'data', 'goblin-manifests');
    for (const f of await fs.readdir(dir)) {
      const id = f.replace(/\.(tsv|json)$/i, '');
      const full = path.join(dir, f);
      if (/\.tsv$/i.test(f)) {
        manifests.set(id, parseManifestTsv(await fs.readFile(full, 'utf8')));
      } else if (/\.json$/i.test(f)) {
        const j = await readJson(full);
        const list = Array.isArray(j) ? j : (j && (j.files || (j.clips || []).map(c => c && (c.filename || c.name)))) || [];
        manifests.set(id, new Set(list.filter(Boolean).map(String)));
      }
    }
  } catch (_) { /* none published yet */ }
  return manifests;
}

/** Goblin lookup mirroring goblinManagerService.resolveGoblin (id, name, loose name). */
export function resolveGoblinInRegistry(ref, goblins) {
  const key = String(ref == null ? '' : ref).trim();
  if (!key) return { error: 'goblinId or goblinName is required' };
  const list = Array.isArray(goblins) ? goblins.filter(g => g && g.id) : [];
  const byId = list.find(g => g.id === key);
  if (byId) return { goblin: byId };
  const lower = key.toLowerCase();
  const loose = lower.replace(/[^a-z0-9]/g, '');
  for (const match of [
    list.filter(g => String(g.name || '').trim().toLowerCase() === lower),
    loose ? list.filter(g => String(g.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === loose) : []
  ]) {
    if (match.length === 1) return { goblin: match[0] };
    if (match.length > 1) return { error: `"${key}" matches ${match.length} Goblins — use the id` };
  }
  return { error: `no Goblin with id or name "${key}"` };
}

/**
 * Everything the validator reads besides the scenes/poses under test. Loaded
 * once per run; the replace endpoints and the CLI share it.
 */
export async function loadValidationContext({ root = APP_ROOT, calibration = true } = {}) {
  const library = await readJson(path.join(root, 'data', 'audio-library', 'library.json'));
  const audio = library ? (library.audio || library) : [];
  let audioFiles = new Set();
  try { audioFiles = new Set(await fs.readdir(path.join(root, 'data', 'audio-library', 'files'))); } catch (_) { /* none */ }
  const goblinsRaw = await readJson(path.join(root, 'data', 'goblins.json'));
  const goblins = Array.isArray(goblinsRaw) ? goblinsRaw : (goblinsRaw && Array.isArray(goblinsRaw.goblins) ? goblinsRaw.goblins : []);
  const animatronics = (await readJson(path.join(root, 'config', 'animatronics.json'))) || {};
  const ctx = {
    root,
    audio: Array.isArray(audio) ? audio : [],
    audioFiles,
    goblins,
    goblinManifests: await loadGoblinManifests(root),
    registry: Array.isArray(animatronics.animatronics) ? animatronics.animatronics : [],
    faults: (await readJson(path.join(root, 'config', 'physical-faults.json'))) || {},
    hazards: (await readJson(path.join(root, 'config', 'scene-hazards.json'))) || {},
    calibrationStore: null,
    calibratedBoundsFn: null
  };
  if (calibration) {
    try {
      const mod = await import('../../server/calibration/store.js');
      ctx.calibrationStore = mod.getCalibrationStore();
      ctx.calibratedBoundsFn = mod.calibratedBounds;
      ctx.calibrationAll = await ctx.calibrationStore.load();
    } catch (e) {
      ctx.calibrationError = e.message;
    }
  }
  return ctx;
}

/** Load a character's parts/poses/scenes from disk. */
export async function loadCharacterFiles(characterId, root = APP_ROOT) {
  const dir = path.join(root, 'data', `character-${characterId}`);
  return {
    parts: partsArray(await readJson(path.join(dir, 'parts.json'))),
    poses: await readJson(path.join(dir, 'poses.json')),
    scenes: await readJson(path.join(dir, 'scenes.json')),
    scenesPath: path.relative(root, path.join(dir, 'scenes.json')),
    posesPath: path.relative(root, path.join(dir, 'poses.json'))
  };
}

function audioResolves(audioId, ctx) {
  const id = String(audioId);
  if (id.startsWith('/') || id.startsWith('./')) return null; // checked on disk by caller
  if (ctx.audio.some(a => a && a.id === id)) return true;
  if (ctx.audio.some(a => a && a.filename === id)) return true;
  return ctx.audioFiles.has(id);
}

/**
 * Calibrated angle window for a part, from THIS node's calibration file, only
 * when a profile exists under the character-scoped key: the store's legacy
 * bare-id fallback would hand one character's window to another.
 */
async function angleWindow(characterId, partId, ctx) {
  if (!ctx.calibrationStore || !ctx.calibrationAll) return null;
  if (!ctx.calibrationAll[`${characterId}:${String(partId)}`]) return null;
  try {
    const profile = await ctx.calibrationStore.get(partId, characterId);
    const b = ctx.calibratedBoundsFn(profile);
    if (b && typeof b.minAngle === 'number' && typeof b.maxAngle === 'number') return { min: b.minAngle, max: b.maxAngle };
  } catch (_) { /* no window */ }
  return null;
}

function hazardFor(characterId, ctx) {
  const all = (ctx.hazards && ctx.hazards.characters) || {};
  return all[String(characterId)] || {};
}

function faultFor(characterId, partId, ctx) {
  const c = ctx.faults && ctx.faults.characters && ctx.faults.characters[String(characterId)];
  const f = c && c.parts && c.parts[String(partId)];
  return f && f.status === 'broken' ? f : null;
}

function poseAngle(part) {
  if (!part) return null;
  const v = part.value ?? (part.target && part.target.angleDeg) ?? part.angleDeg;
  return v == null ? null : Number(v);
}

/**
 * Validate one character's scenes and/or poses.
 * @param {object} a
 * @param {number} a.characterId
 * @param {Array}  [a.scenes]   scenes to check (omit to skip scenes)
 * @param {object} [a.poses]    poses file object {characterId, poses:[]} (omit to skip poses)
 * @param {Array}  a.parts      the character's parts.json
 * @param {object} [a.posesForLookup] poses file used to resolve pose steps (defaults to a.poses)
 * @param {object} a.ctx        loadValidationContext() result
 * @param {object} [a.files]    {scenes, poses} display paths
 * @returns {Promise<{errors:Array, warnings:Array}>}
 */
export async function validateCharacterData({ characterId, scenes, poses, parts = [], posesForLookup, ctx, files = {} }) {
  const errors = [];
  const warnings = [];
  const cid = String(characterId);
  const scenesFile = files.scenes || `data/character-${cid}/scenes.json`;
  const posesFile = files.poses || `data/character-${cid}/poses.json`;
  const partById = new Map(partsArray(parts).map(p => [String(p.id), p]));
  const hazard = hazardFor(cid, ctx);
  const ranges = hazard.partAngleRanges || {};
  const exclusive = Array.isArray(hazard.exclusiveParts) ? hazard.exclusiveParts.map(s => s.map(String)) : [];
  const maxMotor = Number.isFinite(Number(hazard.maxMotorSpeed)) ? Number(hazard.maxMotorSpeed) : null;
  const lookupPoses = posesForLookup || poses;
  const poseList = lookupPoses && Array.isArray(lookupPoses.poses) ? lookupPoses.poses : [];
  const poseById = new Map(poseList.filter(p => typeof p.id === 'number').map(p => [p.id, p]));

  const add = (list, where, message) => list.push(Object.assign({ message }, where));

  // --- shared part checks ------------------------------------------------
  async function checkServoAngle(where, partId, angle, { preset = false, presetName = null, jitter = 0, continuous = false } = {}) {
    const range = ranges[String(partId)];
    if (range) {
      if (preset && range.forbidPresets) add(errors, where, `part ${partId} must be driven by an explicit angle inside ${range.min}-${range.max}°, never a preset (${presetName || 'usePreset'})`);
      if (continuous && range.forbidContinuous) add(errors, where, `part ${partId} must never get a continuous spin target`);
      if (!preset && !continuous) {
        if (angle == null || !Number.isFinite(Number(angle))) add(errors, where, `part ${partId} needs a numeric angle inside ${range.min}-${range.max}°`);
        else {
          const a = Number(angle);
          const j = Math.max(0, Number(jitter) || 0);
          if (a < range.min || a > range.max) add(errors, where, `part ${partId} angle ${a}° is outside its hazard window ${range.min}-${range.max}°`);
          else if (j > 0 && (a - j < range.min || a + j > range.max)) add(errors, where, `part ${partId} angle ${a}° ± jitter ${j}° can leave its hazard window ${range.min}-${range.max}° — set jitterDeg so it cannot`);
        }
      }
    }
    if (!preset && !continuous && angle != null && Number.isFinite(Number(angle))) {
      const w = await angleWindow(cid, partId, ctx);
      if (w && (Number(angle) < w.min || Number(angle) > w.max)) add(errors, where, `part ${partId} angle ${angle}° is outside its calibrated window ${w.min}-${w.max}° (this node's calibration)`);
    }
  }

  function checkPartRef(where, partId, stepType) {
    if (partId == null || String(partId).trim() === '') { add(errors, where, `${stepType} step needs a partId`); return null; }
    const part = partById.get(String(partId));
    if (!part) { add(errors, where, `part ${partId} does not exist for character ${cid}`); return null; }
    const allowed = PART_TYPES_FOR_STEP[stepType];
    if (allowed && !allowed.includes(String(part.type))) add(errors, where, `${stepType} step drives part ${partId}, which is a ${part.type}`);
    const fault = faultFor(cid, partId, ctx);
    if (fault) add(warnings, where, `part ${partId} is listed broken in config/physical-faults.json — the executor will skip this (${String(fault.reason || '').slice(0, 80)})`);
    return part;
  }

  function checkMotorSpeed(where, partId, speed, part) {
    if (maxMotor == null || !part || String(part.type) !== 'motor') return;
    if (speed == null) add(errors, where, `motor part ${partId} needs an explicit speed ≤ ${maxMotor}% (the executor default is 50)`);
    else if (Number(speed) > maxMotor) add(errors, where, `motor part ${partId} speed ${speed}% exceeds this character's ${maxMotor}% ceiling`);
  }

  function partsTouchedByStep(step) {
    const t = step.type || (step.poseId != null ? 'pose' : null);
    if (t === 'pose') {
      const pose = poseById.get(parseInt(step.poseId, 10));
      return pose && Array.isArray(pose.parts) ? pose.parts.map(p => String(p.partId)) : [];
    }
    if (t === 'hardware') {
      const p = step.params || {};
      const id = p.partId != null ? p.partId : p.channel;
      return id != null ? [String(id)] : [];
    }
    const id = step.partId != null ? step.partId : step.sensorId;
    return id != null ? [String(id)] : [];
  }

  function checkExclusive(where, partIds, label) {
    const set = new Set(partIds.map(String));
    for (const group of exclusive) {
      const hit = group.filter(id => set.has(id));
      if (hit.length > 1) add(errors, where, `parts ${hit.join(' and ')} must never move together (${label})`);
    }
  }

  // --- poses ---------------------------------------------------------------
  if (poses !== undefined) {
    const pw = (pose, i) => ({ file: posesFile, pose: pose && pose.id != null ? pose.id : `#${i}`, poseName: pose && pose.name });
    if (!poses || typeof poses !== 'object' || Array.isArray(poses)) {
      add(errors, { file: posesFile }, 'poses file must be an object {characterId, poses:[...]}');
    } else {
      if (Number(poses.characterId) !== Number(characterId) || typeof poses.characterId !== 'number') add(errors, { file: posesFile }, `characterId must be the number ${characterId}`);
      if (!Array.isArray(poses.poses)) add(errors, { file: posesFile }, 'poses must be an array');
      const seen = new Set();
      for (const [i, pose] of (Array.isArray(poses.poses) ? poses.poses : []).entries()) {
        const where = pw(pose, i);
        if (!pose || typeof pose !== 'object') { add(errors, where, 'pose must be an object'); continue; }
        if (typeof pose.id !== 'number' || !Number.isInteger(pose.id) || pose.id <= 0) add(errors, where, `pose id must be a positive integer number (got ${JSON.stringify(pose.id)}) — string ids never resolve`);
        else if (seen.has(pose.id)) add(errors, where, `duplicate pose id ${pose.id}`);
        else seen.add(pose.id);
        if (!pose.name || typeof pose.name !== 'string') add(errors, where, 'pose needs a name');
        if (pose.transitionProfile != null && !TRANSITION_PROFILES.has(pose.transitionProfile)) add(errors, where, `transitionProfile "${pose.transitionProfile}" is not one of ${[...TRANSITION_PROFILES].join(', ')}`);
        if (pose.weight != null && !(typeof pose.weight === 'number' && pose.weight > 0)) add(errors, where, `weight must be a number > 0 (got ${JSON.stringify(pose.weight)}); omit it for the idle loop's default of 10`);
        if (!Array.isArray(pose.parts) || pose.parts.length === 0) { add(errors, where, 'pose needs at least one part'); continue; }
        for (const [j, part] of pose.parts.entries()) {
          const pwhere = Object.assign({}, where, { part: j });
          if (typeof part.partId !== 'number') add(errors, pwhere, `partId must be a number in poses.json (got ${JSON.stringify(part.partId)})`);
          const def = partById.get(String(part.partId));
          if (!def) { add(errors, pwhere, `part ${part.partId} does not exist for character ${cid}`); continue; }
          if (!part.type || typeof part.type !== 'string') add(errors, pwhere, 'part needs a type');
          else if (!POSE_PART_TYPES.has(part.type)) add(errors, pwhere, `pose part type "${part.type}" is not one the pose engine drives`);
          if (!part.target || typeof part.target !== 'object') { add(errors, pwhere, 'part needs a target object'); continue; }
          const fault = faultFor(cid, part.partId, ctx);
          if (fault) add(warnings, pwhere, `part ${part.partId} is listed broken — the pose engine drops it`);
          if (part.type === 'servo') {
            const angle = poseAngle(part);
            const continuous = !!part.target.continuous;
            if (angle == null && !continuous) add(errors, pwhere, `servo part ${part.partId} needs target.angleDeg or target.continuous`);
            const jitter = part.jitterDeg != null ? part.jitterDeg : pose.jitterDeg;
            await checkServoAngle(pwhere, part.partId, angle, { continuous, jitter });
          }
          if (part.type === 'motor') checkMotorSpeed(pwhere, part.partId, part.target.speed, def);
          const dur = Number(part.target.duration ?? part.target.durationMs);
          if ((part.type === 'motor' || part.type === 'linear_actuator') && Number.isFinite(dur) && dur > WRAPPER_CAP_MS) add(errors, pwhere, `duration ${dur} ms exceeds the 30 s hardware wrapper cap`);
        }
        checkExclusive(where, pose.parts.map(p => String(p.partId)), 'in one pose');
      }
    }
  }

  // --- scenes --------------------------------------------------------------
  if (scenes !== undefined) {
    if (!Array.isArray(scenes)) {
      add(errors, { file: scenesFile }, 'scenes file must be an array');
    } else {
      const seen = new Set();
      for (const [si, scene] of scenes.entries()) {
        const sw = { file: scenesFile, scene: scene && scene.id != null ? scene.id : `#${si}`, sceneName: scene && scene.name };
        if (!scene || typeof scene !== 'object') { add(errors, sw, 'scene must be an object'); continue; }
        if (!/^\d+$/.test(String(scene.id)) || parseInt(scene.id, 10) <= 0) add(errors, sw, `scene id must be a positive integer (got ${JSON.stringify(scene.id)})`);
        else if (seen.has(parseInt(scene.id, 10))) add(errors, sw, `duplicate scene id ${scene.id}`);
        else seen.add(parseInt(scene.id, 10));
        if (!scene.name || typeof scene.name !== 'string') add(errors, sw, 'scene needs a name');
        if (!Array.isArray(scene.steps)) { add(errors, sw, 'scene needs a steps array'); continue; }

        // Concurrent groups: a run of concurrent steps overlaps the next
        // sequential step (executor semantics), so they move together.
        let group = [];
        const flushGroup = () => {
          if (group.length > 1) {
            const touched = group.flatMap(g => partsTouchedByStep(g.step));
            checkExclusive(Object.assign({}, sw, { step: group.map(g => g.index).join('+') }), touched, 'in one concurrent group');
          }
          group = [];
        };

        for (const [i, step] of scene.steps.entries()) {
          const where = Object.assign({}, sw, { step: i });
          if (!step || typeof step !== 'object') { add(errors, where, 'step must be an object'); continue; }
          const t = step.type || (step.poseId != null ? 'pose' : null);
          group.push({ step, index: i });
          if (!step.concurrent) flushGroup();
          if (!t) { add(errors, where, 'step needs a type'); continue; }
          if (!DISPATCHABLE_STEP_TYPES.has(t)) {
            add(errors, where, t === 'linear_actuator' ? 'step type "linear_actuator" has no dispatcher — use "linear-actuator"' : `unknown step type "${t}"`);
            continue;
          }
          checkExclusive(where, partsTouchedByStep(step), 'in one step');
          await checkStep(step, t, where);
        }
        flushGroup();
      }
    }
  }

  async function checkStep(step, t, where) {
    switch (t) {
      case 'servo': {
        checkPartRef(where, step.partId, 'servo');
        const preset = !!(step.usePreset && step.presetName);
        await checkServoAngle(where, step.partId, step.angle, { preset, presetName: step.presetName });
        if (!preset && (step.angle == null || !Number.isFinite(Number(step.angle)))) add(errors, where, 'servo step needs a numeric angle (or usePreset + presetName)');
        if (Number(step.duration) > 60000) add(warnings, where, `servo duration ${step.duration} ms is unusually long`);
        break;
      }
      case 'motor':
      case 'linear-actuator': {
        const part = checkPartRef(where, step.partId, t);
        if (t === 'motor') checkMotorSpeed(where, step.partId, step.usePreset ? (step.speed ?? null) : step.speed, part);
        const d = step.duration != null ? Number(step.duration) : 1000;
        if (!Number.isFinite(d) || d <= 0) add(errors, where, `duration must be a positive number of ms (got ${JSON.stringify(step.duration)})`);
        else if (d > WRAPPER_CAP_MS) add(errors, where, `duration ${d} ms exceeds the 30 s hardware wrapper cap — split it into steps`);
        if (t === 'linear-actuator' && step.direction != null && !['extend', 'retract'].includes(step.direction)) add(errors, where, `direction must be extend or retract (got "${step.direction}")`);
        break;
      }
      case 'light':
      case 'led': {
        checkPartRef(where, step.partId, t);
        if (step.state != null && !['on', 'off'].includes(step.state)) add(errors, where, `state "${step.state}" turns the light OFF — only "on" lights it; use "on" or "off"`);
        if (Number(step.duration) > WRAPPER_CAP_MS) add(errors, where, `light duration ${step.duration} ms exceeds the 30 s wrapper cap`);
        break;
      }
      case 'sensor': {
        checkPartRef(where, step.partId != null ? step.partId : step.sensorId, 'sensor');
        if (Number(step.timeout) > 5 * 60 * 1000) add(warnings, where, `sensor timeout ${step.timeout} ms holds the scene a long time (a timeout aborts the scene)`);
        break;
      }
      case 'pose': {
        const id = parseInt(step.poseId, 10);
        if (!id) add(errors, where, 'pose step needs a poseId');
        else if (!poseById.has(id)) add(errors, where, `pose ${step.poseId} does not exist for character ${cid}`);
        break;
      }
      case 'audio': {
        if (step.audioId == null || String(step.audioId).trim() === '') {
          add(errors, where, step.audioFile != null ? 'audio step uses "audioFile"; the executor reads "audioId"' : 'audio step needs an audioId');
          break;
        }
        const id = String(step.audioId);
        const r = audioResolves(id, ctx);
        if (r === null) { if (!(await exists(path.resolve(id)))) add(errors, where, `audio path ${id} does not exist`); }
        else if (!r) add(errors, where, `audioId "${id}" is not in the audio library (by id or filename)`);
        break;
      }
      case 'sayThis': {
        const text = String(step.text || step.say || '').trim();
        if (!text) add(errors, where, 'sayThis needs text');
        else if (text.length > MAX_SAY_CHARS) add(warnings, where, `line is ${text.length} characters — long lines lecture`);
        break;
      }
      case 'askAI':
        if (!String(step.question || step.text || '').trim()) add(errors, where, 'askAI needs a question');
        break;
      case 'goblin-video': {
        const ref = step.goblinId != null && String(step.goblinId).trim() !== '' ? step.goblinId : step.goblinName;
        const g = resolveGoblinInRegistry(ref, ctx.goblins);
        if (g.error) { add(errors, where, `goblin-video: ${g.error}`); break; }
        if (!step.videoId) { add(errors, where, 'goblin-video needs a videoId (a filename on that Goblin)'); break; }
        const manifest = ctx.goblinManifests.get(g.goblin.id);
        if (!manifest) add(warnings, where, `no clip manifest for ${g.goblin.name || g.goblin.id} — cannot verify "${step.videoId}" is on it`);
        else if (!manifest.has(String(step.videoId))) add(errors, where, `"${step.videoId}" is not in ${g.goblin.name || g.goblin.id}'s clip manifest`);
        if (step.loop === true || (step.options && step.options.loop === true)) add(warnings, where, 'loop:true replaces that Goblin\'s whole queue until something stops it — use play-once with waitMs');
        if (step.waitMs != null && (!(Number(step.waitMs) >= 0) || Number(step.waitMs) > MAX_GOBLIN_WAIT_MS)) add(errors, where, `waitMs must be 0-${MAX_GOBLIN_WAIT_MS}`);
        break;
      }
      case 'wait':
      case 'delay': {
        const d = Number(step.duration != null ? step.duration : step.durationMs);
        if (!Number.isFinite(d) || d < 0) add(errors, where, 'wait needs a duration in ms');
        else if (d > MAX_WAIT_MS) add(errors, where, `wait ${d} ms is longer than 10 minutes`);
        break;
      }
      case 'hardware': {
        add(warnings, where, 'legacy "hardware" step — prefer a typed step (servo, motor, ...)');
        const p = step.params || {};
        const id = p.partId != null ? p.partId : p.channel;
        if (step.action === 'move_servo') {
          if (id == null) add(errors, where, 'hardware move_servo without params.partId falls back to a hard-coded part');
          else await checkServoAngle(where, id, p.position != null ? p.position : p.angle);
        }
        if (id != null && !partById.has(String(id))) add(errors, where, `part ${id} does not exist for character ${cid}`);
        if (step.action === 'move_motor' && id != null) checkMotorSpeed(where, id, p.speed, partById.get(String(id)));
        break;
      }
      case 'jaw-animation':
        if (step.action != null && !['enable', 'disable'].includes(step.action)) add(warnings, where, `jaw-animation action "${step.action}" is treated as disable`);
        break;
      case 'head-tracking':
        if (step.action != null && !['start', 'stop'].includes(step.action)) add(errors, where, `head-tracking action must be start or stop`);
        break;
      case 'fleet-scene':
      case 'fleet-say':
      case 'fleet-audio':
      case 'fleet-stop-audio':
      case 'fleet-mode':
        await checkFleetStep(step, t, where);
        break;
      default:
        break;
    }
  }

  async function checkFleetStep(step, t, where) {
    const r = resolveFleetNodes(step.node, ctx.registry, { allowAll: t !== 'fleet-scene' });
    if (r.error) { add(errors, where, `${t}: ${r.error} (config/animatronics.json)`); return; }
    if (t === 'fleet-scene') {
      const raw = step.scene != null ? step.scene : (step.sceneId != null ? step.sceneId : step.sceneName);
      if (raw == null || String(raw).trim() === '') { add(errors, where, 'fleet-scene needs a scene (id or name)'); return; }
      if (step.timeoutMs != null && (!(Number(step.timeoutMs) > 0) || Number(step.timeoutMs) > MAX_FLEET_TIMEOUT_MS)) add(errors, where, `timeoutMs must be 1-${MAX_FLEET_TIMEOUT_MS}`);
      const node = r.nodes[0];
      const targetCid = String(node.characterId != null ? node.characterId : node.id);
      // The target's library: the scenes under test when it is this character,
      // otherwise that character's file in this repo (node-local, may lag).
      let list = null;
      if (targetCid === cid && Array.isArray(scenes)) list = scenes;
      else list = await readJson(path.join(ctx.root, 'data', `character-${targetCid}`, 'scenes.json'));
      if (!Array.isArray(list)) { add(warnings, where, `cannot check scene "${raw}" — no data/character-${targetCid}/scenes.json in this repo`); return; }
      const found = /^\d+$/.test(String(raw).trim())
        ? list.some(s => parseInt(s.id, 10) === parseInt(raw, 10))
        : list.filter(s => String(s.name || '').trim().toLowerCase() === String(raw).trim().toLowerCase()).length === 1;
      if (!found) add(errors, where, `fleet-scene: scene "${raw}" not found in data/character-${targetCid}/scenes.json`);
    } else if (t === 'fleet-say') {
      if (!String(step.text || step.say || '').trim()) add(errors, where, 'fleet-say needs text');
    } else if (t === 'fleet-audio') {
      if (step.audioId == null || String(step.audioId).trim() === '') add(errors, where, 'fleet-audio needs an audioId');
      else if (!audioResolves(String(step.audioId), ctx)) add(errors, where, `fleet-audio: "${step.audioId}" is not in the audio library`);
    } else if (t === 'fleet-mode') {
      if (!['hold', 'release'].includes(String(step.mode || '').toLowerCase())) add(errors, where, "fleet-mode: mode must be 'hold' or 'release'");
    }
  }

  return { errors, warnings };
}

/** Load from disk and validate one character's scenes and poses. */
export async function validateCharacter(characterId, { root = APP_ROOT, ctx = null, calibration = true } = {}) {
  const context = ctx || await loadValidationContext({ root, calibration });
  const f = await loadCharacterFiles(characterId, root);
  return validateCharacterData({
    characterId,
    scenes: f.scenes == null ? [] : f.scenes,
    poses: f.poses == null ? { characterId: Number(characterId), poses: [] } : f.poses,
    parts: f.parts,
    ctx: context,
    files: { scenes: f.scenesPath, poses: f.posesPath }
  });
}

/** `file:scene 101 "Name":step 4 — message` */
export function formatIssue(issue) {
  const parts = [issue.file || '?'];
  if (issue.scene != null) parts.push(`scene ${issue.scene}${issue.sceneName ? ` "${issue.sceneName}"` : ''}`);
  if (issue.pose != null) parts.push(`pose ${issue.pose}${issue.poseName ? ` "${issue.poseName}"` : ''}`);
  if (issue.step != null) parts.push(`step ${issue.step}`);
  if (issue.part != null) parts.push(`part[${issue.part}]`);
  return `${parts.join(':')} — ${issue.message}`;
}

export default { validateCharacter, validateCharacterData, loadValidationContext, loadCharacterFiles, formatIssue, resolveGoblinInRegistry, DISPATCHABLE_STEP_TYPES };
