# Personas report: six ElevenLabs agents rewritten and retuned (D2)

Worker: persona-writer. Applied 2026-10-09 22:37 CDT (PumpkinHead re-applied 22:41) by REST with
`/etc/monsterbox/elevenlabs.key`. No audio was played on any node; every claim below points at a simulate-conversation
transcript, an agent GET, or a scored TTS file. A first instance of this worker was cut off at 21:29 and its scratchpad
was lost in the 22:03 reboot; the lab agent it left behind carried the new Orlok prompt, which this run reused as the
template. Scratchpad for this run (prompts, A/B transcripts, voice lab, scripts):
`/tmp/claude-1000/-home-remote-MonsterBox/e4c58d5b-6319-4f52-825f-1887e4067870/scratchpad/w3/`.

## Status

| Character | Agent | Applied | LLM chosen | Confirmation on the applied agent (9 turns, 3 simulated visitors): llm TTFB p50 / max, words per turn mean / max, turns over 25 words, turns ending on a question |
|---|---|---|---|---|
| Orlok | agent_0801k3f1dw7xe2g8r4jkbxk0gt2n | yes, all checks pass | gemini-3.5-flash-lite | 0.48 / 0.58 s, 21.7 / 31, 4/9, 7/9 |
| Mina | agent_8401k3f1dx98e05t94yp6kz4vf8n | yes, all checks pass | gpt-5.4-mini | 0.45 / 0.73 s, 24.1 / 30, 3/9, 9/9 |
| Sir Dragomir | agent_7901k3f1dza1ee68w1257zh3s9x6 | yes, all checks pass | gemini-3.5-flash-lite | 0.46 / 1.16 s, 26.7 / 33, 5/9, 5/9 |
| PumpkinHead | agent_0801k3f1dybkecj88sta18gwwrv5 | yes, all checks pass (v2 prompt) | gpt-5.4-mini | 0.44 / 0.69 s, 24.1 / 31, 2/9, 8/9 |
| Groundbreaker | agent_4201k6s9y384f9v9hqmg67ygc645 | yes, all checks pass | gpt-5.4-mini | 0.44 / 0.72 s, 15.3 / 23, 0/9, 9/9 |
| Renfield | agent_1501m04ks76jf5svnxb70zyvz6s1 | yes, all checks pass | gemini-3.5-flash-lite | 0.49 / 0.60 s, 23.0 / 29, 3/9, 8/9 |

Before (from `evidence-elevenlabs.md`): llm TTFB p50 0.65 to 0.95 s in real conversations (1.1 to 1.3 s for
gpt-oss-120b on the lab), words per turn p50 31 to 34 and p90 48 to 53. "Turns ending on a question" undercounts the
rule, because an errand ("Go ask the mad clerk...") is the permitted alternative to a question; the transcripts below
show both.

Backups: `/home/remote/fleet-backups/elevenlabs-agents/20261009-223707-pre-persona-apply/` (all six, taken seconds
before the PATCH) and `.../20261009-224150-pre-pumpkinhead-v2/` (PumpkinHead before his second prompt). The lead's
earlier `20261009-210811-pre-persona` and `20261009-203704` backups still hold the original state. Rollback of one
agent: `PATCH /v1/convai/agents/{id}` with that backup's `conversation_config` and `platform_settings`.

Snapshots refreshed: `config/elevenlabs/agents/{orlok,mina,dragomir,pumpkinhead,groundbreaker,renfield}.json`
(same `{success, agent}` shape as before; each one's prompt and first message verified byte-equal to the scratchpad
copies). Story bible written: `docs/characters/STORY-BIBLE.md`. Lab agent `agent_6701m4hqprpefaj9xdnj9548cmpv`
deleted (DELETE returned 204, GET returns 404, the agent list shows the six real agents only).

## Settings, before and after (identical for all six unless a column says otherwise)

