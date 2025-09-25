/**
 * PipeWire Microphone sources endpoint + quick level probe.
 * This does not create a microphone part; it verifies the PipeWire endpoints exist and respond.
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

describe('PipeWire Microphone: sources enumeration and level test', () => {
  it('PipeWire sources endpoint returns an array', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/inputs`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('inputs');
    expect(res.data.inputs).to.be.an('array');
    console.log(`✅ Found ${res.data.inputs.length} PipeWire sources`);
  });

  it('input-level endpoint responds with PipeWire defaults (may return error if no mic)', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/input-level`, {
      params: { device: 'default', duration: 0.2 },
      validateStatus: () => true,
    });
    // We only expect the endpoint to exist and return JSON. Status may be 200 or 500 depending on hardware availability in CI.
    expect(res.headers['content-type']).to.match(/application\/json/);
    expect(res.data).to.be.an('object');
    console.log(`✅ PipeWire microphone level test: ${res.data.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);
  });

  it('PipeWire availability check endpoint responds', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/check-pipewire`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('tools');
    console.log(`✅ PipeWire tools available:`, Object.keys(res.data.tools).filter(k => res.data.tools[k]).join(', '));
  });
});

