#!/usr/bin/env node
/**
 * Wrapper to run the character pact suite against one specific character.
 * Usage:  node scripts/pact-runner.mjs --char <id>
 *         npm run test:pact:character -- --char 3
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let charId = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--char' && args[i + 1]) charId = args[i + 1];
}

const env = { ...process.env, BASE_URL: process.env.BASE_URL || 'http://localhost:3100' };
if (charId) env.PACT_CHARACTER_FILTER = charId;

const mocha = spawn(
  'npx',
  ['mocha', '--require', 'tests/setup.js', 'tests/pact', '--reporter', 'spec', '--exit', '--timeout', '10000'],
  { stdio: 'inherit', env }
);

mocha.on('exit', (code) => process.exit(code || 0));
