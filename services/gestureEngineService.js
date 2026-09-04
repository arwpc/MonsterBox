/**
 * Gesture Engine — conversation-driven physical gestures.
 *
 * Implements docs/development/GESTURE-ENGINE-SPEC.md. This is a thin coordination
 * layer over the existing motion stack: it introduces no new motion primitives and
 * no new hardware. Recipes are data (data/character-{id}/gestures.json); execution
 * goes through priorityManager for arbitration, transitionEngine for easing, and
 * the hardware service for lights.
 *
 * Two rules govern everything here:
 *
 *   1. Concurrency is the point. A gesture that moves one part at a time is a
 *      calibration exercise, not a gesture. Steps run CONCURRENTLY, offset by
 *      delayMs — the schema makes sequential motion impossible to express by
 *      accident, and the loader rejects single-part recipes.
 *
 *   2. The conversation must be bulletproof against the body. Motion is
 *      fire-and-forget: a missing part, a denied claim, a bad recipe or a dead
 *      servo must never delay, block, or surface in the conversation. Every
 *      failure path here ends in "log once and carry on".
 *
 * Feature flag: a character with no gestures.json is a silent no-op, so config can
 * ship before recipes and recipes before hardware (spec §10.4).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIORITY, claimServo, releaseServo } from './movement/priorityManager.js';
import { transitionServos } from './movement/transitionEngine.js';
import { getPoseById } from './movement/poseLibrary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

const OWNER = 'gesture';
const SCHEMA_VERSION = 1;

// Recipes are cached per character and invalidated by file mtime, so editing a
// recipe on a live node takes effect without a restart but costs one stat() —
// not a watcher, which the SD card discipline in CLAUDE.md rules out.
const cache = new Map(); // characterId -> { mtimeMs, gestures: Map, errors: [] }

// Per-conversation state: cooldowns and caps that stop a character doing the same
// move every turn, which reads as a toy.
const conversations = new Map(); // characterId -> { startedAt, counts: Map, lastFired: Map }

// ---------------------------------------------------------------- loading

function gesturesPath(characterId) {
    return path.join(APP_ROOT, 'data', `character-${characterId}`, 'gestures.json');
}

/**
 * Calibrated bounds for a part, from the same sources the hardware layer trusts:
 * the node-local calibration profile, tightened by the committed safety limits.
 * Returns null when the part has no known window — in which case a raw angle
 * target is refused outright, because inventing bounds for unmeasured hardware is
 * how a part ends up looking calibrated when it never was.
 */
async function boundsFor(characterId, partId) {
    let minAngle = null, maxAngle = null;

    try {
        const raw = await fs.readFile(path.join(APP_ROOT, 'data', 'calibration_profiles.json'), 'utf8');
        const profiles = JSON.parse(raw);
        const profile = profiles[`${characterId}:${partId}`];
        const b = profile && profile.bounds;
        if (b && typeof b.minAngle === 'number' && typeof b.maxAngle === 'number') {
            minAngle = b.minAngle;
            maxAngle = b.maxAngle;
        }
    } catch (_) { /* no profile store on this node yet */ }

    try {
        const raw = await fs.readFile(path.join(APP_ROOT, 'config', 'hardware-safety.json'), 'utf8');
        const safety = JSON.parse(raw);
        const part = safety?.characters?.[String(characterId)]?.parts?.[String(partId)];
        if (part) {
            if (part.blockAllMotion) return { blocked: true, reason: part.blockReason || 'blocked by safety config' };
            // The more restrictive value always wins.
            if (typeof part.minAngle === 'number') minAngle = minAngle == null ? part.minAngle : Math.max(minAngle, part.minAngle);
            if (typeof part.maxAngle === 'number') maxAngle = maxAngle == null ? part.maxAngle : Math.min(maxAngle, part.maxAngle);
        }
    } catch (_) { /* no safety file — bounds stay as calibrated */ }

    if (minAngle == null || maxAngle == null) return null;
    return { minAngle, maxAngle };
}

