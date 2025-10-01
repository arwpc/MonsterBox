import { expect } from 'chai';
import conversationService from '../../services/conversationService.js';
import elevenLabsTTSService from '../../services/elevenLabsTTSService.js';

// Unit test the fallback path (no agent/character) to avoid external API calls
// We monkey-patch TTS generateSpeech to a deterministic stub.
describe('ConversationService (unit) - fallback path', function () {
  this.timeout(3000);

  let originalGenerate;

  before(() => {
    originalGenerate = elevenLabsTTSService.generateSpeech;
    elevenLabsTTSService.generateSpeech = async (text /*, voiceId, cfg */) => {
      // Minimal stub: pretend TTS succeeded and returned a small buffer
      return { success: true, audioBuffer: Buffer.from('RIFF....WAVE'), contentType: 'audio/wav' };
    };
  });

  after(() => {
    if (originalGenerate) elevenLabsTTSService.generateSpeech = originalGenerate;
  });

  it('echoes text via fallback and returns TTS audioBuffer', async () => {
    const res = await conversationService.converse({ text: 'Hello there', agentId: null, characterId: null });
    expect(res).to.have.property('success', true);
    expect(res).to.have.property('agentUsed', false);
    expect(res).to.have.property('replyText', 'Spooky echo: Hello there');
    expect(res).to.have.property('audioBuffer');
    expect(Buffer.isBuffer(res.audioBuffer)).to.equal(true);
    expect(res).to.have.property('contentType', 'audio/wav');
  });
});

