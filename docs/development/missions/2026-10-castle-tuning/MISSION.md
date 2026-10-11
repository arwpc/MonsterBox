# Warner Castle 2026 — character tuning, new scenes, Goblins (mission spine)

Started 2026-10-09 20:30 CDT on Orlok (dev seat). Lead session orchestrates; bounded workers build; this file is
the durable plan and status log. Read it before touching anything in this mission. Recon reports with file:line
evidence live beside it: `recon-conversation.md`, `recon-lurk.md`, `recon-goblins.md`, `recon-scenes-tests.md`,
`evidence-elevenlabs.md`.

## Operator brief (2026-10-09, verbatim intent)

Tune the personalities of ALL characters, then build an entirely new set of scenes, get the Goblins running
video, rebuild the tests. Use workflows/agents/subagents, work autonomously, commit often, test often.

1. Common to all animatronics: responses are slow ("take too long to think"); responses too long and lecture-like
   (goal: strike up a conversation and send visitors to the other animatronics by tying the back stories
   together); hard to interrupt — they won't listen (mics are fine; use the latest ElevenLabs conversation
   capabilities); they lag and cut off mid-sentence (busy Pi suspected).
   Lurk mode, simplified: while lurking everyone moves occasionally, those able run head tracking, all have random
   movements, nobody speaks until woken by PIR motion, a scheduled event, or AI mode being turned on. AI mode
   enables ALL capabilities based on the parts configured for each animatronic. All unmuted by default. Orlok
   alone keeps playing music while lurking until he senses motion or any other wake-up.
2. Personalities: Orlok — deeper voice, more Romanian words, better conversationalist (star of the show).
   Mina — from time to time in lurk mode she sings, Romanian only, lullabies and so forth. Groundbreaker — no
   longer on the roof, breaking out of the ground; keep how he calls out to and describes the others; less
   threatening, dumb observations about the others; big dumb kind-of-dangerous friend and protector of visitors,
   especially anyone named Calvin, Ben, Bennett, Holden or Harrison. Sir Dragomir — boring now, must start
   conversations; cars pull by, he sees them as carriages; sends people to Orlok or Mina; does NOT like
   Pumpkinhead. Pumpkinhead — do not change his voice; keep "snap", "stalks", "cracks" and his descriptors; new
   thread: Renfield is selling his baby pumpkins from the patch and he is not happy. Renfield — repetitive now,
   be creative; learns and repeats names (sidewalk traffic); signs up clients for the master after vetting them;
   1800s legal terms; can be mad, frenetic, shaking, repeating; pen moves FAST and OFTEN, constantly scribbling,
   even his own words; asks people to let him write a contract with Orlok, or sells Pumpkinhead's pumpkins by
   contract and sends them to Pumpkinhead to collect.
3. New scenes only after ALL characters are updated and tested: ten new scenes per character, creative, as many
   parts/combinations as possible, stories drive movement between and during lines and music, cast video. Delete
   all old scenes and poses.
4. Goblins: all working and running video. Goblin 1 most noticeable/clear; Goblin 2 big picture window, detail
   hard to see; Goblin 3 small vertical window on the roof. New playlists per Goblin, looped by default.
5. Rebuild tests around the new scenes; incorporate hardware testing; update the AI config UI as needed.
6. (Added 21:25) Have fun with the scenes and poses — animatronics can trigger each other (send messages,
   commands); have them interact. Create three new EVENTS using scenes, the big orchestrated kind with music,
   video and movement where they all participate: a cool ceremony; one where Orlok issues orders and the
   animatronics interact; and one where they all try to sing the same song together. Get crazy. Run one of them
   every half hour; animatronics and Goblins must return to their original state afterwards. Don't forget the
   music.

## Standing rules for this mission

- Standing autonomy applies (no approvals needed); physical-safety knowledge still governs: never drive Orlok parts
  4 and 5 together on our own initiative; never command Sir Dragomir's 900° neck (part 1) on our own initiative;
  PumpkinHead motor never above 40 %; Groundbreaker head motor is physically dead (`config/physical-faults.json`).
- Quiet hours 23:00–08:00: no audio at full volume; fleet audio tests at 20 % (`PUT /api/orchestration/volume
  {volume:20}`, undo with `POST /api/orchestration/volume/restore-canonical`), and anything loud waits for daylight.
  Proofs that matter acoustically are marked UNPROVEN until an ear-check or the operator confirms.
- Locks: PumpkinHead (1) and Sir Dragomir (4) are config-locked. The brief explicitly directs changes to both
  (scenes/poses, story threads), so they are unlocked deliberately for the rebuild and re-locked with refreshed
  fingerprints at the end (`node scripts/character-lock.mjs unlock|lock|refresh`).
- Deploy = rsync of code; `parts/poses/scenes/super-powers/*-state` are node-local and excluded. New scenes and
  poses therefore travel to each node by explicit file push + restart, never by `deploy:all`. Always diff with
  `rsync -rnc` first and curl `/health` on every node afterwards.
- Mina (192.168.8.140) is powered off: her agent (cloud) is tuned now; her node files are staged in the repo and
  pushed when she returns. Goblin 1 (.40) and Goblin 4 (.244) are off the network: their playlists are staged and
  applied by the keep-alive when they return.
