#!/usr/bin/env node
/**
 * Start a conversation on every animatronic in the fleet.
 *
 * The fleet address book is config/animatronics.json — never a literal list here,
 * so adding or re-addressing a node needs no code change. Nodes with no IP yet
 * (never seen on the network) are skipped rather than dialled at a guessed address.
 */
import WebSocket from 'ws';
import { loadAnimatronics } from './lib/character-target.mjs';

const ELEVENLABS_WS_PORT = 8795;

const nodes = await loadAnimatronics();
const targets = nodes
  .filter((n) => n && n.ip && n.characterId !== undefined && n.characterId !== null)
  .map((n) => ({ name: n.name, ip: n.ip, characterId: n.characterId }));

const skipped = nodes.filter((n) => !n || !n.ip).map((n) => (n && n.name) || 'unnamed');
if (skipped.length) console.log(`⏭️  Skipping ${skipped.join(', ')} — no address in config/animatronics.json`);
if (targets.length === 0) {
  console.error('❌ No addressable animatronics in config/animatronics.json');
  process.exit(1);
}

function startForTarget(t) {
  const id = `${t.name}@${t.ip}`;
  const url = () => `ws://${t.ip}:${ELEVENLABS_WS_PORT}`;
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

