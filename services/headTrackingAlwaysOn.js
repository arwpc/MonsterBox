/**
 * Head tracking "always on" — the decision layer.
 *
 * A character opts in with `headTracking.alwaysOn: true` in super-powers.json.
 * Absent or false keeps the historical behaviour exactly: head tracking runs only
 * while lurk is on / the PIR has woken the character, and every lurk sleep or
 * disable turns it off.
 *
 * When opted in:
 *   - server startup starts the tracker and enables head tracking;
 *   - lurk sleep / lurk disable leave head tracking running (they still quiet
 *     everything else);
 *   - the operator's explicit head-tracking toggle OFF still wins for the rest of
 *     the session (in-memory, so a restart restores the opted-in default);
 *   - a panic stop (`force`) always stops it.
 *
 * Kept pure (plus one in-memory set) so it can be unit-tested without a camera,
 * a servo, or the conversation router.
 */

// Characters whose operator turned head tracking OFF this session. Memory only:
// the opt-in flag lives in config (which may be LOCKED), and a toggle is an
// instruction about right now, not a config edit.
const operatorOff = new Set();

function key(characterId) {
  return characterId == null ? '' : String(characterId);
}

/** True only for an explicit boolean opt-in — never for truthy strings or numbers. */
export function isHeadTrackingAlwaysOn(headTrackingConfig) {
  return !!headTrackingConfig && headTrackingConfig.alwaysOn === true;
}

/** Record the operator's explicit head-tracking toggle for this session. */
export function noteOperatorHeadTrackingToggle(characterId, enabled) {
  if (enabled) operatorOff.delete(key(characterId));
  else operatorOff.add(key(characterId));
}

export function isOperatorHeadTrackingOff(characterId) {
  return operatorOff.has(key(characterId));
}

/**
 * Should a lurk sleep/disable leave head tracking running for this character?
 * @param {object} headTrackingConfig  result of readHeadTrackingConfig()
 * @param {string|number} characterId
 * @param {{force?: boolean}} [opts]   force = panic stop: always stop
 */
export function shouldKeepHeadTrackingOnLurkStop(headTrackingConfig, characterId, opts = {}) {
  if (opts && opts.force) return false;
  if (!isHeadTrackingAlwaysOn(headTrackingConfig)) return false;
  return !isOperatorHeadTrackingOff(characterId);
}

/**
 * Should server startup bring head tracking up for this character?
 * Never in test mode (no camera/servo there) and never without a character.
 */
export function shouldStartHeadTrackingAtBoot(headTrackingConfig, characterId, env = process.env) {
  if (characterId == null || characterId === '') return false;
  const testMode = env && (env.MB_TEST_MODE === '1' || env.MB_TEST_MODE === 'true');
  if (testMode) return false;
  if (!isHeadTrackingAlwaysOn(headTrackingConfig)) return false;
  return !isOperatorHeadTrackingOff(characterId);
}

/** Test hook. */
export function _resetForTests() {
  operatorOff.clear();
}

export default {
  isHeadTrackingAlwaysOn,
  noteOperatorHeadTrackingToggle,
  isOperatorHeadTrackingOff,
  shouldKeepHeadTrackingOnLurkStop,
  shouldStartHeadTrackingAtBoot,
  _resetForTests
};
