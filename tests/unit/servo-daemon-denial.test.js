/**
 * Bench regression (2026-08-22, Sir Dragomir's magic box): the servo daemon's
 * physical-faults guard REFUSED every write to ch11 — correctly — but replied
 * {'status':'ok'} anyway, so the whole Node chain reported "Moved to 60°"
 * while zero pulses left the chip. The operator debugged healthy hardware for
 * an hour on the strength of a lying success field.
 *
 * Pinned here: when the daemon reports a refusal (status error / per-move
 * error with denied:true), servoDaemonClient must REJECT and carry the denied
 * marker, so hardwareService can report the refusal instead of falling back.
 */

import { expect } from 'chai';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';

const REFUSAL = 'REFUSED ch11 — part 1 (Head Servo) is declared physically broken. Clear it in config/physical-faults.json once repaired.';

describe('Servo daemon denial reaches the caller (honesty)', function () {
  this.timeout(10000);

  let server;
  let client;
  let sockPath;
  const savedTestMode = process.env.MB_TEST_MODE;
  const savedSocket = process.env.MB_SERVO_SOCKET;

  before(async function () {
    // A fake daemon that refuses everything the way the real one does when a
    // channel's part is listed in config/physical-faults.json.
    sockPath = path.join(os.tmpdir(), `mb-denial-${process.pid}.sock`);
    try { fs.unlinkSync(sockPath); } catch (_) { /* fresh path */ }

    server = net.createServer((conn) => {
      let buf = '';
      conn.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          const cmd = JSON.parse(line);
          let reply;
          if (cmd.cmd === 'set_angles') {
            // Real daemon shape: batch stays status ok, the refusal is per-move.
            reply = {
              status: 'ok',
              results: [{
                channel: cmd.moves[0].channel,
                angle: cmd.moves[0].angle,
                status: 'error',
                error: REFUSAL,
                denied: true
              }]
            };
          } else if (cmd.cmd === 'set_pulse') {
            // Real daemon shape: single commands surface it at the top level.
            reply = { status: 'error', message: REFUSAL, denied: true };
          } else {
            reply = { status: 'ok' };
          }
          reply.id = cmd.id;
          conn.write(JSON.stringify(reply) + '\n');
        }
      });
    });
    await new Promise((resolve) => server.listen(sockPath, resolve));

    // isTestMode() disables the client under MB_TEST_MODE+CI. This test IS the
    // exception: it talks to the fake daemon above, never to hardware.
    delete process.env.MB_TEST_MODE;
    process.env.MB_SERVO_SOCKET = sockPath;
    const mod = await import(
      new URL(`../../services/hardwareService/servoDaemonClient.js?denial=${Date.now()}`, import.meta.url)
    );
    client = mod.default;
  });

  after(async function () {
    if (savedTestMode !== undefined) process.env.MB_TEST_MODE = savedTestMode;
    if (savedSocket !== undefined) process.env.MB_SERVO_SOCKET = savedSocket;
    else delete process.env.MB_SERVO_SOCKET;
    if (client) client.disconnect();
    if (server) await new Promise((resolve) => server.close(resolve));
    try { fs.unlinkSync(sockPath); } catch (_) { /* already gone */ }
  });

  it('moveOne (standard-servo path) rejects with the refusal and denied=true', async function () {
    try {
      await client.moveOne(11, 60);
      throw new Error('moveOne resolved — the denial was swallowed');
    } catch (err) {
      expect(err.message, 'the operator must see the daemon\'s reason').to.match(/REFUSED ch11/);
      expect(err.denied, 'denied marker must survive to the caller').to.equal(true);
    }
  });

  it('pulseOne (multi-turn path) rejects with the refusal and denied=true', async function () {
    try {
      await client.pulseOne(11, 1500);
      throw new Error('pulseOne resolved — the denial was swallowed');
    } catch (err) {
      expect(err.message).to.match(/REFUSED ch11/);
      expect(err.denied).to.equal(true);
    }
  });

  it('moveMany surfaces the per-move denial in its results', async function () {
    const results = await client.moveMany([{ channel: 11, angle: 60 }]);
    expect(results[0].status).to.equal('error');
    expect(results[0].denied, 'batch consumers need the marker too').to.equal(true);
    expect(results[0].error).to.match(/REFUSED ch11/);
  });
});
