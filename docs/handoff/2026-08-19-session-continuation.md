MonsterBox — continuation session. Opus 5 + ultracode authorized. You are ON the Mina node
(192.168.8.140, char 2). Read CLAUDE.md and memory FIRST, then `git log --oneline -10`.
Mission: finish everything below, then ship v10.1.

════════ STATE YOU ARE INHERITING ════════
HEAD = af2c1037, pushed to GitHub. Fleet: Mina 192.168.8.140 (char 2, local),
Orlok 192.168.8.120 (char 3), Sir Dragomir 192.168.8.130 (char 4) — all serving 10.0.1 HTTPS.
PumpkinHead (1) and Groundbreaker (5) are deliberately UNPLUGGED; Renfield (6) has no address.

*** AUDIO IS OFF ON PURPOSE. The household was woken at 00:20 by two animatronics holding an
unattended conversation and the operator was told to shut it down. All three nodes are muted
with AI disabled. DO NOT unmute, DO NOT enable AI, DO NOT play/say/TTS anything, and DO NOT
enable head-tracking noise, WITHOUT EXPLICIT PERMISSION IN THIS SESSION. Verify before you
start: curl -sk https://localhost:3000/conversation/api/speaker-mute → muted:true. ***

WHAT LANDED THIS SESSION (do not redo):
- Séance: 8 driven acoustic turns Mina↔Orlok, 71% mean word recall, plus 24 unprompted
  agent-to-agent turns. Transcript: docs/evidence/2026-08-19-seance-transcript.json.
- BIG FIX (af2c1037): services/hardwareService/index.js read `part.config.modelId` but every
  parts.json stores modelId at the TOP level. 36 of 59 fleet parts got {} model defaults —
  per-model servo pulse widths never reached hardware. Now reads both shapes. Gate green.
- Sir Dragomir's servo channels reconciled from his node (jaw ch0 / head ch1 — operator's own
  correction; the repo had them transposed and would have driven the wrong servo).
- KNOWN-BUGS updated with 7 new findings (muted-speaker false-deaf trap; AI-disabled canned
  opener; 10-13s vs 2.4-3.6s agent path gap; stream_raw channels-not-duration foot-gun;
  fleet modelId coverage; per-character model registry ignored).

════════ YOUR WORK, IN ORDER ════════

1. ELEVENLABS CLOSE-OUT (highest value — the operator cares most about this)
   The operator heard Orlok in conversation mode: "smoother, far faster, but basically the
   same voice. Not gravelly, not low, definitely not the Nosferatu film voice we tuned."
   ESTABLISHED: Orlok's LIVE agent is correctly tuned (voice Tj9l48J9AJbry5yCP5eW,
   stability 0.25, speed 0.75, similarity_boost 0.6, expressive_mode true, full audio-tag set
   registered incl. [Romanian accent]/[labored breath]/[deep voice]). The suspects are:
     (a) optimize_streaming_latency = 3 — max latency optimization AND it disables the text
         normalizer, the layer that renders audio tags/prosody. PRIME SUSPECT. Change to 0.
     (b) tts.model_id = eleven_v3_conversational on the agent vs eleven_v3 in
         data/character-3/ai-config/tts-config.json. Verify what the conversational model
         supports (style/speed/tags) against CURRENT ElevenLabs docs — do not assume.
     (c) agent_output_audio_format pcm_16000 — verify it is not capping the chest rumble.
   *** A CHANGE I ATTEMPTED WAS BLOCKED: mcp__claude_ai_ElevenLabs__agents_update was denied
   by the Claude Code auto-mode classifier. Nothing was changed. ASK THE OPERATOR to approve
   the MCP write permission, or have him set it by hand in the ElevenLabs agent editor. ***
   ElevenLabs MCP is authorized and READS work fine (agents_get verified).
   Agent IDs: PumpkinHead agent_0801k3f1dybkecj88sta18gwwrv5 · Mina agent_8401k3f1dx98e05t94yp6kz4vf8n
   Orlok agent_0801k3f1dw7xe2g8r4jkbxk0gt2n · Sir Dragomir agent_7901k3f1dza1ee68w1257zh3s9x6
   Groundbreaker agent_4201k6s9y384f9v9hqmg67ygc645 · Renfield agent_1501m04ks76jf5svnxb70zyvz6s1
   ALSO: Sir Dragomir is SQUEAKY, operator wants him LOWER (voice wXvR48IpOq9HACltTmt7,
   0.5/0.8, speed 0.9). Decide honestly whether it is a SETTING or a VOICE-SWAP problem — no
   stability value turns a bright voice low. Apply keep-bias; only swap if clearly better.
   Check Mina for drift too (now 0.3/0.8, memory says canonical 0.35/0.8).
   Orlok's acoustic target: median F0 65.6 Hz, sub-150Hz fraction 0.685, 1.93 syl/s, pause 0.47.
   OPERATOR DECISION ALREADY GIVEN: "If there are no functional TTS controls, remove those
   dead settings from the software. Same for STT. It's OK to surface ElevenLabs settings as
   long as they're simple and easy to use, and there must be a link out to ElevenLabs for the
   user to make direct changes to the agent." (Deep link: https://elevenlabs.io/app/agents/<agent_id>)
   NOTE the likely root insight to confirm: local tts-config.json may be entirely BYPASSED on
   the agent conversational path — if so, every value tuned there is inert for conversation
   and the UI must say so.

