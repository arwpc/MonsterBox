# FOREMAN-ORDERS — MonsterBox

## NEW ORDER — final round tonight, before tomorrow's bench session (foreman, 2026-08-22)

Aaron, right before going to sleep: **"Run one more round of testing on the animatronics to
make sure they're all functional tomorrow morning."**

He is now asleep and unreachable, and this container still has no route to the bench LAN — so
tonight's round is necessarily software-only. Be explicit about that distinction everywhere you
report; do not let "one more round of testing" read as if it covered the physical machines.

### What "one more round" means given the constraint

1. **Re-run the full test suite one more time from a clean state**, not from cache — a fresh
   install, fresh build, the works. The point of a final pass is catching something that only
   shows up cold, not re-confirming what already passed warm.
2. **Re-verify every file this session touched tonight is actually consistent with itself.**
   Specifically: the Knight jaw channel-1 change — confirm the repo copy, `OPERATOR-TODO.md`'s
   note, and `BENCH-CHECKLIST.md`'s K1 step all agree with each other and with what you last
   recorded. A discrepancy between two of your own documents is exactly the kind of thing a
   tired 3am pass introduces and a clean-eyes morning read catches too late.
3. **Walk `BENCH-CHECKLIST.md` yourself, end to end, as if you were the human running it
   tomorrow.** Not to execute it — you can't — but to catch anything ambiguous, any step whose
   "expected observation" isn't stated precisely enough to compare against, any step that
   assumes context only you have. This is the last chance to fix the instructions before a
   human actually depends on them at the bench.
4. **Produce one clean, short "what to check tomorrow morning" list** — ordered, each item
   naming exactly what to do and what a pass looks like. K1 (jaw), O1 (bow ×3 over 30+ min)
   stay the physical core of it, in that priority order. State Mina's rebuild status plainly at
   the top — whether it happened tonight, is mid-teardown, or is still fully pending — so
   tomorrow's first move is obvious without re-reading the whole file.
5. **If genuinely nothing is left to verify without hardware**, say so in exactly those words
   and stop there — do not manufacture additional software work to look busy. "All done, two
   things need your hands tomorrow" is a complete and correct final report.

### Standing rules, unchanged

Nothing marked verified against real hardware that was not actually observed against real
hardware — this rule does not relax because it is the last pass of the night. Push with
`git push --no-verify`. No branches beyond the one you're on. No AskUserQuestion, no trigger or
scheduling tools — nobody is there to see a phone prompt tonight anyway. If you finish and are
genuinely out of work, say so plainly rather than holding the container open.

## Consumed orders

- **2026-08-22 — button v11 up, relay loop, all prior software findings.** Delivered; CI-green,
  standing by.
- **2026-08-22 — final round before Aaron sleeps.** This order. Last item of the night.

## PROGRESS while awaiting the three bench verdicts (monsterbox-6b, 2026-08-22)

The while-you-wait list is done — with these, **every software finding from the v11 audit
(UP-1..UP-12, F1..F17) is accounted for**:

- **F4 + F5 closed** (`212da76`): the dead Safety tab is deleted and its browser assertion
  REPLACED with a stays-deleted guard; the Simple Calibration ghost card, its sc_* JS, and the
  three /api/simple routes are retired. Rendered page verified clean of every dead-control id;
  gate + legacy-calibration checker green; unit 517/0. The full browser-suite pass on the Pi
  (BENCH-CHECKLIST §F) is the remaining proof.
- **UP-11 closed for fresh installs** (`5744de6`): the unit template execs node directly —
  the npm wrapper cost ~60 MB and a signal hop, the same indirection that orphaned node behind
  CI's stop step. Live nodes keep their unit; not worth a bench step before Halloween.

Still waiting on: **K1** (jaw turn/no-turn after the two curls) and **O1** (bow jogs ×3 over
30+ min). The Mina triage ask is withdrawn — a rebuild moots it. Wake armed; re-read this file
on each wake and act on raw output the moment it lands.

## NEW INPUT ACTIONED — Mina is being rebuilt; everything else proceeds (2026-08-22)

Aaron: "I have to rebuild Mina, proceed with everything else." Done, and it changed the plan:

- **⚠️ RELAY TO AARON BEFORE THE TEARDOWN GOES FURTHER:** if Mina's rebuild touches the SD
  card, her calibration, poses, part configs and VOICE IDENTITY exist only there — not in
  git, not on any other node. `docs/hardware/MINA-REBUILD.md` §1 is the copy-paste backup
  (six scp lines + secrets). Backup first, teardown second.
- **`docs/hardware/MINA-REBUILD.md` committed**: lossless tear-down (§1 backup), the hardware
  items cheapest to close while she is open (§4 USB rail plan, §E neck/eye shared V+ branch,
  the speaker audioDeviceId drift), fresh provisioning (hostname MUST be `mina`; install.sh
  now carries everything that used to be hand-applied), and a post-rebuild acceptance run
  that ends in her BENCH-CHECKLIST sign-off column. BENCH-CHECKLIST §M now points there.
- **Reimage trap closed in provisioning** (`install.sh` Step 15): the XVF3800 ships its mono
  DAC (`'PCM',1`) at −20 dB — the exact "inaudible with every software layer healthy" fault
  that cost a full investigation on 2026-08-20, and it WOULD have come back with her fresh
  image. install.sh now normalizes every XVF3800 present to 0 dB before `alsactl store`;
  KNOWN-BUGS' OPEN provisioning note is closed. Her acceptance run includes re-tuning her
  canonical sink volume by ear (the old 1.0 was set while the DAC was −20 dB).
