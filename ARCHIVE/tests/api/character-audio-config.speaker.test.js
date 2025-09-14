require('../setupTests');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

// Utility to safely read JSON file
async function readJson(filePath) {
  const data = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

describe('Character Audio Config - Speaker persistence', function() {
  this.timeout(10000);

  const charactersPath = path.join(__dirname, '..', '..', 'data', 'characters.json');
  const audioConfigPath = path.join(__dirname, '..', '..', 'data', 'character-audio-config.json');

  let originalCharacters;
  let originalAudioConfig;
  let testCharacterId;

  before(async function() {
    // Skip if files not present
    try {
      originalCharacters = await fsp.readFile(charactersPath, 'utf8');
    } catch (e) {
      this.skip();
      return;
    }

    try {
      originalAudioConfig = await fsp.readFile(audioConfigPath, 'utf8');
    } catch (e) {
      // If missing, create minimal file for tests to pass through service ensure
      await fsp.writeFile(audioConfigPath, JSON.stringify({ version: '1.0.0', lastUpdated: new Date().toISOString(), characters: {} }, null, 2));
      originalAudioConfig = await fsp.readFile(audioConfigPath, 'utf8');
    }

    // Ensure we have a test character
    const chars = JSON.parse(originalCharacters);
    if (!chars || !Array.isArray(chars) || chars.length === 0) {
      this.skip();
      return;
    }

    testCharacterId = chars[0].id;
  });

  after(async function() {
    // Restore files
    if (originalCharacters) {
      await fsp.writeFile(charactersPath, originalCharacters);
    }
    if (originalAudioConfig) {
      await fsp.writeFile(audioConfigPath, originalAudioConfig);
    }
  });

  it('PUT /api/character-audio-config/:id/speaker should persist volume and enabled', async function() {
    const payload = {
      speakerId: null,
      outputDevice: 'default',
      volume: 65,
      enabled: false
    };

    const res = await chai.request(app)
      .put(`/api/character-audio-config/${testCharacterId}/speaker`)
      .send(payload);

    res.should.have.status(200);
    res.body.success.should.equal(true);
    res.body.data.should.be.an('object');
    res.body.data.volume.should.equal(payload.volume);
    res.body.data.enabled.should.equal(payload.enabled);

    // Verify persisted to file
    const json = await readJson(audioConfigPath);
    const charCfg = json.characters[String(testCharacterId)] || json.characters[testCharacterId];
    expect(charCfg).to.exist;
    expect(charCfg.speaker).to.exist;
    expect(charCfg.speaker.volume).to.equal(payload.volume);
    expect(charCfg.speaker.enabled).to.equal(payload.enabled);
  });

  it('GET /api/character-audio-config/:id/speaker should reflect latest values', async function() {
    const res = await chai.request(app)
      .get(`/api/character-audio-config/${testCharacterId}/speaker`);

    res.should.have.status(200);
    res.body.success.should.equal(true);
    res.body.data.should.be.an('object');
    expect(res.body.data.speakerConfig).to.be.an('object');

    const speaker = res.body.data.speakerConfig;
    expect(speaker.volume).to.be.a('number');
    expect(speaker.enabled).to.be.a('boolean');
  });
});

