# Handoff — Deep "Ghost Settings" Verification (not yet done)

Paste the block below as the opening prompt of a fresh session.

---

MonsterBox — deep settings verification. Opus 5 + ultracode authorized. You are on the
Mina node (192.168.8.140). Read CLAUDE.md and memory first.

MISSION: find every setting that LIES. Three defect kinds, in priority order:
 1. SILENT NO-OP — stored, editable, correct in the data, but the consumer reads a
    different path/shape/name (or a cached copy, or re-defaults after reading).
 2. GHOST — code reads a config field no UI can set.
 3. DEAD CONTROL — UI saves a field nothing reads.

THE ARCHETYPE (found and fixed 2026-08-19, commit af2c1037):
services/hardwareService/index.js read `part.config.modelId`, but every parts.json stores
modelId at the TOP level beside config. 36 of 59 fleet parts resolved to {}, so per-model
servo pulse widths never reached the hardware. Correct data, correct UI, wrong read path,
silent for months. CLAUDE.md documents a second instance: jaw audioLeadTimeMs must land on
the ACTIVE config (`configs.find(c => c.id === jaw.activeConfigId) || configs[0]`).

DOMAINS: jaw animation (operator wants a close look), TTS, STT, audio playback/players/
volume/mute/device routing, agent conversation config, and the settings UI surface itself.
Also sweep mechanically for the two bug SIGNATURES: `.config.X` reads where data stores X at
top level, and `configs[0]` / `[0]` array-index reads where an id lookup is meant.

METHOD per setting — build the full chain with file:line at each step:
DEFAULT → SCHEMA → STORAGE (exact JSON path) → WRITER (which path it writes) → UI control
(or NONE) → READER (exact property expression) → CONSUMER. Then compare WRITER vs READER
character by character. Nesting, camelCase vs snake_case, string-vs-number id compares.

*** ORCHESTRATION — THIS IS WHY THE FIRST ATTEMPT FAILED ***
A six-agent version of this ran 2026-08-19 and journaled ZERO results in 15 minutes; two
agents went silent for 12 minutes while burning 200-300KB of transcript each. The journal
only records a result when an agent RETURNS, so a hung agent loses everything.
- Give each agent ONE narrow question and a SMALL schema. Never "trace this whole domain."
- Split each domain into 3-4 single-question agents (e.g. "list every field the TTS service
  sends to ElevenLabs and where each comes from" is one agent; "which of those has a UI
  control" is another).
- Poll the workflow journal every ~3 minutes. If an agent's .jsonl has not grown in 4
  minutes, kill the run and re-shape it. Do not wait 15 minutes.
- Prefer doing mechanical greps INLINE yourself — your own tool results are checkpointed
  permanently; a subagent's are not until it returns.

HARD RULES: read-only investigation, report findings, the lead applies fixes. NO audio
(household asleep unless the operator says otherwise; all nodes are muted with AI disabled —
do not unmute, do not enable AI). No hardware motion, no service restarts, no commits by
agents. Never commit .mcp.json, config/app-config.json, data/audio-library/library.json,
data/character-2/poses.json.

DELIVERABLE: a coverage table per domain (total settings / UI-exposed / ghost / dead /
silent-no-op), findings ranked by operator impact with file:line and the one-line fix, and
an explicit "these chains are TRUSTWORTHY" list. Adversarially verify every finding before
reporting it — default to REFUTED when uncertain.
