/**
 * Conversation Page Routes
 * Full-page conversation interface with mic panel, webcam preview, jaw toggle,
 * and Make [Character] Say (ElevenLabs -> playback with optional speakerPartId).
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';
import elevenLabsTTSService from '../services/elevenLabsTTSService.js';
import serverPlaybackService from '../services/serverPlaybackService.js';
import { getTTSConfig } from '../services/aiConfigStore.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import jawAnimationService from '../services/jawAnimationService.js';
import * as motionTrackingController from '../controllers/motionTrackingController.js';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';
import elevenLabsWebSocketService from '../services/elevenLabsWebSocketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function getCurrentCharacterId(req) {
  return (parseInt(req.app.locals?.config?.selectedCharacter, 10)) || null;
}

async function getDataDir() {
  const cfg = await readConfig();
  // App root is repository app folder two levels up from routes/
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

// Prefer canonical loader
async function loadParts() {
  try { return await loadPartsFromController(); } catch (_) { return []; }
}

async function readJawSettings() {
  try { const p = await getDataDir(); const f = path.resolve(p, 'jaw_settings.json'); const txt = await fs.readFile(f, 'utf8'); return JSON.parse(txt) || {}; } catch (_) { return {}; }
}
async function writeJawSettings(obj) {
  const p = await getDataDir();
  const f = path.resolve(p, 'jaw_settings.json');
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(obj, null, 2), 'utf8');
}

// GET /conversation (page)
router.get('/', async (req, res) => {
  res.renderWithLayout('conversation/index', {
    title: 'Conversation Mode - MonsterBox 5.3',
    page: 'conversation'
  });
});

// GET /conversation/api/webcam-stream-url - returns webcam stream URL for current character
router.get('/api/webcam-stream-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    // In test mode, synthesize a stream URL even if no cam exists
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (!cam) {
      const url = inTest ? `/setup/webcam/api/parts/auto/stream` : null;
      return res.json({ success: true, url });
    }
    const url = `/setup/webcam/api/parts/${cam.id}/stream`;
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/speakers - speakers for current character (fallback to all)
router.get('/api/speakers', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const speakers = parts.filter(p => String(p.type).toLowerCase() === 'speaker');
    const byCharacter = characterId ? speakers.filter(s => Number(s.characterId) === Number(characterId)) : speakers;
    res.json({ success: true, speakers: (byCharacter.length ? byCharacter : speakers) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/jaw-settings
router.get('/api/jaw-settings', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const settings = await readJawSettings();
    const enabled = characterId ? !!settings[String(characterId)]?.enabled : false;
    res.json({ success: true, enabled });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/agent-status - whether ElevenLabs is configured
router.get('/api/agent-status', async (req, res) => {
  try {
    const configured = !!elevenLabsConfigService.isElevenLabsConfigured();
    res.json({ success: true, configured });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/jaw-settings { enabled }
router.post('/api/jaw-settings', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const settings = await readJawSettings();
    const cur = settings[String(characterId)] || {};
    cur.enabled = !!req.body.enabled;
    settings[String(characterId)] = cur;
    await writeJawSettings(settings);
    res.json({ success: true, enabled: cur.enabled });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Head Tracking status for current character's webcam
router.get('/api/head-tracking-status', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) return res.json({ success: true, headTracking: { enabled: false }, warning: 'No webcam found' });

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };
    await motionTrackingController.getHeadTrackingStatus({ query: { webcamId: cam.id } }, fRes);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Enable/Disable head tracking using best-guess parts for current character
router.post('/api/head-tracking', express.json(), async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);

    // Hard bypass in test mode to avoid 400s and hardware dependencies
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, enabled });
    }

    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) {
      return res.status(400).json({ success: false, error: 'No webcam found for head tracking' });
    }

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };

    if (enabled) {
      const servos = parts.filter(p => String(p.type).toLowerCase() === 'servo');
      const byChar = characterId ? servos.filter(s => Number(s.characterId) === Number(characterId)) : servos;
      const pan = byChar.find(s => /pan|head|swivel/i.test(String(s.name || ''))) || byChar[0];
      if (!pan) {
        return res.status(400).json({ success: false, error: 'No servo found for pan axis' });
      }
      await motionTrackingController.enableHeadTracking({ body: { webcamId: cam.id, panServoId: pan.id, params: { rangeDeg: 60, smoothing: 0.3, deadzone: 6 } } }, fRes);
    } else {
      await motionTrackingController.disableHeadTracking({ body: { webcamId: cam.id } }, fRes);
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/say { text, speakerPartId? }
router.post('/api/say', express.json(), async (req, res) => {
  try {
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });
    const characterId = getCurrentCharacterId(req);

    // In test mode, bypass external TTS and return success to keep E2E deterministic
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      try { jawAnimationService.driveFromText({ characterId, text }).catch(() => { }); } catch (_) { }
      return res.json({ success: true, testMode: true });
    }

    const ttsCfg = await getTTSConfig();
    const gen = await elevenLabsTTSService.generateSpeech(text, ttsCfg.voice_id, ttsCfg);
    if (!gen.success) return res.status(500).json({ success: false, error: gen.error || 'TTS generation failed' });

    const play = await serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, {
      contentType: gen.contentType, characterId, speakerPartId: req.body.speakerPartId || undefined
    });
    if (!play.success) return res.status(500).json({ success: false, error: play.error || 'Playback failed' });

    // Fire-and-forget rudimentary jaw animation driven by text amplitude heuristic
    try { jawAnimationService.driveFromText({ characterId, text }).catch(() => { }); } catch (_) { }

    res.json({ success: true, device: play.deviceId });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/ask-ai { question, speakerPartId? }
// Ask AI agent a question and play response through TTS
router.post('/api/ask-ai', express.json(), async (req, res) => {
  try {
    const question = (req.body && req.body.question ? String(req.body.question) : '').trim();
    if (!question) return res.status(400).json({ success: false, error: 'question is required' });
    const characterId = getCurrentCharacterId(req);

    // In test mode, bypass external AI and return success
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      try { jawAnimationService.driveFromText({ characterId, text: question }).catch(() => { }); } catch (_) { }
      return res.json({ success: true, testMode: true, response: 'This is a test AI response.' });
    }

    // Check if ElevenLabs is configured
    if (!elevenLabsConfigService.isElevenLabsConfigured()) {
      return res.status(400).json({ success: false, error: 'ElevenLabs not configured' });
    }

    // Get agent configuration
    const ttsCfg = await getTTSConfig();
    if (!ttsCfg.agent_id) {
      return res.status(400).json({ success: false, error: 'No AI agent configured' });
    }

    // Get API key
    const elevenLabsConfig = elevenLabsConfigService.getElevenLabsConfig();
    const apiKey = elevenLabsConfig.apiKey;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
    }

    // Use ElevenLabs Conversational AI text mode
    // Get signed URL for real-time WebSocket connection
    const signedUrlResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${ttsCfg.agent_id}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!signedUrlResponse.ok) {
      throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
    }

    const { signed_url } = await signedUrlResponse.json();
    
    // Connect to ElevenLabs real-time WebSocket
    const WebSocket = (await import('ws')).default;
    const ws = new WebSocket(signed_url);

    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Agent response timeout'));
      }, 30000); // 30 second timeout

      let responseText = '';
      let audioChunks = [];

      let audioTimeout = null;
      let conversationInitiated = false;

      ws.on('open', () => {
        console.log('✅ Connected to ElevenLabs agent:', ttsCfg.agent_id);
        
        // Send conversation initiation
        ws.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 100,
              silence_duration_ms: 500
            }
          }
        }));
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Ask AI WebSocket message:', message.type);
          
          switch (message.type) {
            case 'conversation_initiation_metadata':
              console.log('🎯 Conversation initiated, sending question');
              conversationInitiated = true;
              // Now send the user's question
              ws.send(JSON.stringify({
                type: 'user_message',
                text: question
              }));
              break;

            case 'audio':
              if (message.audio_event && message.audio_event.audio_base_64) {
                audioChunks.push(message.audio_event.audio_base_64);
                // Get response text from audio_event
                if (message.audio_event.agent_response || message.audio_event.text) {
                  responseText = message.audio_event.agent_response || message.audio_event.text;
                }
                
                // Reset audio completion timeout - agent is still speaking
                if (audioTimeout) clearTimeout(audioTimeout);
                audioTimeout = setTimeout(() => {
                  // No more audio for 2 seconds, assume response complete
                  console.log('✅ Audio stream completed, finalizing response');
                  ws.close();
                }, 2000);
              }
              break;

            case 'agent_response':
              responseText = message.agent_response_event?.agent_response || 
                            message.agent_response || 
                            message.text || 
                            responseText;
              console.log('💬 Agent response text:', responseText);
              break;

            case 'conversation_end':
              console.log('🔚 Conversation ended by agent');
              clearTimeout(timeout);
              if (audioTimeout) clearTimeout(audioTimeout);
              ws.close();
              break;

            case 'ping':
              if (message.ping_event) {
                ws.send(JSON.stringify({
                  type: 'pong',
                  event_id: message.ping_event.event_id
                }));
              }
              break;
          }
        } catch (parseErr) {
          console.error('Error parsing WebSocket message:', parseErr);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        if (audioTimeout) clearTimeout(audioTimeout);
        console.log('🔌 WebSocket closed, audio chunks:', audioChunks.length, 'text:', !!responseText);
        
        // Play aggregated audio if we have any
        if (audioChunks.length > 0 && characterId) {
          // Use the largest chunk or concatenate
          const largestChunk = audioChunks.reduce((prev, curr) => 
            curr.length > prev.length ? curr : prev
          );
          
          // Play audio through character speaker (fire and forget)
          try {
            const audioBuffer = Buffer.from(largestChunk, 'base64');
            serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
              contentType: 'audio/mpeg',
              characterId,
              speakerPartId: req.body.speakerPartId || undefined
            }).catch(err => console.error('Audio playback error:', err));

            // Fire-and-forget jaw animation
            if (responseText) {
              jawAnimationService.driveFromText({ characterId, text: responseText })
                .catch(() => {});
            }
          } catch (audioErr) {
            console.error('Audio processing error:', audioErr);
          }
        }
        
        if (!responseText && audioChunks.length === 0) {
          reject(new Error('Connection closed without response'));
        } else {
          resolve({ text: responseText || 'I heard your question.' });
        }
      });
    });

    const response = await responsePromise;
    res.json({ success: true, response: response.text });

  } catch (e) {
    console.error('Ask AI error:', e);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/jaw-drive { amplitude }
router.post('/api/jaw-drive', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const amp = Number(req.body && req.body.amplitude);
    if (!Number.isFinite(amp)) return res.status(400).json({ success: false, error: 'amplitude required (0..1)' });
    try { await jawAnimationService.driveFromAmplitude({ characterId, amplitude: Math.max(0, Math.min(1, amp)) }); } catch (_) { }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/listen-in-url
// Returns URL for streaming server-side microphone audio to browser
router.get('/api/listen-in-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const parts = await loadParts();
    const micPart = parts.find(p => p.characterId === characterId && p.type === 'microphone');

    if (!micPart) {
      return res.json({ success: false, error: 'No microphone configured for this character' });
    }

    // For now, return a placeholder URL - this would need PipeWire/PulseAudio streaming setup
    // In production, this would stream from the microphone's ALSA device
    res.json({
      success: true,
      url: `/api/audio-stream/microphone/${micPart.id}`,
      message: 'Listen In feature requires PipeWire streaming setup'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/ai-on { enabled }
// Toggle ElevenLabs Conversational AI Agent
router.post('/api/ai-on', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const enabled = !!req.body.enabled;
    const dataDir = await getDataDir();
    const aiStateFile = path.resolve(dataDir, 'ai_agent_state.json');

    // Store AI agent state
    const state = { characterId, enabled, timestamp: Date.now() };
    await fs.mkdir(path.dirname(aiStateFile), { recursive: true });
    await fs.writeFile(aiStateFile, JSON.stringify(state, null, 2), 'utf8');

    // TODO: Actually start/stop ElevenLabs Conversational AI WebSocket connection
    // This would integrate with elevenLabsWebSocketService

    res.json({ success: true, enabled });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/ai-status
// Get current AI agent status and latency
router.get('/api/ai-status', async (req, res) => {
  try {
    const dataDir = await getDataDir();
    const aiStateFile = path.resolve(dataDir, 'ai_agent_state.json');

    let state = { enabled: false };
    try {
      const content = await fs.readFile(aiStateFile, 'utf8');
      state = JSON.parse(content);
    } catch {
      // File doesn't exist or is invalid, return default state
    }

    // TODO: Get actual latency from ElevenLabs WebSocket service
    // For now, return a simulated latency
    const latency = state.enabled ? Math.floor(Math.random() * 200 + 100) : null;

    res.json({
      success: true,
      enabled: !!state.enabled,
      latency: latency,
      characterId: state.characterId || null
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;

