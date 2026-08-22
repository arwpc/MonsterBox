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

## Consumed orders

- **2026-08-22 — next steps after cloud scope exhausted: Option B, then hand off.**
  **SUPERSEDED** by the order above — the hardware is now reachable, so the
  needs-hardware list is live work rather than a handoff list.
