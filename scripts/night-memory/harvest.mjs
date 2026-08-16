#!/usr/bin/env node
/**
 * Night Memory — gives the whole fleet real memory between nights.
 *
 * Harvests recent ElevenLabs conversation transcripts for every agent, distills
 * a "Yard Registry" knowledge-base document (who visited, names given, what was
 * said), uploads it, and attaches it to every agent — replacing the previous
 * night's registry document. Next night, the characters genuinely remember
 * returning guests. "The registry never forgets" becomes literally true.
 *
 * Standalone client of the ElevenLabs API — no application code involved.
 * API key: ELEVENLABS_API_KEY env var, else /etc/monsterbox/elevenlabs.key.
 *
 * Usage:
 *   node scripts/night-memory/harvest.mjs                # last 26 hours
 *   node scripts/night-memory/harvest.mjs --hours 8      # tonight only
 *   node scripts/night-memory/harvest.mjs --dry-run      # print registry, change nothing
 *
 * Suggested cron (after each night, e.g. 2am):
 *   0 2 * * * cd /home/remote/MonsterBox && node scripts/night-memory/harvest.mjs --hours 12
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY?.trim() ||
  readFileSync('/etc/monsterbox/elevenlabs.key', 'utf8').trim();
const HOURS = parseInt(process.argv[process.argv.indexOf('--hours') + 1] || '26', 10) || 26;
const DRY = process.argv.includes('--dry-run');
const REGISTRY_PREFIX = 'KB_Yard_Registry';

const { agents } = JSON.parse(readFileSync(join(HERE, '../halloween-judges/agents.json'), 'utf8'));

async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Pull names guests actually gave: "my name is X", "i'm X", "call me X", "it's X"
function extractNames(userText) {
  const names = new Set();
  const re = /\b(?:my name is|my name's|i am|i'm|call me|it's|this is)\s+([A-Z][a-z]{2,15})\b/gi;
  let m;
  while ((m = re.exec(userText)) !== null) {
    const w = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    if (!['The', 'Not', 'Just', 'Here', 'Gonna', 'Really', 'Sure', 'Okay'].includes(w)) names.add(w);
  }
  return [...names];
}

const since = Math.floor(Date.now() / 1000) - HOURS * 3600;
const sections = [];
let totalConvs = 0;

for (const agent of agents) {
  const list = await api(`/v1/convai/conversations?agent_id=${agent.agentId}&page_size=100&call_start_after_unix=${since}`);
  const convs = (list.conversations || []).filter(c => (c.message_count || 0) >= 3);
  if (!convs.length) continue;
  const lines = [];
  for (const c of convs.slice(0, 40)) {
    try {
      const d = await api(`/v1/convai/conversations/${c.conversation_id}`);
      const userText = (d.transcript || []).filter(t => t.role === 'user')
        .map(t => t.message || '').join(' ');
      const names = extractNames(userText);
      const summary = (d.analysis?.transcript_summary || '').replace(/\s+/g, ' ').trim();
      if (names.length || summary) {
        lines.push(`- ${names.length ? `Guests: ${names.join(', ')}. ` : ''}${summary.slice(0, 300)}`);
      }
    } catch { /* one bad conversation never kills the harvest */ }
  }
  if (lines.length) {
    totalConvs += lines.length;
    sections.push(`## Visits to ${agent.name}\n${lines.join('\n')}`);
  }
}

const date = process.argv.includes('--date')
  ? process.argv[process.argv.indexOf('--date') + 1]
  : new Date().toISOString().slice(0, 10);

const doc = `YARD REGISTRY — WHAT THE CASTLE REMEMBERS (through ${date})

PURPOSE: The fleet's shared memory of previous nights. When a visitor gives a name
that appears here, the character MAY recognize them as a returning guest — warmly,
in their own voice, referencing what is recorded, never reciting this document.
"You came before. The castle remembers." If nothing matches, say nothing of this.
This document is replaced nightly; it reflects real conversations.

${sections.join('\n\n') || '(No qualifying conversations in this window.)'}
`;

console.log(`Harvested ${totalConvs} conversations into registry (${doc.length} chars)`);
if (DRY) { console.log('\n' + doc); process.exit(0); }

// Upload new registry document
const created = await api('/v1/convai/knowledge-base/text', {
  method: 'POST',
  body: JSON.stringify({ name: `${REGISTRY_PREFIX}_${date}.txt`, text: doc })
});
console.log(`Registry doc created: ${created.id}`);

// Attach to every agent, removing any previous registry doc
const staleIds = new Set();
for (const agent of agents) {
  const a = await api(`/v1/convai/agents/${agent.agentId}`);
  const kb = a.conversation_config.agent.prompt.knowledge_base || [];
  kb.filter(d => d.name?.startsWith(REGISTRY_PREFIX)).forEach(d => staleIds.add(d.id));
  const next = kb.filter(d => !d.name?.startsWith(REGISTRY_PREFIX));
  next.push({ type: 'text', name: `${REGISTRY_PREFIX}_${date}.txt`, id: created.id, usage_mode: 'auto' });
  // Full config round-trip — partial prompt objects risk clobbering LLM settings.
  a.conversation_config.agent.prompt.knowledge_base = next;
  await api(`/v1/convai/agents/${agent.agentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ conversation_config: a.conversation_config })
  });
  console.log(`  attached to ${agent.name}`);
}

// Delete superseded registry docs (best-effort)
for (const id of staleIds) {
  if (id === created.id) continue;
  try {
    await fetch(`${API}/v1/convai/knowledge-base/${id}`, { method: 'DELETE', headers: { 'xi-api-key': KEY } });
    console.log(`  deleted stale registry ${id}`);
  } catch { /* fine */ }
}
console.log('The registry never forgets.');
