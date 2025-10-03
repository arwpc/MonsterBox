#!/usr/bin/env node
// Harvest common issues from auto-generated self-improvement tests
// Outputs:
// - tests/self_improvement/common-issues.json (sorted counts)
// - tests/self_improvement/ISSUES_SUMMARY.md (human-readable)
// Idempotent and safe to run locally or in CI.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'tests', 'self_improvement');
const ISSUE_JSON = path.join(DIR, 'common-issues.json');
const ISSUE_MD = path.join(DIR, 'ISSUES_SUMMARY.md');

function listAutoTests(){
  const files = fs.readdirSync(DIR).filter(f => /^auto_.*\.test\.js$/.test(f));
  return files.map(f => path.join(DIR, f));
}

function extractIssues(filePath){
  const src = fs.readFileSync(filePath, 'utf8');
  const matches = [...src.matchAll(/it\(\s*"([^"]+)"/g)].map(m => m[1]);
  return matches;
}

function harvest(){
  const counts = new Map();
  for (const f of listAutoTests()) {
    for (const title of extractIssues(f)) {
      const key = title.trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const arr = [...counts.entries()].map(([issue, count]) => ({ issue, count }))
    .sort((a,b) => b.count - a.count || a.issue.localeCompare(b.issue));
  return arr;
}

function writeOutputs(list){
  fs.writeFileSync(ISSUE_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), issues: list }, null, 2));
  const lines = [
    '# Self-Improvement: Most Common Issues',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Rank | Count | Issue |',
    '| ---- | -----:| ----- |',
  ];
  list.forEach((x, i) => {
    lines.push(`| ${i+1} | ${x.count} | ${x.issue} |`);
  });
  if (list.length === 0) {
    lines.push('| – | 0 | No issues harvested yet |');
  }
  fs.writeFileSync(ISSUE_MD, lines.join('\n'));
}

const list = harvest();
writeOutputs(list);

console.log(`Harvested ${list.length} unique issues. Top 3:`);
console.log(list.slice(0,3));

