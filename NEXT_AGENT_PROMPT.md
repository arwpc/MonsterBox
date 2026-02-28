# MonsterBox — Next Agent Continuation Prompt

**Start by running `/learn-monsterbox` to onboard, then execute the tasks below.**

## Context

The previous session made these commits (already committed and tested):
- `64baaf3e` — Unified calibration to servo angle, jaw animation fixes, audio mic test fix, scenes character fix, log cleanup
- `d5318f53` — Fixed calibration drift for open-loop parts

There are **unstaged runtime data changes** from hardware testing (parts.json, super-powers.json, poses.json, etc.) — these are normal runtime data, NOT code changes. Commit them as a data sync commit: `v6.7.0: sync runtime data — post-calibration-unification baseline`.

## Remaining Task: Jaw Animation CRUD

Currently each character stores ONE jaw animation config at `data/character-{id}/super-powers.json` under the `jawAnimation` key. The user wants to be able to **save, load, rename, and delete multiple named jaw animation configs per character**.

### Current single-config structure (`super-powers.json`):
```json
{
  "jawAnimation": {
    "enabled": true,
    "servoPartId": "10",
    "sensitivity": 5,
    "smoothing": 0.4,
    "volumeThreshold": 0.02,
    "attackTime": 50,
    "releaseTime": 150,
    "useBandpassFilter": true,
    "useAGC": true,
    "quantizationLevels": 20,
    "preset": "custom",
    "minAngle": 54,
    "maxAngle": 100
  }
}
```

### Target multi-config structure:
```json
{
  "jawAnimation": {
    "enabled": true,
    "servoPartId": "10",
    "activeConfigId": "config-1",
    "configs": [
      {
        "id": "config-1",
        "name": "Speech Default",
        "sensitivity": 5,
        "smoothing": 0.4,
        "volumeThreshold": 0.02,
        "attackTime": 50,
        "releaseTime": 150,
        "useBandpassFilter": true,
        "useAGC": true,
        "quantizationLevels": 20,
        "preset": "custom",
        "minAngle": 54,
        "maxAngle": 100
      }
    ]
  }
}
```

### Key files to modify:

1. **`services/jawAnimationSuperPowerService.js`** (~1234 lines)
   - `readJawConfig(characterId)` — Must merge active config's params into the returned config object for backward compat. All consumers call this and expect a flat config with `enabled`, `servoPartId`, `sensitivity`, etc.
   - `writeJawConfig(characterId, jawConfig)` — Must handle both old flat format and new multi-config format
   - Add: `listJawConfigs(characterId)`, `getJawConfig(characterId, configId)`, `saveJawConfig(characterId, configId, config)`, `deleteJawConfig(characterId, configId)`, `setActiveJawConfig(characterId, configId)`
   - The in-memory cache `characterConfigs` must be updated on writes

2. **`routes/setup/jaw-animation.js`** (~380 lines)
   - Add CRUD API endpoints:
     - `GET /api/jaw-animation/:charId/configs` — list all configs
     - `POST /api/jaw-animation/:charId/configs` — create new config
     - `PUT /api/jaw-animation/:charId/configs/:configId` — update config
     - `DELETE /api/jaw-animation/:charId/configs/:configId` — delete config
     - `POST /api/jaw-animation/:charId/configs/:configId/activate` — set as active
   - Existing `GET /api/jaw-animation/:charId` and `POST /api/jaw-animation/:charId` must keep working (backward compat)

3. **`views/setup/jaw-animation.ejs`** (~large file)
   - Add a config selector dropdown at the top of the jaw animation page
   - Add buttons: "Save As New", "Rename", "Delete"
   - When switching configs, reload the form fields
   - Client JS follows ES5 IIFE pattern (var, no arrow functions, no template literals)

4. **Migration** — On first read, if `super-powers.json` has old flat format (no `configs` array), auto-migrate to the new format. The existing config becomes the first entry in `configs[]` with `id: "config-1"` and `name: "Default"`.

### Constraints (from CLAUDE.md):
- **DO NOT** add new npm dependencies
- **Client JS in EJS:** ES5 IIFE style (var, no arrow functions, no template literals, no const/let)
- **Preserve all existing API contracts** — the existing GET/POST jaw-animation endpoints must keep working
- **Part IDs are strings** in super-powers.json
- **Commit format:** `v6.7.0: [jaw-animation] add CRUD for multiple jaw configs`

### Testing checklist:
1. Run `npm run test:unit` — all must pass
2. Run `npm run test:system` — all must pass
3. Verify existing jaw animation still works with migrated single config
4. Test creating a second config, switching between them
5. Test deleting a config (should not allow deleting the active one, or auto-switch)

### After completing the task:
1. Run full test suite: `npm run verify`
2. Update `CHANGELOG.md` with the jaw animation CRUD entry
3. Update shared memory files if needed
4. Commit with descriptive message
5. Run `git log --oneline -5` to confirm clean history
