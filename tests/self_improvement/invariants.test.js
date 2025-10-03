import { strict as assert } from 'assert';
import fs from 'fs';

function read(path){ return fs.readFileSync(path, 'utf8'); }

describe('Self-Improvement Invariants (5.1)', function(){
  it('ElevenLabs WS service uses port 8795', function(){
    const txt = read('services/elevenLabsWebSocketService.js');
    assert.match(txt, /this\.port\s*=\s*8795\s*;/, 'WS port should be 8795');
  });

  it('Conversation HTTP endpoints disabled in favor of WS (410 with hint)', function(){
    const txt = read('routes/api/elevenLabsApiRoutes.js');
    assert.ok(txt.includes("router.post('/conversation/test'"), 'legacy conversation route present');
    assert.ok(txt.includes('res.status(410)'), 'should return 410 Gone');
    assert.ok(txt.includes('websocket_url'), 'should include WS hint');
  });

  it('Deploy script enables monsterbox service and sets up webcam', function(){
    const txt = read('scripts/deploy-animatronics-5.1.sh');
    assert.match(txt, /systemctl\s+enable\s+monsterbox/, 'must enable monsterbox');
    assert.ok(/setup-webcam\.sh/.test(txt), 'should run setup-webcam.sh');
  });

  it('Goblin registration includes friendly name field', function(){
    const txt = read('scripts/deploy-animatronics-5.1.sh');
    assert.ok(txt.includes('\\"name\\":\\"Goblin 1\\"'), 'goblin1 must include name');
    assert.ok(txt.includes('\\"name\\":\\"Goblin 2\\"'), 'goblin2 must include name');
  });

  it('README documents Multi‑Animatronic Conversation flow', function(){
    const txt = read('README.md');
    assert.ok(txt.includes('Multi‑Animatronic Conversation'), 'README should include section');
    assert.ok(txt.includes('scripts/auto-boot-verify.sh'), 'README should mention auto-boot verify');
    assert.ok(txt.includes('scripts/start-conversation-all.sh'), 'README should mention start conversation');
  });

  it('Jaw endpoints present for enabling animation per character', function(){
    const txt = read('routes/conversation.js');
    assert.ok(txt.includes("/api/jaw-settings"), 'jaw settings endpoint must exist');
  });

  it('STT config default model is scribe_v1', function(){
    const txt = read('services/aiConfigStore.js');
    assert.match(txt, /model:\s*'scribe_v1'/, 'default STT model should be scribe_v1');
  });

  it('Audio setup routes include input gain control', function(){
    const txt = read('routes/setup/audio.js');
    assert.ok(txt.includes('/api/set-input-gain'), 'input gain endpoint must exist');
  });
});

