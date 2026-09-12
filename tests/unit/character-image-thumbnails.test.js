/**
 * Avatar thumbnails — the 300 KB portrait problem.
 *
 * Every page's control bar and character menu showed the active portrait at
 * 38-96 px, yet the browser downloaded and decoded the full upload each time
 * (one live node's: 800x800, 316 KB, twice per dashboard load). The image route
 * now serves a downscaled rendition for `?w=<size>`, generated once by
 * python_wrappers/image_thumb.py (Pillow) and cached beside the original.
 *
 * Pinned here:
 *   - the script really downscales, keeps the format honest (alpha -> PNG,
 *     else JPEG) and writes atomically;
 *   - thumbnailPath() refuses unknown sizes, bad names and missing sources with
 *     null — the route then serves the original, never a broken avatar — and
 *     scaffolds nothing on disk for an id that has no image;
 *   - the live route contract: `?w=` on a real portrait is small and an image;
 *     `?w=` on a file this node does not hold (portraits are node-local) is a
 *     200 SVG of the character's initials — never a 404 on a fleet-listing page,
 *     never the webcam "no stream" picture — while the bare URL keeps its
 *     no-404 placeholder behaviour.
 */
import { expect } from 'chai';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { fileURLToPath } from 'url';

import { thumbnailPath, avatarUrl, THUMBNAIL_SIZES } from '../../services/characterImageService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(APP_ROOT, 'python_wrappers', 'image_thumb.py');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

function pillowAvailable() {
  try { execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }); return true; } catch (_) { return false; }
}

function makeImage(file, w, h, mode) {
  execFileSync('python3', ['-c',
    `from PIL import Image; Image.new(${JSON.stringify(mode)}, (${w}, ${h}), (200, 30, 30, 128) if ${JSON.stringify(mode)} == 'RGBA' else (200, 30, 30)).save(${JSON.stringify(file)})`]);
}

function imageInfo(file) {
  return JSON.parse(execFileSync('python3', ['-c',
    `from PIL import Image; import json; im = Image.open(${JSON.stringify(file)}); print(json.dumps({'w': im.width, 'h': im.height, 'format': im.format, 'mode': im.mode}))`]).toString());
}

describe('image_thumb.py', function () {
  this.timeout(30000);
  let dir;
  before(function () {
    if (!pillowAvailable()) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-thumb-'));
  });
  after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('downscales a large opaque image to the requested edge as JPEG', function () {
    const src = path.join(dir, 'portrait.png');
    makeImage(src, 800, 600, 'RGB');
    const out = execFileSync('python3', [SCRIPT, src, path.join(dir, '96-portrait.png'), '96']).toString().trim();
    expect(out).to.equal(path.join(dir, '96-portrait.png.jpg'));
    const info = imageInfo(out);
    expect(info.format).to.equal('JPEG');
    expect(Math.max(info.w, info.h)).to.equal(96);
    expect(fs.statSync(out).size).to.be.below(fs.statSync(src).size);
    expect(fs.existsSync(path.join(dir, '96-portrait.png.tmp'))).to.equal(false);
  });

  it('keeps transparency by writing PNG, and removes a stale sibling of the other format', function () {
    const src = path.join(dir, 'ghost.png');
    makeImage(src, 300, 300, 'RGBA');
    const base = path.join(dir, '64-ghost.png');
    fs.writeFileSync(base + '.jpg', 'stale');
    const out = execFileSync('python3', [SCRIPT, src, base, '64']).toString().trim();
    expect(out).to.equal(base + '.png');
    expect(imageInfo(out).format).to.equal('PNG');
    expect(fs.existsSync(base + '.jpg')).to.equal(false);
  });

  it('exits non-zero on a source that is not an image', function () {
    const src = path.join(dir, 'notes.png');
    fs.writeFileSync(src, 'this is not a picture');
    let code = 0;
    try { execFileSync('python3', [SCRIPT, src, path.join(dir, '96-notes.png'), '96'], { stdio: 'ignore' }); }
    catch (err) { code = err.status; }
    expect(code).to.not.equal(0);
  });
});

