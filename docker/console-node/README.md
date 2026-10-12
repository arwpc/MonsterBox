# Console node (Alpha)

MonsterBox running on a machine with no hardware, inside Docker, so the operator has an
Orchestration Console that drives no parts of its own and does not take over the host.

- Character 7 "Alpha" (`data/characters.json`, `"hardware": "none"`, HAL eye picture). Its
  `parts.json` is empty and the pact suite requires it to stay empty.
- Container hostname `alpha` maps to character 7 through `config/animatronics.json`.
- `"deploy": false` on its registry entry: `npm run deploy:all` never rsyncs over Alpha's git tree.
- Not a controller: the Goblin keep-alive runs only on `controllerHost` (Orlok) and the fleet events
  are Orlok's cron, so this node only acts when someone uses its console.

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

State lives in `~/monsterbox-console` (set `MB_CONSOLE_STATE` to move it). The code is baked into
the image, so edits in the working tree reach the console only on a rebuild. The `config/` volume
is seeded once: after a registry change in git, copy `config/animatronics.json` into
`~/monsterbox-console/config/` and restart.

mDNS discovery needs avahi, which the container lacks, so it sees the fleet through the static IPs
in `config/animatronics.json`. Only port 3000 is published; the 3100 test listener stays inside the
container, so test suites run on Alpha cannot reach the console node.
