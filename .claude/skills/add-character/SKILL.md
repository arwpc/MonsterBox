---
name: add-character
description: Bootstraps a new MonsterBox character with all required data files in schema-valid shape. Use when the user says "add a character", "new animatronic", "bootstrap character N", or describes onboarding a new MonsterNet node. Always runs the pact suite against the new character at the end to prove it meets the contract.
---

# Add a Character

You create `data/character-<N>/` with every required file in schema-valid shape and register the new character in `data/characters.json` and `config/animatronics.json`.

## Required information (prompt the user for anything missing)

1. **Numeric id** (`N`) — prefer the next free integer (6, 7, ...). Check `data/characters.json` for existing ids.
2. **Display name** — e.g., "Harbinger".
3. **IP address** on MonsterNet (192.168.8.x).
4. **Hostname** on MonsterNet (lowercase).
5. **ElevenLabs agent id** — optional; if missing, leave the field out.

## Files to create

```
data/character-<N>/
├── parts.json               # start with []
├── poses.json               # { characterId: <N>, poses: [], templates: {} }
├── scenes.json              # []
├── super-powers.json        # { jawAnimation: { enabled: false, configs: [] } }
├── ai-config/
│   ├── tts-config.json      # { model: "eleven_v3", stability: 0.5, similarity_boost: 0.5 }
│   └── stt-config.json      # { microphonePartId: null, vadEnabled: false }
```

## Procedure

1. Verify id is unused (not in `data/characters.json`, no `data/character-<N>/` directory).
2. Create the directory tree above with minimal-valid contents.
3. Append the character to `data/characters.json`:
   ```json
   { "id": <N>, "name": "<DisplayName>" }
   ```
   Include `elevenLabsAgentId` and `activeImage` only if the user provided them.
4. Update `config/animatronics.json` to include the new entry: `{ hostname, ip, characterId: <N>, name }`.
5. Run `npm run validate:schemas` — it must pass cleanly.
6. Run `node scripts/pact-runner.mjs --char <N>` — every contract assertion must pass (or cleanly skip for optional fields like `super-powers.json`'s `jawAnimation`).
7. Update the MonsterNet table in `README.md` to list the new IP/character pairing.
8. If any step fails, stop and show the error — do not half-create a character.

## Constraints

- **Never** copy another character's `parts.json` wholesale — parts are physical hardware per node. Start with an empty array and let `/add-part` scaffold each entry after the hardware is wired.
- **Never** hardcode the new character's id in code. The resolver (`services/characterContext.js`) and the schema are the only authorities.
- If the user wants a character id that's already used (e.g. recycling 6), stop and confirm — this may collide with the known orphan `data/character-6/` directory.
