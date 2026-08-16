#!/usr/bin/env node
/**
 * Design-system audit.
 *
 * MonsterBox has a real design system — tokens.css, components.css, three
 * themes, a style guide at /setup/style-guide. The problem was never that it
 * lacked a design language; it was that adoption stopped partway and nothing
 * stopped new code from reaching for raw Bootstrap or a native confirm() again.
 * A product feels designed when the twelfth page looks like the first, and
 * consistency held by good intentions rots.
 *
 * This works the way the character-independence audit does: a baseline of known
 * violations that may only ever SHRINK. It does not demand the app be perfect
 * today — it demands it never get worse, and it makes every improvement visible.
 *
 * Run: npm run audit:design-system
 * Baseline: tests/baseline/design-system-baseline.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'tests/baseline/design-system-baseline.json');

/**
 * Each rule counts occurrences across a set of files. `why` is printed when the
 * count grows, so the failure explains itself rather than just naming a regex.
 */
const RULES = [
  {
    id: 'raw-bootstrap-buttons',
    why: 'Use .mb-btn (see /setup/style-guide) so every button shares hover, focus, disabled and busy states.',
    dirs: ['views'],
    ext: ['.ejs'],
    pattern: /class="[^"]*\bbtn\s+btn-(?!.*mb-)[a-z-]+/g
  },
  {
    id: 'raw-bootstrap-forms',
    why: 'Use .mb-input / .mb-select / .mb-range / .mb-textarea so form controls are consistent and touch-sized.',
    dirs: ['views'],
    ext: ['.ejs'],
    pattern: /class="[^"]*\bform-(control|select|range|check-input)\b/g
  },
  {
    id: 'native-dialogs',
    why: 'Native alert()/confirm() cannot be styled, are unusable on mobile, and cannot show what is about to be destroyed. Use a toast, or hold-to-confirm for destructive actions.',
    dirs: ['views', 'public/js'],
    ext: ['.ejs', '.js'],
    pattern: /(?<![\w.])(alert|confirm)\s*\(/g
  },
  {
    id: 'inline-styles',
    why: 'Inline style="" bypasses the token system, so themes and dark/light cannot reach it. Use a component class or a token-backed rule.',
    dirs: ['views'],
    ext: ['.ejs'],
    pattern: /\sstyle="/g
  },
  {
    id: 'hardcoded-colors',
    why: 'Hardcoded colors break the three themes. Reference a --mb-* token from tokens.css.',
    dirs: ['views'],
    ext: ['.ejs'],
    pattern: /#[0-9a-fA-F]{3,8}\b(?![^<]*<\/script>)/g
  }
];

async function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'vendor') continue;
      await walk(full, ext, out);
    } else if (ext.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

async function countRule(rule) {
  const perFile = {};
  let total = 0;
  for (const dir of rule.dirs) {
    const files = await walk(path.join(ROOT, dir), rule.ext);
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8');
      const matches = text.match(rule.pattern);
      if (matches && matches.length) {
        const rel = path.relative(ROOT, file);
        perFile[rel] = matches.length;
        total += matches.length;
      }
    }
  }
  return { total, perFile };
}

async function main() {
  const write = process.argv.includes('--update-baseline');

  const results = {};
  for (const rule of RULES) {
    results[rule.id] = await countRule(rule);
  }

  if (write) {
    const baseline = {
      _readme: 'Known design-system violations. These counts may only SHRINK — the audit fails if any grows. Regenerate deliberately with: npm run audit:design-system -- --update-baseline',
      generated: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.total]))
    };
    await fs.mkdir(path.dirname(BASELINE_PATH), { recursive: true });
    await fs.writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log('✓ Baseline written to tests/baseline/design-system-baseline.json');
    for (const [id, r] of Object.entries(results)) console.log(`  ${id}: ${r.total}`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));
  } catch {
    console.error('✗ No design-system baseline found. Create one with:');
    console.error('    npm run audit:design-system -- --update-baseline');
    process.exit(1);
  }

  const regressions = [];
  const improvements = [];

  for (const rule of RULES) {
    const now = results[rule.id].total;
    const then = baseline.counts?.[rule.id];
    if (then == null) continue;
    if (now > then) regressions.push({ rule, now, then, perFile: results[rule.id].perFile });
    else if (now < then) improvements.push({ id: rule.id, now, then });
  }

  for (const imp of improvements) {
    console.log(`✓ ${imp.id}: ${imp.then} → ${imp.now} (improved by ${imp.then - imp.now})`);
  }

  if (regressions.length === 0) {
    const total = Object.values(results).reduce((sum, r) => sum + r.total, 0);
    console.log(`✓ Design-system audit clean (${total} known violations, none new).`);
    if (improvements.length) {
      console.log('  Baseline can be tightened: npm run audit:design-system -- --update-baseline');
    }
    return;
  }

  console.error('\n✗ Design-system regressions — these counts may only shrink:\n');
  for (const reg of regressions) {
    console.error(`  [${reg.rule.id}] ${reg.then} → ${reg.now}`);
    console.error(`  ${reg.rule.why}`);
    const worst = Object.entries(reg.perFile).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [file, count] of worst) console.error(`      ${count}×  ${file}`);
    console.error('');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('Design-system audit failed to run:', err.message);
  process.exit(1);
});