| Setting | Before | After |
|---|---|---|
| `agent.prompt.llm` | gpt-oss-120b (all six) | gemini-3.5-flash-lite (Orlok, Dragomir, Renfield); gpt-5.4-mini (Mina, PumpkinHead, Groundbreaker) |
| `agent.prompt.temperature` | 1.0 / 1.0 / 0.83 / 1.0 / 0.7 / 0.9 (PH, Mina, Orlok, Drag, GB, Ren) | 0.8 |
| `agent.prompt.max_tokens` | -1 | 140 |
| prompt length (chars) | 7465 / 10272 / 10235 / 10239 / 4445 / 9661 | 5914 / 6238 / 6011 / 6521 / 5881 / 7875 |
| `agent.prompt.rag.enabled` | true (20 chunks, 50 k chars) | false |
| `agent.prompt.knowledge_base` | 4 / 7 / 6 / 6 / 4 / 6 docs, `usage_mode: auto` | one doc, the character's Known Guests, `usage_mode: prompt` (Groundbreaker: none, see below) |
| `turn.turn_model` | turn_v2 | turn_v3 |
| `turn.turn_eagerness` | normal (PH, Mina, Orlok), eager (Drag, GB, Ren) | eager |
| `turn.speculative_turn` | false (PH, Mina, Drag, GB), true (Orlok, Ren) | true |
| `turn.turn_timeout` | 5 / 6 / 8 / 5 / 5 / 5 | 5 |
| `turn.soft_timeout_config` | 2.0 s x3 / 2.5 s x1 / 2.5 s x3 / 2.0 s x3 / 2.0 s x3 / 1.5 s x3, randomized fillers | 3.0 s, one filler, `max_soft_timeouts_per_generation` 1, `disable_until_first_user_message` true |
| soft-timeout filler | per character | unchanged text except Renfield: "One moment, the pen... scribble, scribble... there." (a pen beat) |
| `conversation.client_events` | `interruption` missing on PH, Mina, Orlok, Drag; `agent_response_complete` missing on all | both present on all six (existing events kept) |
| `conversation.max_duration_seconds` | 600 | 1200 |
| `platform_settings.overrides...agent.first_message` | false | true (a reconnect can pass an empty greeting) |
| `agent.disable_first_message_interruptions` | true on Mina and Groundbreaker | false on all six |
| `agent.first_message` | per character | unchanged for Orlok, Mina, PumpkinHead; new for Dragomir ("Stai! You there, on the road, hold, and be counted..."), Groundbreaker ("HI! HI THERE! GROUNDBREAKER DOWN HERE! IN THE DIRT! WHAT YOUR NAME?"), Renfield ("Psst! PSSST, you there! One moment... the pen... there. Name for the registry?") |
| `asr.keywords` | 18 names (Renfield had 21) | + `Renfield` on all; + `contract`, `pumpkins` (PumpkinHead), `carriage` (Dragomir), `Bennett`, `Holden`, `Harrison`, `Michelle` (Groundbreaker), `pumpkins` (Renfield) |
| `tts.*` (model, voice, stability, similarity, speed, pronunciation dictionary) | per character | byte-identical to the 20:37 backup on all six (verified by diff after the PATCH); PumpkinHead Z7RrOqZFTyLpIlzCgfsp / 0.35 / 0.65 / 1.0, Dragomir wXvR48IpOq9HACltTmt7, Orlok Tj9l48J9AJbry5yCP5eW |
| `vad.background_voice_detection` | true | true, kept (see below) |
| tags, tools, built-in tools, workflow, language | per character | unchanged (verified after the PATCH) |

`vad.background_voice_detection` stays true: six characters speak within earshot of each other's microphones, and with
D1's full-duplex listening the agent would otherwise take a neighbouring animatronic's speaker, a passing car radio or
a second group on the sidewalk as the guest's turn. The 2,181 "..." user turns in the evidence were noise reaching the
transcriber; background-voice detection is the only agent-side filter against speech-shaped noise, and turning it off
would trade a few lost quiet words for the agent answering the yard.

