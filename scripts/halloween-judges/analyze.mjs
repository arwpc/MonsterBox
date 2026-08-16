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

if (errored.length) {
  md += `\n## Errors\n`;
  for (const e of errored.slice(0, 10)) md += `- ${e.agent}/${e.persona}/run${e.run}: ${e.error}\n`;
}

if (outFile) { writeFileSync(outFile, md); console.log(`Report -> ${outFile}`); }
else console.log(md);
