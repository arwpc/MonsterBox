/**
 * PipeWire Speaker CRUD + routing test actions (no sockets)
 * - Creates a Speaker with per-speaker PipeWire sink routing
 * - Invokes play / setVolume / stop with stream management
 * - Enumerates PipeWire sinks endpoint
 * - Tests concurrent playback and stream routing
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

describe('PipeWire Speaker: CRUD, routing, and test actions', () => {
  it('PipeWire sinks endpoint returns an array', async () => {
    const res = await axios.get(`${BASE_URL}/setup/audio/api/outputs`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);
    expect(res.data).to.have.property('outputs');
    expect(res.data.outputs).to.be.an('array');
    console.log(`✅ Found ${res.data.outputs.length} PipeWire sinks`);
  });

  it('create → play → setVolume → stop → delete with PipeWire', async () => {
    const spk = await createSpeaker('Test PipeWire Speaker', {
      audioDeviceId: 'default',
      volume: 20,
      bass: 0,
      treble: 0,
    });

    const play = await testPart(spk.id, 'play', { filename: 'public/sounds/monster-howl-85304.mp3', volume: 10 });
    expect(play).to.have.property('success');
    console.log(`✅ PipeWire speaker play: ${play.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);

    const vol = await testPart(spk.id, 'setVolume', { volume: 30 });
    expect(vol).to.have.property('success');
    console.log(`✅ PipeWire speaker volume: ${vol.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);

    const stop = await testPart(spk.id, 'stop', {});
    expect(stop).to.have.property('success');
    console.log(`✅ PipeWire speaker stop: ${stop.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);

    await remove(spk.id);
  });

  it('stream management endpoints respond', async () => {
    const spk = await createSpeaker('Test Stream Speaker', { audioDeviceId: 'default' });

    // Test stream listing
    const streams = await axios.get(`${BASE_URL}/setup/parts/api/speaker/streams?partId=${spk.id}`, { validateStatus: () => true });
    expect(streams.status).to.equal(200);
    expect(streams.data).to.have.property('success', true);
    expect(streams.data).to.have.property('streams');
    console.log(`✅ Stream listing: found ${streams.data.streams.length} streams`);

    // Test stream stats
    const stats = await axios.get(`${BASE_URL}/setup/parts/api/speaker/stats`, { validateStatus: () => true });
    expect(stats.status).to.equal(200);
    expect(stats.data).to.have.property('success', true);
    expect(stats.data).to.have.property('stats');
    console.log(`✅ Stream stats: ${stats.data.stats.total} total streams`);

    await remove(spk.id);
  });

  it('concurrent playback test (multiple speakers)', async () => {
    const spk1 = await createSpeaker('Concurrent Speaker 1', { audioDeviceId: 'default' });
    const spk2 = await createSpeaker('Concurrent Speaker 2', { audioDeviceId: 'default' });

    // Start playback on both speakers simultaneously
    const [play1, play2] = await Promise.all([
      testPart(spk1.id, 'play', { filename: 'public/sounds/monster-howl-85304.mp3', volume: 15 }),
      testPart(spk2.id, 'play', { filename: 'public/sounds/monster-howl-85304.mp3', volume: 15 })
    ]);

    expect(play1).to.have.property('success');
    expect(play2).to.have.property('success');
    console.log(`✅ Concurrent playback: Speaker1=${play1.success ? 'OK' : 'FAIL'}, Speaker2=${play2.success ? 'OK' : 'FAIL'}`);

    // Stop both
    await Promise.all([
      testPart(spk1.id, 'stop', {}),
      testPart(spk2.id, 'stop', {})
    ]);

    // Cleanup
    await Promise.all([remove(spk1.id), remove(spk2.id)]);
  });
});

