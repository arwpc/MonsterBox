/**
 * Bench regression (2026-08-23, fleet-wide): MJPEG proxies used pipe(), which
 * is FIFO — a backlog accumulated during any busy moment NEVER drains, because
 * MJPEG produces and plays at the same rate. Result: video permanently ~5
 * seconds behind reality on every animatronic, surviving into full idle.
 *
 * Pinned here: the latest-frame relay drops stale frames for a slow viewer
 * (delivering the NEWEST, not the oldest), delivers every frame to a fast
 * viewer, and authors multipart framing whose boundary matches its header.
 */

import { expect } from 'chai';
import { PassThrough, Writable } from 'stream';
import { relayMjpegLatest } from '../../services/mjpegRelay.js';

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function fakeJpeg(n) {
  // SOI + recognizable numbered payload + EOI
  return Buffer.concat([SOI, Buffer.from(`FRAME-${String(n).padStart(4, '0')}-`.repeat(4)), EOI]);
}

/** Minimal res double: a Writable with header methods, optional backpressure. */
function fakeRes({ slow = false } = {}) {
  const chunks = [];
  const res = new Writable({
    highWaterMark: 1, // force write() to return false immediately when slow
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      if (slow) setTimeout(cb, 15); // drain slowly — a laggy viewer
      else cb();
    }
  });
  res.headersSent = false;
  res.headers = {};
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.chunks = chunks;
  return res;
}

function framesIn(chunks) {
  const body = Buffer.concat(chunks).toString('latin1');
  return [...body.matchAll(/FRAME-(\d{4})-/g)].map(m => Number(m[1]))
    .filter((v, i, a) => a.indexOf(v) === i);
}

describe('MJPEG latest-frame relay', function () {
  this.timeout(15000);

  it('a slow viewer gets FEWER, FRESHER frames — never a growing backlog', async function () {
    const upstream = new PassThrough();
    const res = fakeRes({ slow: true });
    relayMjpegLatest(upstream, res);

    const TOTAL = 60;
    for (let i = 1; i <= TOTAL; i++) {
      upstream.write(fakeJpeg(i));
      await new Promise(r => setTimeout(r, 2)); // ~500 fps producer vs ~66 fps consumer
    }
    upstream.end();
    await new Promise(r => setTimeout(r, 300)); // let the last drains land

    const got = framesIn(res.chunks);
    expect(got.length, 'stale frames must be DROPPED for a slow viewer').to.be.lessThan(TOTAL);
    // Freshness, the property that kills the 5-second lag: the last delivered
    // frame is at most a couple of consumer periods behind the newest produced
    // (exact equality is a teardown race — live streams never end).
    expect(got[got.length - 1], 'delivery must stay pinned near the newest frame').to.be.greaterThan(TOTAL - 10);
    // Freshness: what arrives is always recent relative to what was produced —
    // strictly increasing, no replays of a stale queue.
    const sorted = [...got].sort((a, b) => a - b);
    expect(got).to.deep.equal(sorted);
  });

  it('a fast viewer receives every frame', async function () {
    const upstream = new PassThrough();
    const res = fakeRes({ slow: false });
    relayMjpegLatest(upstream, res);

    for (let i = 1; i <= 20; i++) {
      upstream.write(fakeJpeg(i));
      await new Promise(r => setTimeout(r, 5));
    }
    upstream.end();
    await new Promise(r => setTimeout(r, 100));

    expect(framesIn(res.chunks)).to.deep.equal(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('authors valid multipart framing: header boundary matches the wire', async function () {
    const upstream = new PassThrough();
    const res = fakeRes();
    relayMjpegLatest(upstream, res, { boundary: 'mbframe' });

    upstream.write(fakeJpeg(1));
    upstream.end();
    await new Promise(r => setTimeout(r, 50));

    expect(res.headers['content-type']).to.equal('multipart/x-mixed-replace; boundary=mbframe');
    const body = Buffer.concat(res.chunks).toString('latin1');
    expect(body).to.include('--mbframe\r\nContent-Type: image/jpeg\r\nContent-Length: ');
  });

  it('reassembles a frame split across arbitrary chunk boundaries', async function () {
    const upstream = new PassThrough();
    const res = fakeRes();
    relayMjpegLatest(upstream, res);

    const jpeg = fakeJpeg(7);
    // dribble it 3 bytes at a time, with upstream part-header noise around it
    upstream.write(Buffer.from('--boundarydonotcross\r\nContent-Type: image/jpeg\r\n\r\n'));
    for (let i = 0; i < jpeg.length; i += 3) {
      upstream.write(jpeg.subarray(i, Math.min(i + 3, jpeg.length)));
      await new Promise(r => setTimeout(r, 1));
    }
    upstream.end();
    await new Promise(r => setTimeout(r, 50));

    expect(framesIn(res.chunks)).to.deep.equal([7]);
  });
});
