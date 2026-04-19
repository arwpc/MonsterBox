import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'config', 'schemas');
const DEFAULT_DATA_ROOT = path.join(REPO_ROOT, 'data');

const CHARACTER_FILES = [
  { rel: 'parts.json', schema: 'parts' },
  { rel: 'poses.json', schema: 'poses' },
  { rel: 'scenes.json', schema: 'scenes' },
  { rel: 'super-powers.json', schema: 'super-powers' },
  { rel: 'ai-config/tts-config.json', schema: 'tts-config' },
  { rel: 'ai-config/stt-config.json', schema: 'stt-config' },
];

const schemaCache = new Map();
function loadSchema(name) {
  if (schemaCache.has(name)) return schemaCache.get(name);
  const p = path.join(SCHEMA_DIR, `${name}.schema.json`);
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  schemaCache.set(name, parsed);
  return parsed;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validate(data, schema, pathSoFar = '') {
  const errors = [];

  if (schema.anyOf) {
    for (const sub of schema.anyOf) {
      if (validate(data, sub, pathSoFar).length === 0) return [];
    }
    errors.push({ path: pathSoFar || '<root>', rule: 'anyOf', message: 'did not match any alternative' });
    return errors;
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((sub) => validate(data, sub, pathSoFar).length === 0);
    if (matches.length !== 1) {
      errors.push({ path: pathSoFar || '<root>', rule: 'oneOf', message: `matched ${matches.length} alternatives (need exactly 1)` });
    }
    return errors;
  }

  if (schema.type) {
    const actual = typeOf(data);
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const intOk = expected.includes('integer') && actual === 'number' && Number.isInteger(data);
    if (!expected.includes(actual) && !intOk) {
      errors.push({ path: pathSoFar || '<root>', rule: 'type', message: `expected ${expected.join('|')}, got ${actual}` });
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path: pathSoFar || '<root>', rule: 'enum', message: `value ${JSON.stringify(data)} not in enum [${schema.enum.map((v) => JSON.stringify(v)).join(', ')}]` });
  }

  if (schema.pattern && typeof data === 'string') {
    if (!new RegExp(schema.pattern).test(data)) {
      errors.push({ path: pathSoFar || '<root>', rule: 'pattern', message: `does not match /${schema.pattern}/` });
    }
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in data)) {
          errors.push({ path: `${pathSoFar}.${key}`.replace(/^\./, ''), rule: 'required', message: 'missing required property' });
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const sub = `${pathSoFar}.${key}`.replace(/^\./, '');
          errors.push(...validate(data[key], subSchema, sub));
        }
      }
    }
  }

  if (Array.isArray(data) && schema.items) {
    for (let i = 0; i < data.length; i++) {
      errors.push(...validate(data[i], schema.items, `${pathSoFar}[${i}]`));
    }
  }

  return errors;
}

function validateJsonFile(filePath, schema) {
  if (!fs.existsSync(filePath)) {
    return { valid: true, exists: false, errors: [] };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { valid: false, exists: true, errors: [{ path: '<root>', rule: 'parse', message: err.message }] };
  }
  const errors = validate(data, schema);
  return { valid: errors.length === 0, exists: true, errors };
}

function subsystemFor(fileRel) {
  if (fileRel.startsWith('ai-config/')) return 'ai';
  if (fileRel === 'super-powers.json') return 'superpowers';
  if (fileRel === 'scenes.json') return 'scenes';
  if (fileRel === 'poses.json') return 'poses';
  if (fileRel === 'parts.json') return 'parts';
  return 'unknown';
}

export function validateCharacter(charId, dataRoot = DEFAULT_DATA_ROOT) {
  const charDir = path.join(dataRoot, `character-${charId}`);
  const results = {};
  const failingSubsystems = new Set();

  for (const { rel, schema } of CHARACTER_FILES) {
    const full = path.join(charDir, rel);
    const outcome = validateJsonFile(full, loadSchema(schema));
    results[rel] = { ...outcome, file: full };
    if (!outcome.valid) failingSubsystems.add(subsystemFor(rel));
  }

  const allErrors = Object.entries(results).flatMap(([rel, r]) => r.errors.map((e) => ({ charId, file: rel, ...e })));
  return {
    charId,
    charDir,
    valid: allErrors.length === 0,
    failingSubsystems: [...failingSubsystems],
    results,
    errors: allErrors,
  };
}

export function validateAll(dataRoot = DEFAULT_DATA_ROOT) {
  const regPath = path.join(dataRoot, 'characters.json');
  const registryOutcome = validateJsonFile(regPath, loadSchema('characters'));
  let characters = [];
  if (registryOutcome.exists && registryOutcome.valid) {
    characters = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  }

  const perCharacter = characters.map((c) => validateCharacter(c.id, dataRoot));

  const registryErrors = registryOutcome.errors.map((e) => ({ charId: null, file: 'characters.json', ...e }));
  const characterErrors = perCharacter.flatMap((c) => c.errors);
  const allErrors = [...registryErrors, ...characterErrors];

  return {
    valid: allErrors.length === 0,
    registry: { ...registryOutcome, file: regPath },
    perCharacter,
    errors: allErrors,
  };
}

export function describeErrors(errors) {
  return errors
    .map((e) => {
      const loc = e.charId != null ? `character-${e.charId}/${e.file}` : e.file;
      return `  ${loc}: ${e.path || '<root>'} — ${e.rule}: ${e.message}`;
    })
    .join('\n');
}
