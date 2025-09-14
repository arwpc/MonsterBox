require('../setupTests');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const STT_CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'ai-config', 'stt-config.json');

async function readJsonSafe(file) {
  const data = await fsp.readFile(file, 'utf8');
  return JSON.parse(data);
}

describe('VAD Config API', function() {
  this.timeout(10000);

  let originalSttConfig;

  before(async function() {
    // Ensure directory exists and backup
    try {
      await fsp.mkdir(path.dirname(STT_CONFIG_FILE), { recursive: true });
      originalSttConfig = await fsp.readFile(STT_CONFIG_FILE, 'utf8');
    } catch (e) {
      // Create default file
      const def = { vadType: 'server_vad', vadThreshold: 0.5, prefixPadding: 300, silenceDuration: 700 };
      await fsp.writeFile(STT_CONFIG_FILE, JSON.stringify(def, null, 2));
      originalSttConfig = await fsp.readFile(STT_CONFIG_FILE, 'utf8');
    }
  });

  after(async function() {
    if (originalSttConfig) {
      await fsp.writeFile(STT_CONFIG_FILE, originalSttConfig);
    }
  });

  it('should reject invalid payloads', async function() {
    const bads = [
      { vadType: 'invalid', vadThreshold: 0.5, prefixPadding: 300, silenceDuration: 700 },
      { vadType: 'server_vad', vadThreshold: -0.1, prefixPadding: 300, silenceDuration: 700 },
      { vadType: 'server_vad', vadThreshold: 1.1, prefixPadding: 300, silenceDuration: 700 },
      { vadType: 'server_vad', vadThreshold: 0.5, prefixPadding: -1, silenceDuration: 700 },
      { vadType: 'server_vad', vadThreshold: 0.5, prefixPadding: 99999, silenceDuration: 700 },
      { vadType: 'server_vad', vadThreshold: 0.5, prefixPadding: 300, silenceDuration: 10 }
    ];

    for (const payload of bads) {
      const res = await chai.request(app)
        .post('/ai-management/api/vad/config')
        .send(payload);
      res.should.have.status(400);
      res.body.success.should.equal(false);
      res.body.error.should.be.a('string');
    }
  });

  it('should persist and apply valid config', async function() {
    // Stub elevenLabsService
    let called = false;
    const stubService = {
      updateVADConfig: async (cfg) => { called = true; return { success: true, config: cfg }; }
    };
    const originalService = global.elevenLabsService;
    global.elevenLabsService = stubService;

    const payload = { vadType: 'server_vad', vadThreshold: 0.42, prefixPadding: 250, silenceDuration: 900 };
    const res = await chai.request(app)
      .post('/ai-management/api/vad/config')
      .send(payload);

    res.should.have.status(200);
    res.body.success.should.equal(true);
    res.body.config.vadThreshold.should.equal(payload.vadThreshold);
    res.body.config.prefixPadding.should.equal(payload.prefixPadding);
    res.body.config.silenceDuration.should.equal(payload.silenceDuration);

    // Verify file persisted
    const fileJson = await readJsonSafe(STT_CONFIG_FILE);
    expect(fileJson.vadThreshold).to.equal(payload.vadThreshold);
    expect(fileJson.prefixPadding).to.equal(payload.prefixPadding);
    expect(fileJson.silenceDuration).to.equal(payload.silenceDuration);

    // Verify service applied
    expect(called).to.equal(true);

    // Restore
    global.elevenLabsService = originalService;
  });
});

