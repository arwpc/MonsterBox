# MonsterBox Routes Reference

This document maps all Express routes in MonsterBox 5.5.

## Core Routes

| Path | Router | Description |
|------|--------|-------------|
| `/health` | inline | Health check endpoint |
| `/` | inline | Dashboard redirect |
| `/setup` | inline | Setup hub page |

## Setup Routes

| Path | Router File | Description |
|------|-------------|-------------|
| `/setup/calibration` | `routes/setup/calibration.js` | Hardware calibration UI |
| `/setup/audio` | `routes/setup/audio.js` | Audio configuration |
| `/setup/webcam` | `routes/setup/webcam.js` | Webcam/MJPEG setup |
| `/setup/models` | `routes/setup/models.js` | Hardware model definitions |
| `/setup/super-powers` | `routes/setup/super-powers.js` | Jaw animation config |
| `/setup/system` | `routes/setup/system.js` | System configuration |
| `/setup/poses` | `routes/setup/poses.js` | Pose management |
| `/setup/characters` | `routes/setup/characters.js` | Character CRUD |
| `/setup/character-audio` | `routes/setup/characterAudio.js` | Per-character audio config |

## Feature Routes

| Path | Router File | Description |
|------|-------------|-------------|
| `/audio-library` | `routes/audioLibrary.js` | Audio file management |
| `/video-library` | `routes/videoLibrary.js` | Video file management |
| `/goblin-management` | `routes/goblinManagement.js` | Goblin display control |
| `/conversation` | `routes/conversation.js` | AI conversation mode |
| `/orchestration` | `routes/orchestration.js` | Multi-animatronic control UI |
| `/scenes` | `routes/scenes/index.js` | Scene editor |
| `/scenes/api` | `routes/scenes/api.js` | Scene CRUD API |
| `/first-run` | `routes/firstRun.js` | First-run wizard |
| `/poses` | `routes/poses/index.js` | Pose editor |
| `/ai-settings` | `routes/aiSettingsRoutes.js` | ElevenLabs AI config |

## API Routes

| Path | Router File | Description |
|------|-------------|-------------|
| `/api/calibration` | `server/calibration/router.js` | Calibration API |
| `/api/parts` | `routes/api/partsApi.js` | Parts CRUD |
| `/api/audio-loop` | `routes/api/audioLoopRoutes.js` | Audio loop control |
| `/api/elevenlabs` | `routes/api/elevenLabsApiRoutes.js` | ElevenLabs integration |
| `/api/random-poses` | `routes/api/randomPoseRoutes.js` | Random pose generator |
| `/api/orchestration` | `routes/api/orchestrationRoutes.js` | Orchestration API |
| `/api/system` | `routes/api/systemRoutes.js` | System info/control |
| `/api/poses` | `routes/api/sceneEditorApi.js` | Scene editor data API |
| `/api/sounds` | `routes/api/sceneEditorApi.js` | Audio files for scenes |
| `/api/goblins` | inline (server.js) | Goblin registration |

## Debug/Internal Routes

| Path | Description |
|------|-------------|
| `/__errors` | Error statistics |
| `/__errors/reset` | Reset error stats |
| `/__audio/active-device` | Active audio device |
| `/__audio/last-play` | Last playback info |
| `/__audio/last-ai` | Last AI interaction |
| `/__audio/tools` | Audio diagnostic tools |
| `/__kill` | Graceful shutdown (test mode only) |

## Audio Health Routes

| Path | Description |
|------|-------------|
| `/api/audio/health` | Audio system health |
| `/api/audio/info` | PipeWire device info |
| `/api/audio/test` | Audio playback test |
| `/api/audio/reset` | Reset audio system |
| `/api/audio/stop-all` | Stop all playback |

## Static Assets

| Path | Directory | Description |
|------|-----------|-------------|
| `/` | `public/` | Static web assets |
| `/data` | `data/` | Character data/media |

---

*Generated from server.js route analysis*
