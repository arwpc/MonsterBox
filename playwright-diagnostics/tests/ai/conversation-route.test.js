import { expect } from 'chai';
import request from 'supertest';
import { spawn } from 'child_process';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
let child = null;

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(BASE_URL);
      if (res && res.status >= 200 && res.status < 500) return true;
    } catch (_) { /* not up */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('Conversation API (integration-lite)', function () {
  this.timeout(20000);

  before(async () => {
    const up = await waitForServer(1000);
    if (up) return; // already running externally
    // Start server with test mode to avoid external TTS calls
    const env = { ...process.env, MB_TEST_MODE: '1' };
    child = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'inherit', env });
    const ok = await waitForServer(15000);
    if (!ok) throw new Error('Server did not start in time');
  });

  after(async () => {
    if (process.env.KILL_SERVER_AFTER_TESTS === '1' && child) {
      try { child.kill('SIGTERM'); } catch (_) {}
      child = null;
    }
  });

  it('POST /api/elevenlabs/conversation/test with text returns replyText', async () => {
    const res = await request(BASE_URL)
      .post('/api/elevenlabs/conversation/test')
      .send({ text: 'Hello AI' })
      .expect(200);

    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('replyText');
    expect(res.body.replyText).to.be.a('string');
  });
});

