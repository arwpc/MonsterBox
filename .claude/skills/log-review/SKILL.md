---
name: log-review
description: Standing error-log review for the MonsterBox fleet — collects fresh log signal from every reachable node, triages it against docs/troubleshooting/KNOWN-BUGS.md, and updates that tracker so it stays current at both the animatronic and system level. Use at session start, after any test-suite run, when the operator says "check the logs", and whenever the every-10-commits post-commit hook prints a log-review reminder.
---

# Log Review — keep KNOWN-BUGS true

The point of this skill is that **the bug tracker tracks reality**. A v9.3.0 fleet
believed "ready for Halloween" was carrying a dead webcam, silently flattened voice
configs, a health check auditing the wrong character, failed units, and journal
flooding — all discoverable in minutes once someone actually read the logs
(2026-08-17). This skill makes that read a standing habit.

## Procedure

1. **Collect locally**: `node scripts/log-review.mjs` (add `--json` when you want to
   parse). Exit 1 means error-level findings.

2. **Collect fleet-wide**: for every animatronic in `config/animatronics.json` that
   answers `https://<ip>:3000/health`, run the same collector over SSH
   (`sshpass -e`, password from `/etc/monsterbox/env` via sudo — see the
   sync-before-work memory for the pattern). Offline nodes are reported as
   OFFLINE/UNVERIFIED, never assumed fine.

3. **Triage every finding** into exactly one of:
   - **Known & tracked** — it matches an open item in
     `docs/troubleshooting/KNOWN-BUGS.md`. If the evidence changed (worse, better,
     new correlation), update that item in place.
   - **Known & FIXED** — the tracker says fixed but the log disagrees, or vice
     versa. Reconcile the tracker to the evidence; strike-through items only with
     proof (two clean boots, a verified probe).
   - **New** — add it to KNOWN-BUGS under the appropriate node section or
     Cross-Cutting, with the log line quoted, a severity emoji (🔴🟡🟢⚪), and what
     would prove it fixed.
   - **Noise worth silencing at the source** — spam (dead-token agents, leaked
     polling loops) gets fixed or disabled, not ignored. SD cards wear.

4. **Check the voice-config fingerprint** — the collector flags per-character
   `tts-config.json` drift from committed canonical. Stability/similarity landing
   on 0.5/0.5 means something is flattening voices again (it has happened twice);
   find the writer, do not just restore.

5. **Update the tracker and commit** the KNOWN-BUGS/CHANGELOG edits as
   `vX.Y.Z: [log-review] <summary>` (version from package.json). Push per the
   git-push-over-ssh memory.

6. **Update Claude memory** if the review taught something durable about the fleet
   (new failure class, new canonical value, new trap) — see the memory directory
   conventions.

## Cadence

- **Session start**: part of onboarding, alongside `git status`.
- **Every 10 commits**: `scripts/git-hooks/post-commit` runs the quick collector
  automatically and prints its findings — treat that output as this skill's
  trigger.
- **After any test-suite run on a live node**: suites have reset volumes, flattened
  voice configs, enqueued scenes on peer nodes, and left part debris. Verify, don't
  assume.

## Hard-won context

- `success: true` proves an I²C write, never motion or audio. The ear-check
  (`scripts/fleet-audio/earcheck.mjs`) is the only audio proof.
- `wpctl` volume is node-local and resets; canonical per-node sink volumes live in
  `config/animatronics.json` (`sinkVolume`).
- Orlok's USB hub has thrown bus-wide over-current bursts under load; a webcam that
  vanished mid-day and a re-enumerated audio sink are that fault, not software.
- The journals are capped at 64M and persistent on every node; if one is huge or
  volatile again, the OS baseline was lost (see node-os-baseline memory).
