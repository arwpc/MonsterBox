/**
 * Capability phrases — one vocabulary record, two audiences.
 *
 * A capability carries `intent` (what the AGENT matches on, to choose a motion
 * that suits what it is saying) and `phrases` (what a GUEST says to ask for it
 * out loud). Without the phrase rung the same bow has to be authored twice, once
 * for the agent and once for the order matcher, and the two drift.
 *
 * An authored phrase is an explicit operator instruction, so it outranks every
 * fuzzy score below it — the same standing the custom-command table already has.
 *
 * Fictional character names per the independence audit. Pure: no server, no
 * filesystem, no hardware.
 */
import { expect } from 'chai';
import { matchOrder } from '../../services/followOrders/orderMatcher.js';

function cfg(overrides = {}) {
  return {
    enabled: true, requireAddressByName: false, addressAliases: [], minConfidence: 0.6,
    enablePoseMatching: true, enableGestureMatching: true, enablePartMatching: true,
    commands: [], partAliases: [], ...overrides
  };
}

const PARTS = [
  { partId: '1', type: 'linear_actuator', name: 'Right Arm of Volkar', description: '', markers: [] },
  { partId: '10', type: 'servo', name: 'Jaw of Volkar', description: '', markers: [] },
  { partId: '15', type: 'servo', name: 'Head on a Swivel', description: '', markers: [] }
];

const GESTURES = [
  { id: 'courtly_bow', label: 'Courtly bow', intent: 'receiving a known guest', phrases: ['give me a bow', 'bow for us'] },
  { id: 'hand_glow', label: 'Hand glows', intent: 'granting magic, blessing a child', phrases: ['show me the magic'] },
  { id: 'recoil', label: 'Recoil', intent: 'being startled by holy names', phrases: [] }
];

const ctx = (overrides = {}) => ({
  characterName: 'Volkar', config: cfg(), poses: [], gestures: GESTURES, parts: PARTS, ...overrides
});

describe('Capability phrase matching', function () {

  it('an authored phrase fires its capability with full confidence', function () {
    const m = matchOrder('give me a bow', ctx());
    expect(m).to.include({ matched: true, kind: 'gesture', gestureId: 'courtly_bow', confidence: 1 });
    expect(m.via).to.equal('capability-phrase');
  });

  it('a multi-word phrase contained in a longer sentence still fires', function () {
    const m = matchOrder('hey monster give me a bow please', ctx());
    expect(m).to.nested.include({ matched: true, gestureId: 'courtly_bow' });
    expect(m.via).to.equal('capability-phrase');
  });

  it('casing and punctuation are normalized away', function () {
    const m = matchOrder('Show me the MAGIC!', ctx());
    expect(m).to.nested.include({ matched: true, gestureId: 'hand_glow' });
  });

  it("one capability's phrase never fires a different capability", function () {
    const m = matchOrder('show me the magic', ctx());
    expect(m.gestureId).to.equal('hand_glow');
    expect(m.gestureId).to.not.equal('courtly_bow');
  });

  it('a capability with NO phrases still matches by intent, as before', function () {
    // recoil has phrases: [] — the fuzzy intent rung must still reach it, or
    // adding the phrase field would silently retire every existing capability.
    const m = matchOrder('be startled by holy names', ctx());
    expect(m).to.nested.include({ matched: true, kind: 'gesture', gestureId: 'recoil' });
    expect(m.via).to.not.equal('capability-phrase');
  });

  it('an utterance matching no phrase falls through to the rest of the ladder', function () {
    const m = matchOrder('look at me', ctx());
    expect(m.via).to.not.equal('capability-phrase');
    // "look at me" is a body intent, so it should reach this character's head part.
    expect(m).to.nested.include({ matched: true, kind: 'part', 'part.partId': '15' });
  });

  it('gesture matching switched off disables the phrase rung too', function () {
    const m = matchOrder('give me a bow', ctx({ config: cfg({ enableGestureMatching: false }) }));
    expect(m.via).to.not.equal('capability-phrase');
  });

  it('a character with no capabilities is unaffected', function () {
    const m = matchOrder('give me a bow', ctx({ gestures: [] }));
    expect(m.via).to.not.equal('capability-phrase');
  });
});
