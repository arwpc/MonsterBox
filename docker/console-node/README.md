# Console node (Alpha)

MonsterBox running on a machine with no hardware, inside Docker, so the operator has an
Orchestration Console that drives no parts of its own and does not take over the host.

- Character 7 "Alpha" (`data/characters.json`, `"hardware": "none"`, HAL eye picture). Its
  `parts.json` is empty and the pact suite requires it to stay empty.
- Container hostname `alpha` maps to character 7 through `config/animatronics.json`.
- **Code parity is a permanent rule (operator, 2026-10-16):** Alpha must never run code that would
  not also run on the animatronics. It differs only in its character, parts and node-local state.
  `"deploy": "console"` on its registry entry makes `npm run deploy:all` deploy it with the fleet:
  `scripts/deploy-console-node.sh` rsyncs the same file set (`scripts/deploy-excludes.txt`, the list the
  Pis use) into `~/monsterbox-console/tree` and rebuilds the container from that tree. The compose
  file builds only from there, never from a git checkout, and never over Alpha's git working tree.
- `"hardware": "none"` on its registry entry keeps it out of fleet steps aimed at `all`.
- **Alpha owns the fleet's schedule (since 2026-10-12).** The container runs cron in a Pi layout
  (`/home/remote/MonsterBox`, `HOME=/home/remote`, America/Chicago), so `/schedule` on Alpha manages a real
  crontab and the animatronics' cron lines work here verbatim. Fleet events every half hour in show hours, the
  Halloween-night moments and Night Memory all fire from here; the animatronics' own entries are disabled, so
  none of them has to stay on for the schedule. The crontab lives in the `crontabs` Docker volume.
- **Alpha runs the Goblin keep-alive** (`controllerHost: "alpha"` in `data/goblin-keepalive.json`). The reels
  are mounted from `~/monsterbox-console/goblin-reels`, so a Goblin missing its reel gets it from Alpha.
- **Alpha does not speak.** Fleet steps aimed at `all` skip registry nodes with `hardware: "none"`
  (`services/scenes/fleetNodes.js`), so show lines never go to Alpha; the container also has no audio device.
- No mDNS in the container (avahi needs the host's D-Bus, which would give the container control of the host).
  The registry falls back to static IPs, and the show runner probes nodes whose mDNS status is unknown.

## First run (on Alpha)

```bash
bash docker/console-node/seed-state.sh                    # data/, config/ -> ~/monsterbox-console/tree; certs/
bash scripts/deploy-console-node.sh 192.168.8.223         # syncs the fleet file set into the tree, builds, starts
```

Console: `https://192.168.8.223:3000/` (self-signed cert, same as the Pis).

## Day to day

| Task | Command |
|---|---|
| Logs | `docker logs -f monsterbox-console` |
| Restart | `docker restart monsterbox-console` |
| Update (with the fleet) | `npm run deploy:all`, or `bash scripts/deploy-console-node.sh 192.168.8.223` |
| Stop | `docker compose -f docker/console-node/compose.yaml down` |
| Show log | `tail -f ~/monsterbox-console/logs/fleet-events.log` |
| Rehearse / status | `docker exec monsterbox-console node scripts/fleet-events/run-next.mjs --status` (`--dry-run`, `--event 101 --force`) |

State lives in `~/monsterbox-console` (set `MB_CONSOLE_STATE` to move it): `tree/` is the deployed
MonsterBox tree (code plus its live `data/` and `config/`, protected by the same excludes as a Pi's),
alongside `certs/`, `logs/`, `secrets/` and `goblin-reels/`. Shared config (registry, locks, faults,
hazards) reaches the console with every deploy, exactly as it reaches the animatronics.

mDNS discovery needs avahi, which the container lacks, so it sees the fleet through the static IPs
in `config/animatronics.json`. Only port 3000 is published; the 3100 test listener stays inside the
container, so test suites run on Alpha cannot reach the console node.
