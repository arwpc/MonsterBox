# Fleet events

> **ALL scheduled events run ONLY from Alpha (operator rule, 2026-10-24).** Alpha's managed crontab
> (`/schedule` on https://192.168.8.223:3000) is the only place a show is scheduled, and every conductor is an
> Alpha scene (character 7): Slipknot 19, Nosferatu 20, Lighting 23, Count's Orders 25, One Song 27
> (`events.json` → `"node": "Alpha"`). No animatronic schedules or conducts a show: their crontabs keep only
> `@reboot start-audio.sh`, and their own scene loops (lurk scenes, idle loop) are not scheduled events.
> Alpha has no speakers, so show music is played by the parts: the score at **100% inside Groundbreaker's part**
> and at **50% inside Orlok's part**; the Alpha conductor waits out the score's length. A show still runs (without
> Groundbreaker's score) while he is down. Lurk background music plays **only on Groundbreaker** so every other
> character's speaker stays free for its own lurk scenes.
>
> The text below describes the original 2026-10 Orlok-hosted design (101–103); those conductors are retired.

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
node scripts/fleet-events/install-conductors.mjs --character 3 --dir host-parts --base https://192.168.8.120:3000  # Orlok's host-part scenes 1011–1032
```

- `events.json` holds the rotation, quiet hours (23:00–08:00, local time: every Pi is on America/Chicago with NTP),
  the busy-retry policy (any node in a live guest conversation → wait 5 min, three times) and the state/lock paths.
- State lives in `data/fleet-events-state.json` (node-local, not committed); the lock in `data/fleet-events.lock`.
- After every show the runner sends `event-release` to every node (the conductor already did, this covers a
  crashed show) and logs each online Goblin's playback status; the Goblin keep-alive resumes a stopped reel.
- The runner is a client of the running MonsterBox (scene API + orchestration registry), like
  `scripts/yard-theater/perform.mjs`; it imports no application code.

## Schedule (every half hour in show hours)

Alpha (the always-on console node, `docker/console-node/`) owns this entry since 2026-10-12; Orlok's copy is
disabled. Add a `raw` schedule on `/schedule` (it lands in the managed crontab block) or add the line by hand:

```
*/30 17-22 * * * cd /home/remote/MonsterBox && (node scripts/fleet-events/run-next.mjs) >> /home/remote/yard-theater-logs/fleet-events.log 2>&1
```

The quiet-hours check inside the runner is the real guard: a slot that falls inside quiet hours is refused and
logged, so an operator can widen the cron window without waking the street. Operations (rehearse, stop, what to
check afterwards): `docs/shows/FLEET-EVENTS-OPERATIONS.md`.

## Music beds

Each event has its own instrumental bed in the audio library, generated for the show with the ElevenLabs Music
API and loudness-normalized to −18 LUFS (so `volume: 35` means the same thing in every event):
`fleet-event-castle-vigil` (230 s), `fleet-event-counts-march` (260 s), `fleet-event-castle-waltz` (235 s). The
library deploys to every node, so the ids are the same everywhere.
