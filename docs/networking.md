# Networking

MonsterBox runs on **MonsterNet**, a dedicated private WiFi network for animatronic devices.

## Network: MonsterNet

- **SSIDs:** `MonsterNet5g` / `MonsterNet2.4g`
- **Subnet:** 192.168.8.0/24

!!! warning "Credentials"
    WiFi and SSH credentials are not published in documentation. See the physical network reference card or contact the system owner.

## Animatronic Hosts

| Character | IP Address | Status |
|-----------|------------|--------|
| PumpkinHead (ID 1) | 192.168.8.150 | Active |
| Mina (ID 2) | 192.168.8.140 | Active |
| Orlok (ID 3) | 192.168.8.120 | Primary dev |
| Sir Dragomir (ID 4) | 192.168.8.130 | Offline |
| Groundbreaker (ID 5) | 192.168.8.200 | Active |

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
