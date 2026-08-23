/**
 * Order Matcher unit suite — the Follow Orders grammar.
 *
 * The matcher is pure, so every case runs against hand-built ctx fixtures
 * shaped like real character data (Mina's coffin door, Orlok's poses and
 * flavored part names, PumpkinHead's five identical "T Act" actuators).
 * No filesystem, no server, no hardware.
 */
import { expect } from 'chai';
import {
  normalizeTranscript,
  stripAddress,
  matchOrder
} from '../../services/followOrders/orderMatcher.js';

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    requireAddressByName: false,
    addressAliases: [],
    minConfidence: 0.6,
    enablePoseMatching: true,
    enableGestureMatching: true,
    enablePartMatching: true,
    commands: [],
    partAliases: [],
    ...overrides
  };
}

// Shaped like character-3 (Orlok): flavored part names, real pose vocabulary.
function orlokCtx(configOverrides = {}) {
  return {
    characterName: 'Orlok',
    config: baseConfig(configOverrides),
    poses: [
      { id: 1, name: 'Neutral Standing', category: 'idle', tags: ['idle', 'home'] },
      { id: 21, name: 'Arm Raise Full', category: 'gesture', tags: [] },
      { id: 22, name: 'Arm Lower', category: 'gesture', tags: [] }
    ],
    gestures: [
      { id: 'contempt_turn', label: 'Contempt Turn', intent: 'offense taken; contempt; ending a topic' }
    ],
    parts: [
      { partId: '1', type: 'linear_actuator', name: 'Right Arm of Orlok', description: 'Right arm linear actuator', markers: [] },
      { partId: '8', type: 'light', name: 'Hand of Azura', description: 'relay-switched 12V light', markers: [] },
      { partId: '10', type: 'servo', name: 'Jaw of Orlok', description: '', markers: [] },
      { partId: '15', type: 'servo', name: 'Head on a Swivel', description: '', markers: [] }
    ]
  };
}

// Shaped like character-2 (Mina): zero poses, coffin door is a raw part.
function minaCtx(configOverrides = {}) {
  return {
    characterName: 'Mina',
    config: baseConfig({
      partAliases: [{ alias: 'coffin door', partId: '4' }],
      ...configOverrides
    }),
    poses: [],
    gestures: [],
    parts: [
      { partId: '1', type: 'servo', name: 'Jaw', description: '', markers: [] },
      { partId: '4', type: 'linear_actuator', name: 'Coffin Door', description: 'Coffin door actuator', markers: [] },
      { partId: '7', type: 'light', name: 'Burning Rose', description: '', markers: [] }
    ]
  };
}

