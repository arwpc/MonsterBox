/**
 * Regression tests for AI config persistence.
 *
 * These exist because of a real incident: a browser-test pass through the AI
 * settings page saved a TTS config and silently deleted a character's voice.
 * `saveTTSConfig` wrote whatever the client sent straight over the file, and the
 * settings UI only exposes model/stability/similarity — so `voice_id` and `speed`,
 * which are the character's IDENTITY rather than tunables, were destroyed. The
 * character carried on talking in the shared fallback voice, sounding like
 * somebody else, with nothing logged.
 *
 * The contract now: a save changes ONLY the fields the caller actually sent.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

describe('AI config store — partial saves must not delete identity', function () {
  this.timeout(15000);

  let store;
  let configPath;
  let original = null;

  before(async function () {
    store = await import('../../services/aiConfigStore.js');
    const { readConfig } = await import('../../services/configService.js');
    const cfg = await readConfig();
    const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
    configPath = path.resolve(APP_ROOT, dataDir, 'ai-config', 'tts-config.json');
    try {
      original = await fs.readFile(configPath, 'utf8');
    } catch (_) {
      original = null; // no file on this node; tests below will create and remove one
    }
  });

  after(async function () {
    // Always put the node back exactly as we found it — this suite writes to the
    // live selected character's config, which is real data on a real animatronic.
    try {
      if (original !== null) await fs.writeFile(configPath, original, 'utf8');
      else await fs.rm(configPath, { force: true });
    } catch (_) { /* best effort */ }
  });

  it('preserves voice_id and speed when the settings UI saves only its own fields', async function () {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({
      model: 'eleven_v3',
      voice_id: 'VOICE_UNDER_TEST',
      speed: 0.75,
      stability: 0.35,
      similarity_boost: 0.8
    }, null, 2));

    // Exactly the payload the AI settings page sends when a slider moves.
    await store.saveTTSConfig({ model: 'eleven_v3', stability: 0.5, similarity_boost: 0.5 });

    const after = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(after.voice_id, 'voice_id must survive a partial save').to.equal('VOICE_UNDER_TEST');
    expect(after.speed, 'speed must survive a partial save').to.equal(0.75);
    // …and the fields that WERE sent must actually change.
    expect(after.stability).to.equal(0.5);
    expect(after.similarity_boost).to.equal(0.5);
  });

  it('still applies an explicit voice change', async function () {
    await fs.writeFile(configPath, JSON.stringify({
      model: 'eleven_v3', voice_id: 'OLD_VOICE', speed: 0.9
    }, null, 2));

    await store.saveTTSConfig({ voice_id: 'NEW_VOICE' });

    const after = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(after.voice_id, 'an explicit change must win').to.equal('NEW_VOICE');
    expect(after.speed, 'unrelated fields untouched').to.equal(0.9);
  });

  it('ignores undefined values rather than writing them over real settings', async function () {
    await fs.writeFile(configPath, JSON.stringify({
      model: 'eleven_v3', voice_id: 'KEEP_ME', speed: 0.8
    }, null, 2));

    await store.saveTTSConfig({ voice_id: undefined, stability: 0.42 });

    const after = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(after.voice_id).to.equal('KEEP_ME');
    expect(after.stability).to.equal(0.42);
  });

  it('preserves microphonePartId when STT settings are partially saved', async function () {
    const sttPath = path.join(path.dirname(configPath), 'stt-config.json');
    let sttOriginal = null;
    try { sttOriginal = await fs.readFile(sttPath, 'utf8'); } catch (_) { /* none */ }
    try {
      await fs.writeFile(sttPath, JSON.stringify({
        model: 'scribe_v2', microphonePartId: 7, vadThreshold: 0.4
      }, null, 2));

      await store.saveSTTConfig({ vadThreshold: 0.55 });

      const after = JSON.parse(await fs.readFile(sttPath, 'utf8'));
      expect(after.microphonePartId, 'the configured microphone must survive').to.equal(7);
      expect(after.vadThreshold).to.equal(0.55);
    } finally {
      if (sttOriginal !== null) await fs.writeFile(sttPath, sttOriginal, 'utf8');
      else await fs.rm(sttPath, { force: true });
    }
  });
});

describe('AI config store — every character resolves to its own voice', function () {
  this.timeout(15000);

  it('no two characters share a voice unless their data says so', async function () {
    const { getTTSConfigForCharacter } = await import('../../services/aiConfigStore.js');
    const charactersPath = path.join(APP_ROOT, 'data', 'characters.json');

    let characters;
    try {
      characters = JSON.parse(await fs.readFile(charactersPath, 'utf8'));
    } catch (_) {
      this.skip();
      return;
    }
    const list = Array.isArray(characters) ? characters : (characters.characters || []);
    if (!list.length) { this.skip(); return; }

    const byVoice = new Map();
    for (const c of list) {
      const cfg = await getTTSConfigForCharacter(c.id);
      expect(cfg.voice_id, `character ${c.id} (${c.name || ''}) has a voice_id`).to.be.a('string').and.not.empty;
      if (!byVoice.has(cfg.voice_id)) byVoice.set(cfg.voice_id, []);
      byVoice.get(cfg.voice_id).push(`${c.id}:${c.name || ''}`);
    }

    // A shared voice is how "four of six characters spoke in the wrong voice"
    // looked from the outside — several characters collapsing onto one fallback.
    const shared = [...byVoice.entries()].filter(([, who]) => who.length > 1);
    expect(shared.map(([v, who]) => `${v} <- ${who.join(', ')}`).join(' | '),
      'characters sharing one voice').to.equal('');
  });
});
