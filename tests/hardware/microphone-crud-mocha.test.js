/**
 * Microphone API tests via HTTP using Mocha.
 * Tests audio input enumeration and level detection.
 * Part CRUD tests are skipped as the API doesn't support direct part creation.
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3100';
const AUDIO_API = `${BASE_URL}/setup/audio/api`;

describe('Microphone API (Mocha)', function() {
  this.timeout(5000);
  let chosenDevice = 'default';

  it('enumerates inputs and chooses a device', async () => {
    const res = await axios.get(`${AUDIO_API}/inputs`, { validateStatus: () => true, timeout: 3000 });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('inputs').that.is.an('array');
    if (res.data.inputs.length) {
      chosenDevice = res.data.inputs[0].id || 'default';
    }
  });

  it('tests microphone input level', async () => {
    const res = await axios.get(`${AUDIO_API}/input-level`, { 
      params: { device: chosenDevice },
      validateStatus: () => true,
      timeout: 3000
    });
    expect(res.status).to.equal(200);
    expect(res.data).to.be.an('object');
    expect(res.data).to.have.property('success');
    if (res.data.success) {
      expect(res.data).to.have.property('level');
    }
  });
});

