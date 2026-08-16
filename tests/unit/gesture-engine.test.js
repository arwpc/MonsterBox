/**
 * Unit tests for the conversation-driven gesture engine.
 *
 * The engine's job is to put the body in motion while the character speaks, and
 * its two hard promises are the ones worth testing:
 *
 *  1. It never lets an unsafe recipe reach the hardware. Raw targets outside a
 *     part's calibrated window, parts that safety config has blocked, and parts
 *     sharing a power rail whose motion overlaps are all rejected at LOAD time,
 *     loudly, rather than being silently reinterpreted at run time.
 *  2. It never takes the conversation down with it. Unknown gestures, missing
 *     recipe files, malformed JSON and absent hardware all resolve to a quiet
 *     "did not perform" — never a throw, because motion is fire-and-forget and a
 *     rejected promise upstream would stall a reply.
 *
 * Plus the thing that makes gestures read as alive rather than mechanical:
 * a recipe that moves only one part is refused outright.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

// A scratch character id far outside the real cast, so nothing here can touch
// real character data or real hardware.
const TEST_CHAR = 9042;
const testDir = path.join(APP_ROOT, 'data', `character-${TEST_CHAR}`);
const testFile = path.join(testDir, 'gestures.json');

async function writeGestures(doc) {
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(testFile, typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));
  // mtime drives the recipe cache; make sure each write is seen as new.
  const now = new Date();
  await fs.utimes(testFile, now, new Date(now.getTime() + Math.random() * 1000));
}

describe('Gesture engine', function () {
  this.timeout(15000);

  let engine;

  before(async function () {
    engine = (await import('../../services/gestureEngineService.js')).default;
  });

  afterEach(async function () {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('feature flag', function () {
    it('is a silent no-op for a character with no gestures.json', async function () {
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.enabled).to.equal(false);
      expect(listed.available).to.be.an('array').that.is.empty;

      const result = await engine.performGesture(TEST_CHAR, 'anything');
      expect(result.performed).to.equal(false);
      expect(result.reason).to.match(/no gestures\.json/i);
    });

    it('survives a malformed gestures.json without throwing', async function () {
      await writeGestures('{ this is not json');
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.available).to.be.empty;
      expect(listed.rejected.join(' ')).to.match(/could not read/i);

      const result = await engine.performGesture(TEST_CHAR, 'anything');
      expect(result.performed).to.equal(false);
    });

    it('rejects an unsupported schema version', async function () {
      await writeGestures({ version: 999, gestures: [] });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.rejected.join(' ')).to.match(/unsupported gestures\.json version/i);
    });
  });

  describe('concurrency is mandatory', function () {
    it('refuses a gesture that moves only one part', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'lonely',
          steps: [{ partId: '15', type: 'servo', target: 90, delayMs: 0, durationMs: 500 }]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.available).to.be.empty;
      expect(listed.rejected.join(' ')).to.match(/at least two distinct parts/i);
    });

    it('accepts one moving part plus a light', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'head_and_lamp',
          steps: [
            { pose: 1, delayMs: 0, durationMs: 500 },
            { partId: '8', type: 'light', level: 60, delayMs: 100 }
          ]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      // The pose reference cannot resolve for a character with no pose library,
      // so this asserts only that the two-part rule itself was satisfied.
      expect(listed.rejected.join(' ')).to.not.match(/at least two distinct parts/i);
    });
  });

  describe('recipe validation', function () {
    it('rejects a light level outside 0-100', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'blinding',
          steps: [
            { partId: '8', type: 'light', level: 400, delayMs: 0 },
            { partId: '9', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.rejected.join(' ')).to.match(/light level must be 0-100/i);
    });

    it('rejects a raw servo target on a part with no calibrated bounds', async function () {
      // Inventing bounds for unmeasured hardware is exactly how a part ends up
      // looking calibrated when it never was — so this must be refused, not guessed.
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'uncalibrated',
          steps: [
            { partId: '77', type: 'servo', target: 90, delayMs: 0, durationMs: 500 },
            { partId: '8', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.available).to.be.empty;
      expect(listed.rejected.join(' ')).to.match(/no calibrated bounds/i);
    });

    it('rejects an unknown pose reference', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'ghost_pose',
          steps: [
            { pose: 'NoSuchPoseAnywhere', delayMs: 0, durationMs: 500 },
            { partId: '8', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.rejected.join(' ')).to.match(/unknown pose/i);
    });

    it('reports every problem in a recipe, not just the first', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'a_mess',
          steps: [
            { partId: '77', type: 'servo', target: 90, delayMs: 0, durationMs: 500 },
            { partId: '8', type: 'light', level: 900, delayMs: 0 }
          ]
        }]
      });
      const listed = await engine.listGestures(TEST_CHAR);
      expect(listed.rejected.length).to.be.greaterThan(1);
    });
  });

  describe('cooldowns and caps', function () {
    it('refuses an unknown gesture by name', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'known',
          steps: [
            { partId: '8', type: 'light', level: 50, delayMs: 0 },
            { partId: '9', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });
      const result = await engine.performGesture(TEST_CHAR, 'not_a_real_gesture');
      expect(result.performed).to.equal(false);
      expect(result.reason).to.match(/unknown gesture/i);
    });

    it('suppresses a kidSafe:false gesture in kid mode, and allows it otherwise', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'pounce',
          kidSafe: false,
          steps: [
            { partId: '8', type: 'light', level: 100, delayMs: 0 },
            { partId: '9', type: 'light', level: 100, delayMs: 0 }
          ]
        }]
      });
      const suppressed = await engine.performGesture(TEST_CHAR, 'pounce', { kidMode: true });
      expect(suppressed.performed).to.equal(false);
      expect(suppressed.reason).to.match(/kid mode/i);

      engine.startConversation(TEST_CHAR);
      const allowed = await engine.performGesture(TEST_CHAR, 'pounce', { kidMode: false });
      // It may fail to reach hardware in a test environment; what matters is that
      // kid mode was not the thing that stopped it.
      expect(allowed.reason || '').to.not.match(/kid mode/i);
    });

    it('enforces the per-conversation cap and clears it on a new conversation', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'once_only',
          maxPerConversation: 1,
          steps: [
            { partId: '8', type: 'light', level: 50, delayMs: 0 },
            { partId: '9', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });

      engine.startConversation(TEST_CHAR);
      await engine.performGesture(TEST_CHAR, 'once_only');
      const second = await engine.performGesture(TEST_CHAR, 'once_only');
      expect(second.performed).to.equal(false);
      expect(second.reason).to.match(/cap reached/i);

      // A new visitor gets a fresh budget — otherwise the second guest of the
      // night would meet a character that never gestures again.
      engine.startConversation(TEST_CHAR);
      const afterReset = await engine.performGesture(TEST_CHAR, 'once_only');
      expect(afterReset.reason || '').to.not.match(/cap reached/i);
    });

    it('enforces the cooldown between repeats', async function () {
      await writeGestures({
        version: 1,
        gestures: [{
          id: 'slow_repeat',
          cooldownMs: 60000,
          steps: [
            { partId: '8', type: 'light', level: 50, delayMs: 0 },
            { partId: '9', type: 'light', level: 50, delayMs: 0 }
          ]
        }]
      });
      engine.startConversation(TEST_CHAR);
      await engine.performGesture(TEST_CHAR, 'slow_repeat');
      const tooSoon = await engine.performGesture(TEST_CHAR, 'slow_repeat');
      expect(tooSoon.performed).to.equal(false);
      expect(tooSoon.reason).to.match(/cooling down/i);
    });
  });

  describe('agent tool routing', function () {
    it('ignores tool calls that are not the gesture tool', function () {
      const result = engine.handleAgentToolCall(TEST_CHAR, 'some_other_tool', { gesture_id: 'x' });
      expect(result.handled).to.equal(false);
    });

    it('ignores a gesture call with no gesture_id', function () {
      const result = engine.handleAgentToolCall(TEST_CHAR, 'gesture', {});
      expect(result.handled).to.equal(false);
    });

    it('accepts a gesture call without waiting for the motion', function () {
      // Fire-and-forget by contract: making the agent await a servo is the
      // freeze-while-talking failure the whole design exists to prevent.
      const result = engine.handleAgentToolCall(TEST_CHAR, 'gesture', { gesture_id: 'anything' });
      expect(result.handled).to.equal(true);
      expect(result.gestureId).to.equal('anything');
    });
  });
});

/**
 * These run against whichever character actually ships a gesture vocabulary on
 * this node, proving the safety rules bite against REAL calibration and safety
 * config rather than only against fixtures. They skip cleanly where that data is
 * absent, so the suite stays honest on a node with different hardware.
 */