/** Which shared power rail a part sits on, if any. Parts on one rail must never overlap. */
async function powerGroupFor(characterId, partId) {
    try {
        const raw = await fs.readFile(path.join(APP_ROOT, 'config', 'hardware-safety.json'), 'utf8');
        const safety = JSON.parse(raw);
        return safety?.characters?.[String(characterId)]?.parts?.[String(partId)]?.powerGroup || null;
    } catch (_) {
        return null;
    }
}

/** [start, end) of a step's motion, in ms from gesture start. */
function stepWindow(step) {
    const start = Number(step.delayMs) || 0;
    return [start, start + (Number(step.durationMs) || 0)];
}

function windowsOverlap(a, b) {
    return a[0] < b[1] && b[0] < a[1];
}

/**
 * Validate one recipe. Returns an array of human-readable errors; empty means the
 * recipe is safe to run. Rejection is deliberately loud at LOAD time rather than
 * silent at run time — an unsafe recipe should never get as far as the hardware.
 */
async function validateGesture(characterId, g) {
    const errors = [];
    const id = g && g.id;
    if (!id || typeof id !== 'string') return ['gesture is missing a string id'];

    const steps = Array.isArray(g.steps) ? g.steps : [];
    if (!steps.length) errors.push(`${id}: has no steps`);

    // Rule 1 — concurrency is mandatory. Two moving parts, or one part plus a
    // light. Anything less is a calibration exercise, not a gesture.
    const distinctParts = new Set(steps.map(s => String(s.partId ?? s.pose ?? '')).filter(Boolean));
    if (distinctParts.size < 2) {
        errors.push(`${id}: needs at least two distinct parts (or one part + one light) — got ${distinctParts.size}. A single-part gesture reads as a machine.`);
    }

    for (const [i, step] of steps.entries()) {
        const where = `${id} step ${i}`;
        const [start, end] = stepWindow(step);
        if (end <= start && step.type !== 'light') {
            errors.push(`${where}: durationMs must be > 0`);
        }

        if (step.pose != null) {
            // Pose references are preferred — they are pose-author-validated.
            const pose = await getPoseById(characterId, step.pose).catch(() => null);
            if (!pose) errors.push(`${where}: references unknown pose "${step.pose}"`);
            continue;
        }

        if (step.type === 'light') {
            if (typeof step.level !== 'number' || step.level < 0 || step.level > 100) {
                errors.push(`${where}: light level must be 0-100`);
            }
            continue;
        }

        if (step.partId == null) { errors.push(`${where}: needs a partId, a pose, or type:"light"`); continue; }
        if (typeof step.target !== 'number') { errors.push(`${where}: raw servo step needs a numeric target`); continue; }

        // Rule 2 — raw targets must sit inside the calibrated, safety-tightened window.
        const b = await boundsFor(characterId, step.partId);
        if (b && b.blocked) {
            errors.push(`${where}: part ${step.partId} is blocked by safety config (${b.reason})`);
        } else if (!b) {
            errors.push(`${where}: part ${step.partId} has no calibrated bounds — reference a validated pose instead of a raw target`);
        } else if (step.target < b.minAngle || step.target > b.maxAngle) {
            errors.push(`${where}: target ${step.target} is outside part ${step.partId}'s calibrated window ${b.minAngle}-${b.maxAngle}`);
        }
    }

    // Rule 3 — parts sharing a power rail must never be energized concurrently.
    // The hardware layer already serializes them, but serializing at run time
    // silently destroys the timing the recipe author intended, so a recipe that
    // asks for the impossible is rejected here instead of quietly reinterpreted.
    const servoSteps = steps.filter(s => s.partId != null && s.type !== 'light');
    for (let i = 0; i < servoSteps.length; i++) {
        for (let j = i + 1; j < servoSteps.length; j++) {
            const [gi, gj] = await Promise.all([
                powerGroupFor(characterId, servoSteps[i].partId),
                powerGroupFor(characterId, servoSteps[j].partId)
            ]);
            if (gi && gi === gj && windowsOverlap(stepWindow(servoSteps[i]), stepWindow(servoSteps[j]))) {
                errors.push(
                    `${id}: parts ${servoSteps[i].partId} and ${servoSteps[j].partId} share power rail "${gi}" ` +
                    `but their step windows overlap — stagger them so they never draw at once`
                );
            }
        }
    }

    return errors;
}

