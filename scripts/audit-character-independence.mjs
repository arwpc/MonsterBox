#!/usr/bin/env node
/**
 * Character-Independence Auditor (Pillar 5)
 *
 * Greps the repository for bias patterns that would tie code to a specific
 * character (Orlok, Mina, Sir Dragomir, PumpkinHead, Groundbreaker) or to a
 * specific MonsterNet IP. Violations outside the baseline allowlist cause
 * a non-zero exit.
 *
 * The allowlist at tests/baseline/character-independence-allowlist.json starts
 * with the Phase-0 audit findings and may only shrink over time (ratchet).
 *
 * Modes:
 *   (no args)           — exit 1 on any unexpected violation
 *   --json              — dump all violations as JSON (for agents/tests)
 *   --list-allowlisted  — print allowlist entries still matching source
 *   --stale-allowlist   — print allowlist entries NOT matching source
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'tests', 'baseline', 'character-independence-allowlist.json');

// Pattern scope: source code only. Markdown, JSON, and shell-script docs are
// expected to reference characters by name and IP — that's documentation, not
// bias. The goal is to catch *runtime behavior* that favors one character.
const PATTERNS = [
  { name: 'orlok-reference', regex: /orlok/i, extensions: ['.js', '.mjs', '.ejs'] },
  { name: 'characterId-3',   regex: /character_?[iI]d\s*[:=]\s*3\b/, extensions: ['.js', '.mjs'] },
  { name: 'char_id-3',       regex: /\bchar_id\s*[:=]=?=?\s*3\b/, extensions: ['.js', '.mjs'] },
  { name: 'monsternet-ip',   regex: /192\.168\.8\.(120|130|140|150|200)\b/, extensions: ['.js', '.mjs', '.ejs'] },
  { name: 'name-equality',   regex: /===?\s*['"`](Orlok|Mina|PumpkinHead|Sir\s?Dragomir|Groundbreaker)['"`]/i, extensions: ['.js', '.mjs', '.ejs'] },
];

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  'playwright-report', 'test-results', '.vscode', '.idea',
  'data', 'audio-library', 'public/audio',
]);
const EXCLUDE_FILES = new Set([
  'docs/development/STABILIZATION-AUDIT.md',
  'docs/development/STABILIZATION-PLAN.md',
  'docs/development/STABILIZATION-RESULTS.md',
  'CHANGELOG.md',
  'tests/baseline/character-independence-allowlist.json',
  'scripts/audit-character-independence.mjs',
  'memory/MEMORY.md',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    const rel = path.relative(REPO_ROOT, path.join(dir, entry.name));
    if (EXCLUDE_FILES.has(rel)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

function scan() {
  const violations = [];
  const files = walk(REPO_ROOT);
  for (const file of files) {
    const ext = path.extname(file);
    const rel = path.relative(REPO_ROOT, file);
    const matchingPatterns = PATTERNS.filter((p) => p.extensions.includes(ext));
    if (matchingPatterns.length === 0) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of matchingPatterns) {
        if (pattern.regex.test(line)) {
          violations.push({
            pattern: pattern.name,
            file: rel,
            line: i + 1,
            snippet: line.trim().slice(0, 140),
          });
        }
      }
    }
  }
  return violations;
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return { entries: [] };
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
}

function matchKey(v) {
  return `${v.pattern}::${v.file}::${v.line}`;
}

function diffAgainstAllowlist(violations, allowlist) {
  const allowKeys = new Set(allowlist.entries.map(matchKey));
  const unexpected = violations.filter((v) => !allowKeys.has(matchKey(v)));
  const currentKeys = new Set(violations.map(matchKey));
  const stale = allowlist.entries.filter((e) => !currentKeys.has(matchKey(e)));
  return { unexpected, stale };
}

function main() {
  const mode = process.argv[2];
  const violations = scan();

  if (mode === '--json') {
    console.log(JSON.stringify(violations, null, 2));
    return;
  }

  const allowlist = loadAllowlist();
  const { unexpected, stale } = diffAgainstAllowlist(violations, allowlist);

  if (mode === '--list-allowlisted') {
    const allowKeys = new Set(allowlist.entries.map(matchKey));
    const active = violations.filter((v) => allowKeys.has(matchKey(v)));
    console.log(JSON.stringify(active, null, 2));
    return;
  }

  if (mode === '--stale-allowlist') {
    console.log(JSON.stringify(stale, null, 2));
    return;
  }

  let failed = false;
  if (unexpected.length > 0) {
    console.error(`\n✗ Found ${unexpected.length} bias violation(s) not in the allowlist:\n`);
    for (const v of unexpected) {
      console.error(`  [${v.pattern}] ${v.file}:${v.line}`);
      console.error(`    ${v.snippet}`);
    }
    console.error('\nFix: parameterize the code, or add an entry with a `reason` to');
    console.error(`  ${path.relative(REPO_ROOT, ALLOWLIST_PATH)}.\n`);
    failed = true;
  }

  if (stale.length > 0) {
    console.warn(`\n⚠️  ${stale.length} allowlist entr(ies) no longer match source — ratchet opportunity:`);
    for (const s of stale) {
      console.warn(`  [${s.pattern}] ${s.file}:${s.line} — ${s.reason || '(no reason noted)'}`);
    }
    console.warn('Remove these entries from the allowlist to tighten the ratchet.\n');
  }

  if (failed) process.exit(1);
  console.log(`✓ Character-independence audit clean (${violations.length} total matches, all allowlisted).`);
}

main();
