# Character Configuration Locks

## Why

The expensive part of an animatronic is not its code. It is the hand-measured
calibration window, the tuned jaw and voice config, the parts list that matches
one physical machine, and the poses built on top of both. None of that is
derivable from anything else — when it is overwritten, it is gone, and the only
way back is another bench session with a screwdriver.

Once a character is finished ("100%"), the remaining risk is no longer that he
does not work — it is that something *changes* him: a page save on the wrong
character, a helper that rewrites `parts.json` to "fix" a field, a deploy that
pushes another node's `scenes.json` over his, or an agent tidying a config file
it does not understand.

A **configuration lock** freezes a finished character.

## What a lock does

- **Frozen:** every configuration file under `data/character-<id>/` — parts,
  poses, scenes, super-powers, servo/actuator calibration, movement config,
  gestures, scene queues and templates, `ai-config/` (TTS/STT), images — plus
  the character's entry in `data/characters.json`.
- **Still writable:** runtime state (`lurk-state.json`, `lurk-scenes-state.json`,
  `callout-state.json`, `ai_agent_state.json`, analytics, anything matching
  `*-state.json`). The lurk state machine keeps a wake's capability switches in
  the lock's runtime overlay, never in `super-powers.json`, so a locked
  character wakes into full AI mode. **A locked character still runs** — he plays scenes,
  talks, listens, and moves. He just cannot be reconfigured.
- **Deploys leave him alone:** `scripts/deploy-to-animatronic.sh` excludes a
  locked character's whole `data/character-<id>/` directory. This matters
  because `scenes.json` is *not* in the per-file excludes, so without this a
  routine `npm run deploy:all` would push the deploying node's copy over his.

## Where it lives

| Piece | Path |
|-------|------|
| Lock list (source-controlled, deploys fleet-wide) | `config/character-locks.json` |
| Enforcement | `services/characterConfigLock.js` |
| Main chokepoint | `services/atomicStore.js` (`writeJsonAtomic`) |
| CLI | `scripts/character-lock.mjs` |
| Tests | `tests/unit/character-config-lock.test.js` |

Writers that persist JSON through `writeJsonAtomic` inherit the guard for free
(parts, poses, scenes, super-powers, calibration, jaw/head/AI-motion, aiConfig).
The handful of services that still write with a raw `fs.writeFile`
(gesture vocabulary, LED config, movement config, scene queues/templates) call
`assertConfigPathWritable()` explicitly.

A refused write throws a `CharacterConfigLockedError` with `code:
'CHARACTER_CONFIG_LOCKED'` and `status: 423`, so the app's error handler answers
HTTP **423 Locked** with a message naming the character, the reason, and the
unlock command.

## Commands

```bash
npm run lock:status                 # who is locked, why, since when
npm run lock:verify                 # do the locked files still match the fingerprints?
node scripts/character-lock.mjs lock <id> --reason "..." --by "..."
node scripts/character-lock.mjs refresh <id>     # re-fingerprint after a deliberate change
node scripts/character-lock.mjs unlock <id>      # deliberate, explicit, logged in git
```

`verify` compares a sha256 per config file against the fingerprints taken when
the lock was applied. It **reports** drift rather than failing: a node's own
copy of a character legitimately differs from another node's repo, so this is
evidence to read, not a gate.

Fingerprints skip the character's `backups/` directory (`scripts/character-lock.mjs`,
since the castle-tuning release). The replace endpoints and `push-show.sh` write
dated copies of the old files there, and those copies differ per node by design,
so including them made `verify` report drift on every node after a show push.

## Unlocking

Unlocking is meant to be deliberate and visible: it edits a committed file, so
it shows up in `git log`. Change the configuration, then
`node scripts/character-lock.mjs refresh <id>` to re-record the fingerprints and
commit both.

There is an escape hatch for one-off operator work —
`MB_ALLOW_LOCKED_CHARACTER_WRITES=1` — which logs a loud warning on every write
it permits. It exists so a locked character can be rescued without editing
source; it is not a way to run a session.

## Pushing a rebuilt show to a locked character

Scenes and poses are node-local, and a deploy skips a locked character's whole
data directory, so a new show reaches his node only through
`scripts/push-show.sh <characterId> <ip>`. The script copies `poses.json`,
`scenes.json` and his TTS cache directly (the lock refuses app writes, not file
copies), points the lurk rotation at the silent pieces 1 and 2, restarts the
service, and, when the character is locked on that node, runs
`node scripts/character-lock.mjs refresh <id>` and `npm run lock:verify` there
so the node's fingerprints match the files it now holds.

The practice used for PumpkinHead and Sir Dragomir in the castle-tuning mission
(2026-10-10), because the operator's brief directed changes to both:

1. Treat it as a deliberate, recorded change: the brief or the operator names
   the character; the mission log says so.
2. Write the new files in the repo copy (the replace endpoints answer 423 for a
   locked character; validate with `node scripts/validate-scenes.mjs <id>`).
3. `node scripts/character-lock.mjs refresh <id>` in the repo and commit the new
   fingerprints together with the files.
4. `scripts/push-show.sh <id> <ip>` (it refreshes the node's lock), then
   `npm run lock:verify` on the node and `curl -sk https://<ip>:3000/health`.

The lock itself stays on throughout; nothing is unlocked for longer than the
edit. If you do unlock (`node scripts/character-lock.mjs unlock <id>`), relock
with `lock` once the push is proven, and commit both.

## Currently locked

| Character | Locked | Reason |
|-----------|--------|--------|
| 1, PumpkinHead | 2026-09-21 | Finished and verified at 100%; configuration frozen at operator direction. Fingerprints refreshed 2026-10-10 for his rebuilt show. |
| 4, Sir Dragomir | 2026-09-22 | Finished and verified at 100%; configuration frozen at operator direction. Fingerprints refreshed 2026-10-10 for his rebuilt show. |

Renfield (6) was locked on 2026-09-20 and is now **unlocked** (rebuilt on a new
Pi, not finished). `npm run lock:status` is the authority; this table can lag.
