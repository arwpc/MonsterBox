/**
 * A part PUT must MERGE config, never replace it.
 *
 * The defect this pins. `PUT /setup/calibration/api/parts/:id` built the new part
 * with a shallow spread — `{...existing, ...updates}` — so `updates.config`
 * overwrote the entire config object. The Edit-Part form only ever sends a per-type
 * whitelist (7 keys for a servo, 5 for a webcam), so every config key written by a
 * DIFFERENT surface was destroyed by an unrelated save:
 *
 *   - the Advanced tab's `motionTracking` / `headTracking` tuning and its pan-servo
 *     assignment
 *   - the Model/Overrides tab's values
 *   - a webcam's `controls` block (exposure, gain, gamma, night mode) and `modelId`
 *
 * Correcting an fps field and pressing Save silently discarded all of it, and the
 * page returned "saved successfully" — on the very page the operator uses to do
 * calibration work.
 *
 * These tests exercise the merge semantics directly rather than over HTTP, so they
 * run anywhere (including a cloud environment with no node and no hardware). The
 * live end-to-end behaviour was verified separately on the bridge machine: sending
 * only {devicePath, deviceId, fps} to a webcam part left motionTracking,
 * headTracking, controls and modelId all intact and added fps.
 */

import { expect } from 'chai';
import { readFile } from 'fs/promises';

/**
 * The merge used by the route, transcribed from routes/setup/calibration.js.
 * Kept in step with the source by the last test in this file.
 */
function deepMerge(a = {}, b = {}) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  Object.keys(b || {}).forEach(k => {
    const av = a ? a[k] : undefined;
    const bv = b[k];
    if (av && typeof av === 'object' && !Array.isArray(av) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  });
  return out;
}

function applyUpdate(existing, updates) {
  const mergedConfig = (updates && updates.config && typeof updates.config === 'object'
    && !Array.isArray(updates.config))
    ? deepMerge(existing.config || {}, updates.config)
    : (updates ? updates.config : undefined);
  return {
    ...existing,
    ...updates,
    ...(mergedConfig !== undefined ? { config: mergedConfig } : {}),
    id: existing.id
  };
}

// The real shape of a webcam part on this fleet, including the keys that were
// being lost. Using the real shape means the test fails if the loss returns.
const WEBCAM_PART = {
  id: '9',
  name: 'Eye',
  type: 'webcam',
  config: {
    devicePath: '/dev/video1',
    deviceId: 1,
    modelId: 'arducam-b0205',
    motionTracking: { motionThreshold: 42, minContourArea: 500, trackingSmoothing: 0.3 },
    headTracking: { panServoId: '15', rangeDeg: 90, smoothing: 0.35 },
    controls: { exposure_auto: 3, gain: 0, gamma: 100, nightMode: 0 }
  }
};

describe('Part PUT merges config instead of replacing it', function () {
  it('keeps Advanced-tab tuning when the Edit tab saves its whitelist', function () {
    const result = applyUpdate(WEBCAM_PART, {
      name: 'Eye', type: 'webcam',
      config: { devicePath: '/dev/video0', deviceId: 'video0', fps: 15 }
    });
    expect(result.config.motionTracking, 'motionTracking must survive').to.deep.equal(WEBCAM_PART.config.motionTracking);
    expect(result.config.headTracking, 'headTracking must survive').to.deep.equal(WEBCAM_PART.config.headTracking);
  });

  it('keeps the pan-servo assignment specifically — losing it disables head tracking', function () {
    const result = applyUpdate(WEBCAM_PART, { config: { fps: 15 } });
    expect(result.config.headTracking.panServoId).to.equal('15');
  });

  it('keeps webcam device controls and the modelId', function () {
    const result = applyUpdate(WEBCAM_PART, { config: { fps: 15 } });
    expect(result.config.controls).to.deep.equal(WEBCAM_PART.config.controls);
    expect(result.config.modelId).to.equal('arducam-b0205');
  });

  it('still applies the values the caller DID send', function () {
    const result = applyUpdate(WEBCAM_PART, {
      config: { devicePath: '/dev/video0', deviceId: 'video0', fps: 15 }
    });
    expect(result.config.devicePath).to.equal('/dev/video0');
    expect(result.config.deviceId).to.equal('video0');
    expect(result.config.fps).to.equal(15);
  });

  it('merges nested objects rather than clobbering a sibling key', function () {
    const result = applyUpdate(WEBCAM_PART, {
      config: { motionTracking: { motionThreshold: 60 } }
    });
    expect(result.config.motionTracking.motionThreshold, 'the edited key changes').to.equal(60);
    expect(result.config.motionTracking.minContourArea, 'its siblings survive').to.equal(500);
  });

  it('allows an explicit null to clear a value (the deliberate delete path)', function () {
    const result = applyUpdate(WEBCAM_PART, { config: { modelId: null } });
    expect(result.config.modelId).to.equal(null);
  });

  it('leaves config untouched when the caller sends none', function () {
    const result = applyUpdate(WEBCAM_PART, { name: 'Renamed' });
    expect(result.config).to.deep.equal(WEBCAM_PART.config);
    expect(result.name).to.equal('Renamed');
  });

  it('never lets the id change', function () {
    const result = applyUpdate(WEBCAM_PART, { id: '999', config: { fps: 15 } });
    expect(result.id).to.equal('9');
  });

  it('the route still merges — this test is worthless if the source reverts', async function () {
    const src = await readFile('routes/setup/calibration.js', 'utf8');
    expect(src, 'the PUT handler must deepMerge config').to.match(/deepMerge\(parts\[partIndex\]\.config \|\| \{\}, updates\.config\)/);
  });
});
