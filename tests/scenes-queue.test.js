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

describe('Scenes Queue API', function(){
  this.timeout(20000);
  before(async () => { await waitForServer(10000); });

  let sceneId = null;

  it('creates a scene for queueing', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api', { name: 'Queueable Scene', steps: [] });
    if (!res || res.status !== 200) throw new Error('Create failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Create failed: no success');
    sceneId = res.data.scene.id;
  });

  it('clears queue', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api/queue/clear');
    if (!res || res.status !== 200) throw new Error('Clear failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Clear failed: no success');
  });

  it('enqueues a scene', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api/queue/enqueue', { sceneId });
    if (!res || res.status !== 200) throw new Error('Enqueue failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Enqueue failed: no success');
    if (!res.data.status || !Array.isArray(res.data.status.items) || res.data.status.items.length < 1) throw new Error('Enqueue failed: queue empty');
  });

  it('gets queue status', async function(){
    const res = await axios.get(BASE_URL + '/scenes/api/queue');
    if (!res || res.status !== 200) throw new Error('Status failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Status failed: no success');
  });

  it('starts the queue', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api/queue/start');
    if (!res || res.status !== 200) throw new Error('Start failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Start failed: no success');
  });

  it('stops the queue (no-op if finished)', async function(){
    const res = await axios.post(BASE_URL + '/scenes/api/queue/stop');
    if (!res || res.status !== 200) throw new Error('Stop failed: bad status');
    if (!res.data || !res.data.success) throw new Error('Stop failed: no success');
  });
});

