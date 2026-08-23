/**
 * Operator ruling (2026-08-23): head tracking and motion tracking must ONLY
 * EVER run one at a time — starting one shuts the other down, visibly. Before
 * this, each silently restarted or killed the other's OpenCV pipeline while
 * both believed they owned it, which read at the bench as "OpenCV was working
 * and just stopped, settings perfect."
 *
 * Also pinned: gesture/pose light steps dispatch 'turnOn'/'turnOff' through
 * controlPart, and the 'led' controller never carried those actions — every
 * gesture or pose light step on a type:'led' part failed with
 * "Action 'turnOn' not supported" (v11 audit finding, confirmed at the gate).
 */

import { expect } from 'chai';

describe('One camera consumer at a time (head vs motion tracking)', function () {
  this.timeout(15000);

  const WEBCAM_ID = 'exclusivity-test-cam';

  it('starting motion tracking SHUTS DOWN head tracking on the same webcam', async function () {
    const ctl = await import('../../controllers/motionTrackingController.js');

    ctl.enableHeadTrackingForWebcam(WEBCAM_ID, { panServoId: 987654 });
    expect(ctl.getHeadTrackingStateForWebcam(WEBCAM_ID).enabled, 'precondition: head tracking armed').to.equal(true);

    // The fake webcam has no device, so the start 404s — but the ruling is
    // about the button press: starting motion tracking shuts head tracking
    // down FIRST, before any device lookup.
    let statusCode = 200;
    let body = null;
    const res = {
      json: (b) => { body = b; },
      status: (c) => { statusCode = c; return { json: (b) => { body = b; } }; }
    };
    await ctl.startMotionTracking({ body: { webcamId: WEBCAM_ID } }, res);

    expect(ctl.getHeadTrackingStateForWebcam(WEBCAM_ID).enabled,
      'head tracking must be OFF the moment motion tracking is started').to.equal(false);
    expect(statusCode, 'no device on the synthetic webcam').to.equal(404);

    ctl.disableHeadTrackingForWebcam(WEBCAM_ID); // cleanup (idempotent)
  });
});

describe("LED parts accept the gesture/pose 'turnOn'/'turnOff' dispatch", function () {
  this.timeout(15000);

  const savedEnv = {};
  before(function () {
    for (const [k, v] of Object.entries({ MB_TEST_MODE: '1', CI: 'true' })) {
      savedEnv[k] = process.env[k];
      process.env[k] = v; // simulated exec echoes wrapper args, no GPIO needed
    }
  });
  after(function () {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('turnOn drives the LED to full brightness through the real brightness path', async function () {
    const { HARDWARE_CONTROLLERS } = (await import('../../services/hardwareService/index.js')).default;
    const result = await HARDWARE_CONTROLLERS.led.turnOn({ pin: 12 });
    expect(result.success, 'a gesture light step must not fail on a led part').to.equal(true);
    expect(result.brightness).to.equal(100);
  });

  it('turnOn honours an explicit brightness level; turnOff goes to zero', async function () {
    const { HARDWARE_CONTROLLERS } = (await import('../../services/hardwareService/index.js')).default;
    const on = await HARDWARE_CONTROLLERS.led.turnOn({ pin: 12, brightness: 50 });
    expect(on.brightness).to.equal(50);
    const off = await HARDWARE_CONTROLLERS.led.turnOff({ pin: 12 });
    expect(off.success).to.equal(true);
    expect(off.brightness).to.equal(0);
  });
});
