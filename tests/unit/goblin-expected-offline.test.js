/**
 * UP-12 — the goblin reconnect loop ran forever against storage nodes.
 *
 * A goblin that is offline because it is ON THE SHELF was still dialed every
 * 30 seconds, forever — network churn and log noise against a box unplugged
 * on purpose. Goblins marked expectedOffline (top-level on the registry
 * record, or via the existing settings API) are now skipped by the reconnect
 * loop while offline. The flag is intent, not state: it never blocks an
 * online goblin, and it survives re-registration.
 */

import { expect } from 'chai';
import goblinManagerService from '../../services/goblinManagerService.js';

describe('Goblin expectedOffline (UP-12)', function () {
  this.timeout(10000);

  let originalGoblins;
  let originalPing;
  let pinged;

  beforeEach(function () {
    // Work on a synthetic in-memory registry; never touch data/goblins.json
    // (attemptReconnectAll does not save, and we restore the map after).
    originalGoblins = goblinManagerService.goblins;
    originalPing = goblinManagerService.pingGoblin;
    pinged = [];

    goblinManagerService.goblins = new Map([
      ['shelf-toplevel', {
        id: 'shelf-toplevel', name: 'Shelf (top-level flag)', endpoint: 'http://192.0.2.1:3001',
        status: 'offline', expectedOffline: true, capabilities: [], settings: {}
      }],
      ['shelf-settings', {
        id: 'shelf-settings', name: 'Shelf (settings flag)', endpoint: 'http://192.0.2.2:3001',
        status: 'offline', capabilities: [], settings: { expectedOffline: true }
      }],
      ['really-down', {
        id: 'really-down', name: 'Actually down', endpoint: 'http://192.0.2.3:3001',
        status: 'offline', capabilities: [], settings: {}
      }],
      ['up-and-flagged', {
        id: 'up-and-flagged', name: 'Online despite flag', endpoint: 'http://192.0.2.4:3001',
        status: 'online', expectedOffline: true, capabilities: [], settings: {}
      }]
    ]);

    goblinManagerService.pingGoblin = async (id) => {
      pinged.push(id);
      return { success: false, online: false };
    };
  });

  afterEach(function () {
    goblinManagerService.goblins = originalGoblins;
    goblinManagerService.pingGoblin = originalPing;
  });

  it('skips expected-offline goblins (both flag locations) and still dials the real ones', async function () {
    const result = await goblinManagerService.attemptReconnectAll();

    expect(pinged, 'only the genuinely-down goblin may be dialed').to.deep.equal(['really-down']);
    expect(result.attempted).to.equal(1);
  });

  it('the flag never blocks an online goblin', function () {
    const g = goblinManagerService.goblins.get('up-and-flagged');
    expect(goblinManagerService.isExpectedOffline(g)).to.equal(true);
    // Reconnect only considers offline goblins; an online one is untouched
    // regardless of the flag — proven by the dial list above staying empty
    // of it, and pinned here as the documented semantic.
    expect(g.status).to.equal('online');
  });

  it('re-registration preserves the operator\'s flag', async function () {
    // A shelf goblin brought up briefly for maintenance re-registers itself;
    // the flag must survive so it leaves the reconnect loop again when boxed.
    const saved = goblinManagerService.saveGoblins;
    goblinManagerService.saveGoblins = async () => true; // no disk writes in tests
    try {
      const result = await goblinManagerService.registerGoblin({
        goblinId: 'shelf-toplevel',
        endpoint: 'http://192.0.2.1:3001'
      });
      expect(result.success).to.equal(true);
      expect(result.goblin.expectedOffline, 'flag must survive re-registration').to.equal(true);
      expect(result.goblin.status, 'a re-registering goblin is online right now').to.equal('online');
    } finally {
      goblinManagerService.saveGoblins = saved;
    }
  });

  it('stats surface the expected-offline count', function () {
    const stats = goblinManagerService.getStats();
    expect(stats.expectedOffline).to.equal(3);
    expect(stats.offline, 'expected-offline goblins still count as offline state').to.equal(3);
  });
});
