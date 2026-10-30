# Speech wake

A guest speaking to a lurking character wakes it, and the agent answers what they said.

Operator, 2026-10-26: *"make sure that both SPEECH from a microphone and PIR Motion sensors can both
trigger wake up of AI - when someone speaks these animatronics should answer."*

## Status: opt-in per node, peer voices rejected (2026-10-29)

On 2026-10-26, a minute after the fleet deploy, five characters woke each other off their own greetings
(each node's Scribe confirmation heard a PEER's line; `isOwnEcho` only covers the node's own lines), and
Groundbreaker woke on Scribe's literal `[background noise]`. `speechWake` therefore defaults to **off**: a
node listens only when its `lurk-state.json` prefs say `true` (set it on `/ai-settings` or
`POST /conversation/api/lurk-state/prefs {"speechWake":true}`). Annotations like `[background noise]` /
`(music)` are stripped before the words check.

**Peer rejection (2026-10-29).** `speechWakeService.recentPeerLines()` asks every other node's
`/conversation/api/speech-log` (through `orchestrationService.httpNode`, 1.5 s timeout, in parallel with the
Scribe call) for the character lines of the last 30 s. `isPeerVoice()` rejects a transcript when 60% of its
letter trigrams are contained in one of those lines; trigrams survive Scribe's garbling of a distant voice
("Pumpkin Head is Pumpkin Head" for "Pumpkinhead hears you"). Fewer than 6 trigrams (a guest's "hello")
is never rejected. The ignore reason is `peer-voice`.

**Awake cross-talk (2026-10-29).** Switched on for PumpkinHead, Sir Dragomir and Renfield, all three woke
for real guests within 20 s; then PumpkinHead and Sir Dragomir's live agents heard each other's replies as
guest turns and kept each other awake. Now every transcript the agent's mic hears goes through the same
check (`_recordHeardLine` in `elevenLabsWebSocketService.js`): a neighbour's line is logged as speaker
`peer`, is never guest activity, and the agent's reply to it is not a prompted answer, so a pair with no
real guest falls asleep on the normal inactivity rules. The agent still hears and may answer a neighbour
once or twice; this bounds the session, it does not mute the mic.

## Why it exists

Before v10.9 a lurking node woke on the PIR, a schedule `wake`, or AI on. On 2026-10-26 the PIR picture was:

| Node | PIR | PIR wakes, last ~week |
|------|-----|-----------------------|
| PumpkinHead (1) | dead, listed in `config/physical-faults.json` | never armed |
| Mina (2) | works | 25 to 85 a day |
| Orlok (3) | works | 20 to 116 a day |
| Sir Dragomir (4) | GPIO 26 has never risen (wiring, KNOWN-BUGS) | 0 |
| Groundbreaker (5) | none fitted | n/a |
| Renfield (6) | proven by a wave test on GPIO 17, silent in the yard | 0 |

So for four of six characters a guest walking up and talking got silence. Every animatronic has a
microphone (five XVF3800 arrays, one USB mic).

## How it works

```
lurking ──mic frames──▶ local detector ──candidate──▶ lurk machine gates ──▶ one Scribe call
   ▲                    (free, 100 ms RMS,             (state, hold, quiet       │ real words, not
   │                     adaptive floor)                hours, cooldown,         │ its own echo
   │                                                    own speaker, budget)     ▼
   └──── sleep (no guest in 90 s → escalating rest) ◀── AWAKE: agent starts with no greeting,
                                                        the guest's words are its first turn
```

1. **Listen locally** (`services/speechWakeService.js`). While the node is LURKING, one capture process
   streams 16 kHz PCM through the same path the agent uses (`serverSTTListener.startContinuousCapture`,
   PyAudio first). Each 100 ms frame is voiced when its RMS is at least `max(speechWakeMinRms, floor x 2.5)`.
   The floor follows quiet frames in about 2 s and absorbs a sustained noise in about 50 s. An utterance
   is a run of frames ending in 600 ms of silence; it is a candidate when at least 400 ms of it was
   voiced. The first 3 s after a (re)start only learn the room. Nothing here is billed.
2. **Gate cheaply** (`LurkStateMachine.handleSpeechCandidate`). These are checked before any money is
   spent: the same `decideMotion` rules as the PIR (lurking, no fleet-event hold, boot grace, quiet hours
   `pirQuietHours`, the speech rest), the character's own speaker playing (`recentlyPlaying`), and the
   confirmation budget (one at a time, 4 s apart, 60 an hour). "Own speaker" covers both the playback
   service's last play and any scene playing for the character (`sceneExecutor.isSceneActive()`, with a
   2.5 s tail): lurk barks and played scenes go through a player the playback record does not see, and
   their text is not in the speech log, so without it a character would wake itself with every bark.
3. **Confirm with Scribe.** One batch `scribe_v2` call on the candidate's audio (a few seconds at most).
   No letters or digits means no wake (`no-words`). Mostly the same words the character said in the last
   20 s means its own echo (`own-voice`).
4. **Wake and answer.** The guest's line goes into the speech log *before* the wake (so it is not counted
   as the guest staying), the agent starts with `noGreeting`, and
   `elevenLabsWebSocketService.handGuestTurnToAgent()` sends the words as the session's first
   `user_message`, followed 150 ms later by a short commit frame of silence. Without that frame the agent
   sat on the words: the turn detector commits on an audio edge, and a gated mic supplies none (the same
   trap `askAgentQuestion` documents). If the hand-off fails the node is still awake and listening; the
   guest just has to speak again.
