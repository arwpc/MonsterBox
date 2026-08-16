#!/usr/bin/env node
/**
 * Aggregates judge-panel simulation results into a markdown report.
 *
 * Usage:
 *   node scripts/halloween-judges/analyze.mjs <results.jsonl> [--out report.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PERSONAS } from './personas.mjs';
import { UNIVERSAL_CRITERIA } from './criteria.mjs';
import { scanGestureLeaks } from './gestures.mjs';

const file = process.argv[2];
if (!file) { console.error('Usage: analyze.mjs <results.jsonl> [--out report.md]'); process.exit(1); }
const outIdx = process.argv.indexOf('--out');
const outFile = outIdx !== -1 ? process.argv[outIdx + 1] : null;

const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const good = rows.filter(r => !r.error);
const errored = rows.filter(r => r.error);

const personaByKey = Object.fromEntries(PERSONAS.map(p => [p.key, p]));
const criteriaIds = [...UNIVERSAL_CRITERIA.map(c => c.id)];
const personaCriteria = Object.fromEntries(PERSONAS.map(p => [p.key, p.criteria.id]));

function pct(n, d) { return d ? `${Math.round((100 * n) / d)}%` : '—'; }

const agents = [...new Set(good.map(r => r.agent))];
const personas = [...new Set(good.map(r => r.persona))];

let md = `# Halloween Judge-Panel Report\n\nSource: ${file}\nConversations: ${good.length} ok, ${errored.length} errored\n\n`;

// Per agent: criteria table across personas
for (const agent of agents) {
  const ar = good.filter(r => r.agent === agent);
  md += `\n## ${agent} (${ar.length} conversations)\n\n`;
  md += `| Persona | n | ${criteriaIds.join(' | ')} | delight |\n`;
  md += `|---|---|${criteriaIds.map(() => '---').join('|')}|---|\n`;
  for (const persona of personas) {
    const pr = ar.filter(r => r.persona === persona);
    if (!pr.length) continue;
    const cells = criteriaIds.map(id => {
      const n = pr.filter(r => r.evals?.[id]?.result === 'success').length;
      return pct(n, pr.filter(r => r.evals?.[id]).length);
    });
    const dId = personaCriteria[persona];
    const dn = pr.filter(r => r.evals?.[dId]?.result === 'success').length;
    md += `| ${persona} | ${pr.length} | ${cells.join(' | ')} | ${pct(dn, pr.filter(r => r.evals?.[dId]).length)} |\n`;
  }

  // Top failure rationales per criterion (most instructive examples)
  md += `\n### Failure notes for ${agent}\n`;
  for (const id of [...criteriaIds, ...Object.values(personaCriteria)]) {
    const fails = ar.filter(r => r.evals?.[id]?.result === 'failure');
    if (!fails.length) continue;
    md += `\n**${id}** — ${fails.length} failures\n`;
    for (const f of fails.slice(0, 3)) {
      const why = (f.evals[id].rationale || '').replace(/\s+/g, ' ').slice(0, 300);
      md += `- [${f.persona} run ${f.run} scen ${f.scenario}] ${why}\n`;
    }
  }

  // A couple of standout successful moments from delight criteria
  const wins = ar.filter(r => r.evals?.[personaCriteria[r.persona]]?.result === 'success').slice(0, 3);
  if (wins.length) {
    md += `\n### Standout moments for ${agent}\n`;
    for (const w of wins) {
      const lastAgentLines = (w.transcript || []).filter(t => t.role === 'agent').slice(-2)
        .map(t => (t.message || '').replace(/\s+/g, ' ').slice(0, 180));
      md += `- [${w.persona}] ${lastAgentLines.join(' … ')}\n`;
    }
  }
}

// Cross-agent summary
md += `\n## Cross-agent summary\n\n| Agent | conversations | in_character | pacing | personalization | return_hook | delight |\n|---|---|---|---|---|---|---|\n`;
for (const agent of agents) {
  const ar = good.filter(r => r.agent === agent);
  const cell = id => pct(ar.filter(r => r.evals?.[id]?.result === 'success').length, ar.filter(r => r.evals?.[id]).length);
  const dn = ar.filter(r => r.evals?.[personaCriteria[r.persona]]?.result === 'success').length;
  const dd = ar.filter(r => r.evals?.[personaCriteria[r.persona]]).length;
  md += `| ${agent} | ${ar.length} | ${cell('in_character')} | ${cell('pacing')} | ${cell('personalization')} | ${cell('return_hook')} | ${pct(dn, dd)} |\n`;
}

// Delight versus the shipped baseline — the regression gate.
const BASE = JSON.parse(readFileSync(new URL('./baselines.json', import.meta.url), 'utf8'));
md += `\n## Delight vs baseline (gate)\n\nBaseline: ${BASE.source}\n\n`;
md += `| Agent | baseline n | baseline | this run n | this run | delta | verdict |\n|---|---|---|---|---|---|---|\n`;
let gateFailed = [];
for (const agent of agents) {
  const b = BASE.agents[agent];
  if (!b) continue;
  const ar = good.filter(r => r.agent === agent);
  const scored = ar.filter(r => r.evals?.[personaCriteria[r.persona]]);
  const hit = scored.filter(r => r.evals[personaCriteria[r.persona]].result === 'success').length;
  const now = scored.length ? Math.round((100 * hit) / scored.length) : null;
  if (now === null) continue;
  const delta = now - b.delight;
  const verdict = delta >= 0 ? 'PASS' : 'BELOW BASELINE';
  if (delta < 0) gateFailed.push(`${agent} ${now}% vs ${b.delight}%`);
  md += `| ${agent} | ${b.n} | ${b.delight}% | ${scored.length} | ${now}% | ${delta >= 0 ? '+' : ''}${delta} | ${verdict} |\n`;
}
md += `\n${gateFailed.length ? `**GATE FAILED:** ${gateFailed.join('; ')}` : '**GATE PASSED** — no character below its baseline.'}\n`;
for (const n of BASE.notes) md += `\n- ${n}`;
md += `\n`;

// Spoken-gesture leakage: a gesture must be a tool call, never words the guest hears.
const leaks = scanGestureLeaks(good);
md += `\n## Spoken-gesture leakage\n\n`;
if (leaks.total === 0) {
  md += `None. No agent spoke a gesture id or the word "gesture" in ${good.length} conversations.\n`;
} else {
  md += `**${leaks.total} leaked mention(s)** — a gesture must be a \`gesture\` tool call, never spoken text.\n\n`;
  md += `| Agent | conversations | leaking | instances |\n|---|---|---|---|\n`;
  for (const [agent, a] of Object.entries(leaks.byAgent)) {
    if (!a.instances) continue;
    md += `| ${agent} | ${a.conversations} | ${a.leakingConversations} | ${a.instances} |\n`;
  }
  for (const [agent, a] of Object.entries(leaks.byAgent)) {
    for (const s of a.samples) md += `\n- [${agent}] ${s}`;
  }
  md += `\n`;
}

if (errored.length) {
  md += `\n## Errors\n`;
  for (const e of errored.slice(0, 10)) md += `- ${e.agent}/${e.persona}/run${e.run}: ${e.error}\n`;
}

if (outFile) { writeFileSync(outFile, md); console.log(`Report -> ${outFile}`); }
else console.log(md);
