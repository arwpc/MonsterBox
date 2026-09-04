# Orchestration — Fleet Command Center

The orchestration subsystem monitors and runs the **entire animatronic network** from one
page (`/orchestration`). It is HTTPS-only inter-node, uses no WebSockets/GraphQL and no npm
dependencies beyond the existing stack (Express/EJS/Bootstrap 5 + `axios`/`https`).

## Architecture

Three code surfaces plus discovery:

| Layer | File | Role |
|-------|------|------|
| Service | `services/orchestrationService.js` | The single inter-node gateway. Broadcasts, per-node HTTPS via `httpNode()`, SSH ops, success aggregation, fleet health, superpowers, emergency stop, volume. |
| Routes | `routes/api/orchestrationRoutes.js` | REST surface mounted at `/api/orchestration`. Thin validators over the service + inline per-node say/ask/audio/webcam proxies. `MB_TEST_MODE` short-circuits for offline testing. |
| Web | `routes/orchestration.js` → `views/orchestration/index.ejs` | The Fleet Command Center UI. |
| Discovery | `services/nodeDiscoveryService.js` | mDNS (`_monsterbox._tcp` via avahi) overlay onto `config/animatronics.json`; manual IP pins persisted to `data/manual-nodes.json`. |

All inter-node calls use `https://` through a self-signed-tolerant agent
(`https.Agent({ rejectUnauthorized: false })`). Every dispatch resolves targets through
`getAnimatronics()` (config overlaid with live discovery) so behavior is
character-independent — nothing is hardcoded to a character.

### Live topology
`getAnimatronics()` → `nodeDiscoveryService.overlay(config)`: static config is the fallback
identity; a live-discovered online node wins on ip/hostname/version; manual pins beat config
but lose to a live discovery. `getControllableAnimatronics(ids?)` further filters to valid
hosts, (optionally) trusted nodes, and an id subset — this is what every broadcast/SSH site
uses so untrusted/invalid nodes are shown but never driven.

## Key endpoints (`/api/orchestration`)

| Method + path | Purpose |
|---------------|---------|
| `GET /status` | Per-node online flags + `{total, online, offline}`. |
| `GET /nodes` | Live registry with `source` (config/discovered/manual), `status`, `trusted`, `avahiAvailable`. |
| `POST /nodes/manual`, `DELETE /nodes/manual/:id` | Pin / forget a node by IP (persisted). |
| `GET /fleet-health` | Aggregated per-node version, CPU count, RSS, uptime, servo latency. |
| `GET /animatronic/:id/status` | Single-node health. |
| `POST /superpower/:feature` | `{enabled, ids?}` — fleet toggle of `lurk\|jaw\|head\|motion\|mute\|idle`. Each node acts on its own selected character. |
| `POST /start-all-queue-loops`, `POST /stop-all-queue-loops` | Fleet scene-queue transport. |
| `POST /emergency-stop` | Halt everything: queue emergency-stop + stop-all-audio + disable random poses + mute. |
| `PUT /volume` | `{volume, ids?}` — master speaker volume (0–100). |
| `POST /say-all`, `POST /animatronic/:id/{say,ask-ai,play-audio,stop-audio}` | Speech / audio. |
| `GET /animatronic/:id/webcam-snapshot` | ONE JPEG from `services/mjpegFrameCache.js` — what the node wall polls (see below). |
| `GET /animatronic/:id/webcam-stream` | Same-origin MJPEG proxy — the modal only (see below). |
| `POST /reboot/animatronics`, `POST /restart-services` | SSH lifecycle (host-validated). |

Broadcast responses are `{success, total, successful, failed, results}` — `success` is
`true` only when at least one node accepted the command.

## Webcam streaming

Three-hop MJPEG chain: node `mjpg-streamer` (127.0.0.1:8090, `boundarydonotcross`) → the
node's own Express webcam proxy → the orchestration same-origin proxy
(`GET /animatronic/:id/webcam-stream`) → the browser `<img>`.

The orchestration proxy **forwards the upstream `Content-Type` verbatim** so the multipart
boundary matches the bytes on the wire, and uses `timeout: 0` for the endless stream body
(cleanup on `req.on('close')`). Serving the page over HTTPS and proxying same-origin also
avoids the mixed-content block that a direct `http://node:8090` `<img>` would hit.

