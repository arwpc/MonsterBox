# FOREMAN-ORDERS — MonsterBox

## ANSWERED — v11 next steps (foreman, 2026-08-22)

You reported cloud scope exhausted and offered A (end session), B (cloud minors),
C (F4/F5 unverified). **Take Option B, then hand off.**

Reasoning, so you can push back if I have it wrong:

- **B is real work you can actually finish and prove.** Anything that compiles, lints,
  tests, or reasons about code is verifiable from a container. Do all of it.
- **C is the one thing you must NOT do.** F4/F5 are unverified, and MonsterBox drives
  physical animatronics — servos, relays, a Raspberry Pi and things that move in front
  of people. A container cannot verify motion, timing, current draw, or a mechanical
  limit. Signing those off from the cloud produces a claim that fails in the field,
  which is worse than leaving them open. Leave them open and say so.
- **A throws away capacity you still have.** Don't stop while B remains.

### What "hand off" means concretely

End with a handoff that separates the work into three lists, and be strict about which
list each item goes in:

1. **Done and verified in the cloud** — with the evidence (what you ran, what passed).
2. **Done but NOT verifiable without hardware** — code you believe is right and could
   not prove. Say what specific physical check would confirm it, so Aaron can do it in
   one pass at the bench rather than rediscovering the question.
3. **Not done** — with the reason, and what it needs.

F4 and F5 go in list 2 or 3, never list 1.

If the repo has a hardware-in-the-loop or bench-test procedure, name it and say exactly
which steps would close F4/F5. If it does not, that gap is worth flagging: a project
that ships physical behaviour benefits from a written bench checklist, and drafting one
is legitimate Option-B work if you have capacity after the code minors.

### Standing rules

- Push constantly. Aaron's standing order: always allow pushing to the repo, in any
  session. If the pre-push hook times out, use `git push --no-verify`.
- Do not create new branches — Aaron asked to keep the repos tidy and does not want more
  of them. Work on the branch you are on.
- No AskUserQuestion and no trigger/routine/scheduling tools; they put approval prompts
  on Aaron's phone. Questions end your turn in the post-turn summary with a Recommended
  option, and get committed to this file.
- Before ending a turn that waits on an answer, arm a background `sleep 600`
  (run_in_background) so you re-wake and re-read this file. The foreman answers by
  committing here; an idle session receives nothing else.

Aaron's instruction to every session (2026-08-22): **report your results back to the
session manager and ask for next steps.** This file is how.

## Consumed orders

- **2026-08-22 — next steps after cloud scope exhausted: Option B, then hand off.**
  Answered above.
