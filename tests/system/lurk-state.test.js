/**
 * Lurk state machine endpoints (services/lurkStateService.js, decision D3).
 *
 * READ-ONLY against the running server on purpose: :3100 is the production
 * process with real hardware and a real ElevenLabs agent, so a wake here would
 * open a billed session and move the character. Only GETs and requests the
 * server rejects at validation are sent. The transitions themselves are covered
 * by tests/unit/lurk-state.test.js on injected fakes.
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Lurk state machine API (read-only)', function () {
  this.timeout(20000);

  it('GET /conversation/api/lurk-state reports one of the three states', async () => {
    const res = await request(BASE_URL).get('/conversation/api/lurk-state').expect(200);
    expect(res.body).to.have.property('success', true);
    expect(['lurking', 'awake', 'off']).to.include(res.body.state);
    expect(res.body).to.have.property('prefs').that.is.an('object');
    expect(res.body.prefs).to.have.property('inactivityTimeoutMs').that.is.a('number');
  });

  it('GET /conversation/api/lurk-mode keeps the dashboard shape and adds the state', async () => {
    const res = await request(BASE_URL).get('/conversation/api/lurk-mode').expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('enabled').that.is.a('boolean');
    expect(res.body).to.have.property('sleeping').that.is.a('boolean');
    expect(res.body).to.have.property('state');
  });

  it('GET /conversation/api/lurk-mode/capabilities returns booleans plus reasons', async () => {
    const res = await request(BASE_URL).get('/conversation/api/lurk-mode/capabilities').expect(200);
    expect(res.body).to.have.property('success', true);
    for (const key of ['ai', 'jaw', 'led', 'headTracking', 'idle', 'motionSensor', 'aiMotion', 'followOrders']) {
      expect(res.body.capabilities).to.have.property(key).that.is.a('boolean');
    }
    expect(res.body).to.have.property('detail').that.is.an('object');
  });

  it('GET /conversation/api/ai-status reports AI mode and the live agent separately', async () => {
    const res = await request(BASE_URL).get('/conversation/api/ai-status').expect(200);
    expect(res.body).to.have.property('enabled').that.is.a('boolean');
    expect(res.body).to.have.property('agentLive').that.is.a('boolean');
    expect(res.body).to.have.property('state');
  });

  it('POST /conversation/api/lurk-state/prefs rejects an invalid patch', async () => {
    const res = await request(BASE_URL).post('/conversation/api/lurk-state/prefs')
      .send({ inactivityTimeoutMs: -5 }).expect(400);
    expect(res.body).to.have.property('success', false);
  });

  it('POST /conversation/api/lurk/event-hold refuses a character this node does not animate', async () => {
    // A character id no node has: refused before anything is held.
    const res = await request(BASE_URL).post('/conversation/api/lurk/event-hold?characterId=987654')
      .send({ characterId: 987654, reason: 'system-test' }).expect(409);
    expect(res.body).to.have.property('success', false);
    expect(res.body.error).to.match(/not the character this node animates/);
  });

  it('POST /conversation/api/lurk-mode rejects an invalid inactivity timeout', async () => {
    const res = await request(BASE_URL).post('/conversation/api/lurk-mode')
      .send({ enabled: true, inactivityTimeoutMs: -1 }).expect(400);
    expect(res.body).to.have.property('success', false);
  });
});
