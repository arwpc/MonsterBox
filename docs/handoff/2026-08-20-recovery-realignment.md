# Recovery & realignment — 2026-08-20 (late evening, Orlok node)

Two sessions' work was reported lost ("advanced settings" + a crash mid-update). Forensics
found **nothing unrecoverable**; this records what each session was, where its work lives
now, and what was done to stop this class of loss recurring.

## The two "lost" sessions — both on the Mina node

1. **Claude-setup reorganization** (session `7c89e1bb`, 2026-08-19 evening): Aaron asked it
   to "reorganize HOW my Claude is set up based on new guidance." It produced the
   `/mega-session` launcher, the rewritten `/test-browser` command, standing tasks in the
   `elevenlabs-ai-specialist` agent (canonical STT + designed-voice verification), and the
   `elevenlabs-canonical-stt` memory. It died mid-execution with its files **written to
   Mina's disk but uncommitted**, and referencing three skills it never got to write.
2. **Crash-recovery session** (`6eea2797`, 2026-08-19 23:25): opened with "Claude rc
   crashed", verified nothing was lost, and was itself killed by request timeouts after 56
   transcript lines. Did no work to lose. A third attempt on 2026-08-20 21:09 wrote a
   0-byte transcript — Mina was already unresponsive.

All v10.0.1→v10.4.0 development (40 commits) was **already pushed**; `origin/main` at
`6ca28f49` was and is the tip. Mina's HEAD matches it exactly; she had zero unpushed commits.

## Where everything lives now

| Artifact | Location |
|---|---|
| Mina's uncommitted work (mega-session, agent/command edits, ARCHIVE/ pose-scene backups, node-local state, last earcheck) | branch **`rescue/mina-wip-2026-08-20`** on GitHub (`e6d34738`) |
| `pre-pose-scene-reset-2026-08-20` tag (was only on Mina) | pushed to GitHub |
| Orlok's full pre-realignment working tree | branch **`rescue/orlok-tree-2026-08-20`** on GitHub (`e00aa2f2`) |
| Mina's Claude session transcripts, workflow journals, memory files (158 MB) | `/home/remote/mina-rescue/` on Orlok |
| Mina's home-dir calibration backup | `/home/remote/mina-rescue/mina-calibration-backup-1786922125.json` |
| The rescued session work, landed properly | committed to `main` (this change set) |
| The three skills `/mega-session` assumed | written this session: `monsterbox-fleet`, `monsterbox-hardware`, `monsterbox-testing` |

## Mina is hardware-unstable — this is what actually killed the sessions

Her journal shows **abrupt ends with no shutdown sequence** (hard power loss or freeze) at
~21:23, ~21:28 and ~21:52 on 2026-08-20, mid-normal-operation each time. `throttled=0x0`
and zero over-current events since the USB-hub removal, so the previous USB rail theory
doesn't cover this. Until she survives a day, treat her as an unreliable dev seat — **run
sessions from Orlok** and treat Mina as a deploy target. Her open audio issue (signal
reaches the XVF3800, no sound in the room — check the powered subwoofer) is in
`V11-HANDOFF.md` §11.

## Orlok realignment (this session)

Orlok's git was 40 commits behind origin with ~160 "dirty" files — the **normal deploy-target
state** (rsync ships files, not git), not lost work. After snapshotting the tree to the
rescue branch: local `main` fast-forwarded to `6ca28f49`, stale shared files (`.claude/`,
`.gitignore`, docs) restored from origin, earcheck records reconciled both directions, and
the rescued Mina session work committed. Remaining `git status` dirt is node-local state,
per fleet convention.

## Access status (needs Aaron)

- **`gh` CLI token is invalid** (401) — `gh auth login -h github.com` in a terminal to
  restore PR/issue/Dependabot access. Plain git push/pull over SSH works fine from Orlok.
- **claude.ai MCP connectors** (GitHub, ElevenLabs, Notion, …) show "requires authentication"
  in non-interactive sessions on this node; re-authorize via claude.ai connector settings or
  `/mcp` in an interactive session if a session needs them.

## What's next

`docs/development/V11-HANDOFF.md` remains the authoritative plan (scope, safety constraints,
§7 order). `/mega-session` is the launcher for it, and its skill dependencies now all exist.
