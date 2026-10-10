# Report: conversation client (mission decision D1)

Worker: conversation-engineer (report saved by the lead). Work ran 2026-10-09 21:00–23:00 CDT (silent, sink
muted) and resumed 2026-10-10 from 10:29 CDT (audible, operator allowed noise); interrupted by the 22:03 reboot and
the 09:55 power loss. Files changed: `services/elevenLabsWebSocketService.js`, `services/serverPlaybackService.js`.
Tests added: `tests/unit/conversation-duplex.test.js`, `conversation-session.test.js`, `playback-owner-drain.test.js`.
`services/jawAnimationAudioIntegration.js` untouched (the live jaw feed did not need it). 166 unit tests pass;
`audit:independence` and `audit:resolver` clean with no allowlist entries added. Orlok was returned to lurking.

## Summary

| D1 item | State | Proof |
|---|---|---|
| Duplex mode detected from the mic and speaker parts (XVF3800), with an override, logged per session | done | unit; live log line on Orlok |
| Full duplex: real mic audio reaches the agent while the character speaks | done, with an echo gate added 2026-10-10 | unit; live (self-echo found and fixed) |
| Agent `interruption` honoured for this session's player only; queued/late chunks of the interrupted response dropped | done | unit; live silently by injected speech (10-09); live acoustically by real guests (10-10) |
| Half duplex: echo-aware barge-in from the playback envelope; tail ≤ 400 ms | done | unit only (no half-duplex node tested live) |
| Auto-reconnect with backoff; no greeting replay; graceful when the override is refused | done | unit; live: network drop (1006), refusal (1008), max-duration close (1000 at 600 s) |
| Activity event for the lurk service (guest and agent speech) | done | unit; live events observed |
| Ordered chunk playback; device resolved once per session; no disk reads per chunk | done | unit; live |
| Stops drain unless they are interruptions; browser sessions never kill the headless player | done | unit; live |
| One-shot asks end when the reply has played, never at 30 s, and skip the greeting | done | unit; live |
| Body-state contextual updates: ≤ 1 per 5 s per character, only on change, never on one-shot sockets | done | unit only |
| Per-turn latency: one log line per turn, in-memory history and a getter | done | unit; live (real audio) |

## What changed

### services/elevenLabsWebSocketService.js

Pure exported helpers (unit-tested): `HALF_DUPLEX_TAIL_MS = 400` (:149, replaces the 2.5 s tail that zeroed a
guest answering the closing question); `detectDuplexMode({micPart, speakerPart, override})` (:182: FULL only when
the mic part's name or device id matches XVF3800 and the speaker is "default", none, or the array itself; an
XVF3800 mic next to a different explicit speaker has no echo reference → HALF; env `MB_CONVERSATION_DUPLEX=full|half`
or a mic part's `config.duplex` overrides; never looks at a character or node); `echoAwareBargeIn` (:225, predicts
the echo as coupling × playback level with coupling learned as an upper envelope, replacing the self-triggering
quietest-frame floor; `shouldBargeIn` kept for old tests); `FULL_DUPLEX_ECHO_MARGIN = 3.0` (:214);
`isInterruptedAudio(eventId, resumeFrom)` (:272, drops audio whose event_id is below the interruption's id);
`isFirstMessageOverrideRefusal`, `reconnectDelayMs` (1, 2, 5, 10, then 30 s), `isNoiseTranscript`, `percentiles`,
`turnMetrics`, `formatTurnLine` (:384).

Sessions: `startConversation(sessionId, agentId, {reconnect})` (:945) returns a success flag; a reconnect asks for
`{agent:{first_message:''}}`; a 1008 refusal is remembered 10 min and the session reconnects at once without the
override, dropping the replayed greeting by turn (`in_response_to_ids` empty) including late chunks. A replaced
socket's close handler does nothing. `_scheduleReconnect` (:1106) runs only while the headless session is wanted;
the connection record, mic capture and player survive a reconnect; backoff resets after a minute of uptime; the
reaper never reaps a wanted session between attempts; `isAgentEnabledForCharacter` (:1771) stays true while
reconnecting. `setAgentEnabledForCharacter(id, false, {immediate})` (:1650): default drains the current sentence,
`immediate:true` stops now (panic). `_handleAgentAudio` / `_playAgentAudio` (:2689, :2730): writes in arrival order
to this session's own player (owner = sessionId), device resolved once (`_ensureSpeakerDevice`, `_writeAgentPcm`
:2636), playback envelope recorded, per-turn timing tracked, jaw feed as before. `_handleAgentInterruption` (:2862)
records the resume event id and calls `_bargeIn(..., {scope:'session'})` (:3117): stops only this session's player
via `serverPlaybackService.interruptPlayback`, never the node-wide `speaker_cli.py stop`; local half-duplex
barge-ins and operator stops use scope `character`. Mic loop (`fullDuplex` block :2170): FULL no longer zeroes the
agent stream — while the speaker plays a frame reaches the agent only when it clears the predicted echo by 3×, no
hangover, nothing trusted until coupling is learned; HALF zeros while speaking with the echo-aware local barge-in if
`MB_BARGE_IN` is not 0. `_resolveDuplexMode` logs one line per session (`[duplex] character 3 session …: FULL duplex
(detected: XVF3800 microphone, speaker=default (assumed the array)) …`).