// Shaped like character-1 (PumpkinHead): five identical "T Act" names.
function pumpkinCtx(configOverrides = {}) {
  return {
    characterName: 'PumpkinHead',
    config: baseConfig(configOverrides),
    poses: [],
    gestures: [],
    parts: [
      { partId: '3', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
      { partId: '4', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
      { partId: '5', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
      { partId: '6', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
      { partId: '7', type: 'linear_actuator', name: 'T Act', description: '', markers: [] },
      { partId: '12', type: 'motor', name: 'Wiper Motor', description: '', markers: [] }
    ]
  };
}

describe('Order matcher', function () {
  describe('normalizeTranscript', function () {
    it('lowercases, strips punctuation, collapses whitespace', function () {
      expect(normalizeTranscript('  Raise, your ARM!! ')).to.equal('raise your arm');
    });
    it('strips leading fillers and trailing politeness', function () {
      expect(normalizeTranscript('Hey, could you please raise your arm, please')).to.equal('raise your arm');
      expect(normalizeTranscript('I want you to open the box now')).to.equal('open the box');
    });
    it('returns empty for filler-only input', function () {
      expect(normalizeTranscript('okay, please')).to.equal('');
    });
  });

  describe('stripAddress', function () {
    it('detects the name at the start and strips it', function () {
      const r = stripAddress('orlok raise your arm', ['Orlok']);
      expect(r.addressed).to.equal(true);
      expect(r.remainder).to.equal('raise your arm');
    });
    it('detects the name at the end (Scribe drops commas)', function () {
      const r = stripAddress('raise your arm orlok', ['Orlok']);
      expect(r.addressed).to.equal(true);
      expect(r.remainder).to.equal('raise your arm');
    });
    it('matches aliases like ASR mishearings', function () {
      const r = stripAddress('or lock raise your arm', ['Orlok', 'or lock']);
      expect(r.addressed).to.equal(true);
      expect(r.remainder).to.equal('raise your arm');
    });
    it('does not match a name buried inside another word', function () {
      const r = stripAddress('minavera open the door', ['Mina']);
      expect(r.addressed).to.equal(false);
    });
  });

  describe('stop priority', function () {
    it('bare "stop" matches as stop', function () {
      const m = matchOrder('stop', orlokCtx());
      expect(m).to.include({ matched: true, kind: 'stop' });
    });
    it('"freeze" and "halt" also stop', function () {
      expect(matchOrder('freeze', orlokCtx()).kind).to.equal('stop');
      expect(matchOrder('halt', orlokCtx()).kind).to.equal('stop');
    });
    it('stop works even unaddressed when requireAddressByName is on', function () {
      const m = matchOrder('stop', orlokCtx({ requireAddressByName: true }));
      expect(m).to.include({ matched: true, kind: 'stop' });
    });
    it('"stop the jaw" targets the part, not global stop', function () {
      const m = matchOrder('stop the jaw', orlokCtx());
      expect(m.matched).to.equal(true);
      expect(m.kind).to.equal('part');
      expect(m.part.partId).to.equal('10');
      expect(m.verb).to.equal('stop');
    });
  });

  describe('address gating', function () {
    it('always-obey (default): unaddressed commands match', function () {
      const m = matchOrder('raise your arm', orlokCtx());
      expect(m.matched).to.equal(true);
    });
    it('requireAddressByName: unaddressed command refuses with not_addressed', function () {
      const m = matchOrder('raise your arm', orlokCtx({ requireAddressByName: true }));
      expect(m).to.deep.include({ matched: false, reason: 'not_addressed' });
    });
    it('requireAddressByName: addressed command matches', function () {
      const m = matchOrder('Orlok, raise your arm', orlokCtx({ requireAddressByName: true }));
      expect(m.matched).to.equal(true);
      expect(m.addressed).to.equal(true);
    });
  });

  describe('custom commands outrank everything but stop', function () {
    it('exact phrase match fires the configured action', function () {
      const ctx = minaCtx({
        commands: [{ phrases: ['close your coffin door'], action: { kind: 'part', partId: '4', verb: 'close', durationMs: 2500 } }]
      });
      const m = matchOrder('close your coffin door', ctx);
      expect(m.kind).to.equal('command');
      expect(m.command.action.partId).to.equal('4');
    });
    it('containment match works for phrases of 2+ tokens', function () {
      const ctx = orlokCtx({
        commands: [{ phrases: ['raise your arm'], action: { kind: 'pose', poseId: 21 } }]
      });
      const m = matchOrder('I want you to raise your arm right now', ctx);
      expect(m.kind).to.equal('command');
    });
  });

  describe('pose matching', function () {
    it('"raise your arm" resolves to the Arm Raise Full pose', function () {
      const m = matchOrder('raise your arm', orlokCtx());
      expect(m).to.include({ matched: true, kind: 'pose', poseId: 21 });
    });
    it('"lower your arm" resolves to Arm Lower', function () {
      const m = matchOrder('lower your arm', orlokCtx());
      expect(m).to.include({ matched: true, kind: 'pose', poseId: 22 });
    });
    it('pose matching can be disabled per character', function () {
      const m = matchOrder('raise your arm', orlokCtx({ enablePoseMatching: false }));
      // Falls through to part matching: "arm" hits Right Arm of Orlok.
      expect(m.kind).to.equal('part');
      expect(m.part.partId).to.equal('1');
    });
  });

  describe('gesture matching', function () {
    it('matches against the intent string', function () {
      const m = matchOrder('show your contempt', orlokCtx());
      expect(m.matched).to.equal(true);
      expect(m.kind).to.equal('gesture');
      expect(m.gestureId).to.equal('contempt_turn');
    });
  });

  describe('part + verb matching', function () {
    it('flavor suffix stripped: "raise your right arm" hits Right Arm of Orlok', function () {
      const m = matchOrder('raise your right arm', orlokCtx({ enablePoseMatching: false }));
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '1', verb: 'open' });
    });
    it('alias resolves Mina\'s coffin door with close → retract-direction verb', function () {
      const m = matchOrder('close the coffin door', minaCtx());
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '4', verb: 'close' });
    });
    it('invertOpenClose flips the direction for backwards-mounted mechanisms', function () {
      const ctx = minaCtx({ partAliases: [{ alias: 'coffin door', partId: '4', invertOpenClose: true }] });
      const m = matchOrder('close the coffin door', ctx);
      expect(m.verb).to.equal('open');
      expect(m.invertedByAlias).to.equal(true);
    });
    it('lights accept on/off: "light up the hand of azura"', function () {
      const m = matchOrder('light up the hand of azura', orlokCtx());
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '8', verb: 'on' });
    });
    it('verb/type mismatch refuses: "turn on the jaw"', function () {
      const m = matchOrder('turn on the jaw', orlokCtx());
      expect(m).to.deep.include({ matched: false, reason: 'verb_object_mismatch' });
    });
    it('no verb refuses with no_verb', function () {
      const m = matchOrder('the jaw', orlokCtx({ enablePoseMatching: false, enableGestureMatching: false }));
      expect(m).to.deep.include({ matched: false, reason: 'no_verb' });
    });
    it('verb with no object refuses with no_object', function () {
      const m = matchOrder('raise', orlokCtx({ enablePoseMatching: false, enableGestureMatching: false }));
      expect(m).to.deep.include({ matched: false, reason: 'no_object' });
    });
    it('nonsense object refuses below threshold', function () {
      const m = matchOrder('raise the drawbridge', orlokCtx({ enablePoseMatching: false, enableGestureMatching: false }));
      expect(m.matched).to.equal(false);
      expect(['below_threshold', 'ambiguous']).to.include(m.reason);
    });
  });

  describe('ambiguity', function () {
    it('five identical "T Act" parts refuse as ambiguous with candidates', function () {
      const m = matchOrder('extend the t act', pumpkinCtx());
      expect(m.matched).to.equal(false);
      expect(m.reason).to.equal('ambiguous');
      expect(m.candidates.length).to.be.greaterThan(1);
    });
    it('a unique part on the same character still matches', function () {
      const m = matchOrder('raise the wiper motor', pumpkinCtx());
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '12' });
    });
  });

  describe('speaker orders', function () {
    it('"be quiet" with no object silences the speaker if one exists', function () {
      const ctx = orlokCtx();
      ctx.parts.push({ partId: '20', type: 'speaker', name: 'Voice of Orlok', description: '', markers: [] });
      const m = matchOrder('be quiet', ctx);
      expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '20', verb: 'quiet' });
    });
  });

  describe('refusal hygiene', function () {
    it('empty transcript refuses as empty', function () {
      expect(matchOrder('', orlokCtx()).reason).to.equal('empty');
      expect(matchOrder('um, okay', orlokCtx()).reason).to.equal('empty');
    });
  });
});
