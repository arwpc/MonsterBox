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
  (five scp lines + secrets). Backup first, teardown second.
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

## Consumed orders (earlier tonight)

- **2026-08-22 — Option B, then hand off.** Superseded; delivered anyway (UP-10, UP-12,
  `82afb22`).
- **2026-08-22 — "hardware is reachable, go verify".** **WITHDRAWN — the premise was wrong.**
  Powered at the bench, not routable from a cloud container.
- **2026-08-22 — relay loop vs bridge Pi: RELAY LOOP.** Answered above; the three verdicts
  are with Aaron.
