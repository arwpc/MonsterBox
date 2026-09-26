/**
 * Goblins are addressed from the registry, never from config/animatronics.json.
 *
 * The orchestration service used to take its Goblin list from the `goblins`
 * array in config/animatronics.json — two devices (192.168.8.160/.161) that do
 * not exist — so every fleet broadcast reported "2 failed" and never reached a
 * real Goblin, and it spoke https:// and /stop-video to plain-HTTP devices that
 * serve /stop-all. These tests pin the new wiring on a synthetic in-memory
 * registry: the list is the registry, playback and stop go through
 * goblinManagerService (whose methods speak the device's real API and prove
 * the outcome), and a manager refusal counts as a failure in the broadcast.
 *
 * Also pinned: the scene executor's goblin-video step reads `loop` from the
 * step itself (where the Studio stores it) and defaults to play-once, and the
 * registry is persisted only on a status transition, not on every healthy
 * re-ping (that was ~1,700 SD-card writes a day for three healthy devices).
 */
import { expect } from 'chai';
import goblinManagerService from '../../services/goblinManagerService.js';
import orchestrationService from '../../services/orchestrationService.js';
import { executeStep } from '../../services/scenes/sceneExecutor.js';

// The manager loads data/goblins.json asynchronously from its constructor; a
// synthetic registry swapped in before that load lands is silently replaced by
// the real one. Wait for the load (or a short grace on a node with no Goblins).
async function registrySettled() {
  const until = Date.now() + 1500;
  while (goblinManagerService.goblins.size === 0 && Date.now() < until) {
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 50));
}

describe('Goblin orchestration targets (registry, not config)', function () {
  this.timeout(10000);

  let originalRegistry;
  const saved = {};
  const stub = (name, fn) => { saved[name] = goblinManagerService[name]; goblinManagerService[name] = fn; };

  before(async () => {
    await registrySettled();
    originalRegistry = goblinManagerService.goblins;
    goblinManagerService.goblins = new Map([
      ['goblin-10-0-0-5', { id: 'goblin-10-0-0-5', name: 'Test Goblin A', endpoint: 'http://10.0.0.5:3001', status: 'online' }],
      ['goblin-10-0-0-6', { id: 'goblin-10-0-0-6', name: 'Test Goblin B', endpoint: 'http://10.0.0.6:3001', status: 'offline' }],
    ]);
  });

  after(() => {
    goblinManagerService.goblins = originalRegistry;
    for (const name of Object.keys(saved)) goblinManagerService[name] = saved[name];
  });

  it('lists exactly the registry, with ip/port parsed from each endpoint', () => {
    const list = orchestrationService.goblins;
    expect(list.map(g => g.id)).to.deep.equal(['goblin-10-0-0-5', 'goblin-10-0-0-6']);
    expect(list[0]).to.include({ ip: '10.0.0.5', port: 3001, name: 'Test Goblin A' });
    // The config phantoms must be gone for good.
    expect(list.map(g => g.ip)).to.not.include.members(['192.168.8.160', '192.168.8.161']);
  });

  it('"stop" and "stop-video" both stop through the manager, and a refusal is a failure', async () => {
    const calls = [];
    stub('stopGoblin', async (id) => { calls.push(id); return id.endsWith('5') ? { success: true } : { success: false, error: 'not online' }; });
    const r = await orchestrationService.broadcastToGoblins('stop');
    expect(calls).to.deep.equal(['goblin-10-0-0-5', 'goblin-10-0-0-6']);
    expect(r.total).to.equal(2);
    expect(r.successful).to.equal(1);
    expect(r.failed).to.equal(1);
    expect(r.results.find(x => x.id === 'goblin-10-0-0-6').error).to.match(/not online/);

    calls.length = 0;
    await orchestrationService.broadcastToGoblins('stop-video', { ids: ['goblin-10-0-0-5'] });
    expect(calls).to.deep.equal(['goblin-10-0-0-5']);
  });

  it('play-video hands the filename and the loop flag to the manager', async () => {
    const seen = [];
    stub('playVideoOnGoblin', async (id, filename, options) => { seen.push({ id, filename, options }); return { success: true }; });
    await orchestrationService.broadcastToGoblins('play-video', { filename: 'fire_test.mp4', ids: ['goblin-10-0-0-5'] });
    expect(seen).to.have.length(1);
    expect(seen[0].filename).to.equal('fire_test.mp4');
    expect(seen[0].options.loop).to.equal(false);
    await orchestrationService.broadcastToGoblins('play-video', { filename: 'fire_test.mp4', loop: true, ids: ['goblin-10-0-0-5'] });
    expect(seen[1].options.loop).to.equal(true);
  });

  it('refuses an unknown command per Goblin instead of guessing', async () => {
    const r = await orchestrationService.broadcastToGoblins('dance');
    expect(r.successful).to.equal(0);
    expect(r.results[0].error).to.match(/Unknown Goblin command/);
  });
});

