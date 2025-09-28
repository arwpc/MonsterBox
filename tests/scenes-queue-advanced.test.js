import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3100';

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await axios.get(BASE_URL); if (res && res.status >= 200) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

async function poll(fn, { timeout = 5000, interval = 100 } = {}){
  const start = Date.now();
  while(Date.now() - start < timeout){
    const v = await fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, interval));
  }
  return null;
}

describe('Advanced Scenes Queue', function(){
  this.timeout(20000);
  before(async () => { await waitForServer(10000); });

  let scene1 = null;
  let scene2 = null;

  it('creates test scenes', async function(){
    const s1 = await axios.post(BASE_URL + '/scenes/api', { name: 'Adv Scene 1', steps: [{ type: 'wait', duration: 50 }] });
    const s2 = await axios.post(BASE_URL + '/scenes/api', { name: 'Adv Scene 2', steps: [{ type: 'wait', duration: 50 }] });
    if (!s1.data.success || !s2.data.success) throw new Error('Failed to create scenes');
    scene1 = s1.data.scene;
    scene2 = s2.data.scene;
  });

  it('starts queue from config with lifecycles', async function(){
    // clear any prior queue
    await axios.post(BASE_URL + '/scenes/api/queue/clear');

    const config = {
      name: 'Advanced Test Queue',
      mode: 'sequential',
      scenes: [
        { scene_id: String(scene1.id), lifecycle: { mode: 'run_once' } },
        { scene_id: String(scene2.id), lifecycle: { mode: 'run_for_duration', duration: 1 } }
      ]
    };
    const res = await axios.post(BASE_URL + '/scenes/api/queue/start-config', config);
    if (!res.data.success) throw new Error('start-config failed');

    // Should be running or just finished quickly; poll for status during run
    const during = await poll(async () => {
      const st = await axios.get(BASE_URL + '/scenes/api/queue');
      return st.data && st.data.status && (st.data.status.running ? st.data.status : null);
    }, { timeout: 3000, interval: 50 });

    // If we catch it running, exercise controls
    if (during) {
      const paused = await axios.post(BASE_URL + '/scenes/api/queue/pause');
      if (!paused.data.success) throw new Error('pause failed');
      const resumed = await axios.post(BASE_URL + '/scenes/api/queue/resume');
      if (!resumed.data.success) throw new Error('resume failed');

      const skipped = await axios.post(BASE_URL + '/scenes/api/queue/skip');
      if (!skipped.data.success) throw new Error('skip failed');
    }

    // Insert priority scene and then emergency stop
    const ins = await axios.post(BASE_URL + '/scenes/api/queue/insert', { sceneId: scene1.id });
    if (!ins.data.success) throw new Error('insert failed');

    const estop = await axios.post(BASE_URL + '/scenes/api/queue/emergency-stop');
    if (!estop.data.success) throw new Error('emergency-stop failed');
  });

  it('queue library CRUD', async function(){
    const cfg = {
      name: 'Library Queue',
      mode: 'loop_queue',
      scenes: [ { scene_id: String(scene1.id), lifecycle: { mode: 'loop_until_disabled', max_duration: 1 } } ]
    };
    const create = await axios.post(BASE_URL + '/scenes/api/queue/library', cfg);
    if (!create.data.success) throw new Error('create library queue failed');
    const qid = create.data.queue.queue_id;

    const list = await axios.get(BASE_URL + '/scenes/api/queue/library');
    if (!list.data.success || !Array.isArray(list.data.queues)) throw new Error('list library queues failed');

    const get = await axios.get(BASE_URL + `/scenes/api/queue/library/${qid}`);
    if (!get.data.success) throw new Error('get library queue failed');

    const exp = await axios.post(BASE_URL + `/scenes/api/queue/library/${qid}/export`);
    if (typeof exp.data !== 'object' && typeof exp.data !== 'string') throw new Error('export failed');

    const del = await axios.delete(BASE_URL + `/scenes/api/queue/library/${qid}`);
    if (!del.data.success) throw new Error('delete library queue failed');
  });
});

