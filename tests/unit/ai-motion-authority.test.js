/**
 * AI Motion authority unit suite.
 *
 * AI Motion answers exactly one question — "may this character move right now,
 * and with what" — regardless of which of the three mechanisms asked (the agent
 * choosing a capability mid-sentence, a guest asking out loud, or the ambient
 * behaviour that used to fire a random pose on every utterance). This suite
 * covers the two pure functions that carry that answer, plus the defaults that
 * decide what an un-configured character is allowed to do.
 *
 * Pure and fixture-driven: no filesystem, no server, no hardware, and fictional
 * character names throughout, per the independence audit.
 */
import { expect } from 'chai';
import {
  MOTION_ROLES,
  getDefaultAiMotionConfig,
  validateAiMotionConfig,
  isMotionAllowed
} from '../../services/aiMotionSuperPowerService.js';

/** A config shaped like a fully authored character, overridable per case. */
function volkarConfig(overrides = {}) {
  const base = getDefaultAiMotionConfig();
  return {
    ...base,
    enabled: true,
    ...overrides,
    triggers: { ...base.triggers, ...(overrides.triggers || {}) },
    permissions: { ...base.permissions, ...(overrides.permissions || {}) }
  };
}

describe('AI Motion authority', function () {
  describe('MOTION_ROLES', function () {
    it('is a non-empty array of unique role names', function () {
      expect(MOTION_ROLES).to.be.an('array').that.is.not.empty;
      expect(new Set(MOTION_ROLES).size).to.equal(MOTION_ROLES.length);
    });

    it('covers the roles the body-role interpreter can resolve', function () {
      for (const role of ['head', 'jaw', 'eye', 'arm', 'torso', 'light']) {
        expect(MOTION_ROLES, `role "${role}"`).to.include(role);
      }
    });
  });

  describe('getDefaultAiMotionConfig', function () {
    it('is OFF by default, so a character can only move once an operator says so', function () {
      expect(getDefaultAiMotionConfig().enabled).to.equal(false);
    });

    it('defaults ambientDuringSpeech to FALSE', function () {
      // This is the random-pose behaviour: a pose fired on every single
      // utterance, with no settings page anywhere. Defaulting this trigger ON
      // is exactly how it came to be armed fleet-wide — including on a node
      // whose neck servo is a 900-degree multi-turn that tears its own head
      // cabling on a full rotation. If this assertion ever fails, the fleet has
      // been re-armed by a default, not by an operator.
      expect(getDefaultAiMotionConfig().triggers.ambientDuringSpeech).to.equal(false);
    });

    it('carries the full triggers and permissions shape', function () {
      const cfg = getDefaultAiMotionConfig();
      expect(cfg).to.have.all.keys('enabled', 'triggers', 'permissions');
      expect(cfg.triggers).to.have.all.keys('agentGesture', 'guestCommand', 'ambientDuringSpeech');
      expect(cfg.permissions).to.include.keys(
        'allowedRoles', 'deniedPartIds', 'kidSafeOnly', 'cooldownMs',
        'maxPerConversation', 'minConfidence', 'requireAddressByName',
        'ambientMinAmplitude', 'ambientMaxAmplitude');
    });

    it('every default allowedRole is a real motion role', function () {
      for (const role of getDefaultAiMotionConfig().permissions.allowedRoles) {
        expect(MOTION_ROLES, `default role "${role}"`).to.include(role);
      }
    });

    it('returns a fresh object each call (callers mutate their copy)', function () {
      const a = getDefaultAiMotionConfig();
      a.permissions.allowedRoles.push('tail');
      expect(getDefaultAiMotionConfig().permissions.allowedRoles).to.not.include('tail');
    });
  });

  describe('validateAiMotionConfig', function () {
    it('accepts a fully specified good config', function () {
      expect(validateAiMotionConfig(volkarConfig())).to.deep.equal([]);
    });

    it('accepts an empty partial (the page posts only what changed)', function () {
      expect(validateAiMotionConfig({})).to.deep.equal([]);
      expect(validateAiMotionConfig(null)).to.deep.equal([]);
    });

    it('names an unknown role in allowedRoles', function () {
      const errors = validateAiMotionConfig({ permissions: { allowedRoles: ['head', 'tentacle'] } });
      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.match(/tentacle/);
      expect(errors[0]).to.match(/role/i);
    });

    it('names every unknown role, not just the first', function () {
      const errors = validateAiMotionConfig({ permissions: { allowedRoles: ['tentacle', 'mandible'] } });
      expect(errors.join(' ')).to.match(/tentacle/).and.to.match(/mandible/);
    });

    it('rejects allowedRoles that is not an array', function () {
      const errors = validateAiMotionConfig({ permissions: { allowedRoles: 'head' } });
      expect(errors.join(' ')).to.match(/allowedRoles/);
    });

    it('rejects deniedPartIds that is not an array', function () {
      const errors = validateAiMotionConfig({ permissions: { deniedPartIds: '4' } });
      expect(errors.join(' ')).to.match(/deniedPartIds/);
    });

    it('names minConfidence when it is outside 0..1', function () {
      for (const bad of [1.7, -0.2, 'quite sure']) {
        const errors = validateAiMotionConfig({ permissions: { minConfidence: bad } });
        expect(errors.join(' '), `minConfidence=${bad}`).to.match(/minConfidence/);
      }
    });

    it('accepts the 0 and 1 endpoints of minConfidence', function () {
      expect(validateAiMotionConfig({ permissions: { minConfidence: 0 } })).to.deep.equal([]);
      expect(validateAiMotionConfig({ permissions: { minConfidence: 1 } })).to.deep.equal([]);
    });

    it('names cooldownMs and maxPerConversation when out of range', function () {
      expect(validateAiMotionConfig({ permissions: { cooldownMs: -1 } }).join(' ')).to.match(/cooldownMs/);
      expect(validateAiMotionConfig({ permissions: { maxPerConversation: 99999 } }).join(' '))
        .to.match(/maxPerConversation/);
    });

    it('names the ambient amplitude fields when they are outside 0..1', function () {
      expect(validateAiMotionConfig({ permissions: { ambientMinAmplitude: 4 } }).join(' '))
        .to.match(/ambientMinAmplitude/);
      expect(validateAiMotionConfig({ permissions: { ambientMaxAmplitude: -1 } }).join(' '))
        .to.match(/ambientMaxAmplitude/);
    });

    it('refuses an inverted ambient window (min above max)', function () {
      const errors = validateAiMotionConfig({
        permissions: { ambientMinAmplitude: 0.8, ambientMaxAmplitude: 0.3 }
      });
      expect(errors.join(' ')).to.match(/ambientMinAmplitude/);
      expect(errors.join(' ')).to.match(/ambientMaxAmplitude/);
    });

    it('accepts an ambient window where min equals max', function () {
      expect(validateAiMotionConfig({
        permissions: { ambientMinAmplitude: 0.4, ambientMaxAmplitude: 0.4 }
      })).to.deep.equal([]);
    });

    it('rejects non-object triggers and permissions', function () {
      expect(validateAiMotionConfig({ triggers: 'on' }).join(' ')).to.match(/triggers/);
      expect(validateAiMotionConfig({ permissions: 'all' }).join(' ')).to.match(/permissions/);
    });
  });

  describe('isMotionAllowed', function () {
    it('denies everything when the super power is disabled', function () {
      const r = isMotionAllowed(volkarConfig({ enabled: false }), { role: 'head', partId: '15' });
      expect(r.allowed).to.equal(false);
      expect(r.reason).to.be.a('string').and.match(/disabled/i);
    });

    it('denies a role that is not on the allow list', function () {
      // Willow may turn her head but must never drive her torso.
      const cfg = volkarConfig({ permissions: { allowedRoles: ['head', 'jaw'] } });
      const r = isMotionAllowed(cfg, { role: 'torso', partId: '3' });
      expect(r.allowed).to.equal(false);
      expect(r.reason).to.match(/torso/);
    });

    it('denies a partId on the deny list even when its role is allowed', function () {
      // The deny list is how a known-broken or cabling-fragile part is taken
      // off the table without disarming the whole character.
      const cfg = volkarConfig({ permissions: { allowedRoles: ['head'], deniedPartIds: ['15'] } });
      const r = isMotionAllowed(cfg, { role: 'head', partId: '15' });
      expect(r.allowed).to.equal(false);
      expect(r.reason).to.match(/15/);
      expect(r.reason).to.match(/deny list/i);
    });

    it('matches deny-list ids across string/number typing', function () {
      // Part ids are strings in scenes.json and numbers in poses.json, so an
      // authority check that only matched one of the two would silently permit
      // the part it was told to refuse.
      const cfg = volkarConfig({ permissions: { deniedPartIds: [15] } });
      expect(isMotionAllowed(cfg, { role: 'head', partId: '15' }).allowed).to.equal(false);
      const cfg2 = volkarConfig({ permissions: { deniedPartIds: ['15'] } });
      expect(isMotionAllowed(cfg2, { role: 'head', partId: 15 }).allowed).to.equal(false);
    });

    it('the deny list outranks the allow list', function () {
      const cfg = volkarConfig({ permissions: { allowedRoles: MOTION_ROLES.slice(), deniedPartIds: ['4'] } });
      expect(isMotionAllowed(cfg, { role: 'arm', partId: '4' }).allowed).to.equal(false);
    });

    it('allows an allowed role on a part that is not denied', function () {
      const cfg = volkarConfig({ permissions: { allowedRoles: ['head', 'light'], deniedPartIds: ['4'] } });
      expect(isMotionAllowed(cfg, { role: 'head', partId: '15' })).to.deep.equal({ allowed: true });
      expect(isMotionAllowed(cfg, { role: 'light', partId: '8' }).allowed).to.equal(true);
    });

    it('a partial config is merged over the defaults rather than crashing', function () {
      // Callers hand this whatever came out of super-powers.json, which on an
      // older node predates half these keys.
      expect(isMotionAllowed({ enabled: true }, { role: 'head' }).allowed).to.equal(true);
      expect(isMotionAllowed({ enabled: true }, { role: 'tail' }).allowed).to.equal(false);
      expect(isMotionAllowed({}, {}).allowed).to.equal(false);
      expect(isMotionAllowed(null, {}).allowed).to.equal(false);
    });

    it('with no role and no partId, an enabled character is allowed', function () {
      expect(isMotionAllowed(volkarConfig(), {}).allowed).to.equal(true);
      expect(isMotionAllowed(volkarConfig()).allowed).to.equal(true);
    });
  });
});
