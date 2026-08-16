# Mid-run config change marker (for before/after segmentation)

CHANGE_TS: 2026-08-16T05:33:49Z (round-4 model tuning applied to all five agents)

Panel position at change:
- orlok: 125/125 complete — ALL on OLD config (gemini-3.1-flash-lite, effort=low, ~3s LLM ttfb)
- mina: ~52/125 — block SPLIT (~52 old gemini/minimal, remainder new gpt-oss)
- dragomir, pumpkinhead, groundbreaker: 0 — ALL on NEW config

Round-4 changes (all agents):
- LLM: -> gpt-oss-120b, reasoning_effort unset (was gemini-3.1-flash-lite w/ low|minimal effort; dragomir already gpt-oss)
- soft_timeout: +2 in-character variant messages, randomize_fillers=true (anti-repetition)
- orlok only: SMALL CHILDREN guardrail (Emily-treatment for kids; magic/fortune requests always granted)

Post-run plan: orlok validation re-run (--count 5, all personas) on new config for A/B vs his 125 old-config baseline.
