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

describe('Scenes API', function(){
  this.timeout(20000);
  before(async () => { await waitForServer(10000); });

  let createdId = null;

  it('creates a scene', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api', { name: 'Test Scene', steps: [] });
    if (!res || res.status !== 200) throw new Error('Create failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Create failed: no success');
    if (!res.data.scene || !res.data.scene.id) throw new Error('Create failed: no scene id');
    createdId = res.data.scene.id;
  });

  it('lists scenes', async function(){
    const res = await axios.get(BASE_URL + '/scenes/api');
    if (!res || res.status !== 200) throw new Error('List failed: bad status');
    if (!res.data || !res.data.success) throw new Error('List failed: no success');
    if (!Array.isArray(res.data.scenes)) throw new Error('List failed: scenes not array');
  });

  it('plays a scene (no-op steps)', async function(){
    if (!createdId) this.skip();
    const res = await axios.post(BASE_URL + '/scenes/api/' + createdId + '/play');
    if (!res || res.status !== 200) throw new Error('Play failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Play failed: no success');
  });
});