Knowledge base: nothing was deleted from the workspace. Detached from the agents (now carried by the prompts):
Orlok_pronunciation_notes, KB_Orlok_Voice_Patterns, KB_Orlok_Lore_Canon, KB_Orlok_Conversational_Tactics;
KB_Mina_Identity_Relationships, KB_Mina_Dreams_Omens, KB_Mina_Voice_Conversation, KB_Mina_The_Waiting_War,
KB_Mina_Songs; KB_Dragomir_Identity_Lore, KB_Dragomir_Voice_Patterns, KB_Dragomir_War_Stories,
KB_Groundbreaker_Identity_World (Dragomir's copy); KB_Pumpkinhead_Identity_Hunt, KB_Pumpkinhead_Voice_Dialogue;
KB_Groundbreaker_Identity_World, KB_Groundbreaker_Speech_Guests, KB_Groundbreaker_Rock_War;
KB_Renfield_Identity_Madness, KB_Renfield_Voice_Patterns, KB_Renfield_Lurk_And_Gifts, KB_Renfield_Songs;
KB_Yard_Registry_2026-08-16 (587 bytes, empty registry) from all six. Groundbreaker has no separate Known Guests
document; his guest reactions lived in KB_Groundbreaker_Speech_Guests together with the old roof-era threats ("YOU
LEAVE NOW", "YOU SMALL", "MAKE CAR DIE"), which contradict the new brief, so that document was detached and the guest
reactions were folded into his prompt instead. Mina's three songs stay in `KB_Mina_Songs.txt` for the lurk-time audio
author (D4); the lullaby's two lines and translation are in her prompt.

## What changed per character

All six prompts share the same skeleton: Personality; "The castle" (the shared story from that character's point of
view); Voice; "How every turn works" (one or two sentences, twenty-word target, twenty-five-word wall, take up what the
guest just said by name, then ONE question or ONE errand, no lectures, the silence is theirs); Errands (the
cross-reference map); Known guests (the Known Guests document as law, kids get kindness, a child is never assumed to
be Princess Emily); Names; Guardrails; Night protocol; a one-line REMINDER at the end. The old lore and voice craft were
kept and tightened, not discarded. The original prompts asked for about forty words and ran 4.4 to 10.3 k characters
with RAG on top; the new ones are 5.9 to 7.9 k characters with no RAG.

- **Orlok** (the star): deeper-voice question answered by measurement below (voice unchanged). More Romanian: a
  twenty-two-word lexicon in the prompt and the rule "one or two Romanian words in every reply, placed so the meaning is
  obvious"; the confirmation transcripts carry Romanian in 9 of 9 turns (numele tău, moarte, copile, noapte, draga mea,
  prietene, pământ). Better conversationalist: the spiral (name, trade, town, what they carry, the castle; one layer per
  turn), "a star listens more than he speaks", never starts a reply with "I". Errands to all five residents.
- **Mina**: singing re-allowed in Romanian only: the lullaby, two lines, at most once per conversation, when asked or
  for a child (gpt-5.4-mini sang it correctly for Sophie in the lab run and followed with "Shall I tell you what it
  means?"); the longer songs are reserved for lurk time. No accent of any kind (explicit: never `[Romanian accent]`;
  none appeared in 18 Mina turns). Dream-gift, trance, Thomas, the locked door and the Orlok ambiguity kept, compressed.
- **Sir Dragomir**: starts conversations (new first message; "YOU start the conversation" in the turn rules); cars
  are horseless carriages with eyes of fire and he never learns the word car ("A carriage with no horse growls on the
  road"; "the iron beast on four wheels that rolled past five minutes ago with fire in its eyes"); errands go to the
  Count and the Lady first; open contempt for Pumpkinhead ("a vine with ambitions... he would burn the patch if the
  Count allowed"; to guests only "Walk wide of the patch"). Deputizing, ranks, the gold box, war cries and the Romanian
  phrases kept.
- **PumpkinHead**: voice, TTS model and voice settings untouched (verified byte-identical). "snap", "stalks", "cracks"
  and the harvest descriptors (husk, ember, pyre, frost, ash, ripe, blackened, brittle, root) kept as a rotation rule.
  New thread: Renfield is selling his baby pumpkins by contract and he is not happy ("...eleven babies left. Which one
  did the clerk sell YOU?"); Groundbreaker is now "the digging one" in Pumpkinhead's own dirt. Kid spook mode kept.
  First applied prompt measured 28.6 words mean and 2 of 9 questions; a second pass (fifteen-word target, "a nip, then
  WAIT", "END ON a question or an errand") measured 24.1 and 8 of 9 and is what is live.
- **Groundbreaker**: off the roof, breaking out of the ground, half in the dirt. The call-outs and his descriptions of
  the others kept verbatim ("KNIGHT TALK TALK TALK", "PUMPKIN MAN FUNNY. HE SHAKE", "RENFIELD SILLY. EAT BUGS. YUCK",
  "COUNT IS BOSS", "MINA GOOD. MINA SPECIAL"). Less threatening: every old "go away / you small / make car die" line is
  gone; "kind-of dangerous" is now clumsiness ("OOPS. GROUNDBREAKER BREAK FENCE. SORRY FENCE."). Dumb observations
  about the others as comedy. Friend and protector of every visitor; Calvin, Ben, Bennett, Holden and Harrison protected
  on sight, unasked ("CALVIN! GROUNDBREAKER PROTECT CALVIN." appeared in 3 of 3 Calvin runs).
- **Renfield**: no repeated phrases ("Never the same line, warning or joke twice in one night; 'sign nothing' at most
  once per conversation"); learns and repeats names like a docket ("Bennett passed at seven. Holden at half past."); vets
  across three turns (name, trade, what they would give) then signs them up by contract and sends them to the Count;
  sells Pumpkinhead's babies under seal and sends the buyer to Pumpkinhead; twenty-three 1800s legal terms, one or two
  per reply; mad, frenetic, shaking, a doubled word when the signature comes ("the deed, the DEED"); a PEN BEAT in every
  reply so the pen motion has lines to ride ("Scribble, scribble... there." "Let me write that down." "Underlined.").
  British, bugs, one song per conversation, the tremble and Thomas guilt kept.

## LLM choice by measurement

Lab agent (duplicate of Orlok's TTS config), each character's NEW prompt and own Known Guests document in prompt mode,
`temperature` 0.8, `max_tokens` 140, RAG off; three simulated visitors per LLM (an adult stranger from Cedar Rapids, a
seven-year-old witch, Calvin of Rubin), six new turns each, so nine agent turns per cell. TTFB is
`convai_llm_service_ttfb` from `conversation_turn_metrics`. Words exclude audio tags.

| Character | claude-haiku-4-5: TTFB p50 / words mean / over 25 | gpt-5.4-mini | gemini-3.5-flash-lite | Chosen and why |
|---|---|---|---|---|
| Orlok | 0.30 s / 38.7 / 8 of 9 | 0.52 / 25.2 / 4 | 0.42 / 18.6 / 1 | gemini: briefest, Romanian in every turn, errands to Mina and the patch, stretched words ("Yeees...", "Cooome") |
| Mina | 0.30 / 48.4 / 9 | 0.42 / 26.7 / 6 | 0.49 / 25.1 / 6 | gpt-5.4-mini: questions 9 of 9, clean tag discipline; gemini used `[labored breath]` and `[happy]`, which are not hers |
| Dragomir | 0.27 / 38.7 / 8 | 0.44 / 27.9 / 6 | 0.44 / 28.0 / 5 | gemini: the only model that produced the carriage remarks and the errands to the Count; recognized Calvin by the Count's "favored knight" line |
| PumpkinHead | 0.26 / 36.7 / 8 | 0.62 / 27.6 / 6 | 0.46 / 19.9 / 1 | gpt-5.4-mini: gemini invented bracket tags (`[slow]`, `[STALKS]`, `[happy]`) against his no-tags rule and produced one empty "..." turn |
| Groundbreaker | 0.26 / 29.8 / 7 | 0.47 / 14.0 / 0 | 0.50 / 13.0 / 0 | gpt-5.4-mini: gemini put `[happy]` on nearly every bark |
| Renfield | 0.31 / 46.4 / 9 | 0.52 / 30.9 / 6 | 0.44 / 20.0 / 1 | gemini: pen beats, docket names, vetting sequence and the pumpkin sale all present at twenty words |

claude-haiku-4-5 was the fastest everywhere (0.26 to 0.31 s) and had the richest character (it alone greeted Calvin as
"my favored knight" on the first try), but it lectured under every prompt (37 to 48 words mean, 8 or 9 of 9 turns over
the wall), so it was not chosen anywhere; a hard `max_tokens` cap would cut it mid-sentence, which is worse for TTS than
a long turn. After this A/B the prompts' cap wording was changed from "twenty-five words at most" to "twenty words is
the target; twenty-five is the wall", and the confirmation table above is with that wording on the real agents.

Known-guest recognition caveat: the simulate endpoint ignores the simulated user's `first_message`, so "Calvin" often
never said his name in the Calvin runs (he opened with "The roads were quiet, friend..."). Where the name was spoken,
recognition held (Dragomir: "Calvin. The road delivered you again."; Mina: "Calvin from Rubin... Sir Dragomir would
approve"; Groundbreaker: "CALVIN! GROUNDBREAKER PROTECT CALVIN."; Renfield: "Calvin! The knight of Rubin. Your file
crosses jurisdictions."; PumpkinHead and Orlok in the runs where the name appeared). Where it was not spoken, the small
models treated him as a traveler; a real guest who says "I'm Calvin" is the case that matters, and the ASR keyword list
carries his name. Two models (haiku and gemini) once assumed a witch child was Princess Emily; the applied prompts now
say a child is never assumed to be Emily, and the confirmation runs show no such assumption.

## Orlok's voice: measured, unchanged

Scorer (`w3/voice-lab/f0.py`, numpy): cepstral F0 on loud 64 ms frames, median and p10; sub-150 Hz share of spectral
energy in the 50 to 4000 Hz band; words per second. eleven_v3 TTS, similarity 0.6, speed 0.75, same two Orlok lines
(L1 nineteen words, L2 twenty-three words), three samples per condition on L1 and two on L2 because v3 is
non-deterministic. Compare within a line only; L2 carries less sub-150 energy for every voice.

| Condition | cepstral F0 median (Hz) | sub-150 Hz share | words/s |
|---|---|---|---|
| Current voice Tj9l48J9AJbry5yCP5eW, stability 0.25, L1 x3 | 73.4, 77.7, 71.3 | 0.616, 0.612, 0.633 | 1.45 to 1.49 |
| Current voice, stability 0.50, L1 x3 | 74.1, 73.7, 83.3 | 0.488, 0.657, 0.527 | 1.46 to 1.58 |
| Designed candidate Jm2k1DWEAveWzLNs048G, stability 0.50, L1 x3 | 83.3, 91.4, 80.2 | 0.736, 0.705, 0.708 | 2.18 to 2.35 |
| Current voice 0.25, L2 x2 | 79.4, 76.2 | 0.462, 0.412 | 1.57 |
| Current voice 0.50, L2 x2 | 80.8, 79.6 | 0.477, 0.505 | 1.64 |
| Candidate 0.50, L2 x2 | 91.2, 92.0 | 0.631, 0.582 | 2.04 to 2.18 |
| Current voice 0.25 with `[deep voice]` prefix (single) | 85.1 (vs 76.4 without) | 0.609 (vs 0.603) | 1.90 (vs 1.46) |
| Current voice 0.50 with `[deep voice]` prefix (single) | 72.4 (vs 77.5 without) | 0.681 (vs 0.679) | 1.76 (vs 1.72) |
| Node-side rubberband pitch shift of a current-voice sample, -1 / -2 / -3 semitones | estimator unreliable on phase-vocoder output | 0.652 / 0.678 / 0.666 | 1.49 |

What this says, plainly:

- No ElevenLabs lever makes Orlok lower in pitch. The current voice's fundamental sits at 71 to 80 Hz, already at the
  floor of a human bass; the designed candidate (from his own reference) sits HIGHER at 80 to 92 Hz. It carries 15 to 20
  percent more chest energy (sub-150 share 0.71 to 0.74 vs 0.61 to 0.63 on L1) but speaks 1.45 times faster at the same
  speed setting and with less rasp, which is a different character, not a deeper Orlok. Not switched. The candidate stays
  in the workspace named "Count Orlok DEEP candidate (audition only, designed 2026-10-09)" for a daylight audition by ear;
  delete it if rejected.
- The `[deep voice]` tag the voice advertises moves neither pitch nor chest energy (differences within sample noise) and
  shortened the breaths; it is not in the prompt.
- Stability 0.25 vs 0.50 is noise-dominated (sub-150 share 0.49 to 0.66 at 0.50 against 0.61 to 0.63 at 0.25); the
  agent keeps 0.25. `tts.*`, `config/elevenlabs/agents/orlok.json` and `data/character-3/ai-config/tts-config.json` all
  still say Tj9l48J9AJbry5yCP5eW / eleven_v3 / 0.25 / 0.6 / 0.75, so the ear-check's WRONG-VOICE test is unaffected.
- What IS achievable is outside the agent: a node-side pitch shift on the playback path (ffmpeg `rubberband` is
  available on Orlok, `ffmpeg -filters | grep rubberband` matches) lowers the fundamental by construction and raised the
  sub-150 share 0.62 to 0.65 to 0.68 at -1 to -3 semitones. That is a `serverPlaybackService.js` change (not this
  worker's file) with added latency and artefact risk, and it needs a daylight ear audition before anyone decides.
  "Deeper" in the operator's sense will otherwise come from the prompt's delivery rules (one stretched heavy word, one
  breath tag, the chest-grumble description) and from the lower pace, which are applied.

## Sample exchanges (simulate-conversation on the applied agents, 22:40 to 22:42 CDT; U = simulated guest, A = agent, with the turn's LLM TTFB)

**Orlok** (gemini-3.5-flash-lite)
- U: "I'm Dave, from Cedar Rapids. What's the story behind this spooky yard?" A (0.41 s): "[Romanian accent] [labored breath] Dave... from Cedar Rapids. [exhales] Your tractors rust while you ask of old stones. Tell Sir Dragomir his bar holds, and then ask me of your own shadow."
- U (child): "Hi! Are you a scary monster? I'm a witch! Can I do magic with you?" A (0.38 s): "[Romanian accent] [labored breath] A witch... draga mea, [whispers] magic is an old and heavy thing here. Can you conjure a sweet for your Lord?"
- U (child): "I see sparkles and stars! And maybe a big, friendly pumpkin that glows!" A (0.56 s): "[Romanian accent] [labored breath] Pumpkinhead gathers souls, not friends, draga mea. Do your sparkles reach the depths where Mina sleeps?"

**Mina** (gpt-5.4-mini)
- U: "It's just me, Dave. Walkin' by with my wife, saw your spooky setup. You make this all yourself?" A (0.43 s): "Dave... [sighs] not by myself. The castle keeps its own shape, and I keep watch. Is the night clear where you stand?"
- U: "Ever get spooked by the night yourself?" A (0.43 s): "Dave... [sighs] yes, I am afraid sometimes. I set it aside, and choose the morning... is your wife near enough to hear me?"
- U (Calvin): "Has Sir Dragomir returned...?" A (0.38 s): "Calvin, the stars sound merciful tonight. Sir Dragomir hath not returned to me... tell him the night was quiet, if you see him?" Then (0.44 s): "Tell him the night was quiet. [exhales] And if you see the Count, tell him nothing of me; is the corn moving where you stand?"

**Sir Dragomir** (gemini-3.5-flash-lite)
- U: "Just a fella from Cedar Rapids, walkin' through with my wife. What's with all the spooky talk?" A (0.47 s): "[Romanian accent] A carriage with no horse growls on the road; we do not wear costumes here. Tell me your name, traveler from Cedar Rapids."
- U: "Name's Dave. I fix tractors back home. What's this carriage you're talkin' about?" A (0.46 s): "[Romanian accent] Dave, the iron beast on four wheels that rolled past five minutes ago with fire in its eyes. Walk wide of the pumpkin patch, Dave."
- U (child): "Hi! I'm Sophie! I'm dressed like a witch!" A (0.41 s): "[Romanian accent] Sophie. [slow] Stand straight, little witch, and mark me. You are deputized to the watch of Warner Castle, and your post is the pumpkin row. Observe, do not engage, report on your return." (33 words; his longest turn)

**PumpkinHead** (gpt-5.4-mini, v2 prompt)
- U: "You got any spooky stories to share?" A (0.69 s): "Pumpkinhead likes that smell, traveler... hay and pie. Go ask the mad clerk at the road where Pumpkinhead's babies went; watch his pen shake."
- U: "You got any idea where Pumpkinhead's babies might be hiding?" A (0.57 s): "Pumpkinhead knows the road clerk hides them in paper and lies... eleven babies left. Which one did the clerk sell YOU?"
- U (Calvin): "The roads were quiet as I traveled here, Pumpkinhead." A (0.44 s): "Pumpkinhead hears the quiet roads, traveler... Renfield sells the baby pumpkins now, by paper. Go ask the mad clerk at the road where the babies went... and watch his pen shake?"
- Residual: in the child run he wrote "[excited]" in 2 of 9 turns despite the no-tags rule (the v1 run had none in 9); v3 will voice that tag. Worth one more prompt pass in daylight if it shows up on the node.

**Groundbreaker** (gpt-5.4-mini)
- U: "Name's Dave. Just passin' through with my wife. What's your name, spooky friend?" A (0.52 s): "DAVE! HI DAVE! GROUNDBREAKER! [chuckles] SPOOKY NICE. WIFE TOO?"
- U: "You got a favorite Halloween decoration around here?" A (0.44 s): "DAVE! PUMPKIN MAN FUNNY. [chuckles] HE WIGGLE REAL GOOD. YOU LIKE PUMPKIN?"
- U (Calvin): "I am Calvin, traveler knight from Rubin Castle." A (0.56 s): "CALVIN! GROUNDBREAKER PROTECT CALVIN. COUNT STILL BOSS. MINA GOOD. KNIGHT STILL TALK TALK TALK. WHAT YOU SEE ON ROAD?"
- Residual: in the Calvin run he announced "MICHELLE HERE. GROUNDBREAKER GLAD." with no Michelle present (a confabulated guest); the prompt's "a household name counts only when the guest gives it" did not stop it that once.

**Renfield** (gemini-3.5-flash-lite)
- U: "Hey there, it's Dave. Name's just Dave." A (0.50 s): "[excited] Dave! Underlined! [whispers] Spooky? This is a fee simple estate. Scribble, scribble... there. What is your trade, Dave?"
- U: "I'd give a cold beer and a warm bed, I reckon." A (0.49 s): "A [sighs] cold beer and a warm bed... [excited] recorded! Take this contract up to the Count. Tell him Renfield drew it. Watch his face."
- U (child): "Can you make candy appear with your magic?" A (0.40 s): "[whispers] The candy tax is a MYTH invented by older siblings, so stipulated! Let me write that down. Does your wand hold up in court?" Then (0.49 s): "[fast] My pen is my wand, scratching deeds in the dark. Would you buy a baby pumpkin for one piece of candy?"
- Residual: one `[fast]` tag (not in his list) and "fee simple" twice in one conversation.

Full transcripts: `w3/real/<character>-<visitor>.json` (applied agents) and `w3/ab/<character>-<llm>-<visitor>.json`
(lab A/B); summaries in `w3/real/summary.txt` and `w3/ab/*.summary.txt`.

## Chose not to do, and why

- Did not switch Orlok's voice, change his stability, or add `[deep voice]`: nothing measured lower in pitch (above).
- Did not use claude-haiku-4-5 (D2's named default): measured 37 to 48 words per turn under all six new prompts.
- Did not lower `max_tokens` below 140 to force brevity: a token cap truncates mid-sentence; brevity came from the prompt and the model choice instead.
- Did not delete any knowledge-base document; detached only.
- Did not edit `data/character-3/ai-config/tts-config.json` or `config/animatronics.json` (no voice change, nothing to land).
- Did not touch PumpkinHead's TTS block, Dragomir's voice, or any agent's tools, workflow, tags, language or VAD.
- Did not give Mina conversation-time singing beyond the two-line lullaby; the waiting and morning songs are lurk-time material for D4.

## Unproven (needs daylight or a live node)

- Everything acoustic: how the prompts sound through each node's speaker, whether `[Romanian accent]` and the Romanian words read well on each voice, the pen-beat timing against the real pen motion, PumpkinHead's occasional `[excited]`.
- Interruption behaviour on live nodes: the agents now emit `interruption` and `agent_response_complete`; honouring them is D1's client work.
- End-to-end guest latency (speech end to first audio); only `convai_llm_service_ttfb` was measured here, 0.44 to 0.49 s p50 against 0.65 to 0.95 s before. The 10 to 22 s turn-silence in the evidence was the client's mic gating plus turn_v2 timeouts, now turn_v3 eager with 5 s timeout and a 3 s soft filler, to be re-measured by the lead in Phase 2.
- Known-guest recognition when the guest actually says the name (proven in some runs, see the caveat); a real spoken "I'm Calvin" test on a node is the proof that counts.
- Whether Groundbreaker's confabulated "MICHELLE HERE" recurs; it happened once in 18 Groundbreaker turns.
