/**
 * Webcam Capture Browser Tests
 * Verifies that the Arducam B0205 (Eye of Orlok, part 9) captures a real image
 * Uses mjpg-streamer snapshot endpoint (production capture path)
 */

import { test, expect } from '@playwright/test';
import http from 'http';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const WEBCAM_PART_ID = '9';
const MJPG_SNAPSHOT_URL = 'http://127.0.0.1:8090/?action=snapshot';

// These tests require Orlok (char_id=3) with Arducam webcam and mjpg-streamer
// Skip in CI where MB_TEST_MODE defaults to char_id=1 and no camera hardware
test.skip(!!process.env.MB_TEST_MODE, 'Requires Orlok hardware (char_id=3) and mjpg-streamer');

/**
 * Fetch a binary buffer from a URL via Node http
 */
function fetchBuffer(url, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 10000;
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('snapshot timeout')); }, timeoutMs);
    http.get(url, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) });
      });
      res.on('error', function (e) { clearTimeout(timer); reject(e); });
    }).on('error', function (e) { clearTimeout(timer); reject(e); });
  });
}

test.describe('Webcam Capture — Arducam B0205', () => {
  let page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should have arducam-b0205 model in webcam models', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async () => {
      var r = await fetch('/setup/calibration/api/webcam/models');
      return r.json();
    });
    expect(res.success).toBe(true);
    var arducam = res.models.find(function (m) { return m.id === 'arducam-b0205'; });
    expect(arducam).toBeTruthy();
    expect(arducam.name).toContain('Arducam');
    expect(arducam.meta.modelNumber).toBe('B0205');
    expect(arducam.meta.nightVision).toBe(true);
    expect(arducam.defaults.resolution).toBe('1920x1080');
  });

  test('should have webcam part 9 with arducam-b0205 model', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async (partId) => {
      var r = await fetch('/api/parts/' + partId);
      return r.json();
    }, WEBCAM_PART_ID);
    expect(res.success).toBe(true);
    expect(res.part.type).toBe('webcam');
    expect(res.part.modelId).toBe('arducam-b0205');
    expect(res.part.name).toBe('Eye of Orlok');
  });

  test('should capture a real image from the webcam via mjpg-streamer', async () => {
    // First confirm mjpg-streamer is healthy via the Express API
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const health = await page.evaluate(async () => {
      var r = await fetch('/setup/calibration/api/webcam/health');
      return r.json();
    });
    expect(health.success).toBe(true);
    expect(health.mjpgStreamer.running).toBe(true);

    // Fetch a snapshot frame directly from mjpg-streamer
    var result = await fetchBuffer(MJPG_SNAPSHOT_URL);
    expect(result.status).toBe(200);

    // Must be at least 1 KB (a real captured image, not an error page)
    expect(result.buffer.length).toBeGreaterThan(1024);

    // Verify JPEG magic bytes (FF D8 FF)
    expect(result.buffer[0]).toBe(0xFF);
    expect(result.buffer[1]).toBe(0xD8);
    expect(result.buffer[2]).toBe(0xFF);

    // Save to /tmp for manual inspection and verify file is written
    var outPath = '/tmp/monsterbox_playwright_webcam_test.jpg';
    fs.writeFileSync(outPath, result.buffer);
    var stat = fs.statSync(outPath);
    expect(stat.size).toBe(result.buffer.length);
  });
});
