/**
 * ElevenLabs Agents models API smoke test
 */

import request from 'supertest';
import { expect } from 'chai';

describe('GET /api/elevenlabs/models', function () {
  it('should return models when API is configured, else skip', async function () {
    this.timeout(20000);
    const res = await request('http://localhost:3000')
      .get('/api/elevenlabs/models')
      .send();
    if (res.status === 400) {
      console.warn('Skipping models test: ElevenLabs not configured');
      return;
    }
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('models');
    expect(Array.isArray(res.body.models)).to.equal(true);
  });
});

