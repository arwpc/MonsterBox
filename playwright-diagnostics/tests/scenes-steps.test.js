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

describe('Scenes API - step types (dryRun)', function(){
  this.timeout(20000);
  before(async () => { await waitForServer(10000); });

  function makeScene(steps){
    return axios.post(BASE_URL + '/scenes/api', { name: 'Steps Test', steps });
  }

  it('runs wait step (dryRun)', async function(){
    const { data } = await makeScene([{ type: 'wait', duration: 10 }]);
    const id = data.scene.id;
    const res = await axios.post(BASE_URL + '/scenes/api/' + id + '/play?dryRun=1');
    if (!res.data || !res.data.success) throw new Error('Wait step (dryRun) failed');
  });

  it('runs sayThis step (dryRun)', async function(){
    const { data } = await makeScene([{ type: 'sayThis', text: 'Hello from dry run' }]);
    const id = data.scene.id;
    const res = await axios.post(BASE_URL + '/scenes/api/' + id + '/play?dryRun=1');
    if (!res.data || !res.data.success || !res.data.dryRun) throw new Error('sayThis (dryRun) failed');
  });

  it('runs audio step (dryRun)', async function(){
    const { data } = await makeScene([{ type: 'audio', audioId: 'sample.wav', volume: 50 }]);
    const id = data.scene.id;
    const res = await axios.post(BASE_URL + '/scenes/api/' + id + '/play?dryRun=1');
    if (!res.data || !res.data.success || !res.data.dryRun) throw new Error('audio (dryRun) failed');
  });

  it('runs part step (dryRun)', async function(){
    const { data } = await makeScene([{ type: 'part', partId: 'servo-1', action: 'move', params: { position: 120 } }]);
    const id = data.scene.id;
    const res = await axios.post(BASE_URL + '/scenes/api/' + id + '/play?dryRun=1');
    if (!res.data || !res.data.success || !res.data.dryRun) throw new Error('part (dryRun) failed');
  });

  it('runs concurrent steps (dryRun)', async function(){
    const steps = [
      { type: 'wait', duration: 5, concurrent: true },
      { type: 'wait', duration: 5 }
    ];
    const { data } = await makeScene(steps);
    const id = data.scene.id;
    const res = await axios.post(BASE_URL + '/scenes/api/' + id + '/play?dryRun=1');
    if (!res.data || !res.data.success || !res.data.dryRun) throw new Error('concurrent (dryRun) failed');
  });
});

