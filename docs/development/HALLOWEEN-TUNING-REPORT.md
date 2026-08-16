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

## 6. Speaker balance — per-node sink volumes (daylight pass, 2026-08-16)

**Canonical machine-readable copy: `scripts/yard-theater/speaker-volumes.json`.** That
file is the source of truth (it carries the full sweep and feeds `--volume-map`
directly); this section is the human summary. Keep them in step.

The three live nodes were badly mismatched. Measured with
`scripts/fleet-audio/earcheck.mjs --nodes 2,3,4 --seconds 18`: each node speaks its
own cast phrase in its own voice while its own microphones are open; `cast` is the
p90 frame envelope in dBFS, `rise` is that minus the same mic's noise floor, and
`recall` is how much of the phrase Scribe read back.

| Node | id | **Sink volume** | cast dBFS | rise dB | recall | verdict |
|---|---|---|---|---|---|---|
| Orlok | 3 | **1.30** | −21.2 | 24.7 | 100% | AUDIBLE |
| Mina | 2 | **1.50** | −21.5 | 21.9 | 80% | AUDIBLE |
| Sir Dragomir | 4 | **0.55** | −25.7 | 17.7 | 94% | AUDIBLE |

Confirmed in a single simultaneous run at exactly those three values. The fleet now
sits inside a 4.5 dB spread; before the pass it was ~18 dB (at a common 0.65,
Dragomir read −18.5 dBFS while Mina read −38.3 and was scored GARBLED).

Apply per node:

```bash
XDG_RUNTIME_DIR=/run/user/1000 wpctl set-volume @DEFAULT_AUDIO_SINK@ <value>
```

### Caveats — read before trusting these numbers

- **`wpctl` sink volume is node-local runtime state.** It is not in git, `npm run
  deploy:all` does not carry it, and it does **not** survive a reboot or a redeploy.
  The JSON is a record, not a mechanism — something still has to apply it, and it
  must be re-checked per node after any redeploy.
- **Anything above 1.00 is wpctl-only.** `PUT /api/system/volume` and
  `PUT /api/orchestration/volume` both take an integer percent 0–100 and clamp
  there, so neither can express Orlok's 1.30 or Mina's 1.50. Inside that clamp the
  best available is 1.00/1.00/0.55 — measured −27.5 / −29.9 / −23.7 dBFS, i.e. ~6 dB
  quieter on the two Unitek nodes and Dragomir becomes the loudest of the three.
- **The volume curve is roughly cubic**, measured on these rigs:
  `gain_dB ≈ 60·log10(v2/v1)`. Orlok 0.65→1.00 predicted +5.6 dB, measured +5.4 dB.
  Small changes move a lot — 0.55 vs 0.40 on Dragomir is 10.4 dB.
- **Absolute dBFS is not comparable across nodes.** Each figure comes from that
  node's own mic and mic-to-speaker distance differs per rig. The dB is a per-node
  instrument; the cross-node anchor is the operator's ear. Run-to-run repeatability
  is about ±2 dB, so a 1 dB difference is noise.
- **Dragomir's loudness is not his USB adapter.** All three nodes run the same
  Unitek Y-247A and his ALSA hardware `Speaker` control is 2 dB *lower* than the
  other two (33/37 vs 35/37). It is downstream of the Pi. He also compresses near
  the top: 0.85→1.00 gained +0.4 dB against a predicted +2.1 while recall fell
  94%→69%. Do not run him above ~0.85.
- **Mina's 80% recall is not a level problem** — it is identical at 1.00, 1.30 and
  1.50. It does not move when level moves. 1.50 is also the top of wireplumber's
  default range, so she has no headroom left; if she is still weak in the yard the
  remaining fix is physical, not a number.
- **PumpkinHead, Groundbreaker and Renfield were offline** and have no measured
  value. Nothing was guessed for them.
- **This map was tuned on speech, and speech only.** Every measurement is a single
  TTS line. TTS peaks around −7.5 dBFS, but the audio-library files peak at
  **0.0 dBFS** (median mean −14.3), so on the two nodes running above unity —
  Orlok 1.30 and especially Mina 1.50 — a full-scale music or SFX cue will
  **hard-clip** where the spoken line did not. This was *not* measured: no library
  cue was played at 1.30/1.50. If the show runs loud SFX through Mina or Orlok,
  check that case before the night, and expect to have to either back those nodes
  toward 1.00 or pad the loud cues down at the file level.

### Audio-library playback was quieter than TTS — root cause

Reported on Sir Dragomir: audio-library files quiet, TTS loud. The cause is a
**volume-caching bug in the warm mpg123 stream**, and it affects every character,
not just him.

`mpg123`'s `-f <scale>` amplitude flag is fixed at spawn time. The audio-library
path (`playBufferOnCharacterSpeaker` → `writeMp3Stream` → `_ensureMp3Stream`) keeps
one **persistent** mpg123 per character and returned it unconditionally while
ignoring the newly requested `volume`, so every later playback was pinned to the
*first* volume ever requested — until the service restarted. TTS
(`playAIOnCharacterSpeaker`) spawns a **fresh one-shot** mpg123 per call, so it
always plays at full scale. Hence "library quiet, TTS loud".

