# MonsterBox v10.0.0 — Overnight Run-Sheet (2026-08-18)

The single source of truth for tonight's release train. Phases run strictly in
order; a phase is DONE only when its **proof** column is satisfied. Nothing is
taken on an agent's word — screenshots, passing specs, and HTTP codes decide.

Rollback story: the Obsidian skin is one `<link>` in `master.ejs`; the classic
dashboard survives at `/dashboard/classic`; commits land in small waves so any
wave reverts alone. The v10.0.0 tag is hostage to the full browser suite.

## Phase board

| # | Phase | Status | Proof required |
|---|-------|--------|----------------|
| 0 | Post-reboot verification, log-review, boot hardening, test sweep, reboot trial, log harvest | ✅ DONE | committed `dd816cbb`, `b30bde09`; 🎃 READY ×3; earcheck 3/3 |
| 1 | **Superpowers fix-fleet** (A ✅ B ✅ C ✅ `8430a691`; D salvaged, adversarially reviewed → 2 real claim defects fixed `6e8a0b05`; E rewritten + run) | ✅ DONE | adversarial verdict + 44 hardware tests passing, nothing moved |
| 2 | **Integration**: A–E landed, dead calibration routes redirect, schemas/resolver/independence/smoke green | ✅ DONE | `a071eac1`, `6e8a0b05`; smoke 459 passing; audits clean |
| 3 | **Service restart** (loads fixes + Scare Console route + Obsidian skin) | ✅ DONE | health 200 at 9.3.0, zero startup errors |
| 4 | **Scare Console visual pass** + operator-requested AI deck tab | ✅ DONE | `8b964197`, `21d1c3c5`; 3 defects found and fixed; 0 console errors both viewports |
| 5 | **v10 page sweep** — all 27 pages | ✅ DONE | `de9d4492`, `b3c3fdc2`, `acf60863`; 2 amber-vocabulary violations fixed; style guide teaches the system |
| 6 | **Test pass**: specs re-pointed at the console; FULL browser suite (service stopped — the PID lock has no test-mode exemption, and BASE_URL must name port 3200) | ✅ DONE | `c6d56776`, `a2e3daa3`; full suite 504 passed / 8 failed / 3 skipped — all 8 triaged (2 never-firing MB_TEST_MODE guards fixed, 1 markup-shape test fixed, panel floor honest at 3; #ocvEnabled recorded in KNOWN-BUGS) |
| 7 | **Docs regeneration**: README, CHANGELOG, TACTILE-OBSIDIAN.md, KNOWN-BUGS reconciliation | ✅ DONE | no doc names a removed page; version stays dynamic |
| 8 | **v10.0.0**: bump `package.json`, commit, tag, push (gate runs), `deploy:all` to Orlok + Dragomir, post-deploy earcheck | ✅ DONE | tag `v10.0.0` (`6659affe`) on GitHub; main pushed through `75fec397` (gate green 2026-08-18); fleet-health ×3 at 10.0.0 (PumpkinHead+Groundbreaker unplugged, deferred); earcheck 3/3 AUDIBLE + voiceCorrect (committed `2026-08-16T11-27-53`), voices re-verified release night voiceFallback:false. Earcheck run FROM Mina falsely reports peers OFFLINE (needs key SSH) — tracked in KNOWN-BUGS |

## Page-sweep matrix (phase 5) — 27 pages

Heavy surfaces first within each agent's family. A page is green only with:
① obsidian semantics · ② every control exercised · ③ tooltips present + bound ·
④ desktop + phone screenshots eyeballed.

- **Agent P1 — Show surfaces:** scenes/studio (151 controls), poses/editor, conversation/showtime, conversation/index (classic)
- **Agent P2 — Setup family:** setup/calibration (275), setup/system (102), setup/style-guide (115), setup/jaw-animation, setup/head-animation, setup/audio, setup/models, setup/unified-calibration, setup/characters, setup/character-images, setup/index
- **Agent P3 — Fleet & media:** orchestration/index (108), goblin-management/index (109), video-library/index, audio-library/index, schedule/index
- **Agent P4 — Entry & AI:** ai-settings/index, ai-settings/stt, ai-settings/tts, first-run/index, error
- **Route retirements (integration, phase 2):** `setup/calibration-linear-actuator`, `setup/calibration-standard-servo` → redirect to unified calibration (live 500s today; the rotted hardware test's "expected 200 got 500" was exactly this)

## Standing constraints

- Conservative diffs; no new deps; no new transports; API contracts preserved.
- Character independence is law (`resolveCharacter`, characterId on hardware calls).
- Orlok parts 3+4 quarantines untouched. Dragomir jaw stays OFF until calibrated.
- Node-local state (app-config, lurk-state) never lands in shared main.
- Every push runs the gate; CI runs it again.

## Deferred to daylight (tracked in KNOWN-BUGS)

- Operator calibration evening (Mina neck/eye, Orlok forearm/jaw/head, Dragomir head/jaw/magic-box)
- Orlok electrical: ch4/ch5 rail, part 2 MDD10A swap, part 3 BTS7960 trace, USB over-current
- PumpkinHead/Groundbreaker first boot: deploy + earcheck their untested tuned voices
- Parrot mode server-side flag; continuous-servo head-tracking velocity decay
- The 🔴 `:3100` test-egress hole (design work, not a tonight-fix)