describe('goblin-video scene step: loop flag and play-once default', function () {
  this.timeout(10000);
  let originalRegistry;
  const saved = {};
  const stub = (name, fn) => { saved[name] = goblinManagerService[name]; goblinManagerService[name] = fn; };

  before(async () => {
    await registrySettled();
    originalRegistry = goblinManagerService.goblins;
    goblinManagerService.goblins = new Map([
      ['goblin-10-0-0-5', { id: 'goblin-10-0-0-5', name: 'Test Goblin A', endpoint: 'http://10.0.0.5:3001', status: 'offline' }],
    ]);
  });
  after(() => {
    goblinManagerService.goblins = originalRegistry;
    for (const name of Object.keys(saved)) goblinManagerService[name] = saved[name];
  });

  it('plays once and returns to the queue unless the step says loop', async () => {
    const seen = [];
    stub('playVideoOnGoblin', async (id, filename, options) => { seen.push({ id, filename, options }); return { success: true, filename }; });
    await executeStep({ type: 'goblin-video', goblinId: 'goblin-10-0-0-5', videoId: 'a.mp4' }, 3, () => {});
    expect(seen[0].options).to.include({ loop: false, returnToQueue: true });
    await executeStep({ type: 'goblin-video', goblinId: 'goblin-10-0-0-5', videoId: 'a.mp4', loop: true }, 3, () => {});
    expect(seen[1].options).to.include({ loop: true, returnToQueue: false });
    // Legacy scenes carried loop under options.
    await executeStep({ type: 'goblin-video', goblinId: 'goblin-10-0-0-5', videoId: 'a.mp4', options: { loop: true } }, 3, () => {});
    expect(seen[2].options.loop).to.equal(true);
  });

  it('does not refuse on the stored offline flag — the manager pings before deciding', async () => {
    let asked = false;
    stub('playVideoOnGoblin', async () => { asked = true; return { success: false, error: 'Test Goblin A is not online' }; });
    let err = null;
    try { await executeStep({ type: 'goblin-video', goblinId: 'goblin-10-0-0-5', videoId: 'a.mp4' }, 3, () => {}); } catch (e) { err = e; }
    expect(asked, 'the manager must be the one that decides').to.equal(true);
    expect(String(err && err.message)).to.match(/not online/);
  });
});

describe('Goblin registry persistence', function () {
  this.timeout(10000);
  let originalRegistry;
  const saved = {};
  const stub = (name, fn) => { saved[name] = goblinManagerService[name]; goblinManagerService[name] = fn; };
  before(async () => {
    await registrySettled();
    originalRegistry = goblinManagerService.goblins;
  });
  after(() => {
    goblinManagerService.goblins = originalRegistry;
    for (const name of Object.keys(saved)) goblinManagerService[name] = saved[name];
  });

  it('a healthy re-ping updates lastSeen in memory without rewriting the file; a transition saves', async () => {
    // Point the Goblin at this node's own HTTP listener so /health really answers.
    const base = process.env.BASE_URL || 'http://localhost:3100';
    goblinManagerService.goblins = new Map([
      ['goblin-self', { id: 'goblin-self', name: 'Self', endpoint: base, status: 'online', lastSeen: '2020-01-01T00:00:00.000Z' }],
    ]);
    let saves = 0;
    stub('saveGoblins', async () => { saves += 1; return true; });

    const first = await goblinManagerService.pingGoblin('goblin-self');
    if (!first.online) this.skip(); // no listener in this environment — nothing to prove
    expect(saves, 'online→online must not touch the disk').to.equal(0);
    expect(new Date(goblinManagerService.goblins.get('goblin-self').lastSeen).getTime()).to.be.greaterThan(Date.parse('2020-01-01T00:00:00.000Z'));

    goblinManagerService.goblins.get('goblin-self').status = 'offline';
    await goblinManagerService.pingGoblin('goblin-self');
    expect(saves, 'offline→online is a transition and is persisted').to.equal(1);
  });
});
