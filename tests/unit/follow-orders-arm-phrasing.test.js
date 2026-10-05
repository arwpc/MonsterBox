/**
 * Follow Orders — natural arm commands.
 *
 * Regression suite for what a guest actually says to a two-armed character:
 * singular with no side ("raise your arm"), plurals ("raise your arms",
 * "raise your hands"), particle forms ("put your arms up", "arms up") and the
 * lowering forms. Before the fix the singular tied the two arms as `ambiguous`
 * and every plural fell out `below_threshold`.
 *
 * Fixtures are fictional characters (independence audit); no filesystem,
 * server or hardware.
 */
import { expect } from 'chai';
import { matchOrder, VERB_LEXICON } from '../../services/followOrders/orderMatcher.js';
import {
  interpretBodyIntent,
  partsForIntent,
  singularizeBodyText,
  singularBodyToken
} from '../../services/followOrders/bodyRoles.js';

function cfg(overrides = {}) {
  return {
    enabled: true, requireAddressByName: false, addressAliases: [], minConfidence: 0.6,
    enablePoseMatching: true, enableGestureMatching: true, enablePartMatching: true,
    commands: [], partAliases: [], ...overrides
  };
}
const ctxOf = (characterName, parts, brokenPartIds = [], poses = []) =>
  ({ characterName, config: cfg(), poses, gestures: [], parts, brokenPartIds });

// Two arm actuators with flavour-suffixed names, a lamp named after a hand,
// joints of the same limb, and a waist actuator.
const MORVANE = [
  { partId: '1', type: 'linear_actuator', name: 'Right Arm of Morvane', description: '', markers: [] },
  { partId: '2', type: 'linear_actuator', name: 'Left Arm of Manipulation', description: '', markers: [] },
  { partId: '3', type: 'linear_actuator', name: 'Bow At The Waist', description: '', markers: [] },
  { partId: '4', type: 'servo', name: 'Elbow', description: '', markers: [] },
  { partId: '5', type: 'servo', name: 'Forearm Rotation', description: '', markers: [] },
  { partId: '8', type: 'light', name: 'Hand of Azura', description: 'relay lamp', markers: [] },
  { partId: '10', type: 'servo', name: 'Jaw of Morvane', description: '', markers: [] }
];
// The same anatomy with the left arm declared physically broken.
const MORVANE_BROKEN = ['2', '3', '4', '5'];

// Two unsided arms: plural must still pick one, deterministically.
const TWIN = [
  { partId: '7', type: 'servo', name: 'Arm Two', description: '', markers: [] },
  { partId: '6', type: 'servo', name: 'Arm One', description: '', markers: [] }
];

const RAISE = ['raise your arm', 'raise your arms', 'put your arms up', 'raise your hands',
  'arms up', 'hands up', 'raise both arms', 'raise both of your arms', 'lift your arms', 'put your hands up'];
const LOWER = ['lower your arms', 'put your arms down', 'arms down', 'lower your hands', 'drop your arms'];

