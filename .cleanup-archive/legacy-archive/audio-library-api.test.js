/**
 * Audio Library API smoke test (no new packages)
 */

import request from 'supertest';
import { expect } from 'chai';

describe('GET /audio-library/api/library', function () {
  it('should return audio library contents without 5xx', async function () {
    this.timeout(10000);
    const res = await request('http://localhost:3000')
      .get('/audio-library/api/library')
      .send();
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('audio');
    expect(Array.isArray(res.body.audio)).to.equal(true);
  });
});