5. **Give the mic back.** The listener yields to every conversation (the same mic-holder signal Follow
   Orders uses), stops when the node wakes or is switched off, and starts again on lurking.

## Why not energy alone

Measured 2026-10-26: guest speech on Mina's array reads 0.02 to 0.12 RMS, and her quiet yard reaches
0.04 at p90 with peaks of 0.13 (the neighbours' lurk lines carry). Quiet-yard p50 per node at 100 ms:
Renfield 0.002, Groundbreaker 0.004, PumpkinHead 0.012, Mina 0.016, Sir Dragomir 0.027. No single
level separates a guest from the yard, and every false wake is a billed agent session (up to the
90 s grace). The Scribe check costs a few seconds of batch audio, at most about 3 minutes an hour.

## Cost policy

This is not the "always-on agent/STT stream" the ElevenLabs cost policy forbids: the stream is local,
and Scribe sees only energy-gated utterances that could wake the node, under a hard hourly cap. A
false speech wake is bounded the same way as a false PIR wake (the 90 s `wakeGuestGraceMs`), and it
then rests the speech source for 2, 4, 8, 16, then 30 minutes in a row until a wake finds a real guest.
The PIR's own 2-minute rest is untouched.

## Proven live (2026-10-26, Renfield)

- A real yard utterance woke him: 1.6 s of audio, Scribe heard "Nobody", `lurking → AWAKE (speech)` in 4.1 s.
- Simulated guest line "Hello Renfield, what are you writing?": `src=speech-wake` turn, first reply audio
  866 ms after the hand-off on his XVF3800 sink; he answered "The registry, the REGISTRY. Let me write that
  down. What name shall I enter for the docket?".
- A recording on his own array heard only background noise during the reply: the XVF3800's echo
  canceller removes its own speaker from its processed mic, so a node's own array is not an ear-check
  witness. Use another node's microphone.
- A simulated PIR edge on Sir Dragomir still wakes him with his greeting; the listener releases the mic
  while awake and resumes on lurking.

## Operating it

- Status: `GET /conversation/api/lurk-state` → `speech` (`listener.gate.floor/threshold`, `candidates`,
  `confirmsLastHour`, `wakes`, `lastHeard`, `lastIgnored.reason`, `falseWakeStreak`, `rewakeCooldownMs`).
- Switch / tune per node: `/ai-settings` checkbox, or
  `POST /conversation/api/lurk-state/prefs {"speechWake": false}` / `{"speechWakeMinRms": 0.04}`
  (0.005 to 0.5, default 0.02). Stored in `lurk-state.json` (runtime state, works on a locked character).
- Prove the wake-and-answer path without a guest (skips the mic and Scribe, nothing else):
  `POST /conversation/api/speech-wake/simulate {"text":"hello, who are you?", "force": true}`.
- Log lines: `[Lurk] character N: guest spoke — "..."`, `lurking → AWAKE (speech)`,
  `🗣️ Speech wake: guest's words handed to the agent`, and at most one `speech ignored (<reason>)` per
  reason per 10 minutes.

## Tuning notes

- A node that wakes for the neighbours: raise `speechWakeMinRms` (try 0.04), or check `lastIgnored` and
  the floor in the status first.
- A node that never wakes for a real guest: `candidates` stays 0 means the detector never fired (lower
  `speechWakeMinRms`); candidates with `no-words` means the speech was too faint for Scribe.
- Background music on a node raises its floor (by design); a guest still has to be clearly louder than
  the music at the array.
