/**
 * Unit tests for barge-in detection (talking over a speaking character).
 *
 * shouldBargeIn is pure, so the thresholds, the hysteresis and the grace period
 * are all provable here without a socket, a microphone or an animatronic.
 */

import { expect } from 'chai';
import { shouldBargeIn } from '../../services/elevenLabsWebSocketService.js';

describe('Barge-in detection', function () {
  // Well past the grace window for every case that is not testing it.
  const SPEECH_START = 1_000_000;
  const LATE = SPEECH_START + 5000;

  function run(frames, { echoFloor = 0.01, speechStartedAt = SPEECH_START, now = LATE } = {}) {
    let state = { echoFloor, bargeInFrames: 0, speechStartedAt };
    let fired = false;
    for (const rms of frames) {
      const verdict = shouldBargeIn(state, rms, now);
      state = { ...state, bargeInFrames: verdict.run };
      if (verdict.bargeIn) { fired = true; break; }
    }
    return fired;
  }

  describe('threshold', () => {
    it('ignores frames at the echo floor — the character hearing itself', () => {
      expect(run([0.01, 0.01, 0.01, 0.01, 0.01])).to.equal(false);
    });

    it('ignores a frame above the echo floor but under the absolute floor', () => {
      // 0.04 clears 0.01*2.2 but not BARGE_IN_RMS_FLOOR (0.05), so a quiet node
      // that has learned a near-zero floor cannot interrupt itself on hiss.
      expect(run([0.04, 0.04, 0.04, 0.04], { echoFloor: 0.001 })).to.equal(false);
    });

    it('fires on sustained speech clearly above both floors', () => {
      expect(run([0.2, 0.2, 0.2])).to.equal(true);
    });

    it('scales with a loud node: a frame that interrupts a quiet node does not interrupt a loud one', () => {
      // A node with no echo cancellation hears itself at 0.15. Guest speech at
      // 0.2 is no longer distinguishable from its own voice.
      expect(run([0.2, 0.2, 0.2, 0.2], { echoFloor: 0.15 })).to.equal(false);
      // ...but a genuinely louder guest still gets through.
      expect(run([0.5, 0.5, 0.5], { echoFloor: 0.15 })).to.equal(true);
    });
  });

  describe('hysteresis', () => {
    it('does not fire on a single loud frame (a door slam or a laugh)', () => {
      expect(run([0.9])).to.equal(false);
    });

    it('does not fire on two loud frames', () => {
      expect(run([0.9, 0.9])).to.equal(false);
    });

    it('resets the run when the room goes quiet between loud frames', () => {
      // Loud, quiet, loud, quiet, loud — never three consecutive.
      expect(run([0.9, 0.01, 0.9, 0.01, 0.9, 0.01, 0.9])).to.equal(false);
    });
  });

  describe('grace period', () => {
    it('refuses to interrupt the first moments of an utterance', () => {
      // The guest's own question is still echoing as the reply starts; without
      // the grace window the reply interrupts itself immediately.
      const now = SPEECH_START + 100;
      expect(run([0.9, 0.9, 0.9, 0.9, 0.9], { now })).to.equal(false);
    });

    it('allows the interrupt once the grace window has passed', () => {
      const now = SPEECH_START + 900;
      expect(run([0.9, 0.9, 0.9], { now })).to.equal(true);
    });
  });

  describe('state shape', () => {
    it('tolerates an empty state (first frame of a session)', () => {
      const verdict = shouldBargeIn({}, 0.2, LATE);
      expect(verdict).to.have.property('bargeIn');
      expect(verdict.run).to.equal(1);
    });

    it('reports the threshold it used, for diagnosis', () => {
      const verdict = shouldBargeIn({ echoFloor: 0.1 }, 0.05, LATE);
      expect(verdict.threshold).to.be.closeTo(0.22, 1e-9);
      expect(verdict.over).to.equal(false);
    });
  });
});