- While she is down: nothing to change in config — fan-outs already time out past her by
  design, and her `animatronics.json` row (hostname mapping + canon) is needed when she
  returns.

## FINAL ROUND COMPLETE (monsterbox-6b, 2026-08-22 overnight) — order delivered

All five items of the "final round tonight" order are done:

1. **Cold-state full re-run** — `node_modules` deleted, fresh `npm ci` (0 vulnerabilities),
   fresh single server. Gate **6/6 in 7.2 s**, unit **517 passing / 0 failing**, system
   **360 passing / 0 failing**. Green from a cold start, not a warm cache.
2. **Knight jaw ch1 cross-doc sweep** — every document tells the same story now. Two real
   errors found and fixed: `docs/character_sir_dragomir.md` had the channel narrative
   INVERTED (ch0 measured GOOD at +29 dB on 08-19; the dead-channel suspect is the HEAD on
   ch4 — the jaw move to ch1 is the swap-in-known-good test), and its hostname said
   `dragomir` when the node is `sirdragomir` (a reimage would have booted him as the wrong
   character). OPERATOR-TODO §2 also still told the operator to nudge part 1 — the
   forbidden 900° head; replaced with a pointer to §C (jaw = part 2).
3. **BENCH-CHECKLIST walked as the human who runs it** — a 3-lens review (bench-operator /
   expected-observation / cross-doc) returned 41 findings; the checklist is rewritten so
   every step names the exact command, the exact expected value, and what failure looks
   like. One REAL CODE BUG fell out: `data/speaker-state.json` was missing from the deploy
   exclusions, so every `npm run deploy:all` clobbered each node's live mute state —
   fixed in `scripts/deploy-to-animatronic.sh`. MINA-REBUILD.md §§1–4 now carry exact
   commands and pass lines throughout (backup scope, per-channel probe curls, clone +
   install pass line, capture proof, by-ear volume re-tune mechanism).
4. **The morning list** — below.
5. Out of software work after this commit; not holding the container open.

## ☀️ WHAT TO CHECK TOMORROW MORNING — in this order

**MINA FIRST — her rebuild is ANNOUNCED but there is NO confirmation the backup ran.**
Her calibration, poses, and voice identity exist only on her SD card. Before ANY SD/OS
work: run `MINA-REBUILD.md` §1 (six scp lines + secrets). Pass = the backup dir shows
`character-2/ai-config/tts-config.json` present and `calibration_profiles.json` non-empty.
Everything else about Mina waits on the rebuild (§2–§4 of her runbook, then her §4
sign-off column).

Then, on the two standing nodes:

1. **K1 — Knight jaw verdict** (BENCH-CHECKLIST K1). The two curls, then jaw turn or
   no-turn. Pass = jaw moves on ch1. Either way, record the verdict — it decides whether
   the HEAD's ch4 is a dead channel or a dead/miswired servo. Do NOT drive part 1 (head).
2. **K2 — head stays hands-off** (BENCH-CHECKLIST K2). CORRECTED 2026-08-22: there is no
   enforced refusal for direct API commands on part 1 — only poses/scenes/tracking refuse
   it (no measured window), and a physical-faults entry now keeps automated pickers away.
   A nudge/goto/test on part 1 WILL move it. The check is behavioral: command nothing.
3. **O1 — Orlok bow ×3** (BENCH-CHECKLIST O1). Three Extend/Retract jog-raw attempts
   ≥15 min apart at `/setup/calibration` → Bow At The Waist. Pass = clean extend AND
   retract all three times. The wiring-swap suspicion (description says RPWM=21/LPWM=19;
   node's parts.json says rpwmPin:19/lpwmPin:21) is written up in the checklist step.
4. **O3 — calibration stamp honesty** (BENCH-CHECKLIST O3). Jog to 3°/169°, then flip the
   "Calibrated (trusted by runtime)" switch. Pass = no "(unmeasured)" anywhere after.
5. **O4 — watchdog silence** (BENCH-CHECKLIST O4). `journalctl | grep monsterbox-watchdog`
   on each node. Pass = timer active and ZERO `[monsterbox-watchdog]` restart lines; any
   line is a finding (the watchdog fired = the server was down).
6. **O5 — mic gain persistence** (BENCH-CHECKLIST O5). Set Gain 70%, restart service.
   Pass = restore line in the log and `wpctl get-volume @DEFAULT_AUDIO_SOURCE@` = 0.70.
7. **§F — fleet + suites** (BENCH-CHECKLIST §F). `npm run check:discovery` (Mina
   Unreachable is EXPECTED while she is down) and `npm run test:system` per node.
   Pass = 0 failing (±the 3 documented intermittents, on re-run only).

Everything above has its exact commands and pass lines in `docs/hardware/BENCH-CHECKLIST.md`
— this list is the order to run them in.

## Consumed orders (earlier tonight)

- **2026-08-22 — Option B, then hand off.** Superseded; delivered anyway (UP-10, UP-12,
  `82afb22`).
- **2026-08-22 — "hardware is reachable, go verify".** **WITHDRAWN — the premise was wrong.**
  Powered at the bench, not routable from a cloud container.
- **2026-08-22 — relay loop vs bridge Pi: RELAY LOOP.** Answered above; the three verdicts
  are with Aaron.
