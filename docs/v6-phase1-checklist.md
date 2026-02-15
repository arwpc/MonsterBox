# MonsterBox v6.0.0 — Phase 1 Character Independence Checklist

**Status:** COMPLETE
**Date:** 2026-02-15

## Group 1 — Core Services

- [x] `services/orchestrationService.js` — Load topology from config/animatronics.json
- [x] `services/elevenLabsAgentService.js` — Remove Orlok-specific agent template; remove character-name comments
- [x] `services/characterService.js` — Return empty array on error (no hardcoded fallback list)
- [x] `services/poses/poseEngine.js` — No default characterId; throws if not set
- [x] `controllers/posesController.js` — No default characterId; throws if not set

## Group 2 — Route Default Fallbacks

- [x] `routes/conversation.js` — Remove `|| 1` in play-audio characterId
- [x] `routes/setup/jaw-animation.js` — Remove `|| 1` in characterId resolution
- [x] `routes/scenes/api.js` — Remove `|| 1` and PumpkinHead comment
- [x] `routes/api/sceneEditorApi.js` — Remove `|| 1` in getCurrentCharacterId
- [x] `routes/api/randomPoseRoutes.js` — Remove `|| 1`, add 400 if missing
- [x] `routes/aiSettingsRoutes.js` — Remove `|| 1` (3 instances)

## Group 3 — Comments

- [x] `services/serverSTTListener.js` — "verified working on Orlok" → generic
- [x] `services/jawAnimationSuperPowerService.js` — "typical Orlok jaw range" → "default simulated jaw range"
- [x] `services/sttFilterPresets.js` — "tuned on Orlok" removed from description

## Verification

- [x] `grep -ri "Orlok|PumpkinHead|..." routes/ services/ controllers/` — Only test fixtures remain (MB_TEST_MODE guard)
- [x] `grep -rn "selectedCharacter.*||.*[0-9]" services/ controllers/ routes/` — Only webcam fallbacks (|| cams[0]), which are correct
- [x] npm test: 140 passed, 1 pre-existing failure, 7 skipped
