# FOREMAN-ORDERS — MonsterBox

## ANSWERED — RELAY LOOP. And my previous order was wrong (foreman, 2026-08-22)

**You were right and I was wrong.** I wrote "the hardware is reachable, the needs-hardware
list is live work" on the strength of Aaron reporting all three powered with LEDs lit.
**Powered is not routable.** You probed 192.168.8.120/.130/.140 on both ports, established
there is no route from a cloud container to the bench LAN, and verified nothing against
hardware rather than implying you had. That is exactly the behaviour the honesty rule is for,
and disproving my premise instead of working around it was the right call. Disregard the
"go verify F4 and F5 for real" instruction — you cannot, from there.

### The answer: RELAY LOOP

Your recommended option. Two reasons the alternative is refused for now:

- **A bridge Pi session cannot be started.** Session creation has been failing platform-wide
  for hours — eighteen consecutive attempts. Standing down would park the work behind an
  outage with no ETA.
- **Aaron is at the bench right now.** That window closes when he sleeps, and it is the only
  condition under which the three verdicts you need can be produced at all.

So: this container stays the software end of the bench. You diagnose and commit fixes from
whatever the bench returns.

### Your three asks are relayed to Aaron now

I am putting these in front of him verbatim, in your priority order:

1. **K1** — the two curl commands, then: does the jaw turn?
2. **Mina** — `vcgencmd get_throttled`, and the over-current count for THIS boot.
3. **O1** — bow jog: does extend physically extend, and does it hold across 3 attempts spread
   over 30+ minutes?

I have told him to paste raw terminal output rather than summarise it, since you offered to
parse it. Expect it either committed here or relayed through me.

### Two things in your report worth calling out

- **The deploy-excluded `parts.json` is a real trap and you caught it.** The repo copy now
  says ch1 while the authoritative copy on the Dragomir node still says ch0, and nothing in
  a normal deploy reconciles them. Keep that discrepancy loud in `OPERATOR-TODO.md` until
  someone runs the one-liner on the node — a config change that is true in git and false on
  the machine is worse than an untouched one, because it reads as done.
- **Finding the part-id error in the old operator note** (nudge part 2, the jaw, not part 1)
  is the kind of thing that would have wasted a bench trip. Good catch.

### While you wait

Do not idle on the verdicts. Everything that does not need the LAN is still yours:

- Anything on the software side of F4/F5 you can advance without observing motion.
- The rest of `BENCH-CHECKLIST.md` — it is the "once and for all" artifact and the more of it
  that is copy-paste with a stated expected observation, the fewer bench trips this ever
  needs again. A blank sign-off cell being an open item is the right design; keep it.
- Anything still ambiguous in the finding list, moved to a definite state where the evidence
  already exists.

### Standing bar, unchanged

No finding left ambiguous — proven fixed, proven broken, or explicitly intermittent with its
trigger. Nothing marked verified that you did not observe. If a bench answer comes back
ambiguous, ask one precise follow-up rather than recording a pass. Halloween is the deadline;
prefer fewer things that genuinely work.

Push constantly with `git push --no-verify`. Do not create branches. No AskUserQuestion, no
trigger or scheduling tools. Keep the background wake armed and re-read this file.

## Consumed orders

- **2026-08-22 — Option B, then hand off.** Superseded; delivered anyway (UP-10, UP-12,
  `82afb22`).
- **2026-08-22 — "hardware is reachable, go verify".** **WITHDRAWN — the premise was wrong.**
  Powered at the bench, not routable from a cloud container.
- **2026-08-22 — relay loop vs bridge Pi: RELAY LOOP.** Answered above; the three verdicts
  are with Aaron.
