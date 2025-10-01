/**
 * MonsterBox 4.0 - Parts CRUD API Tests
 * Verifies create, read, update, delete for representative part types
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://127.0.0.1:3100';

async function create(type, overrides = {}) {
  const defaults = {
    webcam: { name: 'CRUD Webcam', type: 'webcam', description: 'webcam test', config: {} },
    microphone: { name: 'CRUD Mic', type: 'microphone', description: 'mic test', config: {} },
    speaker: { name: 'CRUD Speaker', type: 'speaker', description: 'spk test', config: {} },
    head_tracking: { name: 'CRUD HT', type: 'head_tracking', description: 'ht test', config: {} },
    servo: { name: 'CRUD Servo', type: 'servo', pin: 13, description: 'servo test', config: { servoType: 'standard' } },
  }[type];
  const res = await request(BASE_URL).post('/setup/parts/api/parts').send({ ...(defaults||{}), ...overrides }).expect(201);
  expect(res.body).to.have.property('success', true);
  expect(res.body).to.have.property('part');
  return res.body.part;
}

async function getById(id) {
  const res = await request(BASE_URL).get(`/setup/parts/api/parts/${id}`).expect(200);
  expect(res.body).to.have.property('success', true);
  return res.body.part;
}

async function update(id, payload) {
  const res = await request(BASE_URL).put(`/setup/parts/api/parts/${id}`).send(payload).expect(200);
  expect(res.body).to.have.property('success', true);
  return res.body.part;
}

async function remove(id) {
  const res = await request(BASE_URL).delete(`/setup/parts/api/parts/${id}`).expect(200);
  expect(res.body).to.have.property('success', true);
}

async function ensureDeleted(id) {
  await request(BASE_URL).get(`/setup/parts/api/parts/${id}`).expect(404);
}

async function testAction(id, action, params) {
  const res = await request(BASE_URL).post(`/setup/parts/api/parts/${id}/test`).send({ action, params }).expect(200);
  expect(res.body).to.have.property('success'); // hardware-aware in separate tests
  return res.body;
}

describe('Parts CRUD API', () => {
  it('webcam: full CRUD', async () => {
    const p = await create('webcam');
    const got = await getById(p.id);
    expect(got).to.have.property('name', 'CRUD Webcam');
    const up = await update(p.id, { description: 'updated webcam desc' });
    expect(up).to.have.property('description', 'updated webcam desc');
    await testAction(p.id, 'capture', { resolution: '320x240' });
    await remove(p.id);
    await ensureDeleted(p.id);
  });

  it('microphone: full CRUD', async () => {
    const p = await create('microphone');
    await update(p.id, { description: 'updated mic' });
    await testAction(p.id, 'getLevel', {});
    await remove(p.id);
    await ensureDeleted(p.id);
  });

  it('speaker: full CRUD', async () => {
    const p = await create('speaker');
    await update(p.id, { description: 'updated spk' });
    await testAction(p.id, 'stop', {});
    await remove(p.id);
    await ensureDeleted(p.id);
  });

  it('head_tracking: full CRUD', async () => {
    const p = await create('head_tracking');
    await update(p.id, { description: 'updated ht' });
    await testAction(p.id, 'getPosition', {});
    await remove(p.id);
    await ensureDeleted(p.id);
  });

  it('servo: full CRUD', async () => {
    const p = await create('servo');
    await update(p.id, { description: 'updated servo', config: { servoType: 'standard' } });
    await testAction(p.id, 'moveToAngle', { angleDeg: 10 });
    await remove(p.id);
    await ensureDeleted(p.id);
  });
});

