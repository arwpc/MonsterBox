# Zero-Config Node Discovery (mDNS / Bonjour)

**Status:** Phase 1–3 shipped in v8.4.1. Phases 4–5 are follow-ups (see end).

## Problem

`config/animatronics.json` is the topology source of truth, and each entry carries a
hand-typed `ip`:

```json
{ "id": 1, "name": "PumpkinHead", "hostname": "pumpkinhead",
  "ip": "192.168.8.150", "port": 3000, "characterId": 1, "agentId": "…" }
```

`orchestrationService` builds every inter-node call as `https://${ip}:${port}/…`, so the
whole multi-node story depends on that static IP. DHCP breaks it the moment a lease
changes, and adding a node means hand-editing a file on every peer. That is the single
biggest "specific to one operator" wall in the project.

## Goal

Bring a new node online by **naming it during setup and letting DHCP do its job** — no IPs
typed anywhere. The node advertises itself on the LAN; every other node discovers it and
shows it come alive, in real time.

## Design

### Separate identity from location

`animatronics.json` today conflates two concerns. We split them:

| Concern | Where it lives after this change |
|---|---|
| **Identity + config** — `id`, `name`, `characterId`, `agentId`, `defaultSceneId` | stays in `animatronics.json` (rarely changes) |
| **Network location** — `ip`, `hostname`, `port` | **discovered at runtime**; the `ip` in the file becomes a *fallback/override* only |

### Transport: system avahi via `child_process` (no new npm dependency)

Raspberry Pi OS ships **avahi-daemon**. We drive it the same way the project drives the
Python hardware wrappers — through `child_process` — so **no npm dependency is added** and
nothing new is bundled. mDNS is a *discovery* mechanism, not a new data transport: the
actual control path stays exactly as today (HTTPS via `axios`). There is no persistent
socket held in the Node process.

- **Advertise** — write `/etc/avahi/services/monsterbox.service`; avahi hot-reloads it.
  Renaming a node = rewrite the file. `<name>.local` resolution comes free.
- **Discover** — `avahi-browse -rpt _monsterbox._tcp` (parsable, resolve, one-shot),
  parsed into the registry. Re-run on an interval; combine with a health-ping so a dropped
  multicast packet doesn't evict a live node.

### Service record

- **Service type:** `_monsterbox._tcp`
- **TXT records:** `id=<stable id>`, `character=<name>`, `ver=<package.json version>`,
  `token=<sha256(shared-secret)[:16]>` (only present when `MB_NODE_TOKEN` is set)

Nodes are keyed by the **stable `id`**, never the display name (two "Skelly" nodes must not
collide). The name is display-only.

### Advertisement service-file template

```xml
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">MonsterBox %h</name>
  <service>
    <type>_monsterbox._tcp</type>
    <port>3000</port>
    <txt-record>id=3</txt-record>
    <txt-record>character=Orlok</txt-record>
    <txt-record>ver=8.4.1</txt-record>
  </service>
</service-group>
```

### The registry (mirrors `goblinManagerService`)

`services/nodeDiscoveryService.js` keeps an in-memory `Map` keyed by node id, exactly like
the existing Goblin registry: `status` (`online`/`offline`), `lastSeen`, a browse interval,
and graceful "avahi not present" degradation. It never writes to the SD card on the hot
path.

- `overlay(configAnimatronics)` → returns the config list with each entry's `ip` replaced by
  the **discovered live IP** when that node is currently online, plus `discovered`/`status`/
  `lastSeen` metadata. Config entries not discovered keep their file `ip` (fallback).
  Discovered nodes absent from the file are appended (fully dynamic nodes).
- If discovery is empty (dev container, mDNS-blocked network), `overlay()` returns the
  config list **unchanged** — so every existing deployment behaves exactly as before. The
  feature is strictly non-regressive.

### Integration with orchestration

`orchestrationService.getAnimatronics()` returns `overlay(this.animatronics)`. The
URL-building code is untouched because it reads `ip` off each (now overlaid) entry.

## Robustness (the two things zero-config always needs)

1. **Manual fallback.** mDNS rides multicast, which guest WiFi, VLAN isolation, and some APs
   block. Discovery *augments* `animatronics.json`; it never removes the ability to pin a
   node by IP. `POST /api/orchestration/nodes/manual` adds a static entry at runtime.
2. **Trust token.** mDNS is unauthenticated — any LAN device could advertise
   `_monsterbox._tcp`. When `MB_NODE_TOKEN` is set, discovery only auto-trusts nodes whose
   advertised `token` hash matches; unknown advertisers are surfaced as `untrusted` and not
   acted on. Off by default (non-breaking); see Phase 4 for endpoint-level enforcement.

## API

- `GET /api/orchestration/nodes` → live merged registry (discovered ∪ config ∪ manual) with
  `status`, `source` (`discovered`/`config`/`manual`), `lastSeen`, `trusted`.
- `POST /api/orchestration/nodes/manual` `{ id, name, ip, port, characterId }` → pin a node.
- `DELETE /api/orchestration/nodes/manual/:id` → forget a manual entry.

## Testing

The avahi interaction is injected (`{ exec }` / configurable service-file path), so the
parser, registry merge, fallback, staleness, and token filtering are unit-tested in a
hardware-less container against captured `avahi-browse -rpt` fixtures. Real mDNS behavior
(multicast on WiFi, cross-node visibility) must be validated on the actual RPi network.

## Phasing

| Phase | Deliverable | Status |
|---|---|---|
| 1 — Advertise | service-file writer + `npm run advertise-node`; `<name>.local` live | ✅ v8.4.1 |
| 2 — Discover | `nodeDiscoveryService`: browse + live registry + heartbeat | ✅ v8.4.1 |
| 3 — Wire | orchestration reads the overlaid registry; file `ip` is fallback | ✅ v8.4.1 |
| 4 — Harden | endpoint-level token enforcement on inter-node control calls | follow-up |
| 5 — Unify | same discovery for Goblins (`_monsterbox-goblin._tcp`); live-updating UI | follow-up |
