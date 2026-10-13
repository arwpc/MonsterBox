# Console node (Alpha)

MonsterBox running on a machine with no hardware, inside Docker, so the operator has an
Orchestration Console that drives no parts of its own and does not take over the host.

- Character 7 "Alpha" (`data/characters.json`, `"hardware": "none"`, HAL eye picture). Its
  `parts.json` is empty and the pact suite requires it to stay empty.
- Container hostname `alpha` maps to character 7 through `config/animatronics.json`.
- `"deploy": false` on its registry entry: `npm run deploy:all` never rsyncs over Alpha's git tree.
- **Alpha owns the fleet's schedule (since 2026-10-12).** The container runs cron in a Pi layout
  (`/home/remote/MonsterBox`, `HOME=/home/remote`, America/Chicago), so `/schedule` on Alpha manages a real
  crontab and the animatronics' cron lines work here verbatim. Fleet events every half hour in show hours, the
  Halloween-night moments and Night Memory all fire from here; the animatronics' own entries are disabled, so
  none of them has to stay on for the schedule. The crontab lives in the `crontabs` Docker volume.
- **Alpha runs the Goblin keep-alive** (`controllerHost: "alpha"` in `data/goblin-keepalive.json`). The reels
  are mounted from `~/monsterbox-console/goblin-reels`, so a Goblin missing its reel gets it from Alpha.
- **Alpha does not speak.** Its runtime copy of `data/character-7/ai-config/tts-config.json` (in
  `~/monsterbox-console`) has no `voice_id`, so a show line sent to `all` is refused on Alpha before any
  ElevenLabs call (logged as a warning, not a failure). The repo's copy has a voice only so the voice-identity
  tests pass for every registered character.
- No mDNS in the container (avahi needs the host's D-Bus, which would give the container control of the host).
  The registry falls back to static IPs, and the show runner probes nodes whose mDNS status is unknown.

## First run (on Alpha)

```bash
bash docker/console-node/seed-state.sh                    # copies data/, config/, certs/ to ~/monsterbox-console
docker compose -f docker/console-node/compose.yaml up -d --build
```

Console: `https://192.168.8.223:3000/` (self-signed cert, same as the Pis).

## Day to day

| Task | Command |
|---|---|
| Logs | `docker logs -f monsterbox-console` |
| Restart | `docker restart monsterbox-console` |
| Update after a `git pull` | `docker compose -f docker/console-node/compose.yaml up -d --build` |
| Stop | `docker compose -f docker/console-node/compose.yaml down` |
| Show log | `tail -f ~/monsterbox-console/logs/fleet-events.log` |
| Rehearse / status | `docker exec monsterbox-console node scripts/fleet-events/run-next.mjs --status` (`--dry-run`, `--event 101 --force`) |

State lives in `~/monsterbox-console` (set `MB_CONSOLE_STATE` to move it). The code is baked into
the image, so edits in the working tree reach the console only on a rebuild. The `config/` volume
is seeded once: after a registry change in git, copy `config/animatronics.json` into
`~/monsterbox-console/config/` and restart.

mDNS discovery needs avahi, which the container lacks, so it sees the fleet through the static IPs
in `config/animatronics.json`. Only port 3000 is published; the 3100 test listener stays inside the
container, so test suites run on Alpha cannot reach the console node.
