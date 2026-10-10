/**
 * Scene/pose validator (services/scenes/sceneValidator.js).
 *
 * Every fixture is synthetic — a made-up character id, parts list, hazard
 * config and registry — so the rules are proven without depending on any real
 * character's data (and without naming one).
 */
import { expect } from 'chai';
import { validateCharacterData, formatIssue, resolveGoblinInRegistry } from '../../services/scenes/sceneValidator.js';

const CID = 9101;

const PARTS = [
  { id: '1', type: 'servo' },
  { id: '2', type: 'servo' },
  { id: '3', type: 'servo' },
  { id: '7', type: 'motor' },
  { id: '8', type: 'light' },
  { id: '9', type: 'linear_actuator' },
  { id: '11', type: 'led_ring' }
];

function makeCtx(overrides = {}) {
  return Object.assign({
    root: '/nonexistent',
    audio: [{ id: 'thunder', filename: 'thunder.mp3', duration: 4 }],
    audioFiles: new Set(['thunder.mp3', 'bare.mp3']),
    goblins: [{ id: 'goblin-a', name: 'Goblin 2' }, { id: 'goblin-b', name: 'Goblin 3' }],
    goblinManifests: new Map([['goblin-a', new Set(['Moon.mp4'])]]),
    registry: [
      { id: 61, name: 'Test Count', characterId: CID, hostname: 'testcount', ip: '10.0.0.61', port: 3000 },
      { id: 62, name: 'Sir Testalot', characterId: 9102, hostname: 'sirtestalot', ip: '10.0.0.62', port: 3000 }
    ],
    faults: { characters: { [CID]: { parts: { '3': { status: 'broken', reason: 'test fault' } } } } },
    hazards: {
      characters: {
        [CID]: {
          exclusiveParts: [['1', '2']],
          partAngleRanges: { '3': { min: 372, max: 406, forbidPresets: true, forbidContinuous: true } },
          maxMotorSpeed: 40
        }
      }
    },
    calibrationStore: null
  }, overrides);
}

const POSES = {
  characterId: CID,
  poses: [
    { id: 1, name: 'One', parts: [{ partId: 1, type: 'servo', target: { angleDeg: 90 } }] },
    { id: 2, name: 'Two', parts: [{ partId: 2, type: 'servo', target: { angleDeg: 90 } }] }
  ]
};

async function check({ scenes, poses, ctx = makeCtx(), posesForLookup = POSES }) {
  return validateCharacterData({ characterId: CID, scenes, poses, parts: PARTS, posesForLookup, ctx });
}

const scene = (steps, extra = {}) => [Object.assign({ id: 1, name: 'S', steps }, extra)];
const msgs = (list) => list.map(i => i.message).join('\n');

