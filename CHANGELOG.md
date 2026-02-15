# Changelog

All notable changes to MonsterBox are documented in this file.

## [6.0.0] - 2026-02-14 — Character Independence & Dynamic Versioning

### Character Independence
- Removed all hardcoded character names (Orlok, PumpkinHead, Skulltalker, Coffin Breaker) from services, controllers, routes
- Removed all numeric ID defaults (`|| 1`, `|| 3`, `|| 4`) — missing characterId now returns 400 errors
- Generalized ElevenLabs agent template (removed Orlok-specific template)
- Removed character-name comments from quick response agent ID keys
- Cleaned up character-specific comments in STT, jaw animation, and filter presets

### Dynamic Versioning
- All version displays now sourced from `package.json` (single source of truth)
- Server health endpoint uses `pkg.version` instead of hardcoded string
- EJS templates use `res.locals.appVersion` middleware for dynamic version in titles, footers, and navigation
- Server startup log includes dynamic version
- Removed hardcoded "5.5" from all JS services, routes, public scripts, shell scripts, and install tooling

### AI Service Audit
- Audited TTS, STT, and AI implementations for duplication
- Confirmed single canonical TTS service (`elevenLabsTTSService.js`)
- Confirmed three distinct STT approaches (batch, polling, WebSocket) — no consolidation needed
- No duplicate AI service code found

### Documentation
- Updated README.md with v6.0.0 release notes
- Updated CHANGELOG.md with v6.0.0 entry
- Created `docs/v6-phase1-checklist.md`, `docs/v6-phase2-ai-audit.md`, `docs/v6-deferred.md`

### Test Results
- 140 passing, 1 failing (pre-existing jaw-animation hardware timeout), 7 skipped

## [5.5.2] - 2026-02-12 — Jaw Animation Sync Fix

### Jaw Animation
- **ChatterPi-inspired sync fix**: Restructured `driveJawFromAudioBuffer()` to compute angle synchronously in each audio frame — eliminates async gap that caused polling to read stale/zero angles
- Preload config, parts, and guardrails once before frame loop (no per-frame async lookups)
- Fire-and-forget servo commands (non-blocking, like ChatterPi's `self.jaw.angle = jawTarget`)
- Attack/release envelope ramp limiting in `calculateJawAngle()` for natural jaw motion
- Tuned default parameters: sensitivity=4, smoothing=0.2, attackTime=30, releaseTime=80
- Fixed double-nested `super-powers.json` bug (`jawAnimation.jawAnimation.{...}` → `jawAnimation.{...}`)
- Added `simulateJawDrive()` for test mode operation without hardware
- Improved audio level meter scaling (audio: ×400, jaw: sqrt curve)
- Added cache-busting to client JS (`?v=<%= Date.now() %>`)

### Documentation
- Added Jaw Animation section to README with algorithm description, config table, and API examples
- Updated CHANGELOG with v5.5.2 release notes

## [5.5.1] - 2026-02-07 — Gold Release

### ElevenLabs AI Overhaul
- Upgraded TTS default to `eleven_flash_v2_5` (~75ms latency) across all services
- Upgraded STT default to `scribe_v2` for batch transcription
- Created `scribe_v2_realtime` WebSocket STT service (~150ms streaming latency)
- Implemented per-character TTS config via `getTTSConfigForCharacter(characterId)` in `aiConfigStore.js`
- Each character stores voice/model settings in `data/character-{N}/ai-config/tts-config.json`
- Replaced HTTP loopback calls with direct `elevenLabsTTSService` + `serverPlaybackService` calls
- Scene "Ask AI" steps now use real ElevenLabs Conversational AI agents
- Removed all legacy model aliases (`scribe_v1`, `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`)

### Dashboard Consolidation
- `/conversation` route now redirects to `/` — conversation IS the dashboard
- Jaw Animation moved to dedicated page at `/setup/jaw-animation`
- Simplified navigation: Dashboard, Live, Setup subpages

### Test Fixes
- Fixed `conversation.spec.js` to navigate to `/` instead of `/conversation`
- Fixed `conversation-refactor.spec.js` to expect "Dashboard" heading
- Fixed `jaw-animation.spec.js` to enable jaw toggle before slider interaction tests
- Fixed `setup-parts.spec.js` to check DOM-attached elements instead of visibility
- Fixed `test-hardware-fix.js` broken import path

### Documentation
- Complete README rewrite with gold release notes and test results table
- Created CHANGELOG.md (this file)
- Rewrote all AI/ElevenLabs documentation (5 doc files)
- Updated test documentation (3 files)
- Removed legacy model options from TTS UI dropdown
- Removed legacy STT compatibility code from `elevenLabsSTTService.js`
- Archived outdated STT format report
- Updated all version references from 5.0/5.2 → 5.5
- Updated SESSION_PROMPT.md with current architecture
- Archived stale v5.4.0 QUICK_START_NEXT_AGENT.md

### Test Results (257 total)
- **Mocha**: 148 passing, 34 pending, 6 failing (jaw calibration — hardware-environment-dependent)
- **Playwright**: 109 passing, 7 skipped (deprecated), 0 failing
- Stepper motors verified via real GPIO (lgpio backend)
- All ElevenLabs service tests passing
- All scene execution tests passing

## [5.5.0] - 2025-12-15

### Major Features
- Models system: reusable default configurations per part type
- Calibration UI redesign with Model/Overrides tab
- ContinuousServoAdapter for head-on-swivel servos
- Comprehensive Playwright deep testing framework (8 test suites)
- Orchestration hardening with per-animatronic and global timeouts

### Hardware
- Linear actuator calibration with min/max positioning
- BTS7960 H-bridge motor driver support
- Power toggle integration for hardware safety
- Stepper motor support via Python CLI wrapper

### Goblin Video System
- MPV-based video playback for Pi 3B+/4B display units
- Queue management with loop modes
- REST API for remote control and immediate playback
- Playlist CRUD and distribution (Facehugger deployment)
- MonsterBox Step integration for video triggers

### Infrastructure
- GitHub Actions CI/CD for automated testing
- Dedicated test port (3123) for CI isolation
- MB_TEST_MODE environment flag for safe testing
- PipeWire/WirePlumber audio system (replaced ALSA/PulseAudio)

## [5.4.0] - 2025-10-20

### Features
- Goblin system standardization
- Console blanker for kiosk display
- Video dropdown in Goblin management UI
- Multi-animatronic deployment tooling

## [5.3.0] - 2025-09-15

### Features
- Conversation mode with AI chat interface
- Webcam streaming via mjpg-streamer
- Scene orchestration engine
- Pose management system

## [5.2.0] - 2025-08-01

### Features
- Initial ElevenLabs TTS/STT integration
- Noisy environment STT presets
- Groundbreaker character setup
- Audio library management

## [5.0.0] - 2025-06-01

### Initial Release
- Single-node animatronic control system for Raspberry Pi 4B
- Express/EJS web application
- Hardware service layer for servos, motors, LEDs, sensors
- Character and parts CRUD
- Basic GPIO control via pigpio
