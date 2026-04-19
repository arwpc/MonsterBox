---
name: pre-deploy-gate
description: Runs the MonsterBox pre-deploy gate (schemas + resolver + independence + smoke + pact) and reports failures with file:line and suggested fixes. User-invoked only — never trigger this based on model inference.
disable-model-invocation: true
---

# Pre-Deploy Gate

Run `npm run gate` from the repo root and interpret the output.

## Procedure

1. From the repo root, run `npm run gate` via Bash.
2. Parse the output. Each step prints `→ <name> ... ok (Xms)` or `FAIL (Xms)`.
3. If the gate passed, report total runtime and step breakdown. Done.
4. If the gate failed, identify which step failed and classify the errors:

### `validate:schemas` failure
- Source: `scripts/validate-schemas.mjs` → `services/schemaValidator.js`.
- Each error includes `character-<id>/<file>: <json-path> — <rule>: <message>`.
- **Fix**: edit the listed data file to conform to `config/schemas/<file>.schema.json`, OR adjust the schema if the divergence is legitimate per-character variation (rare — schemas were set conservative in Pillar 1).

### `audit:resolver` failure
- Source: `scripts/ensure-resolver-usage.mjs`.
- Each violation cites a `file:line` and the banned pattern.
- **Fix**: route the read through `resolveCharacter(req)` from `services/characterContext.js`, OR add the file to `eslint-rules/no-direct-character-resolution.allowlist.json` with a `reason`.

### `audit:independence` failure
- Source: `scripts/audit-character-independence.mjs`.
- Each violation cites `[pattern] file:line`.
- **Fix**: parameterize the code (read from `data/characters.json` or `config/animatronics.json`), OR add an entry with a `reason` to `tests/baseline/character-independence-allowlist.json`. The allowlist may shrink but should not grow without reason.

### `test:smoke` failure
- Source: `npm run test:unit` → Mocha unit tests.
- **Fix**: find the failing `it()` block in `tests/unit/**`, reproduce locally, fix the underlying code.

### `test:pact` failure
- Source: `tests/pact/character-contract.test.mjs`.
- Each failing assertion cites the character id and the specific contract that broke.
- **Fix**: decide whether the character's data file is wrong (edit data) or the contract is too strict (edit the pact test — rare).

## What to return

A concise failure report with:
1. Which step failed and the total time to that point.
2. Grouped errors with `file:line` references.
3. For each group, the fix category (edit data / edit code / update allowlist / loosen schema).
4. The single most likely root cause if one stands out.

If the gate passed, return a one-line confirmation with the runtime.

## Opt-out (mention only if the user specifically asks)

`MB_SKIP_GATE=1 git push` bypasses the local pre-push hook but the same gate runs in CI. Use sparingly.
