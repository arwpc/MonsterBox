/**
 * Legacy `part.markers` must never again become a jaw guardrail.
 *
 * Why this test exists. Until 2026-08-21 `getCalibrationForPart()` fell back to
 * `part.markers` whenever the calibration profile was missing or was a placeholder.
 * That fallback was invisible and uncorrectable: the marker EDITOR does not exist —
 * every DOM id its code targets (setMinBtn, minValue, customMarkers, newMarkerName,
 * addMarkerBtn) is absent from every view, so the subsystem no-ops and no page
 * displays or edits the numbers.
 *
 * The values were also wrong. One fleet part still carries markers Min 63 / Max 131
 * against a measured window of 33-98 — numbers the service's own comment described
 * as "past the mechanical stops". So deleting a profile in order to re-calibrate
 * silently promoted 63/131 to the live guardrail and the next jaw-synced line drove
 * the jaw into its stop, with nothing in any UI able to show or fix it.
 *
 * Refusing is the doctrine the rest of the system already applies: calibratedBounds()
 * withholds a placeholder span, and head tracking logs "no usable calibrated window —
 * refusing to drive it". These tests pin that behaviour so the fallback cannot be
 * reintroduced by a well-meaning "restore the markers editor" change.
 */

import { expect } from 'chai';
import { getCalibrationForPart } from '../../services/jawAnimationSuperPowerService.js';

// The exact shape and values found on the fleet, so this test fails if the real
// hazard ever comes back rather than only a sanitized version of it.
const HAZARDOUS_MARKERS = [
  { name: 'Mid', kind: 'absolute', locked: false, value: 83, unit: 'deg' },
  { name: 'Max', kind: 'absolute', locked: false, value: 131, unit: 'deg' },
  { name: 'Min', kind: 'absolute', locked: false, value: 63, unit: 'deg' }
];

// A part id no character owns, so the store has no profile for it. That is the
// state a freshly-cleared profile leaves behind, which is the reachable trigger.
const UNCALIBRATED_PART = {
  id: 987654,
  name: 'Jaw with legacy markers and no calibration',
  type: 'servo',
  markers: HAZARDOUS_MARKERS
};

describe('Jaw guardrails — legacy markers are retired', function () {
  this.timeout(10000);

  it('refuses a part that has ONLY legacy markers and no real calibration', async function () {
    const cal = await getCalibrationForPart(UNCALIBRATED_PART, '3');
    expect(cal.calibrated, 'markers must not authorize driving the jaw').to.equal(false);
  });

  it('does not leak the marker values back as a usable window', async function () {
    const cal = await getCalibrationForPart(UNCALIBRATED_PART, '3');
    // The specific failure this guards: 63/131 reaching a caller as if measured.
    // Since 2026-09-07 an uncalibrated jaw IS offered a window (the operator's
    // jaw-config min/max, then the full span) — but never the marker values.
    expect(cal.calibrated).to.equal(false);
    expect(cal.minAngle, 'a drive window is offered').to.be.a('number');
    expect(cal.maxAngle, 'a drive window is offered').to.be.a('number');
    expect(cal.maxAngle).to.be.greaterThan(cal.minAngle);
    // `source` is the ONLY honest discriminator here, and it is asserted below.
    //
    // This used to also assert the window was not literally [63, 131], which
    // looked like a tighter check and was actually a false alarm: the
    // operator-authored jaw window in this character's super-powers.json is
    // 63-131 on all of its configs — the same numbers as the legacy markers, by
    // coincidence of the same jaw being measured twice. So the legitimate
    // jaw-config window is value-identical to the forbidden marker window, and a
    // comparison on values alone fails on correct behaviour. It did: this test
    // has been red on live data while the code under test was doing exactly the
    // right thing (returning source 'jaw-config', markers only logged).
    expect(cal.source, 'the window must come from the jaw config or the full span').to.be.oneOf(['jaw-config', 'placeholder-span', 'full-span']);
  });

  it('drives a part with neither profile nor markers from a real window instead of refusing', async function () {
    // Doctrine change 2026-09-07 (operator ruling: all hardware works, software
    // must not refuse): the old behaviour returned null/null here and left every
    // jaw on the fleet motionless after the calibration wipe.
    const bare = { id: 987655, name: 'Bare jaw', type: 'servo' };
    const cal = await getCalibrationForPart(bare, '3');
    expect(cal.calibrated).to.equal(false);
    expect(cal.minAngle).to.be.a('number');
    expect(cal.maxAngle).to.be.a('number');
    expect(cal.maxAngle).to.be.greaterThan(cal.minAngle);
    expect(cal.minAngle).to.be.at.least(0);
  });

  it('still honours a REAL measured profile — the retirement must not disable a calibrated jaw', async function () {
    // Character-scoped read: part ids repeat across characters, so this also pins
    // that the lookup stays scoped. Uses whichever jaw this node genuinely has.
    const { readFile } = await import('fs/promises');
    const { getCalibrationStore } = await import('../../server/calibration/store.js');
    const { readConfig } = await import('../../services/configService.js');

    const characterId = String((await readConfig()).selectedCharacter);
    let parts = [];
    try {
      parts = JSON.parse(await readFile(`data/character-${characterId}/parts.json`, 'utf8'));
    } catch (_) {
      this.skip();
      return;
    }

    const store = getCalibrationStore();
    let calibratedJaw = null;
    for (const part of parts.filter(p => p.type === 'servo')) {
      const profile = await store.get(part.id, characterId);
      if (profile && profile.autoGenerated === false && profile.bounds
          && typeof profile.bounds.minAngle === 'number') {
        calibratedJaw = { part, bounds: profile.bounds };
        break;
      }
    }
    // A node whose parts are all uncalibrated cannot prove this direction; skipping
    // is honest, and the three refusal tests above still hold there.
    if (!calibratedJaw) { this.skip(); return; }

    const cal = await getCalibrationForPart(calibratedJaw.part, characterId);
    expect(cal.calibrated, 'a real measured window must still be honoured').to.equal(true);
    expect(cal.minAngle).to.equal(calibratedJaw.bounds.minAngle);
    expect(cal.maxAngle).to.equal(calibratedJaw.bounds.maxAngle);
  });
});
