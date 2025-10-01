/**
 * STT testSample API (dryRun) integration test
 */

import request from 'supertest';
import { expect } from 'chai';

describe('POST /api/elevenlabs/stt/testSample?dryRun=1', function () {
  it('should capture bytes (possibly 0 on CI) and report path', async function () {
    this.timeout(15000);
    // Use running server on localhost:3000 to avoid importing server.js (which starts a listener)
    const res = await request('http://localhost:3000')
      .post('/api/elevenlabs/stt/testSample?duration=1&dryRun=1')
      .send({ deviceId: 'default', model: 'eleven_multilingual_v2', language: 'auto' })
      .expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('sizeBytes');
    expect(res.body).to.have.property('usedPath');
    // sizeBytes may be 0 on environments without audio; do not fail hard
    console.log('testSample(dryRun) -> bytes=%d via %s', res.body.sizeBytes, res.body.usedPath);
  });
});

