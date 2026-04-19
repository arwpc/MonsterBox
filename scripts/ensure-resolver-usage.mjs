#!/usr/bin/env node
/**
 * CI Guard: Ensure character-state reads go through services/characterContext.js.
 *
 * Fails if any JS/MJS file outside the allowlist reads:
 *   - req.app.locals.config.selectedCharacter
 *   - cfg.selectedCharacter / config.selectedCharacter (after readConfig())
 *   - req.query.characterId / req.params.characterId / req.params.charId
 *
 * The allowlist at eslint-rules/no-direct-character-resolution.allowlist.json
 * records files still permitted to use these patterns (baseline from the
 * Pillar 2 migration). The allowlist may shrink but should never grow.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'eslint-rules', 'no-direct-character-resolution.allowlist.json');

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', '.vscode', '.idea', 'tests', 'scripts', 'data', 'public', 'audio-library']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(m?js)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const patterns = raw.banned_patterns.map((p) => new RegExp(p));
  const allowed = new Set(Object.keys(raw.allowlist));
  return { patterns, allowed };
}

function relFromRoot(abs) {
  return path.relative(REPO_ROOT, abs);
}

function scan() {
  const { patterns, allowed } = loadAllowlist();
  const files = walk(REPO_ROOT);
  const violations = [];

  for (const file of files) {
    const rel = relFromRoot(file);
    if (allowed.has(rel)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const re of patterns) {
        if (re.test(line)) {
          violations.push({ file: rel, line: i + 1, snippet: line.trim().slice(0, 140), pattern: re.source });
          break;
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = scan();
  if (violations.length === 0) {
    console.log('✓ No direct character-state reads outside the allowlist.');
    process.exit(0);
  }
  console.error(`\n✗ Found ${violations.length} direct character-state read(s) outside the allowlist:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  /${v.pattern}/`);
    console.error(`    ${v.snippet}`);
  }
  console.error('\nFix: route through `resolveCharacter(req)` from services/characterContext.js,');
  console.error('or add the file to eslint-rules/no-direct-character-resolution.allowlist.json with a reason.\n');
  process.exit(1);
}

main();
