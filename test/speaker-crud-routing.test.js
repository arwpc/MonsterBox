/**
 * Speaker CRUD + routing test actions (no sockets)
 * - Creates a Speaker with per-speaker audioDeviceId
 * - Invokes play / setVolume / stop
 * - Enumerates audio outputs endpoint
 * - Cleans up by deleting the part
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function createSpeaker(name, config = {}) {
  const res = await axios.post(
    `${BASE_URL}/setup/parts/api/parts`,
    { name, type: 'speaker', description: name, config },
    { validateStatus: () => true }
  );
  expect(res.status).to.be.oneOf([200, 201]);
  expect(res.data).to.have.property('success', true);
  expect(res.data).to.have.property('part');
  return res.data.part;
}

async function testPart(id, action, params) {
  const res = await axios.post(
    `${BASE_URL}/setup/parts/api/parts/${id}/test`,
    { action, params },
    { validateStatus: () => true }
  );
  expect(res.status).to.equal(200);
  // Only assert the API contract; hardware players may not exist in CI
  expect(res.data).to.have.property('testResult');
  return res.data;
}

async function remove(id) {
  const del = await axios.delete(`${BASE_URL}/setup/parts/api/parts/${id}`, { validateStatus: () => true });
  expect(del.status).to.equal(200);
  const get = await axios.get(`${BASE_URL}/setup/parts/api/parts/${id}`, { validateStatus: () => true });
  expect(get.status).to.equal(404);
}

describe('Speaker: CRUD, routing, and test actions', () => {
  it('audio outputs endpoint returns an array', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/outputs`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('outputs');
    expect(res.data.outputs).to.be.an('array');
  });

  it('create → play → setVolume → stop → delete', async () => {
    const spk = await createSpeaker('Test Speaker', {
      audioDeviceId: 'default',
      volume: 20,
      bass: 0,
      treble: 0,
    });

    const play = await testPart(spk.id, 'play', { filename: 'public/sounds/monster-howl-85304.mp3', volume: 10 });
    expect(play).to.have.property('success');

    const vol = await testPart(spk.id, 'setVolume', { volume: 30 });
    expect(vol).to.have.property('success');

    const stop = await testPart(spk.id, 'stop', {});
    expect(stop).to.have.property('success');

    await remove(spk.id);
  });
});

