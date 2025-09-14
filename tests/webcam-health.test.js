import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await axios.get(BASE_URL); if (res && res.status >= 200) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('WebRTC health endpoint', function(){
  this.timeout(15000);
  before(async () => { await waitForServer(10000); });
  it('returns success with wrtc flag', async function(){
    const res = await axios.get(BASE_URL + '/setup/webcam/api/webrtc/health');
    if (!res || res.status !== 200) throw new Error('Health endpoint not OK');
    if (!res.data || res.data.success !== true) throw new Error('Health success not true');
    if (typeof res.data.wrtc === 'undefined') throw new Error('wrtc field missing');
  });
});

