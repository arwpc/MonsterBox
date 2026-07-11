#!/usr/bin/env node
/**
 * Tooltip coverage auditor (dev utility).
 *
 * Scans every EJS view for interactive controls (<button>, <select>, and
 * <a> that act as buttons) and reports any whose opening tag has no `title=`
 * attribute. Handles two shapes:
 *   1. Static HTML tags whose attributes span multiple lines.
 *   2. Tags emitted from JS string concatenation (html += '<button ...>').
 *
 * A tag is considered "covered" if `title=` (or `title=\\'` / `title=\"`)
 * appears anywhere between the tag-open token and the next `>` that closes it
 * — where for JS strings we treat the run of concatenated string fragments up
 * to the closing `>` as the tag.
 *
 * Usage: node scripts/audit-tooltips.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'views';
const CONTROL_RE = /<(button|select)\b/gi;

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.ejs')) out.push(p);
  }
  return out;
}

// From the index of a `<button`/`<select` token, walk forward through the raw
// text to find the character that closes the opening tag. We must skip `>`
// characters that live inside quoted attribute values (both " and ').
function openingTagText(text, start) {
  const CAP = 500; // keep the slice local so it can't swallow the next control's title
  const end = Math.min(text.length, start + CAP);
  let i = start;
  let quote = null;
  for (; i < end; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '>') break;
  }
  return text.slice(start, i + 1);
}

let totalMissing = 0;
const perFile = [];
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const missing = [];
  let m;
  CONTROL_RE.lastIndex = 0;
  while ((m = CONTROL_RE.exec(text)) !== null) {
    const tag = openingTagText(text, m.index);
    if (!/\btitle\s*=/.test(tag)) {
      const line = text.slice(0, m.index).split('\n').length;
      missing.push({ line, tag: tag.replace(/\s+/g, ' ').slice(0, 90) });
    }
  }
  if (missing.length) {
    perFile.push({ file, missing });
    totalMissing += missing.length;
  }
}

for (const { file, missing } of perFile) {
  console.log(`\n${file}  (${missing.length})`);
  for (const mm of missing) console.log(`  ${mm.line}: ${mm.tag}`);
}
console.log(`\nTOTAL controls (<button>/<select>) missing title: ${totalMissing}`);
