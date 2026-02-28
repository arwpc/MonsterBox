# API Reference

MonsterBox exposes a REST API over HTTP on port 3000. There is **no authentication** — MonsterBox is a local-network animatronic control tool, not an internet-facing service. All endpoints are accessible to any device on the MonsterNet network.

Base URL: `http://<host>:3000`

---

## Parts API

### List All Parts
```http
GET /api/parts
```

!!! warning "Response Format"
    Returns a **raw JSON array**, not a `{ success, parts }` wrapper. This is a known inconsistency with other endpoints.

```bash
curl http://localhost:3000/api/parts
```

### Get Single Part
```http
GET /api/parts/:id
```
Returns `{ success: true, part: {...} }`.

### Test Hardware Part
```http
POST /api/parts/:id/test
```
Dispatches a type-aware hardware test (servo sweep, motor pulse, LED flash, etc.).

---

## Scenes API

Base path: `/scenes/api/`

### List Scenes
```http
GET /scenes/api/
```
Returns `{ success: true, scenes: [...] }` for the currently selected character.

### Create Scene
```http
POST /scenes/api/
Content-Type: application/json

{ "name": "My Scene", "steps": [...] }
```

### Update Scene
```http
PUT /scenes/api/:id
Content-Type: application/json
```

### Delete Scene
```http
DELETE /scenes/api/:id
```

### Reorder Scenes
```http
POST /scenes/api/reorder
Content-Type: application/json

{ "orderedIds": [5, 3, 1, 8] }
```
Persists the scene library display order.

### Play Scene
```http
POST /scenes/api/:id/play
```
Executes a single scene (all steps in order, respecting `concurrent` flags).

### Start Queue Loop
```http
POST /scenes/api/queue/start-config
Content-Type: application/json

{ "mode": "loop_queue", "scenes": [{ "sceneId": 1 }, { "sceneId": 3 }] }
```

### Stop Queue
```http
POST /scenes/api/queue/stop
```

#### Scene Step Types
`servo`, `motor`, `linear-actuator`, `light/led`, `audio`, `sayThis`, `askAI`, `goblin-video`, `wait`, `sensor`, `pose`, `hardware`, `jaw-animation`, `head-tracking`

The `concurrent` flag on a step means "run THIS step and the NEXT step simultaneously."

---

## Poses API

### List Poses
```http
GET /poses/api/poses
```
Returns poses for the currently selected character.

### Create Pose
```http
POST /poses
Content-Type: application/json
```

### Update Pose
```http
PUT /poses/:id
Content-Type: application/json
```

### Delete Pose
```http
DELETE /poses/:id
```

---

## AI / ElevenLabs API

All AI voice services use ElevenLabs as the single provider.

### Generate and Play TTS
```http
POST /api/elevenlabs/generate-and-play
Content-Type: application/json

{ "text": "Hello from MonsterBox", "characterId": 3 }
```
Generates speech with the character's configured voice and plays it on their assigned speaker.

```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'
```

### List Voices
```http
GET /api/elevenlabs/voices
```

### STT Capabilities
```http
GET /api/elevenlabs/stt/capabilities
```

### Realtime STT Status
```http
GET /api/elevenlabs/stt/realtime/status
```

### WebSocket Ports

| Port | Service | Protocol |
|------|---------|----------|
| 8795 | ElevenLabs Conversational AI | WebSocket |
| 8778 | Head Tracking | WebSocket |

---

## Jaw Animation API

Base path: `/setup/jaw-animation/api/jaw-animation/:charId`

### Get Jaw Config
```http
GET /setup/jaw-animation/api/jaw-animation/:charId
```
Returns jaw animation config and available servos for the character.

### Save Jaw Config
```http
POST /setup/jaw-animation/api/jaw-animation/:charId
Content-Type: application/json

{
  "enabled": true,
  "servoPartId": "10",
  "sensitivity": 4,
  "smoothing": 0.2,
  "volumeThreshold": 0.02,
  "attackTime": 30,
  "releaseTime": 80,
  "useBandpassFilter": true,
  "useAGC": true,
  "quantizationLevels": 10,
  "preset": "speech"
}
```

### Drive Jaw
```http
POST /setup/jaw-animation/api/jaw-animation/:charId/drive
Content-Type: application/json

{ "amplitude": 0.5 }
```
Drives the jaw servo to a specific amplitude (0.0 - 1.0).

### Poll Audio Levels
```http
GET /setup/jaw-animation/api/jaw-animation/:charId/audio-levels
```
Returns real-time audio levels during playback.

### Test TTS with Jaw
```http
POST /setup/jaw-animation/api/jaw-animation/:charId/test-tts
Content-Type: application/json

{ "text": "Hello from the animatronic" }
```
Returns a jaw timeline for UI visualization.

---

## Calibration API

### Nudge Part Position
```http
POST /api/calibration/:partId/nudge
Content-Type: application/json

{ "delta": 0.1 }
```
Nudges a servo/actuator by a relative amount. Returns `{ currentP }`.

### Go to Position
```http
POST /api/calibration/:partId/nudge
Content-Type: application/json

{ "p": 0.5 }
```
Moves to an absolute position (0 = min, 0.5 = center, 1 = max).

---

## Audio API

### Audio Health
```http
GET /api/audio/health
```

### Audio Info
```http
GET /api/audio/info
```

### Test Audio
```http
POST /api/audio/test
```

### Stop All Playback
```http
POST /api/audio/stop-all
```

---

## Audio Library API

Base path: `/audio-library`