- Every claim in a report must point at a tool result. `success:true` is not proof; `played:true` lies while
  muted; version strings lie; grep the node, read `/var/log/monsterbox.err`, measure.
- Agents on this Pi: at most 5 concurrent; audio-playing or hardware-driving work serialized.
- Commits: `v10.7.0: [area] description`, small and frequent, gate on push. Node-local files never committed
  (`.mcp.json`, `config/app-config.json`, `data/audio-library/library.json`, service-written state while a suite runs).

## What the evidence says (details in evidence-elevenlabs.md and the recon files)

- ElevenLabs conversation logs for the fleet: LLM time-to-first-token 0.65–0.95 s, TTS TTFB 0.2 s — the model is
  not the delay. In real guest conversations the agent waited 10–22 s after the guest went quiet before answering
  (`convai_turn_silence_before_initiation` p50 14.7 s Mina, 10.6 s Renfield), replies ran 31–53 words (p90), and
  2,181 "user" turns were literally `...` (noise). The client zeroes the mic while the character speaks and for
  2.5 s after, so a guest who answers the closing question is unheard; the agent then waits its turn timeout and
  plays filler. Callout one-shots cost 10–13 s to first audio.
- `interruption` is missing from `client_events` on four of six agents; local barge-in is off on Orlok and
  Renfield (self-triggered 665 times on 2026-10-04) and self-triggering elsewhere (echo floor tracks the quietest
  frame). Barge-in and socket closes SIGTERM the shared player with no drain — the mid-sentence cut-offs.
- All six agents: `gpt-oss-120b` (a reasoning model), `max_tokens -1`, RAG on (20 chunks / 50 k chars),
  prompts 4.4–10.3 k chars asking for ~40-word replies, `turn_model turn_v2` (current default `turn_v3`),
  `optimize_streaming_latency` is now a documented no-op. Lab A/B (simulated turns): claude-haiku-4-5 0.48–0.57 s,
  gpt-5.4-mini 0.49–0.79 s, gemini-3.5-flash-lite 0.6–0.78 s, gpt-oss-120b 1.1–1.3 s.
- Lurk: two modes share one PIR watcher; lurk is never restored at boot; sleep turns off movement and head
  tracking (so the character is motionless while waiting); callouts and lurk scenes speak regardless; "AI on" starts
  only the agent; schedules cannot wake; wake/sleep write config into `super-powers.json` (refused on locked
  characters); mute persists across boots and Orlok has been muted since the 19:52 panic.
- Goblins: none showing video right now; Goblin 2 has an empty queue (blank screen on a "healthy" unit); Goblin 3
  stopped by a fleet emergency stop (42,680 mpv respawns on one 6 s clip = respawn storm); Goblins 1 and 4 off the
  network; 69 junk playlists; no name resolver for scene casts; no keep-alive.
- Orlok's voice "Count Orlok, Nosferatu" measures median F0 ≈ 88 Hz on the TTS path; no library voice is deeper;
  ElevenLabs offers no pitch control (audio_effects = filters/reverb/distance only); voice-design from his own
  reference at prompt_strength 0.6 keeps F0 but raises sub-150 Hz chest energy 0.47 → 0.53–0.61. Candidate
  generated voice ids are in evidence-elevenlabs.md for audition.

## Design decisions

D1 **Conversation client (services/elevenLabsWebSocketService.js + serverPlaybackService.js)** — full-duplex
listening on nodes whose mic is a ReSpeaker XVF3800 (hardware AEC: Orlok, PumpkinHead, Dragomir, Renfield):
real mic audio flows to the agent while it speaks; interruption is decided by the agent (`interruption` event)
and honoured by stopping THIS character's player and flushing queued chunks. Half-duplex nodes (Mina webcam mic,
Groundbreaker USB adapter) keep suppression but with an echo-aware barge-in (expected echo from the playback
envelope, not the quietest frame) and a ≤400 ms tail. Auto-reconnect while AI mode is on (max-duration close,
network drop) with no greeting replay. Guest speech resets inactivity. Chunk writes ordered and device resolution
cached per session (no disk reads per chunk). Stops drain unless interrupting. Browser sessions never kill the
headless player. One-shot asks end when the reply finishes (not at 30 s) and skip the discarded greeting. Scene
`askAI` speaks once. Body-state contextual updates rate-limited (≥5 s, on change only). Per-turn latency
instrumentation (guest-speech-end → first audio → playback start) exposed on `ai-status`.

D2 **Agents (ElevenLabs, all six)** — `client_events` + `interruption`, `agent_response_complete`;
`turn.turn_model turn_v3`, `turn_eagerness eager`, `speculative_turn true`, `turn_timeout 5`,
`soft_timeout 3.0 s × 1`; LLM chosen per character from the lab measurements (default `claude-haiku-4-5`,
`gpt-5.4-mini` acceptable), `max_tokens` 140 as a safety net, temperature 0.8, RAG off with the essential
knowledge folded into tight prompts (Known Guests kept as `usage_mode: prompt`); `max_duration_seconds 1200`;
`first_message` override enabled so a reconnect can pass an empty greeting; Mina
`disable_first_message_interruptions false`. Prompts rewritten to the brief: 1–2 sentences, ≤ 25 words, one
question or one send-off per turn, the castle's shared story, cross-references. PumpkinHead's TTS settings and
voice untouched. Every change applied by REST with `/etc/monsterbox/elevenlabs.key`, snapshots refreshed in
`config/elevenlabs/agents/`, previous state backed up in `/home/remote/fleet-backups/elevenlabs-agents/`.

