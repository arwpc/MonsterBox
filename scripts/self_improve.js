#!/usr/bin/env node

/**
 * Self-Improvement script for Augment (Mocha-compatible).
 *
 * - Collects recent errors from logs/errors.log
 * - Normalizes & sorts them by frequency (top 50)
 * - Generates #memory rules into augment.memories
 * - Creates Mocha test files in tests/self_improvement/
 */

import fs from "fs";
import path from "path";

// --- Paths ---
const LOG_FILE = path.resolve("logs/errors.log");
const MEM_FILE = path.resolve("augment.memories");
const TEST_DIR = path.resolve("tests/self_improvement");
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

const MAX_PATTERNS = 50;

// --- Step 1: Append new error if provided via CLI ---
const newError = process.argv.slice(2).join(" ");
if (newError) {
  if (!fs.existsSync("logs")) fs.mkdirSync("logs");
  fs.appendFileSync(LOG_FILE, newError + "\n");
  console.log(`📥 Logged new error: ${newError}`);
}

// --- Step 2: Read log ---
if (!fs.existsSync(LOG_FILE)) {
  console.log("⚠️ No error log found. Exiting.");
  process.exit(0);
}

const errors = fs.readFileSync(LOG_FILE, "utf-8")
  .split("\n")
  .filter(Boolean);

// --- Step 3: Normalize errors ---
function normalize(line) {
  return line
    .replace(/\/[^\s]+/g, "<path>")    // strip file paths
    .replace(/:\d+:\d+/g, ":<line>")   // strip line/col numbers
    .replace(/\d+/g, "<num>")          // collapse numeric values
    .trim();
}

const counts = {};
for (const e of errors) {
  const key = normalize(e);
  counts[key] = (counts[key] || 0) + 1;
}

// --- Step 4: Sort & slice ---
const sorted = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, MAX_PATTERNS);

// --- Step 5: Rule generator ---
function makeRule(err) {
  if (err.includes("require(") && err.includes("ESM")) {
    return "#memory Always use `import` syntax in ES modules instead of `require`.";
  }
  if (err.includes("await") && err.includes("not in async function")) {
    return "#memory Always wrap `await` calls inside an async function.";
  }
  return `#memory Avoid repeating this mistake: ${err}`;
}

// --- Step 6: Mocha test generator ---
function makeTest(err) {
  return `
import assert from "assert";

describe("Self-Improvement Rules", function () {
  it("Avoid pattern: ${err.slice(0, 60)}...", function () {
    // Placeholder: ensures this error pattern is tracked
    assert.strictEqual(true, true);
  });
});
`;
}

// --- Step 7: Generate rules & tests ---
const rules = sorted.map(([err]) => makeRule(err));
const tests = sorted.map(([err]) => makeTest(err));

// --- Step 8: Update memories ---
if (!fs.existsSync(MEM_FILE)) {
  fs.writeFileSync(MEM_FILE, "# Augment memories\n\n");
}
fs.appendFileSync(MEM_FILE, rules.join("\n") + "\n");

// --- Step 9: Save Mocha test file ---
const testFile = path.join(TEST_DIR, `auto_${Date.now()}.test.js`);
fs.writeFileSync(testFile, tests.join("\n"), "utf-8");

console.log(`✅ Self-improvement complete. ${rules.length} rules added, tests at ${testFile}`);