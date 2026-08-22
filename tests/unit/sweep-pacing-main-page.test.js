/**
 * Bench regression (2026-08-22, Sir Dragomir): the calibration page's Sweep
 * Test fired all six goto legs back-to-back. /goto acks when the command is
 * ISSUED (the daemon ack is milliseconds), not when the servo ARRIVES, so the
 * whole "range of motion" test completed almost instantly: the servo just
 * retargeted mid-flight, never visited either end, and the command path was
 * flooded with commands.
 *
 * Pinned here: the sweep loop paces every absolute-servo leg by an estimate
 * of real travel time (sweepLegWaitMs), the estimate knows a geared
 * multi-turn output is slower per degree than a standard servo, and the
 * waits sit BETWEEN the goto legs, not after the loop.
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Sweep test pacing on the main calibration page', function () {
  this.timeout(20000);

  let sweepSource;

  before(async function () {
    const res = await request(BASE_URL).get('/setup/calibration').expect(200);
    // Isolate the sweep implementation so assertions cannot be satisfied by
    // unrelated code elsewhere on the page.
    const start = res.text.indexOf('function sweepLegWaitMs');
    const end = res.text.indexOf('window.runSweepTest');
    expect(start, 'pacing helper sweepLegWaitMs must exist on the page').to.be.greaterThan(-1);
    expect(end, 'runSweepTest must still be exported on window').to.be.greaterThan(start);
    sweepSource = res.text.slice(start, end);
  });

  it('estimates travel per leg, slower for multi-turn outputs than standard servos', function () {
    // The multi-turn branch must estimate MORE ms per degree than the
    // standard branch — a geared 900° output is slower per output degree.
    const branch = sweepSource.match(/>\s*360\)?\s*\?\s*(\d+)\s*:\s*(\d+)/);
    expect(branch, 'sweepLegWaitMs must branch on a multi-turn range (maxDeg > 360)').to.not.equal(null);
    const multiTurnRate = Number(branch[1]);
    const standardRate = Number(branch[2]);
    expect(multiTurnRate, 'multi-turn ms/deg must exceed standard ms/deg').to.be.greaterThan(standardRate);
    // A standard hobby servo at full speed runs ~3.3 ms/deg no-load; an
    // estimate at or below that undershoots real travel and re-opens the bug.
    expect(standardRate).to.be.greaterThan(3.3);
  });

  it('waits out the travel estimate between every goto leg of the sweep', function () {
    const minLeg = sweepSource.indexOf('gotoPayload(sweepMin)');
    const maxLeg = sweepSource.indexOf('gotoPayload(sweepMax)');
    const midLeg = sweepSource.indexOf('gotoPayload(mid)');
    expect(minLeg, 'min leg present').to.be.greaterThan(-1);
    expect(maxLeg, 'max leg present').to.be.greaterThan(minLeg);
    expect(midLeg, 'mid return leg present').to.be.greaterThan(maxLeg);

    const waitBetweenMinAndMax = sweepSource.slice(minLeg, maxLeg).includes('sweepSleep(');
    const waitBetweenMaxAndMid = sweepSource.slice(maxLeg, midLeg).includes('sweepSleep(');
    const waitAfterMid = sweepSource.slice(midLeg).includes('sweepSleep(');
    expect(waitBetweenMinAndMax, 'min→max must wait out travel before commanding max').to.equal(true);
    expect(waitBetweenMaxAndMid, 'max→(next cycle|mid) must wait out travel first').to.equal(true);
    expect(waitAfterMid, 'the mid return must finish before the button re-arms').to.equal(true);
  });

  it('scales the servo wait by the measured window, not a fixed pause', function () {
    // Every servo-leg wait must derive from the window span and the part's
    // real range — a hardcoded sleep would under-wait a 900° window.
    const servoWaits = (sweepSource.match(/sweepLegWaitMs\([^\n]*/g) || [])
      .filter(call => !call.includes('spanDeg')); // drop the definition, keep call sites
    expect(servoWaits.length, 'at least the three legs pace via sweepLegWaitMs').to.be.at.least(3);
    for (const call of servoWaits) {
      expect(call).to.include('currentPartMaxAngleDeg');
    }
  });
});
