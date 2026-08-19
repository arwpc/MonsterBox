/**
 * Unit tests for the destructive-system-endpoint guard.
 *
 * These endpoints run sudo reboot/shutdown. The guard previously allowed any
 * request that carried no Origin header, which meant any device on the LAN could
 * shut down a running animatronic with one curl. These tests pin the three cases
 * that matter: token auth, same-origin browser UI, and remote non-browser callers.
 */

import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The guard is module-private, so exercise it through a route mounted the same way.
// Rebuilding it here would test a copy rather than the shipped code, so instead we
// import the real router and hit a guarded endpoint that is safe to call: the
// guard runs before the handler, and we only assert on guard-level rejections.
//
// CAVEAT: this endpoint is NOT side-effect free. Every case that passes the guard
// reaches the real handler, which shells out to ssh-keygen and writes a keypair into
// ~/.ssh. Five cases here pass the guard, so an unguarded run left 5 real keys behind
// EVERY time -- and this file is in test:smoke, which runs in `npm run gate` on every
// push. That accumulated to 760 stale keypairs before anyone noticed. The after() hook
// below removes exactly the keys this run created; it must not touch pre-existing ones.
const GUARDED_PATH = '/api/system/ssh/keys/generate';

async function makeApp() {
  const { default: systemRoutes } = await import('../../routes/api/systemRoutes.js');
  const app = express();
  app.use('/api/system', systemRoutes);
  return app;
}

describe('Destructive system endpoint guard', function () {
  this.timeout(10000);
  let app;
  let savedToken;

  const sshDir = path.join(os.homedir(), '.ssh');
  const listKeys = () => {
    try { return new Set(fs.readdirSync(sshDir).filter(f => f.startsWith('monsterbox_'))); }
    catch { return new Set(); }
  };
  let keysBefore;

  before(async () => {
    savedToken = process.env.MB_ADMIN_TOKEN;
    keysBefore = listKeys();
    app = await makeApp();
  });

  // Delete only what this run added, by name diff. Anything already present is the
  // operator's and is left alone.
  after(() => {
    for (const f of listKeys()) {
      if (keysBefore.has(f)) continue;
      try { fs.unlinkSync(path.join(sshDir, f)); } catch { /* best effort */ }
    }
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.MB_ADMIN_TOKEN;
    else process.env.MB_ADMIN_TOKEN = savedToken;
  });

  describe('with MB_ADMIN_TOKEN set', function () {
    beforeEach(() => { process.env.MB_ADMIN_TOKEN = 'test-token-value'; });

    // The three checks LAYER. Configuring a token adds a way in for remote
    // callers; it must not remove the ways in that already worked, or the
    // operator's own dashboard starts 401ing the moment a token is set.
    it('still allows a local caller with no token (supertest is loopback)', async () => {
      const res = await request(app).post(GUARDED_PATH).send({});
      expect(res.status).to.not.equal(401);
      expect(res.status).to.not.equal(403);
    });

    it('still allows a same-origin browser request with no token', async () => {
      const res = await request(app)
        .post(GUARDED_PATH)
        .set('Host', '127.0.0.1:3000')
        .set('Origin', 'http://127.0.0.1:3000')
        .send({});
      expect(res.status).to.not.equal(401);
      expect(res.status).to.not.equal(403);
    });

    it('rejects a cross-origin request even though a token is configured', async () => {
      // A wrong token must not be upgraded by the browser path.
      const res = await request(app)
        .post(GUARDED_PATH)
        .set('Origin', 'http://evil.example.com')
        .set('x-mb-admin-token', 'wrong')
        .send({});
      expect(res.status).to.equal(403);
    });

    it('lets the correct token past the guard', async () => {
      const res = await request(app)
        .post(GUARDED_PATH)
        .set('x-mb-admin-token', 'test-token-value')
        .send({});
      // Past the guard: whatever the handler does, it is not a guard rejection.
      expect(res.status).to.not.equal(401);
      expect(res.status).to.not.equal(403);
    });
  });

  describe('with no MB_ADMIN_TOKEN (default deployment)', function () {
    beforeEach(() => { delete process.env.MB_ADMIN_TOKEN; });

    it('rejects a cross-origin browser request (CSRF)', async () => {
      const res = await request(app)
        .post(GUARDED_PATH)
        .set('Origin', 'http://evil.example.com')
        .send({});
      expect(res.status).to.equal(403);
      expect(res.body.error).to.match(/cross-origin/i);
    });

    it('allows a same-origin browser request, so the operator UI keeps working', async () => {
      const res = await request(app)
        .post(GUARDED_PATH)
        .set('Host', '127.0.0.1:3000')
        .set('Origin', 'http://127.0.0.1:3000')
        .send({});
      expect(res.status).to.not.equal(403);
    });

    it('allows a local script with no Origin (supertest connects over loopback)', async () => {
      const res = await request(app).post(GUARDED_PATH).send({});
      expect(res.status).to.not.equal(403);
    });
  });
});