D3 **Lurk/wake/AI-mode** — one per-node state machine (`services/lurkStateService.js`, routes stay in
`routes/conversation.js`): states `lurking` (default and boot state; idle loop over idle-tagged poses + head
tracking where a camera and pan servo exist + Orlok's background music; NO speech) and `awake` (= AI mode: agent
session + jaw + LED sync + head tracking + AI motion + follow orders, each only if the character's parts support
it). Wake sources: PIR, `POST /conversation/api/wake` (used by a new schedule action `wake`), `ai-on`. Return to
lurking after inactivity (default 5 min; guest speech and agent speech count as activity). Mute is runtime-only
and defaults to unmuted at boot. Callouts and lurk scenes become opt-in features that are OFF by default and gated
on `lurking` and quiet hours (not retired, not speaking by default). Wake/sleep never write `super-powers.json`;
runtime overrides live in memory + `lurk-state.json` and are honoured by every reader. Fleet gets an `ai` key.
Dashboard AI/Lurk toggles defer to the server.

D4 **Scenes/poses** — after D1–D3 are deployed and conversation is proven on live nodes: for each character a new
pose library (including `idle`-tagged poses for lurk, respecting the hazards) and ten scenes using every part
combination, audio, TTS lines, music and Goblin casts (by Goblin name). Old scenes/poses deleted. Mina's lullabies
are pre-generated Romanian TTS files in her audio library used by lurk-time scenes. Pushed per node, locks refreshed.

D5 **Goblins** — per-Goblin looping playlist (single pre-concatenated reel per Goblin = one mpv `--loop`,
portrait-cropped reel for Goblin 3), keep-alive watchdog that resumes a stopped non-empty queue and applies the
staged playlist when an offline Goblin returns, `resolveGoblin(nameOrId)` for scene casts, display hints in the
registry, junk playlists archived. No reboots, no restarts of goblin.service, `pgrep -c mpv` discipline deferred
to daylight.

