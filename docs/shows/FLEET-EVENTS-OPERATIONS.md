# Fleet events: operations

How to run, rehearse, stop and check the three orchestrated shows of Warner Castle. The scripts (who says what,
and how each character moves) are in [docs/characters/FLEET-EVENTS.md](../characters/FLEET-EVENTS.md); the runner
reference is [scripts/fleet-events/README.md](../../scripts/fleet-events/README.md).

| Conductor scene (on Orlok) | Event | Music bed |
|---|---|---|
| 101 | The Lighting of the Castle (ceremony) | `fleet-event-castle-vigil` |
| 102 | The Count's Orders | `fleet-event-counts-march` |
| 103 | One Song for Warner Castle | `fleet-event-castle-waltz` |

Each conductor calls every character's event part on that character's own node (scenes 8, 9 and 10 of each
character), casts clips to the Goblins, and plays the bed on every node.

## How the half-hour rotation works

1. The managed crontab on Orlok (visible and editable on `/schedule`, entry "Fleet events: one show every half
   hour (show hours)") fires `scripts/fleet-events/run-next.mjs` at `*/30 17-22 * * *`.
2. The runner refuses inside quiet hours (23:00 to 08:00 local; every Pi runs America/Chicago with NTP, check with
   `npm run check:time`). Quiet hours are the real guard, so the cron window can be widened safely.
3. If any node reports a guest conversation (a guest spoke in the last minute: `ai-status` `conversing` /
   `guestIdleMs`), the runner waits 5 minutes and looks again, up to three times, then gives up on that slot.
   The host node (Orlok) is never skipped.
4. It plays the next event in the rotation (101, 102, 103, then 101 again) through Orlok's scene API.
5. The conductor opens with `fleet-mode hold` on every node: idle loops, head tracking, background music,
   callouts, lurk scenes and PIR wakes step aside, and an awake node with no guest is put to sleep so its agent
   cannot answer the show's lines. An awake conversation with a guest is never ended.
6. The conductor ends with `fleet-mode release`; the runner then sends `event-release` to every node again (this
   covers a crashed show) and reads back each online Goblin. A hold also expires by itself (default 10 minutes).
7. Goblin casts are play-once, so each Goblin returns to its reel; the Goblin keep-alive on Orlok resumes any reel
   that did not.

Settings live in `scripts/fleet-events/events.json` (rotation, quiet hours, busy-retry, `playTimeoutMs`).

## Rehearse one event

```bash
cd /home/remote/MonsterBox
node scripts/fleet-events/run-next.mjs --dry-run              # every fleet step resolves its node; nothing moves or sounds
node scripts/fleet-events/run-next.mjs --event 101 --force    # play event 101 now, ignoring quiet hours and busy nodes
node scripts/fleet-events/run-next.mjs --status               # rotation state, last runs and their failures
```

A real rehearsal makes sound on every node and moves every rig. In quiet hours, lower the fleet first
(`PUT /api/orchestration/volume {"volume":20}`) and put show levels back afterwards with
`POST /api/orchestration/volume/restore-canonical`. A `success:true` from a step proves only that a command
landed; judge the show by eye and ear.

## Stop everything

- **End the show's hold on every node** (after a crash, or to bring the yard back now):
  `node scripts/fleet-events/run-next.mjs --release-only`
- **Emergency stop** (Fleet Command Center red button, or `POST /api/orchestration/emergency-stop`): stops scene
  queues, audio and random poses on every node, puts each node's lurk machine in `off` (agent, PIR, idle loop
  stopped), and stops the Goblins when run fleet-wide. It does not leave the yard in its normal state. Afterwards:
  turn Lurk back on (Fleet Command Center Lurk master, or `POST /api/orchestration/superpower/lurk
  {"enabled":true}`) and put the Goblins back on their reels (`POST /video-library/api/goblins/<id or name>/show`,
  the film button on Video Control, or wait for the keep-alive, which holds a stopped queue dark for 10 minutes
  before resuming it).
- **Pause the rotation:** disable the schedule entry on `/schedule`.

## State and logs

| What | Where |
|---|---|
| Rotation state and history (node-local, not committed) | `data/fleet-events-state.json` on Orlok |
| Run lock (a stale lock from a dead pid is taken over) | `data/fleet-events.lock` |
| Cron output | `/home/remote/yard-theater-logs/fleet-events.log` |
| Step failures and fleet warnings | `/var/log/monsterbox.err` on Orlok (and on each node for its own part) |
| Normal progress | `/var/log/monsterbox.log` |
| Per-node lurk state | `GET /conversation/api/lurk-state` on each node |

The logs are split: a failed step's reason is in `.err` while `.log` still reads healthy. Grep both.

## What to check after an event

1. **Every node lurking with no hold.** On each node `GET /conversation/api/lurk-state` reads `"state":"lurking"`
   and `"eventHold":null`. `awake` is fine only when a real guest woke it (`wake.source` `pir`, a guest in front of
   it); `off` means someone pressed emergency stop or Lurk OFF.
2. **Goblins on their reels.** `node scripts/fleet-events/run-next.mjs --status` and the runner's log list each
   Goblin's `video`; Goblin 2 should show `reel-goblin2-window.mp4`, Goblin 3 `reel-goblin3-roof-strip.mp4`, both
   `loop=queue`. Goblins 1 and 4 answer only once they are back on the network.
3. **Music off and Orlok's background music back.** Orlok's bed stops with the show; his lurk music resumes a few
   seconds after release.
4. **No new errors.** `tail` `/var/log/monsterbox.err` on Orlok for `[fleet]` lines and step failures. A cast to an
   offline Goblin is an expected, logged skip.

## Known gaps (2026-10-10)

The daylight rehearsal of all three events returned every node to `lurking` with no hold and both online Goblins to
their reels, but each run had failures (beds reported failed while playing, casts to the offline Goblin 1, a clip
Goblin 2 would not switch to, Orlok answering the show while awake). Those causes are fixed; a clean rehearsal after
the fixes has not yet been recorded. Open items are tracked in
[docs/troubleshooting/KNOWN-BUGS.md](../troubleshooting/KNOWN-BUGS.md).