/**
 * Load and validate a character's gesture vocabulary. Never throws: a missing file
 * is the feature flag, and a broken file disables gestures for that character
 * rather than taking the conversation with it.
 */
export async function loadGestures(characterId) {
    const file = gesturesPath(characterId);

    let stat;
    try {
        stat = await fs.stat(file);
    } catch (_) {
        cache.set(characterId, { mtimeMs: 0, gestures: new Map(), errors: [], absent: true });
        return cache.get(characterId);
    }

    const cached = cache.get(characterId);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached;

    const entry = { mtimeMs: stat.mtimeMs, gestures: new Map(), errors: [], absent: false };
    try {
        const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
        if (parsed.version !== SCHEMA_VERSION) {
            entry.errors.push(`unsupported gestures.json version ${parsed.version} (expected ${SCHEMA_VERSION})`);
        }
        for (const g of parsed.gestures || []) {
            const errs = await validateGesture(characterId, g);
            if (errs.length) { entry.errors.push(...errs); continue; }
            entry.gestures.set(g.id, g);
        }
    } catch (err) {
        entry.errors.push(`could not read gestures.json: ${err.message}`);
    }

    if (entry.errors.length) {
        console.warn(`[GestureEngine] character ${characterId}: ${entry.gestures.size} gesture(s) loaded, ${entry.errors.length} rejected:`);
        for (const e of entry.errors) console.warn(`  ✗ ${e}`);
    } else {
        console.log(`[GestureEngine] character ${characterId}: ${entry.gestures.size} gesture(s) loaded`);
    }

    cache.set(characterId, entry);
    return entry;
}

// ---------------------------------------------------------------- conversation state

export function startConversation(characterId) {
    conversations.set(characterId, { startedAt: Date.now(), counts: new Map(), lastFired: new Map() });
}

export function endConversation(characterId) {
    conversations.delete(characterId);
}

function conversationState(characterId) {
    if (!conversations.has(characterId)) startConversation(characterId);
    return conversations.get(characterId);
}

// ---------------------------------------------------------------- execution

/**
 * Lights are gesture instruments, not props — the Hand of Azura leading a glow by
 * 200 ms is what makes the arm that follows read as intentional.
 *
 * Uses the same control path as the scene executor: light parts take 'turnOn' /
 * 'turnOff' actions through controlPart, NOT a dedicated light function. An
 * earlier guess at a controlLight() helper silently failed every light step, and
 * since most recipes pair one servo with one light, that quietly reduced them to
 * the single-part motion this whole design exists to refuse.
 */
async function setLight(characterId, partId, level) {
    const hw = await import('./hardwareService/index.js').then(m => m.default || m);
    if (typeof hw.controlPart !== 'function') {
        throw new Error('hardware service exposes no controlPart');
    }
    const result = await hw.controlPart(
        String(partId),
        level > 0 ? 'turnOn' : 'turnOff',
        { brightness: level, duration: 0 },
        { characterId }
    );
    if (!result || !result.success) {
        throw new Error((result && result.error) || 'light control failed');
    }
    return result;
}

/**
 * Resolve a step into concrete servo targets. A pose reference expands into that
 * pose's parts; a raw step is already concrete.
 */
async function resolveServoTargets(characterId, step) {
    if (step.pose != null) {
        const pose = await getPoseById(characterId, step.pose).catch(() => null);
        if (!pose) return [];
        return (pose.parts || [])
            .map(p => ({ partId: String(p.partId), value: p.target?.angleDeg ?? p.value }))
            .filter(p => p.value != null);
    }
    if (step.partId != null && typeof step.target === 'number') {
        return [{ partId: String(step.partId), value: step.target }];
    }
    return [];
}

/**
 * Run one step at its scheduled offset. Resolves when the step's motion is issued
 * and eased; a failure resolves too, carrying the reason, because a partial
 * gesture is fine and lifelike but a rejected promise is not.
 */