Activity: `onActivity(handler)` (:2538) returns an unsubscribe; the service also emits `'activity'`. Event
`{characterId, kind: 'guest_speech'|'agent_speech', sessionId, headless, oneShot, at, prompted?, text?}`; guest
speech fires on a real user transcript never on "..."; agent speech at most once per 2 s per character; `prompted`
false when the agent talks on its own.

Latency: one line per turn (`[turn] char=3 src=speech mode=full speechEnd→transcript=161ms transcript→audio=18ms
audio→play=5ms TOTAL=184ms reply=3932ms interrupted=no`); `getTurnLatency(characterId)` (:2926) = last 20 turns +
p50/p90; `getConversationMode(id)`. Body-state bridge (:2042, :2072) merges changes into one `contextual_update`
(`context_id: body_state_change`), ≤ 1 per 5 s per character, skips identical text; `sendContextualUpdate` (:2012)
skips one-shot sockets.

`askAgentQuestion(agentId, text, characterId, opts)` (:3418) resolves only AFTER the reply has played on both
paths (live: settle or `agent_response_complete`, then this session's player horizon and the modelled end, which
also holds under app mute; cap 90 s; the 30 s ceiling applies only to an agent that never answers). `viaSession`
only on the live path (whose handler logs the line); the one-shot path logs nothing (callers log);
`{waitForPlayback:false}` (live path) returns text as soon as complete. One-shot (:3448, :3464): empty first_message
(no greeting; on refusal, once more with the greeting filtered by turn); ends 900 ms after the answer's last chunk
or 150 ms after `agent_response_complete`; closes the socket, waits for the horizon, drains its own player;
ceilings 30 s no-answer / 120 s absolute; no priming wait; the jaw moves during one-shot lines.

### services/serverPlaybackService.js

Owner-keyed persistent players (`pcmStreamKey` :155, one pw-play per session; a browser tab can only stop its
own); `resolveSpeakerDevice()` (:334); synchronous `_writePcmNow` (:563, writes reach stdin in call order; legacy
callers chained per character and owner; each write reports `coldStart`, `startsAtMs`, `playsUntilMs`);
`_drainRecord` / `_killRecord` (:655, :673); `stopPcmStream` / `stopStream` take `{owner, drain}` (no options keeps
the historical stop-everything-now contract); `interruptPlayback`, `getPlaybackHorizon`; spawn `error` handlers (a
missing binary no longer crashes Node); a write promise can no longer hang when the player dies; EPIPE from a
deliberately stopped player no longer logged to `.err` (:507; the recon counted 1,525 such lines).

## Measurements

Live, silent, 2026-10-09 (harness processes importing the real modules; real agent socket, real mic capture,
real pw-play into the device-muted sink; jaw/gestures/LEDs stubbed): duplex line FULL on Orlok's XVF3800; forced
network drop → close 1006, reconnect in 1 s with empty first message, override refused (1008), reconnect 250 ms
later without it, replayed greeting dropped, ask answered; max-duration close 1000 at 600 s → reconnected (by then
the override was accepted, no greeting generated). Agent-decided interruption with synthetic guest speech streamed
in while Orlok spoke: `interruption {event_id:46}` 0.84 s after the guest speech began; this session's player
killed while a second player (another owner) on the same character kept playing; the agent transcribed the guest
and answered. Live ask contract: resolved 3,575 ms after sending, horizon 4.5 ms in the past. One-shot: socket open
0.6–1.0 s (no greeting), question → first audio 2.0–2.4 s, resolved exactly at the modelled end of playback
(11,616 ms for an 8.0 s reply; 7,099 ms for 4.4 s), `viaSession` absent (KNOWN-BUGS had 10–13 s to first sound and
a 30 s hold).

Live, audible, 2026-10-10 (real service, real guests, PIR-woken session ≈09:56–10:33): 32 guest speech turns —
speech end → transcript p50 1,454 ms / p90 9,466 ms; transcript → first audio p50 3 ms / p90 17 ms; first audio →
playback p50 1 ms / p90 23 ms; total p50 1,491 ms / p90 9,468 ms. 8 turns interrupted; real guests interrupted
Orlok acoustically ("No, no, no.", "I need something...") producing agent `interruption` events and owner-scoped
cuts. A max-duration reconnect happened live with the override accepted. 94 turns were the agent answering "...".
The remaining latency is the agent's end-of-turn wait, not the client (≈20 ms) and not the LLM.

