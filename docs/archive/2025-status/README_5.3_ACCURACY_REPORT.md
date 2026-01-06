# README 5.3 Accuracy Verification Report

Date: 2025-10-20
Scope: Verify historical README (restored) vs current code/docs, and validate new concise README.md

## Summary
- Historical README restored verbatim at docs/archive/README_5.3_FULL_HISTORICAL.md (2640 lines)
- Root README.md updated for MonsterBox 5.3 with accurate, concise guidance
- Minor mismatch noted: runtime banner in server.js logs "MonsterBox 5.2"; README targets 5.3

## Findings

1) Server entry point and runtime
- Entry: server.js (repo root)
- Port: config.port || 3000
- Banner: "🎭 MonsterBox 5.2 server running on port ..." (needs bump to 5.3 in code)

2) Audio stack
- PipeWire + WirePlumber: present, health endpoints mounted
- Audio Health endpoints: /api/audio/health, /api/audio/info, /api/audio/test
- TTS endpoint: /api/elevenlabs/generate-and-play (plays via Character speaker)
- Microphone tests are server-side; matches requirement to avoid getUserMedia for STT

3) Webcam
- MJPEG-only via mjpg-streamer on :8090 confirmed in docs and code (webcam routes exist)
- README includes verification commands for headers and JPEG boundary/data

4) Goblin video system
- Goblin present under goblin/ with Express API on :3001
- Endpoints: /play-video, /stop-all, /queue/*
- mpvController config: DRM vo, v4l2m2m/-copy hw decode; display FPS hints supported
- Systemd unit: goblin/systemd/goblin.service present with tuned env

5) Network/roles
- Addresses for animatronics and goblins match working docs

6) Testing
- /test and /tests trees present; Playwright config files present
- README includes commands for unit and Playwright (Firefox headless)

## Recommended follow-ups (code/doc small nits)
- Update server.js banner from 5.2 to 5.3 (log string only)
- Ensure docs/deployment/README.md links surfaced in the root README remain current
- Optionally link docs/MonsterBox5.3.md from the root README (already present)

## Conclusion
Root README.md accurately reflects the current system (5.3 target) and points to detailed docs. Historical README is preserved verbatim in repo for reference.