**The wall does not stream.** An MJPEG response never ends, so six live `<img>` streams held
all six of the browser's per-host HTTP/1.1 connections and every `fetch()` queued behind
them — the fleet pill read "1 / 6 online" while `curl` got `fleet-health` in 0.3 s. Cards
poll `GET /animatronic/:id/webcam-snapshot` instead: one JPEG, served from
`services/mjpegFrameCache.js`, which keeps ONE upstream stream per node, answers from the
newest frame in RAM (~20 ms warm), idles out after 30 s, and remembers a failed camera for
15 s so a dead input fails in a millisecond rather than re-probing for ~4 s. The page keeps
at most **two** snapshot requests in flight (12 s watchdog), leaving four connections for
actions and the health poll. Only the click-to-expand modal opens a true live stream — one
card, one connection.

## Latency

Every node handles a fleet request in 2–5 ms; the seconds operators saw were connection
setup. Fixed 2026-09-04 (measurements in `CHANGELOG.md`):

- **Keep-alive 65 s** on every listener (`server.js` `tuneKeepAlive`). Node's default of
  5 s closed the orchestrator's sockets to the peers between the 15 s health poll and
  between clicks, so each fan-out paid six TCP+TLS handshakes over Wi-Fi (200–1230 ms)
  instead of reusing warm sockets (56–65 ms). The orchestrator's `https.Agent` honours the
  server's `Keep-Alive: timeout=` hint, so the fix is server-side and needs every node on it.
- **Fleet-health memo** (`FLEET_HEALTH_MEMO_MS = 1500`, keyed by id-set) with in-flight
  coalescing, and a **prewarm** kicked off by `GET /orchestration` as the HTML is sent, so
  the page's first `fleet-health` is answered from the collection already in flight.
  The three per-node probes (`info`, `memory`, `telemetry`) leave together.
- **Paint from the roster first**: `/nodes` is local; the wall draws six named cards in a
  "checking…" state immediately and health lights the dots as it lands.
- **Wi-Fi power-save off** on every node (`scripts/node-baseline/wifi-powersave-off.sh`);
  the radio's doze added 10–100 ms to the first packet after any idle gap.

## UI (`views/orchestration/index.ejs`)

Self-contained: inline `<style>` + one ES6 controller. Sticky command bar (fleet-health
pill, six superpower masters, master volume, Start/Stop loops, Say-to-all, node-subset
targeting, **EMERGENCY STOP**), a responsive **node wall** of cockpit cards (webcam
snapshot, source/trust chip, health line, Say/Ask/audio/Auto-AI), a click-to-expand webcam
modal, a goblin row, a rolling command log, and a **Discovery panel** (mDNS state +
pin-a-node form). Cards **patch incrementally** on the 15s poll so webcam `<img>` elements
and focused inputs are never destroyed. Destructive actions confirm first.

## Security

- **Host validation** — `isValidHost()` gates every SSH/shell use of an `ip` (which can come
  from untrusted mDNS discovery), closing command injection via spoofed nodes.
- **Trust enforcement** — `MB_NODE_TOKEN` produces a per-node `trusted` flag; set
  `MB_NODE_TOKEN_ENFORCE=1` to exclude untrusted nodes from the control/SSH fan-out (still
  shown in `/nodes`). Off by default so a partial token rollout can't drop real nodes.
- ⚠️ **SSH password** — `services/orchestrationService.js` keeps a committed fallback so the
  fleet keeps working, but it is a leaked credential. Rotate it and set
  `MONSTERBOX_SSH_PASSWORD` in each node's service environment; a startup warning flags when
  the fallback is in use.

## Testing

- System: `npm run test:system:orchestration` (41 assertions). Command endpoints have
  `MB_TEST_MODE` short-circuits so their happy paths are deterministic offline — run against
  a test-mode server, not production, or they will drive the live fleet.
- Browser: `npm run test:browser:orch` (13 tests, incl. zero-console-error). Playwright
  spawns its own `MB_TEST_MODE` server on :3200.
- See also `docs/development/NODE-DISCOVERY.md` and `docs/setup/NODE-DISCOVERY-VALIDATION.md`.