describe('Follow Orders — natural arm commands', function () {

  describe('plural folding', function () {
    it('folds plural anatomy words onto the singular and flags the plural', function () {
      expect(singularizeBodyText('raise your arms')).to.deep.equal({ text: 'raise your arm', plural: true });
      expect(singularizeBodyText('raise your hands')).to.deep.equal({ text: 'raise your hand', plural: true });
      expect(singularizeBodyText('move your legs')).to.deep.equal({ text: 'move your leg', plural: true });
      expect(singularizeBodyText('stomp your feet').text).to.equal('stomp your foot');
      expect(singularizeBodyText('raise both of your arms')).to.deep.equal({ text: 'raise your arm', plural: true });
    });
    it('leaves singular and non-anatomy words alone', function () {
      expect(singularizeBodyText('raise your arm')).to.deep.equal({ text: 'raise your arm', plural: false });
      expect(singularizeBodyText('lights out').text).to.equal('lights out');
      expect(singularBodyToken('this')).to.equal('this');
      expect(singularBodyToken('is')).to.equal('is');
    });
    it('interprets every plural phrasing as the arm role with the right verb', function () {
      for (const phrase of RAISE) {
        const intent = interpretBodyIntent(phrase);
        expect(intent, phrase).to.include({ role: 'arm', verb: 'open' });
      }
      for (const phrase of LOWER) {
        const intent = interpretBodyIntent(phrase);
        expect(intent, phrase).to.include({ role: 'arm', verb: 'close' });
      }
      expect(interpretBodyIntent('raise your arms').plural).to.equal(true);
      expect(interpretBodyIntent('raise your arm').plural).to.equal(false);
    });
  });

  describe('a broken arm drops out before ambiguity is declared', function () {
    for (const phrase of RAISE) {
      it(`"${phrase}" drives the working right arm, verb open (extend)`, function () {
        const m = matchOrder(phrase, ctxOf('Morvane', MORVANE, MORVANE_BROKEN));
        expect(m, JSON.stringify(m)).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1', verb: 'open' });
      });
    }
    for (const phrase of LOWER) {
      it(`"${phrase}" drives the working right arm, verb close (retract)`, function () {
        const m = matchOrder(phrase, ctxOf('Morvane', MORVANE, MORVANE_BROKEN));
        expect(m, JSON.stringify(m)).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1', verb: 'close' });
      });
    }
    it('"raise your arm" with the RIGHT arm broken drives the left', function () {
      const m = matchOrder('raise your arm', ctxOf('Morvane', MORVANE, ['1']));
      expect(m).to.nested.include({ matched: true, 'part.partId': '2', verb: 'open' });
    });
    it('an explicit side still wins', function () {
      const m = matchOrder('raise your right arm', ctxOf('Morvane', MORVANE, MORVANE_BROKEN));
      expect(m).to.nested.include({ matched: true, 'part.partId': '1' });
    });
    it('a literal tie that is no body intent still drops the broken part', function () {
      const parts = [
        { partId: '3', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
        { partId: '4', type: 'linear_actuator', name: 'T Act', description: '', markers: [] }
      ];
      const m = matchOrder('extend the t act', ctxOf('Gourdling', parts, ['3']));
      expect(m).to.nested.include({ matched: true, 'part.partId': '4', verb: 'open' });
    });
    it('a literal tie with every candidate healthy is still ambiguous', function () {
      const parts = [
        { partId: '3', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
        { partId: '4', type: 'linear_actuator', name: 'T Act', description: '', markers: [] }
      ];
      const m = matchOrder('extend the t act', ctxOf('Gourdling', parts));
      expect(m).to.include({ matched: false, reason: 'ambiguous' });
    });
  });

  describe('two working arms', function () {
    it('"raise your arm" takes the right-hand convention instead of refusing', function () {
      const m = matchOrder('raise your arm', ctxOf('Morvane', MORVANE));
      expect(m).to.nested.include({ matched: true, 'part.partId': '1', verb: 'open' });
    });
    it('"raise your arms" picks one deterministically and reports the rest', function () {
      const m = matchOrder('raise your arms', ctxOf('Morvane', MORVANE));
      expect(m).to.nested.include({ matched: true, 'part.partId': '1', verb: 'open' });
    });
    it('a plural over unsided equal limbs picks the lowest part id and lists the other', function () {
      const intent = interpretBodyIntent('raise your arms');
      const { candidates, alsoMatched } = partsForIntent(intent, TWIN, []);
      expect(candidates.map(c => c.part.partId)).to.deep.equal(['6']);
      expect(alsoMatched.map(c => c.part.partId)).to.deep.equal(['7']);
      const m = matchOrder('raise your arms', ctxOf('Twin', TWIN));
      expect(m).to.nested.include({ matched: true, 'part.partId': '6', plural: true });
      expect(m.alsoMatched.map(c => c.partId)).to.deep.equal(['7']);
    });
    it('a singular over unsided equal limbs is still reported as ambiguous', function () {
      const m = matchOrder('raise your arm', ctxOf('Twin', TWIN));
      expect(m).to.include({ matched: false, reason: 'ambiguous' });
    });
    it('never resolves "raise your hands" to the lamp named after a hand', function () {
      const m = matchOrder('raise your hands', ctxOf('Morvane', MORVANE));
      expect(m.matched).to.equal(true);
      expect(m.part.partId).to.not.equal('8');
    });
  });

  describe('a pose authored for the plural is still preferred', function () {
    it('"raise your arms" performs an "Arms Up" pose', function () {
      const poses = [{ id: 31, name: 'Arms Up', category: 'gesture', tags: [] }];
      const m = matchOrder('raise your arms', ctxOf('Morvane', MORVANE, MORVANE_BROKEN, poses));
      expect(m).to.include({ matched: true, kind: 'pose', poseId: 31 });
    });
  });

  describe('verb mapping for linear actuators', function () {
    it('raise / lift / put up are "open" (executor: extend); lower / put down are "close" (retract)', function () {
      for (const v of ['raise', 'lift', 'put up']) expect(VERB_LEXICON.open).to.include(v);
      for (const v of ['lower', 'put down', 'drop']) expect(VERB_LEXICON.close).to.include(v);
    });
  });
});
