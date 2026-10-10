# Fleet events

The three orchestrated shows of Warner Castle (scripts in `docs/characters/FLEET-EVENTS.md`): **The Lighting of
the Castle** (conductor scene 101), **The Count's Orders** (102) and **One Song for Warner Castle** (103). Each
conductor is an ordinary scene in the host character's `scenes.json` (Orlok's node) built from the fleet step
types (`fleet-mode`, `fleet-audio`, `fleet-scene`, `fleet-say`, `fleet-stop-audio`, `goblin-video`), calling every
other character's event part (that character's scenes 8, 9, 10) on its own node.

```bash
node scripts/fleet-events/run-next.mjs            # play the next event in the rotation (101 → 102 → 103 → …)
node scripts/fleet-events/run-next.mjs --dry-run  # every fleet step resolves its node; nothing moves or sounds
node scripts/fleet-events/run-next.mjs --event 103 --force   # rehearse one event now, ignoring quiet hours / busy nodes
node scripts/fleet-events/run-next.mjs --status   # rotation state, last runs, what plays next
node scripts/fleet-events/run-next.mjs --release-only   # tell every node the event is over (ops, after a crash)
node scripts/fleet-events/install-conductors.mjs  # (re)write scenes 101–103 into this node's scenes.json from conductors/
```

- `events.json` holds the rotation, quiet hours (23:00–08:00, local time: every Pi is on America/Chicago with NTP),
  the busy-retry policy (any node in a live guest conversation → wait 5 min, three times) and the state/lock paths.
- State lives in `data/fleet-events-state.json` (node-local, not committed); the lock in `data/fleet-events.lock`.
- After every show the runner sends `event-release` to every node (the conductor already did, this covers a
  crashed show) and logs each online Goblin's playback status; the Goblin keep-alive resumes a stopped reel.
- The runner is a client of the running MonsterBox (scene API + orchestration registry), like
  `scripts/yard-theater/perform.mjs`; it imports no application code.

## Schedule (every half hour in show hours)

Add a `raw` schedule on `/schedule` (it lands in the managed crontab block) or add the line by hand:

```
*/30 17-22 * * * cd /home/remote/MonsterBox && node scripts/fleet-events/run-next.mjs >> /var/log/monsterbox-fleet-events.log 2>&1
```

The quiet-hours check inside the runner is the real guard: a slot that falls inside quiet hours is refused and
logged, so an operator can widen the cron window without waking the street.

## Music beds

Each event has its own instrumental bed in the audio library, generated for the show with the ElevenLabs Music
API and loudness-normalized to −18 LUFS (so `volume: 35` means the same thing in every event):
`fleet-event-castle-vigil` (230 s), `fleet-event-counts-march` (260 s), `fleet-event-castle-waltz` (235 s). The
library deploys to every node, so the ids are the same everywhere.
