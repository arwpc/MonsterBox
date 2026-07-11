# API Testing

## Overview

MonsterBox has **no authentication layer** — no JWT, no sessions, no roles. It is a
local-network animatronic control tool, not an internet-facing service, so every
endpoint is reachable by any device on the LAN (see `docs/api/api-documentation.md`).
API testing therefore focuses on route correctness, JSON contracts, type-aware
hardware dispatch, and character-independence — not on tokens or access control.

API/system tests are written with **Mocha + Chai** (some use `supertest`, some use
raw Node `http`) and run against a running MonsterBox app over plain HTTP on the
loopback test port **3100**. The main server opens this listener automatically at
startup (`server.js` binds `127.0.0.1:3100`), so tests just point `BASE_URL` at it.

## Test Layout

| Directory | Purpose | Runner |
|-----------|---------|--------|
| `tests/system/` | HTTP/API integration tests against the running app | Mocha (`MB_TEST_MODE=1`) |
| `tests/ai/` | AI endpoint tests (Ask AI, conversation service) | Mocha |
| `tests/unit/` | Unit-level API tests (calibration, webcam) | Mocha |
| `tests/pact/` | Per-character contract suite | Mocha |
| `tests/hardware/` | Real-GPIO calibration tests | Mocha (needs hardware) |

Global setup lives in **`tests/setup.js`** (loaded via `--require tests/setup.js`):
it sets `NODE_ENV=test` and injects a dummy `ELEVENLABS_API_KEY` so AI services
initialize without real credentials. There is no `.env.test`, `setupTests.js`, or
`test-helper.js` — `tests/setup.js` is the single setup file.

## Running API / System Tests

```bash
# All system (HTTP/API) tests — MB_TEST_MODE=1, BASE_URL=http://localhost:3100
npm run test:system

# Focused system suites
npm run test:system:parts     # /api/parts + hardware dispatch
npm run test:system:audio     # audio + audio-setup + audio-library
npm run test:system:scenes    # scenes + animation studio
npm run test:system:jaw       # jaw animation
npm run test:system:head      # head animation
npm run test:system:dashboard
npm run test:system:models
npm run test:system:video
npm run test:system:movement
npm run test:system:orchestration

# AI endpoint tests
npm run test:ai               # everything under tests/ai
npm run test:system:ai        # ai-audio + ask-ai + conversation-service

# Unit-level API tests
npm run test:unit
npm run test:unit:calibration

# Per-character contract suite
npm run test:pact

# Ad-hoc filtering (Mocha --grep)
npm run test:system -- --grep "parts"
```

Every test script defaults `BASE_URL` to `http://localhost:3100`; override it to
target another running instance (e.g. `BASE_URL=http://localhost:3000` for the live
HTTPS server, or the running service on the Pi).

## How a System Test Talks to the App

System tests hit real routes over HTTP. Two equivalent styles are in use:

```js
// supertest style (tests/system/orchestration.test.js, models.test.js, ...)
import request from 'supertest';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const res = await request(BASE_URL).get('/api/parts').expect(200);

// raw http style (tests/system/parts-api.test.js)
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const res = await apiGet('/api/parts');   // small http.get helper
```

Under `MB_TEST_MODE=1` the server downgrades unexpected 5xx responses to benign
`200`/JSON so UI navigation stays stable during tests. For error cases, assert on the
JSON `success` field rather than relying on the status code alone.

## Representative Endpoints Exercised

Hardware — type-aware dispatch (there are **no** per-type control endpoints like
`/api/hardware/servo`):
- `GET /api/parts` — raw array of parts for the current character
- `GET /api/parts/:id` — `{ success, part }`
- `POST /api/parts/:id/test` — test a servo/motor/led/sensor/etc., dispatched by part type
- `GET /api/parts/:id/gpio-read` — direct GPIO register read

Scenes — mounted under `/scenes/api` (not `/api/scenes`):
- `GET /scenes/api/` — `{ success, scenes }`
- `POST /scenes/api/:id/play` — execute one scene
- `POST /scenes/api/reorder` — persist scene library order
- `POST /scenes/api/queue/start-config` — start queue loop

Characters:
- `GET /setup/characters/api/characters` — list characters
- `POST /setup/characters/api/select` — set the selected character

AI / audio:
- `POST /api/elevenlabs/tts/generate`, `POST /api/elevenlabs/stt/transcribe`
- `POST /conversation/api/ask-ai`

## Diagnostic Endpoints (used by tests / monitoring)

`server.js` exposes lightweight, unauthenticated diagnostic endpoints that tests use
to observe server state:

- `GET /health` — `{ status, version, time }` (version read dynamically from `package.json`)
- `GET /__errors` / `POST /__errors/reset` — structured server-error counter
- `GET /__audio/active-device` — resolved output device for the current character
- `GET /__audio/last-play`, `GET /__audio/last-ai` — last playback telemetry
- `GET /__audio/tools` — availability of `mpg123` / `ffmpeg` / `pw-play`
- `GET /__kill` — test-only shutdown (registered **only** under `MB_TEST_MODE` / `NODE_ENV=test`)

## Troubleshooting

- **Connection refused on :3100** — the app isn't running (or its test-port listener
  didn't bind). Start the app with `npm start`, or run where `monsterbox.service` is
  already up, then retry.
- **Tests hang after passing** — Mocha needs the `--exit` flag; all `test:*` scripts
  already include it.
- **AI tests fail on a missing key** — `tests/setup.js` injects a dummy
  `ELEVENLABS_API_KEY`; real TTS/STT generation requires a valid key in `.env`.
- **Unexpected `200` on an error case** — expected under `MB_TEST_MODE=1`; assert on
  the JSON `success` flag instead of the HTTP status.
