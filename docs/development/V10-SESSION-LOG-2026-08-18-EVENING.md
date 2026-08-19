# v10.0.x Session Log — 2026-08-18 evening (Mina), ended by usage limit until Sunday

v10.0.0 RELEASED earlier tonight (tag `6659affe` on GitHub, fleet ×3 at 10.0.0).
This session: pushed the ReSpeaker commit `75fec397` to origin (gate green),
closed runsheet phases 6+8 with proof, then ran the two open tasks. Operator
rulings tonight: 3 concurrent agents fine on the Pi; monsterbox may be stopped
on the local node when useful; lead orchestrates, agents grind (drift warning).

## VERIFIED DONE (in this commit)
- **Jaw-sync analysis** (agent-complete, smoke 459 + jaw unit tests green):
  jaw LEADS audio ~50-150 ms warm, ~150-450 ms cold — mpg123 one-shot spawn +
  suspended XVF3800 USB-sink resume. Cadence already optimal (20 ms = PCA9685
  PWM). Real latent bug FIXED in tree: ConvAI streaming jaw assumed 16 kHz while
  playback honors the agent's parsed rate → `driveJawFromPcmStream(sampleRate)`
  (default 16000 = byte-identical), caller passes parsed rate
  (`elevenLabsWebSocketService.js`). By-eye guide + fix order in the workflow
  journal (`wf_e9581659-102/journal.jsonl`, entry 2) — READ IT, it's the map.
- **Orlok far-field STT config** (measured, deployed, service restarted):
  silence RMS 0.033-0.038, Mina-across-garage speech ~0.17, old gate 0.38 sat
  ABOVE speech. Now `vadThreshold 0.045`, `audioFilterEnabled false`,
  `_preset "xvf3800-array"` — identical on Orlok + repo copy (this commit).
  Operator confirmed hardware hears: array LED points at Mina when she speaks.
- **Utterance aggregation** in `serverSTTListener.js` + `aiConfigStore.js`
  (opt-in `utteranceAggregation` per-character key, default false = legacy path;
  MB_DEBUG_AUDIO env-gated RMS logging): post-gate-fix proof showed chunks pass
  but Scribe returns empty on bare 0.3 s fragments — aggregation is the cure.
  **STATUS: written, NOT yet adversarially verified end-to-end.** A finisher
  agent was mid-proof when the limit hit (journal
  `wf_25af4f45-a94/`, agent 50+ events in).

## RESUME RUNBOOK (Sunday — in order)
Session dir: `~/.claude/projects/-home-remote-MonsterBox/86006247-97bc-50c5-b7b9-afda53295366/`
1. **Check the finisher's journal** `subagents/workflows/wf_25af4f45-a94/journal.jsonl`
   (+ agent transcript) — it may have completed the proof before dying. Resume:
   `Workflow({scriptPath: "<sessiondir>/workflows/scripts/stt-finisher-wf_25af4f45-a94.js", resumeFromRunId: "wf_25af4f45-a94"})`.
   PROOF REQUIRED: cross-node transcript — Orlok's array hears Mina's TTS
   sentence, ≥70% words in order. Then its adversarial verifier (fresh sentence
   + jaw-patch citation check + `utteranceAggregation:true` in both char-3
   stt-config copies + code byte-identical Mina↔Orlok + no permanent
   MB_DEBUG_AUDIO on Orlok).
2. **fleet-jaw-align** (READY: `workflows/scripts/fleet-jaw-align.js`): measure
   cold/warm lead per node (pactl subscribe vs say-API timestamp), WirePlumber
   no-suspend rule scoped per speaker sink on Mina/Orlok/Dragomir, re-measure,
   set measured `audioLeadTimeMs` via each node's jaw-settings API (readJawConfig
   reads disk per play — NO restarts needed) + mirror into repo char-3/4 copies,
   persist via `scripts/apply-audio-nosuspend.sh` + `install.sh` + setup guide
   so PumpkinHead/Groundbreaker inherit at first boot. Dragomir jaw stays OFF.
   Then add the rules to the node-os-baseline memory.
3. **Séance** (READY: `workflows/scripts/seance.js`): Mina↔Orlok acoustic
   conversation, strict turn-taking, one listener at a time, 6 utterances,
   said-vs-heard transcript for the operator. The showpiece acceptance test.
4. **v10.0.1 wrap**: CLAUDE.md learnings (SSH lands in ~ — cd first; earcheck
   from Mina false-OFFLINEs peers; jaw-lead physics; XVF3800 traps pointer),
   CHANGELOG, KNOWN-BUGS reconciliation (STT items → fixed), bump package.json
   10.0.1, commit, tag, push (gate), `deploy:all`, fleet-health ×3, THEN operator
   physically reboots Mina (waits for this signal).
- Audio is single-owner: never two audio-playing agents at once. Per-workflow
  agent cap is 2; run two workflows side-by-side for 3+.
- NEVER commit: `.mcp.json`, `config/app-config.json`,
  `data/audio-library/library.json`, `data/character-2/poses.json`. The dirty
  char-1 super-powers / char-2 parts+super-powers diffs are runtime
  defaults-materialization (headTracking block, audioLeadTimeMs:0, blanked
  panServoId "" — Neck was "2" if restoring) — revert or adopt knowingly, don't
  commit blindly.

## Open questions for the operator Sunday
- char-2 parts.json webcam headTracking.panServoId went "2"→"" (runtime write,
  head-animation page). Restore Neck binding or leave unbound until the
  calibration evening?

## ADDENDUM (same night, post-limit): MISSION 1 PROVEN ✅

The finisher agents stalled on the API limit but had already deployed everything
(code + config byte-identical Mina↔Orlok, `utteranceAggregation: true` both
copies, Orlok restarted). During the proof they hit the documented XVF3800
zero-frames trap in the aggregation's continuous capture and wired the PROVEN
PyAudio path as first candidate (`microphone_cli.py stream_raw`, 84 lines +
`startContinuousCapture` wiring — in this commit). The lead then ran the
cross-node proof directly (it is only fleet HTTP — no model API needed):

- Spoken by Mina / heard by Orlok's array across the garage:
  1. "The crimson bell tolls seven times for the sleeping garden." →
     "The crimson bell tolled seven times for the sleeping garden" (10/10
     words in order; one tense inflection). 85 chunks, 9 with audio,
     **1 aggregated transcription** — the design working as intended.
  2. Fresh-sentence verify: "A copper lantern swings above the drowned orchard
     gate." → transcribed **verbatim** (10/10). Session
     `stt_1787108151022_ahqsl7`, 6 audio chunks, 1 transcription.
- Cleanup done: `/etc/systemd/system/monsterbox.service.d/zz-stt-debug.conf`
  removed from Orlok, daemon-reload, service restarted, health 200 @ 10.0.0.
  Listener deviceId of record:
  `alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_114993701262200027-00.analog-stereo`.

**Sunday now starts at:** conversation-mode mic-path evidence (code read) +
formal jaw-citation verify → fleet-jaw-align → séance → v10.0.1 wrap. The
10.0.1 tag's proof condition (cross-node transcript) is SATISFIED and recorded
here.
