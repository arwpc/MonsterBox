/**
 * Unit tests for fleet-operation honesty and show resilience.
 *
 * A fleet review found EMERGENCY STOP rendering "0/5 ok" in green: four fan-out
 * operations hardcoded `success: true`, so a broadcast that reached nothing still
 * reported success and the superpower buttons latched on for a state nothing had
 * accepted. It also found that the fleet-wide "Start Loops" control played one
 * pass per prop and stopped, and that a single failed step ended a prop's night.
 *
 * These are source-level assertions because the behaviour lives in fan-out paths
 * that need five reachable nodes to exercise end to end.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function read(rel) {
  return fs.readFile(path.join(ROOT, rel), 'utf8');
}

describe('Fleet operation honesty', function () {
  let orchestration;

  before(async function () {
    orchestration = await read('services/orchestrationService.js');
  });

  it('never hardcodes success:true on a fan-out result', function () {
    // The exact shape of the bug: `return { success: true, ...this._summarize(...) }`
    const hardcoded = orchestration.match(/return \{\s*success: true[^}]*_summarize/g) || [];
    expect(hardcoded, `fan-outs still hardcoding success: ${hardcoded.join(' | ')}`).to.be.empty;
  });

  it('derives success from how many nodes actually accepted', function () {
    const derived = orchestration.match(/success: summary\.successful > 0/g) || [];
    // superpower, stopAllQueueLoops, emergencyStop, volume, plus the two that
    // were already correct.
    expect(derived.length, 'expected every fan-out to derive success').to.be.at.least(6);
  });

  it('still reports per-node counts so a partial failure is visible', function () {
    expect(orchestration).to.match(/total:\s*normalized\.length/);
    expect(orchestration).to.match(/failed:\s*normalized\.length - successful/);
  });
});

describe('Queue loop mode', function () {
  let queue;
  let routes;

  before(async function () {
    queue = await read('services/scenes/sceneQueue.js');
    routes = await read('routes/scenes/api.js');
  });

  it('start() accepts a mode so a loop can actually loop', function () {
    expect(queue).to.match(/export async function start\(characterId, options = \{\}\)/);
    expect(queue).to.match(/options\.mode === 'loop_queue' \? 'loop_queue' : 'sequential'/);
  });

  it('the start route parses a body at all', function () {
    // Without express.json() the mode silently never arrives.
    expect(routes).to.match(/router\.post\('\/queue\/start', express\.json\(\)/);
    expect(routes).to.match(/req\.body && req\.body\.mode/);
  });

  it('loop mode refills the queue from the original items', function () {
    expect(queue).to.match(/q\.mode === 'loop_queue'/);
    expect(queue).to.match(/q\.items = q\.originalItems\.slice\(\)/);
  });
});

describe('Show resilience', function () {
  let queue;
  let executor;

  before(async function () {
    queue = await read('services/scenes/sceneQueue.js');
    executor = await read('services/scenes/sceneExecutor.js');
  });

  it('a scene that throws does not end the queue', function () {
    expect(queue).to.match(/try \{\s*await runSceneWithLifecycle\(q, characterId, next\);\s*\} catch/);
  });

  it('treats network- and device-fragile output steps as non-fatal', function () {
    const match = executor.match(/const NON_FATAL_STEP_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(match, 'NON_FATAL_STEP_TYPES not found').to.not.equal(null);
    for (const type of ['audio', 'sayThis', 'askAI']) {
      expect(match[1], `${type} should survive a failure`).to.contain(`'${type}'`);
    }
  });

  it('keeps control-flow steps fatal so a trigger still gates the scene', function () {
    const match = executor.match(/const NON_FATAL_STEP_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    for (const type of ['sensor', 'wait']) {
      expect(match[1], `${type} must stay fatal`).to.not.contain(`'${type}'`);
    }
  });
});
