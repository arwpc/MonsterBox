#!/usr/bin/env node
import { validateAll, describeErrors } from '../services/schemaValidator.js';

const result = validateAll();

if (!result.valid) {
  console.error(`\n✗ Schema validation failed — ${result.errors.length} error(s):\n`);
  console.error(describeErrors(result.errors));
  console.error('');
  process.exit(1);
}

const okChars = result.perCharacter.map((c) => `character-${c.charId}`).join(', ');
console.log(`✓ Schema validation passed (${result.perCharacter.length} character(s): ${okChars || 'none'}).`);
