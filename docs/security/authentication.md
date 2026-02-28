# Security Model

## No Authentication Required

MonsterBox is a **local-network animatronic control tool** designed to run on a private home network (MonsterNet). It does **not** implement user authentication, login systems, JWT tokens, or session management.

All HTTP endpoints on port 3000 are accessible without credentials to any device on the local network.

## Why No Auth?

MonsterBox controls physical animatronics (servos, motors, LEDs) on Raspberry Pi hardware for Halloween displays. The system is:

- **Single-operator** — one person manages the animatronics from a browser
- **Local-network only** — runs on MonsterNet (192.168.8.x), not exposed to the internet
- **Physical-access equivalent** — anyone on the network can already see and touch the hardware

Adding authentication would add complexity without meaningful security benefit for this use case.

## Network Isolation

Security is provided by **network-level isolation** rather than application-level authentication:

- **MonsterNet** is a dedicated WiFi network for animatronic devices
- The MonsterBox server (port 3000) is only reachable from devices on this network
- SSH access to individual Raspberry Pis uses key-based authentication (see [Remote Access](remote-access.md))
- The ElevenLabs API key is stored securely at `/etc/monsterbox/elevenlabs.key` with restricted file permissions (mode 600)

## API Access

All API endpoints respond to unauthenticated HTTP requests:

```bash
# No auth headers needed
curl http://localhost:3000/api/parts
curl http://localhost:3000/health
```

See the [API Reference](../api/api-documentation.md) for the complete endpoint list.

## Recommendations

If you need to expose MonsterBox beyond your local network:

1. Use a VPN (e.g., WireGuard or Tailscale) to extend MonsterNet access
2. Place MonsterBox behind a reverse proxy (nginx) with basic auth
3. Never expose port 3000 directly to the internet
