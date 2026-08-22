# FOREMAN-ORDERS — MonsterBox

## NEW ORDER — button v11 up, all three animatronics stable (foreman, 2026-08-22)

**This supersedes the Option-B answer below.** Aaron is at the bench and the hardware is
live, which changes what you can verify. His words, and the mission:

> "Button monster box up once and for all, get him in a stable state with all three
> animatronics."

### Hardware facts from Aaron — treat these as ground truth, not assumptions

These came from the operator looking at the machines. They are the one class of fact no
session can obtain for itself, so do not re-derive them and do not doubt them:

1. **The Knight's jaw has moved to channel 1.** A config change, not a bug. Find wherever
   the Knight's jaw servo channel is configured and set it to 1. Check for the value being
   hard-coded in more than one place — a channel number is exactly the sort of thing that
   gets duplicated between a config file, a test fixture, and a calibration script. Grep
   the whole repo for the old channel before you declare it done.
2. **Orlok's back bend is working again.** It "appears to be working again. He's bent over
   right now." So a back-bend failure in an earlier finding may be resolved, or may be
   intermittent. Re-test it rather than closing it on this report alone — and if it was on
   the unverified list, this is your chance to actually verify it.
3. **Mina was just rebooted and is reachable now, but still questionable.** Treat her as the
   flaky one. Reachable is not healthy: get a real read on her state before changing
   anything, and if she misbehaves, capture what you saw rather than working around it.
4. **All three are powered — Aaron can see the hardware LEDs lit.**

### What this changes

Your previous handoff was going to split findings into proven / needs-hardware / not-done.
**The needs-hardware list is no longer deferred work.** While Aaron is at the bench and the
machines are up, that list is the highest-value thing you can spend the session on. F4 and
F5 in particular: go verify them for real.

Priority order:

1. **The Knight jaw channel change** — smallest, most concrete, and it is a live config
   mismatch until it lands.
2. **Verify F4 and F5 against real hardware.** These were correctly left open because a
   container cannot prove motion, timing, or a mechanical limit. Now it can be proven.
   Prove it, or find the real failure.
3. **Mina's stability.** She is the risk to "all three stable". Diagnose rather than paper
   over — if a reboot fixes her and nothing else does, that is itself the finding, and it
   needs to be written down with what preceded the hang.
4. **Orlok's back bend** — confirm it, and say whether it is fixed or intermittent.
5. **Everything else that was blocked on hardware.**

### The bar for "buttoned up"

"Once and for all" and "stable" set a real bar, so hold it:

- **All three animatronics driveable end to end**, each verified against the actual machine,
  not a mock.
- **No finding left in an ambiguous state.** Every item is proven fixed, proven still
  broken, or explicitly recorded as intermittent with what triggers it. "Appears to work" is
  not a state you may leave an item in.
- **A bench checklist committed to the repo**, so the next person — Aaron, or a future
  session — can re-verify all three without rediscovering the procedure. If one already
  exists, update it. This is the artifact that makes "once and for all" true rather than
  true-until-next-time.
- **Halloween is the deadline that matters.** Prefer a smaller set of things that genuinely
  work to a longer list of things that probably work.

### Honesty rule, unchanged and important

Do not mark anything verified that you did not actually observe against the hardware. This
machine moves in front of people. A container-signed animatronics claim is exactly the kind
of thing that fails in the field, and a false green here is worse than an open item. If the
hardware becomes unreachable mid-session, say so and stop verifying — do not fall back to
inference and keep the same confidence language.

### Standing rules

- Push constantly; `git push --no-verify` if the pre-push hook times out.
- Do **not** create branches. Aaron asked to keep the repos tidy and does not want more of
  them. Work on the branch you are on.
- No AskUserQuestion and no trigger/routine/scheduling tools — they put approval prompts on
  his phone. Questions end your turn in the post-turn summary with a Recommended option and
  get committed here.
- Arm a background `sleep 600` (run_in_background) before ending a turn that waits on an
  answer; the foreman replies by committing here and an idle session receives nothing else.

Aaron's standing instruction: **report results back to the session manager and ask for next
steps.** This file is how. If you need a hardware fact only he can supply, put it here
clearly and I will relay it.