The audio library manages a shared collection of audio files for all MonsterBox characters. Files are stored in `data/audio-library/files/` with metadata in `data/audio-library/library.json`.

On startup, the service automatically rescans the files directory and repairs any entries with missing metadata (format, fileSize, tags, etc.). The library.json is the source of truth for metadata; the files directory is the source of truth for actual audio files.

### Get Audio Library
```http
GET /audio-library/api/library?search=&category=&format=&sortBy=uploadedAt&favorite=false
```
Returns all audio files with optional filtering. Response includes `audio` array, `categories`, `totalFiles`, `totalSize`.

### Upload Audio Files
```http
POST /audio-library/api/upload
Content-Type: multipart/form-data
```
Field name: `audioFiles` (up to 10 files, 50MB each). Supported formats: mp3, wav, ogg, m4a, aac, flac.

### Get Audio File Details
```http
GET /audio-library/api/audio/:id
```

### Update Audio Metadata
```http
PUT /audio-library/api/audio/:id
Content-Type: application/json

{ "title": "...", "description": "...", "tags": [...], "category": "...", "favorite": true }
```

### Delete Audio File
```http
DELETE /audio-library/api/audio/:id
```

### Play Audio on Character Speaker
```http
POST /audio-library/api/audio/:id/play
Content-Type: application/json

{ "characterId": 3, "volume": 80, "speakerPartId": "optional", "loop": false }
```

### Download Audio File
```http
GET /audio-library/api/audio/:id/download
```

### Audio Selection (for scenes/poses)
```http
GET /audio-library/api/audio-select?search=&category=&sortBy=title
```

### Stop All Audio
```http
POST /audio-library/api/audio/stop-all
```

---

## Video Library API

Base path: `/video-library`

The video library manages video files for MonsterBox Goblin deployment. Files are stored in `data/video-library/files/` with metadata in `data/video-library/library.json`.

On startup, the service automatically rescans the files directory and adds entries for any video files not yet tracked in the library.

### Get Video Library
```http
GET /video-library/api/library?search=&category=&format=&sortBy=uploadedAt
```
Returns `videos` array, `categories`, `totalFiles`, `totalSize`.

### Upload Video Files
```http
POST /video-library/api/upload
Content-Type: multipart/form-data
```
Field name: `videoFiles` (up to 5 files, 500MB each). Supported formats: mp4, avi, mkv, mov, wmv, flv, webm, m4v.

### Get Video Details
```http
GET /video-library/api/video/:id
```

### Update Video Metadata
```http
PUT /video-library/api/video/:id
Content-Type: application/json

{ "title": "...", "description": "...", "category": "...", "tags": [...], "favorite": true }
```

### Delete Video
```http
DELETE /video-library/api/video/:id
```

### Stream Video
```http
GET /video-library/api/video/:id/stream
```
Supports HTTP range requests for seeking.

### Download Video
```http
GET /video-library/api/video/:id/download
```

### Get Video Thumbnail
```http
GET /video-library/api/video/:id/thumbnail
```

### Deploy Video to Goblin
```http
POST /video-library/api/deploy
Content-Type: application/json

{ "videoId": "...", "goblinId": "..." }
```

### Play Video on Goblin
```http
POST /video-library/api/video/:id/play-on-goblin
Content-Type: application/json

{ "goblinId": "...", "loop": true }
```

### Video Library Statistics
```http
GET /video-library/api/stats
```

---

## Goblin API

Goblins are managed through the MonsterBox server. Individual Goblins run their own API on port 3001.

### List Goblins
```http
GET /api/goblins
```

### Register Goblin
```http
POST /api/goblins/register
```

### Scan Goblin Videos
```http
POST /goblin-management/api/goblins/:id/scan-videos
```

### Playlist CRUD
```http
GET /goblin-management/api/playlists
POST /goblin-management/api/playlists
```

---

## System & Config API

### Health Check
```http
GET /health
```
Returns `{ status, version, time }`.

### System Console
```http
GET /api/system/console
```

### Performance Presets
```http
GET /api/system/presets
POST /api/system/presets/apply
```

### Get Config
```http
GET /api/config
```

### Set Theme
```http
POST /api/config/theme
Content-Type: application/json
```
19 themes available: 2 default (light/dark) + 17 Bootswatch themes.

### Select Character
```http
POST /setup/characters/api/select
Content-Type: application/json

{ "characterId": 3 }
```

---

## Dashboard / Conversation API

### TTS Playback
```http
POST /conversation/say
Content-Type: application/json

{ "text": "Hello", "characterId": 3 }
```

### AI Conversation
```http
POST /conversation/ask-ai
```

### Play Audio File
```http
POST /conversation/play-audio
```

### Manual Controls Layout
```http
GET /conversation/api/manual-controls-layout
POST /conversation/api/manual-controls-layout
DELETE /conversation/api/manual-controls-layout
POST /conversation/api/manual-controls-layout/rename
```

---

## Diagnostic Endpoints

These are prefixed with `__` and intended for development and debugging.

| Endpoint | Description |
|----------|-------------|
| `GET /__errors` | Server error statistics |
| `POST /__errors/reset` | Reset error stats |
| `GET /__audio/active-device` | Active audio device |
| `GET /__audio/last-play` | Last playback telemetry |
| `GET /__audio/last-ai` | Last AI playback telemetry |
| `GET /__audio/tools` | Available audio tools (mpg123, ffmpeg, pw-play) |
| `GET /__kill` | Terminate server (test use only) |
