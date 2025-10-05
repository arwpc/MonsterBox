import axios from 'axios';
import { spawn } from 'child_process';

const BASE_URL = 'http://127.0.0.1:3100';
let child = null;

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(BASE_URL);
      if (res && res.status >= 200 && res.status < 500) return true;
    } catch (_) {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('Server boot', function () {
  this.timeout(20000);

  before(async () => {
    const up = await waitForServer(1000);
    if (up) return; // already running
    // start server
    child = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
    const ok = await waitForServer(15000);
    if (!ok) {
      throw new Error('Server did not start in time');
    }
  });

  after(async () => {
    // Defer server shutdown to the very end of the entire test process to avoid
    // breaking other test files that rely on the running server.
    if (process.env.KILL_SERVER_AFTER_TESTS === '1' && child) {
      process.once('exit', () => {
        try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
      });
    }
  });

  it('server is up', async () => {
    const res = await axios.get(BASE_URL);
    if (!res || res.status < 200 || res.status >= 500) throw new Error('Server not healthy');
  });
});

