---
name: monsterbox-fleet
description: Working across MonsterBox nodes — who they are, how to reach them, how code and state actually travel (rsync deploy, not git), which files are node-local and must never cross nodes or land in commits, and how to prove what a peer is really running. Load before deploying, SSHing, reading a peer's data files, or reasoning about a node from another node.
---

# MonsterBox fleet

## The nodes

| ID | Character | Host | IP | Status norm |
|----|-----------|------|-----|-------------|
| 1 | PumpkinHead | pumpkinhead | 192.168.8.150 | **in storage — offline is expected, never a finding** |
| 2 | Mina | mina.local | 192.168.8.140 | live; hardware-unstable (hard power-loss events 2026-08-20) |
| 3 | Orlok | orlok.local | 192.168.8.120 | live; holds fleet SSH trust and the GitHub deploy key |
| 4 | Sir Dragomir | sirdragomir.local | 192.168.8.130 | live |
| 5 | Groundbreaker | — | 192.168.8.200 | **in storage — offline is expected** |
| 6 | Renfield | — | no address | data dir only |

`config/animatronics.json` is the registry; live discovery overlays it via mDNS
(`GET /api/orchestration/nodes`). All inter-node HTTP is `https://<ip>:3000`.

## How code travels — and how it lies

- `npm run deploy:all` **rsyncs files; it does not move git.** A deployed node keeps an old
  git HEAD and ~25–150 "dirty" files while running current code. That state is NORMAL on a
  deploy target — do not "fix" it by resetting, and do not read it as lost work.
- `/health` version and `git log` both therefore lie about what a node runs. **Prove a fix
  landed by grepping the node for the actual symbol** (`/fleet-verify` does this).
- Deploy excludes `.git`, `.claude`, and node-local state — after a deploy, a node's
  `.claude/` and `.gitignore` may be stale relative to origin.

## Node-local files — never cross nodes, never commit casually

`parts.json`, `poses.json`, `super-powers.json`, `calibration_profiles.json`,
`app-config.json`, `ai_agent_state.json`, `speaker-state.json`, telemetry
(`startup-health.json`, `performance-history.json`, …) drift independently per node.

- **Never read one node's copy to reason about another** — a part-probe checklist was once
  built from Mina's calibration file "for every character" and got every number wrong.
- They stay dirty in `git status` on every node. That is the convention, not a mess.
- Never commit `.mcp.json`, `config/app-config.json`, `data/audio-library/library.json`,
  or a service-written data file while a suite is driving that service (a test's transient
  `jawAnimation.enabled:false` got committed once and had to be reverted).

## Reaching nodes

- `ssh remote@<ip>` lands in `/home/remote`, **not the repo** — absolute paths or `cd` first.
  A bare `npm run …` over SSH fails looking exactly like a missing script.
- Key-based SSH works **from Orlok**. Elsewhere: password at `/etc/monsterbox/env` as
  `MONSTERBOX_SSH_PASSWORD` (`sudo sh -c '. /etc/monsterbox/env; export SSHPASS="$MONSTERBOX_SSH_PASSWORD"; sshpass -e ssh remote@<ip> "<cmd>"'`). Read it; don't ask.
- Ear-checks (`npm run earcheck`) score unreachable-by-ssh nodes `OFFLINE` even while they
  serve traffic — run them from Orlok and confirm any OFFLINE with `curl -sk .../health`.
- Git push: Orlok's origin is SSH-keyed and works. Other nodes' origin is HTTPS with no
  credentials — push from them via `git@github.com:arwpc/MonsterBox.git` or fetch their refs
  to Orlok (`git fetch remote@<ip>:/home/remote/MonsterBox <ref>`) and push from here.

## Shared-fleet awareness

Other Claude sessions drive the same fleet, sometimes concurrently. If a setting reverts or
a node mutes mid-task, suspect a peer session before suspecting the code — `ListAgents`
shows them. Anything you change on a peer node, verify afterward on that node.
