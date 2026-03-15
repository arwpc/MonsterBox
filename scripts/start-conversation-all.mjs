#!/usr/bin/env node
import WebSocket from 'ws';

const targets = [
  { name: 'PumpkinHead', ip: '192.168.8.150', characterId: 1 },
  { name: 'Mina', ip: '192.168.8.140', characterId: 2 },
  { name: 'Orlok', ip: '192.168.8.120', characterId: 3 },
  { name: 'Sir Dragomir', ip: '192.168.8.130', characterId: 4 },
  { name: 'Groundbreaker', ip: '192.168.8.200', characterId: 5 },
];

function startForTarget(t) {
  const id = `${t.name}@${t.ip}`;
  const url = () => `ws://${t.ip}:8795`;
  let ws = null;
  let retryMs = 2000;

  function connect() {
    ws = new WebSocket(url());

    ws.on('open', () => {
      console.log(`🔌 Connected to ${id}`);
      retryMs = 2000; // reset backoff on success
      try { ws.send(JSON.stringify({ type: 'set_character', characterId: t.characterId })); } catch {}
      try { ws.send(JSON.stringify({ type: 'set_mic_source', source: 'server' })); } catch {}
      try { ws.send(JSON.stringify({ type: 'set_output_mode', mode: 'server' })); } catch {}
      try { ws.send(JSON.stringify({ type: 'start_conversation' })); } catch {}
      setTimeout(() => { try { ws.send(JSON.stringify({ type: 'send_message', text: 'Greetings, visitors!' })); } catch {} }, 1500);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'conversation_started') {
          console.log(`🗣️  Conversation started for ${id}`);
        } else if (msg.type === 'agent_response') {
          const text = (msg.text || '').slice(0, 80).replace(/\s+/g, ' ');
          console.log(`💬 ${id}: ${text}`);
        }
      } catch (_) {}
    });

    function scheduleReconnect(reason) {
      console.log(`🔌 Disconnected from ${id}${reason ? ' ('+reason+')' : ''}. Reconnecting in ${retryMs}ms...`);
      setTimeout(() => { retryMs = Math.min(retryMs * 2, 30000); connect(); }, retryMs);
    }

    ws.on('close', () => scheduleReconnect('close'));
    ws.on('error', (err) => { console.error(`❌ WS error for ${id}:`, err?.message || err); try { ws.close(); } catch {} scheduleReconnect('error'); });
  }

  connect();
  return ws;
}

for (const t of targets) { startForTarget(t); }
setInterval(() => {}, 1000);