async function runStep(characterId, step, claimed) {
    const delay = Number(step.delayMs) || 0;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    try {
        if (step.type === 'light') {
            await setLight(characterId, step.partId, step.level);
            return { ok: true, step };
        }

        const targets = (await resolveServoTargets(characterId, step))
            .filter(t => claimed.has(t.partId));
        if (!targets.length) return { ok: false, step, reason: 'no claimable parts' };

        // transitionServos silently drops parts declared physically broken and
        // returns only the ones it actually drove ([] when every target was
        // refused). Without comparing the two, a step whose only part is broken
        // returned ok:true and the gesture reported a clean 3/3 while a limb
        // never moved — the same "one working part masks a dead one" failure the
        // pose engine was fixed for in v9.0.0.
        const driven = await transitionServos(characterId, targets, {
            durationMs: Number(step.durationMs) || 800,
            easing: step.easing || 'ease_in_out'
        });
        const drivenCount = Array.isArray(driven) ? driven.length : targets.length;
        const refused = targets.length - drivenCount;
        if (drivenCount === 0) {
            return { ok: false, step, refused, reason: 'every target part is declared physically broken' };
        }
        return { ok: true, step, refused };
    } catch (err) {
        return { ok: false, step, reason: err.message };
    }
}

/**
 * Perform a named gesture. Fire-and-forget by contract: this never throws and
 * never blocks speech. Returns a small result object for logging and tests.
 *
 * @param {number|string} characterId
 * @param {string} gestureId
 * @param {object} [opts]
 * @param {boolean} [opts.kidMode] - suppress gestures flagged kidSafe:false
 */
export async function performGesture(characterId, gestureId, opts = {}) {
    const claimed = new Set();
    try {
        const entry = await loadGestures(characterId);
        if (entry.absent) return { performed: false, reason: 'no gestures.json for this character' };

        const gesture = entry.gestures.get(gestureId);
        if (!gesture) return { performed: false, reason: `unknown gesture "${gestureId}"` };

        // Kid mode: a gesture that exists to make adults jump has no business
        // firing at a five-year-old. Suppression is silent, as the spec requires.
        if (opts.kidMode && gesture.kidSafe === false) {
            return { performed: false, reason: 'suppressed in kid mode' };
        }

        const state = conversationState(characterId);
        const now = Date.now();

        const last = state.lastFired.get(gestureId) || 0;
        if (gesture.cooldownMs && now - last < gesture.cooldownMs) {
            return { performed: false, reason: 'cooling down' };
        }
        const count = state.counts.get(gestureId) || 0;
        if (gesture.maxPerConversation && count >= gesture.maxPerConversation) {
            return { performed: false, reason: 'per-conversation cap reached' };
        }

        // Claim what we can at L3. Parts held by something more important (a scene,
        // the jaw during speech) are simply skipped — partial execution is fine.
        const wanted = new Set();
        for (const step of gesture.steps || []) {
            if (step.type === 'light') continue;
            for (const t of await resolveServoTargets(characterId, step)) wanted.add(t.partId);
        }
        for (const partId of wanted) {
            if (claimServo(partId, OWNER, PRIORITY.GESTURE_SEMANTIC).granted) claimed.add(partId);
        }

        state.lastFired.set(gestureId, now);
        state.counts.set(gestureId, count + 1);

        // Steps run concurrently, offset by delayMs. This is the whole design:
        // the head leads, the body follows, and nothing waits its turn.
        const results = await Promise.all(
            (gesture.steps || []).map(step => runStep(characterId, step, claimed))
        );

        if (gesture.holdMs) await new Promise(r => setTimeout(r, gesture.holdMs));

        // The return is part of the gesture — slower and lazier than the onset,
        // and it lands in ambient rather than snapping to a hard neutral.
        const ret = gesture.return || {};
        if (ret.mode === 'pose' && ret.pose != null) {
            const targets = (await resolveServoTargets(characterId, { pose: ret.pose }))
                .filter(t => claimed.has(t.partId));
            if (targets.length) {
                await transitionServos(characterId, targets, {
                    durationMs: Number(ret.durationMs) || 1800,
                    easing: ret.easing || 'ease_in_out'
                }).catch(() => { /* the return failing is not worth a second log line */ });
            }
        }

        const ok = results.filter(r => r.ok).length;
        const partsRefused = results.reduce((n, r) => n + (r.refused || 0), 0);
        // One line per gesture — no per-tick logging, per the SD-card discipline.
        console.log(`[GestureEngine] ${gestureId} on character ${characterId}: ${ok}/${results.length} steps, ${claimed.size} part(s) claimed` +
            (partsRefused ? `, ${partsRefused} part(s) refused as physically broken` : ''));
        // Body awareness: note the performed gesture. Fire-and-forget.
        import('./bodyStateService.js')
            .then(m => (m.default || m).recordGesture(characterId, gestureId, { source: 'gesture-engine' }))
            .catch(() => { /* belief tracking is optional */ });
        return {
            performed: true, gestureId,
            stepsOk: ok, stepsTotal: results.length,
            partsRefused,
            partialFailure: ok < results.length || partsRefused > 0,
            claimed: [...claimed]
        };
    } catch (err) {
        console.warn(`[GestureEngine] ${gestureId} on character ${characterId} failed: ${err.message}`);
        return { performed: false, reason: err.message };
    } finally {
        // Hand the parts back to the ambient layer no matter how we got here.
        for (const partId of claimed) releaseServo(partId, OWNER);
    }
}

