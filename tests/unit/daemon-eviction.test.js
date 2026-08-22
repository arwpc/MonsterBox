/**
 * Bench regression (2026-08-22): a servo daemon from a PREVIOUS deploy owned
 * the unix socket across a service restart, the fresh daemon stood by, and the
 * node kept driving hardware through pre-deploy code — the head's new
 * physical-faults behavior appeared only after a manual pkill. The operator's
 * ruling: "when we deploy changes make sure the old version is dead."
 *
 * Pinned here: at daemon spawn time, the manager EVICTS any existing socket
 * owner by sending the daemon protocol's shutdown command, so a restart always
 * puts the on-disk code in charge of the chip.
 */

import { expect } from 'chai';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('Servo daemon eviction on spawn (old code must die on restart)', function () {
  this.timeout(10000);

  let server;
  let sockPath;
  let received;
  const savedSocket = process.env.MB_SERVO_SOCKET;

  before(async function () {
    sockPath = path.join(os.tmpdir(), `mb-evict-${process.pid}.sock`);
    try { fs.unlinkSync(sockPath); } catch (_) { /* fresh path */ }
    received = [];
    server = net.createServer((conn) => {
      conn.on('data', (chunk) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line.trim()) received.push(JSON.parse(line));
        }
        conn.write(JSON.stringify({ status: 'shutdown' }) + '\n');
      });
    });
    await new Promise((resolve) => server.listen(sockPath, resolve));
    process.env.MB_SERVO_SOCKET = sockPath;
  });

  after(async function () {
    if (savedSocket !== undefined) process.env.MB_SERVO_SOCKET = savedSocket;
    else delete process.env.MB_SERVO_SOCKET;
    if (server) await new Promise((resolve) => server.close(resolve));
    try { fs.unlinkSync(sockPath); } catch (_) { /* already gone */ }
  });

  it('sends the shutdown command to a pre-existing socket owner', async function () {
    const mod = await import(
      new URL(`../../services/jawServoDaemon.js?evict=${Date.now()}`, import.meta.url)
    );
    await mod.default.evictStaleSocketOwner(3000);
    expect(received.length, 'the stale owner must hear from the evictor').to.be.at.least(1);
    expect(received[0].cmd, 'eviction speaks the daemon protocol').to.equal('shutdown');
  });

  it('resolves quietly when no stale owner exists', async function () {
    const mod = await import(
      new URL(`../../services/jawServoDaemon.js?evict2=${Date.now()}`, import.meta.url)
    );
    process.env.MB_SERVO_SOCKET_SAVED = process.env.MB_SERVO_SOCKET;
    process.env.MB_SERVO_SOCKET = path.join(os.tmpdir(), `mb-evict-none-${process.pid}.sock`);
    try {
      // Module already captured its socket path at import; call against a
      // fresh import so the nonexistent path is the one probed.
      const mod2 = await import(
        new URL(`../../services/jawServoDaemon.js?evict3=${Date.now()}`, import.meta.url)
      );
      await mod2.default.evictStaleSocketOwner(1500); // must not hang or throw
    } finally {
      process.env.MB_SERVO_SOCKET = process.env.MB_SERVO_SOCKET_SAVED;
      delete process.env.MB_SERVO_SOCKET_SAVED;
    }
    expect(mod).to.exist; // reached without throwing
  });
});
