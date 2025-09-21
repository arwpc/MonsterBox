import elevenLabsSTTService from './elevenLabsSTTService.js';
import elevenLabsTTSService from './elevenLabsTTSService.js';
import elevenLabsAgentService from './elevenLabsAgentService.js';
import { getCharacterById } from './characterService.js';
import { getTTSConfig } from './aiConfigStore.js';

class ConversationService {
  async converse({ characterId, agentId, audioBuffer, text }) {
    let userText = text || '';

    // 1) STT if audio provided
    if (!userText && audioBuffer) {
      const stt = await elevenLabsSTTService.transcribeAudio(audioBuffer, {});
      if (!stt.success) {
        return { success: false, stage: 'stt', error: stt.error || 'Transcription failed' };
      }
      userText = stt.transcript || stt.text || '';
    }

    if (!userText) {
      return { success: false, error: 'No text to send to AI' };
    }

    // 2) Resolve agentId from character if not supplied
    let resolvedAgentId = agentId;
    if (!resolvedAgentId && characterId) {
      const char = await getCharacterById(Number(characterId));
      resolvedAgentId = char && char.elevenLabsAgentId ? String(char.elevenLabsAgentId) : null;
    }

    if (!resolvedAgentId) {
      // Graceful fallback – echo-style friendly reply
      const fallback = `Spooky echo: ${userText}`;
      const ttsCfg = await getTTSConfig();
      const voiceId = ttsCfg.voice_id || '21m00Tcm4TlvDq8ikWAM'; // default ElevenLabs premade (Rachel) if available
      const tts = await elevenLabsTTSService.generateSpeech(fallback, voiceId, ttsCfg);
      if (!tts.success) return { success: false, stage: 'tts', error: tts.error };
      return { success: true, agentUsed: false, replyText: fallback, audioBuffer: tts.audioBuffer, contentType: tts.contentType };
    }

    // 3) Chat with agent (using fast chat for real-time responses)
    const ai = await elevenLabsAgentService.fastChatWithAgent(resolvedAgentId, userText);
    let replyText;
    let agentUsed = false;
    if (!ai.success) {
      // Graceful fallback on agent error
      console.warn('Agent chat failed, falling back to echo reply:', ai.error);
      replyText = `Spooky echo: ${userText}`;
    } else {
      replyText = ai.replyText || ai.text || 'Hello there!';
      agentUsed = true;
    }

    // 4) TTS the reply (always try to return audio)
    const ttsCfg = await getTTSConfig();
    const voiceId = ttsCfg.voice_id || '21m00Tcm4TlvDq8ikWAM';
    const tts = await elevenLabsTTSService.generateSpeech(replyText, voiceId, ttsCfg);
    if (!tts.success) return { success: false, stage: 'tts', error: tts.error };

    return { success: true, agentUsed, replyText, audioBuffer: tts.audioBuffer, contentType: tts.contentType };
  }
}

export default new ConversationService();

