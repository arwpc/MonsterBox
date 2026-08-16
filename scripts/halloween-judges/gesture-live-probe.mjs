#!/usr/bin/env node
/**
 * Measures spoken-gesture leakage on the REAL agent path, not in simulation.
 *
 * The judge harness uses the simulate-conversation API, where no client exists to
 * execute a client tool — so a model told to call `gesture` cannot, and may write the
 * gesture into its spoken text instead. That inflates the leak rate and cannot answer
 * the question that actually matters: on a live conversation, where the tool-call
 * channel IS available, does the character call the tool or say the word?
 *
 * This connects to the ElevenLabs Agents WebSocket exactly as MonsterBox does,
 * declares the `gesture` client tool in conversation_initiation_client_data, sends
 * scripted user turns as text, and counts:
 *   - client_tool_call events for `gesture`   -> correct behaviour
 *   - gesture ids appearing in agent_response -> LEAK (a guest would hear this)
 *
 * Text in, text out: no microphone, no speaker, no hardware. Audio frames are ignored.
 *
 * Usage:
 *   node scripts/halloween-judges/gesture-live-probe.mjs [--agents <keys-from-agents.json>] [--turns 6]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { findGestureLeaks } from './gestures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const KEY = (process.env.ELEVENLABS_API_KEY
  || readFileSync('/etc/monsterbox/elevenlabs.key', 'utf8')).trim();
const TURNS = parseInt(arg('turns', '6'), 10);
const { agents } = JSON.parse(readFileSync(join(HERE, 'agents.json'), 'utf8'));
const filter = arg('agents', 'all');
const runAgents = filter === 'all' ? agents : agents.filter(a => filter.split(',').includes(a.key));

// Turns chosen to invite the gestures each vocabulary defines: greeting, a child,
// an insult, a secret, a request for magic, and a goodbye.
const USER_TURNS = [
  "Hi there! I'm Ava, and this is my little brother Liam. He's six.",
  'Whoa, are you even real? You look kind of fake to me.',
  'Sorry, sorry! That was rude. Can you tell us a secret about this place?',
  'Liam wants to know if you can do any magic for him.',
  'That was amazing. Can we tell our friends to come see you?',
  "Okay, we have to go get more candy. Bye!"
];

const TOOL_DECL = {
  type: 'client',
  name: 'gesture',
  description: 'Perform a physical gesture with your animatronic body.',
  expects_response: false,
  parameters: {
    type: 'object',
    required: ['gesture_id'],
    properties: { gesture_id: { type: 'string', description: 'A gesture id from your # Body list.' } }
  }
};

async function signedUrl(agentId) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    { headers: { 'xi-api-key': KEY } });
  if (!res.ok) throw new Error(`signed-url HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).signed_url;
}

function probe(agent) {
  return new Promise(async (resolve) => {
    const result = {
      agent: agent.key, toolCalls: 0, gestureIds: [], leaks: [], replies: [], error: null
    };
    let ws;
    try {
      ws = new WebSocket(await signedUrl(agent.agentId));
    } catch (err) {
      result.error = String(err).slice(0, 200);
      return resolve(result);
    }

    let turn = 0;
    const finish = () => { try { ws.close(); } catch { /* already closed */ } resolve(result); };
    const guard = setTimeout(finish, 180000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: { conversation: { text_only: true } },
        client_tools: [TOOL_DECL]
      }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'conversation_initiation_metadata':
          setTimeout(() => ws.send(JSON.stringify({ type: 'user_message', text: USER_TURNS[turn++] })), 400);
          break;

        case 'agent_response': {
          const text = msg.agent_response_event?.agent_response || '';
          result.replies.push(text);
          const hits = findGestureLeaks(text);
          if (hits.length) result.leaks.push({ hits, text: text.slice(0, 200) });
          if (turn >= Math.min(TURNS, USER_TURNS.length)) {
            clearTimeout(guard);
            setTimeout(finish, 2500);   // let any trailing tool call arrive
          } else {
            setTimeout(() => ws.send(JSON.stringify({ type: 'user_message', text: USER_TURNS[turn++] })), 700);
          }
          break;
        }

        case 'client_tool_call': {
          const call = msg.client_tool_call || {};
          if (call.tool_name === 'gesture') {
            result.toolCalls++;
            result.gestureIds.push(call.parameters?.gesture_id ?? '(none)');
          }
          // expects_response is false, but answer anyway so nothing can stall.
          if (call.tool_call_id) {
            ws.send(JSON.stringify({
              type: 'client_tool_result', tool_call_id: call.tool_call_id,
              result: 'ok', is_error: false
            }));
          }
          break;
        }

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
          break;
      }
    });

    ws.on('error', (err) => { result.error = String(err).slice(0, 200); clearTimeout(guard); finish(); });
    ws.on('close', () => { clearTimeout(guard); resolve(result); });
  });
}

const results = [];
for (const agent of runAgents) {
  process.stdout.write(`probing ${agent.key} … `);
  const r = await probe(agent);
  results.push(r);
  console.log(r.error ? `ERROR ${r.error}`
    : `${r.replies.length} replies, ${r.toolCalls} tool calls, ${r.leaks.length} leaks`);
}

console.log('\n=== live-path gesture probe ===');
console.log('agent            replies  tool_calls  leaking_replies');
let totalLeaks = 0, totalCalls = 0;
for (const r of results) {
  totalLeaks += r.leaks.length;
  totalCalls += r.toolCalls;
  console.log(`${r.agent.padEnd(16)} ${String(r.replies.length).padStart(7)} ${String(r.toolCalls).padStart(11)} ${String(r.leaks.length).padStart(16)}`);
}
console.log(`\ntool calls: ${totalCalls}   leaking replies: ${totalLeaks}`);
for (const r of results) {
  if (r.gestureIds.length) console.log(`  ${r.agent} called: ${r.gestureIds.join(', ')}`);
  for (const l of r.leaks) console.log(`  LEAK [${r.agent}] ${l.text.replace(/\s+/g, ' ')}`);
}
process.exitCode = totalLeaks > 0 ? 1 : 0;
