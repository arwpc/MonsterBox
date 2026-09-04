/**
 * Agent greeting suppression — which turn is a REPLY and which is the agent's
 * unprompted opening.
 *
 * A fresh agent socket always opens with the configured first_message as its own
 * turn, BEFORE the reply to the question just sent. The one-shot collector used
 * to concatenate every fragment, so the greeting was glued onto the front of
 * every answer and its audio played first. Guests heard the character
 * re-introduce itself on every single turn — one animatronic answered "how did
 * you know my name?" by first re-asking "who are you?", after it had already
 * used the name.
 *
 * The real message sequence, captured from a live socket before the fix was
 * written:
 *
 *   event_id 1  agent_response  in_response_to_ids: []            <- the greeting
 *   event_id 2  agent_response  in_response_to_ids: ["<our id>"]  <- the answer
 *
 * Audio chunks carry a matching event_id but arrive BEFORE the turn is
 * classified, which is why the collector stages them per event and releases
 * them only once the verdict is known.
 *
 * Pure: no server, no socket, no hardware.
 */
import { expect } from 'chai';
import { isAnswerTurn } from '../../services/elevenLabsWebSocketService.js';

describe('Agent greeting suppression — isAnswerTurn', function () {

  it('an unprompted turn (empty in_response_to_ids) is NOT an answer', function () {
    expect(isAnswerTurn({ event_id: 1, in_response_to_ids: [] })).to.equal(false);
  });

  it('a turn naming the message it answers IS an answer', function () {
    expect(isAnswerTurn({ event_id: 2, in_response_to_ids: ['8652be0c-e47e-4dca'] })).to.equal(true);
  });

  it('several ids still counts as an answer', function () {
    expect(isAnswerTurn({ in_response_to_ids: ['a', 'b'] })).to.equal(true);
  });

  describe('fails toward the answer, never toward silence', function () {
    // This layer may only ever SUPPRESS A GREETING. If it could also suppress a
    // real answer, an agent that reports the field differently would go mute —
    // a far worse failure than the repeated greeting this fixes. Every
    // uncertain shape therefore resolves to "answer".
    it('an absent field is an answer', function () {
      expect(isAnswerTurn({ event_id: 1 })).to.equal(true);
    });
    it('a null field is an answer', function () {
      expect(isAnswerTurn({ in_response_to_ids: null })).to.equal(true);
    });
    it('a non-array field is an answer', function () {
      expect(isAnswerTurn({ in_response_to_ids: 'abc' })).to.equal(true);
    });
    it('a missing event object is an answer', function () {
      expect(isAnswerTurn(undefined)).to.equal(true);
      expect(isAnswerTurn(null)).to.equal(true);
    });
  });

  it('classifies a full observed exchange: greeting then answer', function () {
    const observed = [
      { event_id: 1, in_response_to_ids: [], agent_response: 'Wait — is someone there? Who are you?' },
      { event_id: 2, in_response_to_ids: ['ec770b90'], agent_response: 'I have heard it whispered in the wind.' }
    ];
    const kept = observed.filter(isAnswerTurn).map(e => e.agent_response);
    expect(kept).to.deep.equal(['I have heard it whispered in the wind.']);
  });
});
