# Networking

MonsterBox runs on **MonsterNet**, a dedicated private WiFi network for animatronic devices.

## Network: MonsterNet

- **SSIDs:** `MonsterNet5g` / `MonsterNet2.4g`
- **Subnet:** 192.168.8.0/24

!!! warning "Credentials"
    WiFi and SSH credentials are not published in documentation. See the physical network reference card or contact the system owner.

## Animatronic Hosts

Addresses here are a **fallback**; nodes discover each other's live addresses over mDNS
(`_monsterbox._tcp`) — see [Node Discovery](development/NODE-DISCOVERY.md). Status and version
as observed **2026-08-16** (v9.2.0 session); re-check with `npm run check:discovery` and
`curl -sk https://<node>:3000/health`.

| Character | IP Address | Status | Version |
|-----------|------------|--------|---------|
| PumpkinHead (ID 1) | 192.168.8.150 | 🔴 Offline all session — **unverified** | unknown |
| Mina (ID 2) | 192.168.8.140 | 🟢 Online | 9.2.0 |
| Orlok (ID 3) | 192.168.8.120 | 🟢 Primary dev | 9.2.0 |
| Sir Dragomir (ID 4) | 192.168.8.130 | 🟢 Online | 9.2.0 |
| Groundbreaker (ID 5) | 192.168.8.200 | 🔴 Offline all session — **unverified** | unknown |
| Renfield (ID 6) | *(none — `ip: null` by design)* | 🔴 Never networked — **unverified** | n/a |

⚠️ **Three of six nodes were offline for the whole v9.2.0 session**, so nothing in that release
is verified on their hardware. Renfield's `ip` is deliberately `null` so calls to him fail in
~126 ms instead of dialling a guessed address that could belong to someone else's device.

mDNS requires **both `avahi-daemon` and `avahi-utils`** on every node — the daemon advertises,
`avahi-browse` discovers. All three live nodes advertise and see each other as of 2026-08-16.

## Goblin Video Displays

| Goblin | IP Address | Status |
|--------|------------|--------|
| Goblin One | 192.168.8.40:3001 | Pending deployment |
| Goblin Two | 192.168.8.106:3001 | Offline |
| Goblin Three | 192.168.8.14:3001 | Operational |

## Port Assignments

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | MonsterBox main server | HTTP |
| 3001 | Goblin video player API | HTTP |
| 3100 | Test server (CI only) | HTTP |
| 8090 | MJPG-Streamer webcam | HTTP |
| 8795 | ElevenLabs Conversational AI | WebSocket |
| 8778 | Head Tracking | WebSocket |

## SSH Access

All Raspberry Pis use key-based SSH authentication. See the [Remote Access](security/remote-access.md) guide for connection details.

```bash
# Example — connect to a MonsterBox host
ssh remote@192.168.8.120
```

## SMB File Sharing

Windows file sharing is available on some hosts for transferring audio/video files. Access via Windows Explorer using the host IP address.

## GitHub Repository

[github.com/arwpc/MonsterBox](https://github.com/arwpc/MonsterBox)