// ---------------------------------------------------------------- authoring (CRUD)

/**
 * Read the raw vocabulary file for editing — every recipe as authored, including
 * ones that currently fail validation.
 *
 * loadGestures() deliberately DROPS invalid recipes so the runtime only ever
 * performs things it trusts. An editor that read through it would silently make
 * a broken recipe disappear the moment you opened the page, and "save" would
 * then delete it. Authoring reads the file directly.
 */
export async function readVocabulary(characterId) {
    const file = gesturesPath(characterId);
    try {
        const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
        return {
            version: parsed.version || SCHEMA_VERSION,
            gestures: Array.isArray(parsed.gestures) ? parsed.gestures : [],
            absent: false
        };
    } catch (err) {
        if (err.code === 'ENOENT') return { version: SCHEMA_VERSION, gestures: [], absent: true };
        throw new Error(`gestures.json is unreadable: ${err.message}`);
    }
}

/**
 * Serialize the vocabulary keeping the authored one-line-per-step style.
 *
 * These files are hand-edited, committed, and rsynced to every node. Plain
 * two-space stringify explodes each step onto seven lines, so editing ONE
 * capability produced a 164-line diff in which the real change was invisible.
 * Collapsing innermost (non-nested) objects back onto one line keeps a save
 * diff the size of the edit.
 */
function serializeVocabulary(payload) {
    const pretty = JSON.stringify(payload, null, 2);
    // Only objects containing no further braces or brackets are collapsed, so
    // this can never join two structures onto one line.
    const collapsed = pretty.replace(
        /\{\s*\n\s*([^{}\[\]]+?)\n\s*\}/g,
        (whole, inner) => {
            const oneLine = '{ ' + inner.split('\n').map(l => l.trim()).join(' ') + ' }';
            return oneLine.length <= 140 ? oneLine : whole;
        }
    );
    return collapsed + '\n';
}

