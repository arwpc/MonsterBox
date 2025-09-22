/**
 * ElevenLabs TTS voices API smoke test
 */

import request from 'supertest';
import { expect } from 'chai';

describe('GET /api/elevenlabs/voices', function () {
  it('should return voices when API is configured, else skip', async function () {
    this.timeout(20000);
    const res = await request('http://localhost:3000')
      .get('/api/elevenlabs/voices')
      .send();
    if (res.status === 400) {
      console.warn('Skipping voices test: ElevenLabs not configured');
      return;
    }
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('voices');
    expect(Array.isArray(res.body.voices)).to.equal(true);
  });
});

