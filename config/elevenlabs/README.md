# ElevenLabs Agent Snapshots & Restore

Durable copies of the five character agents' cloud configuration, taken 2026-08-16
after the Halloween persona/tuning rounds. The live configs exist only in the
ElevenLabs workspace — if any session overwrites an agent, restore from here.

## Contents

- `agents/` — full current config per agent (post-tuning: v3 expressive TTS, Night
  Protocol + Beckoning prompts, gpt-oss-120b LLM, ASR keywords, kid-mode, etc.)
- `agents-pre-tuning/` — configs as they were BEFORE the 2026-08-15 tuning rounds
  (original models/prompts), for full rollback.
- `kb-sources/` — source text of the knowledge-base documents authored in these
  rounds (already uploaded; IDs below).

## Restore an agent

```bash
python3 - <<'EOF'
import json, subprocess
snap = json.load(open('config/elevenlabs/agents/orlok.json'))   # pick agent
body = {"conversation_config": snap["agent"]["conversation_config"]}
open('/tmp/restore.json','w').write(json.dumps(body))
subprocess.run(["curl","-sk","-X","PATCH",
  f"https://localhost:3000/api/elevenlabs/agents/{snap['agent']['agent_id']}",
  "-H","Content-Type: application/json","--data","@/tmp/restore.json"])
EOF
```

## KB documents created (live IDs in the workspace)

| File | Live doc | ID |
|---|---|---|
| kb_dragomir_known_guests.txt | KB_Dragomir_Known_Guests.txt | 5eTUD3vgEggPspoRmvAL |
| kb_dragomir_identity_lore.txt | KB_Dragomir_Identity_Lore.txt | 0h1bpSyo1g7t850nc4pm |
| kb_dragomir_voice_patterns.txt | KB_Dragomir_Voice_Patterns.txt | cJspp6Iu1vd7elqxu6io |
| kb_mina_dreams_omens.txt | KB_Mina_Dreams_Omens.txt | u8lCfAItJH41PbF0kSJn |
| kb_pumpkinhead_known_guests_v2.txt | KB_Pumpkinhead_Known_Guests.txt | a5wEWGdg6tG0EM86k21k |

If a KB doc is lost, recreate via `POST /v1/convai/knowledge-base/text` with the
source file's content, then re-attach in the agent's `prompt.knowledge_base` array.

Judge-panel results and the tuning changelog live in
`scripts/halloween-judges/results/` (committed alongside these snapshots).
Full change narrative: memory file `elevenlabs-agent-fleet-tuning` and
`docs/development/GESTURE-ENGINE-SPEC.md` §10 for the coordination contract.
