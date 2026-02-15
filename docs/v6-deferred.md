# MonsterBox v6.0.0 — Deferred Items

Items logged here were identified during the v6.0.0 upgrade but deferred to avoid risk or scope creep.

## Character Independence

- `services/characterService.js` lines 50-55: Test-mode canonical character list (`MB_TEST_MODE` guard) contains hardcoded character names. This is test infrastructure, not runtime code. Acceptable to keep.
- `services/elevenLabsAgentService.js` getQuickResponses: Agent-specific quick response fallbacks are keyed by ElevenLabs agent ID (config values from characters.json), not by character name. The responses themselves are hardcoded but the mapping is config-driven. A future enhancement could load these from per-character config files.
- `data/characters.json`: Contains duplicate "PumpkinHead_Updated" entries (IDs 5 and 6). Clarification needed from owner before cleanup.

## Code Duplication (Phase 2)

- `services/scenes/queueLibrary.js` and `services/scenes/queueTemplates.js` duplicate `getDataDir()`, `getCharacterDir()`, and `ensureDir()` helper functions. Could be extracted to a shared `services/scenes/sceneUtils.js` in a future release.
- Multiple services resolve character data directories independently. Could benefit from a centralized `getCharacterDataDir(characterId)` utility.

## Code Quality

*(Items added as discovered during later phases)*
