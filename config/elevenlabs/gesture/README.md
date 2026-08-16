# Gesture client tool — staged, NOT live

The ElevenLabs half of `docs/development/GESTURE-ENGINE-SPEC.md` §5/§9.4, authored and
tested on 2026-08-16, then **deliberately withdrawn from the live agents before
Halloween**. Everything needed to apply it is here.

## Status

| Piece | State |
|---|---|
| `gesture` client tool (workspace) | **created and live** — `tool_6601m04v5wr6ft9sa1p88wmkxg67`, attached to no agent |
| `tool_ids` on the five agents | **empty** (withdrawn) |
| `# Body` prompt sections | **withdrawn** from the live prompts; text preserved in `body-sections/` |
| `services/gestureEngineService.js` handler | **shipped** (v9.1.0) — the MonsterBox side is ready and waiting |
| `data/character-*/gestures.json` recipes | character-3 only |

The handler being ready is why the withdrawal below rests on live-path measurement rather
than on "there is nothing to call yet".

Renfield has no entry: he has no node and no parts yet, so §7 gives him no vocabulary
and he gets neither the tool nor a `# Body` section.

## Why it was withdrawn — measured, not assumed

The spec expected these tool calls to be "harmless no-ops until the handler ships".
They are not harmless, for a reason the spec did not anticipate: **the character prompts
are dense with `[audio tags]`, so a model handed a list of gesture ids emits them as if
they were more audio tags** — `[nod_commend]`, `[hand_glow]` — inside the text that goes
to TTS. A guest can hear the character say "hand glow".

Judge-panel smoke runs first, 25 conversations across the five body-having agents:

| Config | Conversations leaking a spoken gesture | Leaked mentions |
|---|---|---|
| `# Body` as written in spec §5.2 | 13 / 25 | 38 |
| plus a hard "a gesture id is NOT an audio tag" rule | 3 / 25 | 6 |

Renfield, the control with no `# Body`, leaked 0/5 in both runs.

The hardened wording cuts leakage ~85% but not to zero.

### Then measured on the live path, which settles it

The obvious objection to the numbers above is that `simulate-conversation` has no client
to execute a client tool, so a model told to call `gesture` *cannot*, and writing it into
speech is the only move left. That would inflate the leak rate by construction.

So `scripts/halloween-judges/gesture-live-probe.mjs` was built to ask the question
properly: real Agents WebSocket conversations, the tool declared in
`conversation_initiation_client_data`, counting `client_tool_call` events against gesture
ids appearing in `agent_response`. The tool-call channel is fully available.

The objection does not save the feature. Six agents, one probe each (6 replies apiece),
then four further probes on Orlok — the only character with a shipped `gestures.json`,
and therefore the only one with anything to gain today:

| Agent | replies | correct tool calls | replies leaking a spoken gesture |
|---|---|---|---|
| **Orlok** (5 probes) | **30** | **0** | **9 (30%)** |
| Mina | 6 | 1 (`lid_crack`) | 0 |
| Dragomir | 6 | 0 | 0 |
| PumpkinHead | 6 | 0 | 0 |
| Groundbreaker | 6 | 0 | 0 |
| Renfield (control, no `# Body`) | 6 | 0 | 0 |

Orlok leaked `[hand_glow]` in 2 of 6 replies on **four consecutive runs**, and called the
tool **zero** times in thirty replies. He does not use the feature; he converts its entire
vocabulary into audio tags and speaks them.

This is not a simulation artifact and not a deadline call — it is the measured behaviour
of the path that ships, on the one character who would benefit.

### Why Orlok specifically

His prompt is the most bracket-primed in the fleet: a standing rule to *begin every
sentence* with `[Romanian accent]`, plus a ten-entry `AUDIO TAGS` list. A `# Body` section
handing him more bracketed identifiers reads, to the model, as more audio tags. The
quieter characters leak far less — which is consistent with priming, not with the ids
themselves being the problem.

### The fix worth trying next (not attempted here — needs test time this session lacked)

Take the ids out of the prompt entirely, so there is no id text to echo:

- one client tool **per character**, with `gesture_id` typed as an **enum** of that
  character's ids, so the ids exist only in the tool schema;
- a `# Body` section that describes *intents* in prose and names no ids at all.

A model cannot speak an identifier it was never shown. This departs from spec §5.2, which
puts the ids in the prompt — the spec should be amended if the approach measures clean.
Re-run `gesture-live-probe.mjs` and require zero leaks over at least 30 Orlok replies
before shipping.

`scripts/halloween-judges/gestures.mjs` now measures this on every run, and
`analyze.mjs` prints a "Spoken-gesture leakage" section. **Ship gate: that section must
read "None."**

## Applying it (after the handler ships)

1. Ship `services/gestureEngineService.js` and the client-tool dispatch hook.
2. Re-attach the tool and the prompt sections. Fetch fresh, edit surgically, re-apply on
   conflict — spec §10:

```bash
python3 - <<'EOF'
import json, urllib.request
KEY = open('/etc/monsterbox/elevenlabs.key').read().strip()
TOOL = json.load(open('config/elevenlabs/gesture/tool.json'))['tool_id']
AGENTS = {a['key']: a['agentId'] for a in
          json.load(open('scripts/halloween-judges/agents.json'))['agents']}

def call(url, method='GET', body=None):
    r = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r))

for key in ['orlok', 'mina', 'dragomir', 'pumpkinhead', 'groundbreaker']:
    url = f'https://api.elevenlabs.io/v1/convai/agents/{AGENTS[key]}'
    prompt = call(url)['conversation_config']['agent']['prompt']['prompt']
    body = open(f'config/elevenlabs/gesture/body-sections/{key}.md').read()
    if '# Body' in prompt:                      # replace, never duplicate
        prompt = prompt.split('\n\n# Body')[0]
    call(url, 'PATCH', {'conversation_config': {'agent': {'prompt': {
        'prompt': prompt.rstrip() + '\n\n' + body,
        'tool_ids': [TOOL]}}}})
    print('applied', key)
EOF
```

3. Re-run the judge panel and confirm the leakage section reads "None." before the
   config is left on the fleet unattended.
4. Refresh `config/elevenlabs/agents/*.json` so the snapshots stay canonical.

## Rolling it back

Strip the `# Body` section (`prompt.split('\n\n# Body')[0]`, preserving the original
trailing newline) and set `tool_ids: []`. Do not delete the workspace tool — the id above
is referenced by this directory.
