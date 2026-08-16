# Halloween AI Tuning Report — August 15–16, 2026 Session

The complete record of the judge-panel evaluation and data-driven tuning of the six
ElevenLabs character agents. All changes were ElevenLabs-side configuration (agents,
prompts, knowledge bases) plus standalone tooling — no application code was modified.
Snapshots of every agent config: `config/elevenlabs/` (restore instructions in its README).

## 1. Method

A judge panel of five simulated Halloween visitors (`scripts/halloween-judges/`):
mom with young kids, 14-year-old boy, 8-year-old girl, 50-year-old dad, 18-year-old —
each running scripted-scenario conversations (first visit, return visit carrying
cross-character messages, groups, skeptics, silence, etc.) against the live agents via
the ElevenLabs simulate-conversation API. Every conversation scored on four universal
criteria (in-character, pacing, personalization, return-hook) plus one per-judge
delight criterion. Main panel: 625 conversations (624 clean). Additional validation
batteries: Orlok A/B (25), Renfield (25 smoke + 25 + 25 re-test). Text simulations
consume no voice credits (verified: zero credit-counter movement during the run).

## 2. Headline findings

### Latency (from real-call metrics, per-turn LLM time-to-first-byte)
| Config | LLM ttfb |
|---|---|
| gemini-3.1-flash-lite + reasoning effort (Orlok, old) | 3,054 ms median / 4,450 ms p90 |
| gemini-3.1-flash-lite + minimal effort (Mina, old) | 860 ms |
| gpt-oss-120b, no reasoning (fleet, new) | ~160 ms |

Reasoning effort on a conversational character buys nothing and costs seconds; depth
lives in prompts and knowledge bases. **All agents moved to gpt-oss-120b, reasoning off.**

### Orlok A/B (125 old-config vs 25 new-config conversations)
| Criterion | Old | New |
|---|---|---|
| In character | 100% | 100% |
| Pacing | 49% | 92% |
| Personalization | 71% | 72% |
| Return hook | 99% | 96% |
| **Delight (all judges)** | **57%** | **80%** |

Same character fidelity, ~20x faster, +23 points of delight. Mom judge went 24% → 100%
after the kid-mode rule.

### Reply length (the user's hunch, confirmed with data)
Across every judge, successful conversations averaged 36–40 words per agent turn;
failures 20–29. Sentence count did not differentiate success — **substance per turn
(~40 words) does**. Orlok's original 8-word/2-sentence law had him at 20 w/turn with
the fleet's lowest delight; recalibrated to 2–4 short clauses (~40 words) keeping his
clipped cadence. The judge pacing criterion was likewise rewritten from
sentence-counting to a ~50-word standard. Renfield later proved the ceiling is real
in both directions: his Works/Gifts material pushed him to 54 avg / 113 max words —
fixed with a hard cap and the installment rule (enumerate across turns, never in one
breath), same as the story-beats discipline — re-test: 47 avg / 76 max words with
25/25 delight.

### Scare audit ("this isn't Disney")
The 18-year-old clip-worthy judge — the hardest scare standard — passed **100% of
conversations fleet-wide** (Orlok 30/30, Mina 25/25, PumpkinHead 25/25). PumpkinHead's
HUNT MODE lands 96% with skeptical 14-year-olds. Every "not scary" complaint in the
data (13 total, all old-config Orlok) was actually about *repetition*, not tameness —
answered with the scare-escalation rule: mockery never earns the same rebuke twice;
each fresh insolence earns a darker, more personal strike.

## 3. Final fleet scorecard

Main-panel numbers; pacing percentages for the first five agents were judged under the
old sentence-count criterion and understate current behavior (see §2). Delight is the
per-judge criterion aggregated.

| Agent | n | In-char | Personalization | Return hook | Delight |
|---|---|---|---|---|---|
| Orlok (new config) | 25 | 100% | 72% | 96% | 80% |
| Mina | 125 | 100% | 74% | 85% | **93%** |
| Sir Dragomir | 124 | 100% | 50% | 89% | 89% |
| PumpkinHead | 125 | 100% | 47% | 98% | 91% |
| Groundbreaker | 125 | 97% | 76% | 100% | 77% |
| **Renfield** (final, post word-cap) | 25 | 100% | 48% | 100% | **100%** |

