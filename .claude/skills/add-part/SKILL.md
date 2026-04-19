---
name: add-part
description: Scaffolds a new hardware part for a MonsterBox character. Use when the user says "add a part", "new servo", "new motor", "new actuator", "new light", "new microphone", "new speaker", "new sensor", "new webcam", or similar phrasing that implies registering new hardware in `parts.json`. Always validates against the schema before writing.
---

# Add a Hardware Part

You scaffold a new entry in `data/character-<id>/parts.json` that conforms to `config/schemas/parts.schema.json`. Always validate before writing.

## Required information (prompt the user for anything missing)

1. **Character id** — numeric (1–5 today). If the user says "Orlok" → 3, "Mina" → 2, etc. Look up `data/characters.json` to confirm.
2. **Part type** — one of: `servo`, `continuous-servo`, `motor`, `linear_actuator`, `stepper`, `light`, `led`, `sensor`, `motion_sensor`, `speaker`, `microphone`, `webcam`.
3. **Name** — human-readable, e.g., "Left Jaw Servo".
4. **Pin / channel wiring** — depends on type:
   - servo/continuous-servo: PCA9685 `config.channel` (0–15) and `config.address` (usually 64).
   - motor/stepper: GPIO pin numbers (e.g. `directionPin`, `pwmPin` for legacy MDD10A, or `rpwmPin`/`lpwmPin`/`renPin`/`lenPin` for BTS7960).
   - linear_actuator: same as motor + `maxExtension`/`maxRetraction` in ms.
   - light/led: `pin`.
   - sensor/motion_sensor: `pin`.

## Procedure

1. Read `config/schemas/parts.schema.json` so you know the current required set.
2. Read `data/characters.json` to verify the target character exists.
3. Read the target `data/character-<id>/parts.json` to pick an unused id (string of `max(existing ids) + 1`).
4. Build the new part object. Include:
   - `id` (string), `name`, `type`, `enabled: true`
   - `created` and `updated` as ISO timestamps (e.g., `new Date().toISOString()`)
   - `config` (object) with type-appropriate fields
   - Pin/channel fields appropriate to the type
5. Append to the array and write back with 2-space indentation.
6. Run `npm run validate:schemas`. If it fails, revert the write and report the error — do not commit broken data.
7. Run `node scripts/pact-runner.mjs --char <id>` to confirm the character still passes every contract.
8. Report success with the new part id and the commands the user can run to exercise it (e.g., `curl -X POST http://localhost:3000/api/parts/<id>/test`).

## Constraints

- **Never** hardcode the part id as a number elsewhere — scenes reference parts by string id, poses by number id.
- **Never** special-case the character in the new part's logic.
- If the user asks for something the schema doesn't permit, stop and ask — do not silently relax the schema.
