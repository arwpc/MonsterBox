/**
 * Microphone inputs endpoint + quick level probe.
 * This does not create a microphone part; it verifies the endpoints exist and respond.
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

describe('Microphone: inputs enumeration and level test', () => {
  it('audio inputs endpoint returns an array', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/inputs`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('inputs');
    expect(res.data.inputs).to.be.an('array');
  });

  it('input-level endpoint responds (may return error if no mic)', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/input-level`, {
      params: { deviceId: 'default', seconds: 0.5 },
      validateStatus: () => true,
    });
    // We only expect the endpoint to exist and return JSON. Status may be 200 or 500 depending on hardware availability in CI.
    expect(res.headers['content-type']).to.match(/application\/json/);
    expect(res.data).to.be.an('object');
  });
});

