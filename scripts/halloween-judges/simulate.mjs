#!/usr/bin/env node
/**
 * Halloween judge-panel simulator.
 *
 * Runs simulated trick-or-treat visitors (personas.mjs) against the live
 * ElevenLabs character agents using the agent simulate-conversation API,
 * applies evaluation criteria, and appends one JSON line per conversation
 * to a results file for analyze.mjs.
 *
 * Self-contained: no npm dependencies (Node 18+ global fetch only).
 * Reads the API key from ELEVENLABS_API_KEY or /etc/monsterbox/elevenlabs.key.
 *
 * Usage:
 *   node scripts/halloween-judges/simulate.mjs [--count 25] [--concurrency 6]
 *     [--agents orlok,mina] [--personas mom,boy14] [--turns 14]
 *     [--out scripts/halloween-judges/results/sim.jsonl]
 */
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS, scenarioFor } from './personas.mjs';
import { UNIVERSAL_CRITERIA } from './criteria.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.elevenlabs.io';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    return readFileSync('/etc/monsterbox/elevenlabs.key', 'utf8').trim();
  } catch {
    console.error('No ELEVENLABS_API_KEY and /etc/monsterbox/elevenlabs.key unreadable.');
    process.exit(1);
  }
}

const KEY = apiKey();
const COUNT = parseInt(arg('count', '25'), 10);
const CONCURRENCY = parseInt(arg('concurrency', '6'), 10);
const TURN_LIMIT = parseInt(arg('turns', '14'), 10);
const OUT = arg('out', join(HERE, 'results', `sim-${new Date().toISOString().slice(0, 10)}.jsonl`));

const agentFilter = arg('agents', 'all');
const personaFilter = arg('personas', 'all');
const { agents } = JSON.parse(readFileSync(join(HERE, 'agents.json'), 'utf8'));
const runAgents = agentFilter === 'all' ? agents : agents.filter(a => agentFilter.split(',').includes(a.key));
const runPersonas = personaFilter === 'all' ? PERSONAS : PERSONAS.filter(p => personaFilter.split(',').includes(p.key));

mkdirSync(dirname(OUT), { recursive: true });

function buildBody(persona, runIndex) {
  return {
    simulation_specification: {
      simulated_user_config: {
        prompt: {
          prompt: `${persona.prompt}\n\n${scenarioFor(runIndex)}\n\nWhen you decide the conversation is over, say a natural in-persona goodbye and stop.`,
          temperature: 0.9
        },
        language: 'en'
      },
      new_turns_limit: TURN_LIMIT
    },
    extra_evaluation_criteria: [...UNIVERSAL_CRITERIA, persona.criteria]
  };
}

async function simulateOnce(agent, persona, runIndex, attempt = 0) {
  const res = await fetch(`${API}/v1/convai/agents/${agent.agentId}/simulate-conversation`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(persona, runIndex))
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`HTTP ${res.status} after ${attempt + 1} attempts`);
    const wait = 2000 * 2 ** attempt;
    await new Promise(r => setTimeout(r, wait));
    return simulateOnce(agent, persona, runIndex, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function record(line) {
  appendFileSync(OUT, JSON.stringify(line) + '\n');
}

// Skip pairs already completed in OUT (safe resume after interruption).
const done = new Set();
if (existsSync(OUT)) {
  for (const raw of readFileSync(OUT, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    try {
      const l = JSON.parse(raw);
      if (!l.error) done.add(`${l.agent}|${l.persona}|${l.run}`);
    } catch { /* ignore partial line */ }
  }
  if (done.size) console.log(`Resuming: ${done.size} conversations already in ${OUT}`);
}

const jobs = [];
for (const agent of runAgents)
  for (const persona of runPersonas)
    for (let run = 0; run < COUNT; run++)
      if (!done.has(`${agent.key}|${persona.key}|${run}`)) jobs.push({ agent, persona, run });

console.log(`Simulating ${jobs.length} conversations (${runAgents.length} agents x ${runPersonas.length} personas x ${COUNT} runs, concurrency ${CONCURRENCY})`);
console.log(`Results -> ${OUT}`);

let ok = 0, failed = 0, started = 0;
const t0 = Date.now();

async function worker() {
  while (jobs.length) {
    const job = jobs.shift();
    const n = ++started;
    try {
      const out = await simulateOnce(job.agent, job.persona, job.run);
      const transcript = (out.simulated_conversation || []).map(t => ({
        role: t.role, message: t.message ?? null
      }));
      const evals = {};
      const raw = out.analysis?.evaluation_criteria_results || {};
      for (const [id, r] of Object.entries(raw)) evals[id] = { result: r.result, rationale: r.rationale };
      record({
        agent: job.agent.key, persona: job.persona.key, run: job.run,
        scenario: job.run % 10, turns: transcript.length,
        call_successful: out.analysis?.call_successful ?? null,
        summary: out.analysis?.transcript_summary ?? null,
        evals, transcript, ts: new Date().toISOString()
      });
      ok++;
    } catch (err) {
      failed++;
      record({ agent: job.agent.key, persona: job.persona.key, run: job.run, error: String(err).slice(0, 500), ts: new Date().toISOString() });
    }
    if (n % 10 === 0 || jobs.length === 0) {
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`[${mins}m] done=${ok} failed=${failed} remaining=${jobs.length}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length || 1) }, worker));
console.log(`Finished: ${ok} ok, ${failed} failed. Results in ${OUT}`);
if (failed > 0) process.exitCode = 1;
