/**
 * Character Pact Suite
 *
 * Runs the same contract against every character registered in data/characters.json.
 * Adding a 6th character automatically adds every assertion in this suite —
 * no new test code required.
 *
 * Scope: data-file + service-level contracts that do NOT require a running server.
 * HTTP contract checks (/api/parts/:id, /setup/jaw-animation/...) are covered
 * by the existing system test suites and re-run under `npm run gate`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { validateCharacter } from '../../services/schemaValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = path.join(REPO_ROOT, 'data');

function readJsonOrNull(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const registry = readJsonOrNull(path.join(DATA_ROOT, 'characters.json')) || [];
const filterId = process.env.PACT_CHARACTER_FILTER
  ? parseInt(process.env.PACT_CHARACTER_FILTER, 10)
  : null;
const characters = filterId ? registry.filter((c) => c.id === filterId) : registry;

const KNOWN_STEP_TYPES = new Set([
  'servo', 'motor', 'linear-actuator', 'linear_actuator',
  'light', 'led', 'audio', 'sayThis', 'askAI',
  'goblin-video', 'wait', 'delay', 'sensor',
  'pose', 'hardware', 'jaw-animation', 'head-tracking',
]);

const KNOWN_PART_TYPES = new Set([
  'servo', 'continuous-servo', 'continuous_servo',
  'motor', 'linear_actuator', 'linear-actuator', 'stepper',
  'light', 'led', 'sensor', 'motion_sensor',
  'speaker', 'microphone', 'webcam',
]);

describe('Character Pact Suite', function () {
  if (characters.length === 0) {
    it('has characters to test (skipped: no registry entries)', function () {
      this.skip();
    });
    return;
  }

  for (const character of characters) {
    const charDir = path.join(DATA_ROOT, `character-${character.id}`);

    describe(`character-${character.id} (${character.name})`, function () {
      it('has a registry entry with id and name', function () {
        expect(character.id, 'id').to.be.a('number');
        expect(character.name, 'name').to.be.a('string').and.not.empty;
      });

      it('has a data directory on disk', function () {
        expect(fs.existsSync(charDir), `data/character-${character.id}/ exists`).to.equal(true);
      });

      it('passes schema validation across all data files', function () {
        const result = validateCharacter(character.id, DATA_ROOT);
        const summary = result.errors.map((e) => `${e.file}: ${e.path} — ${e.rule}: ${e.message}`).join('\n');
        expect(result.valid, `schema errors:\n${summary}`).to.equal(true);
      });

      it('has parts.json with at least one enabled part', function () {
        const parts = readJsonOrNull(path.join(charDir, 'parts.json'));
        expect(parts, 'parts.json parses').to.be.an('array');
        const enabled = parts.filter((p) => p.enabled !== false);
        expect(enabled.length, 'enabled parts count').to.be.greaterThan(0);
      });

      it('every part has a known type', function () {
        const parts = readJsonOrNull(path.join(charDir, 'parts.json')) || [];
        const unknown = parts.filter((p) => !KNOWN_PART_TYPES.has(p.type));
        expect(unknown, `unknown part types: ${unknown.map((p) => `${p.id}:${p.type}`).join(', ')}`).to.deep.equal([]);
      });

      it('every part has a stable id (string or number, unique)', function () {
        const parts = readJsonOrNull(path.join(charDir, 'parts.json')) || [];
        const ids = parts.map((p) => String(p.id));
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes, `duplicate part ids: ${dupes.join(', ')}`).to.deep.equal([]);
      });

      it('scenes.json scenes reference only known step types', function () {
        const scenes = readJsonOrNull(path.join(charDir, 'scenes.json'));
        if (!Array.isArray(scenes)) { this.skip(); return; }
        const bad = [];
        for (const s of scenes) {
          for (const step of s.steps || []) {
            if (!KNOWN_STEP_TYPES.has(step.type)) bad.push(`${s.name || s.id}:${step.type}`);
          }
        }
        expect(bad, `unknown step types: ${bad.join(', ')}`).to.deep.equal([]);
      });

      it('poses.json (if present) declares characterId matching the registry', function () {
        const poses = readJsonOrNull(path.join(charDir, 'poses.json'));
        if (!poses) { this.skip(); return; }
        expect(poses.characterId, 'characterId in poses.json').to.equal(character.id);
      });

      it('ai-config/tts-config.json loads with a model string', function () {
        const tts = readJsonOrNull(path.join(charDir, 'ai-config', 'tts-config.json'));
        expect(tts, 'tts-config.json parses').to.be.an('object');
        expect(tts.model, 'model').to.be.a('string').and.not.empty;
      });

      it('ai-config/stt-config.json loads with a microphonePartId field', function () {
        const stt = readJsonOrNull(path.join(charDir, 'ai-config', 'stt-config.json'));
        expect(stt, 'stt-config.json parses').to.be.an('object');
        expect(Object.prototype.hasOwnProperty.call(stt, 'microphonePartId'), 'microphonePartId declared').to.equal(true);
      });

      it('super-powers.json (if present) has a valid jawAnimation shape', function () {
        const sp = readJsonOrNull(path.join(charDir, 'super-powers.json'));
        if (!sp) { this.skip(); return; }
        if (!sp.jawAnimation) { this.skip(); return; }
        const configs = sp.jawAnimation.configs || [];
        for (const cfg of configs) {
          expect(cfg.id, `jawAnimation.configs[].id`).to.not.equal(undefined);
          expect(cfg.minAngle, `jawAnimation.configs[].minAngle`).to.be.a('number');
          expect(cfg.maxAngle, `jawAnimation.configs[].maxAngle`).to.be.a('number');
          expect(cfg.maxAngle).to.be.greaterThan(cfg.minAngle);
        }
      });
    });
  }
});
