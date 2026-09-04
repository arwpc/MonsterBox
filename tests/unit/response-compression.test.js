/**
 * Response compression — JSON and static text over gzip, built on Node's zlib.
 *
 * The dashboard pulls a 233 KB audio library and ~780 KB of CSS/JS on every
 * load, over Wi-Fi, into a browser pool of six connections. Both middlewares
 * exist to cut that wire weight without a new dependency; these tests pin the
 * contracts that make them safe to sit in front of every route:
 *
 *   - bodies under the threshold, non-gzip clients and HEAD requests are left
 *     exactly as Express would have sent them;
 *   - what comes back gunzips to the identical bytes;
 *   - ETags and 304s keep working on the compressed form;
 *   - a path that escapes the static root is never served.
 */
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { jsonCompression } from '../../services/jsonCompression.js';
import { staticCompression } from '../../services/staticCompression.js';

const BIG = { rows: Array.from({ length: 400 }, (_, i) => ({ id: i, name: 'row ' + i, tags: ['a', 'b', 'c'] })) };
const SMALL = { ok: true };

describe('jsonCompression middleware', function () {
  let app;
  before(() => {
    app = express();
    app.use(jsonCompression());
    app.get('/big', (req, res) => res.json(BIG));
    app.get('/small', (req, res) => res.json(SMALL));
    app.get('/legacy', (req, res) => res.json(201, BIG)); // eslint-disable-line no-restricted-syntax
  });

  it('gzips a large JSON body for a client that accepts gzip, and it round-trips', async () => {
    const res = await request(app).get('/big').set('Accept-Encoding', 'gzip').buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).to.equal(200);
    expect(res.headers['content-encoding']).to.equal('gzip');
    expect(res.headers['content-type']).to.match(/application\/json/);
    expect(res.headers.vary).to.match(/Accept-Encoding/i);
    // superagent inflates a gzip body before any parser sees it, so what
    // arrives here is the decoded text; Content-Length is the wire size.
    expect(JSON.parse(res.body.toString('utf8'))).to.deep.equal(BIG);
    expect(parseInt(res.headers['content-length'], 10)).to.be.below(Buffer.byteLength(JSON.stringify(BIG)) / 2);
  });

  it('leaves a small body uncompressed — the gzip header would cost more than it saves', async () => {
    const res = await request(app).get('/small').set('Accept-Encoding', 'gzip');
    expect(res.headers['content-encoding']).to.equal(undefined);
    expect(res.body).to.deep.equal(SMALL);
  });

  it('sends plain JSON to a client that does not accept gzip', async () => {
    const res = await request(app).get('/big').set('Accept-Encoding', 'identity');
    expect(res.headers['content-encoding']).to.equal(undefined);
    expect(res.body).to.deep.equal(BIG);
  });

  it('leaves HEAD alone', async () => {
    const res = await request(app).head('/big').set('Accept-Encoding', 'gzip');
    expect(res.status).to.equal(200);
    expect(res.headers['content-encoding']).to.equal(undefined);
  });

  it('hands the legacy res.json(status, body) signature straight through', async () => {
    const res = await request(app).get('/legacy').set('Accept-Encoding', 'gzip');
    expect(res.status).to.equal(201);
    expect(res.body).to.deep.equal(BIG);
  });

  it('answers 304 to a matching If-None-Match on the compressed form', async () => {
    const first = await request(app).get('/big').set('Accept-Encoding', 'gzip');
    expect(first.headers.etag).to.be.a('string');
    const again = await request(app).get('/big').set('Accept-Encoding', 'gzip').set('If-None-Match', first.headers.etag);
    expect(again.status).to.equal(304);
  });
});

describe('staticCompression middleware', function () {
  let app; let root; let cssText;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-static-'));
    cssText = '.a{color:red}\n'.repeat(400); // ~5.6 KB, comfortably over the 1 KB floor
    fs.writeFileSync(path.join(root, 'big.css'), cssText);
    fs.writeFileSync(path.join(root, 'tiny.css'), '.b{}');
    fs.writeFileSync(path.join(root, 'photo.png'), Buffer.alloc(4096, 1));
    fs.writeFileSync(path.join(os.tmpdir(), 'mb-static-outside.css'), cssText);
    app = express();
    app.use(staticCompression(root, { maxAgeSeconds: 300 }));
    app.use(express.static(root, { maxAge: '5m' }));
  });
  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.join(os.tmpdir(), 'mb-static-outside.css'), { force: true });
  });

  const raw = (r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); };

  it('serves a text asset gzipped with the right type, cache policy and validators', async () => {
    const res = await request(app).get('/big.css').set('Accept-Encoding', 'gzip').buffer(true).parse(raw);
    expect(res.status).to.equal(200);
    expect(res.headers['content-encoding']).to.equal('gzip');
    expect(res.headers['content-type']).to.match(/text\/css/);
    expect(res.headers['cache-control']).to.match(/max-age=300/);
    expect(res.headers.etag).to.match(/^W\//);
    expect(res.headers['last-modified']).to.be.a('string');
    expect(res.body.toString('utf8')).to.equal(cssText);
    expect(parseInt(res.headers['content-length'], 10)).to.be.below(Buffer.byteLength(cssText) / 4);
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const first = await request(app).get('/big.css').set('Accept-Encoding', 'gzip');
    const again = await request(app).get('/big.css').set('Accept-Encoding', 'gzip').set('If-None-Match', first.headers.etag);
    expect(again.status).to.equal(304);
  });

  it('HEAD carries the gzip headers and no body', async () => {
    const res = await request(app).head('/big.css').set('Accept-Encoding', 'gzip');
    expect(res.status).to.equal(200);
    expect(res.headers['content-encoding']).to.equal('gzip');
    expect(res.text === undefined || res.text === '').to.equal(true);
  });

  it('falls through to express.static for a client without gzip, a tiny file, and a binary', async () => {
    const plain = await request(app).get('/big.css').set('Accept-Encoding', 'identity');
    expect(plain.headers['content-encoding']).to.equal(undefined);
    expect(plain.text).to.equal(cssText);
    const tiny = await request(app).get('/tiny.css').set('Accept-Encoding', 'gzip');
    expect(tiny.headers['content-encoding']).to.equal(undefined);
    expect(tiny.text).to.equal('.b{}');
    const png = await request(app).get('/photo.png').set('Accept-Encoding', 'gzip');
    expect(png.headers['content-encoding']).to.equal(undefined);
    expect(png.status).to.equal(200);
  });

  it('never serves a path that escapes the static root', async () => {
    const res = await request(app).get('/..%2Fmb-static-outside.css').set('Accept-Encoding', 'gzip');
    expect(res.status).to.not.equal(200);
    expect(res.headers['content-encoding']).to.equal(undefined);
  });

  it('re-encodes when the file changes underneath it', async () => {
    const before = await request(app).get('/big.css').set('Accept-Encoding', 'gzip').buffer(true).parse(raw);
    const changed = cssText + '.c{margin:0}\n';
    fs.writeFileSync(path.join(root, 'big.css'), changed);
    const now = Date.now() / 1000;
    fs.utimesSync(path.join(root, 'big.css'), now + 5, now + 5); // a distinct mtime even on a coarse clock
    const after = await request(app).get('/big.css').set('Accept-Encoding', 'gzip').buffer(true).parse(raw);
    expect(after.headers.etag).to.not.equal(before.headers.etag);
    expect(after.body.toString('utf8')).to.equal(changed);
  });
});