D7 **Cross-node steps and fleet events** — the scene executor gains `fleet-scene` (run scene N on node X, by
animatronic id or character name, optional wait), `fleet-say` (a line in that node's own voice via the
orchestration say endpoint; `all` fans out), `fleet-audio`/`fleet-stop-audio` (the same library track on one or
every node — music beds), and `fleet-mode` (`hold`/`release` over every node's lurk service so idle loops, head
tracking and background music step aside for the show and come back afterwards). Scenes can therefore trigger
each other. The three events are conductor scenes hosted on Orlok (ids 101–103: "The Lighting of the Castle"
ceremony, "The Count's Orders", "One Song for Warner Castle"), composed of per-character event parts (each
character's scenes 8–10) plus Goblin casts (play-once, so the reels resume) and a shared music bed on every node.
`scripts/fleet-events/run-next.mjs` rotates them, refuses during quiet hours or while any node is in a guest
conversation, and runs from the managed crontab every 30 minutes in show hours (`*/30 17-22 * * *`, visible on
/schedule, operator-adjustable). Every event ends with `fleet-mode release`; the runner also releases on failure.

D8 **Time** (operator, 21:27: "be sure time is synced to the Chicago time zone and these guys are updating time
via NTP on their RPis") — verified 2026-10-09 21:27 CDT on every reachable Pi (Orlok, PumpkinHead, Sir Dragomir,
Groundbreaker, Renfield, Goblin 2, Goblin 3): `America/Chicago`, `systemd-timesyncd` active, clock synchronized,
identical to the second. Mina, Goblin 1 and Goblin 4 are off the network and get the same check when they return.
To keep it true: `scripts/node-baseline/apply-baseline.sh` and `scripts/goblin-os/provision-goblin.sh` /
`stabilize-goblin.sh` set `timedatectl set-timezone America/Chicago` and `set-ntp true` (neither does today);
`/api/orchestration/fleet-health` reports `time {zone, ntpSynced, localTime, offsetMs}` per node and the Fleet
Command Center flags drift or an unsynced clock; `npm run check:time` prints the fleet matrix. Schedules, quiet
hours and the half-hour event rotation all depend on this.

D6 **Tests/UI** — unit + system tests follow the new services; browser specs updated for the new scenes;
hardware tests per character part list; AI settings page shows live conversation latency, duplex mode, and
agent turn settings (read-only with a deep link). Version bumps to 10.7.0.

## Phases and workers

| Phase | Worker (model) | Owns these files | Done when |
|---|---|---|---|
| 1a | conversation-engineer (opus) | `services/elevenLabsWebSocketService.js`, `services/serverPlaybackService.js`, `services/scenes/sceneExecutor.js` (askAI only), `services/jawAnimationAudioIntegration.js` if needed, their unit tests | D1 implemented, unit tests green, headless session on Orlok proves reconnect + interruption handling + ordered playback with logged per-turn latency |
| 1b | lurk-engineer (opus) | `routes/conversation.js`, `server.js`, `public/js/dashboard.js`, `services/lurkMotionWatcherService.js`, `services/calloutService.js`, `services/lurkSceneService.js`, `services/backgroundMusicService.js`, `services/scheduleService.js` (+ `public/js/schedule.js`), `services/orchestrationService.js`, `services/aiMotionSuperPowerService.js`, `routes/api/panicRoutes.js`, dashboard/orchestration views, their tests | D3 implemented, boot lands in lurking, PIR/schedule/ai-on wake, inactivity returns to lurking, locked character works, unit/system tests green |
| 1c | persona-writer (fable) | ElevenLabs agents (REST), `config/elevenlabs/agents/*.json` snapshots, `docs/characters/` story bible | D2 applied to all six, simulate-conversation transcripts show ≤ 25-word in-character replies with cross-references, measured TTFB per character |
| 1d | goblin-engineer (opus) | `services/goblinManagerService.js`, `services/goblinPlaylistService.js`, `routes/videoLibrary.js`, `routes/goblinManagement.js`, `data/goblins.json`, `data/goblin-playlists.json`, `scripts/goblins/*`, their tests | D5: reels built, Goblins 2 and 3 looping and proven by two reads 10 s apart, keep-alive running, resolver in place |
| 2 | lead | integration, gate, deploy to live nodes, restart, measured conversation proof on ≥ 2 nodes | conversation symptoms re-measured on live agents |
| 1e | scene-infra engineer (opus) | `brief-scene-infra.md` file set + the fleet step types (D7) | askAI single-play, audio > 30 s, TTS cache, validator, replace endpoints, casts by name, fleet steps, tests green |
| 3a | fleet-event author (fable) | `brief-fleet-events.md`: event scripts, Orlok conductor scenes 101–103, `scripts/fleet-events/*`, crontab entry, song lyrics + music choice | the three scripts written before the scene authors start their event parts; conductors dry-run clean |
| 3b | scene-author ×6 (opus, ≤ 3 concurrent) | `data/character-N/poses.json`, `scenes.json`, audio files for that character | validated, dry-run on the node, pushed, locks refreshed |
| 3c | fleet-event author (same) | end-to-end rehearsal of each event at 20 % (or dry at night), state-restore proof on every node and Goblin, schedule armed | three events proven, rotation running |
| 4 | test-engineer (sonnet/opus) + ui-engineer | `tests/**`, `views/ai-settings/**`, `public/js/ai-settings*.js` | suites green against the new scenes; hardware tests per character |
| 5 | docs-scribe (sonnet) + lead | README, CHANGELOG, KNOWN-BUGS, docs, memory, version, locks, final deploy + fleet verify | tagged v10.7.0 |

## Phase 2 checklist (lead, after 1a–1d land)

1. Integrate: read each `report-*.md`, resolve cross-worker hooks (activity callback → lurk service; resolver →
   executor), run `npm run gate`, `npm run test:unit`, targeted system suites (never `orchestration.test.js`
   against :3100), commit per worker with their file lists.
2. Restart Orlok, read `/var/log/monsterbox.err` from the boot boundary, confirm: boots into `lurking` (idle loop
   + head tracking + music supervisor; nothing speaks), `ai-on` → `awake` with per-capability log, inactivity →
   `lurking`, conversation latency lines present.
3. Fleet: `rsync -rnc` preview per node (deploy pushes `data/characters.json`, `config/*`, audio library — check
   nothing node-local would be clobbered), `scripts/deploy-to-animatronic.sh` per live node (1, 4, 5, 6), restart,
   `curl -sk /health` each, grep each node for the new symbols (`lurkStateService`, `resolveGoblin`,
   duplex-mode log line), then set per-node runtime state: callouts OFF, lurk scenes OFF, mute cleared,
   `lurk-state.json` present. Mina skipped (off); note it.
4. Measure, silently where quiet hours apply: on Orlok (sink muted at device level) open a headless session,
   inject three text turns, record first-audio latency from the new instrumentation and the agent's own
   `conversation_turn_metrics`; on one XVF3800 peer at 20 % volume in daylight, a real spoken exchange with an
   interruption. Record numbers in the status log; mark acoustic items UNPROVEN until then.

## Status log (append, newest last)

- 2026-10-09 20:30 — clean build verified (main == origin/main 86c9bb0e, gate green, configs backed up to
  `/home/remote/config-backup-20261009-195334` and `/home/remote/fleet-config-backup-20261009-195355`).
- 2026-10-09 20:37 — all six agent configs backed up to `/home/remote/fleet-backups/elevenlabs-agents/20261009-203704/`.
- 2026-10-09 20:58 — recon complete for conversation, lurk, goblins (scenes/tests recon still running). Lab agent
  `agent_6701m4hqprpefaj9xdnj9548cmpv` (duplicate of Orlok) exists for A/B; delete at the end.
- 2026-10-09 21:00–21:30 — phase-1 workers 1a–1d launched (conversation, lurk, personas, goblins). The lead session
  was cut off at ~21:30 and the Pi rebooted at ~22:03 (wiping /tmp, including every worker scratchpad). The
  half-written tree then crash-looped monsterbox.service at boot: the goblin-engineer's header rewrite of
  `services/goblinManagerService.js` had dropped the HEAD helper block (`sanitizeGoblinFilename`, `rsyncToGoblin`,
  `fetchWithTimeout`, …).
- 2026-10-09 22:13 — recovery lead (new session): helper block restored verbatim from HEAD, service healthy again
  (`/health` 10.7.0). Verified by REST that the six real ElevenLabs agents are untouched (only the lab agent
  carries the new Orlok prompt + D2 settings). Worker briefs preserved under `briefs/`; predecessor action logs
  under `/home/remote/mission-scratch/prior/`. All four workers relaunched with resume briefs at 22:16.
- 2026-10-09 22:40 — operator: Renfield and Groundbreaker brought back up; Mina being powered on, but on Mina
  "no hardware works other than light - linear actuator does not". Recorded as physical faults for Mina parts
  1–4 (jaw, neck, eye, coffin door) so autonomous code, the validator and the scene author build her show from
  voice + the Burning Rose lamp only; her jaw animation must be OFF on her node (dead servo would only add the
  jaw pre-analysis delay to every line). Phase 3a: `docs/characters/FLEET-EVENTS.md` written (three event
  scripts: 101 The Lighting of the Castle, 102 The Count's Orders, 103 One Song for Warner Castle); original
  instrumental beds being generated with the ElevenLabs Music API into the audio library.
- 2026-10-09 23:05 — phase 1c DONE (persona-writer): D2 applied to all six agents at 22:37–22:41 CDT, verified by
  GET after each PATCH; LLMs chosen by measurement (Orlok, Dragomir, Renfield → gemini-3.5-flash-lite; Mina,
  PumpkinHead, Groundbreaker → gpt-5.4-mini; claude-haiku-4-5 was fastest but lectured at 37–48 words); words per
  turn 15–27 (was 31–53); Orlok's VOICE UNCHANGED (the designed candidate measured higher, not deeper; the only
  achievable lever is a node-side rubberband pitch shift on the playback path, queued as a daylight follow-up for
  the conversation engineer). Report `report-personas.md`, bible `docs/characters/STORY-BIBLE.md`. Phase 1e DONE
  (scene-infra, commit d4d861c5): fleet step types, validator (gate step 1b), TTS cache + prerender, replace
  endpoints, askAI single-play, audio steps to clip length; report `report-scene-infra.md`. Three event music beds
  generated (ElevenLabs Music API, 230/260/235 s) and loudness-normalized for the library. Scene authors for Orlok
  and Sir Dragomir launched 23:06 (two concurrent; conversation, lurk and goblin workers still running).
- 2026-10-09 23:00 — phase 3a DONE (lead as fleet-event author): `docs/characters/FLEET-EVENTS.md` (three
  scripts, every character's scenes 8/9/10 specified line-for-line), conductors `scripts/fleet-events/conductors/
  {101,102,103}.json` + `install-conductors.mjs` (validated replace), runner `scripts/fleet-events/run-next.mjs`
  (rotation, quiet hours, busy-node deferral, release-on-failure, Goblin read-back), beds in the audio library
  (commit aab61105). Validate-only install shows only the expected gaps: peers' scenes 8–10 (authors running) and
  the beds' library ids (registered by the rescan at the next restart). `brief-orlok-pitch.md` queued for the
  conversation engineer after D1 (daylight audition). Pi load ≈ 8 with five workers; no more agents until a slot
  frees. Still running: 1a conversation, 1b lurk, 1d goblins, scene authors Orlok + Sir Dragomir.
- 2026-10-09 23:12 — operator: "set all of their volumes at 25% - its late". Done via `PUT /api/orchestration/volume
  {volume:25}`; every node reads back 25 % (`GET /api/system/volume`); Orlok's sink stays MUTED at the device
  level. Every restart/deploy re-applies canonical `sinkVolume`, so the lead re-applies 25 % after each restart
  tonight; `POST /api/orchestration/volume/restore-canonical` brings show levels back in daylight.
- 2026-10-10 ≈09:55 — POWER LOSS on Orlok (second interruption). Back at ≈09:58; service healthy on the dirty tree,
  every dirty file parses, head tracking running from boot (the new lurk boot path). All five workers resumed from
  their saved transcripts at 10:30 (conversation, lurk, goblins, Orlok author, Dragomir author). Operator: daytime,
  "make as much noise as you like with volume and move however you like" — Orlok's sink unmuted, canonical volumes
  restored fleet-wide (Mina unreachable again at 10:30: EHOSTUNREACH). A test left a synthetic microphone part
  (id 987657, "Device Stamp Test Mic") in Orlok's parts.json — remove at cleanup.

## Goals checklist (operator brief → where each lands; reviewed 2026-10-10 10:35 at the operator's request)

| # | Operator goal | Covered by | State |
|---|---|---|---|
| 1a | Slow to respond, too long, lecture-like | D2 agents + D1 client | DONE: 15–27 words/turn; live guest turns median 1.5 s speech-end → playback (was 10–22 s) |
| 1b | Hard to interrupt, won't listen | D1 full-duplex on XVF3800 nodes, agent-decided `interruption`, echo-aware barge-in elsewhere | DONE (61a15133); real guests interrupted Orlok acoustically; human interruption test on peers pending (tracker) |
| 1c | Lag / cut off mid-sentence | D1 ordered chunks, drain-on-stop, no SIGTERM from other sessions, reconnect | DONE (61a15133) |
| 1d | Lurk simplified: move occasionally, head tracking, random movement, silent until PIR/schedule/AI-on; AI mode = all capabilities; unmuted by default; Orlok keeps music | D3 lurk state machine + idle-tagged poses from every scene author | DONE (c246bd18), live on all six nodes |
| 2 | Six personalities per the brief (Orlok deeper + Romanian, Mina lullabies, Groundbreaker ground + protector, Dragomir starts/carriages/anti-Pumpkinhead, Pumpkinhead vs Renfield's sales, Renfield names/contracts/pen) | D2 prompts + bible | DONE except Orlok's DEPTH: ElevenLabs cannot; playback pitch shift briefed (`brief-orlok-pitch.md`), daylight audition pending |
| 3 | Ten new scenes per character, delete old scenes/poses, max part combinations, stories drive movement, cast video | D4 + `brief-scene-author.md`; validator/cache/replace from 1e | DONE: six shows committed, pushed to every node (`push-show.sh`), locks refreshed; Orlok's ten played for real |
| 4 | Goblins all working, looped playlists per window | D5 reels, keep-alive, resolver, hints | DONE for Goblins 2 and 3 (proven looping, keep-alive acting); Goblins 1 and 4 staged, off the network (hands) |
| 5 | Rebuild tests around the new scenes, hardware tests, AI-config UI | D6 phase 4 (test-engineer + ui-engineer) | DONE: live-data guard, browser fixture, specs on the new contracts, parts-alive hardware test (proven on Orlok), AI settings page + Studio palette (90e5deeb, 93136a64) |
| 6 | Three fleet events with music, video, movement; every half hour; return to original state | D7 scripts, conductors, runner, beds; `fleet-mode hold/release`; cron | DONE: all three rehearsed for real (every node back to lurking, Goblins back on reels), rehearsal defects fixed and re-proven, schedule `*/30 17-22` armed |
| D8 | Chicago time + NTP on every Pi, enforced and reported | baseline/provision scripts + fleet-health `time` + `check:time` | DONE (d42eb74e, 751cabac): every node reports zone/NTP/sync/offset in fleet-health, all six OK |
| — | Deploy everything to all nodes; Mina's files when she is on | phase 2 + 3b | pending |
- 2026-10-10 10:35 — D8 enforcement landed: `apply-baseline.sh` step 8 and the Goblin provision/stabilize scripts
  converge America/Chicago + NTP; `npm run check:time` (scripts/check-time.mjs) prints the fleet clock matrix:
  8/8 reachable nodes OK (zone, NTP, synced, offsets −26…−218 ms; Goblins 1 and 4 unreachable). Still open from
  D8: fleet-health `time {zone, ntpSynced, localTime, offsetMs}` + Fleet Command Center flag (lurk-engineer's
  files; after 1b). PumpkinHead's sink ignored `wpctl set-volume @DEFAULT_AUDIO_SINK@` but took the set by node
  id (79); canonical 1.0 restored that way. Mina is reachable again (ssh + health).
- 2026-10-10 10:45 — phase 1b DONE (lurk, commit c246bd18; report-lurk.md; unit suite 1077 passing); follow-orders
  overlay hook applied by the lead; Orlok's disk jaw flag restored to true. Scene authors DONE for Orlok and Sir
  Dragomir (commit 406dd3ae, reports saved); Renfield and Groundbreaker authors launched 10:37. Orlok's scene 3
  played for real (lamp, arm, cached line, 15 s, clean logs); scenes 1,2,4–10 playing for real now in sequence.
  Still running: 1a conversation, 1d goblins. Next: 1a/1d commits → gate → deploy all six → per-node runtime state
  (callouts off, lurk scenes off; Dragomir lurk rotation → scenes 1,2) → push Orlok/Dragomir shows + lock refresh.
- 2026-10-10 10:55 — phase 1a DONE (conversation, commit 61a15133; hooks wired by the lead: ai-status latency/mode,
  lurk ignores unprompted agent speech + one-shots, panic stops the agent immediately). Shows DONE and committed
  for Orlok, Sir Dragomir, Groundbreaker (voice-only, empty pose set), Renfield; PumpkinHead and Mina authors
  running. Orlok's ten scenes PLAYED FOR REAL on this node: all steps succeeded except casts to the offline
  Goblin 1; walls 33/37/15/100/102/87/50/26/26/34 s (event parts 8 ≈ 26 s, 9 ≈ 26 s, 10 ≈ 34 s vs budgets
  28/20–25/24–28 — the conductor waits per part, so only the totals stretch). A mid-run service restart by another
  worker cut three responses; those three were replayed clean. Still running: 1d goblins.
- 2026-10-10 11:05 — ALL SIX SHOWS committed (Orlok, Sir Dragomir, Groundbreaker, Renfield, PumpkinHead, Mina
  with three pre-rendered lullabies in the library); validator 6/6 clean, baseline emptied; conductors 101–103
  installed on Orlok (validate clean: every event part and bed resolves). Silence rule (skip_turn) on all six
  agents. Fixed from the log review: jaw-daemon EPIPE uncaught exception; 413s were a deliberate oversize test
  (10 MB cap). `scripts/push-show.sh` ready; locked characters' config files match their nodes byte for byte.
  Waiting only on 1d (Goblins: Goblin 2 looping its reel already) before the fleet deploy.
- 2026-10-10 11:20 — phase 1d DONE (Goblins, commit 8a58c232): reels proven looping on Goblins 2 and 3, keep-alive
  on Orlok acting with proof, resolver, manifests, Video Control board; Goblins 1 and 4 staged (need hands; Goblin
  2 runs hot at 79.5 °C). GATE GREEN (the smoke step had been timing out at 60 s on a 1078-test suite; cap raised;
  the one real failure was test residue the timeout had left in Orlok's live parts.json — synthetic parts
  987655/987657 — removed). PHASE 2 ROLLOUT RUNNING (`/home/remote/mission-scratch/phase2.sh`): deploy →
  health → symbol grep → push-show → lurk-state, nodes 1, 4, 5, 6, 2, then Orlok.
- 2026-10-10 13:00 — PHASE 2 DONE on all six nodes: code 10.7.0 with every new symbol, shows pushed, lurk
  rotation → [1,2] (off), callouts and lurk scenes off, every node in `lurking`; locks verified on PumpkinHead's
  and Sir Dragomir's nodes (fingerprints now ignore node-local `backups/`). A LAN/internet outage 11:31–12:50 cut
  Mina's and Orlok's pushes and killed the test engineer (both resumed); Renfield's new Pi has no key trust from
  Orlok (an ssh-copy-id was refused by the session's permission layer — operator action), so his deploy and push
  used the fleet password through `MONSTERBOX_SSH_PASSWORD` (push-show gained that fallback). Daylight rehearsal of
  events 101/102/103 running now (`/home/remote/mission-scratch/rehearse.sh`). Test engineer (phase 4) running;
  UI engineer next; then docs, log review, memory, tag.
- 2026-10-10 13:45 — Rehearsal 12:58–13:13: all three events played for real; every node released to lurking,
  Goblins 2/3 back on their reels. Defects found and fixed (commits cb7a7c35, a903f8d2, 05c507fb, 751cabac,
  6a5a8f2f): beds reported failed while playing (node play route blocked for the track; now background), the
  host skipped its own part because its PIR-woken agent counted as a conversation (busy now = guest spoke
  within 60 s; self never skipped; a guestless awake node sleeps for the show), library.json write race, two
  casts Goblin 2 would not switch to, probe timeout 2.5 → 6 s, cast proof polls to 6 s, zero-duration clamp
  no-op, D8 fleet-health `time` block + Fleet Command Center pill. Proof run of 101 at 13:32 (after the first
  fixes): 22 ok; the remaining failures were Goblin 1 offline and the two timing items fixed in 6a5a8f2f.
  Half-hour schedule armed (`*/30 17-22 * * *`, through /schedule). Phase 4 UI DONE (commit 90e5deeb); phase 5
  docs DONE (dbe2fe13). Test engineer still running. Final peer deploy starting.
- 2026-10-10 15:20 — phase 4 tests DONE (93136a64: gate green, 1103 unit, browser re-runs clean, parts-alive
  proven on Orlok); fleet log review and ear-check recorded; PumpkinHead's crash-looping MCP user units disabled at
  operator direction; 50 commits pushed to origin (gate green on push). MISSION COMPLETE except the operator items
  in KNOWN-BUGS (Renfield key/baseline, Goblins 1/4, Goblin 3 orientation, Goblin 2 heat, Orlok pitch audition,
  daylight human-interruption test on peers, Mina lullabies by ear). Tagging v10.7.0.
- 2026-10-10 20:40 — MINA HARDWARE SESSION (unfinished; handed to the next session). Her servos DO work: raw
  register sweeps and the app both move the neck and eyes once the parts carry the channels the plugs are really
  on. The operator rewired several times; the last confirmed set is neck ch15, eye ch14, jaw ch10, laser ch11,
  coffin door MDD10A DIR 17 / PWM 18 (parts.json on her node and in the repo, d5f71d51). Jaw: the servo responds
  (operator felt it, "moved once"), the earlier clench was software (idle pose "Jaw Crack" + jaw park at 28°,
  past the mechanical closed point); jaw animation is DISABLED on her node and the channel released until the
  jaw's open/closed angles are calibrated. Laser: never seen lit on any channel (a PCA output pin cannot power a
  laser; needs a transistor or the rose-lamp relay path). Coffin door: never moved; the Pi's DIR/PWM pins toggle
  (proven by pinctrl sampling and static drive), so the MDD10A's motor supply/ground/M1-vs-M2 is the suspect.
  Chip proven: 0x40 awake, 50 Hz, totem-pole, registers follow every command. Helper on her node:
  `/home/remote/mina-sweep.py <channels>` (raw sweep, hold the lurk machine first). Her full-rig show (d5f71d51's
  predecessor 5242ac53) is pushed but its poses assume jaw 28–38°, neck 122–160°, eye 68–112°: re-check after
  calibration.
- 2026-10-11 00:00 — MINA OVERNIGHT (autonomous, operator asleep; on her node). Witness for every claim below is
  her ReSpeaker plus a spectral servo-whine detector (a servo MOVE is a >=30-50 dB tone at 5-7 kHz lasting
  ~0.1 s per 15°; a silent command means no travel; RMS alone sees nothing and the XVF3800 suppresses steady
  noise, so a silent stall is inaudible). Chip readback checked after every command.
  JAW (part 1, ch10): the servo does NOT position-follow. It whines only when a pulse train first appears
  after a release, and ignores every width change while energized — through the API and through raw register
  writes that bypass all software — while the eye (ch14) and neck (ch15) on the same chip whine on every move.
  That is the operator's "moved once" and the clench at any park: dead feedback pot or a continuous-rotation
  unit. Registered in `config/physical-faults.json` (poses drop it, the daemon refuses ch10), jaw animation
  disabled on the node, channel released. Hands-on proof and the swap are in `docs/hardware/OPERATOR-TODO.md`.
  NECK (part 2, ch15): travels only ~110-138 (whines 110<->125<->140; silent at 95 and at 145-170; hunts at
  140). The full-rig show parked her at 140 and gazed to 160, i.e. pressed into the upper stop. Profile 2:2
  written 110-136, center 123. EYE (part 3, ch14): ~68-112 (short whines into stops near 66 and 114); profile
  2:3 written 70-110, center 89. Both profiles live in her node-local `data/calibration_profiles.json`.
  SHOW: poses re-aimed linearly (neck 122-160 -> 112-136, park 140 -> 123; eye 68-112 -> 70-110), validator 0
  errors; scenes 3 and 8 played for real at 15 % volume (speech, poses, door and laser steps all reported
  success; jaw dropped). COFFIN DOOR: DIR 17 / PWM 18 sampled hi/lo correctly on 2 s jogs at 100 %, motor
  silent both ways — hardware (MDD10A VIN / common ground / M1-vs-M2). LASER: hardware (relay or MOSFET).
  CALIBRATION CRUD (operator's second ask): API-level audit of every part type, 15 findings
  (`report-calibration-crud-api.md`): the server persists every page write to the right character; "save does
  not take" is key mismatches and what the list hands the Edit tab (F1-F4 high). UI-level audit with a durable
  Playwright spec follows; fixes applied in one pass afterwards.
- 2026-10-11 00:15 — MINA OVERNIGHT, PART 2 (calibration CRUD, the operator's second ask) DONE. Two audits ran side by
  side on her node: API-level (every part type, 249 calls per character on the node-local copies of characters 3 and
  5, 15 findings, zero wrong-character writes) and UI-level (Playwright against the live page with throwaway parts
  on Mina, 18 findings, 16 of 18 tests failing before the fixes). The server persisted every write to the right
  character; the operator's "save does not take" was: actuator/motor limits saved under `config.*` while the jog
  route read top-level (UI showed 12000, hardware ran 15000); the pre-filled Advanced JSON textarea re-applied over
  the form on every Save for motors, actuators and steppers (pins, board and limits reverted); the Edit tab's
  Delete threw a ReferenceError; the list row dropped controlBoard / BTS pins / limits so a BTS part re-opened as
  MDD10A; `head_tracking` offered as a part type (the schema gate then blocked every commit); Revert to Model
  stripped a servo's channel and address; Invert blessed a placeholder; `config.modelId` vs top-level; create
  skipped validation and answered 500 on a locked character; global `PUT /api/parts/:id`, webcam controls and
  every `/api/calibration` profile route resolved the SELECTED character regardless of `?characterId`. All fixed
  in two passes (a0388040, 16a38fe7, and the follow-up), verified live after restarts: 22/22 API checks, and the
  durable spec `tests/browser/calibration-part-crud.spec.js` at 17 pass / 1 skip with parts.json byte-restored.
  Left open (low, in KNOWN-BUGS): modal GPIO "required" unvalidated; Calibrated-off stamp churns a backup; speaker
  volume/bass/treble unread; head-animation `/params` does not persist. Also tonight: the servo daemon's
  physical-fault veto was frozen by `mb_safety`'s process-lifetime JSON cache (fixed, verified: REFUSED ch10);
  the broken-part drop warning is throttled to one line per ten minutes per part; head tracking's configured
  window set to centre 123 / range 26 (node-local super-powers); the node boots into lurking by design (idle
  poses + head tracking, agent and PIR wake off at night). Log review done from Mina (all peers offline at
  23:35, unverified). Reports: `report-calibration-crud-{api,ui,fixes}.md`. Hands-on list for the morning:
  `docs/hardware/OPERATOR-TODO.md` (jaw servo swap and proof, MDD10A checks, laser relay, head-tracking sign).
