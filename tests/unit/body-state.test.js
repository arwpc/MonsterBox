/**
 * Body State Service unit suite — proprioception by intent.
 * Pure in-memory service: no filesystem, no server, no hardware.
 */
import { expect } from 'chai';
import bodyState from '../../services/bodyStateService.js';

// Fictional character ids well clear of the real fleet (1-6).
const CHAR = 901;
const OTHER = 902;

describe('Body state service', function () {
  beforeEach(function () {
    bodyState.clearBodyState(CHAR);
    bodyState.clearBodyState(OTHER);
  });

  describe('recordPartAction + summarize', function () {
    it('starts with no state (summarize returns null)', function () {
      expect(bodyState.summarize(CHAR)).to.equal(null);
    });

    it('records a verb-level order semantic', function () {
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' },
        { verb: 'open', source: 'follow-orders' });
      expect(bodyState.summarize(CHAR)).to.include('Your Right Arm is raised.');
    });

    it('derives semantics from raw actions', function () {
      bodyState.recordPartAction(CHAR, { partId: '8', partName: 'Hand Lamp', type: 'light' },
        { action: 'turnOn', source: 'control-part' });
      bodyState.recordPartAction(CHAR, { partId: '4', partName: 'Box Lid', type: 'linear_actuator' },
        { action: 'retract', source: 'control-part' });
      const text = bodyState.summarize(CHAR);
      expect(text).to.include('Your Hand Lamp is on.');
      expect(text).to.include('Your Box Lid is retracted.');
    });

    it('newer state replaces older for the same part', function () {
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' }, { verb: 'open' });
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' }, { verb: 'close' });
      const text = bodyState.summarize(CHAR);
      expect(text).to.include('lowered');
      expect(text).to.not.include('raised');
    });

    it('keeps characters independent', function () {
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' }, { verb: 'open' });
      expect(bodyState.summarize(OTHER)).to.equal(null);
    });

    it('never throws on malformed input', function () {
      expect(() => bodyState.recordPartAction(null, null, null)).to.not.throw();
      expect(() => bodyState.recordPartAction(CHAR, {}, {})).to.not.throw();
    });
  });

  describe('describeChange', function () {
    it('event-frames a change that followed a spoken order', function () {
      bodyState.recordOrder(CHAR, 'raise your arm');
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' },
        { verb: 'open', source: 'follow-orders' });
      const change = bodyState.describeChange(CHAR, '1');
      expect(change.text).to.include('You just obeyed a spoken order');
      expect(change.text).to.include('raise your arm');
      expect(change.text).to.include('Right Arm is now raised');
      expect(change.contextId).to.equal('body_state_part_1');
    });

    it('states plain fact for a non-order change', function () {
      bodyState.recordPartAction(CHAR, { partId: '8', partName: 'Hand Lamp', type: 'light' },
        { action: 'turnOff', source: 'control-part' });
      const change = bodyState.describeChange(CHAR, '8');
      expect(change.text).to.equal('Your Hand Lamp is now off.');
    });

    it('returns null for unknown parts', function () {
      expect(bodyState.describeChange(CHAR, '99')).to.equal(null);
    });
  });

  describe('poses and gestures', function () {
    it('summarize includes the held pose', function () {
      bodyState.recordPose(CHAR, 'Arm Raise Full', { source: 'pose-engine' });
      expect(bodyState.summarize(CHAR)).to.include('"Arm Raise Full" pose');
    });

    it('describePose event-frames after an order', function () {
      bodyState.recordOrder(CHAR, 'raise your arm');
      bodyState.recordPose(CHAR, 'Arm Raise Full', { source: 'follow-orders' });
      const d = bodyState.describePose(CHAR);
      expect(d.text).to.include('You just obeyed a spoken order');
      expect(d.contextId).to.equal('body_state_pose');
    });

    it('records gestures in getBodyState', function () {
      bodyState.recordGesture(CHAR, 'contempt_turn', { source: 'gesture-engine' });
      expect(bodyState.getBodyState(CHAR).lastGesture.id).to.equal('contempt_turn');
    });
  });

  describe('onChange', function () {
    it('emits change events and unsubscribes cleanly', function () {
      const seen = [];
      const off = bodyState.onChange(e => seen.push(e));
      bodyState.recordPartAction(CHAR, { partId: '1', partName: 'Right Arm', type: 'linear_actuator' }, { verb: 'open' });
      bodyState.recordPose(CHAR, 'Neutral', {});
      off();
      bodyState.recordGesture(CHAR, 'after-unsubscribe', {});
      expect(seen.length).to.equal(2);
      expect(seen[0]).to.include({ kind: 'part', partId: '1' });
      expect(seen[1]).to.include({ kind: 'pose' });
    });
  });
});
