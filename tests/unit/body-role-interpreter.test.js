/**
 * Body-role interpreter — the layer that turns how a GUEST talks into a command
 * for hardware nobody named for guests.
 *
 * The point of this suite is character independence, so the fixtures are three
 * deliberately different naming conventions for the same anatomy, under
 * fictional names per the independence audit:
 *   - one character calls the thing on its neck "Neck"
 *   - another calls it "Head on a Swivel"
 *   - a third calls it "Head Servo"
 * A guest says none of those. A guest says "look at me". All three must move.
 *
 * Pure: no filesystem, no server, no hardware.
 */
import { expect } from 'chai';
import { matchOrder } from '../../services/followOrders/orderMatcher.js';
import {
  inferPartRoles,
  interpretBodyIntent,
  partsForIntent
} from '../../services/followOrders/bodyRoles.js';

function cfg(overrides = {}) {
  return {
    enabled: true, requireAddressByName: false, addressAliases: [], minConfidence: 0.6,
    enablePoseMatching: true, enableGestureMatching: true, enablePartMatching: true,
    commands: [], partAliases: [], ...overrides
  };
}
const ctxOf = (characterName, parts, poses = [], brokenPartIds = []) =>
  ({ characterName, config: cfg(), poses, gestures: [], parts, brokenPartIds });

// Three wiring conventions for comparable anatomy.
const VOLKAR = [   // verbose, flavour-suffixed, two arms, a lamp named like a hand
  { partId: '1', type: 'linear_actuator', name: 'Right Arm of Volkar', description: '', markers: [] },
  { partId: '2', type: 'linear_actuator', name: 'Left Arm of Manipulation', description: '', markers: [] },
  { partId: '3', type: 'linear_actuator', name: 'Bow At The Waist', description: '', markers: [] },
  { partId: '4', type: 'servo', name: 'Elbow', description: '', markers: [] },
  { partId: '8', type: 'light', name: 'Hand of Azura', description: 'relay-switched lamp', markers: [] },
  { partId: '9', type: 'webcam', name: 'Eye of Volkar', description: '', markers: [] },
  { partId: '10', type: 'servo', name: 'Jaw of Volkar', description: '', markers: [] },
  { partId: '15', type: 'servo', name: 'Head on a Swivel', description: '', markers: [] }
];
const LUCIA = [    // terse, single words, a coffin
  { partId: '1', type: 'servo', name: 'Jaw', description: '', markers: [] },
  { partId: '2', type: 'servo', name: 'Neck', description: '', markers: [] },
  { partId: '3', type: 'servo', name: 'Eye', description: '', markers: [] },
  { partId: '4', type: 'linear_actuator', name: 'Coffin Door', description: '', markers: [] },
  { partId: '5', type: 'light', name: 'Burning Rose', description: '', markers: [] }
];
const KNIGHT = [   // type-suffixed
  { partId: '1', type: 'servo', name: 'Head Servo', description: '', markers: [] },
  { partId: '2', type: 'servo', name: 'Jaw Servo', description: '', markers: [] },
  { partId: '3', type: 'servo', name: 'Magic Box Servo', description: '', markers: [] }
];
const MINIMAL = [  // one unnamed motor and nothing else that moves
  { partId: '1', type: 'motor', name: 'Gourdling Shake Motor', description: '', markers: [] },
  { partId: '2', type: 'speaker', name: 'Speaker Gourdling', description: '', markers: [] }
];