Notes: Renfield's final battery scored **25/25 delight — perfect across all five
judges** — the only perfect delight score in the fleet. His word-cap re-test brought
replies from 54 avg/113 max words to 47 avg/76 max; residual pacing flags reflect his
wordy-mania style running slightly over the 50-word line, accepted given the perfect
delight. Groundbreaker's weak spot is the skeptical 14-year-old (56%; a
shouting-contest mechanic re-tested at 3/8) — judged UNMEASURABLE in text simulation:
a dare to out-shout a ten-foot lit giant has no text equivalent. The contest, the
escalating personal comebacks, and the war-credential burn are shipped for the real
yard; observe live on the night rather than in sims. Personalization scores are depressed by a judge artifact
(visitors who refuse to give a name score as failures) — known harness limitation.

## 4. What changed, per character (all in `config/elevenlabs/`)

- **Fleet-wide:** eleven_v3_conversational + expressive mode; gpt-oss-120b, no
  reasoning; ASR keyword boosting (character/guest/place names); background voice
  detection for crowds; in-character randomized soft-timeout fillers; Night Protocol
  (repeat-guest recognition, group handling, cross-character errand-weaving);
  BECKONING blocks (silence → escalating lures → parting hooks).
- **Orlok:** kid mode (Emily-treatment for all children, magic/fortunes always
  granted, persists whole conversation); scare escalation; length recalibration;
  accent-tag decay fix; turn timeout 15→12s.
- **Mina:** persona rebuilt on the Nosferatu-2024 Ellen material (the bond: "at first
  it was sweet… then it turned to torture"); once-per-conversation trance; dream-gift
  omens (one per visit; more if you return); THE WAITING — 1462 from inside the walls,
  rhyming with her wait for Thomas; the locked-door ending; three Romanian songs
  (lullaby / waiting song / morning song) via verified [sings] tag, singing as a
  beckoning lure.
- **Sir Dragomir:** honor made explicit; the SECRET (the Count was Vlad Țepeș, yielded
  in fragments, never the word "vampire" first); five war stories as collectible
  chapters told in beats; Romanian war cries ([shouts] PENTRU ȚARĂ!); the deputizing
  mechanic (posts, ranks, debriefs); the box of gold at his feet — five centuries of
  unspent pay, opened only as an honor, never on demand.
- **PumpkinHead:** origin corrected — an evil little plant that grew unasked; Orlok is
  landlord, not creator; lives on the soul-quota for the garden; Warner family holds
  the root (never hunted); KID SPOOK MODE for Emily always.
- **Groundbreaker:** 10×5 ft, lit on the roofline; Street Duty (says nearly anything
  to tempt people off the street); the Rock War (threw rocks at the Turks, 1462); the
  secret he cannot keep ("VLAD. … OOPS." → sends guests to the knight); the oath shout
  to the hill.
- **Renfield (new):** the master's mad British solicitor — his paperwork sent Thomas
  to the mountains; he drew the covenant on Mina and believes the works are still
  open (the Gifts: lives, then perpetuity — "the mail is slow from the mountains");
  the registry; the warnings ("SIGN NOTHING tonight"); the soul-ledger feud with
  PumpkinHead; the tremble ("the signature") mapping to his 12V shake motor; lurk
  scenes (data/character-6/scenes.json, sayThis + concurrent motor); Gilbert &
  Sullivan law-school songs; hard 50-word cap with the installment rule.

The 1462 canon is a three-voice braid — Dragomir tells the war, Groundbreaker tells
the rocks, Mina tells the waiting — with the Vlad secret discoverable by walking the
yard, and Renfield holding its paperwork.

## 5. Verified-by-test claims

- Audio tags render as sounds, not words: TTS→STT round-trips on the actual character
  voices confirmed no tag text leaks ([labored breath] = heavy pause; [sighs] = audible
  "Ah"; [sings] on Romanian = clean transcript + 18% melodic stretch).
- Simulated conversations consume no voice credits (live counter check).
- Cross-node speech theater needs no code: per-node Say/Ask-AI orchestration endpoints
  already support scripted duets between animatronics.

## 6. Open items

- Ear-check every voice once fleet audio is repaired (all claims above are
  transcript/timing-verified, not listened-to). Orlok speed 0.75 may want 0.8.
- Renfield hardware: node build, animatronics.json entry (deliberately deferred),
  image at public/images/characters/renfield.jpg, shake-motor pin calibration.
- Gesture engine implementation per docs/development/GESTURE-ENGINE-SPEC.md.
- Groundbreaker × 14-year-olds (56%) if that audience matters on the night.
- Judge harness: personalization criterion should not penalize name-refusing visitors.
