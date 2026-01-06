/**
 * Servo Types CRUD + Test Actions (no sockets)
 * - Creates standard, continuous, feedback servos
 * - Invokes a safe test action per type
 * - Cleans up by deleting parts
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function createServo(name, pin, config = {}) {
  const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, { name, type: 'servo', pin, description: name, config }, { validateStatus: () => true });
  expect(res.status).to.equal(201);
  expect(res.data).to.have.property('success', true);
  return res.data.part;
}

async function testPart(id, action, params) {
  const res = await axios.post(`${BASE_URL}/setup/parts/api/parts/${id}/test`, { action, params }, { validateStatus: () => true });
  expect(res.status).to.equal(200);
  // We only assert the API contract here. Hardware is simulated for PCA9685 path
  expect(res.data).to.have.property('testResult');
  return res.data;
}

async function remove(id) {
  const del = await axios.delete(`${BASE_URL}/setup/parts/api/parts/${id}`, { validateStatus: () => true });
  expect(del.status).to.equal(200);
  const get = await axios.get(`${BASE_URL}/setup/parts/api/parts/${id}`, { validateStatus: () => true });
  expect(get.status).to.equal(404);
}

describe('Servo types: CRUD and test actions (no sockets)', () => {
  it('standard: create → moveToAngle → delete', async () => {
    const servo = await createServo('Std Servo', 18, {
      servoType: 'standard',
      controllerType: 'pca9685', // forces simulated path
      channel: 0
    });

    const result = await testPart(servo.id, 'moveToAngle', { angleDeg: 15 });
    expect(result).to.have.property('success');

    await remove(servo.id);
  });

  it('continuous: create → rotateContinuous → stop → delete', async () => {
    const servo = await createServo('Cont Servo', 19, {
      servoType: 'continuous',
      controllerType: 'pca9685',
      channel: 1
    });

    const go = await testPart(servo.id, 'rotateContinuous', { direction: 'cw', speed: 35, duration: 500 });
    expect(go).to.have.property('success');

    const stop = await testPart(servo.id, 'stop', {});
    expect(stop).to.have.property('success');

    await remove(servo.id);
  });

  it('feedback: create → moveToAngle → delete', async () => {
    const servo = await createServo('FB Servo', 20, {
      servoType: 'feedback',
      controllerType: 'pca9685',
      channel: 2
    });

    const result = await testPart(servo.id, 'moveToAngle', { angleDeg: 5 });
    expect(result).to.have.property('success');

    await remove(servo.id);
  });
});

