/**
 * Unit tests for wrapper success detection.
 *
 * Hardware success used to be decided by a raw substring test for "success"
 * over a wrapper's stdout — which also carries log JSON. Any output merely
 * mentioning the word reported a move that never happened, and "unsuccessful"
 * reported success by containing "successful".
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../../services/hardwareService/index.js');

// The helper is module-private, so reconstruct it from source to test the real
// logic rather than a copy that could drift.
async function loadHelper() {
  const src = await fs.readFile(SOURCE, 'utf8');
  const match = src.match(/function wrapperSucceeded\(out, parsed\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error('wrapperSucceeded not found in hardwareService/index.js');
  // eslint-disable-next-line no-new-func
  return new Function(match[0] + '; return wrapperSucceeded;')();
}

describe('Wrapper success detection', function () {
  let wrapperSucceeded;

  before(async function () {
    wrapperSucceeded = await loadHelper();
  });

  it('trusts an explicit success:false over any text', function () {
    expect(wrapperSucceeded('success', { success: false })).to.equal(false);
  });

  it('trusts an explicit success:true', function () {
    expect(wrapperSucceeded('', { success: true })).to.equal(true);
  });

  it('reads the status field', function () {
    expect(wrapperSucceeded('', { status: 'success' })).to.equal(true);
    expect(wrapperSucceeded('', { status: 'error' })).to.equal(false);
  });

  it('does NOT report success for "unsuccessful"', function () {
    expect(wrapperSucceeded('move was unsuccessful', null)).to.equal(false);
  });

  it('does not match "success" inside a larger word', function () {
    expect(wrapperSucceeded('successive failures detected', null)).to.equal(false);
  });

  it('still accepts a bare success word from a legacy wrapper', function () {
    expect(wrapperSucceeded('success', null)).to.equal(true);
    expect(wrapperSucceeded('Command successful', null)).to.equal(true);
    expect(wrapperSucceeded('{"status": "success"}', null)).to.equal(true);
  });

  it('reports failure for non-string, empty, or unrelated output', function () {
    expect(wrapperSucceeded(null, null)).to.equal(false);
    expect(wrapperSucceeded('', null)).to.equal(false);
    expect(wrapperSucceeded('Traceback (most recent call last)', null)).to.equal(false);
  });
});