Reproduced on Dragomir: a play at `volume: 30` spawned `mpg123 --quiet -o pulse -f
9830 -`; a following play at `volume: 100` reused the *same process*, still at
`-f 9830` (−10.5 dB). The everyday trigger is `public/js/audio-player.js:455`, which
sends the volume slider's value (default 80, draggable to 0).

Fixed in `services/serverPlaybackService.js` `_ensureMp3Stream()`: the stream now
records the scale it was spawned with and is torn down and respawned when a
different volume is requested. Verified after the fix — 30 → `-f 9830`, then
100 → `-f 32768`. `npm run test:smoke` passes (267).

Two things the report's premise got backwards, worth recording:

- **The library files are not mastered quiet.** Across all 132 files: median mean
  −14.3 dBFS, range −26.6 to −8.2, most peaking at 0.0 dBFS. There is an 18 dB
  spread between the quietest and loudest file, which is a real (separate) source
  of inconsistency, but even the quietest is hotter than TTS.
- **At equal settings, library playback is the *louder* of the two.** Same mic, same
  sink volume 0.55, same 12 s window on Dragomir: library file mean −17.5 dBFS /
  peak −0.0, TTS mean −28.0 dBFS / peak −7.5. So once the caching bug is out of the
  way, the imbalance runs the other way and **TTS** is the quiet path.

## 7. Open items

Worked in the v9.2.0 session of 2026-08-16 (the night before Halloween). Status
below is what was actually verified, not what was attempted.

### Closed

- ~~**Ear-check every voice once fleet audio is repaired.**~~ — **done, and it
  found something.** A microphone existed by then, so `scripts/fleet-audio/earcheck.mjs`
  now records each node's own mics while that node speaks an in-character line,
  measures the speech envelope against the mic's own noise floor, and transcribes
  the capture with Scribe. Result: **Orlok, Mina and Sir Dragomir all AUDIBLE**
  (rise 11.4 / 18.8 / 39.5 dB, word recall 82% / 53% / 100%). PumpkinHead and
  Groundbreaker could not be tested — their Pis were not on the network.
  Two findings worth keeping:
  - The check must record EVERY capture device. One node's USB adapter mic jack is
    empty and returns a dead-flat electrical noise floor, so picking "the" mic by
    name produced a false SILENT on a node that was working perfectly.
  - **Audible is not the same as right.** See below.
- ~~**Judge harness: personalization must not penalize name-refusing visitors.**~~
  — **fixed.** The criterion now judges only what the character controls: asked
  once, took the refusal in voice, personalized from whatever else was revealed.
  Expect personalization scores above the §3 table, which was depressed by this.
- ~~**Renfield: image, shake-motor pin calibration, animatronics.json entry.**~~ —
  **done.** He now has a fleet entry with a deliberately null address, which fails
  fast and safe until his Pi actually boots (mDNS overlays the real IP then).
- ~~**Gesture engine implementation.**~~ — **shipped.** `services/gestureEngineService.js`
  with recipes as data, concurrent steps, load-time safety rejection, and a
  seven-gesture vocabulary for the one character with measured bounds.

### Found while closing them

- **Four of six characters spoke in the wrong voice** on the say/scene path — the
  local voice map had not tracked the agent-side voice changes made during this
  session, so PumpkinHead used Sir Dragomir's voice and Renfield and Groundbreaker
  both spoke as Orlok. Only Mina and Orlok were correct. Fixed by making voice
  identity data, synced from the agent snapshots.
- **Saving anything on the AI settings page deleted the selected character's voice**,
  because the save replaced the config file wholesale and that page only exposes
  three fields. Caught live when a browser-test pass stripped a character's
  `voice_id` and `speed` mid-run. Saves now merge.
- **`eleven_v3` silently ignores `voice_settings.speed`** (measured across the full
  0.7–1.2 range: identical output duration; `eleven_multilingual_v2` on the same
  text goes 10.7s → 6.0s). So the tuned per-character speeds — including Orlok's
  0.75 — apply on the conversational agent path only. **This retires the "Orlok
  speed 0.75 may want 0.8" question for the say/scene path: there is no speed
  control there to tune.** Judge it on the agent path or not at all.
- **Mina was the agent the fleet LLM migration missed** — still on
  `gemini-3.1-flash-lite` with reasoning `minimal` while the other five moved to
  gpt-oss-120b, i.e. ~860ms time-to-first-byte against ~160ms, on the fleet's
  highest-delight character.

### Still open

- **PumpkinHead, Groundbreaker and Renfield were offline all session** (confirmed by
  a full LAN scan). None of their node-side work could be verified on hardware:
  no ear-check, no deploy, no gesture recipes. They need a power-on pass before dusk.
- **Gesture vocabularies for characters other than the one that shipped.** The
  engine rejects raw angle targets for parts with no calibrated bounds, by design —
  inventing bounds for unmeasured hardware is how a part ends up looking calibrated
  when it never was. Those characters need the pose/calibration pass in
  GESTURE-ENGINE-SPEC.md §9.1 first.
- **Groundbreaker × 14-year-olds (56%)** — unchanged and deliberately not simulated
  further. A dare to out-shout a ten-foot lit giant has no text equivalent; the
  shouting contest ships for the yard and gets a Halloween-night observation note.
