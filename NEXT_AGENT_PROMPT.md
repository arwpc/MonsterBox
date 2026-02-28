# MonsterBox — Next Agent Continuation Prompt

**Start by running `/learn-monsterbox` to onboard, then execute the tasks below.**

## Context

The previous sessions completed these features (all committed and tested):

### Recent Commits (newest first)
- `913913c7` — Cleanup: removed NEXT_AGENT_PROMPT.md
- `6daa6bd6` — **Jaw Animation CRUD**: multiple named jaw configs per character with save/load/rename/delete
- `df9aeaee` — Sync runtime data + unstaged improvements (char ID propagation, pinctrl, calibration)
- `64baaf3e` — Unified calibration to servo angle, jaw animation fixes, audio mic test fix, scenes character fix, log cleanup
- `d5318f53` — Fixed calibration drift for open-loop parts

### Key Changes Completed
1. **Jaw Animation CRUD** — Multiple named configs per character in `super-powers.json` `configs[]` array. Auto-migration from flat format. CRUD API endpoints + UI selector.
2. **Calibration Angle Unification** — Absolute servos use angle (0-180°) everywhere instead of normalized 0-1.
3. **Jaw Animation Consistency** — Daemon pre-warming, Ask AI jaw sync, error logging.
4. **Audio Mic Test Fix** — Device fallback logic, no more HTTP 500.
5. **Scenes Character Fix** — `renderWithLayout` passes `currentCharacter` to content templates.
6. **Log Cleanup** — Daily systemd timer, journald limits.
7. **Character ID Propagation** — `window.__MB_CHAR_ID` in master.ejs for all client JS.
8. **Light Control** — Switched from lgpio to pinctrl for persistent GPIO state.

### Current State
- **Working tree:** Clean (only `data/performance-history.json` runtime data modified)
- **All tests pass:** 263 unit, 177 system, 0 failures
- **Server:** Running via `monsterbox.service` on port 3000 (HTTPS), test port 3100 (HTTP)

## Tasks for Next Agent

The owner (Aaron) will provide new tasks. If none are specified, here are recommended follow-ups:

### 1. Test Jaw Animation CRUD End-to-End
- Navigate to `/setup/jaw-animation` in the browser
- Create a second config ("Speech Loud"), adjust sensitivity higher
- Switch between configs and verify form values reload
- Delete the non-active config
- Verify TTS test still works with each config

### 2. Add System Tests for Jaw Config CRUD
Currently no automated tests for the new CRUD endpoints. Add to `tests/system/jaw-animation.test.js`:
- `GET /api/jaw-animation/:charId/configs` — returns configs list
- `POST /api/jaw-animation/:charId/configs` — creates new config
- `POST /api/jaw-animation/:charId/configs/:id/activate` — switches active
- `POST /api/jaw-animation/:charId/configs/:id/rename` — renames
- `DELETE /api/jaw-animation/:charId/configs/:id` — deletes (and verify cannot delete active)

### 3. Review and Address Any User-Reported Issues
The owner frequently tests hardware and reports issues during sessions. Be ready to:
- Debug jaw animation behavior on real hardware
- Fix calibration edge cases
- Address any UI/UX feedback

### Constraints (from CLAUDE.md)
- **DO NOT** add new npm dependencies
- **Client JS in EJS:** ES5 IIFE style (var, no arrow functions, no template literals)
- **Preserve all existing API contracts**
- **Part IDs are strings** in super-powers.json
- **Commit format:** `v6.7.0: [phase] brief description`
- **Test port 3100** is HTTP, created automatically by server.js when PORT ≠ 3100. Never start server directly on PORT=3100.

### Key Files Reference
- `services/jawAnimationSuperPowerService.js` — Jaw config CRUD + animation engine (~1300 lines)
- `routes/setup/jaw-animation.js` — Jaw animation API routes (~530 lines)
- `views/setup/jaw-animation.ejs` — Jaw animation page template
- `public/js/jaw-animation.js` — Client-side jaw animation JS (ES5 IIFE)
- `data/character-{id}/super-powers.json` — Per-character jaw configs (multi-config format)