2. DEEP "GHOST SETTINGS" VERIFICATION — full brief already written:
   docs/handoff/2026-08-19-ghost-settings-verification.md. Read and execute it. Hunts silent
   no-ops / ghosts / dead controls across jaw, TTS, STT, audio playback, agent config, and the
   settings UI. Includes the mechanical signature sweeps.

3. CALIBRATION "CALIBRATED" STAMP (not started). The operator: "calibrate never allows me to
   stamp it Calibrated on and off. Give me a control and make that update the data." Add a
   real toggle in the calibration UI that persists to the calibration profile. Store is
   server/calibration/store.js (router.js, models.js, adapters/). Respect CLAUDE.md: read
   bounds via calibratedBounds(profile)/store.get(), writers use store.getRaw(), and
   isDegenerateWindow() is enforced at every bounds writer.

4. HARDWARE TEST — NO AUDIO. Prove parts physically move on all three live nodes: servos,
   jaw, head, magic box, lights, actuators. Use the hardware-diagnostician subagent. Ramp from
   the smallest safe motion. Pass characterId on every controlPart/calibration call (part ids
   are only unique within a character). Dragomir's jaw ENABLE stays OFF; you may still move
   the jaw servo for a hardware test. This is where the modelId fix gets its real proof —
   per-model pulse widths now actually reach the controller for 36 parts, so watch for any
   part that behaves differently than before and report it immediately.

5. TEST EVERY BUTTON, PAGE AND TAB, then FIX WHAT BREAKS. Playwright MCP is configured
   (.mcp.json, browser_* tools) — see the /test-browser skill. Cover: dashboard, /scenes
   Animation Studio, /poses/editor, all /setup/* pages (parts, calibration, jaw-animation,
   head-animation, AI/voice settings), conversation, orchestration/Fleet Command Center,
   webcam, goblin. Test with AT LEAST TWO characters (character-independence is a hard rule).
   Known pre-existing flaky (not your bugs): VU meter, jaw animation save config, calibration
   timeout. Also known open: the OpenCV enable checkbox on /setup/head-animation will not stay
   checked (#ocvEnabled) — triage it.

6. LOG REVIEW after testing. Run the /log-review skill. REMEMBER: console.log →
   /var/log/monsterbox.log, console.warn/error → ONLY /var/log/monsterbox.err. GREP BOTH.
   The logs are binary-ish — use `grep -a`. Fix what final testing surfaced, and reconcile
   docs/troubleshooting/KNOWN-BUGS.md so it stays true.

7. DOCUMENTATION + SETTINGS. Update README.md, CHANGELOG.md, docs/, install.sh if deps
   changed, and KNOWN-BUGS. Update CLAUDE.md itself with what was learned. Update the shared
   memory files at ~/.claude/projects/-home-remote-MonsterBox/memory/ (keep MEMORY.md under
   200 lines). The operator explicitly said to update Claude settings too — use the
   /update-config skill for .claude/settings.json (consider adding the ElevenLabs MCP write
   permission if he approves it, and any Bash allowlist entries that would cut prompts).

8. SHIP v10.1. Bump package.json (version lives THERE and nowhere else — never hardcode).
   `npm run gate` must pass. Deploy with `npm run deploy:all`. Tag and push:
   GIT_SSH_COMMAND='ssh -o BatchMode=yes' git push git@github.com:arwpc/MonsterBox.git main

════════ ORCHESTRATION — READ THIS, IT COST THE LAST SESSION HOURS ════════
Subagents kept HANGING tonight. Two workflows (6 agents and 4 agents) journaled ZERO results;
agents went silent for 12+ minutes after writing 200-300KB of transcript. The journal only
records a result when an agent RETURNS, so a hang loses everything and a retry starts at zero.
- ONE narrow question per agent, SMALL schema. Never "trace this whole domain."
- Poll the workflow journal every ~3 min: check byte growth of
  <transcriptDir>/agent-*.jsonl. If no growth for 4 MINUTES, kill and re-shape. Do not wait 15.
- Do mechanical greps/edits INLINE — your own tool results are checkpointed permanently.
- The operator is nearby and wants FAST, frequent responses; long silences read as a freeze.

GOTCHAS THAT BIT ME TONIGHT — do not repeat:
- `pkill -f <pattern>` MATCHES YOUR OWN SHELL and kills your command (exit 144). Twice. List
  PIDs with ps and kill by PID.
- python_wrappers/microphone_cli.py `stream_raw <device> <rate> <channels>` — the 3rd arg is
  CHANNELS, not duration. There is no duration arg; bound it with `timeout` and pass 1.
- SSH lands in /home/remote, NOT the repo. Absolute paths always.
- `bc` is not installed. `pactl` is not installed (use wpctl/pw-dump, XDG_RUNTIME_DIR=/run/user/1000).
- An API `{"success":true}` proves a write landed, NOT that sound played. Prove audio by ear.

NEVER COMMIT: .mcp.json, config/app-config.json, data/audio-library/library.json,
data/character-2/poses.json. Also currently dirty and node-local: data/character-2/super-powers.json,
data/character-2/ai_agent_state.json (untracked). Agents never commit — the lead reviews and commits.
SSH: sudo sh -c '. /etc/monsterbox/env; export SSHPASS="$MONSTERBOX_SSH_PASSWORD"; sshpass -e ssh remote@<ip> "<cmd>"'
