# MonsterBox Deep Learning — Full Codebase Onboarding

Perform a comprehensive onboarding of the MonsterBox codebase. Read all key documentation and code files, then summarize your understanding and readiness to the user. Follow these steps:

## Step 1: Read Core Documentation
Read these files completely to understand the project:
1. `CLAUDE.md` — Project rules, architecture constraints, code style, session checklists
2. `README.md` — Feature overview, quick start, API examples, network map
3. `CHANGELOG.md` — Version history and recent changes
4. `package.json` — Dependencies, scripts, version
5. `install.sh` — System dependencies and setup process

## Step 2: Read Architecture Files
6. `server.js` — Entry point, route mounting, middleware, startup sequence
7. `docs/SESSION_PROMPT.md` — Detailed developer briefing with character/parts inventory
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

## Step 5: Review Current State
17. Run `git status` to check for uncommitted work
18. Run `git log --oneline -10` for recent history
19. Check `config/app-config.json` for currently selected character

## Step 6: Consult Shared Memory
Read the memory files at `~/.claude/projects/-home-remote-MonsterBox/memory/MEMORY.md` and any topic files referenced there to build on prior session knowledge.

## Step 7: Report Readiness
Summarize what you've learned:
- Current version and selected character
- Any uncommitted changes or in-progress work
- Key areas of the codebase you're now familiar with
- Any concerns or questions about the current state

This ensures every new Claude Code session starts with full context of the MonsterBox platform, its architecture, conventions, and current state.
