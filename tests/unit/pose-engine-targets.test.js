/**
 * Unit tests for pose target key handling.
 *
 * The pose editor and the pose engine grew different names for the same fields —
 * the editor writes `duration` / `state`, the engine read `durationMs` / `action`.
 * The result was silent: an actuator pose authored in the UI ran for the 2000ms
 * default instead of the 500ms the operator set, on a part where that difference
 * is most of its travel. These tests pin that both spellings are honoured.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(__dirname, '../../services/poses/poseEngine.js');

describe('Pose engine target keys', function () {
  let source;

  before(async function () {
    source = await fs.readFile(ENGINE, 'utf8');
  });

  it('accepts both durationMs and duration everywhere a duration is read', function () {
    // Any duration read that honours only one spelling is the bug this guards.
    const durationReads = source.match(/duration: target\.[^\n]+/g) || [];
    expect(durationReads, 'no duration reads found — test needs updating').to.not.be.empty;
    for (const read of durationReads) {
      expect(read, `single-spelling duration read: ${read}`).to.contain('target.durationMs');
      expect(read, `single-spelling duration read: ${read}`).to.contain('target.duration ');
    }
  });

  it('accepts both action and state for light parts', function () {
    expect(source).to.match(/target\.action \|\| target\.state/);
  });

  it('passes the caller character to every hardware call', async function () {
    // Part IDs are only unique within a character, so a hardware call that omits
    // the character can resolve to a different physical channel.
    const controlPartCalls = source.match(/await controlPart\([\s\S]*?\}, hw\)/g) || [];
    const allControlPart = source.match(/await controlPart\(/g) || [];
    expect(controlPartCalls.length,
      'some controlPart calls do not pass the character context').to.equal(allControlPart.length);
    expect(source).to.contain('batchMoveServos(');
    expect(source).to.match(/batchMoveServos\([\s\S]*?\{ characterId \}\)/);
  });
});