async function writeVocabulary(characterId, gestures) {
    const file = gesturesPath(characterId);
    await fs.mkdir(path.dirname(file), { recursive: true });

    // Preserve every other top-level key. These files carry a hand-written
    // `_comment` block recording WHY a vocabulary is shaped the way it is —
    // which parts were dead when it was authored, which share a fused rail —
    // and rewriting the file as {version, gestures} silently deletes it. That
    // note is the most expensive thing in the file; the recipes can be rebuilt
    // from it, not the other way round.
    let existing = {};
    try {
        existing = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (_) {
        // New file — nothing to preserve.
    }
    const payload = { ...existing, version: SCHEMA_VERSION, gestures };
    await fs.writeFile(file, serializeVocabulary(payload), 'utf8');
    // loadGestures() caches on mtime, so a fresh stat is enough to pick this up —
    // but dropping the entry makes the next read deterministic rather than
    // dependent on filesystem timestamp granularity.
    cache.delete(characterId);
    cache.delete(String(characterId));
    cache.delete(Number(characterId));
    return payload;
}

/**
 * Create or replace one capability, refusing anything the RUNTIME would refuse.
 *
 * The save gate is validateGesture() itself — the same function loadGestures()
 * applies — so the editor cannot persist a recipe that would then vanish at load
 * time. That is the whole point: a saved capability is a performable capability.
 *
 * @returns {{ok:boolean, errors?:string[], gesture?:object, created?:boolean}}
 */
export async function saveGesture(characterId, gesture) {
    if (!gesture || typeof gesture.id !== 'string' || !gesture.id.trim()) {
        return { ok: false, errors: ['gesture is missing a string id'] };
    }
    const errors = await validateGesture(characterId, gesture);
    if (errors.length) return { ok: false, errors };

    const vocab = await readVocabulary(characterId);
    const idx = vocab.gestures.findIndex(g => g.id === gesture.id);
    const created = idx === -1;
    if (created) vocab.gestures.push(gesture);
    else vocab.gestures[idx] = gesture;

    await writeVocabulary(characterId, vocab.gestures);
    return { ok: true, gesture, created };
}

/** Remove one capability. Reports honestly when there was nothing to remove. */
export async function deleteGesture(characterId, gestureId) {
    const vocab = await readVocabulary(characterId);
    const next = vocab.gestures.filter(g => g.id !== gestureId);
    if (next.length === vocab.gestures.length) {
        return { ok: false, errors: [`no capability with id "${gestureId}"`] };
    }
    await writeVocabulary(characterId, next);
    return { ok: true, deleted: gestureId };
}

/**
 * Dry-run a candidate recipe without saving it, so the editor can show why a
 * recipe is refused before the operator commits to it.
 */
export async function validateGestureDraft(characterId, gesture) {
    const errors = await validateGesture(characterId, gesture);
    return { ok: errors.length === 0, errors };
}

/** The vocabulary a character can actually perform right now — for the UI and for tests. */
export async function listGestures(characterId) {
    const entry = await loadGestures(characterId);
    return {
        available: [...entry.gestures.values()].map(g => ({
            id: g.id, label: g.label, intent: g.intent, kidSafe: g.kidSafe !== false,
            // What a GUEST can say to ask for this capability. The agent matches on
            // `intent`; a visitor matches on these. One record, two audiences.
            phrases: Array.isArray(g.phrases) ? g.phrases : []
        })),
        rejected: entry.errors,
        enabled: !entry.absent
    };
}

/**
 * Route an ElevenLabs client-tool call to a gesture. The agent calls a tool named
 * `gesture` with a `gesture_id`; motion never blocks speech, so this deliberately
 * does not await the gesture before returning.
 */
export function handleAgentToolCall(characterId, toolName, parameters = {}, opts = {}) {
    if (toolName !== 'gesture') return { handled: false };
    const gestureId = parameters.gesture_id || parameters.gestureId;
    if (!gestureId) return { handled: false, reason: 'no gesture_id' };

    // AI Motion owns "may this character move as it speaks". This is the
    // agent-chosen trigger. Motion must never block speech, so the check is
    // folded into the same fire-and-forget chain as the gesture itself rather
    // than making the tool call await a file read.
    import('./aiMotionSuperPowerService.js')
        .then(async ({ readAiMotionConfig }) => {
            const aiMotion = await readAiMotionConfig(characterId);
            if (!aiMotion.enabled || !aiMotion.triggers.agentGesture) {
                console.log(`[GestureEngine] ${gestureId} withheld — AI Motion agent-gesture trigger is off for character ${characterId}`);
                return;
            }
            // kidSafeOnly is an operator-set floor: when it is on, a recipe
            // flagged kidSafe:false is suppressed no matter who asked for it.
            const kidMode = opts.kidMode || aiMotion.permissions.kidSafeOnly === true;
            return performGesture(characterId, gestureId, { ...opts, kidMode });
        })
        .catch(() => { /* already logged */ });

    return { handled: true, gestureId };
}

export default {
    loadGestures,
    listGestures,
    readVocabulary,
    saveGesture,
    deleteGesture,
    validateGestureDraft,
    performGesture,
    handleAgentToolCall,
    startConversation,
    endConversation
};