describe('Gesture engine — real character data', function () {
  this.timeout(15000);

  let engine;
  let hasData = false;
  const REAL_CHAR = 3;

  before(async function () {
    engine = (await import('../../services/gestureEngineService.js')).default;
    try {
      await fs.access(path.join(APP_ROOT, 'data', `character-${REAL_CHAR}`, 'gestures.json'));
      await fs.access(path.join(APP_ROOT, 'config', 'hardware-safety.json'));
      hasData = true;
    } catch (_) { hasData = false; }
  });

  it('loads the shipped vocabulary with no rejected recipes', async function () {
    if (!hasData) this.skip();
    const listed = await engine.listGestures(REAL_CHAR);
    expect(listed.enabled).to.equal(true);
    expect(listed.available.length).to.be.greaterThan(0);
    // A shipped recipe that fails validation would be a gesture the character
    // silently cannot perform — that must never reach a release.
    expect(listed.rejected, `rejected: ${listed.rejected.join(' | ')}`).to.be.empty;
  });

  it('every shipped gesture moves at least two parts', async function () {
    if (!hasData) this.skip();
    const raw = JSON.parse(await fs.readFile(
      path.join(APP_ROOT, 'data', `character-${REAL_CHAR}`, 'gestures.json'), 'utf8'));
    for (const g of raw.gestures) {
      const parts = new Set(g.steps.map(s => String(s.partId ?? s.pose)));
      expect(parts.size, `${g.id} moves only ${parts.size} part(s)`).to.be.greaterThan(1);
    }
  });

  it('no shipped gesture commands a part that safety config has blocked', async function () {
    if (!hasData) this.skip();
    const safety = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'config', 'hardware-safety.json'), 'utf8'));
    const blocked = new Set(
      Object.entries(safety.characters?.[String(REAL_CHAR)]?.parts || {})
        .filter(([, p]) => p.blockAllMotion)
        .map(([id]) => String(id))
    );
    const raw = JSON.parse(await fs.readFile(
      path.join(APP_ROOT, 'data', `character-${REAL_CHAR}`, 'gestures.json'), 'utf8'));
    for (const g of raw.gestures) {
      for (const step of g.steps) {
        if (step.partId == null) continue;
        expect(blocked.has(String(step.partId)),
          `${g.id} commands blocked part ${step.partId}`).to.equal(false);
      }
    }
  });

  it('no shipped gesture overlaps two parts on the same power rail', async function () {
    if (!hasData) this.skip();
    const safety = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'config', 'hardware-safety.json'), 'utf8'));
    const parts = safety.characters?.[String(REAL_CHAR)]?.parts || {};
    const railOf = id => parts[String(id)]?.powerGroup || null;
    const raw = JSON.parse(await fs.readFile(
      path.join(APP_ROOT, 'data', `character-${REAL_CHAR}`, 'gestures.json'), 'utf8'));

    for (const g of raw.gestures) {
      const servo = g.steps.filter(s => s.partId != null && s.type !== 'light');
      for (let i = 0; i < servo.length; i++) {
        for (let j = i + 1; j < servo.length; j++) {
          const [ri, rj] = [railOf(servo[i].partId), railOf(servo[j].partId)];
          if (!ri || ri !== rj) continue;
          const a = [servo[i].delayMs || 0, (servo[i].delayMs || 0) + (servo[i].durationMs || 0)];
          const b = [servo[j].delayMs || 0, (servo[j].delayMs || 0) + (servo[j].durationMs || 0)];
          expect(a[0] < b[1] && b[0] < a[1],
            `${g.id}: parts ${servo[i].partId} and ${servo[j].partId} share rail "${ri}" and overlap`
          ).to.equal(false);
        }
      }
    }
  });
});
