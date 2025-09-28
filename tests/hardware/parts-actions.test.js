/**
 * MonsterBox 4.0 - Parts Test Actions API Tests
 * Verifies that each part type supports at least one meaningful test action
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://127.0.0.1:3100';


const HW_AVAILABLE = process.env.MONSTERBOX_HARDWARE_AVAILABLE === 'true';
function expectHwAware(res) {
  if (HW_AVAILABLE) expect(res).to.have.property('success', true);
  else expect(res).to.have.property('success').that.is.a('boolean');
}

async function createPart(type, overrides = {}) {
  const defaultsByType = {
    motor: { name: 'T Motor', type: 'motor', pin: 18, description: 'DC motor', config: {} },
    linear_actuator: { name: 'T Act', type: 'linear_actuator', pin: 19, description: 'Linear actuator', config: {} },
    light: { name: 'T Light', type: 'light', pin: 20, description: 'Light', config: {} },
    led: { name: 'T LED', type: 'led', pin: 21, description: 'LED', config: {} },
    servo: { name: 'T Servo', type: 'servo', pin: 12, description: 'Servo', config: { servoType: 'standard' } },
    sensor: { name: 'T Sensor', type: 'sensor', pin: 14, description: 'Sensor', config: { sensorType: 'digital' } },
    motion_sensor: { name: 'T Motion', type: 'motion_sensor', pin: 16, description: 'Motion', config: {} },
    webcam: { name: 'T Webcam', type: 'webcam', description: 'Webcam', config: {} },
    microphone: { name: 'T Mic', type: 'microphone', description: 'Mic', config: {} },
    speaker: { name: 'T Speaker', type: 'speaker', description: 'Speaker', config: {} },
    head_tracking: { name: 'T HT', type: 'head_tracking', description: 'Head tracking', config: {} }
  };
  const body = { ...(defaultsByType[type] || {}), ...overrides };
  const res = await request(BASE_URL).post('/setup/parts/api/parts').send(body).expect(201);
  expect(res.body).to.have.property('success', true);
  return res.body.part;
}

function defaultActionPayload(part) {
  switch (part.type) {
    case 'servo': return { action: 'moveToAngle', params: { angleDeg: 15 } };
    case 'led': return { action: 'setBrightness', params: { brightness: 50 } };
    case 'light': return { action: 'toggle', params: {} };
    case 'motor': return { action: 'control', params: { direction: 'cw', speed: 50, duration: 200 } };
    case 'linear_actuator': return { action: 'extend', params: { speed: 50, distance: 10 } };
    case 'sensor': return { action: 'read', params: {} };
    case 'motion_sensor': return { action: 'read', params: {} };
    case 'microphone': return { action: 'getLevel', params: {} };
    case 'speaker': return { action: 'stop', params: {} };
    case 'webcam': return { action: 'capture', params: { resolution: '640x480' } };
    case 'head_tracking': return { action: 'getPosition', params: {} };
    default: return { action: '', params: {} };
  }
}

async function testPart(part) {
  const payload = defaultActionPayload(part);
  const res = await request(BASE_URL)
    .post(`/setup/parts/api/parts/${part.id}/test`)
    .send(payload)
    .expect(200);
  return res.body;
}

describe('Parts Test Actions API', () => {
  it('servo: moveToAngle', async () => {
    const part = await createPart('servo');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result).to.have.property('testResult');
    expect(result.testResult).to.have.property('action', 'moveToAngle');
  });

  it('led: setBrightness', async () => {
    const part = await createPart('led');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'setBrightness');
  });

  it('light: toggle', async () => {
    const part = await createPart('light');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'toggle');
  });

  it('motor: control', async () => {
    const part = await createPart('motor');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'control');
  });

  it('linear_actuator: extend', async () => {
    const part = await createPart('linear_actuator');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'extend');
  });

  it('sensor: read', async () => {
    const part = await createPart('sensor');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'read');
  });

  it('motion_sensor: read', async () => {
    const part = await createPart('motion_sensor');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'read');
  });

  it('microphone: getLevel', async () => {
    const part = await createPart('microphone');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'getLevel');
  });

  it('speaker: stop', async () => {
    const part = await createPart('speaker');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'stop');
  });

  it('webcam: capture', async () => {
    const part = await createPart('webcam');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'capture');
  });

  it('head_tracking: getPosition', async () => {
    const part = await createPart('head_tracking');
    const result = await testPart(part);
    expectHwAware(result);
    expect(result.testResult).to.have.property('action', 'getPosition');
  });
});

