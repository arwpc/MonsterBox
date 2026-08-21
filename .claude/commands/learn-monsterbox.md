# MonsterBox Deep Learning — Full Codebase Onboarding

Perform a comprehensive onboarding of the MonsterBox codebase. Read all key documentation, code files, and hardware integration layers, then summarize your understanding and readiness to the user. Follow these steps:

## Step 1: Read Core Documentation
Read these files completely to understand the project:
1. `CLAUDE.md` — Project rules, architecture constraints, code style, session checklists
2. `README.md` — Feature overview, quick start, API examples, network map
3. `CHANGELOG.md` — Version history and recent changes
4. `package.json` — Dependencies, scripts, version
5. `install.sh` — System dependencies and setup process

## Step 2: Read Architecture Files
6. `server.js` — Entry point, route mounting, middleware, startup sequence
7. `config/animatronics.json` + `data/characters.json` — Character/network inventory (IPs, per-character part registry) — source of truth
8. `docs/deployment/README.md` — Multi-node deployment, network map, port assignments

## Step 3: Read Key Service Files
9. `services/jawAnimationSuperPowerService.js` — Jaw animation v2 engine
10. `services/jawServoDaemon.js` — Persistent servo daemon lifecycle
11. `services/elevenLabsTTSService.js` — TTS implementation
12. `services/serverPlaybackService.js` — Audio playback routing
13. `services/scenes/sceneExecutor.js` — Scene step execution engine

## Step 4: Read Hardware Integration
14. `docs/hardware/gpio_assignments.md` — Pin assignments per character
15. `docs/integration/Hardware-Integration-Layer-Interfaces.md` — HAL architecture
16. `docs/integration/ELEVENLABS_INTEGRATION.md` — AI voice pipeline

## Step 5: Read Servo/Hardware Control Path
17. `services/hardwareService/index.js` — Hardware abstraction layer (controlPart, servo/motor/LED controllers)
18. `python_wrappers/servo_cli.py` — Python servo CLI wrapper (PCA9685 + GPIO)
19. `python_wrappers/pca9685_control.py` — Low-level PCA9685 I2C servo control
20. `python_wrappers/jaw_servo_daemon.py` — Persistent servo daemon for jaw animation
21. `server/calibration/router.js` — Calibration API (nudge, goto, set-min/max, invert, sweep)
22. `server/calibration/adapters/AbsoluteServoAdapter.js` — Absolute servo calibration adapter
23. `server/calibration/adapters/OpenLoopLinearAdapter.js` — Linear actuator calibration adapter
24. `server/calibration/adapters/ContinuousServoAdapter.js` — Continuous servo calibration adapter
25. `server/calibration/store.js` — Calibration profile persistence
26. `server/calibration/planner.js` — Motion planning (drive time, speed caps)
27. `data/calibration_profiles.json` — Current calibration profiles for all parts

## Step 6: Read Calibration & Parts Data
28. `data/character-3/parts.json` — Orlok's hardware part definitions (servo channels, types, configs)
29. `data/character-3/super-powers.json` — Jaw animation and head tracking configs
30. `config/app-config.json` — Currently selected character and theme

## Step 7: Read Scene & Pose System
31. `services/scenes/sceneExecutor.js` — Scene step execution (servo, motor, audio, jaw, head-tracking)
32. `services/poses/poseEngine.js` — Pose execution engine
33. `routes/scenes/api.js` — Scene API routes (CRUD, play, queue)
34. `routes/poses/index.js` — Pose API routes

## Step 8: Read Dashboard & UI Layer
35. `views/conversation/index.ejs` — Dashboard template (panels, controls, websocket chat)
36. `views/setup/calibration.ejs` — Calibration page (servo controls, sweep, bounds, webcam)
37. `views/scenes/studio.ejs` — Animation Studio (three-panel timeline editor)
38. `views/setup/jaw-animation.ejs` — Jaw animation setup page
39. `public/js/manual-controls.js` — Manual controls panel (ES5 IIFE)
40. `public/js/jaw-animation.js` — Jaw animation client controls (ES5 IIFE)

## Step 9: Review Current State
41. Run `git status` to check for uncommitted work
42. Run `git log --oneline -15` for recent history
43. Check `config/app-config.json` for currently selected character
44. Check `data/calibration_profiles.json` for current servo calibration bounds

## Step 10: Consult Shared Memory
Read the memory files at `~/.claude/projects/-home-remote-MonsterBox/memory/MEMORY.md` and any topic files referenced there to build on prior session knowledge.

## Step 11: Hardware Diagnostics (if on RPi)
45. Run `sudo i2cdetect -y 1` to verify PCA9685 is detected at 0x40
46. Run `python3 -c "import smbus2; print('smbus2 OK')"` to verify I2C library
47. Run `systemctl is-active monsterbox.service` to check service status

## Step 12: Report Readiness
Summarize what you've learned:
- Current version and selected character
- Any uncommitted changes or in-progress work
- Key areas of the codebase you're now familiar with
- Hardware state (PCA9685, I2C, service status)
- Current calibration bounds for servo parts
- Any concerns or questions about the current state

This ensures every new Claude Code session starts with full context of the MonsterBox platform — its architecture, hardware control path, calibration system, conventions, and current state.
