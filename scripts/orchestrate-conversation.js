#!/usr/bin/env node
/*
 Multi-animatronic Conversation Orchestrator (MonsterBox 5.1)
 - Auto-select a Character, tune microphone, enable Jaw Animation
 - Start real-time conversation via WS (server mic/output)
 - Keep connections open so they can talk to each other

 Usage:
   HOSTS="coffin,orlok,skulltalker,pumpkinhead" node scripts/orchestrate-conversation.js
   AGENT_ID="<elevenlabs_agent_id>" node scripts/orchestrate-conversation.js
   GAIN=140 LANGUAGE=en node scripts/orchestrate-conversation.js
   DRY_RUN=1 node scripts/orchestrate-conversation.js
*/

import fetch from 'node-fetch';
import WebSocket from 'ws';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const err = (...a) => console.error(...a);

const DEFAULT_HOSTS = (process.env.HOSTS || 'coffin,orlok,skulltalker,pumpkinhead').split(',').map(s => s.trim()).filter(Boolean);
const AGENT_ID = process.env.AGENT_ID || '';
const LANGUAGE = (process.env.LANGUAGE || 'en').toLowerCase();
const GAIN = parseInt(process.env.GAIN || '140', 10);
const DRY = (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true');

async function pickCharacter(host){
  try {
    const r = await fetch(`http://${host}:3000/setup/characters/api/characters`, { timeout: 5000 });
    const j = await r.json().catch(()=>({}));
    const chars = (j && j.characters) || [];
    if (!chars.length) return null;
    // Prefer a named character if available
    const preferred = chars.find(c => /coffin|orlok|skull|pumpkin|groundbreaker/i.test(String(c.name))) || chars[0];
    return preferred;
  } catch { return null; }
}

async function selectCharacter(host, id){
  if (DRY) return true;
  const r = await fetch(`http://${host}:3000/setup/characters/api/select`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id })
  }).catch(()=>null);
  return !!(r && r.ok);
}

async function getInputs(host){
  try {
    const r = await fetch(`http://${host}:3000/setup/audio/api/inputs`, { timeout: 5000 });
    const j = await r.json().catch(()=>({}));
    return (j && j.inputs) || [];
  } catch { return []; }
}

async function setDefaultSource(host, sourceId){
  if (DRY) return { success: true };
  const r = await fetch(`http://${host}:3000/setup/audio/api/system-config`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ defaultSource: sourceId })
  }).catch(()=>null);
  return r && r.ok;
}

async function setInputGain(host, deviceId, gainPercent){
  if (DRY) return true;
  const r = await fetch(`http://${host}:3000/setup/audio/api/set-input-gain`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, gainPercent })
  }).catch(()=>null);
  return !!(r && r.ok);
}

async function saveSTTConfig(host, deviceId){
  if (DRY) return true;
  const body = { model: 'scribe_v1', language: LANGUAGE, format: 'wav', sampleRate: 16000, channels: 1, microphoneDeviceId: deviceId };
  const r = await fetch(`http://${host}:3000/api/elevenlabs/stt/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }).catch(()=>null);
  return !!(r && r.ok);
}

async function enableJaw(host){
  if (DRY) return true;
  // Character id is taken from server-side selection; just toggle enabled
  const r = await fetch(`http://${host}:3000/conversation/api/jaw-settings`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true })
  }).catch(()=>null);
  return !!(r && r.ok);
}

async function pickAgentId(host){
  if (AGENT_ID) return AGENT_ID;
  try {
    const r = await fetch(`http://${host}:3000/api/elevenlabs/agents`, { timeout: 8000 });
    const j = await r.json().catch(()=>({}));
    if (j && j.configured === false) return '';
    const a = (j && j.agents) || [];
    if (!a.length) return '';
    const id = a[0].id || a[0].agent_id || a[0].agentId || a[0].uuid || '';
    return id || '';
  } catch { return ''; }
}

async function startWS(host, characterId, agentId){
  const url = `ws://${host}:8795`;
  return new Promise((resolve) => {
    if (DRY) return resolve({ ok: true, info: 'dry' });
    const ws = new WebSocket(url);
    let opened = false;
    ws.on('open', async () => {
      opened = true;
      try { ws.send(JSON.stringify({ type: 'set_output_mode', mode: 'server' })); } catch {}
      try { ws.send(JSON.stringify({ type: 'set_mic_source', source: 'server' })); } catch {}
      try { ws.send(JSON.stringify({ type: 'set_stt_language', language: LANGUAGE })); } catch {}
      try { if (characterId != null) ws.send(JSON.stringify({ type: 'set_character', characterId })); } catch {}
      await sleep(200);
      if (agentId) {
        try { ws.send(JSON.stringify({ type: 'start_conversation', agentId })); } catch {}
        // Seed a friendly opener so the room gets talking
        await sleep(300);
        try { ws.send(JSON.stringify({ type: 'send_message', text: 'Happy Halloween, friends! What do you see tonight?' })); } catch {}
      }
      resolve({ ok: true, ws });
    });
    ws.on('error', (e) => { if (!opened) resolve({ ok: false, error: e.message }); });
  });
}

async function configureAndStart(host){
  log(`\n=== ${host} ===`);
  // Pick/select a character
  const ch = await pickCharacter(host);
  if (!ch) { err(`No characters on ${host}`); return { host, ok: false, reason: 'no-characters' }; }
  await selectCharacter(host, ch.id);

  // Inputs and mic
  const inputs = await getInputs(host);
  const chosen = (inputs.find(i => i.id && i.id !== 'pulse') || inputs[0] || { id: 'default' }).id;
  await setDefaultSource(host, chosen);
  await setInputGain(host, chosen, GAIN);
  await saveSTTConfig(host, chosen);

  // Jaw animation
  await enableJaw(host);

  // Agents and WebSocket
  const agentId = await pickAgentId(host);
  if (!agentId) { err(`No agent available on ${host} (is ElevenLabs configured?)`); return { host, ok: false, reason: 'no-agent' }; }
  const wsRes = await startWS(host, ch.id, agentId);
  if (!wsRes.ok) return { host, ok: false, reason: wsRes.error || 'ws-failed' };
  return { host, ok: true };
}

(async () => {
  log('Starting multi-animatronic conversation orchestrator...');
  log('Hosts:', DEFAULT_HOSTS.join(', '));
  const results = [];
  for (const h of DEFAULT_HOSTS) {
    try { results.push(await configureAndStart(h)); } catch (e) { results.push({ host: h, ok: false, reason: e.message }); }
  }
  log('\nSummary:');
  results.forEach(r => log(`${r.host}: ${r.ok ? 'OK' : 'FAIL'}${r.reason ? ' (' + r.reason + ')' : ''}`));
  if (results.some(r => !r.ok)) process.exitCode = 1;
  // Keep the process alive to maintain WS connections unless dry run
  if (!DRY) {
    log('\nConnections established. Press Ctrl+C to stop.');
    // eslint-disable-next-line no-constant-condition
    while (true) { await sleep(60000); }
  }
})();

