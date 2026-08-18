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
| 1 | **Superpowers fix-fleet** (A ✅ B ✅ C ✅ committed `8430a691`; D partial-salvaged, needs finisher; E not started) | 🔶 3/5 + salvage | each agent's report + integration review |
| 2 | **Integration**: review A–E diffs, dead calibration-route redirects, `node --check` all, `validate:schemas`, `audit:resolver`, `test:smoke`, commit wave | ⏸ gated on 1 | gate commands green, wave committed |
| 3 | **Service restart** (loads fixes + Scare Console route + Obsidian skin) | ⏸ gated on 2 | health 200, zero startup errors in journal |
| 4 | **Scare Console visual pass**: desktop + phone screenshots, iterate until right | ⏸ gated on 3 | screenshots reviewed by me, defects fixed |
| 5 | **v10 page sweep**: 4/27 pages landed (orchestration, studio, calibration, models — committed); 23 remain + after-screenshots; 2 dead calibration routes still to retire | 🔶 4/27 | 27-page matrix all green |
| 6 | **Test pass**: update dashboard/browser specs for new structure, then FULL browser suite + system + unit | ⏸ gated on 5 | suite green minus documented pre-existing flakes (named) |
| 7 | **Docs regeneration**: README, CHANGELOG, Tactile Obsidian design doc, dashboard docs, KNOWN-BUGS reconciliation, memory files | ⏸ gated on 6 | docs reference no removed page; version reads dynamic |
| 8 | **v10.0.0**: bump `package.json`, commit, tag, push (gate runs), `deploy:all` to Orlok + Dragomir, post-deploy earcheck | ⏸ gated on 7 | tag on GitHub; fleet-health ×3 at 10.0.0; earcheck 3/3 |

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
