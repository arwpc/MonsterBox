/**
 * Unit tests for scene resilience to failed hardware steps.
 *
 * Sequential steps used to be awaited with no try/catch, so a single failing
 * hardware step aborted the whole scene. On a Halloween prop that means one dead
 * lamp or one quarantined actuator ends the performance. Hardware steps are now
 * recorded as failed and the scene continues; control-flow steps (sensor gates)
 * stay fatal, because their whole purpose is to hold a scene back.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTOR = path.resolve(__dirname, '../../services/scenes/sceneExecutor.js');

describe('Scene step resilience', function () {
  let source;

  before(async function () {
    source = await fs.readFile(EXECUTOR, 'utf8');
  });

  it('treats hardware actuation steps as non-fatal', function () {
    const match = source.match(/const NON_FATAL_STEP_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(match, 'NON_FATAL_STEP_TYPES not found').to.not.equal(null);
    const listed = match[1];
    for (const type of ['servo', 'motor', 'linear-actuator', 'light', 'pose']) {
      expect(listed, `${type} should be non-fatal`).to.contain(`'${type}'`);
    }
  });

  it('keeps control-flow steps fatal so a missed trigger still gates the scene', function () {
    const match = source.match(/const NON_FATAL_STEP_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    const listed = match[1];
    for (const type of ['sensor', 'wait']) {
      expect(listed, `${type} must stay fatal`).to.not.contain(`'${type}'`);
    }
  });

  it('wraps the sequential step await so a non-fatal failure cannot abort the scene', function () {
    // The bug was a bare `await executeStep(...)` in the sequential branch.
    expect(source).to.match(/try \{\s*const r = await executeStep\(step, characterId, emit, opts\);/);
    expect(source).to.match(/if \(!NON_FATAL_STEP_TYPES\.has\(step\.type\)\) throw err;/);
  });

  it('records a skipped step as a failure so the scene does not report success', function () {
    expect(source).to.match(/results\.push\(\{ success: false, error: err\.message, index: i, stepType: step\.type \}\)/);
    expect(source).to.match(/const sceneSuccess = stepErrors\.length === 0;/);
  });
});