## Acoustic findings (2026-10-10) and the fix

1. **Full duplex let Orlok hear himself.** His own lines came back as guest transcripts ("I know something of you
   already. Tell your Lord your name.", "Do you fear the dark, copile?", "Numele tău.", "Echo in an empty hall.");
   three of the five logged interruptions followed these. Learned echo coupling 0.39–0.43: the array leaves about
   0.4 × the playback level after its AEC (sink 1.30, source 1.55 on this node).
2. **Fix:** while the speaker plays, a full-duplex frame reaches the agent only if it clears coupling × playback ×
   3.0, coupling tracked as an upper envelope. Restarted 10:37:12. Next 5 minutes (Orlok speaking every 10–15 s, a
   2-minute ask test, speech log compared word by word): 0 barge-ins, no transcripts of his own sentences; learned
   coupling 0.53. Small sample; the daylight test is the acceptance.
3. **Likely root cause outside these files:** capture asks PipeWire for one channel, so the array's two channels
   (FL, FR) are downmixed. In a controlled run FR carried the echo (0.04–0.18 RMS) while FL stayed near its floor
   (≈0.010): FL looks like the AEC-processed channel. Suggestive, not proven (a second run was contaminated). Hook
   for `python_wrappers/microphone_cli.py` / `serverSTTListener.js`: on an XVF3800 capture 2 channels and keep FL
   only; prove by FRAMES with the same phrase test in a quiet yard; if it holds, the 3× gate can drop toward the
   noise gate and quieter guests could interrupt.
4. Speaker-borne test audio cannot stand in for a guest (the array cancels what it plays); a post-fix acoustic
   interruption needs a human voice.

## Hooks needed elsewhere

- `routes/conversation.js` `GET /conversation/api/ai-status`: add `latency: getTurnLatency(characterId)` and
  `conversationMode: getConversationMode(characterId)`. **Applied by the lead.**
- `services/lurkStateService.js`: count `guest_speech` and `agent_speech` with `prompted === true` only; ignore
  `oneShot` events while lurking (an agent left alone re-engages every 10–15 s off its "..." turns, 94 in one
  session, so counting all agent speech means an empty yard never sleeps). **Applied by the lead.**
- `routes/api/panicRoutes.js`: `setAgentEnabledForCharacter(characterId, false, { immediate: true })` so a chunk
  arriving mid-panic cannot open a draining player. **Applied by the lead.**
- `/conversation/api/ask-ai` now returns after the reply has played; pass `{ waitForPlayback: false }` as the 4th
  argument if the dashboard should show text sooner.
- persona-writer: agents answer "..." turns; add a prompt rule to stay silent (or the skip-turn tool) on a
  "..."-only user turn, or turn the turn-timeout re-engagement down. **Lead follow-up.**
- Operator `40-no-barge-in.conf` (`MB_BARGE_IN=0`) now affects only half-duplex local barge-in.
- `playAIOnCharacterSpeaker` / `playBufferOnCharacterSpeaker` still suppress the mic for the estimated length +
  1000 ms (no longer gates the agent in full duplex; half-duplex TTS lines keep a 1 s tail).

## Unproven, and the daylight tests

1. Post-fix acoustic interruption by a person on Orlok: wake AI mode, ask a long question, speak over him from
   1–2 m ("Wait, stop, what is your name?"); expect `Barge-in (agent, scope=session)` within ≈1 s, speech stops, he
   answers; then stay silent through three replies: no `Transcribed` line repeats his words, no barge-in (grep
   `Barge-in`, `Transcribed`, `[turn]` in `/var/log/monsterbox.log`).
2. The XVF3800 channel test (finding 3) before lowering the 3× margin.
3. Half-duplex nodes (Mina webcam mic, Groundbreaker USB adapter): deploy, wake, confirm `[duplex] HALF`; speak
   over a reply (local barge-in only if `MB_BARGE_IN` ≠ 0); speak right after he finishes → heard within 400 ms.
4. Body-state rate limit live (contextual updates ≥ 5 s apart in the ElevenLabs conversation history).
5. Peer nodes: confirm the `[duplex]` line on each node after deploy (detection uses each node's own parts.json).

## Notes

Orlok's mic part has `characterId: null`, so the conversation capture lookup resolves to `default` (unchanged;
moving live capture to the explicit source needs its own FRAMES proof). The first start of a session still plays
the walk-up greeting by design; only reconnects and one-shots skip it. Scratch (test phrase PCM, channel captures)
in `/home/remote/mission-scratch/w1/`.