describe('thumbnailPath()', function () {
  this.timeout(15000);
  const UNREGISTERED = 987123;
  const dataDir = path.join(APP_ROOT, 'data', `character-${UNREGISTERED}`);

  after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  it('offers the sizes the UI actually asks for', () => {
    expect([...THUMBNAIL_SIZES]).to.include.members([64, 96, 128]);
  });

  it('returns null for an unknown size, a traversal name, or a missing source — and scaffolds nothing', async () => {
    expect(await thumbnailPath(UNREGISTERED, 'x.png', 97)).to.equal(null);
    expect(await thumbnailPath(UNREGISTERED, '../x.png', 96)).to.equal(null);
    expect(await thumbnailPath(UNREGISTERED, 'nothing-here.png', 96)).to.equal(null);
    expect(fs.existsSync(dataDir)).to.equal(false);
  });

  it('builds the avatar URL the templates and client scripts share', () => {
    expect(avatarUrl(7, 'a b.png')).to.equal('/api/characters/7/images/a%20b.png?w=96');
    expect(avatarUrl(7, 'a.png', 128)).to.equal('/api/characters/7/images/a.png?w=128');
    expect(avatarUrl(7, null)).to.equal(null);
  });
});

describe('GET /api/characters/:id/images/:file?w= (live route)', function () {
  this.timeout(20000);
  let charId; let active;

  before(async function () {
    const raw = fs.readFileSync(path.join(APP_ROOT, 'data', 'characters.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.characters || []);
    const withImage = list.find(c => c.activeImage && fs.existsSync(path.join(APP_ROOT, 'data', `character-${c.id}`, 'images', c.activeImage)));
    if (!withImage) return this.skip(); // no portrait on this node
    charId = withImage.id; active = withImage.activeImage;
    try { await request(BASE_URL).get('/health'); } catch (_) { this.skip(); }
  });

  it('serves a small image for ?w=96, cacheable for an hour', async () => {
    const res = await request(BASE_URL).get(`/api/characters/${charId}/images/${encodeURIComponent(active)}?w=96`).buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).to.equal(200);
    expect(res.headers['content-type']).to.match(/^image\//);
    expect(res.headers['cache-control']).to.match(/max-age=3600/);
    const original = fs.statSync(path.join(APP_ROOT, 'data', `character-${charId}`, 'images', active)).size;
    expect(res.body.length).to.be.below(Math.max(original, 1)); // never heavier than the upload
    expect(res.body.length).to.be.below(40 * 1024);          // and avatar-sized
  });

  it('answers ?w= on a missing file with a 200 initials SVG, not a 404', async () => {
    const res = await request(BASE_URL).get(`/api/characters/${charId}/images/no-such-portrait-0000.png?w=96`);
    expect(res.status).to.equal(200);
    expect(res.headers['content-type']).to.match(/image\/svg\+xml/);
    const body = res.text || (res.body && res.body.toString());
    expect(body).to.match(/<svg/);
    expect(body).to.match(/>[A-Z?]{1,2}<\/text>/); // the character's initials, drawn
    expect(res.headers['cache-control']).to.match(/max-age=60\b/); // short: the upload may land any minute
  });

  it('draws the SAME initials the CSS fallback would', async () => {
    const chars = await request(BASE_URL).get('/api/characters');
    const list = Array.isArray(chars.body) ? chars.body : (chars.body.characters || []);
    const me = list.find(c => Number(c.id) === Number(charId));
    if (!me || !me.name) return;
    const words = me.name.trim().split(/\s+/);
    const expected = words.length === 1 ? words[0].substring(0, 2).toUpperCase()
      : (words[0][0] + words[words.length - 1][0]).toUpperCase();
    const res = await request(BASE_URL).get(`/api/characters/${charId}/images/no-such-portrait-0000.png?w=64`);
    // superagent buffers image/* as a Buffer, not text.
    const svg = res.text || (res.body && res.body.toString());
    expect(svg).to.include('>' + expected + '</text>');
    expect(svg).to.include('width="64"');
  });

  it('keeps the bare URL contract: a missing file is not a 404', async () => {
    const res = await request(BASE_URL).get(`/api/characters/${charId}/images/no-such-portrait-0000.png`);
    expect(res.status).to.not.equal(404);
  });
});
