/**
 * Bare-GPIO servo pin resolution (Renfield's Writing Pen, 2026-09-27).
 *
 * The GPIO branch of the servo controller re-read parts.json through the node's
 * selectedCharacter and, when that lookup missed, drove GPIO 18 — the WS2812B
 * data line of Renfield's eye rings. The dispatcher's pin (resolved for the
 * character the call is for) now wins, and an unknown pin is refused.
 */

import { expect } from 'chai';
import { resolveServoPin } from '../../services/hardwareService/servo.js';

describe('Bare-GPIO servo pin resolution', function () {
  it("uses the dispatcher's pin over the re-read part", function () {
    expect(resolveServoPin(20, { id: '7', pin: 26 })).to.equal(20);
    expect(resolveServoPin('20', null)).to.equal(20);
  });

  it("falls back to the re-read part's pin when the dispatcher has none", function () {
    expect(resolveServoPin(undefined, { id: '7', pin: 20 })).to.equal(20);
    expect(resolveServoPin(null, { id: '7', gpioPin: 21 })).to.equal(21);
  });

  it('refuses instead of defaulting to GPIO 18 when no pin is known', function () {
    expect(resolveServoPin(undefined, null)).to.equal(null);
    expect(resolveServoPin(undefined, { id: '7' })).to.equal(null);
    expect(resolveServoPin('', { id: '7', pin: '' })).to.equal(null);
  });
});