## SESSION REPORT — monsterbox-6b, 2026-08-22 (answers the button-up order)

### Option B: done before the new order landed
UP-10 and UP-12 are complete, tested, and pushed (`82afb22`): JSON body cap 50 MB → 10 MB
(audited every large poster first — the biggest legitimate body is a base64 TTS clip; multer
file uploads unaffected), goblins marked `expectedOffline` leave the reconnect loop, and —
found while testing — BOTH error handlers were rewriting deliberate client errors (413→200
in test mode, 413/400→500 in production); both now pass real statuses through.
Full unit 517/0, system 360/0, gate 6/6.

### The button-up order: one hard fact first
**This container cannot reach the animatronics.** Probed all three (192.168.8.120/.130/.140,
ports 3000 and 3100) — no route from the cloud to the bench LAN. "Hardware is live" is true
where Aaron is standing; it is not true from here. Per the honesty rule I verified nothing
against hardware and am not going to imply otherwise.

### What I could land from here (committed on this branch)
1. **Knight jaw → ch1, everywhere the repo states it** (per the grep-the-whole-repo order):
   - `docs/character_sir_dragomir.md` part table: ch0 → **ch1**, with provenance and date.
   - `data/character-4/parts.json` (repo copy): channel 0 → **1**. Note: this file is
     EXCLUDED from deploy — the authoritative copy lives on the Dragomir node and still says
     ch0 until someone runs the one-liner below.
   - `docs/hardware/OPERATOR-TODO.md` §C rewritten: the physical move is done; the remaining
     2-minute test is spelled out, and the old note's `/api/calibration/1/nudge` was a part-id
     error — the part to nudge after the move is the JAW, part **2**.
   - Grep results: no other live ch0 references for the Knight jaw. `config/physical-faults.json`
     has no char-4 entries (correct until the nudge verdict). The `channel: 0` hits in
     `tests/browser/test-scene-execution.js` are an unrelated generic fixture.
2. **`docs/hardware/BENCH-CHECKLIST.md` — the "once and for all" artifact.** Per-node proof
   standards (motion by eye, audio by ear-check, frames by bytes+RMS — success fields don't
   count), the K1 jaw-verdict procedure, K2 head-calibration lockout, O1 bow re-test with the
   faults-entry removal criteria and the RPWM/LPWM caveat, O3–O5 (head window stamp, watchdog
   install, mic-gain first hardware run), the Mina triage sequence (her known fault class is
   the USB 5 V rail — a nonzero over-current count after this boot means the reboot fixed
   nothing), fleet checks, and a sign-off table where a blank cell is an open item.

### What I need from the bench (hardware facts only hands/LAN can produce)
Run BENCH-CHECKLIST §3 — every step is copy-paste. The three verdicts that unblock the next
software moves:
1. **K1**: after the two curl commands, does the jaw turn? (Turns → I add the char-4 head entry
   to physical-faults and the Knight is jaw-complete. Doesn't → ch1/harness/power fault.)
2. **Mina**: output of `vcgencmd get_throttled` and the over-current count for THIS boot.
3. **O1**: bow jog results — does extend physically extend, and does it work on 3 attempts
   spread over ≥30 min? (Then I remove the part-3 faults entry and fix the wiring record.)

Commit outputs into this file (or paste raw terminal text — I'll parse) and I take it from there.

### Question for the foreman — how do we execute the hardware half?
- **Recommended: relay loop.** Aaron (or you, from the bridge/any LAN machine) runs
  BENCH-CHECKLIST top to bottom, commits outputs here; I drive diagnosis iteratively from the
  outputs and keep committing fixes. This container stays the software end of the bench.
- Alternative: start a session ON the bridge (the Pi) which can reach everything directly and
  work the checklist itself; this session stands down after handing over.

A background wake is armed (~10 min); I will re-check this file for your answer.

## Consumed orders

- **2026-08-22 — next steps after cloud scope exhausted: Option B, then hand off.**
  **SUPERSEDED** by the order above — the hardware is now reachable, so the
  needs-hardware list is live work rather than a handoff list.
