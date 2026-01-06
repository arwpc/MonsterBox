/**
 * Microphone CRUD via HTTP API using Mocha (fallback when UI automation is constrained).
 * - Enumerates inputs
 * - Creates a microphone part with the first available input (or 'default')
 * - Tests the microphone (getLevel)
 * - Deletes the part
 *
 * Behavior adapts to hardware availability using env MONSTERBOX_HARDWARE_AVAILABLE.
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const HW_EXPECT = String(process.env.MONSTERBOX_HARDWARE_AVAILABLE || '').toLowerCase() === 'true';

async function createMicPart(name, deviceId){
  const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, {
    name,
    type: 'microphone',
    description: 'Automated test mic',
    config: { deviceId }
  }, { validateStatus: () => true });
  return res;
}

async function deletePart(id){
  return axios.delete(`${BASE_URL}/setup/parts/api/parts/${id}`, { validateStatus: () => true });
}

async function testMic(id){
  return axios.post(`${BASE_URL}/setup/parts/api/parts/${id}/test`, {
    action: 'getLevel',
    params: {}
  }, { validateStatus: () => true });
}

describe('Microphone CRUD (Mocha API path)', () => {
  let createdId = null;
  let chosenDevice = 'default';

  it('enumerates inputs and chooses a device', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/inputs`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('inputs').that.is.an('array');
    if (res.data.inputs.length) {
      chosenDevice = res.data.inputs[0].id || 'default';
    }
  });

  it('creates a microphone part', async () => {
    const name = `Test Mic ${Date.now()}`;
    const res = await createMicPart(name, chosenDevice);
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('part');
    createdId = res.data.part.id;
    expect(createdId).to.be.ok;
  });

  it('tests microphone getLevel', async () => {
    const res = await testMic(createdId);
    expect(res.status).to.equal(200);
    expect(res.data).to.be.an('object');
    // When real hardware is present, expect success
    if (HW_EXPECT) {
      expect(res.data).to.have.property('success', true);
      expect(res.data).to.have.property('result');
      // result may have { level, message, ... }
    } else {
      // Without hardware, API can still respond with success:false, but must be JSON
      expect(res.data).to.have.property('success');
    }
  });

  it('deletes the microphone part', async () => {
    const res = await deletePart(createdId);
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
  });
});

