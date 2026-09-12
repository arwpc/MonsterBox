/**
 * AI Motion enforcement — the toggle has to actually withhold motion.
 *
 * AI Motion gates three trigger paths: the agent choosing a capability as it
 * speaks, a guest asking for one out loud, and the ambient behaviour that used
 * to fire a random pose on EVERY utterance. A super power whose switch only
 * changes a stored boolean is decorative, and this fleet has already been bitten
 * by a control that reported success while changing nothing.
 *
 * All three gates must fail CLOSED. An unreadable or missing config withholds
 * motion; it must never grant it. That direction matters more than the happy
 * path — the failure this replaces is a character moving when nobody authorised
 * it, on hardware that tears its own cabling.
 *
 * This suite deliberately asserts only the REFUSAL paths. The both-enabled case
 * drives real hardware on whichever animatronic the node is serving, so it is
 * verified by hand and by scripts/fleet-e2e.mjs --drive, never by an automated
 * suite that might run unattended at 3am.
 */
import { expect } from 'chai';
import {
  getDefaultAiMotionConfig,
  readAiMotionConfig,
  writeAiMotionConfig,
  isMotionAllowed
} from '../../services/aiMotionSuperPowerService.js';

const CHAR = 3;

describe('AI Motion enforcement', function () {
  this.timeout(20000);

  let prior = null;
  before(async () => { prior = await readAiMotionConfig(CHAR); });
  after(async () => { if (prior) await writeAiMotionConfig(CHAR, prior); });

  describe('the ambient trigger — the one that was armed fleet-wide', function () {
    let randomPose;
    before(async () => {
      randomPose = await import('../../services/randomPoseService.js').then(m => m.default || m);
    });

    it('refuses while AI Motion is disabled', async () => {
      await writeAiMotionConfig(CHAR, { ...prior, enabled: false });
      // Text length is over the service's own 50-char floor so the length guard
      // is not what refuses — the AI Motion gate has to be the thing that does.
      const r = await randomPose.triggerDuringTTS(CHAR, 400);
      expect(r.success).to.equal(false);
      expect(String(r.reason)).to.match(/disabled/i);
    });

    it('refuses while ambient-during-speech is off, even with AI Motion on', async () => {
      await writeAiMotionConfig(CHAR, {
        ...prior, enabled: true,
        triggers: { ...prior.triggers, ambientDuringSpeech: false }
      });
      const r = await randomPose.triggerDuringTTS(CHAR, 400);
      expect(r.success).to.equal(false);
      expect(String(r.reason)).to.match(/ambient/i);
    });
  });

  describe('the authority check', function () {
    it('denies everything while disabled', function () {
      const cfg = { ...getDefaultAiMotionConfig(), enabled: false };
      const v = isMotionAllowed(cfg, { role: 'head' });
      expect(v.allowed).to.equal(false);
      expect(v.reason).to.match(/disabled/i);
    });

    it('denies a role the operator has not permitted', function () {
      const cfg = { ...getDefaultAiMotionConfig(), enabled: true };
      cfg.permissions = { ...cfg.permissions, allowedRoles: ['head'] };
      expect(isMotionAllowed(cfg, { role: 'torso' }).allowed).to.equal(false);
      expect(isMotionAllowed(cfg, { role: 'head' }).allowed).to.equal(true);
    });

    it('denies a part on the deny list regardless of its role', function () {
      const cfg = { ...getDefaultAiMotionConfig(), enabled: true };
      cfg.permissions = { ...cfg.permissions, allowedRoles: ['head'], deniedPartIds: ['15'] };
      expect(isMotionAllowed(cfg, { role: 'head', partId: '15' }).allowed).to.equal(false);
      expect(isMotionAllowed(cfg, { role: 'head', partId: '10' }).allowed).to.equal(true);
    });

    it('matches deny-list ids across string and number', function () {
      // Part ids are strings in scenes.json and numbers in poses.json. A
      // one-sided comparison would silently permit a part it was told to refuse.
      const cfg = { ...getDefaultAiMotionConfig(), enabled: true };
      cfg.permissions = { ...cfg.permissions, allowedRoles: ['head'], deniedPartIds: [15] };
      expect(isMotionAllowed(cfg, { role: 'head', partId: '15' }).allowed).to.equal(false);
      cfg.permissions.deniedPartIds = ['15'];
      expect(isMotionAllowed(cfg, { role: 'head', partId: 15 }).allowed).to.equal(false);
    });
  });

  describe('a character with no stored config', function () {
    it('reads defaults, and the defaults are OFF', async () => {
      const cfg = await readAiMotionConfig(99999);
      expect(cfg.enabled).to.equal(false);
      // Defaulting the ambient trigger ON is precisely how random poses came to
      // be armed on four of six nodes, including one whose 900-degree neck tears
      // its own head cabling. It stays off until an operator says otherwise.
      expect(cfg.triggers.ambientDuringSpeech).to.equal(false);
    });
  });
});
