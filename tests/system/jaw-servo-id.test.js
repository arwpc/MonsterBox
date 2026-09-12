/**
 * Jaw animation — a NUMERIC servoPartId must be accepted.
 *
 * Regression for the fix in commit 8642d063. The save route validated the
 * selection with `servos.find(s => s.id === jawConfig.servoPartId)`. Part ids
 * come out of the parts store as STRINGS, so any JSON caller sending a number —
 * which is the natural thing to send, and what the documented body shape implies
 * — got 400 "Selected servo not found", naming a servo that was right there in
 * the list. The UI never hit it because a <select> value is already a string.
 *
 * Found while enabling jaw animation on a character whose jaw servo is present,
 * calibrated and not fault-listed, and whose API refused it anyway.
 *
 * Config-writing discipline per tests/system/follow-orders.test.js: capture the
 * prior config in before() and restore it in after(). A suite that leaves a
 * character's jaw pointed at the wrong servo is worse than no suite.
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Jaw animation — servoPartId type tolerance', function () {
  this.timeout(30000);

  let CHARACTER_ID = 1;
  let priorConfig = null;
  let servos = [];

  before(async () => {
    const res = await request(BASE_URL).get('/api/config');
    CHARACTER_ID = (res.body && res.body.config && res.body.config.selectedCharacter) || 1;

    const cfg = await request(BASE_URL).get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
    if (cfg.status === 200 && cfg.body) {
      priorConfig = cfg.body.jawAnimation || cfg.body.config || null;
      servos = cfg.body.availableServos || cfg.body.servos || [];
    }
  });

  after(async () => {
    if (priorConfig) {
      await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .send(priorConfig);
    }
  });

  it('accepts a NUMERIC servoPartId for a servo that exists', async function () {
    if (!servos.length) return this.skip(); // audio-only character
    const id = servos[0].id;
    const res = await request(BASE_URL)
      .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
      .send({ enabled: false, servoPartId: Number(id) });

    expect(res.status, `numeric id ${Number(id)} rejected: ${JSON.stringify(res.body)}`).to.not.equal(400);
    expect(res.body.error || '').to.not.match(/Selected servo not found/);
  });

  it('accepts the equivalent STRING servoPartId', async function () {
    if (!servos.length) return this.skip();
    const id = servos[0].id;
    const res = await request(BASE_URL)
      .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
      .send({ enabled: false, servoPartId: String(id) });

    expect(res.status).to.not.equal(400);
    expect(res.body.error || '').to.not.match(/Selected servo not found/);
  });

  it('still rejects a servoPartId that genuinely is not in the list', async function () {
    if (!servos.length) return this.skip();
    // The fix compared with String() on both sides; it must not have made the
    // check permissive. An id nobody has must still be refused.
    const res = await request(BASE_URL)
      .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
      .send({ enabled: true, servoPartId: 987654 });

    expect(res.status).to.equal(400);
    expect(String(res.body.error)).to.match(/not found|calibrat/i);
  });
});
