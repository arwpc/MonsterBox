# v10 Release Train — Session Log, 2026-08-17 evening → 2026-08-18 ~01:20 CDT

The complete record of the overnight session that took the fleet from the
post-reboot 9.3.0 baseline to the doorstep of v10.0.0. Written at session
handoff so nothing depends on anyone's context window. The live phase board is
`V10-RUNSHEET.md`; this file is the narrative + salvage map.

## Commits pushed this session (gate green on every push)

| SHA | What |
|-----|------|
| `dd816cbb` | [log-review] first post-reboot pass — Mina stale-PID boot crash, boot-check missing on 2 nodes, Dragomir stale Orlok voice tuning (mtime-forensics: missed deploy, NOT a writer), tripwire clean, canonical volumes verified fleet-wide |
| `b30bde09` | [boot-hardening] pre-boot PID staleness guard + vanished-process handling (`services/resource/singleInstance.js`); `boot-init.sh` probed plain HTTP against the HTTPS server since the switch — random poses never enabled at boot anywhere; boot-check unit installed on Orlok+Dragomir + journal logging + deploy installs it henceforth. **Reboot-proven**: both nodes came back 🎃 READY, 0 failed units, 0 crashes, canonical volumes auto-applied |
| `8430a691` | [superpowers] fix wave 1 (agents A+B+C of 5): jaw adjust-calibration writes character-scoped; lurk capabilities/enable read per-character parts; dead head auto-pick (characterId-field filter) removed + jaw-as-pan fallback gone; findPanServo unified (3 copies → 1); jaw-settings refuses enable without resolvable+calibrated servo; lurk idle-loop moved server-side; randomPoseRoutes resolver bypass closed + audit regex hardened (`req\.app\??\.locals`); WS payload dumps env-gated; jaw windows normalized to calibrated (Mina 22/91, Orlok 63/131); **Dragomir jaw committed OFF**; PumpkinHead's Orlok-copy jaw config neutralized; schema dead keys removed; lurk-mode-state untracked |
| `0b18e237` | [v10-ui] **Scare Console** (`views/conversation/showtime.ejs` + `dashboard-v2.{css,js}`) — stage (video + overlay superpower chips + Listen/VU + say bar + PTT + quick scare lines) | one-tap deck (Scenes/Poses/Sounds tiles, busy-state, honest per-part failures) | drawer (chat portal, body map, bridge, console). Every legacy element ID preserved → `dashboard.js` binds unchanged (verified: zero missing bindings). **Tactile Obsidian** house skin (`mb-obsidian.css`) wired via master.ejs: serif=dialogue, mono=machine-truth, amber=happening-now, poison=armed, blood=danger. `/` → showtime; classic kept at `/dashboard/classic`; `/live` absorbed (kept: whole-tile targets, busy-state, honest failures) + redirects; Show Mode nav entry retired; defaultSceneId healed (Orlok 100→109 "A Blessing", Dragomir 9→null graceful) |
| *(this commit)* | [salvage] agent D's in-progress motion-arbitration work + 4 obsidian-swept views + this log — see "Salvage state" |

Also live on nodes but git-clean: Dragomir's stale char-3 tts-config healed to
canonical; Dragomir jaw disabled via orchestration before the earcheck.

## Verified tonight (artifacts, not claims)

- Boot: 🎃 READY ×3 (first time ever on Orlok/Dragomir), 0 failed units, PID guard held, random-poses-at-boot working, canonical volumes logged+measured (0.90/1.30/0.55).
- Audio: earcheck 3/3 AUDIBLE, canonical voices (Orlok 100% recall, Dragomir 94%, Mina 80%). Note: secondary "USB Audio Device" mic ports on Mina+Dragomir hear nothing (0.4/0.7 dB rise) — camera mics are the working ears.
- Tests: hardware suites ×3 nodes — failures identical everywhere and 100% in the two tracked rotted suites; mic+stepper clean. `test:system:ai` 26/0, `test:system:audio` 47/0.
- Logs: full harvest since the 2026-08-17 journal cleaning triaged; "character 999" = unit-test sentinel via the tracked :3100 egress hole; no over-current on Orlok this boot.

## Salvage state at handoff (in-flight agents orphaned by session end)

- **Agent D (motion arbitration + PIR)** — partial, all compiling: `services/randomPoseService.js` (+178: priority claims / per-character keying / negative-cache), `controllers/motionTrackingController.js` (+46: pan-servo claim), `services/lurkMotionWatcherService.js` (+126: resident-watcher integration), NEW `python_wrappers/gpio_pin_watcher.py` (py_compiles). **Committed as-is; a finisher agent must re-verify completeness against the audit** (journal `wf_efde27fd-5c9`, findings D1–D4) before phase-2 sign-off.
- **Agent E (hardware-test rewrite)** — NOT started. Rewrite `tests/hardware/{continuous-servo,linear-actuator}-calibration.test.js` against unified `/api/calibration/:partId/*`; keep create/cleanup, minimal safe motion.
- **Page sweep P1–P4** — 4 of 27 pages landed (orchestration, studio, calibration, models — committed, compiling). Remaining 23 + after-screenshots per the sweep script (`workflows/scripts/v10-obsidian-page-sweep-wf_86c09b58-d3f.js` in the session dir — reuse its prompts).
- **Not yet done, queued for integration:** dead calibration routes (`routes/setup/calibration.js:1047`, `:1333` → redirect to unified; live 500s today); tts-config playback-writer (persists defaults on play — earcheck dirtied Mina's file 23:40, values stayed canonical; stop persisting on read).

## Remaining phases (see V10-RUNSHEET.md board)

Finish D+E → complete sweep (23 pages) → integration wave + gates → service
restart (EJS caches; restart only on a compiling tree) → Scare Console visual
pass (desktop+phone) → update browser specs for new `/` structure → FULL suite
(v10.0.0 tag is hostage to it) → docs regeneration (README, CHANGELOG, Obsidian
design doc, KNOWN-BUGS reconciliation, memory) → bump 10.0.0, tag, push,
`deploy:all`, fleet-health ×3, post-deploy earcheck.

## Operational notes for the next session

- Fable 5 + UltraCode; Pi runs **5 agents** (operator override, in memory).
- Push via SSH deploy key (git-push-over-ssh memory). Gate runs on push.
- Screenshots: repo-dir scripts, `@playwright/test`, `executablePath:'/usr/bin/chromium'`, `--no-sandbox`, `ignoreHTTPSErrors`, 1280×800 + 390×844. `/tmp/node_modules` symlink exists for /tmp scripts.
- Never commit node-local state: `.mcp.json`, `config/app-config.json`, `data/audio-library/library.json`, `data/character-2/poses.json`.
- Quarantines (Orlok 3+4) and Dragomir-jaw-OFF are inviolable. No unattended calibration.
- Deferred to daylight, all tracked in KNOWN-BUGS: operator calibration evening, Orlok electrical (ch4/ch5 rail, MDD10A swap, BTS7960, USB over-current), PumpkinHead/Groundbreaker first-boot deploy + earcheck, parrot server-side flag, continuous-servo tracking smoothing, the 🔴 :3100 egress design fix.