describe('Scene validator', function () {
  it('accepts a clean scene and pose set', async function () {
    const r = await check({
      scenes: scene([
        { type: 'pose', poseId: '1' },
        { type: 'servo', partId: '2', angle: 45, duration: 500 },
        { type: 'motor', partId: '7', speed: 30, duration: 1200 },
        { type: 'light', partId: '8', state: 'on' },
        { type: 'audio', audioId: 'thunder' },
        { type: 'audio', audioId: 'bare.mp3' },
        { type: 'sayThis', text: 'Good evening.' },
        { type: 'goblin-video', goblinName: 'goblin 2', videoId: 'Moon.mp4', waitMs: 5000 },
        { type: 'wait', duration: 1000 }
      ]),
      poses: POSES
    });
    expect(r.errors, msgs(r.errors)).to.have.length(0);
  });

  it('reports file:scene:step messages', async function () {
    const r = await check({ scenes: scene([{ type: 'pose', poseId: 99 }]) });
    expect(r.errors).to.have.length(1);
    expect(formatIssue(r.errors[0])).to.match(/^data\/character-9101\/scenes\.json:scene 1 "S":step 0 — pose 99 does not exist/);
  });

  describe('references', function () {
    it('flags missing parts, wrong part types and parts without a controller', async function () {
      const r = await check({ scenes: scene([
        { type: 'servo', partId: '42', angle: 10 },
        { type: 'motor', partId: '1', speed: 10, duration: 100 },
        { type: 'light', partId: '11', state: 'on' }
      ]) });
      expect(msgs(r.errors)).to.contain('part 42 does not exist');
      expect(msgs(r.errors)).to.contain('motor step drives part 1, which is a servo');
      expect(msgs(r.errors)).to.contain('light step drives part 11, which is a led_ring');
    });

    it('warns, not fails, on a part listed physically broken', async function () {
      const r = await check({ scenes: scene([{ type: 'servo', partId: '3', angle: 380 }]) });
      expect(r.errors, msgs(r.errors)).to.have.length(0);
      expect(msgs(r.warnings)).to.contain('listed broken');
    });

    it('flags unresolvable audio and the audioFile misspelling', async function () {
      const r = await check({ scenes: scene([{ type: 'audio', audioId: 'nope' }, { type: 'audio', audioFile: 'thunder.mp3' }]) });
      expect(msgs(r.errors)).to.contain('"nope" is not in the audio library');
      expect(msgs(r.errors)).to.contain('uses "audioFile"');
    });

    it('resolves Goblins by id or name and checks the clip manifest', async function () {
      expect(resolveGoblinInRegistry('GOBLIN 3', makeCtx().goblins).goblin.id).to.equal('goblin-b');
      expect(resolveGoblinInRegistry('goblin-a', makeCtx().goblins).goblin.id).to.equal('goblin-a');
      const r = await check({ scenes: scene([
        { type: 'goblin-video', goblinId: 'Goblin 9', videoId: 'Moon.mp4' },
        { type: 'goblin-video', goblinName: 'Goblin 2', videoId: 'Sun.mp4' },
        { type: 'goblin-video', goblinName: 'Goblin 3', videoId: 'Moon.mp4' }
      ]) });
      expect(msgs(r.errors)).to.contain('no Goblin with id or name "Goblin 9"');
      expect(msgs(r.errors)).to.contain('"Sun.mp4" is not in Goblin 2');
      expect(msgs(r.warnings)).to.contain('no clip manifest for Goblin 3');
    });

    it('rejects the undispatchable linear_actuator spelling and unknown types', async function () {
      const r = await check({ scenes: scene([{ type: 'linear_actuator', partId: '9' }, { type: 'teleport' }]) });
      expect(msgs(r.errors)).to.contain('has no dispatcher');
      expect(msgs(r.errors)).to.contain('unknown step type "teleport"');
    });

    it('enforces integer scene ids, unique ids and a steps array', async function () {
      const r = await check({ scenes: [{ id: 'abc', name: 'x', steps: [] }, { id: 2, name: 'y' }, { id: 3, name: 'z', steps: [] }, { id: 3, name: 'w', steps: [] }] });
      expect(msgs(r.errors)).to.contain('scene id must be a positive integer');
      expect(msgs(r.errors)).to.contain('needs a steps array');
      expect(msgs(r.errors)).to.contain('duplicate scene id 3');
    });
  });

  describe('durations', function () {
    it('refuses blocking pulses longer than the 30 s wrapper cap and overlong waits', async function () {
      const r = await check({ scenes: scene([
        { type: 'linear-actuator', partId: '9', direction: 'extend', duration: 45000 },
        { type: 'wait', duration: 11 * 60 * 1000 }
      ]) });
      expect(msgs(r.errors)).to.contain('exceeds the 30 s hardware wrapper cap');
      expect(msgs(r.errors)).to.contain('longer than 10 minutes');
    });
  });

  describe('hazard: exclusive parts', function () {
    it('refuses both parts in one pose', async function () {
      const poses = { characterId: CID, poses: [{ id: 5, name: 'Both', parts: [
        { partId: 1, type: 'servo', target: { angleDeg: 90 } },
        { partId: 2, type: 'servo', target: { angleDeg: 90 } }] }] };
      const r = await check({ poses, scenes: undefined });
      expect(msgs(r.errors)).to.contain('parts 1 and 2 must never move together (in one pose)');
    });

    it('refuses them in one concurrent group, directly or through a pose', async function () {
      const r = await check({ scenes: scene([
        { type: 'servo', partId: '1', angle: 10, concurrent: true },
        { type: 'pose', poseId: 2 }
      ]) });
      expect(msgs(r.errors)).to.contain('in one concurrent group');
    });

    it('allows them one after the other', async function () {
      const r = await check({ scenes: scene([
        { type: 'servo', partId: '1', angle: 10 },
        { type: 'servo', partId: '2', angle: 10 }
      ]) });
      expect(r.errors, msgs(r.errors)).to.have.length(0);
    });
  });

  describe('hazard: angle window', function () {
    it('refuses an angle outside the window, a preset, a continuous target and jitter that can escape', async function () {
      const r = await check({
        scenes: scene([
          { type: 'servo', partId: '3', angle: 450 },
          { type: 'servo', partId: '3', usePreset: true, presetName: '__MAX__' }
        ]),
        poses: { characterId: CID, poses: [
          { id: 1, name: 'Spin', parts: [{ partId: 3, type: 'servo', target: { continuous: { direction: 'cw', durationMs: 500 } } }] },
          { id: 2, name: 'Jitter', jitterDeg: 10, parts: [{ partId: 3, type: 'servo', target: { angleDeg: 400 } }] }
        ] }
      });
      const text = msgs(r.errors);
      expect(text).to.contain('angle 450° is outside its hazard window 372-406°');
      expect(text).to.contain('never a preset (__MAX__)');
      expect(text).to.contain('never get a continuous spin target');
      expect(text).to.contain('± jitter 10°');
    });

    it('accepts an angle inside the window', async function () {
      const r = await check({ scenes: scene([{ type: 'servo', partId: '3', angle: 390 }]) });
      expect(r.errors, msgs(r.errors)).to.have.length(0);
    });
  });

  describe('hazard: motor speed ceiling', function () {
    it('refuses a motor step above the ceiling and one that relies on the default speed', async function () {
      const r = await check({ scenes: scene([
        { type: 'motor', partId: '7', speed: 60, duration: 500 },
        { type: 'motor', partId: '7', duration: 500 }
      ]) });
      expect(msgs(r.errors)).to.contain('speed 60% exceeds');
      expect(msgs(r.errors)).to.contain('needs an explicit speed');
    });

    it('applies the ceiling to pose motor targets too', async function () {
      const r = await check({ scenes: undefined, poses: { characterId: CID, poses: [
        { id: 1, name: 'Fast', parts: [{ partId: 7, type: 'motor', target: { speed: 80, direction: 'forward', duration: 500 } }] }] } });
      expect(msgs(r.errors)).to.contain('speed 80% exceeds');
    });
  });

  describe('poses', function () {
    it('requires numeric pose ids and numeric part ids', async function () {
      const r = await check({ scenes: undefined, poses: { characterId: CID, poses: [
        { id: '4', name: 'Str', parts: [{ partId: '1', type: 'servo', target: { angleDeg: 10 } }] }] } });
      expect(msgs(r.errors)).to.contain('pose id must be a positive integer number');
      expect(msgs(r.errors)).to.contain('partId must be a number');
    });
  });

  describe('fleet steps', function () {
    it('resolves nodes by name, id and loose fragment, and refuses unknown ones', async function () {
      const r = await check({ scenes: scene([
        { type: 'fleet-say', node: 'all', text: 'Together!' },
        { type: 'fleet-audio', node: 'testalot', audioId: 'thunder' },
        { type: 'fleet-mode', node: 62, mode: 'hold' },
        { type: 'fleet-stop-audio', node: 'Nobody' },
        { type: 'fleet-scene', node: 'all', scene: 1 },
        { type: 'fleet-mode', node: 'all', mode: 'pause' }
      ]) });
      const text = msgs(r.errors);
      expect(text).to.contain('no animatronic named "Nobody"');
      expect(text).to.contain("node 'all' is not allowed");
      expect(text).to.contain("mode must be 'hold' or 'release'");
      expect(r.errors).to.have.length(3);
    });

    it('checks a fleet-scene target against the scenes under test', async function () {
      const r = await check({ scenes: [
        { id: 1, name: 'Conductor', steps: [{ type: 'fleet-scene', node: 'Test Count', scene: 'Part Two' }, { type: 'fleet-scene', node: 61, scene: 77 }] },
        { id: 2, name: 'Part Two', steps: [] }
      ] });
      expect(msgs(r.errors)).to.contain('scene "77" not found');
      expect(r.errors).to.have.length(1);
    });
  });
});
