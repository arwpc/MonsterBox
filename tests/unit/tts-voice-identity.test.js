/**
 * Regression tests for TTS voice identity.
 *
 * Real incident: aiConfigStore exported a GLOBAL_DEFAULT_VOICE constant,
 * documented as a neutral shared fallback that avoided "impersonating whoever
 * the fallback belongs to". Its value was one specific cast member's voice_id.
 * So every character missing a voice_id silently spoke AS that character — the
 * surviving mechanism behind the wrong-voice bug that had several characters
 * all sounding like the same one.
 *
 * A second, subtler path did the same thing: getTTSConfig() reads
 * config.dataPath, which is data/character-{selected} — not a neutral global. A
 * character with no config of its own therefore inherited the voice of whichever
 * character happened to be selected on that node.
 *
 * Contract now: a named character's voice comes from that character's own data
 * or the call fails loudly. Silently wrong is the failure mode that survived
 * undetected across four characters; a thrown error will not.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');

async function registeredCharacters() {
  const raw = await fs.readFile(path.join(DATA_ROOT, 'characters.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed.characters || []);
}

describe('TTS voice identity — no character may be handed another character\'s voice', function () {
  this.timeout(15000);

  let store;
  let characters;

  before(async function () {
    store = await import('../../services/aiConfigStore.js');
    characters = await registeredCharacters();
  });

  it('the module contains no hardcoded voice id at all', async function () {
    const src = await fs.readFile(path.join(APP_ROOT, 'services', 'aiConfigStore.js'), 'utf8');

    // ElevenLabs voice ids are 20-character alphanumeric tokens. Any string
    // literal of that shape in this file is a voice baked into code, which is
    // precisely what caused the bug — identity belongs in data.
    const stringLiterals = src.match(/'[^'\n]*'|"[^"\n]*"/g) || [];
    const suspicious = stringLiterals.filter(lit => /^['"][A-Za-z0-9]{20}['"]$/.test(lit));
    expect(suspicious, 'hardcoded voice id(s) found in aiConfigStore.js').to.deep.equal([]);
  });

  it('gives every registered character the voice its own data specifies', async function () {
    expect(characters.length).to.be.greaterThan(0);
    for (const c of characters) {
      const onDisk = JSON.parse(
        await fs.readFile(
          path.join(DATA_ROOT, `character-${c.id}`, 'ai-config', 'tts-config.json'),
          'utf8'
        )
      );
      const cfg = await store.getTTSConfigForCharacter(c.id);
      expect(cfg.voice_id, `character ${c.id} (${c.name}) must use its own configured voice`)
        .to.equal(onDisk.voice_id);
    }
  });

  it('no two characters end up sharing a voice', async function () {
    const byVoice = new Map();
    for (const c of characters) {
      const cfg = await store.getTTSConfigForCharacter(c.id);
      if (!byVoice.has(cfg.voice_id)) byVoice.set(cfg.voice_id, []);
      byVoice.get(cfg.voice_id).push(`${c.id}:${c.name}`);
    }
    const shared = [...byVoice.entries()]
      .filter(([, who]) => who.length > 1)
      .map(([voice, who]) => `${voice} <- ${who.join(', ')}`);
    expect(shared.join(' | '), 'characters collapsing onto one voice').to.equal('');
  });

  it('fails loudly for a character with no configured voice instead of borrowing one', async function () {
    // 999999 has no data directory, so nothing configures a voice for it.
    let threw = null;
    try {
      await store.getTTSConfigForCharacter(999999);
    } catch (err) {
      threw = err;
    }
    expect(threw, 'an unconfigured character must not silently receive a voice').to.be.an('error');
    expect(threw.code).to.equal('NO_VOICE_CONFIGURED');
    expect(threw.characterId).to.equal(999999);
    // The message must name the character and say where to fix it.
    expect(threw.message).to.contain('999999');
    expect(threw.message).to.contain('voice_id');
  });

  it('does not fall back to the currently selected character\'s voice', async function () {
    // This is the exact shape of the bug: an unconfigured character must NOT
    // come back with whatever voice the selected character is using.
    const { readConfig } = await import('../../services/configService.js');
    const cfg = await readConfig();
    const selectedId = cfg && cfg.selectedCharacter;
    if (!selectedId) return this.skip();

    const selectedVoice = (await store.getTTSConfigForCharacter(selectedId)).voice_id;
    expect(selectedVoice).to.be.a('string').and.not.empty;

    let result = null;
    let threw = null;
    try {
      result = await store.getTTSConfigForCharacter(999999);
    } catch (err) {
      threw = err;
    }
    expect(threw, 'must throw rather than return the selected character\'s config').to.be.an('error');
    expect(result === null || result.voice_id !== selectedVoice).to.equal(true);
  });

  it('exports a typed error so callers can distinguish a data bug from an API failure', function () {
    expect(store.MissingVoiceConfigError).to.be.a('function');
    const err = new store.MissingVoiceConfigError(42);
    expect(err).to.be.an('error');
    expect(err.code).to.equal('NO_VOICE_CONFIGURED');
    expect(err.characterId).to.equal(42);
  });

  it('the character-less path returns an explicit voice rather than throwing', async function () {
    // getTTSConfig() backs the AI-settings GET endpoint, which must render even
    // with no voice chosen. It may return null — explicitly absent — but it must
    // never invent one, and it must not throw.
    const cfg = await store.getTTSConfig();
    expect(cfg).to.be.an('object');
    expect(cfg.voice_id === null || typeof cfg.voice_id === 'string').to.equal(true);

    const noChar = await store.getTTSConfigForCharacter(null);
    expect(noChar).to.be.an('object');
    expect(noChar.voice_id === null || typeof noChar.voice_id === 'string').to.equal(true);
  });

  it('still clamps speed into the range ElevenLabs accepts', async function () {
    for (const c of characters) {
      const cfg = await store.getTTSConfigForCharacter(c.id);
      expect(cfg.speed, `character ${c.id} speed`).to.be.at.least(0.7);
      expect(cfg.speed, `character ${c.id} speed`).to.be.at.most(1.2);
    }
  });
});