describe('Body-role interpreter', function () {

  describe('role inference is derived from the character, not from a name list', function () {
    it('sorts three different words for the same anatomy into the same role', function () {
      const roleOf = (parts, id) =>
        inferPartRoles(parts).find(r => r.part.partId === id).role;
      expect(roleOf(VOLKAR, '15')).to.equal('head');   // "Head on a Swivel"
      expect(roleOf(LUCIA, '2')).to.equal('head');     // "Neck"
      expect(roleOf(KNIGHT, '1')).to.equal('head');    // "Head Servo"
    });

    it('classifies non-motion parts by TYPE, never by name', function () {
      const roles = inferPartRoles(VOLKAR);
      // "Eye of Volkar" is a webcam and "Hand of Azura" is a lamp. Neither is
      // anatomy, and treating them as such would aim a camera at "blink" and a
      // lamp at "raise your hand".
      expect(roles.find(r => r.part.partId === '9').role).to.equal('camera');
      expect(roles.find(r => r.part.partId === '8').role).to.equal('light');
      expect(roles.find(r => r.part.partId === '8').movable).to.equal(false);
    });

    it('a moving part named after no anatomy still counts as body', function () {
      const roles = inferPartRoles(MINIMAL);
      expect(roles.find(r => r.part.partId === '1')).to.include({ role: 'body', movable: true });
    });

    it('reads the side out of the part name', function () {
      const roles = inferPartRoles(VOLKAR);
      expect(roles.find(r => r.part.partId === '1').side).to.equal('right');
      expect(roles.find(r => r.part.partId === '2').side).to.equal('left');
    });

    it('a limb outranks its own joint', function () {
      const roles = inferPartRoles(VOLKAR);
      expect(roles.find(r => r.part.partId === '1').primary).to.equal(true);  // Arm
      expect(roles.find(r => r.part.partId === '4').primary).to.equal(false); // Elbow
    });

    it('skips disabled parts', function () {
      const roles = inferPartRoles([{ partId: '1', type: 'servo', name: 'Jaw', enabled: false }]);
      expect(roles).to.have.length(0);
    });
  });

  describe('the same sentence works on every character', function () {
    const cases = [
      ['Volkar', VOLKAR, '15'],
      ['Lucia', LUCIA, '2'],
      ['Knight', KNIGHT, '1']
    ];
    cases.forEach(([name, parts, expectedPartId]) => {
      it(`"look at me" reaches ${name}'s head part`, function () {
        const m = matchOrder('look at me', ctxOf(name, parts));
        expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': expectedPartId });
        expect(m.via).to.equal('body-intent');
      });
    });

    it('"open your mouth" reaches the jaw on each of them', function () {
      expect(matchOrder('open your mouth', ctxOf('Volkar', VOLKAR))).to.nested.include({ 'part.partId': '10' });
      expect(matchOrder('open your mouth', ctxOf('Lucia', LUCIA))).to.nested.include({ 'part.partId': '1' });
      expect(matchOrder('open your mouth', ctxOf('Knight', KNIGHT))).to.nested.include({ 'part.partId': '2' });
    });

    it('"do something" reaches the only moving part a minimal character has', function () {
      const m = matchOrder('do something', ctxOf('Gourdling', MINIMAL));
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1' });
    });
  });

  describe('intent, not vocabulary', function () {
    it('"wave at me" picks the arm, not the elbow, and prefers the right', function () {
      const m = matchOrder('wave at me', ctxOf('Volkar', VOLKAR));
      expect(m).to.nested.include({ matched: true, 'part.partId': '1', verb: 'open' });
    });
    it('an explicitly named side wins over the right-hand default', function () {
      const m = matchOrder('raise your left arm', ctxOf('Volkar', VOLKAR));
      expect(m).to.nested.include({ matched: true, 'part.partId': '2' });
    });
    it('"raise your hand" reaches the ARM, never the lamp called Hand of Azura', function () {
      // The literal rung scores "hand" highest against the lamp and then refuses
      // it as a verb/type mismatch. The interpreter has to get its turn.
      const m = matchOrder('raise your hand', ctxOf('Volkar', VOLKAR));
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1' });
      expect(m.part.type).to.equal('linear_actuator');
    });
    it('"take a bow" reaches the waist actuator', function () {
      expect(matchOrder('take a bow', ctxOf('Volkar', VOLKAR))).to.nested.include({ 'part.partId': '3' });
    });
    it('"blink" reaches an eye SERVO where one exists', function () {
      expect(matchOrder('blink', ctxOf('Lucia', LUCIA))).to.nested.include({ 'part.partId': '3' });
    });
    it('"open the coffin" reaches the door actuator', function () {
      expect(matchOrder('open the coffin', ctxOf('Lucia', LUCIA))).to.nested.include({ 'part.partId': '4', verb: 'open' });
    });
    it('"light up" turns a light on, whatever it is called', function () {
      expect(matchOrder('light up', ctxOf('Volkar', VOLKAR))).to.nested.include({ 'part.partId': '8', verb: 'on' });
      expect(matchOrder('light up', ctxOf('Lucia', LUCIA))).to.nested.include({ 'part.partId': '5', verb: 'on' });
    });
    it('"close your mouth" is not shadowed by the shorter "mouth" intents', function () {
      expect(matchOrder('close your mouth', ctxOf('Lucia', LUCIA))).to.nested.include({ 'part.partId': '1', verb: 'close' });
    });
  });

  describe('honest refusal', function () {
    it('refuses a role the character does not have, and says which role', function () {
      const m = matchOrder('open your mouth', ctxOf('Gourdling', MINIMAL));
      expect(m.matched).to.equal(false);
      expect(m.reason).to.equal('no_such_role');
      expect(m.detail).to.contain('jaw');
    });
    it('a phrase that is no body intent at all still refuses normally', function () {
      const m = matchOrder('what is your favourite colour', ctxOf('Lucia', LUCIA));
      expect(m.matched).to.equal(false);
      expect(m.reason).to.not.equal('no_such_role');
    });
    it('reports candidates rather than guessing between equals', function () {
      const twoLamps = [
        { partId: '1', type: 'light', name: 'Burning Rose', description: '', markers: [] },
        { partId: '2', type: 'light', name: 'Servo Channel Laser', description: '', markers: [] }
      ];
      const m = matchOrder('light up', ctxOf('Lucia', twoLamps));
      expect(m.matched).to.equal(false);
      expect(m.reason).to.equal('ambiguous');
      expect(m.candidates).to.have.length(2);
    });
  });

  describe('broken hardware is not chosen when something else fills the role', function () {
    it('"wave" skips a broken right arm and takes the working left', function () {
      const m = matchOrder('wave at me', ctxOf('Volkar', VOLKAR, [], ['1']));
      expect(m).to.nested.include({ matched: true, 'part.partId': '2' });
    });
    it('partsForIntent keeps a broken part when it is the ONLY one in the role', function () {
      // Withholding it here would report "you have no jaw", which is false. The
      // executor still refuses the move; the matcher must not lie about anatomy.
      const intent = interpretBodyIntent('open your mouth');
      const { candidates } = partsForIntent(intent, LUCIA, ['1']);
      expect(candidates.map(c => c.part.partId)).to.deep.equal(['1']);
    });
  });

  describe('a hand-authored pose outranks jerking one actuator', function () {
    it('"wave at me" performs a Wave pose when the character has one', function () {
      const poses = [{ id: 7, name: 'Wave Hello', category: 'gesture', tags: ['wave', 'greet'] }];
      const m = matchOrder('wave at me', ctxOf('Volkar', VOLKAR, poses));
      expect(m).to.nested.include({ matched: true, kind: 'pose', poseId: 7 });
    });
  });

  describe('no regression on the literal rungs', function () {
    it('an exact part name still matches directly, not via the interpreter', function () {
      const m = matchOrder('raise the right arm of volkar', ctxOf('Volkar', VOLKAR));
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1' });
      expect(m.via).to.equal(undefined);
    });
    it('the stop phrase still outranks everything', function () {
      expect(matchOrder('stop', ctxOf('Volkar', VOLKAR))).to.include({ matched: true, kind: 'stop' });
    });
  });
});
